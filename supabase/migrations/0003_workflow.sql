-- 0003: Workflow Engine — grafo configurável, versionado e imutável após publicação (§11, §30, §53)

create table workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_type_id uuid references claim_types(id) on delete set null,
  name text not null,
  description text,
  is_template boolean not null default false, -- true = template do §40, copiado ao ser aplicado a um tenant
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on workflows
  for each row execute function app.set_updated_at();

alter table claim_types add column default_workflow_id uuid references workflows(id) on delete set null;

create table workflow_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_id uuid not null references workflows(id) on delete cascade,
  version_number int not null,
  status text not null default 'draft' check (status in ('draft', 'validated', 'published', 'archived')),
  validation_errors jsonb,
  published_at timestamptz,
  published_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_id, version_number)
);
create trigger set_updated_at before update on workflow_versions
  for each row execute function app.set_updated_at();

-- Imutabilidade após publicação (§30, §68.2): bloqueia qualquer UPDATE em versão publicada,
-- exceto a transição controlada published -> archived.
create or replace function app.block_published_workflow_version_edit()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'published' and new.status not in ('published', 'archived') then
    raise exception 'workflow_versions: versão publicada é imutável (id=%)', old.id;
  end if;
  if old.status = 'published' and new.status = 'published' then
    -- só published_by/published_at/timestamps podem "mudar" tecnicamente; qualquer outro campo alterado é bloqueado
    if new.workflow_id is distinct from old.workflow_id
       or new.version_number is distinct from old.version_number then
      raise exception 'workflow_versions: versão publicada é imutável (id=%)', old.id;
    end if;
  end if;
  return new;
end;
$$;
create trigger block_published_edit before update on workflow_versions
  for each row execute function app.block_published_workflow_version_edit();

create table workflow_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_version_id uuid not null references workflow_versions(id) on delete cascade,
  node_key text not null, -- chave estável dentro da versão, referenciada por edges/rules
  node_type text not null check (node_type in ('stage', 'decision', 'parallel_split', 'join', 'wait', 'pending', 'end')),
  name text not null,
  group_id uuid references groups(id) on delete set null, -- responsável é grupo, não pessoa (§5.3, §11.1)
  config jsonb not null default '{}'::jsonb, -- config específica do tipo (opções de decisão, duração de espera, etc.)
  position jsonb, -- coordenadas do builder visual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_version_id, node_key)
);
create trigger set_updated_at before update on workflow_nodes
  for each row execute function app.set_updated_at();

create table workflow_edges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_version_id uuid not null references workflow_versions(id) on delete cascade,
  from_node_id uuid not null references workflow_nodes(id) on delete cascade,
  to_node_id uuid not null references workflow_nodes(id) on delete cascade,
  edge_type text not null check (edge_type in ('normal', 'conditional', 'parallel', 'return', 'close')), -- §11.2
  condition jsonb, -- usado quando edge_type = 'conditional'
  is_required boolean not null default true, -- ramo obrigatório vs opcional (§13)
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on workflow_edges
  for each row execute function app.set_updated_at();
create index idx_workflow_edges_from on workflow_edges(from_node_id);

-- Regras de negócio orientadas a dados (join rule, limite de loop, condição de rota, etc.) — §11, §22, §64
create table workflow_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_version_id uuid not null references workflow_versions(id) on delete cascade,
  node_id uuid references workflow_nodes(id) on delete cascade,
  rule_type text not null, -- 'join_rule' | 'loop_limit' | 'routing_condition' | outro (catálogo aberto)
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on workflow_rules
  for each row execute function app.set_updated_at();

-- Calendário de SLA por tenant (§24.1)
create table sla_calendars (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  business_days int[] not null default '{1,2,3,4,5}', -- 1=segunda ... 7=domingo
  business_start time,
  business_end time,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on sla_calendars
  for each row execute function app.set_updated_at();

create table sla_calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  calendar_id uuid not null references sla_calendars(id) on delete cascade,
  exception_date date not null,
  is_working_day boolean not null default false, -- feriado = false; dia útil extra = true
  note text,
  unique (calendar_id, exception_date)
);

create table workflow_slas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_version_id uuid not null references workflow_versions(id) on delete cascade,
  node_id uuid references workflow_nodes(id) on delete cascade, -- null = SLA do ciclo inteiro
  sla_scope text not null check (sla_scope in ('activity', 'stage', 'cycle', 'global', 'external_response', 'wait')), -- §24
  duration_minutes int not null,
  calendar_id uuid references sla_calendars(id) on delete set null,
  alert_thresholds int[] not null default '{75,90,95,100}', -- percentuais configuráveis (§24.2), nunca hardcoded no código
  escalation_target_type text check (escalation_target_type in ('group', 'manager', 'admin')),
  escalation_target_group_id uuid references groups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on workflow_slas
  for each row execute function app.set_updated_at();

-- Tipos de documento configuráveis pelo tenant (§25.1)
create table document_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create trigger set_updated_at before update on document_types
  for each row execute function app.set_updated_at();

-- Obrigatoriedade de documento vinculada a nó/etapa da versão (§25.2)
create table workflow_document_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_version_id uuid not null references workflow_versions(id) on delete cascade,
  node_id uuid references workflow_nodes(id) on delete cascade,
  document_type_id uuid not null references document_types(id) on delete restrict,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on workflow_document_requirements
  for each row execute function app.set_updated_at();

-- RLS ---------------------------------------------------------------------

alter table workflows enable row level security;
create policy tenant_isolation on workflows
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table workflow_versions enable row level security;
create policy tenant_isolation on workflow_versions
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table workflow_nodes enable row level security;
create policy tenant_isolation on workflow_nodes
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table workflow_edges enable row level security;
create policy tenant_isolation on workflow_edges
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table workflow_rules enable row level security;
create policy tenant_isolation on workflow_rules
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table sla_calendars enable row level security;
create policy tenant_isolation on sla_calendars
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table sla_calendar_exceptions enable row level security;
create policy tenant_isolation on sla_calendar_exceptions
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table workflow_slas enable row level security;
create policy tenant_isolation on workflow_slas
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table document_types enable row level security;
create policy tenant_isolation on document_types
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table workflow_document_requirements enable row level security;
create policy tenant_isolation on workflow_document_requirements
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
