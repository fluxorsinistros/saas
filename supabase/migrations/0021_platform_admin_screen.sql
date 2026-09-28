-- 0021: suporte à tela de administração de plataforma (Documento 5 §11).
-- app.write_audit (0015) só aceitava tenant_id de um tenant do qual o chamador é membro — ações de
-- plataforma (criar plano, atribuir contrato) não têm tenant. Adiciona o caminho de admin global.

create or replace function app.write_audit(
  p_tenant_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_previous jsonb default null, p_new jsonb default null, p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null then
    if not app.is_platform_admin() then
      raise exception 'Sem acesso a evento de plataforma';
    end if;
  elsif not app.is_tenant_member(p_tenant_id) then
    raise exception 'Sem acesso ao tenant';
  end if;
  insert into audit_logs (tenant_id, actor_id, action, entity_type, entity_id, previous_value, new_value, reason, origin)
  values (p_tenant_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_previous, p_new, p_reason, 'ui');
end;
$$;
