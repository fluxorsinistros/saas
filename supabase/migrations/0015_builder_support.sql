-- 0015: suporte ao Workflow Builder e onboarding (Documento 3 §7, §9; Documento 5 §3, §4)

-- Políticas RLS chamam app.is_tenant_member; os papéis precisam enxergar o schema.
grant usage on schema app to authenticated, anon;
grant execute on function app.is_tenant_member(uuid) to anon;

-- Arestas ganham rótulo (opção de decisão, nome do ramo) e config livre.
alter table workflow_edges add column label text;
alter table workflow_edges add column config jsonb not null default '{}'::jsonb;

-- Auditoria ------------------------------------------------------------------
-- audit_logs não tem policy de escrita para authenticated; toda gravação passa por aqui.
create or replace function app.write_audit(
  p_tenant_id uuid, p_action text, p_entity_type text, p_entity_id uuid,
  p_previous jsonb default null, p_new jsonb default null, p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'Sem acesso ao tenant';
  end if;
  insert into audit_logs (tenant_id, actor_id, action, entity_type, entity_id, previous_value, new_value, reason, origin)
  values (p_tenant_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_previous, p_new, p_reason, 'ui');
end;
$$;
revoke all on function app.write_audit(uuid, text, text, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function app.write_audit(uuid, text, text, uuid, jsonb, jsonb, text) to authenticated;

-- Imutabilidade do conteúdo de versão publicada (§30, §68.2) -----------------
-- 0003 protege só a linha de workflow_versions; aqui protegemos nós, arestas, regras, SLAs e documentos.
create or replace function app.block_non_draft_version_content()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_version_id uuid := coalesce(new.workflow_version_id, old.workflow_version_id);
  v_status text;
begin
  select status into v_status from workflow_versions where id = v_version_id;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Versão % não está em rascunho (status=%): conteúdo imutável', v_version_id, v_status;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger block_non_draft before insert or update or delete on workflow_nodes
  for each row execute function app.block_non_draft_version_content();
create trigger block_non_draft before insert or update or delete on workflow_edges
  for each row execute function app.block_non_draft_version_content();
create trigger block_non_draft before insert or update or delete on workflow_rules
  for each row execute function app.block_non_draft_version_content();
create trigger block_non_draft before insert or update or delete on workflow_slas
  for each row execute function app.block_non_draft_version_content();
create trigger block_non_draft before insert or update or delete on workflow_document_requirements
  for each row execute function app.block_non_draft_version_content();

-- Onboarding: criar tenant -----------------------------------------------------
-- security definer porque o usuário ainda não é membro de nenhum tenant (RLS bloquearia o insert).
create or replace function public.create_tenant(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_slug text;
  v_group text;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome da empresa é obrigatório';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into tenants (name, slug) values (trim(p_name), v_slug) returning id into v_tenant;

  insert into user_profiles (id, full_name, email)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
  from auth.users u where u.id = v_user
  on conflict (id) do nothing;

  insert into tenant_memberships (tenant_id, user_id, status, joined_at)
  values (v_tenant, v_user, 'active', now());

  -- Grupos operacionais sugeridos no Documento 1 §5.3; o tenant pode renomear/desativar.
  foreach v_group in array array['Regulação','Operacional','Jurídico','Financeiro','Gestão de Risco','Seguros','Comitê'] loop
    insert into groups (tenant_id, name) values (v_tenant, v_group);
  end loop;

  perform app.write_audit(v_tenant, 'tenant.created', 'tenant', v_tenant, null, jsonb_build_object('name', p_name));
  return v_tenant;
end;
$$;
revoke all on function public.create_tenant(text) from public, anon;
grant execute on function public.create_tenant(text) to authenticated;

-- Salvar rascunho do builder (atômico) -----------------------------------------
-- security invoker: RLS continua valendo. Nós/arestas ausentes do payload são removidos.
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

  -- SLA de etapa derivado da config do nó (config.sla_minutes); reconstruído a cada salvamento do rascunho.
  delete from workflow_slas where workflow_version_id = p_version_id and node_id is not null;
  insert into workflow_slas (tenant_id, workflow_version_id, node_id, sla_scope, duration_minutes)
  select v_tenant, p_version_id, (n->>'id')::uuid,
         case when n->>'node_type' = 'wait' then 'wait' else 'stage' end,
         (n->'config'->>'sla_minutes')::int
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

-- Publicar versão (Documento 3 §7: só chamado após o validator retornar zero erros) ---
create or replace function public.publish_workflow_version(p_version_id uuid, p_validation jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_row workflow_versions%rowtype;
begin
  select * into v_row from workflow_versions where id = p_version_id;
  if v_row.id is null then
    raise exception 'Versão não encontrada';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Somente rascunhos podem ser publicados';
  end if;
  if not exists (select 1 from workflow_nodes where workflow_version_id = p_version_id) then
    raise exception 'Fluxo vazio não pode ser publicado';
  end if;

  update workflow_versions set validation_errors = p_validation where id = p_version_id;

  -- A versão publicada anterior deixa de ser a vigente; ciclos já iniciados continuam presos a ela (§30).
  update workflow_versions set status = 'archived'
  where workflow_id = v_row.workflow_id and status = 'published';

  update workflow_versions
  set status = 'published', published_at = now(), published_by = auth.uid()
  where id = p_version_id;

  perform app.write_audit(v_row.tenant_id, 'workflow_version.published', 'workflow_version', p_version_id,
    null, jsonb_build_object('workflow_id', v_row.workflow_id, 'version_number', v_row.version_number));
end;
$$;
revoke all on function public.publish_workflow_version(uuid, jsonb) from public, anon;
grant execute on function public.publish_workflow_version(uuid, jsonb) to authenticated;

-- Nova versão em rascunho copiando outra (§30: alteração de publicado = nova versão) ---
create or replace function public.create_draft_from_version(p_version_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_src workflow_versions%rowtype;
  v_new uuid;
  v_next int;
begin
  select * into v_src from workflow_versions where id = p_version_id;
  if v_src.id is null then
    raise exception 'Versão não encontrada';
  end if;
  if exists (select 1 from workflow_versions where workflow_id = v_src.workflow_id and status = 'draft') then
    raise exception 'Já existe um rascunho para este fluxo';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next from workflow_versions where workflow_id = v_src.workflow_id;

  insert into workflow_versions (tenant_id, workflow_id, version_number, status)
  values (v_src.tenant_id, v_src.workflow_id, v_next, 'draft')
  returning id into v_new;

  create temp table _node_map on commit drop as
    select id as old_id, gen_random_uuid() as new_id from workflow_nodes where workflow_version_id = p_version_id;

  insert into workflow_nodes (id, tenant_id, workflow_version_id, node_key, node_type, name, group_id, config, position)
  select m.new_id, n.tenant_id, v_new, m.new_id::text, n.node_type, n.name, n.group_id, n.config, n.position
  from workflow_nodes n join _node_map m on m.old_id = n.id;

  insert into workflow_edges (tenant_id, workflow_version_id, from_node_id, to_node_id, edge_type, condition, is_required, order_index, label, config)
  select e.tenant_id, v_new, mf.new_id, mt.new_id, e.edge_type, e.condition, e.is_required, e.order_index, e.label, e.config
  from workflow_edges e
  join _node_map mf on mf.old_id = e.from_node_id
  join _node_map mt on mt.old_id = e.to_node_id
  where e.workflow_version_id = p_version_id;

  insert into workflow_rules (tenant_id, workflow_version_id, node_id, rule_type, config)
  select r.tenant_id, v_new, m.new_id, r.rule_type, r.config
  from workflow_rules r left join _node_map m on m.old_id = r.node_id
  where r.workflow_version_id = p_version_id;

  insert into workflow_slas (tenant_id, workflow_version_id, node_id, sla_scope, duration_minutes, calendar_id,
                             alert_thresholds, escalation_target_type, escalation_target_group_id)
  select s.tenant_id, v_new, m.new_id, s.sla_scope, s.duration_minutes, s.calendar_id,
         s.alert_thresholds, s.escalation_target_type, s.escalation_target_group_id
  from workflow_slas s left join _node_map m on m.old_id = s.node_id
  where s.workflow_version_id = p_version_id;

  insert into workflow_document_requirements (tenant_id, workflow_version_id, node_id, document_type_id, is_required)
  select d.tenant_id, v_new, m.new_id, d.document_type_id, d.is_required
  from workflow_document_requirements d left join _node_map m on m.old_id = d.node_id
  where d.workflow_version_id = p_version_id;

  perform app.write_audit(v_src.tenant_id, 'workflow_version.created', 'workflow_version', v_new,
    null, jsonb_build_object('from_version_id', p_version_id, 'version_number', v_next));
  return v_new;
end;
$$;
revoke all on function public.create_draft_from_version(uuid) from public, anon;
grant execute on function public.create_draft_from_version(uuid) to authenticated;
