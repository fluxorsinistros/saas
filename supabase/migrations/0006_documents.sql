-- 0006: GED — documento é entidade de negócio, versionado, nunca perde versão anterior (§25, §53)

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_cycle_id uuid not null references claim_cycles(id) on delete cascade,
  document_type_id uuid not null references document_types(id) on delete restrict,
  node_id uuid references workflow_nodes(id) on delete set null, -- onde foi solicitado/vinculado
  is_required boolean not null default false,
  status text not null default 'requested' check (status in (
    'requested', 'received', 'in_validation', 'validated', 'rejected', 'substituted'
  )), -- §25.3
  requested_by uuid references auth.users(id),
  requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on documents
  for each row execute function app.set_updated_at();
create index idx_documents_cycle on documents(claim_cycle_id);

-- Substituição não apaga versão anterior (§25.4)
create table document_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_number int not null,
  storage_path text not null, -- caminho no Supabase Storage
  file_name text not null,
  mime_type text,
  size_bytes bigint not null,
  uploaded_by uuid references auth.users(id),
  uploaded_at timestamptz not null default now(),
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

-- Append-only: versão de documento nunca é editada ou excluída (§25.4, §68.8)
create or replace function app.block_document_version_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'document_versions é append-only (id=%)', old.id;
end;
$$;
create trigger block_update before update on document_versions
  for each row execute function app.block_document_version_mutation();
create trigger block_delete before delete on document_versions
  for each row execute function app.block_document_version_mutation();

-- RLS ---------------------------------------------------------------------

alter table documents enable row level security;
create policy tenant_isolation on documents
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table document_versions enable row level security;
create policy tenant_isolation on document_versions
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
