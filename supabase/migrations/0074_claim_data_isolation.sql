-- 0074: isolamento dos sinistros no banco. Hoje qualquer membro da empresa lê (e altera) todos os sinistros e tudo que é ligado a eles.
-- Passa a valer: Administrador da empresa vê tudo; os demais veem só os sinistros em que estão envolvidos, isto é,
--   * os que a própria pessoa abriu;
--   * os que têm etapa ou decisão do grupo dela (e do subgrupo dela, quando a etapa é de um subgrupo);
--   * os que têm documento pedido ao grupo dela.
-- "Envolvido" olha todos os grupos da pessoa (o grupo ativo da sessão estreita ainda mais, no aplicativo).
-- Inclui documentos no armazenamento, histórico (auditoria) e notificações. Escrever continua por membro da empresa
-- (o motor do fluxo grava a etapa seguinte, que é de outro grupo); alterar e apagar só vale em sinistro visível.

-- ---------------------------------------------------------------- quem enxerga o quê
create or replace function app.visible_cycle_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select tm.id as membership_id, tm.tenant_id,
           exists (select 1 from membership_roles mr join roles r on r.id = mr.role_id
                   where mr.membership_id = tm.id and r.name = 'Administrador') as is_admin
    from tenant_memberships tm
    join tenants t on t.id = tm.tenant_id
    where tm.user_id = auth.uid() and tm.status = 'active' and t.status = 'active'
  ),
  mine as (
    select me.tenant_id, gm.group_id, gm.subgroup_id
    from me join group_members gm on gm.membership_id = me.membership_id
  )
  select cy.id from claim_cycles cy join me on me.tenant_id = cy.tenant_id where me.is_admin
  union
  select cy.id from claim_cycles cy where cy.created_by = auth.uid() and cy.tenant_id in (select tenant_id from me)
  union
  select cy.id from claim_cycles cy join claims c on c.id = cy.claim_id
  where c.created_by = auth.uid() and cy.tenant_id in (select tenant_id from me)
  union
  select si.claim_cycle_id
  from activity_instances ai
  join stage_instances si on si.id = ai.stage_instance_id
  join mine on mine.tenant_id = ai.tenant_id and mine.group_id = ai.group_id
  where ai.subgroup_id is null or ai.subgroup_id = mine.subgroup_id
  union
  select d.claim_cycle_id
  from decisions d
  join workflow_nodes wn on wn.id = d.node_id
  join mine on mine.tenant_id = d.tenant_id and mine.group_id = wn.group_id
  where d.subgroup_id is null or d.subgroup_id = mine.subgroup_id
  union
  select pi.claim_cycle_id
  from pending_items pi
  join mine on mine.tenant_id = pi.tenant_id and mine.group_id = pi.responsible_group_id
  where pi.claim_cycle_id is not null
$$;

create or replace function app.visible_claim_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id from claims c
  where c.created_by = auth.uid()
    and c.tenant_id in (select tm.tenant_id from tenant_memberships tm join tenants t on t.id = tm.tenant_id
                        where tm.user_id = auth.uid() and tm.status = 'active' and t.status = 'active')
  union
  select cy.claim_id from claim_cycles cy where cy.id in (select app.visible_cycle_ids())
$$;

-- Ids de tudo que o histórico (auditoria) aponta e que pertence a um sinistro visível
create or replace function app.visible_entity_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from app.visible_claim_ids() as id
  union select id from app.visible_cycle_ids() as id
  union select si.id from stage_instances si where si.claim_cycle_id in (select app.visible_cycle_ids())
  union select ai.id from activity_instances ai join stage_instances si on si.id = ai.stage_instance_id
        where si.claim_cycle_id in (select app.visible_cycle_ids())
  union select d.id from decisions d where d.claim_cycle_id in (select app.visible_cycle_ids())
  union select dc.id from documents dc where dc.claim_cycle_id in (select app.visible_cycle_ids())
  union select pi.id from pending_items pi where pi.claim_cycle_id in (select app.visible_cycle_ids())
