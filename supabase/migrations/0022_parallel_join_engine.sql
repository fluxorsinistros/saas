-- 0022: suporte a Paralelo/Convergência na execução (Documento 3 §4-§5).
-- stage_instances precisa saber a qual branch_instance pertence, para quando a passagem chegar
-- numa Convergência sabermos qual ramo daquele Paralelo específico acabou de terminar — sem essa
-- coluna não dá para distinguir "ramo A terminou" de "ramo B terminou" no mesmo ciclo.
alter table stage_instances add column branch_instance_id uuid references branch_instances(id) on delete set null;
create index idx_stage_instances_branch on stage_instances(branch_instance_id) where branch_instance_id is not null;
