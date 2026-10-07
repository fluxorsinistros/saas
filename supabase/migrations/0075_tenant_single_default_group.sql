-- 0075: empresa nova nasce só com o grupo "Operacional" (antes eram 7 grupos padrão). Os demais grupos cada empresa cria.
-- O grupo nasce sem nenhuma ação desligada, isto é, com todas liberadas.

create or replace function public.create_tenant(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_slug text;
  v_membership uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome da empresa é obrigatório';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into tenants (name, slug) values (trim(p_name), v_slug) returning id into v_tenant;

  insert into user_profiles (id, full_name, email)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
  from auth.users u where u.id = v_user
  on conflict (id) do nothing;

  insert into tenant_memberships (tenant_id, user_id, status, joined_at)
  values (v_tenant, v_user, 'active', now())
  returning id into v_membership;
  insert into membership_roles (membership_id, role_id) values (v_membership, '00000000-0000-0000-0000-000000000001');

  insert into groups (tenant_id, name) values (v_tenant, 'Operacional');

  perform app.write_audit(v_tenant, 'tenant.created', 'tenant', v_tenant, null, jsonb_build_object('name', p_name));
  return v_tenant;
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

  insert into groups (tenant_id, name) values (v_tenant, 'Operacional');

  perform app.write_audit_platform(v_tenant, 'tenant.created', 'tenant', v_tenant, jsonb_build_object('name', p_name));

  if coalesce(trim(p_admin_email), '') <> '' then
    perform public.admin_grant_tenant_admin(v_tenant, p_admin_email);
  end if;
  return v_tenant;
end;
$$;
