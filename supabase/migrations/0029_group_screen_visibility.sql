alter table groups add column hidden_screens text[] not null default '{}';
comment on column groups.hidden_screens is 'Chaves de tela (NavLinks) escondidas do menu para membros deste grupo. Vazio = todas visíveis. Não substitui RBAC por Papel (ações continuam liberadas por permissions/role_permissions) — só controla o que aparece no menu lateral.';
