-- 0010: auditoria — append-only na prática operacional, obrigatório (§33, §53, §68.16)

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade, -- nullable só para eventos de plataforma
  actor_id uuid references auth.users(id),
  action text not null, -- ex.: 'claim_cycle.reopened', 'workflow_version.published'
  entity_type text not null,
  entity_id uuid not null,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  origin text not null default 'ui' check (origin in ('ui', 'api', 'system', 'import')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index idx_audit_logs_tenant_time on audit_logs(tenant_id, created_at desc);

-- Append-only: nenhuma linha de auditoria pode ser alterada ou removida (§33, §68.16)
create or replace function app.block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs é append-only (id=%)', old.id;
end;
$$;
create trigger block_update before update on audit_logs
  for each row execute function app.block_audit_mutation();
create trigger block_delete before delete on audit_logs
  for each row execute function app.block_audit_mutation();

-- RLS: leitura restrita ao tenant; escrita apenas via papel de serviço (app layer), nunca client-side direto.
alter table audit_logs enable row level security;
create policy tenant_read on audit_logs
  for select using (tenant_id is null or app.is_tenant_member(tenant_id));
-- Nenhuma policy de insert/update/delete para 'authenticated': gravação passa pelo service role no backend.
