-- 0005: motor de execução — stages, atividades, decisões, bifurcações, joins, pendências (§14-§22, §53)

-- Cada entrada em um nó gera uma "passagem" própria; repetição não sobrescreve a anterior (§17)
create table stage_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  node_id uuid not null references workflow_nodes(id) on delete restrict,
  pass_number int not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'paused', 'completed', 'cancelled', 'waived')),
  entry_reason text, -- 'initial' | 'loop_return' | 'reopen'
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (claim_cycle_id, node_id, pass_number)
);
create trigger set_updated_at before update on stage_instances
  for each row execute function app.set_updated_at();
create index idx_stage_instances_cycle on stage_instances(claim_cycle_id);

-- Um ciclo pode ter várias atividades ativas simultaneamente; não existe current_stage_id único (§16)
create table activity_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  stage_instance_id uuid not null references stage_instances(id) on delete cascade,
  group_id uuid references groups(id) on delete set null, -- grupo responsável (snapshot no momento da execução)
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'paused', 'completed', 'cancelled', 'waived')),
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on activity_instances
  for each row execute function app.set_updated_at();
create index idx_activity_instances_stage on activity_instances(stage_instance_id);
create index idx_activity_instances_group on activity_instances(group_id) where status in ('not_started', 'in_progress');

-- Decisão estruturada, pode controlar roteamento (§19)
create table decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  stage_instance_id uuid references stage_instances(id) on delete set null,
  node_id uuid references workflow_nodes(id) on delete set null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  selected_option text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  justification text,
  requires_approval boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on decisions
  for each row execute function app.set_updated_at();

-- Evento de bifurcação (o "fan-out"): agrupa os ramos ativados numa decisão/split (§12, §15)
create table branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  source_node_id uuid not null references workflow_nodes(id) on delete restrict,
  branch_mode text not null check (branch_mode in ('exclusive', 'parallel')), -- §12.1 / §12.2
  created_at timestamptz not null default now()
);

-- Cada ramo individual ativado por uma bifurcação; estado próprio (§13, §15)
create table branch_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  target_node_id uuid not null references workflow_nodes(id) on delete restrict,
  edge_id uuid references workflow_edges(id) on delete set null,
  is_required boolean not null default true,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled', 'waived')),
  waived_reason text,
  waived_by uuid references auth.users(id),
  waived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on branch_instances
  for each row execute function app.set_updated_at();
create index idx_branch_instances_branch on branch_instances(branch_id);

-- "Dispensar ramificação" exige justificativa e autoria (§13)
alter table branch_instances add constraint waive_requires_reason
  check (status <> 'waived' or (waived_reason is not null and waived_by is not null and waived_at is not null));

-- Convergência: controla quando o workflow pode continuar (§14)
create table joins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  node_id uuid not null references workflow_nodes(id) on delete restrict,
  branch_id uuid references branches(id) on delete set null,
  rule_type text not null check (rule_type in ('all', 'all_required', 'any', 'min_count', 'conditional')),
  min_count int,
  condition jsonb,
  status text not null default 'waiting' check (status in ('waiting', 'released', 'blocked', 'completed')), -- §15
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on joins
  for each row execute function app.set_updated_at();

-- Rastreia a contribuição de cada branch_instance para um join específico
create table join_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  join_id uuid not null references joins(id) on delete cascade,
  branch_instance_id uuid not null references branch_instances(id) on delete cascade,
  satisfied boolean not null default false,
  satisfied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (join_id, branch_instance_id)
);

-- Pendência não é necessariamente uma nova etapa (§21)
create table pending_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  activity_instance_id uuid references activity_instances(id) on delete set null,
  title text not null,
  description text,
  requested_by uuid references auth.users(id),
  responsible_group_id uuid references groups(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'resolved', 'cancelled')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on pending_items
  for each row execute function app.set_updated_at();
create index idx_pending_items_open on pending_items(tenant_id, status) where status = 'open';

-- RLS ---------------------------------------------------------------------

alter table stage_instances enable row level security;
create policy tenant_isolation on stage_instances
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table activity_instances enable row level security;
create policy tenant_isolation on activity_instances
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table decisions enable row level security;
create policy tenant_isolation on decisions
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table branches enable row level security;
create policy tenant_isolation on branches
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table branch_instances enable row level security;
create policy tenant_isolation on branch_instances
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table joins enable row level security;
create policy tenant_isolation on joins
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table join_instances enable row level security;
create policy tenant_isolation on join_instances
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table pending_items enable row level security;
create policy tenant_isolation on pending_items
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