$$;

-- Arquivo no bucket "documents": tenant/ciclo/documento/arquivo ou tenant/custom-fields/sinistro/arquivo
create or replace function app.can_access_document_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parts text[] := string_to_array(p_name, '/');
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_tenant uuid;
begin
  if coalesce(array_length(parts, 1), 0) < 3 or parts[1] !~ uuid_re then return false; end if;
  v_tenant := parts[1]::uuid;
  if not app.is_tenant_member(v_tenant) then return false; end if;
  if app.is_tenant_admin(v_tenant) then return true; end if;
  if parts[2] = 'custom-fields' then
    return parts[3] ~ uuid_re and parts[3]::uuid in (select app.visible_claim_ids());
  end if;
  return parts[2] ~ uuid_re and parts[2]::uuid in (select app.visible_cycle_ids());
end;
$$;

revoke all on function app.visible_cycle_ids(), app.visible_claim_ids(), app.visible_entity_ids(), app.can_access_document_path(text) from public, anon;
grant execute on function app.visible_cycle_ids(), app.visible_claim_ids(), app.visible_entity_ids(), app.can_access_document_path(text) to authenticated;

-- ---------------------------------------------------------------- tabelas ligadas ao ciclo (coluna claim_cycle_id)
do $$
declare t text;
begin
  foreach t in array array['stage_instances', 'decisions', 'documents', 'pending_items', 'sla_tracking', 'cycle_configuration_snapshots',
                           'comments', 'cycle_financial_entries', 'branches', 'joins'] loop
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy involved_read on %I for select to authenticated using (app.is_tenant_member(tenant_id) and claim_cycle_id in (select app.visible_cycle_ids()))', t);
    execute format('create policy member_insert on %I for insert to authenticated with check (app.is_tenant_member(tenant_id))', t);
    execute format('create policy involved_update on %I for update to authenticated using (app.is_tenant_member(tenant_id) and claim_cycle_id in (select app.visible_cycle_ids())) with check (app.is_tenant_member(tenant_id))', t);
    execute format('create policy involved_delete on %I for delete to authenticated using (app.is_tenant_member(tenant_id) and claim_cycle_id in (select app.visible_cycle_ids()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- tabelas filhas (seguem a tabela mãe, já protegida)
do $$
declare r record;
begin
  for r in select * from (values
    ('activity_instances', 'stage_instance_id in (select id from stage_instances)'),
    ('document_versions', 'document_id in (select id from documents)'),
    ('sla_pauses', 'sla_tracking_id in (select id from sla_tracking)'),
    ('branch_instances', 'branch_id in (select id from branches)'),
    ('join_instances', 'join_id in (select id from joins)'),
    ('duplicate_candidates', 'duplicate_check_id in (select id from duplicate_checks)')
  ) as v(tbl, pred) loop
    execute format('drop policy if exists tenant_isolation on %I', r.tbl);
    execute format('create policy involved_read on %I for select to authenticated using (app.is_tenant_member(tenant_id) and %s)', r.tbl, r.pred);
    execute format('create policy member_insert on %I for insert to authenticated with check (app.is_tenant_member(tenant_id))', r.tbl);
    execute format('create policy involved_update on %I for update to authenticated using (app.is_tenant_member(tenant_id) and %s) with check (app.is_tenant_member(tenant_id))', r.tbl, r.pred);
    execute format('create policy involved_delete on %I for delete to authenticated using (app.is_tenant_member(tenant_id) and %s)', r.tbl, r.pred);
  end loop;
end $$;

-- ---------------------------------------------------------------- sinistros, ciclos e duplicidades
drop policy if exists tenant_isolation on claims;
create policy involved_read on claims for select to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or id in (select app.visible_claim_ids())));
create policy member_insert on claims for insert to authenticated with check (app.is_tenant_member(tenant_id));
create policy involved_update on claims for update to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or id in (select app.visible_claim_ids())))
  with check (app.is_tenant_member(tenant_id));
