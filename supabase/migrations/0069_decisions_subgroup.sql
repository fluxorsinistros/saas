-- 0069: a decisão de uma etapa também guarda o subgrupo responsável (nulo = todos do grupo), como a atividade.
alter table decisions add column subgroup_id uuid references group_subgroups(id) on delete restrict;
create index idx_decisions_subgroup on decisions (subgroup_id) where subgroup_id is not null;
