-- 0026: Onboarding assistido (Documento 5 §3) — até aqui só existia a criação do tenant (1 passo);
-- o wizard de 9 passos nunca foi construído. Cada passo grava estado parcial em `tenants` (nunca uma
-- transação única no fim, para dar pra retomar de onde parou) em vez de tabela própria — o wizard só
-- orquestra dados que já têm lugar (claim_categories/types, groups, tenant_memberships, workflows);
-- "modelo operacional" é a única coisa nova, cosmética/informativa (o Documento 1, fora deste repo,
-- não define comportamento dependente dela).

alter table tenants add column operating_model text;
alter table tenants add column onboarding_step int not null default 1;
alter table tenants add column onboarding_completed_at timestamptz;

-- Tenants que já existiam antes deste wizard nunca devem ser jogados nele — já passaram por tudo isso
-- manualmente, tela por tela.
update tenants set onboarding_completed_at = now(), onboarding_step = 6 where onboarding_completed_at is null;
