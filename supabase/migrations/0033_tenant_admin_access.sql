-- 0033: o administrador da plataforma cria o acesso de quem vai administrar cada empresa cliente.
-- O admin geral não pertence a empresa nenhuma (só usa /admin), então:
--  * admin_create_tenant cria a empresa SEM incluir quem chamou como membro (create_tenant fazia isso),
--    e já pode conceder o acesso de administrador a um e-mail;
--  * admin_grant_tenant_admin dá o papel Administrador a quem já tem conta; se ainda não tem, guarda um
--    convite (tenant_invites) — a pessoa cria a conta com aquele e-mail, confirma, e no primeiro acesso
--    (claim_pending_invites) entra direto na empresa como Administrador, sem passar pelo onboarding.
--    Não enviamos e-mail de convite: isso exigiria a chave de serviço do Supabase (fora de escopo).
--  * admin_list_tenant_admins / admin_revoke_tenant_access alimentam a tela de Administração.

create table tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role_id uuid not null references roles(id),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);
create unique index uq_tenant_invites_pending on tenant_invites (tenant_id, lower(email)) where accepted_at is null;
create index idx_tenant_invites_email on tenant_invites (lower(email)) where accepted_at is null;

alter table tenant_invites enable row level security;
create policy platform_admin_all on tenant_invites
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Concede (ou convida para) o papel Administrador de uma empresa.
create or replace function public.admin_grant_tenant_admin(p_tenant_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_membership uuid;
  c_admin_role constant uuid := '00000000-0000-0000-0000-000000000001';
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o administrador da plataforma pode conceder este acesso';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido';
  end if;
  if not exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'Empresa não encontrada';
  end if;

  select id into v_user from auth.users where lower(email) = v_email;

  if v_user is not null then
    if exists (select 1 from platform_admins where user_id = v_user) then
      raise exception 'Esse e-mail é de administrador da plataforma, que não pertence a nenhuma empresa. Use outro e-mail.';
    end if;

    insert into user_profiles (id, full_name, email)
    select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
    from auth.users u where u.id = v_user
    on conflict (id) do nothing;

    insert into tenant_memberships (tenant_id, user_id, status, joined_at)
    values (p_tenant_id, v_user, 'active', now())
    on conflict (tenant_id, user_id) do update set status = 'active', left_at = null
    returning id into v_membership;

    delete from membership_roles where membership_id = v_membership;
    insert into membership_roles (membership_id, role_id) values (v_membership, c_admin_role);

    perform app.write_audit(p_tenant_id, 'member.admin_granted', 'tenant_membership', v_membership, null, jsonb_build_object('email', v_email));
    return 'added';
  end if;

  insert into tenant_invites (tenant_id, email, role_id, invited_by)
  values (p_tenant_id, v_email, c_admin_role, auth.uid())
  on conflict do nothing;
  perform app.write_audit(p_tenant_id, 'member.admin_invited', 'tenant', p_tenant_id, null, jsonb_build_object('email', v_email));
  return 'invited';
end;
$$;
revoke all on function public.admin_grant_tenant_admin(uuid, text) from public, anon;
grant execute on function public.admin_grant_tenant_admin(uuid, text) to authenticated;

-- Cria a empresa sem incluir o administrador da plataforma como membro; opcionalmente já dá acesso a um administrador.
create or replace function public.admin_create_tenant(p_name text, p_admin_email text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_slug text;
  v_group text;
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o administrador da plataforma pode criar empresas';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome da empresa é obrigatório';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  insert into tenants (name, slug) values (trim(p_name), v_slug) returning id into v_tenant;

  foreach v_group in array array['Regulação','Operacional','Jurídico','Financeiro','Gestão de Risco','Seguros','Comitê'] loop
    insert into groups (tenant_id, name) values (v_tenant, v_group);
  end loop;

  perform app.write_audit(v_tenant, 'tenant.created', 'tenant', v_tenant, null, jsonb_build_object('name', p_name));

  if coalesce(trim(p_admin_email), '') <> '' then
    perform public.admin_grant_tenant_admin(v_tenant, p_admin_email);
  end if;
  return v_tenant;
end;
$$;
revoke all on function public.admin_create_tenant(text, text) from public, anon;
grant execute on function public.admin_create_tenant(text, text) to authenticated;

-- Quem se cadastra com o e-mail de um convite pendente entra na empresa como Administrador.
create or replace function public.claim_pending_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  r record;
  v_membership uuid;
  v_count integer := 0;
begin
  if v_user is null then return 0; end if;
  -- só e-mail já confirmado vale (senão qualquer um "reivindicaria" o convite de outra pessoa)
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  if exists (select 1 from platform_admins where user_id = v_user) then return 0; end if;

  for r in select * from tenant_invites where lower(email) = v_email and accepted_at is null loop
    insert into user_profiles (id, full_name, email)
    select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
    from auth.users u where u.id = v_user
    on conflict (id) do nothing;

    insert into tenant_memberships (tenant_id, user_id, status, joined_at)
    values (r.tenant_id, v_user, 'active', now())
    on conflict (tenant_id, user_id) do update set status = 'active', left_at = null
    returning id into v_membership;

    delete from membership_roles where membership_id = v_membership;
    insert into membership_roles (membership_id, role_id) values (v_membership, r.role_id);

    update tenant_invites set accepted_at = now(), accepted_by = v_user where id = r.id;
    perform app.write_audit(r.tenant_id, 'member.invite_accepted', 'tenant_membership', v_membership, null, jsonb_build_object('email', v_email));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.claim_pending_invites() from public, anon;
grant execute on function public.claim_pending_invites() to authenticated;

-- Administradores (e convites pendentes) das empresas informadas — para a tela de Administração.
create or replace function public.admin_list_tenant_admins(p_tenant_ids uuid[])
returns table (tenant_id uuid, membership_id uuid, invite_id uuid, email text, full_name text, pending boolean, status text)
language sql
security definer
set search_path = public
stable
as $$
  select tm.tenant_id, tm.id, null::uuid, up.email, up.full_name, false, tm.status
  from tenant_memberships tm
  join membership_roles mr on mr.membership_id = tm.id and mr.role_id = '00000000-0000-0000-0000-000000000001'
  join user_profiles up on up.id = tm.user_id
  where app.is_platform_admin() and tm.tenant_id = any (p_tenant_ids)
  union all
  select i.tenant_id, null::uuid, i.id, i.email, null::text, true, 'pending'
  from tenant_invites i
  where app.is_platform_admin() and i.tenant_id = any (p_tenant_ids) and i.accepted_at is null;
$$;
revoke all on function public.admin_list_tenant_admins(uuid[]) from public, anon;
grant execute on function public.admin_list_tenant_admins(uuid[]) to authenticated;

-- Tira o acesso (desativa a associação) ou cancela um convite pendente.
create or replace function public.admin_revoke_tenant_access(p_membership_id uuid default null, p_invite_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o administrador da plataforma pode remover este acesso';
  end if;

  if p_invite_id is not null then
    delete from tenant_invites where id = p_invite_id and accepted_at is null returning tenant_id into v_tenant;
    if v_tenant is not null then
      perform app.write_audit(v_tenant, 'member.invite_cancelled', 'tenant', v_tenant, null, null);
    end if;
  end if;

  if p_membership_id is not null then
    update tenant_memberships set status = 'inactive', left_at = now() where id = p_membership_id returning tenant_id into v_tenant;
    if v_tenant is not null then
      perform app.write_audit(v_tenant, 'member.access_revoked', 'tenant_membership', p_membership_id, null, null);
    end if;
  end if;
end;
$$;
revoke all on function public.admin_revoke_tenant_access(uuid, uuid) from public, anon;
grant execute on function public.admin_revoke_tenant_access(uuid, uuid) to authenticated;
