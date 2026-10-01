alter table workflow_fields drop constraint workflow_fields_field_type_check;
alter table workflow_fields add constraint workflow_fields_field_type_check
  check (field_type in ('text','number','date','select','boolean','textarea','attachment','person'));
