-- 0011: importação em massa — mesmas regras de negócio da criação manual (§29, §53)

create table imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  file_name text not null,
  storage_path text,
  status text not null default 'uploaded' check (status in (
    'uploaded', 'validating', 'preview', 'error', 'confirmed', 'processing', 'completed', 'failed'
  )),
  total_rows int,
  created_rows int,
  error_rows int,
  duplicate_rows int,
  ignored_rows int,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on imports
  for each row execute function app.set_updated_at();

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  import_id uuid not null references imports(id) on delete cascade,
  row_number int not null,
  raw_data jsonb not null,
  status text not null default 'pending' check (status in (
    'pending', 'valid', 'error', 'duplicate_candidate', 'ignored', 'created'
  )),
  errors jsonb,
  created_claim_id uuid references claims(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id, row_number)
);
create trigger set_updated_at before update on import_rows
  for each row execute function app.set_updated_at();
create index idx_import_rows_import on import_rows(import_id);

-- RLS ---------------------------------------------------------------------

alter table imports enable row level security;
create policy tenant_isolation on imports
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table import_rows enable row level security;
create policy tenant_isolation on import_rows
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
