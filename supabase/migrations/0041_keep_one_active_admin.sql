-- 0041: toda conta precisa manter pelo menos um Administrador ATIVO. Sem isso dava para inativar ou
-- rebaixar o último Administrador e deixar a empresa sem ninguém que a controle (só o Gestor da
-- plataforma resolveria). A regra vale para qualquer caminho (tela do Administrador, tela do Gestor,
-- RPCs ou API direta) porque é checada no banco, no fim da transação — assim uma troca de papel feita em
-- dois passos (apaga o papel antigo, grava o novo) continua funcionando quando o resultado final é válido.

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
  );
$$;

-- Uma associação deixou de estar ativa: se era Administrador, a conta tem que continuar com algum.
create or replace function app.check_admin_left_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'active' and new.status <> 'active'
     and exists (select 1 from membership_roles mr join roles r on r.id = mr.role_id
                 where mr.membership_id = old.id and r.name = 'Administrador')
     and exists (select 1 from tenants t where t.id = old.tenant_id)
     and not app.tenant_keeps_an_admin(old.tenant_id) then
    raise exception 'A conta ficaria sem nenhum Administrador ativo. Adicione outro Administrador antes de inativar ou trocar o tipo deste.';
  end if;
  return null;
end;
$$;

create constraint trigger keep_one_active_admin_status
  after update of status on tenant_memberships
  deferrable initially deferred
  for each row execute function app.check_admin_left_membership();

-- O papel Administrador foi removido ou trocado de alguém: a conta tem que continuar com algum.
create or replace function app.check_admin_role_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if not exists (select 1 from roles r where r.id = old.role_id and r.name = 'Administrador') then
    return null;
  end if;
  select tenant_id into v_tenant from tenant_memberships where id = old.membership_id;
  if v_tenant is not null
     and exists (select 1 from tenants t where t.id = v_tenant)
     and not app.tenant_keeps_an_admin(v_tenant) then
    raise exception 'A conta ficaria sem nenhum Administrador ativo. Adicione outro Administrador antes de inativar ou trocar o tipo deste.';
  end if;
  return null;
end;
$$;

create constraint trigger keep_one_active_admin_role
  after delete or update of role_id on membership_roles
  deferrable initially deferred
  for each row execute function app.check_admin_role_removed();
