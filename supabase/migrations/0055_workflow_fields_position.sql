-- 0055: ordem dos campos personalizados. A ordem é do catálogo do fluxo (não de cada etapa): vale nos formulários, na aba
-- Dados e, mais adiante, nas colunas de exportação. O Administrador escolhe a sequência no editor do fluxo.
alter table public.workflow_fields add column if not exists position integer not null default 0;

-- ordem atual = ordem de criação (para ninguém ver a lista embaralhar)
update public.workflow_fields f
set position = r.rn
from (
  select id, row_number() over (partition by workflow_id order by created_at, key) as rn
  from public.workflow_fields
) r
where r.id = f.id;

create index if not exists idx_workflow_fields_order on public.workflow_fields (workflow_id, position);
