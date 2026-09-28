-- 0020: GED (Documento 5 §9, Documento 2 §7) — armazenamento de arquivo e correção de um bug real
-- da migração 0006: document_versions.validated_by/validated_at/rejection_reason nunca podiam ser
-- preenchidos, porque o gatilho append-only bloqueava QUALQUER update, inclusive esses campos.
-- O arquivo em si (storage_path, file_name, etc.) continua imutável; só o resultado da validação,
-- que por natureza acontece depois do upload, passa a ser gravável uma vez.

create or replace function app.block_document_version_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'document_versions é append-only (id=%)', old.id;
  end if;

  if old.document_id is distinct from new.document_id
     or old.version_number is distinct from new.version_number
     or old.storage_path is distinct from new.storage_path
     or old.file_name is distinct from new.file_name
     or old.mime_type is distinct from new.mime_type
     or old.size_bytes is distinct from new.size_bytes
     or old.uploaded_by is distinct from new.uploaded_by
     or old.uploaded_at is distinct from new.uploaded_at then
    raise exception 'document_versions: só o resultado da validação pode ser atualizado (id=%)', old.id;
  end if;

  return new;
end;
$$;

-- Bucket privado para os arquivos. Caminho: <tenant_id>/<claim_cycle_id>/<document_id>/<versão>-<nome>.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Isolamento por tenant no próprio Storage — o primeiro segmento do caminho é o tenant_id.
create policy tenant_documents on storage.objects
for all using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and app.is_tenant_member(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and app.is_tenant_member(((storage.foldername(name))[1])::uuid)
);
