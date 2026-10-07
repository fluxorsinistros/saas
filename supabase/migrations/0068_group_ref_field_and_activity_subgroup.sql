-- 0068: campo "Grupo ou subgrupo" nos fluxos e subgrupo responsável na atividade da etapa.
-- O campo aponta para um grupo (ref_group_id); o valor gravado no sinistro é o id do subgrupo (ou do próprio grupo, quando o grupo
-- não usa subgrupos). A atividade guarda o subgrupo responsável: nulo = todos do grupo.

alter table workflow_fields add column ref_group_id uuid references groups(id) on delete restrict;
alter table workflow_fields drop constraint workflow_fields_field_type_check;
alter table workflow_fields add constraint workflow_fields_field_type_check
  check (field_type = any (array['text','number','date','select','boolean','textarea','attachment','person','money','percent','calculated','group_ref']));
alter table workflow_fields add constraint workflow_fields_ref_group_only_group_ref
  check ((field_type = 'group_ref') = (ref_group_id is not null));

alter table activity_instances add column subgroup_id uuid;
alter table activity_instances add constraint activity_instances_subgroup_fk
  foreign key (subgroup_id, group_id) references group_subgroups (id, group_id) on delete restrict;
create index idx_activity_instances_subgroup on activity_instances (subgroup_id) where subgroup_id is not null;
