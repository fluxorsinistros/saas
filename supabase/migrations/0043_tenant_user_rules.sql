-- 0043: regras de quem vê e altera quem, dentro de uma empresa.
--  * Gestor da plataforma não aparece para a empresa: as linhas dele em tenant_memberships ficam invisíveis
--    (RLS) e as associações antigas dele com empresas foram inativadas. Também não conta como
--    Administrador da conta na regra de "sempre um Administrador ativo".
--  * Quem lê: qualquer membro da empresa (sem Gestores). Quem ESCREVE em associações, papéis e grupos:
--    só Administrador da conta — e nunca na própria associação (ninguém altera o próprio acesso).
--    Antes qualquer membro, inclusive Operador, conseguia alterar papéis direto pela API.
--  * tenant_update_member: papel, grupo (um só; Operador apenas) e situação numa operação só, com as regras acima.
--  * add_tenant_member e create_partner_organization passam a exigir Administrador da conta.

create or replace function app.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tenant_memberships tm
    join membership_roles mr on mr.membership_id = tm.id
    join roles r on r.id = mr.role_id
    join tenants t on t.id = tm.tenant_id
    where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid()
      and tm.status = 'active' and t.status = 'active' and r.name = 'Administrador'
  );
$$;
revoke all on function app.is_tenant_admin(uuid) from public, anon;
grant execute on function app.is_tenant_admin(uuid) to authenticated;

create or replace function app.tenant_keeps_an_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from tenant_memberships tm
    join membership_roles mr on mr.membership_id = tm.id
    join roles r on r.id = mr.role_id
    where tm.tenant_id = p_tenant_id and tm.status = 'active' and r.name = 'Administrador'
      and not exists (select 1 from platform_admins pa where pa.user_id = tm.user_id)
  );
$$;

-- Gestor não pertence a empresa: encerra as associações antigas dele
update tenant_memberships
set status = 'inactive', left_at = coalesce(left_at, now())
where status = 'active' and user_id in (select user_id from platform_admins);

-- tenant_memberships ---------------------------------------------------------
drop policy if exists tenant_isolation on tenant_memberships;
-- "é Gestor?" precisa de função definer: platform_admins só é legível pelo próprio Gestor, então um
-- NOT EXISTS direto na policy nunca enxergaria as linhas dos outros.
create or replace function app.is_gestor_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = p_user_id);
$$;
revoke all on function app.is_gestor_user(uuid) from public, anon;
grant execute on function app.is_gestor_user(uuid) to authenticated;

create policy member_read on tenant_memberships
  for select using (app.is_tenant_member(tenant_id) and not app.is_gestor_user(user_id));
create policy admin_insert on tenant_memberships
  for insert with check (app.is_tenant_admin(tenant_id) and user_id <> auth.uid());
create policy admin_update on tenant_memberships
  for update using (app.is_tenant_admin(tenant_id) and user_id <> auth.uid())
  with check (app.is_tenant_admin(tenant_id) and user_id <> auth.uid());
create policy admin_delete on tenant_memberships
  for delete using (app.is_tenant_admin(tenant_id) and user_id <> auth.uid());

-- membership_roles -----------------------------------------------------------
drop policy if exists tenant_isolation on membership_roles;
create policy member_read on membership_roles
  for select using (exists (
    select 1 from tenant_memberships tm where tm.id = membership_roles.membership_id and app.is_tenant_member(tm.tenant_id)));
create policy admin_write on membership_roles
  for all using (exists (
    select 1 from tenant_memberships tm
    where tm.id = membership_roles.membership_id and app.is_tenant_admin(tm.tenant_id) and tm.user_id <> auth.uid()))
  with check (exists (
    select 1 from tenant_memberships tm
    where tm.id = membership_roles.membership_id and app.is_tenant_admin(tm.tenant_id) and tm.user_id <> auth.uid()));

-- group_members --------------------------------------------------------------
drop policy if exists tenant_isolation on group_members;
create policy member_read on group_members
  for select using (exists (select 1 from groups g where g.id = group_members.group_id and app.is_tenant_member(g.tenant_id)));
create policy admin_write on group_members
  for all using (exists (select 1 from groups g where g.id = group_members.group_id and app.is_tenant_admin(g.tenant_id)))
  with check (exists (select 1 from groups g where g.id = group_members.group_id and app.is_tenant_admin(g.tenant_id)));

