-- 0032: rede de segurança do upload de documentos + uma linha de consumo por sinistro.
--  1. Os arquivos agora sobem direto do navegador para o Storage (uma Server Action na Vercel aceita no
--     máximo ~4,5 MB de corpo). O app confere os limites do plano antes (prepareDocumentUpload) e depois
--     (finalizeDocumentUpload), mas o bucket também barra o que passar de tudo: 50 MB por arquivo e só os
--     tipos aceitos (fotos, PDF, Word, Excel, CSV, TXT). Vídeo, executáveis e compactados ficam de fora.
--  2. storage_usage passa a ter no máximo uma linha por sinistro (o consumo é medido por sinistro).

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv', 'text/plain'
    ]
where id = 'documents';

-- índice único completo (não parcial): o upsert do app usa ON CONFLICT (claim_id), que não infere índice parcial.
-- Várias linhas com claim_id nulo continuam permitidas (NULL não conflita com NULL).
create unique index uq_storage_usage_claim on storage_usage(claim_id);
