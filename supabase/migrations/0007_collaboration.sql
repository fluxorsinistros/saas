-- 0007: comentários e notificações orientadas a eventos (§47, §62, §53)

create table comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  activity_instance_id uuid references activity_instances(id) on delete set null,
  author_id uuid references auth.users(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on comments
  for each row execute function app.set_updated_at();

-- Instância de um evento de domínio (§62): activity.started, activity.overdue, join.waiting, etc.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null,
  claim_cycle_id uuid references claim_cycles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_notifications_cycle on notifications(claim_cycle_id);

-- O histórico preserva quem efetivamente recebeu, mesmo que a membership mude depois (§47)
create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  notification_id uuid not null references notifications(id) on delete cascade,
  recipient_user_id uuid references auth.users(id),
  recipient_group_id uuid references groups(id) on delete set null,
  channel text not null check (channel in ('email', 'in_app', 'whatsapp', 'teams')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'read')),
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notification_deliveries_recipient on notification_deliveries(recipient_user_id, status);

-- RLS ---------------------------------------------------------------------

alter table comments enable row level security;
create policy tenant_isolation on comments
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table notifications enable row level security;
create policy tenant_isolation on notifications
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table notification_deliveries enable row level security;
create policy tenant_isolation on notification_deliveries
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
