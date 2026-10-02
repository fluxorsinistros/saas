-- Desempenho: índice para toda chave estrangeira do schema public que ainda não tem índice
-- cobrindo (consultas por tenant_id, claim_cycle_id etc. e deletes em cascata faziam varredura completa),
-- e RLS sem reavaliar auth.uid() por linha.
DO $$
DECLARE
  r record;
  idx_name text;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname, c.conkey, c.conrelid,
           (SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord)
              FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey
      )
  LOOP
    idx_name := left('idx_fk_' || r.conname, 63);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %s (%s)', idx_name, r.tbl, r.cols);
  END LOOP;
END $$;
