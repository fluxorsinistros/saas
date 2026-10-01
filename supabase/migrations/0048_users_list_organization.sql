-- 0048: as listas de Usuários (Gestor e Administrador) ganham a coluna e o filtro de Organização.
-- admin_search_users e tenant_search_users: novo parâmetro p_organization_name e nova coluna organization_name
-- (convite pendente mostra a organização do convite, ou a própria empresa se não houver).

drop function if exists public.admin_search_users(text, uuid, text, text, text, integer, integer);
drop function if exists public.tenant_search_users(uuid, text, text, text, text, integer, integer);

create or replace function public.admin_search_users(
  p_q text default null,
  p_tenant_id uuid default null,
  p_role_name text default null,
  p_status text default null,
  p_group_name text default null,
  p_limit integer default 5,
  p_offset integer default 0,
  p_organization_name text default null
)
returns table (
  total bigint, tenant_id uuid, tenant_name text, membership_id uuid, invite_id uuid, user_id uuid,
  email text, full_name text, role_id uuid, role_name text, groups text, pending boolean, status text,
  organization_name text
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
           false as pending, tm.status, o.name as organization_name
    from tenant_memberships tm
    join tenants t on t.id = tm.tenant_id
    join user_profiles up on up.id = tm.user_id
    left join organizations o on o.id = tm.organization_id
    left join lateral (
      select r2.id, r2.name from membership_roles mr join roles r2 on r2.id = mr.role_id where mr.membership_id = tm.id limit 1
    ) r on true
    where not exists (select 1 from platform_admins pa where pa.user_id = tm.user_id)
    union all
    select i.tenant_id, t.name, null::uuid, i.id, null::uuid, i.email, null::text, r.id, r.name, null::text, true, 'pending',
           coalesce(o.name, (select o2.name from tenant_organizations tor join organizations o2 on o2.id = tor.organization_id
                             where tor.tenant_id = i.tenant_id and tor.is_owner limit 1))
    from tenant_invites i
    join tenants t on t.id = i.tenant_id
    left join roles r on r.id = i.role_id
    left join organizations o on o.id = i.organization_id
    where i.accepted_at is null
    union all
    select null::uuid, 'Plataforma', null::uuid, null::uuid, pa.user_id, au.email,
           coalesce(up.full_name, split_part(au.email, '@', 1)), null::uuid, 'Gestor da plataforma', null::text, false, 'active',
           null::text
    from platform_admins pa
    join auth.users au on au.id = pa.user_id
    left join user_profiles up on up.id = pa.user_id
  )
  select count(*) over () as total, x.tenant_id, x.tenant_name, x.membership_id, x.invite_id, x.user_id,
         x.email, x.full_name, x.role_id, x.role_name, x.groups, x.pending, x.status, x.organization_name
  from rows x
  where app.is_platform_admin()
    and (p_tenant_id is null or x.tenant_id = p_tenant_id)
    and (coalesce(trim(p_role_name), '') = '' or x.role_name = trim(p_role_name))
    and (p_status is null or x.status = p_status)
    and (coalesce(trim(p_organization_name), '') = '' or x.organization_name = trim(p_organization_name))
    and (coalesce(trim(p_group_name), '') = '' or (x.groups is not null and exists (
          select 1 from group_members gm join groups g on g.id = gm.group_id
          where gm.membership_id = x.membership_id and g.name = trim(p_group_name))))
    and (
      coalesce(trim(p_q), '') = ''
      or x.email ilike '%' || trim(p_q) || '%'
      or coalesce(x.full_name, '') ilike '%' || trim(p_q) || '%'
    )
  order by (x.tenant_id is not null), lower(x.tenant_name), lower(coalesce(x.full_name, x.email))
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.admin_search_users(text, uuid, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.admin_search_users(text, uuid, text, text, text, integer, integer, text) to authenticated;

create or replace function public.tenant_search_users(
  p_tenant_id uuid,
  p_q text default null,
  p_role_name text default null,
  p_status text default null,
  p_group_name text default null,
  p_limit integer default 5,
  p_offset integer default 0,
  p_organization_name text default null
)
returns table (
  total bigint, membership_id uuid, invite_id uuid, user_id uuid, email text, full_name text,
  role_name text, groups text, pending boolean, status text, organization_name text
)
language sql
security definer
set search_path = public
stable
as $$
  with rows as (
    select tm.id as membership_id, null::uuid as invite_id, tm.user_id, up.email, up.full_name, r.name as role_name,
           (select string_agg(g.name, ', ' order by g.name)
              from group_members gm join groups g on g.id = gm.group_id where gm.membership_id = tm.id) as groups,
           false as pending, tm.status, o.name as organization_name
    from tenant_memberships tm
    join user_profiles up on up.id = tm.user_id
    left join organizations o on o.id = tm.organization_id
    left join lateral (
      select r2.name from membership_roles mr join roles r2 on r2.id = mr.role_id where mr.membership_id = tm.id limit 1
    ) r on true
    where tm.tenant_id = p_tenant_id and not exists (select 1 from platform_admins pa where pa.user_id = tm.user_id)
    union all
    select null::uuid, i.id, null::uuid, i.email, null::text, r.name,
           (select g.name from groups g where g.id = i.group_id), true, 'pending',
           coalesce(o.name, (select o2.name from tenant_organizations tor join organizations o2 on o2.id = tor.organization_id
                             where tor.tenant_id = i.tenant_id and tor.is_owner limit 1))
    from tenant_invites i
    left join roles r on r.id = i.role_id
    left join organizations o on o.id = i.organization_id
    where i.tenant_id = p_tenant_id and i.accepted_at is null
  )
  select count(*) over () as total, x.membership_id, x.invite_id, x.user_id, x.email, x.full_name,
         x.role_name, x.groups, x.pending, x.status, x.organization_name
  from rows x
  where app.is_tenant_member(p_tenant_id)
    and (coalesce(trim(p_role_name), '') = '' or x.role_name = trim(p_role_name))
    and (p_status is null or x.status = p_status)
    and (coalesce(trim(p_group_name), '') = '' or x.groups = trim(p_group_name))
    and (coalesce(trim(p_organization_name), '') = '' or x.organization_name = trim(p_organization_name))
    and (
      coalesce(trim(p_q), '') = ''
      or x.email ilike '%' || trim(p_q) || '%'
      or coalesce(x.full_name, '') ilike '%' || trim(p_q) || '%'
    )
  order by lower(coalesce(x.full_name, x.email))
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.tenant_search_users(uuid, text, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.tenant_search_users(uuid, text, text, text, text, integer, integer, text) to authenticated;
