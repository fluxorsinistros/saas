-- 0012: SLA Engine — rastreamento de prazo, pausa justificada e alertas (§24, §68.7, §53)
-- Extensão necessária: o Documento 1 define o comportamento (calendário, pausa, alerta, escalonamento)
-- mas não nomeia estas duas tabelas; workflow_slas (0003) já modela a REGRA, aqui modelamos a EXECUÇÃO da regra.

-- Uma linha por relógio de SLA em execução (uma activity_instance/stage_instance/ciclo pode ter mais de um SLA aplicável)
create table sla_tracking (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  workflow_sla_id uuid not null references workflow_slas(id) on delete restrict, -- regra fixada na versão do ciclo (imutável)
  stage_instance_id uuid references stage_instances(id) on delete cascade,
  activity_instance_id uuid references activity_instances(id) on delete cascade,
  started_at timestamptz not null default now(),
  target_at timestamptz not null, -- prazo calculado sobre o calendário do tenant, já excluindo pausas
  paused_minutes int not null default 0, -- acumulado de tempo pausado, subtraído do cálculo do relógio
  last_alert_threshold int not null default 0, -- maior percentual já disparado, evita notificação duplicada
  status text not null default 'on_track' check (status in ('on_track', 'at_risk', 'breached', 'paused', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on sla_tracking
  for each row execute function app.set_updated_at();
create index idx_sla_tracking_open on sla_tracking(tenant_id, status) where status in ('on_track', 'at_risk', 'paused');
create index idx_sla_tracking_cycle on sla_tracking(claim_cycle_id);

-- Pausa de SLA nunca é um botão livre (§24.4, §68.7): exige motivo, tipo e, quando aplicável, autorização.
create table sla_pauses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sla_tracking_id uuid not null references sla_tracking(id) on delete cascade,
  pause_type text not null, -- catálogo aberto: 'waiting_third_party', 'waiting_document', outro configurável
  reason text not null,
  requires_authorization boolean not null default false,
  authorized_by uuid references auth.users(id),
  paused_at timestamptz not null default now(),
  resumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authorization_required_check
    check (requires_authorization = false or authorized_by is not null)
);
create trigger set_updated_at before update on sla_pauses
  for each row execute function app.set_updated_at();
create index idx_sla_pauses_open on sla_pauses(sla_tracking_id) where resumed_at is null;

-- RLS ---------------------------------------------------------------------

alter table sla_tracking enable row level security;
create policy tenant_isolation on sla_tracking
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table sla_pauses enable row level security;
create policy tenant_isolation on sla_pauses
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
