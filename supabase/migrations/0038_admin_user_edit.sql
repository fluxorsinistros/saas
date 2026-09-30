-- 0038: tela de Usuários do administrador da plataforma em três passos — pesquisar → lista (exportável)
-- → editar o usuário (dados, tipo, situação e grupos). Substitui a assinatura de admin_search_users (0036):
--  * passa a filtrar por grupo e a devolver a lista de grupos de cada usuário;
--  * admin_group_names: nomes de grupo existentes (para o filtro);
--  * admin_get_member / admin_save_member: ler e gravar tudo de um usuário de uma vez, de forma atômica.
-- O e-mail (login) não é editável aqui: trocar o e-mail de acesso exigiria a chave de serviço do Supabase.

drop function if exists public.admin_search_users(text, uuid, uuid, text, integer, integer);

create or replace function public.admin_search_users(
  p_q text default null,
  p_tenant_id uuid default null,
  p_role_id uuid default null,
  p_status text default null,
  p_group_name text default null,
  p_limit integer default 5,
  p_offset integer default 0
)
returns table (
  total bigint, tenant_id uuid, tenant_name text, membership_id uuid, invite_id uuid, user_id uuid,
  email text, full_name text, role_id uuid, role_name text, groups text, pending boolean, status text
)
language sql
security definer
set search_path = public
stable
as $$
  with rows as (
    select tm.tenant_id, t.name as tenant_name, tm.id as membership_id, null::uuid as invite_id, tm.user_id,
           up.email, up.full_name, r.id as role_id, r.name as role_name,
           (select string_agg(g.name, ', ' order by g.name)
              from group_members gm join groups g on g.id = gm.group_id where gm.membership_id = tm.id) as groups,
           false as pending, tm.status
    from tenant_memberships tm
    join tenants t on t.id = tm.tenant_id
    join user_profiles up on up.id = tm.user_id
    left join lateral (
      select r2.id, r2.name from membership_roles mr join roles r2 on r2.id = mr.role_id where mr.membership_id = tm.id limit 1
    ) r on true
    union all
    select i.tenant_id, t.name, null::uuid, i.id, null::uuid, i.email, null::text, r.id, r.name, null::text, true, 'pending'
    from tenant_invites i
    join tenants t on t.id = i.tenant_id
    left join roles r on r.id = i.role_id
    where i.accepted_at is null
  )
  select count(*) over () as total, x.tenant_id, x.tenant_name, x.membership_id, x.invite_id, x.user_id,
         x.email, x.full_name, x.role_id, x.role_name, x.groups, x.pending, x.status
  from rows x
  where app.is_platform_admin()
    -- administradores de plataforma não são usuários de empresa (associações antigas ficam ocultas)
    and not exists (select 1 from platform_admins pa where pa.user_id = x.user_id)
    and (p_tenant_id is null or x.tenant_id = p_tenant_id)
    and (p_role_id is null or x.role_id = p_role_id)
    and (p_status is null or x.status = p_status)
    and (coalesce(trim(p_group_name), '') = '' or (x.groups is not null and exists (
          select 1 from group_members gm join groups g on g.id = gm.group_id
          where gm.membership_id = x.membership_id and g.name = trim(p_group_name))))
    and (
      coalesce(trim(p_q), '') = ''
      or x.email ilike '%' || trim(p_q) || '%'
      or coalesce(x.full_name, '') ilike '%' || trim(p_q) || '%'
    )
  order by lower(x.tenant_name), lower(coalesce(x.full_name, x.email))
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.admin_search_users(text, uuid, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.admin_search_users(text, uuid, uuid, text, text, integer, integer) to authenticated;

create or replace function public.admin_group_names()
returns setof text
language sql
security definer
set search_path = public
stable
as $$
  select distinct g.name from groups g where app.is_platform_admin() order by g.name;
$$;
revoke all on function public.admin_group_names() from public, anon;
grant execute on function public.admin_group_names() to authenticated;

-- Tudo de um usuário para a tela de edição; "groups" traz todos os grupos da empresa com a marca de quem participa.
create or replace function public.admin_get_member(p_membership_id uuid)
returns table (
  membership_id uuid, tenant_id uuid, tenant_name text, user_id uuid, email text, full_name text,
  phone text, cpf text, role_id uuid, status text, groups jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select tm.id, tm.tenant_id, t.name, tm.user_id, up.email, up.full_name, up.phone, up.cpf,
         (select mr.role_id from membership_roles mr where mr.membership_id = tm.id limit 1),
         tm.status,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'id', g.id, 'name', g.name,
                    'selected', exists (select 1 from group_members gm where gm.group_id = g.id and gm.membership_id = tm.id))
                  order by g.name)
           from groups g where g.tenant_id = tm.tenant_id and g.status = 'active'
         ), '[]'::jsonb)
  from tenant_memberships tm
  join tenants t on t.id = tm.tenant_id
  join user_profiles up on up.id = tm.user_id
  where app.is_platform_admin() and tm.id = p_membership_id;
$$;
revoke all on function public.admin_get_member(uuid) from public, anon;
grant execute on function public.admin_get_member(uuid) to authenticated;

-- Grava dados, tipo, situação e grupos de uma vez. Nome/telefone/CPF pertencem à pessoa (perfil global).
create or replace function public.admin_save_member(
  p_membership_id uuid,
  p_full_name text,
  p_phone text,
  p_cpf text,
  p_role_id uuid,
  p_active boolean,
  p_group_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_user uuid;
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

  -- grupos: só os da própria empresa
  delete from group_members
  where membership_id = p_membership_id
    and group_id in (select id from groups where tenant_id = v_tenant)
    and not (group_id = any (coalesce(p_group_ids, '{}'::uuid[])));
  insert into group_members (membership_id, group_id)
  select p_membership_id, g.id from groups g
  where g.tenant_id = v_tenant and g.id = any (coalesce(p_group_ids, '{}'::uuid[]))
    and not exists (select 1 from group_members gm where gm.membership_id = p_membership_id and gm.group_id = g.id);

  perform app.write_audit_platform(v_tenant, 'member.updated_by_platform', 'tenant_membership', p_membership_id,
    jsonb_build_object('name', trim(p_full_name), 'active', p_active, 'role_id', p_role_id, 'groups', coalesce(cardinality(p_group_ids), 0)));
end;
$$;
revoke all on function public.admin_save_member(uuid, text, text, text, uuid, boolean, uuid[]) from public, anon;
grant execute on function public.admin_save_member(uuid, text, text, text, uuid, boolean, uuid[]) to authenticated;
