-- 0040: regra de negócio — o usuário pertence a NO MÁXIMO UM grupo de usuários, e é o grupo (não o
-- usuário) que carrega as permissões e a configuração de acesso. Quem é Administrador administra a conta
-- e não trabalha nela: não fica preso a grupo.
--  * índice único: uma associação a grupo por usuário;
--  * admin_save_member passa a receber um único p_group_id; se o tipo for Administrador, o grupo é limpo.

create unique index uq_group_members_one_group on group_members (membership_id);

drop function if exists public.admin_save_member(uuid, text, text, text, uuid, boolean, uuid[]);

create or replace function public.admin_save_member(
  p_membership_id uuid,
  p_full_name text,
  p_phone text,
  p_cpf text,
  p_role_id uuid,
  p_active boolean,
  p_group_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_role uuid;
  v_role_name text;
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o administrador da plataforma pode editar usuários por aqui';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'O nome é obrigatório';
  end if;

  select tenant_id, user_id into v_tenant, v_user from tenant_memberships where id = p_membership_id;
  if v_tenant is null then
    raise exception 'Usuário não encontrado';
  end if;
  if exists (select 1 from platform_admins where user_id = v_user) then
    raise exception 'Administrador da plataforma não é editado por esta tela';
  end if;
  if p_role_id is not null and not exists (select 1 from roles where id = p_role_id and (tenant_id is null or tenant_id = v_tenant)) then
    raise exception 'Tipo inválido para esta empresa';
  end if;

  update user_profiles
  set full_name = trim(p_full_name),
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      cpf = nullif(trim(coalesce(p_cpf, '')), '')
  where id = v_user;

  if p_role_id is not null then
    delete from membership_roles where membership_id = p_membership_id;
    insert into membership_roles (membership_id, role_id) values (p_membership_id, p_role_id);
  end if;

  update tenant_memberships
  set status = case when p_active then 'active' else 'inactive' end,
      left_at = case when p_active then null else coalesce(left_at, now()) end
  where id = p_membership_id;

  -- Grupo: um só; Administrador não fica em grupo
  select mr.role_id into v_role from membership_roles mr where mr.membership_id = p_membership_id limit 1;
  select name into v_role_name from roles where id = v_role;

  delete from group_members where membership_id = p_membership_id;
  if v_role_name is distinct from 'Administrador' and p_group_id is not null then
    insert into group_members (membership_id, group_id)
    select p_membership_id, g.id from groups g where g.id = p_group_id and g.tenant_id = v_tenant;
  end if;

  perform app.write_audit_platform(v_tenant, 'member.updated_by_platform', 'tenant_membership', p_membership_id,
    jsonb_build_object('name', trim(p_full_name), 'active', p_active, 'role_id', v_role, 'group_id', p_group_id));
end;
$$;
revoke all on function public.admin_save_member(uuid, text, text, text, uuid, boolean, uuid) from public, anon;
grant execute on function public.admin_save_member(uuid, text, text, text, uuid, boolean, uuid) to authenticated;
