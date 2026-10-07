-- 0066: grupo novo nasce com as ações restritas (nada liberado); o Administrador ativa o que for necessário.
-- Vale para qualquer caminho que cria grupo (tela de Grupos, assistente da empresa, grupos padrão de empresa nova).
-- Grupos que já existem não mudam.
alter table groups alter column disabled_actions set default array['claim.formalize']::text[];