-- Papel + grupo + situação de um membro, feito por um Administrador da conta ----------------
drop function if exists public.set_membership_role(uuid, uuid);

create or replace function public.tenant_update_member(p_membership_id uuid, p_role_id uuid, p_group_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_role_name text;
begin
  select tenant_id, user_id into v_tenant, v_user from tenant_memberships where id = p_membership_id;
  if v_tenant is null or not app.is_tenant_admin(v_tenant) then
    raise exception 'Somente um Administrador da conta altera o acesso dos usuários';
  end if;
  if v_user = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio acesso. Peça a outro Administrador.';
  end if;
  if exists (select 1 from platform_admins where user_id = v_user) then
    raise exception 'Usuário não encontrado';
  end if;

  select name into v_role_name from roles where id = p_role_id and (tenant_id is null or tenant_id = v_tenant);
  if v_role_name is null or v_role_name not in ('Administrador', 'Operador') then
    raise exception 'Tipo inválido';
  end if;

  delete from membership_roles where membership_id = p_membership_id;
  insert into membership_roles (membership_id, role_id) values (p_membership_id, p_role_id);

  -- um único grupo, e só o Operador fica em grupo
  delete from group_members where membership_id = p_membership_id;
  if v_role_name = 'Operador' and p_group_id is not null then
    insert into group_members (membership_id, group_id)
    select p_membership_id, g.id from groups g where g.id = p_group_id and g.tenant_id = v_tenant;
  end if;

  update tenant_memberships
  set status = case when p_active then 'active' else 'inactive' end,
      left_at = case when p_active then null else coalesce(left_at, now()) end
  where id = p_membership_id;

  perform app.write_audit(v_tenant, 'member.access_changed', 'tenant_membership', p_membership_id, null,
    jsonb_build_object('role', v_role_name, 'group_id', p_group_id, 'active', p_active));
end;
$$;
revoke all on function public.tenant_update_member(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.tenant_update_member(uuid, uuid, uuid, boolean) to authenticated;

-- Adicionar membro e criar organização: só Administrador da conta; Gestor não é adicionado a empresa --------------
create or replace function public.add_tenant_member(p_tenant_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_membership uuid;
begin
  if not app.is_tenant_admin(p_tenant_id) then
    raise exception 'Somente um Administrador da conta adiciona usuários';
  end if;

  select id into v_target from auth.users where lower(email) = lower(trim(p_email));
  if v_target is null then
    raise exception 'Não existe conta com o e-mail %. Peça para a pessoa criar uma conta primeiro (tela de login → Criar conta) e adicione de novo.', p_email;
  end if;
  if exists (select 1 from platform_admins where user_id = v_target) then
    raise exception 'Não existe conta com o e-mail %. Peça para a pessoa criar uma conta primeiro (tela de login → Criar conta) e adicione de novo.', p_email;
  end if;

  insert into user_profiles (id, full_name, email)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
  from auth.users u where u.id = v_target
  on conflict (id) do nothing;

  insert into tenant_memberships (tenant_id, user_id, status, joined_at)
  values (p_tenant_id, v_target, 'active', now())
  on conflict (tenant_id, user_id) do update set status = 'active'
  returning id into v_membership;

  insert into membership_roles (membership_id, role_id)
  values (v_membership, '00000000-0000-0000-0000-000000000002')
  on conflict do nothing;

  perform app.write_audit(p_tenant_id, 'member.added', 'tenant_membership', v_membership, null, jsonb_build_object('email', p_email));
  return v_membership;
end;
$$;

create or replace function public.create_partner_organization(p_tenant_id uuid, p_name text, p_role_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not app.is_tenant_admin(p_tenant_id) then
    raise exception 'Somente um Administrador da conta cria organizações';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome da organização é obrigatório';
  end if;

  insert into organizations (name) values (trim(p_name)) returning id into v_org;
  insert into tenant_organizations (tenant_id, organization_id, role_kind) values (p_tenant_id, v_org, p_role_kind);

  perform app.write_audit(p_tenant_id, 'organization.created', 'organization', v_org, null, jsonb_build_object('name', p_name, 'role_kind', p_role_kind));
  return v_org;
end;
$$;
