-- 0067: subgrupos. Um grupo pode ter uma lista de subgrupos (ex.: no grupo Transportador, cada transportadora; no grupo Operacional,
-- Operacional 1, 2 e 3). O grupo liga os subgrupos e decide se são obrigatórios. Cada pessoa fica em um subgrupo por grupo.
-- As permissões e telas continuam no grupo; o subgrupo só separa quem vê e faz o quê dentro dele.

alter table groups add column uses_subgroups boolean not null default false;
alter table groups add column subgroup_required boolean not null default false;
alter table groups add constraint groups_subgroup_required_needs_use check (not subgroup_required or uses_subgroups);

create table group_subgroups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  contact_email text check (contact_email is null or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id)
);
create unique index uq_group_subgroups_name on group_subgroups (group_id, lower(btrim(name)));
create index idx_group_subgroups_group on group_subgroups (group_id) where status = 'active';
create trigger set_updated_at before update on group_subgroups for each row execute function app.set_updated_at();

alter table group_subgroups enable row level security;
create policy member_read on group_subgroups for select using (app.is_tenant_member(tenant_id));
create policy admin_write on group_subgroups for all using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

-- Quem está em qual subgrupo. A chave composta garante que o subgrupo pertence ao mesmo grupo da linha.
alter table group_members add column subgroup_id uuid;
alter table group_members add constraint group_members_subgroup_fk
  foreign key (subgroup_id, group_id) references group_subgroups (id, group_id) on delete restrict;
create index idx_group_members_subgroup on group_members (subgroup_id) where subgroup_id is not null;

-- Convites pendentes guardam o subgrupo até a pessoa aceitar
alter table tenant_invites add column subgroup_id uuid references group_subgroups(id) on delete restrict;

-- ---------------------------------------------------------------- trocar os grupos (e subgrupos) de um membro
drop function if exists public.set_member_groups(uuid, uuid[]);
create or replace function public.set_member_groups(p_membership_id uuid, p_group_ids uuid[], p_subgroups jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_is_operator boolean;
  g record;
  v_sub uuid;
begin
  select tenant_id, user_id into v_tenant, v_user from tenant_memberships where id = p_membership_id;
  if v_tenant is null then
    raise exception 'Usuário não encontrado';
  end if;
  if not (app.is_platform_admin() or app.is_tenant_admin(v_tenant)) then
    raise exception 'Somente um Administrador da conta altera os grupos dos usuários';
  end if;
  if v_user = auth.uid() and not app.is_platform_admin() then
    raise exception 'Você não pode alterar o seu próprio acesso. Peça a outro Administrador.';
  end if;

  select exists (
    select 1 from membership_roles mr join roles r on r.id = mr.role_id
    where mr.membership_id = p_membership_id and r.name = 'Operador'
  ) into v_is_operator;

  delete from group_members where membership_id = p_membership_id;
  if v_is_operator then
    for g in select id, name, uses_subgroups, subgroup_required from groups
             where tenant_id = v_tenant and id = any (coalesce(p_group_ids, '{}'::uuid[])) loop
      v_sub := case when g.uses_subgroups then nullif(coalesce(p_subgroups ->> g.id::text, ''), '')::uuid else null end;
      if v_sub is not null and not exists (select 1 from group_subgroups where id = v_sub and group_id = g.id and status = 'active') then
        raise exception 'Subgrupo inválido para o grupo "%"', g.name;
      end if;
      if v_sub is null and g.subgroup_required then
        raise exception 'O grupo "%" exige escolher um subgrupo', g.name;
      end if;
      insert into group_members (membership_id, group_id, subgroup_id) values (p_membership_id, g.id, v_sub);
    end loop;
  end if;

  if app.is_platform_admin() then
    perform app.write_audit_platform(v_tenant, 'member.groups_changed_by_platform', 'tenant_membership', p_membership_id,
      jsonb_build_object('groups', coalesce(cardinality(p_group_ids), 0)));
  else
    perform app.write_audit(v_tenant, 'member.groups_changed', 'tenant_membership', p_membership_id, null,
      jsonb_build_object('groups', coalesce(cardinality(p_group_ids), 0)));
  end if;
end;
$$;
revoke all on function public.set_member_groups(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.set_member_groups(uuid, uuid[], jsonb) to authenticated;

-- ---------------------------------------------------------------- novo usuário (já com subgrupo)
drop function if exists public.tenant_add_user(uuid, text, uuid, uuid, text, text, text);
create or replace function public.tenant_add_user(
  p_tenant_id uuid, p_email text, p_role_id uuid, p_group_id uuid,
  p_full_name text default null, p_phone text default null, p_cpf text default null, p_subgroup_id uuid default null
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
  v_gname text;
  v_gsub boolean;
  v_grequired boolean;
  v_subgroup uuid;
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
    select id, name, uses_subgroups, subgroup_required into v_group, v_gname, v_gsub, v_grequired
    from groups where id = p_group_id and tenant_id = p_tenant_id;
    if v_group is not null and v_gsub then
      if p_subgroup_id is not null then
        if not exists (select 1 from group_subgroups where id = p_subgroup_id and group_id = v_group and status = 'active') then
          raise exception 'Subgrupo inválido para o grupo "%"', v_gname;
        end if;
        v_subgroup := p_subgroup_id;
      elsif v_grequired then
        raise exception 'O grupo "%" exige escolher um subgrupo', v_gname;
      end if;
    end if;
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
      insert into group_members (membership_id, group_id, subgroup_id) values (v_membership, v_group, v_subgroup);
    end if;

    perform app.write_audit(p_tenant_id, 'member.added', 'tenant_membership', v_membership,
      null, jsonb_build_object('email', v_email, 'role', v_role_name));
    return 'added';
  end if;

  insert into tenant_invites (tenant_id, email, role_id, group_id, subgroup_id, invited_by, full_name, phone, cpf)
  values (p_tenant_id, v_email, p_role_id, v_group, v_subgroup, auth.uid(),
          nullif(trim(coalesce(p_full_name, '')), ''), nullif(trim(coalesce(p_phone, '')), ''), nullif(trim(coalesce(p_cpf, '')), ''))
  on conflict do nothing;
  perform app.write_audit(p_tenant_id, 'member.invited', 'tenant', p_tenant_id,
    null, jsonb_build_object('email', v_email, 'role', v_role_name));
  return 'invited';
end;
$$;
revoke all on function public.tenant_add_user(uuid, text, uuid, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.tenant_add_user(uuid, text, uuid, uuid, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------- aceitar convite (leva o subgrupo junto)
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
      insert into group_members (membership_id, group_id, subgroup_id)
      select v_membership, g.id, r.subgroup_id from groups g where g.id = r.group_id and g.tenant_id = r.tenant_id;
    end if;

    update tenant_invites set accepted_at = now(), accepted_by = v_user where id = r.id;
    perform app.write_audit(r.tenant_id, 'member.invite_accepted', 'tenant_membership', v_membership, null, jsonb_build_object('email', v_email));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
