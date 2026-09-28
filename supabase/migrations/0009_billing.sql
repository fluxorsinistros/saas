-- 0009: comercial — planos, limites, contrato, billing por ciclo + excedente (§42-§44, §63-§65, §53)
-- Nunca hardcodar preço/limite no código (§64): tudo aqui é dado, não constante de aplicação.

create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- 'standard' | 'professional' | 'enterprise' | 'custom'
  name text not null,
  setup_fee numeric(12,2) not null default 0,
  monthly_fee numeric(12,2) not null default 0,
  cycle_price numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on plans
  for each row execute function app.set_updated_at();

-- Matriz de limites por capacidade, não apenas "quantidade de sinistros" (§43)
create table plan_limits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references plans(id) on delete cascade,
  limit_key text not null, -- 'users','groups','workflows','storage_per_cycle_mb','file_max_mb', etc.
  limit_value numeric, -- null = ilimitado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, limit_key)
);
create trigger set_updated_at before update on plan_limits
  for each row execute function app.set_updated_at();

create table tenant_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete restrict,
  billing_organization_id uuid references organizations(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  overrides jsonb not null default '{}'::jsonb, -- limites/preços específicos do contrato sobrescrevem o plano (§43)
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on tenant_contracts
  for each row execute function app.set_updated_at();

-- Limites efetivos materializados (Plan -> Plan Limits -> Tenant Contract -> Effective Limits, §43)
create table tenant_effective_limits (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  limits jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

create table billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null check (event_type in ('cycle_open', 'cycle_overage', 'plan_change', 'limit_override', 'contract_change')), -- §65
  claim_cycle_id uuid references claim_cycles(id) on delete set null,
  amount numeric(12,2),
  competence_date date, -- período de referência/competência (§42)
  status text not null default 'pending' check (status in ('pending', 'invoiced', 'paid', 'cancelled')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on billing_events
  for each row execute function app.set_updated_at();
create index idx_billing_events_cycle on billing_events(claim_cycle_id);

create table storage_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid references claim_cycles(id) on delete set null,
  bytes_used bigint not null default 0,
  quota_bytes bigint,
  overage_bytes bigint not null default 0,
  measured_at timestamptz not null default now()
);
create index idx_storage_usage_cycle on storage_usage(claim_cycle_id);

-- RLS ---------------------------------------------------------------------

-- Catálogos comerciais são globais e somente leitura para autenticados
alter table plans enable row level security;
create policy read_all on plans for select using (auth.role() = 'authenticated');

alter table plan_limits enable row level security;
create policy read_all on plan_limits for select using (auth.role() = 'authenticated');

alter table tenant_contracts enable row level security;
create policy tenant_isolation on tenant_contracts
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table tenant_effective_limits enable row level security;
create policy tenant_isolation on tenant_effective_limits
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table billing_events enable row level security;
create policy tenant_isolation on billing_events
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table storage_usage enable row level security;
create policy tenant_isolation on storage_usage
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
