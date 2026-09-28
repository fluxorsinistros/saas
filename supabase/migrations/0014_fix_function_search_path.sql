-- 0014: fixa search_path das trigger functions (advisor de segurança do Supabase: function_search_path_mutable)
alter function app.set_updated_at() set search_path = public;
alter function app.block_published_workflow_version_edit() set search_path = public;
alter function app.block_cycle_workflow_version_change() set search_path = public;
alter function app.block_snapshot_edit() set search_path = public;
alter function app.block_document_version_mutation() set search_path = public;
alter function app.block_audit_mutation() set search_path = public;
