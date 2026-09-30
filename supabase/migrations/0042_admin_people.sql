-- 0042: o Gestor da plataforma enxerga e edita PESSOAS dos três níveis — Gestor, Administrador e
-- Operador — e pode mover alguém de uma empresa para outra.
--  * a lista passa a incluir os Gestores (empresa "Plataforma");
--  * admin_get_person / admin_save_person substituem admin_get_member / admin_save_member;
--  * mover de empresa = inativa o acesso na empresa antiga (o histórico fica lá) e cria/reativa o acesso na nova;
--  * promover a Gestor tira a pessoa das empresas; rebaixar um Gestor exige escolher a empresa, e nunca deixa a
--    plataforma sem Gestor nem permite o Gestor se rebaixar sozinho;
--  * a regra de "sempre um Administrador ativo por conta" (0041) continua valendo em tudo isso.

create or replace function app.resolve_role(p_tenant uuid, p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from roles where name = p_name and (tenant_id = p_tenant or tenant_id is null)
  order by (tenant_id is null) limit 1;
$$;

drop function if exists public.admin_get_member(uuid);
drop function if exists public.admin_save_member(uuid, text, text, text, uuid, boolean, uuid);
drop function if exists public.admin_search_users(text, uuid, text, text, text, integer, integer);

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
    where not exists (select 1 from platform_admins pa where pa.user_id = tm.user_id)
    union all
    select i.tenant_id, t.name, null::uuid, i.id, null::uuid, i.email, null::text, r.id, r.name, null::text, true, 'pending'
    from tenant_invites i
    join tenants t on t.id = i.tenant_id
    left join roles r on r.id = i.role_id
    where i.accepted_at is null
    union all
    select null::uuid, 'Plataforma', null::uuid, null::uuid, pa.user_id, au.email,
           coalesce(up.full_name, split_part(au.email, '@', 1)), null::uuid, 'Gestor da plataforma', null::text, false, 'active'
    from platform_admins pa
    join auth.users au on au.id = pa.user_id
    left join user_profiles up on up.id = pa.user_id
  )
  select count(*) over () as total, x.tenant_id, x.tenant_name, x.membership_id, x.invite_id, x.user_id,
         x.email, x.full_name, x.role_id, x.role_name, x.groups, x.pending, x.status
  from rows x
  where app.is_platform_admin()
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
  order by (x.tenant_id is not null), lower(x.tenant_name), lower(coalesce(x.full_name, x.email))
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.admin_search_users(text, uuid, text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_search_users(text, uuid, text, text, text, integer, integer) to authenticated;

-- Uma pessoa para a tela de edição: p_id é o id da associação (Administrador/Operador) ou o id do usuário (Gestor).
create or replace function public.admin_get_person(p_id uuid)
returns table (
  kind text, membership_id uuid, tenant_id uuid, user_id uuid, email text, full_name text,
  phone text, cpf text, role_name text, status text, group_id uuid
)
language sql
security definer
set search_path = public
stable
as $$
  select 'member'::text, tm.id, tm.tenant_id, tm.user_id, up.email, up.full_name, up.phone, up.cpf,
         (select r.name from membership_roles mr join roles r on r.id = mr.role_id where mr.membership_id = tm.id limit 1),
         tm.status,
         (select gm.group_id from group_members gm where gm.membership_id = tm.id limit 1)
  from tenant_memberships tm
  join user_profiles up on up.id = tm.user_id
  where app.is_platform_admin() and tm.id = p_id
    and not exists (select 1 from platform_admins pa where pa.user_id = tm.user_id)
  union all
  select 'gestor'::text, null::uuid, null::uuid, pa.user_id, au.email,
         coalesce(up.full_name, split_part(au.email, '@', 1)), up.phone, up.cpf,
         'Gestor da plataforma', 'active', null::uuid
  from platform_admins pa
  join auth.users au on au.id = pa.user_id
  left join user_profiles up on up.id = pa.user_id
  where app.is_platform_admin() and pa.user_id = p_id;
$$;
revoke all on function public.admin_get_person(uuid) from public, anon;
grant execute on function public.admin_get_person(uuid) to authenticated;

create or replace function public.admin_all_groups()
returns table (id uuid, tenant_id uuid, name text)
language sql
security definer
set search_path = public
stable
as $$
  select g.id, g.tenant_id, g.name from groups g where app.is_platform_admin() and g.status = 'active' order by g.name;
$$;
revoke all on function public.admin_all_groups() from public, anon;
grant execute on function public.admin_all_groups() to authenticated;

-- Salva a pessoa. p_kind = destino: 'gestor' ou 'member' (Administrador/Operador de p_tenant_id).
-- Devolve o id para abrir de novo a tela (associação, ou usuário se for Gestor).
create or replace function public.admin_save_person(
  p_id uuid,
  p_full_name text,
  p_phone text,
  p_cpf text,
  p_kind text,
  p_tenant_id uuid,
  p_role_name text,
  p_active boolean,
  p_group_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cur tenant_memberships%rowtype;
  v_user uuid;
  v_is_platform boolean := false;
  v_role uuid;
  v_target uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o Gestor da plataforma pode editar usuários por aqui';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'O nome é obrigatório';
  end if;
  if p_kind not in ('gestor', 'member') then
    raise exception 'Tipo inválido';
  end if;

  select * into cur from tenant_memberships where id = p_id;
  if found then
    v_user := cur.user_id;
    if exists (select 1 from platform_admins where user_id = v_user) then
      raise exception 'Esta pessoa é Gestor da plataforma: edite pela linha de Gestor';
    end if;
  elsif exists (select 1 from platform_admins where user_id = p_id) then
    v_user := p_id;
    v_is_platform := true;
  else
    raise exception 'Usuário não encontrado';
  end if;

  -- dados da pessoa (valem em todas as empresas)
  insert into user_profiles (id, full_name, email)
  select au.id, trim(p_full_name), au.email from auth.users au where au.id = v_user
  on conflict (id) do update set full_name = excluded.full_name;
  update user_profiles
  set phone = nullif(trim(coalesce(p_phone, '')), ''), cpf = nullif(trim(coalesce(p_cpf, '')), '')
  where id = v_user;

  -- destino: Gestor
  if p_kind = 'gestor' then
    if not v_is_platform then
      update tenant_memberships set status = 'inactive', left_at = coalesce(left_at, now())
      where user_id = v_user and status = 'active';
      delete from group_members where membership_id in (select id from tenant_memberships where user_id = v_user);
      insert into platform_admins (user_id, granted_by) values (v_user, auth.uid());
      perform app.write_audit_platform(cur.tenant_id, 'member.promoted_to_gestor', 'tenant_membership', cur.id,
        jsonb_build_object('user_id', v_user));
    end if;
    return v_user;
  end if;

  -- destino: Administrador/Operador de uma empresa
  if p_tenant_id is null or not exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'Escolha a empresa';
  end if;
  v_role := app.resolve_role(p_tenant_id, p_role_name);
  if v_role is null then
    raise exception 'Tipo inválido para esta empresa';
  end if;

  if v_is_platform then
    if v_user = auth.uid() then
      raise exception 'Você não pode deixar de ser Gestor por esta tela. Peça a outro Gestor.';
    end if;
    if (select count(*) from platform_admins) <= 1 then
      raise exception 'Precisa existir pelo menos um Gestor da plataforma.';
    end if;
    delete from platform_admins where user_id = v_user;
  elsif cur.tenant_id <> p_tenant_id then
    -- mover de empresa: o acesso antigo é inativado (histórico fica lá) e o grupo antigo sai
    update tenant_memberships set status = 'inactive', left_at = now() where id = cur.id;
    delete from group_members where membership_id = cur.id;
  end if;

  insert into tenant_memberships (tenant_id, user_id, status, joined_at)
  values (p_tenant_id, v_user, case when p_active then 'active' else 'inactive' end, now())
  on conflict (tenant_id, user_id) do update
    set status = case when p_active then 'active' else 'inactive' end,
        left_at = case when p_active then null else coalesce(tenant_memberships.left_at, now()) end
  returning id into v_target;

  delete from membership_roles where membership_id = v_target;
  insert into membership_roles (membership_id, role_id) values (v_target, v_role);

  -- um único grupo; Administrador não fica em grupo
  delete from group_members where membership_id = v_target;
  if p_role_name <> 'Administrador' and p_group_id is not null then
    insert into group_members (membership_id, group_id)
    select v_target, g.id from groups g where g.id = p_group_id and g.tenant_id = p_tenant_id;
  end if;

  perform app.write_audit_platform(p_tenant_id, 'member.updated_by_platform', 'tenant_membership', v_target,
    jsonb_build_object('name', trim(p_full_name), 'role', p_role_name, 'active', p_active, 'group_id', p_group_id,
                       'moved_from', case when v_is_platform then 'gestor' else cur.tenant_id::text end));
  return v_target;
end;
$$;
revoke all on function public.admin_save_person(uuid, text, text, text, text, uuid, text, boolean, uuid) from public, anon;
grant execute on function public.admin_save_person(uuid, text, text, text, text, uuid, text, boolean, uuid) to authenticated;
