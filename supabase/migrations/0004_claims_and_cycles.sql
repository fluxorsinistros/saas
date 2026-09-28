-- 0004: Sinistro x Ciclo — o ciclo é a unidade formal de execução e cobrança (§7, §8, §31, §53)

create table claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_number text not null, -- ex.: '2026-00125'
  claim_category_id uuid not null references claim_categories(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed', 'archived')), -- roll-up; detalhe fica nos ciclos
  primary_organization_id uuid references organizations(id) on delete set null,
  occurred_at timestamptz,
  location jsonb,
  external_reference text, -- referência externa/seguradora, usada na detecção de duplicidade (§28)
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, claim_number)
);
create trigger set_updated_at before update on claims
  for each row execute function app.set_updated_at();
create index idx_claims_external_ref on claims(tenant_id, external_reference);

create table claim_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  cycle_number int not null, -- Ciclo 1, Ciclo 2... por sinistro
  claim_type_id uuid not null references claim_types(id) on delete restrict, -- classificação no momento da formalização
  workflow_version_id uuid not null references workflow_versions(id) on delete restrict, -- versão fixada, imutável (§30)
  status text not null default 'draft' check (status in (
    'draft', 'open', 'in_progress', 'waiting', 'blocked',
    'completed', 'cancelled', 'discarded', 'archived'
  )), -- §23
  previous_cycle_id uuid references claim_cycles(id) on delete set null, -- vínculo com ciclo anterior em descarte/reinício (§8)
  discard_reason text,
  discarded_at timestamptz,
  discarded_by uuid references auth.users(id),
  formalized_at timestamptz, -- momento em que se torna faturável (§63); null enquanto rascunho
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, claim_id, cycle_number)
);
create trigger set_updated_at before update on claim_cycles
  for each row execute function app.set_updated_at();
create index idx_claim_cycles_claim on claim_cycles(claim_id);
create index idx_claim_cycles_status on claim_cycles(tenant_id, status);

-- Regra §68.6: nunca alterar silenciosamente o workflow_version de um ciclo em andamento.
create or replace function app.block_cycle_workflow_version_change()
returns trigger
language plpgsql
as $$
begin
  if new.workflow_version_id is distinct from old.workflow_version_id then
    raise exception 'claim_cycles: workflow_version_id é imutável após criação do ciclo (id=%)', old.id;
  end if;
  return new;
end;
$$;
create trigger block_workflow_version_change before update on claim_cycles
  for each row execute function app.block_cycle_workflow_version_change();

-- Snapshot de configuração no início do ciclo (§31): alteração futura de configuração
-- não pode afetar retroativamente um processo já formalizado.
create table cycle_configuration_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null unique references claim_cycles(id) on delete cascade,
  workflow_version_id uuid not null references workflow_versions(id) on delete restrict,
  snapshot jsonb not null, -- cópia congelada: nodes, edges, rules, slas, doc requirements, permissões e políticas comerciais relevantes
  created_at timestamptz not null default now()
);

-- Append-only: snapshot nunca é editado após criado (§31)
create or replace function app.block_snapshot_edit()
returns trigger
language plpgsql
as $$
begin
  raise exception 'cycle_configuration_snapshots é append-only (id=%)', old.id;
end;
$$;
create trigger block_edit before update on cycle_configuration_snapshots
  for each row execute function app.block_snapshot_edit();
create trigger block_delete before delete on cycle_configuration_snapshots
  for each row execute function app.block_snapshot_edit();

-- RLS ---------------------------------------------------------------------

alter table claims enable row level security;
create policy tenant_isolation on claims
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table claim_cycles enable row level security;
create policy tenant_isolation on claim_cycles
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table cycle_configuration_snapshots enable row level security;
create policy tenant_isolation on cycle_configuration_snapshots
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
