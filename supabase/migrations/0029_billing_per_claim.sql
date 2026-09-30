-- 0029: cobrança por SINISTRO (não por ciclo) + planos iniciais (valores provisórios)
-- Decisão 2026-09-30: vários ciclos do mesmo sinistro não geram nova cobrança.
-- Nada de preço/limite no código: tudo aqui é dado e pode ser alterado pelo /admin.

-- 1. Preço por sinistro ---------------------------------------------------------
alter table plans rename column cycle_price to claim_price;

-- 2. Eventos de cobrança ligados ao sinistro ---------------------------------------
alter table billing_events drop constraint if exists billing_events_event_type_check;
update billing_events set event_type = 'claim_open' where event_type = 'cycle_open';
alter table billing_events add constraint billing_events_event_type_check
  check (event_type in ('claim_open', 'cycle_overage', 'plan_change', 'limit_override', 'contract_change'));

alter table billing_events add column claim_id uuid references claims(id) on delete set null;
update billing_events be set claim_id = cc.claim_id
  from claim_cycles cc where be.claim_cycle_id = cc.id;
create index idx_billing_events_claim on billing_events(claim_id);

-- Uma cobrança de abertura por sinistro, mesmo com vários ciclos
create unique index uq_billing_events_claim_open on billing_events(claim_id)
  where event_type = 'claim_open' and claim_id is not null;

-- 3. Storage medido por sinistro -----------------------------------------------------
alter table storage_usage add column claim_id uuid references claims(id) on delete cascade;
update storage_usage su set claim_id = cc.claim_id
  from claim_cycles cc where su.claim_cycle_id = cc.id;
create index idx_storage_usage_claim on storage_usage(claim_id);

-- 4. Planos iniciais (provisórios) ---------------------------------------------------
insert into plans (code, name, setup_fee, monthly_fee, claim_price) values
  ('standard',     'Standard',     750,  349, 92),
  ('professional', 'Professional', 1650, 649, 87),
  ('enterprise',   'Enterprise',   2300, 989, 81),
  ('custom',       'Custom',       0,    0,   0)
on conflict (code) do update
  set name = excluded.name,
      setup_fee = excluded.setup_fee,
      monthly_fee = excluded.monthly_fee,
      claim_price = excluded.claim_price;

-- 5. Limites de storage (hipótese): arquivo 10 MB; por sinistro 50/100/200 MB;
--    excedente cobrado por MB (R$ 0,10 provisório). Plano Custom: sob contrato.
insert into plan_limits (plan_id, limit_key, limit_value)
select p.id, l.limit_key, l.limit_value
from plans p
join (values
  ('standard',     'file_max_mb',                    10),
  ('professional', 'file_max_mb',                    10),
  ('enterprise',   'file_max_mb',                    10),
  ('standard',     'storage_per_claim_mb',           50),
  ('professional', 'storage_per_claim_mb',           100),
  ('enterprise',   'storage_per_claim_mb',           200),
  ('standard',     'storage_overage_price_per_mb',   0.10),
  ('professional', 'storage_overage_price_per_mb',   0.10),
  ('enterprise',   'storage_overage_price_per_mb',   0.10)
) as l(code, limit_key, limit_value) on l.code = p.code
on conflict (plan_id, limit_key) do update set limit_value = excluded.limit_value;