create policy involved_delete on claims for delete to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or id in (select app.visible_claim_ids())));

drop policy if exists tenant_isolation on claim_cycles;
create policy involved_read on claim_cycles for select to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or id in (select app.visible_cycle_ids())));
create policy member_insert on claim_cycles for insert to authenticated with check (app.is_tenant_member(tenant_id));
create policy involved_update on claim_cycles for update to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or id in (select app.visible_cycle_ids())))
  with check (app.is_tenant_member(tenant_id));
create policy involved_delete on claim_cycles for delete to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or id in (select app.visible_cycle_ids())));

drop policy if exists tenant_isolation on duplicate_checks;
create policy involved_read on duplicate_checks for select to authenticated
  using (app.is_tenant_member(tenant_id) and claim_id in (select app.visible_claim_ids()));
create policy member_insert on duplicate_checks for insert to authenticated with check (app.is_tenant_member(tenant_id));
create policy involved_update on duplicate_checks for update to authenticated
  using (app.is_tenant_member(tenant_id) and claim_id in (select app.visible_claim_ids())) with check (app.is_tenant_member(tenant_id));
create policy involved_delete on duplicate_checks for delete to authenticated
  using (app.is_tenant_member(tenant_id) and claim_id in (select app.visible_claim_ids()));

-- ---------------------------------------------------------------- notificações: só o Administrador lê (o envio roda no banco)
drop policy if exists tenant_isolation on notifications;
create policy admin_read on notifications for select to authenticated using (app.is_tenant_admin(tenant_id));
create policy member_insert on notifications for insert to authenticated with check (app.is_tenant_member(tenant_id));

drop policy if exists tenant_isolation on notification_deliveries;
create policy admin_read on notification_deliveries for select to authenticated using (app.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------- importações: Administrador ou quem importou
drop policy if exists tenant_isolation on imports;
create policy owner_read on imports for select to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or app.is_tenant_admin(tenant_id)));
create policy member_insert on imports for insert to authenticated with check (app.is_tenant_member(tenant_id));
create policy owner_update on imports for update to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or app.is_tenant_admin(tenant_id))) with check (app.is_tenant_member(tenant_id));
create policy owner_delete on imports for delete to authenticated
  using (app.is_tenant_member(tenant_id) and (created_by = auth.uid() or app.is_tenant_admin(tenant_id)));

drop policy if exists tenant_isolation on import_rows;
create policy owner_read on import_rows for select to authenticated
  using (app.is_tenant_member(tenant_id) and import_id in (select id from imports));
create policy member_insert on import_rows for insert to authenticated with check (app.is_tenant_member(tenant_id));
create policy owner_update on import_rows for update to authenticated
  using (app.is_tenant_member(tenant_id) and import_id in (select id from imports)) with check (app.is_tenant_member(tenant_id));
create policy owner_delete on import_rows for delete to authenticated
  using (app.is_tenant_member(tenant_id) and import_id in (select id from imports));

-- ---------------------------------------------------------------- histórico (auditoria)
drop policy if exists tenant_read on audit_logs;
create policy involved_read on audit_logs for select to authenticated
  using (
    (tenant_id is null and app.is_platform_admin())
    or (tenant_id is not null and app.is_tenant_member(tenant_id)
        and (app.is_tenant_admin(tenant_id) or entity_id in (select app.visible_entity_ids())))
  );

-- ---------------------------------------------------------------- arquivos dos documentos
drop policy if exists tenant_documents on storage.objects;
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and app.can_access_document_path(name));
create policy documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and app.can_access_document_path(name));
create policy documents_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and app.can_access_document_path(name))
  with check (bucket_id = 'documents' and app.can_access_document_path(name));
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and app.can_access_document_path(name));
