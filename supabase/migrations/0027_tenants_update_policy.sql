-- 0027: `tenants` só tinha policy de leitura (`member_can_read`) desde a fundação — nunca existiu
-- policy de update. Descoberto ao testar o wizard de onboarding (migração 0026): os passos que
-- gravam estado em `tenants` (operating_model, onboarding_step, onboarding_completed_at) rodavam sem
-- erro nenhum mas não persistiam nada, porque RLS bloqueia silenciosamente updates sem policy — nunca
-- existia necessidade de editar um tenant pela aplicação antes deste wizard.

create policy member_can_update on tenants
  for update using (app.is_tenant_member(id)) with check (app.is_tenant_member(id));
