-- 0045: "Novo usuário" com os mesmos campos da edição (nome, e-mail, CPF, telefone, empresa, tipo, grupo),
-- tanto para o Gestor quanto para o Administrador da conta.
--  * tenant_invites guarda nome/telefone/CPF informados no cadastro;
--  * quem já tem conta não tem o perfil sobrescrito (dados pessoais são da pessoa): só preenchemos o que está vazio;
--  * claim_pending_invites aplica esses dados ao perfil no primeiro acesso.

alter table tenant_invites
  add column full_name text,
  add column phone text,
  add column cpf text;

-- Preenche só o que está vazio no perfil
create or replace function app.fill_profile(p_user uuid, p_full_name text, p_phone text, p_cpf text)
returns void
language sql
security definer
set search_path = public
as $$
  update user_profiles
  set full_name = case when nullif(trim(coalesce(p_full_name, '')), '') is not null
                        and (full_name is null or full_name = split_part(email, '@', 1))
                       then trim(p_full_name) else full_name end,
      phone = coalesce(phone, nullif(trim(coalesce(p_phone, '')), '')),
      cpf = coalesce(cpf, nullif(trim(coalesce(p_cpf, '')), ''))
  where id = p_user;
$$;
revoke all on function app.fill_profile(uuid, text, text, text) from public, anon, authenticated;

-- Administrador da conta
drop function if exists public.tenant_add_user(uuid, text, uuid, uuid);
create or replace function public.tenant_add_user(
  p_tenant_id uuid, p_email text, p_role_id uuid, p_group_id uuid,
  p_full_name text default null, p_phone text default null, p_cpf text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_membership uuid;
  v_role_name text;
  v_group uuid;
begin
  if not app.is_tenant_admin(p_tenant_id) then
    raise exception 'Somente um Administrador da conta adiciona usuários';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido';
  end if;
  select name into v_role_name from roles where id = p_role_id and (tenant_id is null or tenant_id = p_tenant_id);
  if v_role_name is null or v_role_name not in ('Administrador', 'Operador') then
    raise exception 'Tipo inválido';
  end if;
  if v_role_name = 'Operador' and p_group_id is not null then
    select id into v_group from groups where id = p_group_id and tenant_id = p_tenant_id;
  end if;

  select id into v_user from auth.users where lower(email) = v_email;

  if v_user is not null then
    if exists (select 1 from platform_admins where user_id = v_user) then
      raise exception 'Este e-mail não pode ser adicionado a uma empresa.';
    end if;
    if exists (select 1 from tenant_memberships where tenant_id = p_tenant_id and user_id = v_user and status = 'active') then
      raise exception 'Esta pessoa já participa desta empresa.';
    end if;

    insert into user_profiles (id, full_name, email)
    select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
    from auth.users u where u.id = v_user
    on conflict (id) do nothing;
    perform app.fill_profile(v_user, p_full_name, p_phone, p_cpf);

    insert into tenant_memberships (tenant_id, user_id, status, joined_at)
    values (p_tenant_id, v_user, 'active', now())
    on conflict (tenant_id, user_id) do update set status = 'active', left_at = null
    returning id into v_membership;

    delete from membership_roles where membership_id = v_membership;
    insert into membership_roles (membership_id, role_id) values (v_membership, p_role_id);
    delete from group_members where membership_id = v_membership;
    if v_group is not null then
      insert into group_members (membership_id, group_id) values (v_membership, v_group);
    end if;

    perform app.write_audit(p_tenant_id, 'member.added', 'tenant_membership', v_membership,
      null, jsonb_build_object('email', v_email, 'role', v_role_name));
    return 'added';
  end if;

  insert into tenant_invites (tenant_id, email, role_id, group_id, invited_by, full_name, phone, cpf)
  values (p_tenant_id, v_email, p_role_id, v_group, auth.uid(),
          nullif(trim(coalesce(p_full_name, '')), ''), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_cpf, '')), ''))
  on conflict do nothing;
  perform app.write_audit(p_tenant_id, 'member.invited', 'tenant', p_tenant_id,
    null, jsonb_build_object('email', v_email, 'role', v_role_name));
  return 'invited';
