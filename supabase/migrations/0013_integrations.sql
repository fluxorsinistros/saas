-- 0013: integrações e webhooks — evita acoplamento direto entre workflow e integração específica (§46, §53)
-- Extensão necessária: o Documento 1 pede "API, webhooks, ERP, TMS..." mas não nomeia tabela;
-- aqui modelamos o registro de destinos e o outbox de entrega, para que o motor (Documento 3)
-- só precise emitir um evento de domínio, nunca conhecer o destino.

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  target_url text not null,
  secret text not null, -- usado para assinar o payload (HMAC), nunca exposto em leitura
  event_types text[] not null, -- subconjunto do catálogo do §62; vazio/'{*}' = todos
  status text not null default 'active' check (status in ('active', 'paused', 'failed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on webhooks
  for each row execute function app.set_updated_at();

-- Outbox de entrega: garante que o disparo do evento de domínio é desacoplado do sucesso da entrega HTTP
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  webhook_id uuid not null references webhooks(id) on delete cascade,
  notification_id uuid references notifications(id) on delete set null, -- evento de domínio que originou a entrega
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'exhausted')),
  attempt_count int not null default 0,
  last_attempt_at timestamptz,
  last_response_code int,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on webhook_deliveries
  for each row execute function app.set_updated_at();
create index idx_webhook_deliveries_pending on webhook_deliveries(tenant_id, status) where status in ('pending', 'failed');

-- Conexões de integração externa (ERP, TMS, seguradora, BI) — credenciais nunca em texto claro aqui;
-- este registro guarda apenas metadados de conexão, o segredo em si vive num vault/secret manager externo.
create table integration_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null, -- catálogo aberto: 'erp', 'tms', 'gr_system', 'insurer', 'bi', 'email', 'whatsapp', 'teams'
  name text not null,
  config jsonb not null default '{}'::jsonb, -- config não sensível (endpoints, ids de conta); segredo fica fora do banco
  status text not null default 'active' check (status in ('active', 'inactive', 'error')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on integration_connections
  for each row execute function app.set_updated_at();

-- RLS ---------------------------------------------------------------------

alter table webhooks enable row level security;
create policy tenant_isolation on webhooks
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table webhook_deliveries enable row level security;
create policy tenant_isolation on webhook_deliveries
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table integration_connections enable row level security;
create policy tenant_isolation on integration_connections
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
