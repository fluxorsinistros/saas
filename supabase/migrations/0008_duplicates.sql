-- 0008: detecção de duplicidade — verificação na primeira entrada, avisa mas não bloqueia (§28, §53)

create table duplicate_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  evidence jsonb not null, -- campos comparados: placa, data, transportador, referência, etc.
  confidence numeric,
  decision text check (decision in ('pending', 'confirmed_duplicate', 'not_duplicate')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  justification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on duplicate_checks
  for each row execute function app.set_updated_at();

create table duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  duplicate_check_id uuid not null references duplicate_checks(id) on delete cascade,
  candidate_claim_id uuid not null references claims(id) on delete cascade,
  confidence numeric,
  matched_fields jsonb,
  created_at timestamptz not null default now()
);
create index idx_duplicate_candidates_check on duplicate_candidates(duplicate_check_id);

-- RLS ---------------------------------------------------------------------

alter table duplicate_checks enable row level security;
create policy tenant_isolation on duplicate_checks
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table duplicate_candidates enable row level security;
create policy tenant_isolation on duplicate_candidates
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
