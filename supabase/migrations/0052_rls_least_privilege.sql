-- 0052: menor privilégio no banco. Até aqui QUALQUER membro da empresa (inclusive Operador) podia, falando direto com o
-- banco com o próprio login, alterar configuração, limites do plano, cobrança e até reativar conta suspensa — as telas
-- escondiam, mas a política "tenant_isolation" liberava tudo. Agora:
--  * limites efetivos e eventos de cobrança: membro só LÊ (quem grava é a plataforma / funções do banco);
--  * tabelas de configuração (grupos, fluxos, categorias, calendários, organizações...): membro LÊ, só o Administrador
--    da conta grava;
--  * empresa (tenants): só Administrador altera e, mesmo ele, não mexe em status, suspensão nem slug (só o Gestor).
-- Tabelas de trabalho do dia a dia (sinistros, ciclos, etapas, documentos, pendências...) continuam como estão.

-- 1) somente leitura para membros ------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tenant_effective_limits', 'billing_events'] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('drop policy if exists member_read on public.%I', t);
    execute format('create policy member_read on public.%I for select using (app.is_tenant_member(tenant_id))', t);
  end loop;
end $$;

-- 2) configuração: membro lê, Administrador grava ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'groups', 'workflows', 'workflow_versions', 'workflow_nodes', 'workflow_edges', 'workflow_rules', 'workflow_slas',
    'workflow_fields', 'workflow_document_requirements', 'claim_categories', 'claim_types', 'sla_calendars',
    'sla_calendar_exceptions', 'tenant_organizations', 'integration_connections', 'webhooks'
  ] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('drop policy if exists member_read on public.%I', t);
    execute format('drop policy if exists admin_insert on public.%I', t);
    execute format('drop policy if exists admin_update on public.%I', t);
    execute format('drop policy if exists admin_delete on public.%I', t);
    execute format('create policy member_read on public.%I for select using (app.is_tenant_member(tenant_id))', t);
    execute format('create policy admin_insert on public.%I for insert with check (app.is_tenant_admin(tenant_id))', t);
    execute format('create policy admin_update on public.%I for update using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id))', t);
    execute format('create policy admin_delete on public.%I for delete using (app.is_tenant_admin(tenant_id))', t);
  end loop;
end $$;

-- papéis: os globais (tenant_id nulo) todos leem; criar/alterar papel da empresa é do Administrador
drop policy if exists tenant_isolation on public.roles;
drop policy if exists member_read on public.roles;
drop policy if exists admin_insert on public.roles;
drop policy if exists admin_update on public.roles;
drop policy if exists admin_delete on public.roles;
create policy member_read on public.roles for select using (tenant_id is null or app.is_tenant_member(tenant_id));
create policy admin_insert on public.roles for insert with check (tenant_id is not null and app.is_tenant_admin(tenant_id));
create policy admin_update on public.roles for update using (tenant_id is not null and app.is_tenant_admin(tenant_id))
  with check (tenant_id is not null and app.is_tenant_admin(tenant_id));
create policy admin_delete on public.roles for delete using (tenant_id is not null and app.is_tenant_admin(tenant_id));

-- 3) empresa: só o Administrador altera, e nunca status / suspensão / slug ----------------------------------------
drop policy if exists member_can_update on public.tenants;
drop policy if exists admin_can_update on public.tenants;
create policy admin_can_update on public.tenants for update using (app.is_tenant_admin(id)) with check (app.is_tenant_admin(id));

create or replace function app.guard_tenant_sensitive_columns()
returns trigger
language plpgsql
as $$
begin
  -- só quem está logado e NÃO é Gestor da plataforma é barrado; SQL direto do dono do banco (sem login) passa
  if auth.uid() is not null and not app.is_platform_admin() then
    if new.status is distinct from old.status
       or new.suspended_at is distinct from old.suspended_at
       or new.suspension_reason is distinct from old.suspension_reason
       or new.slug is distinct from old.slug then
      raise exception 'Somente o Gestor da plataforma altera o status, a suspensão ou o identificador da empresa';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_tenant_sensitive_columns on public.tenants;
create trigger trg_guard_tenant_sensitive_columns
  before update on public.tenants
  for each row execute function app.guard_tenant_sensitive_columns();
