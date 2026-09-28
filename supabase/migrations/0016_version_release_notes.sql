-- 0016: nota de publicação da versão (crítica de design: publicar precisa de cerimônia/contexto)

alter table workflow_versions add column release_note text;

create or replace function public.publish_workflow_version(p_version_id uuid, p_validation jsonb, p_release_note text default null)
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

  update workflow_versions set validation_errors = p_validation, release_note = p_release_note where id = p_version_id;

  update workflow_versions set status = 'archived'
  where workflow_id = v_row.workflow_id and status = 'published';

  update workflow_versions
  set status = 'published', published_at = now(), published_by = auth.uid()
  where id = p_version_id;

  perform app.write_audit(v_row.tenant_id, 'workflow_version.published', 'workflow_version', p_version_id,
    null, jsonb_build_object('workflow_id', v_row.workflow_id, 'version_number', v_row.version_number, 'release_note', p_release_note));
end;
$$;
revoke all on function public.publish_workflow_version(uuid, jsonb, text) from public, anon;
grant execute on function public.publish_workflow_version(uuid, jsonb, text) to authenticated;

-- a assinatura antiga (sem nota) deixa de existir para não haver duas versões da função
drop function if exists public.publish_workflow_version(uuid, jsonb);
