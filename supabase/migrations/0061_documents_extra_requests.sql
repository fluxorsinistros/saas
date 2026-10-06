-- 0061: documento extra (pedido avulso de documento a um grupo, com prazo e instruções, ligado a uma pendência do ciclo).
alter table public.documents
  add column if not exists is_extra boolean not null default false,
  add column if not exists instructions text check (instructions is null or char_length(instructions) <= 1000),
  add column if not exists pending_item_id uuid references public.pending_items(id) on delete set null;

create index if not exists idx_documents_pending_item on public.documents (pending_item_id) where pending_item_id is not null;
create index if not exists idx_pending_items_open_group on public.pending_items (tenant_id, responsible_group_id, due_at) where status = 'open';
