-- Documento 1/5: campos personalizados "no estilo SHARP" — o cliente cria quantos campos quiser,
-- sem nunca precisar de migração nova. Definição fica numa tabela de catálogo (uma linha por
-- campo); valores de todos os campos de um sinistro, de qualquer etapa, caem num único jsonb na
-- própria claims — nunca fragmentado por etapa, é "uma ficha só" que vai sendo preenchida.
create table workflow_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_id uuid not null references workflows(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null check (field_type in ('text','number','date','select')),
  options jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_id, key)
);

alter table workflow_fields enable row level security;
create policy tenant_isolation on workflow_fields for all
  using (app.is_tenant_member(tenant_id))
  with check (app.is_tenant_member(tenant_id));

alter table claims add column custom_fields jsonb not null default '{}';
comment on column claims.custom_fields is 'Valores dos campos personalizados (workflow_fields) deste sinistro, de todas as etapas já passadas — uma ficha única, nunca fragmentada por etapa.';
