-- 0044: a tela de Usuários do Administrador da conta segue o MESMO modelo da do Gestor (filtrar → lista →
-- editar); a única diferença é o nível de acesso: aqui o escopo é a própria empresa, sem Gestores.
--  * tenant_invites ganha group_id (o convite já leva o grupo do Operador);
--  * tenant_add_user: o Administrador da conta adiciona por e-mail com tipo e grupo — quem já tem conta entra
--    na hora, quem não tem fica como convite (aceito no primeiro acesso);
--  * tenant_search_users: a lista filtrável, paginada e exportável da própria empresa (membros + convites);
--  * tenant_cancel_invite;
--  * claim_pending_invites aplica o grupo do convite.

alter table tenant_invites add column group_id uuid references groups(id) on delete set null;

create or replace function public.tenant_add_user(p_tenant_id uuid, p_email text, p_role_id uuid, p_group_id uuid)
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
  -- só o Operador fica em grupo, e só grupo desta empresa
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

  insert into tenant_invites (tenant_id, email, role_id, group_id, invited_by)
  values (p_tenant_id, v_email, p_role_id, v_group, auth.uid())
  on conflict do nothing;
  perform app.write_audit(p_tenant_id, 'member.invited', 'tenant', p_tenant_id,
    null, jsonb_build_object('email', v_email, 'role', v_role_name));
  return 'invited';
end;
$$;
revoke all on function public.tenant_add_user(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.tenant_add_user(uuid, text, uuid, uuid) to authenticated;

create or replace function public.tenant_cancel_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from tenant_invites where id = p_invite_id and accepted_at is null;
  if v_tenant is null or not app.is_tenant_admin(v_tenant) then
    raise exception 'Convite não encontrado';
  end if;
  delete from tenant_invites where id = p_invite_id;
  perform app.write_audit(v_tenant, 'member.invite_cancelled', 'tenant', v_tenant);
end;
$$;
revoke all on function public.tenant_cancel_invite(uuid) from public, anon;
grant execute on function public.tenant_cancel_invite(uuid) to authenticated;

-- Lista da própria empresa: membros (sem Gestores) e convites pendentes. p_status: active | inactive | pending.
create or replace function public.tenant_search_users(
  p_tenant_id uuid,
  p_q text default null,
  p_role_name text default null,
  p_status text default null,
  p_group_name text default null,
  p_limit integer default 5,
  p_offset integer default 0
)
returns table (
  total bigint, membership_id uuid, invite_id uuid, user_id uuid, email text, full_name text,
  role_name text, groups text, pending boolean, status text
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
           false as pending, tm.status
    from tenant_memberships tm
    join user_profiles up on up.id = tm.user_id
    left join lateral (
      select r2.name from membership_roles mr join roles r2 on r2.id = mr.role_id where mr.membership_id = tm.id limit 1
    ) r on true
    where tm.tenant_id = p_tenant_id and not exists (select 1 from platform_admins pa where pa.user_id = tm.user_id)
    union all
    select null::uuid, i.id, null::uuid, i.email, null::text, r.name,
           (select g.name from groups g where g.id = i.group_id), true, 'pending'
    from tenant_invites i
    left join roles r on r.id = i.role_id
    where i.tenant_id = p_tenant_id and i.accepted_at is null
  )
  select count(*) over () as total, x.membership_id, x.invite_id, x.user_id, x.email, x.full_name,
         x.role_name, x.groups, x.pending, x.status
  from rows x
  where app.is_tenant_member(p_tenant_id)
    and (coalesce(trim(p_role_name), '') = '' or x.role_name = trim(p_role_name))
    and (p_status is null or x.status = p_status)
    and (coalesce(trim(p_group_name), '') = '' or x.groups = trim(p_group_name))
    and (
      coalesce(trim(p_q), '') = ''
      or x.email ilike '%' || trim(p_q) || '%'
      or coalesce(x.full_name, '') ilike '%' || trim(p_q) || '%'
    )
  order by lower(coalesce(x.full_name, x.email))
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;
revoke all on function public.tenant_search_users(uuid, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.tenant_search_users(uuid, text, text, text, text, integer, integer) to authenticated;

-- Aceita os convites pendentes do e-mail confirmado de quem acabou de entrar (agora com o grupo do convite)
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
