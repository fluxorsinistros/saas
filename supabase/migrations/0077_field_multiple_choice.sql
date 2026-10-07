-- 0077: campo de lista que aceita mais de uma opção (usado, por exemplo, para dizer quem absorve o sinistro: transportadora e seguradora).
-- O valor no sinistro fica como "opção1|opção2" (as opções nunca levam "|").

alter table workflow_fields add column if not exists multiple boolean not null default false;
