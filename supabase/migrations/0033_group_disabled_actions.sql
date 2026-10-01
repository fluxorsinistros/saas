alter table groups add column disabled_actions text[] not null default '{}';
comment on column groups.disabled_actions is 'Chaves de ação (catálogo em src/lib/group-actions.ts) desabilitadas para membros Operador deste grupo. Vazio = todas liberadas. Mesma polaridade de hidden_screens: Administrador nunca é afetado.';
