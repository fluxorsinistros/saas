-- 0018: suporte à execução de sinistros (Documento 3, fatia 1) — sequência, decisão, retorno com limite.
-- Nenhuma tabela nova: claims/claim_cycles/cycle_configuration_snapshots/stage_instances/
-- activity_instances/decisions/audit_logs já existiam desde 0004/0005/0010, nunca usadas por código.

-- app.write_audit (0015) vive no schema app; expõe um espelho em public para o Supabase-js chamar via rpc().
create or replace function public.write_audit(
  p_tenant_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_previous jsonb default null, p_new jsonb default null, p_reason text default null
) returns void
language sql
security invoker
set search_path = public
as $$
  select app.write_audit(p_tenant_id, p_action, p_entity_type, p_entity_id, p_previous, p_new, p_reason);
$$;
revoke all on function public.write_audit(uuid, text, text, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.write_audit(uuid, text, text, uuid, jsonb, jsonb, text) to authenticated;
