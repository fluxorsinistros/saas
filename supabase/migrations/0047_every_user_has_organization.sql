-- 0047: todo usuário pertence a uma organização da empresa.
--  * cada empresa ganha uma organização própria (is_owner, 'interno'), com o nome dela; renomear a empresa renomeia a organização;
--  * tenant_memberships.organization_id passa a ser obrigatório (sem escolha = organização própria) e precisa ser da empresa;
--  * o convite guarda a organização e a repassa ao vínculo quando é aceito;
--  * set_person_organization: Gestor ou Administrador da conta define a organização (membro ativo ou convite pendente);
--  * admin_all_organizations: lista para o Gestor.

create or replace function app.ensure_owner_org(p_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_name text;
begin
  select organization_id into v_org from tenant_organizations where tenant_id = p_tenant and is_owner limit 1;
  if v_org is not null then return v_org; end if;
  select name into v_name from tenants where id = p_tenant;
  insert into organizations (name) values (v_name) returning id into v_org;
  insert into tenant_organizations (tenant_id, organization_id, role_kind, is_owner) values (p_tenant, v_org, 'interno', true);
  return v_org;
end;
$$;
revoke all on function app.ensure_owner_org(uuid) from public, anon, authenticated;

create or replace function app.tenant_owner_org_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform app.ensure_owner_org(new.id);
  elsif new.name is distinct from old.name then
    update organizations o set name = new.name
    from tenant_organizations tor
    where tor.organization_id = o.id and tor.tenant_id = new.id and tor.is_owner;
  end if;
  return null;
end;
$$;
create trigger tenant_owner_org after insert or update of name on tenants
  for each row execute function app.tenant_owner_org_trg();

do $$
declare t record;
begin
  for t in select id from tenants loop
    perform app.ensure_owner_org(t.id);
  end loop;
end $$;
update tenant_memberships tm
set organization_id = (select organization_id from tenant_organizations where tenant_id = tm.tenant_id and is_owner limit 1)
where organization_id is null;

create or replace function app.membership_org_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is null then
    new.organization_id := app.ensure_owner_org(new.tenant_id);
  elsif not exists (
    select 1 from tenant_organizations where tenant_id = new.tenant_id and organization_id = new.organization_id and status = 'active'
  ) then
    raise exception 'Organização não pertence a esta empresa';
  end if;
  return new;
end;
$$;
create trigger membership_org before insert or update of organization_id on tenant_memberships
  for each row execute function app.membership_org_trg();
alter table tenant_memberships alter column organization_id set not null;
alter table tenant_memberships drop constraint if exists tenant_memberships_organization_id_fkey;
alter table tenant_memberships add constraint tenant_memberships_organization_id_fkey
  foreign key (organization_id) references organizations(id) on delete restrict;

alter table tenant_invites add column organization_id uuid references organizations(id) on delete set null;

create or replace function app.invite_org_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.accepted_at is not null and old.accepted_at is null and new.organization_id is not null and new.accepted_by is not null then
    update tenant_memberships set organization_id = new.organization_id
    where tenant_id = new.tenant_id and user_id = new.accepted_by
      and exists (select 1 from tenant_organizations where tenant_id = new.tenant_id and organization_id = new.organization_id);
  end if;
  return null;
end;
$$;
create trigger invite_org after update of accepted_at on tenant_invites
  for each row execute function app.invite_org_trg();

create or replace function public.set_person_organization(p_tenant_id uuid, p_email text, p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
begin
  if not (app.is_platform_admin() or app.is_tenant_admin(p_tenant_id)) then
    raise exception 'Sem permissão';
  end if;
  if not exists (
    select 1 from tenant_organizations where tenant_id = p_tenant_id and organization_id = p_organization_id and status = 'active'
  ) then
    raise exception 'Organização não pertence a esta empresa';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null and v_user = auth.uid() and not app.is_platform_admin() then
    raise exception 'Ninguém altera o próprio acesso.';
  end if;
  update tenant_memberships set organization_id = p_organization_id where tenant_id = p_tenant_id and user_id = v_user;
  update tenant_invites set organization_id = p_organization_id
  where tenant_id = p_tenant_id and lower(email) = v_email and accepted_at is null;
end;
$$;
revoke all on function public.set_person_organization(uuid, text, uuid) from public, anon;
grant execute on function public.set_person_organization(uuid, text, uuid) to authenticated;

create or replace function public.admin_all_organizations()
returns table (id uuid, tenant_id uuid, name text, is_owner boolean)
language sql
security definer
set search_path = public
stable
as $$
  select o.id, tor.tenant_id, o.name, tor.is_owner
  from tenant_organizations tor
  join organizations o on o.id = tor.organization_id
  where app.is_platform_admin() and tor.status = 'active'
  order by tor.is_owner desc, lower(o.name);
$$;
revoke all on function public.admin_all_organizations() from public, anon;
grant execute on function public.admin_all_organizations() to authenticated;
