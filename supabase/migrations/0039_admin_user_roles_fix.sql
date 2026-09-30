-- 0039: corrige 0038. Algumas empresas (ex.: Mondelez) têm papéis próprios "Administrador"/"Operador"
-- (criados antes dos papéis de sistema), então:
--  * o filtro "Tipo" passa a ser pelo NOME do papel (vale para papel de sistema e da empresa);
--  * admin_get_member devolve os papéis elegíveis da empresa (sistema + próprios; o papel de sistema de
--    mesmo nome de um papel da empresa fica de fora), para o seletor nunca trocar o papel sem querer.

drop function if exists public.admin_search_users(text, uuid, uuid, text, text, integer, integer);

create or replace function public.admin_search_users(
  p_q text default null,
  p_tenant_id uuid default null,
  p_role_name text default null,
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
    and not exists (select 1 from platform_admins pa where pa.user_id = x.user_id)
    and (p_tenant_id is null or x.tenant_id = p_tenant_id)
    and (coalesce(trim(p_role_name), '') = '' or x.role_name = trim(p_role_name))
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
revoke all on function public.admin_search_users(text, uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_search_users(text, uuid, text, text, text, integer, integer) to authenticated;

drop function if exists public.admin_get_member(uuid);

create or replace function public.admin_get_member(p_membership_id uuid)
returns table (
  membership_id uuid, tenant_id uuid, tenant_name text, user_id uuid, email text, full_name text,
  phone text, cpf text, role_id uuid, status text, groups jsonb, roles jsonb
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
         ), '[]'::jsonb),
         coalesce((
           select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name) order by r.name)
           from roles r
           where (r.tenant_id = tm.tenant_id)
              or (r.tenant_id is null and not exists (select 1 from roles r2 where r2.tenant_id = tm.tenant_id and r2.name = r.name))
         ), '[]'::jsonb)
  from tenant_memberships tm
  join tenants t on t.id = tm.tenant_id
  join user_profiles up on up.id = tm.user_id
  where app.is_platform_admin() and tm.id = p_membership_id;
$$;
revoke all on function public.admin_get_member(uuid) from public, anon;
grant execute on function public.admin_get_member(uuid) to authenticated;
