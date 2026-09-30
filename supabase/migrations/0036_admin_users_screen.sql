-- 0036: tela de Usuários do administrador da plataforma (todas as empresas, com filtros).
--  * admin_list_tenant_users devolve também o user_id;
--  * admin_can_manage_user: a tela não mexe na senha de outro administrador de plataforma;
--  * admin_search_users: busca paginada entre TODOS os usuários (membros + convites pendentes) de todas
--    as empresas, filtrando por texto (nome/e-mail), empresa, tipo (papel) e situação.

drop function if exists public.admin_list_tenant_users(uuid[]);

create or replace function public.admin_list_tenant_users(p_tenant_ids uuid[])
returns table (
  tenant_id uuid, membership_id uuid, invite_id uuid, user_id uuid, email text, full_name text,
  role_name text, pending boolean, status text
)
language sql
security definer
set search_path = public
stable
as $$
  select tm.tenant_id, tm.id, null::uuid, tm.user_id, up.email, up.full_name,
         (select r.name from membership_roles mr join roles r on r.id = mr.role_id where mr.membership_id = tm.id limit 1),
         false, tm.status
  from tenant_memberships tm
  join user_profiles up on up.id = tm.user_id
  where app.is_platform_admin() and tm.tenant_id = any (p_tenant_ids)
  union all
  select i.tenant_id, null::uuid, i.id, null::uuid, i.email, null::text,
         (select r.name from roles r where r.id = i.role_id),
         true, 'pending'
  from tenant_invites i
  where app.is_platform_admin() and i.tenant_id = any (p_tenant_ids) and i.accepted_at is null;
$$;
revoke all on function public.admin_list_tenant_users(uuid[]) from public, anon;
grant execute on function public.admin_list_tenant_users(uuid[]) to authenticated;

create or replace function public.admin_can_manage_user(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select app.is_platform_admin() and not exists (select 1 from platform_admins where user_id = p_user_id);
$$;
revoke all on function public.admin_can_manage_user(uuid) from public, anon;
grant execute on function public.admin_can_manage_user(uuid) to authenticated;

-- p_status: null = todos | 'active' | 'inactive' | 'pending' (convite ainda sem conta)
create or replace function public.admin_search_users(
  p_q text default null,
  p_tenant_id uuid default null,
  p_role_id uuid default null,
  p_status text default null,
  p_limit integer default 5,
  p_offset integer default 0
)
returns table (
  total bigint, tenant_id uuid, tenant_name text, membership_id uuid, invite_id uuid, user_id uuid,
  email text, full_name text, role_id uuid, role_name text, pending boolean, status text
)
language sql
security definer
set search_path = public
stable
as $$
  with rows as (
    select tm.tenant_id, t.name as tenant_name, tm.id as membership_id, null::uuid as invite_id, tm.user_id,
           up.email, up.full_name, r.id as role_id, r.name as role_name, false as pending, tm.status
    from tenant_memberships tm
    join tenants t on t.id = tm.tenant_id
    join user_profiles up on up.id = tm.user_id
    left join lateral (
      select r2.id, r2.name from membership_roles mr join roles r2 on r2.id = mr.role_id where mr.membership_id = tm.id limit 1
    ) r on true
    union all
    select i.tenant_id, t.name, null::uuid, i.id, null::uuid, i.email, null::text, r.id, r.name, true, 'pending'
    from tenant_invites i
    join tenants t on t.id = i.tenant_id
    left join roles r on r.id = i.role_id
    where i.accepted_at is null
  )
  select count(*) over () as total, x.tenant_id, x.tenant_name, x.membership_id, x.invite_id, x.user_id,
         x.email, x.full_name, x.role_id, x.role_name, x.pending, x.status
  from rows x
  where app.is_platform_admin()
    -- administradores de plataforma não são usuários de empresa (associações antigas ficam ocultas)
    and not exists (select 1 from platform_admins pa where pa.user_id = x.user_id)
    and (p_tenant_id is null or x.tenant_id = p_tenant_id)
    and (p_role_id is null or x.role_id = p_role_id)
    and (p_status is null or x.status = p_status)
    and (
      coalesce(trim(p_q), '') = ''
      or x.email ilike '%' || trim(p_q) || '%'
      or coalesce(x.full_name, '') ilike '%' || trim(p_q) || '%'
    )
  order by lower(x.tenant_name), lower(coalesce(x.full_name, x.email))
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.admin_search_users(text, uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_search_users(text, uuid, uuid, text, integer, integer) to authenticated;
