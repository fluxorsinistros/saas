-- 0035: o administrador da plataforma gerencia TODOS os usuários de cada empresa cliente (não só os
-- administradores): adicionar com o papel escolhido (ou convidar, se ainda não tem conta), listar
-- ativos/inativos/convites, e inativar/reativar. Inativar corta o acesso na hora (a RLS exige
-- associação ativa); nada é apagado, o histórico do usuário permanece.
-- Substitui admin_list_tenant_admins (0033), que só listava quem era Administrador.

create or replace function public.admin_add_tenant_user(p_tenant_id uuid, p_email text, p_role_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_membership uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o administrador da plataforma pode adicionar usuários por aqui';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido';
  end if;
  if not exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'Empresa não encontrada';
  end if;
  if not exists (select 1 from roles where id = p_role_id and (tenant_id is null or tenant_id = p_tenant_id)) then
    raise exception 'Papel inválido para esta empresa';
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
    insert into membership_roles (membership_id, role_id) values (v_membership, p_role_id);

    perform app.write_audit_platform(p_tenant_id, 'member.added_by_platform', 'tenant_membership', v_membership,
      jsonb_build_object('email', v_email, 'role_id', p_role_id));
    return 'added';
  end if;

  insert into tenant_invites (tenant_id, email, role_id, invited_by)
  values (p_tenant_id, v_email, p_role_id, auth.uid())
  on conflict do nothing;
  perform app.write_audit_platform(p_tenant_id, 'member.invited_by_platform', 'tenant', p_tenant_id,
    jsonb_build_object('email', v_email, 'role_id', p_role_id));
  return 'invited';
end;
$$;
revoke all on function public.admin_add_tenant_user(uuid, text, uuid) from public, anon;
grant execute on function public.admin_add_tenant_user(uuid, text, uuid) to authenticated;

-- A concessão de administrador (usada ao criar empresa) passa a ser um caso do genérico.
create or replace function public.admin_grant_tenant_admin(p_tenant_id uuid, p_email text)
returns text
language sql
security definer
set search_path = public
as $$
  select public.admin_add_tenant_user(p_tenant_id, p_email, '00000000-0000-0000-0000-000000000001'::uuid);
$$;

drop function if exists public.admin_list_tenant_admins(uuid[]);

create or replace function public.admin_list_tenant_users(p_tenant_ids uuid[])
returns table (
  tenant_id uuid, membership_id uuid, invite_id uuid, email text, full_name text,
  role_name text, pending boolean, status text
)
language sql
security definer
set search_path = public
stable
as $$
  select tm.tenant_id, tm.id, null::uuid, up.email, up.full_name,
         (select r.name from membership_roles mr join roles r on r.id = mr.role_id where mr.membership_id = tm.id limit 1),
         false, tm.status
  from tenant_memberships tm
  join user_profiles up on up.id = tm.user_id
  where app.is_platform_admin() and tm.tenant_id = any (p_tenant_ids)
  union all
  select i.tenant_id, null::uuid, i.id, i.email, null::text,
         (select r.name from roles r where r.id = i.role_id),
         true, 'pending'
  from tenant_invites i
  where app.is_platform_admin() and i.tenant_id = any (p_tenant_ids) and i.accepted_at is null;
$$;
revoke all on function public.admin_list_tenant_users(uuid[]) from public, anon;
grant execute on function public.admin_list_tenant_users(uuid[]) to authenticated;

-- Inativa (false) ou reativa (true) um usuário da empresa.
create or replace function public.admin_set_member_active(p_membership_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o administrador da plataforma pode alterar este acesso';
  end if;

  update tenant_memberships
  set status = case when p_active then 'active' else 'inactive' end,
      left_at = case when p_active then null else now() end
  where id = p_membership_id
  returning tenant_id into v_tenant;
  if v_tenant is null then
    raise exception 'Usuário não encontrado';
  end if;

  perform app.write_audit_platform(v_tenant,
    case when p_active then 'member.reactivated_by_platform' else 'member.deactivated_by_platform' end,
    'tenant_membership', p_membership_id);
end;
$$;
revoke all on function public.admin_set_member_active(uuid, boolean) from public, anon;
grant execute on function public.admin_set_member_active(uuid, boolean) to authenticated;