end;
$$;
revoke all on function public.tenant_add_user(uuid, text, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.tenant_add_user(uuid, text, uuid, uuid, text, text, text) to authenticated;

-- Gestor da plataforma: mesmo cadastro, em qualquer empresa
create or replace function public.admin_add_person(
  p_tenant_id uuid, p_email text, p_role_id uuid, p_group_id uuid,
  p_full_name text default null, p_phone text default null, p_cpf text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_membership uuid;
  v_role_name text;
  v_group uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o Gestor da plataforma pode adicionar usuários por aqui';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido';
  end if;
  if not exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'Empresa não encontrada';
  end if;
  select name into v_role_name from roles where id = p_role_id and (tenant_id is null or tenant_id = p_tenant_id);
  if v_role_name is null then
    raise exception 'Papel inválido para esta empresa';
  end if;
  if v_role_name = 'Operador' and p_group_id is not null then
    select id into v_group from groups where id = p_group_id and tenant_id = p_tenant_id;
  end if;

  select id into v_user from auth.users where lower(email) = v_email;

  if v_user is not null then
    if exists (select 1 from platform_admins where user_id = v_user) then
      raise exception 'Esse e-mail é de Gestor da plataforma, que não pertence a nenhuma empresa. Use outro e-mail.';
    end if;

    insert into user_profiles (id, full_name, email)
    select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
    from auth.users u where u.id = v_user
    on conflict (id) do nothing;
    -- o Gestor pode definir os dados pessoais
    update user_profiles
    set full_name = coalesce(nullif(trim(coalesce(p_full_name, '')), ''), full_name),
        phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
        cpf = coalesce(nullif(trim(coalesce(p_cpf, '')), ''), cpf)
    where id = v_user;

    insert into tenant_memberships (tenant_id, user_id, status, joined_at)
    values (p_tenant_id, v_user, 'active', now())
    on conflict (tenant_id, user_id) do update set status = 'active', left_at = null
    returning id into v_membership;

    delete from membership_roles where membership_id = v_membership;
    insert into membership_roles (membership_id, role_id) values (v_membership, p_role_id);
    delete from group_members where membership_id = v_membership;
    if v_group is not null then
      insert into group_members (membership_id, group_id) values (v_membership, v_group);
    end if;

    perform app.write_audit_platform(p_tenant_id, 'member.added_by_platform', 'tenant_membership', v_membership,
      jsonb_build_object('email', v_email, 'role_id', p_role_id));
    return 'added';
  end if;

  insert into tenant_invites (tenant_id, email, role_id, group_id, invited_by, full_name, phone, cpf)
  values (p_tenant_id, v_email, p_role_id, v_group, auth.uid(),
          nullif(trim(coalesce(p_full_name, '')), ''), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_cpf, '')), ''))
  on conflict do nothing;
  perform app.write_audit_platform(p_tenant_id, 'member.invited_by_platform', 'tenant', p_tenant_id,
    jsonb_build_object('email', v_email, 'role_id', p_role_id));
  return 'invited';
end;
$$;
revoke all on function public.admin_add_person(uuid, text, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.admin_add_person(uuid, text, uuid, uuid, text, text, text) to authenticated;

-- Aceita os convites pendentes e aplica nome/telefone/CPF do convite ao perfil
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
  v_role_name text;
  v_count integer := 0;
begin
  if v_user is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then return 0; end if;
  if exists (select 1 from platform_admins where user_id = v_user) then return 0; end if;

  for r in select * from tenant_invites where lower(email) = v_email and accepted_at is null loop
    insert into user_profiles (id, full_name, email)
    select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
    from auth.users u where u.id = v_user
    on conflict (id) do nothing;
    perform app.fill_profile(v_user, r.full_name, r.phone, r.cpf);

    insert into tenant_memberships (tenant_id, user_id, status, joined_at)
    values (r.tenant_id, v_user, 'active', now())
    on conflict (tenant_id, user_id) do update set status = 'active', left_at = null
    returning id into v_membership;

    delete from membership_roles where membership_id = v_membership;
    insert into membership_roles (membership_id, role_id) values (v_membership, r.role_id);

    delete from group_members where membership_id = v_membership;
    select name into v_role_name from roles where id = r.role_id;
    if v_role_name = 'Operador' and r.group_id is not null then
      insert into group_members (membership_id, group_id)
      select v_membership, g.id from groups g where g.id = r.group_id and g.tenant_id = r.tenant_id;
    end if;

    update tenant_invites set accepted_at = now(), accepted_by = v_user where id = r.id;
    perform app.write_audit(r.tenant_id, 'member.invite_accepted', 'tenant_membership', v_membership, null, jsonb_build_object('email', v_email));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
