-- 0034: corrige 0033. app.write_audit exige que quem chama seja membro do tenant (ou, com tenant nulo,
-- administrador de plataforma). O administrador da plataforma age sobre um tenant sem ser membro dele,
-- então as funções de admin passam a gravar a auditoria por um helper próprio, que exige ser
-- administrador de plataforma e registra o tenant afetado.

create or replace function app.write_audit_platform(
  p_tenant_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_new jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Sem acesso a evento de plataforma';
  end if;
  insert into audit_logs (tenant_id, actor_id, action, entity_type, entity_id, new_value, origin)
  values (p_tenant_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_new, 'ui');
end;
$$;
revoke all on function app.write_audit_platform(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function app.write_audit_platform(uuid, text, text, uuid, jsonb) to authenticated;

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

    perform app.write_audit_platform(p_tenant_id, 'member.admin_granted', 'tenant_membership', v_membership, jsonb_build_object('email', v_email));
    return 'added';
  end if;

  insert into tenant_invites (tenant_id, email, role_id, invited_by)
  values (p_tenant_id, v_email, c_admin_role, auth.uid())
  on conflict do nothing;
  perform app.write_audit_platform(p_tenant_id, 'member.admin_invited', 'tenant', p_tenant_id, jsonb_build_object('email', v_email));
  return 'invited';
end;
$$;

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

  perform app.write_audit_platform(v_tenant, 'tenant.created', 'tenant', v_tenant, jsonb_build_object('name', p_name));

  if coalesce(trim(p_admin_email), '') <> '' then
    perform public.admin_grant_tenant_admin(v_tenant, p_admin_email);
  end if;
  return v_tenant;
end;
$$;

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
      perform app.write_audit_platform(v_tenant, 'member.invite_cancelled', 'tenant', v_tenant);
    end if;
  end if;

  if p_membership_id is not null then
    update tenant_memberships set status = 'inactive', left_at = now() where id = p_membership_id returning tenant_id into v_tenant;
    if v_tenant is not null then
      perform app.write_audit_platform(v_tenant, 'member.access_revoked', 'tenant_membership', p_membership_id);
    end if;
  end if;
end;
$$;
