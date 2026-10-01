alter table workflow_fields
  add column required boolean not null default false,
  add column is_unique boolean not null default false,
  add column default_value text;
comment on column workflow_fields.required is 'Bloqueia "Concluir" até preencher — validado no servidor, não só escondendo o botão.';
comment on column workflow_fields.is_unique is 'Nenhum outro sinistro do tenant pode ter o mesmo valor neste campo (ex.: referência externa da seguradora).';
