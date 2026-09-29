-- 0028: calendário de SLA (Documento 4 §3) — sla_calendars/sla_calendar_exceptions existiam desde a
-- migração 0003 e nunca tinham sido lidos por código nenhum; todo workflow_slas.calendar_id ficava
-- sempre nulo (corrido 24/7). save_workflow_draft já materializa workflow_slas a partir de
-- config.sla_minutes a cada rascunho salvo (migração 0015) — só precisa também ler
-- config.sla_calendar_id, que o Builder passa a gravar a partir de agora. Reaproveita o corpo
-- original da 0015 ponto a ponto, só troca o insert de workflow_slas.

create or replace function public.save_workflow_draft(p_version_id uuid, p_nodes jsonb, p_edges jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_tenant uuid;
  v_status text;
begin
  select tenant_id, status into v_tenant, v_status from workflow_versions where id = p_version_id;
  if v_tenant is null then
    raise exception 'Versão não encontrada';
  end if;
  if v_status <> 'draft' then
    raise exception 'Somente rascunhos podem ser editados';
  end if;

  delete from workflow_edges
  where workflow_version_id = p_version_id
    and id not in (select (e->>'id')::uuid from jsonb_array_elements(p_edges) e);

  delete from workflow_nodes
  where workflow_version_id = p_version_id
    and id not in (select (n->>'id')::uuid from jsonb_array_elements(p_nodes) n);

  insert into workflow_nodes (id, tenant_id, workflow_version_id, node_key, node_type, name, group_id, config, position)
  select (n->>'id')::uuid, v_tenant, p_version_id, n->>'id', n->>'node_type', n->>'name',
         nullif(n->>'group_id', '')::uuid, coalesce(n->'config', '{}'::jsonb), n->'position'
  from jsonb_array_elements(p_nodes) n
  on conflict (id) do update set
    node_type = excluded.node_type,
    name = excluded.name,
    group_id = excluded.group_id,
    config = excluded.config,
    position = excluded.position
  where workflow_nodes.workflow_version_id = excluded.workflow_version_id;

  insert into workflow_edges (id, tenant_id, workflow_version_id, from_node_id, to_node_id, edge_type, condition, is_required, order_index, label, config)
  select (e->>'id')::uuid, v_tenant, p_version_id, (e->>'from_node_id')::uuid, (e->>'to_node_id')::uuid,
         e->>'edge_type', e->'condition', coalesce((e->>'is_required')::boolean, true),
         coalesce((e->>'order_index')::int, 0), e->>'label', coalesce(e->'config', '{}'::jsonb)
  from jsonb_array_elements(p_edges) e
  on conflict (id) do update set
    from_node_id = excluded.from_node_id,
    to_node_id = excluded.to_node_id,
    edge_type = excluded.edge_type,
    condition = excluded.condition,
    is_required = excluded.is_required,
    order_index = excluded.order_index,
    label = excluded.label,
    config = excluded.config
  where workflow_edges.workflow_version_id = excluded.workflow_version_id;

  -- SLA de etapa derivado da config do nó (config.sla_minutes / config.sla_calendar_id); reconstruído
  -- a cada salvamento do rascunho.
  delete from workflow_slas where workflow_version_id = p_version_id and node_id is not null;
  insert into workflow_slas (tenant_id, workflow_version_id, node_id, sla_scope, duration_minutes, calendar_id)
  select v_tenant, p_version_id, (n->>'id')::uuid,
         case when n->>'node_type' = 'wait' then 'wait' else 'stage' end,
         (n->'config'->>'sla_minutes')::int,
         nullif(n->'config'->>'sla_calendar_id', '')::uuid
  from jsonb_array_elements(p_nodes) n
  where coalesce((n->'config'->>'sla_minutes')::int, 0) > 0;

  -- Limite de loop (Documento 3 §6) derivado de config.loop_max do nó alvo de retorno.
  delete from workflow_rules where workflow_version_id = p_version_id and rule_type = 'loop_limit';
  insert into workflow_rules (tenant_id, workflow_version_id, node_id, rule_type, config)
  select v_tenant, p_version_id, (n->>'id')::uuid, 'loop_limit',
         jsonb_build_object('limit_type', 'max_count', 'max_count', (n->'config'->>'loop_max')::int)
  from jsonb_array_elements(p_nodes) n
  where coalesce((n->'config'->>'loop_max')::int, 0) > 0;

  update workflow_versions set validation_errors = null where id = p_version_id;
end;
$$;
revoke all on function public.save_workflow_draft(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_workflow_draft(uuid, jsonb, jsonb) to authenticated;
