-- 0023: Financeiro do ciclo (Documento 5 §14) — extensão explicitamente prevista pelo próprio
-- documento ("se o produto vier a precisar de uma tabela própria para lançamentos financeiros do
-- sinistro, ela é uma extensão do Documento 2 a fazer quando esta tela for implementada").
-- Nunca confundir com billing_events (0009_billing.sql), que é a cobrança do SaaS ao tenant — este
-- aqui é o dinheiro do próprio sinistro (guincho, armazenagem, reparo, ressarcimento de seguradora).

alter table claims add column declared_value numeric;

create table cycle_financial_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  entry_type text not null check (entry_type in ('expense', 'receipt', 'reimbursement')),
  description text not null,
  amount numeric not null,
  entry_date date not null default current_date,
  status text not null default 'pending' check (status in ('paid', 'pending', 'cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on cycle_financial_entries
  for each row execute function app.set_updated_at();
create index idx_cycle_financial_entries_cycle on cycle_financial_entries(claim_cycle_id);

alter table cycle_financial_entries enable row level security;
create policy tenant_isolation on cycle_financial_entries
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
