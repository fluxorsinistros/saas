-- 0054: indicadores do Dashboard e da Torre calculados NO BANCO.
-- Antes o app baixava todos os ciclos, etapas, atividades e prazos da empresa e somava em memória: custava mais a cada
-- sinistro novo e, passando de 1000 linhas, o limite padrão da API cortava os dados em silêncio (contagens erradas).
-- Agora o banco devolve só o resumo (contagens + listas curtas), do tamanho de sempre, não importa quantos sinistros haja.
--   p_group_id nulo  -> empresa inteira (Administrador)
--   p_group_id dado  -> só ciclos em que o grupo atua/atuou e só prazos das etapas desse grupo (Operador)
-- security invoker: a segurança por linha (RLS) continua valendo — quem não é da empresa recebe zeros.

create or replace function public.operational_summary(p_tenant_id uuid, p_group_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select cy.id, cy.claim_id, cy.status, cy.formalized_at
    from claim_cycles cy
    where cy.tenant_id = p_tenant_id
      and (
        p_group_id is null
        or exists (
          select 1
          from stage_instances si
          join activity_instances ai on ai.stage_instance_id = si.id
          where si.claim_cycle_id = cy.id and ai.group_id = p_group_id
        )
      )
  ),
  status_counts as (
    select status, count(*) as n from scoped group by status
  ),
  by_category as (
    select cat.id, cat.name, count(*) as n
    from scoped s
    join claims c on c.id = s.claim_id
    join claim_categories cat on cat.id = c.claim_category_id
    group by cat.id, cat.name
    order by count(*) desc
    limit 10
  ),
  backlog as (
    select g.id, g.name, count(*) as n
    from scoped s
    join stage_instances si on si.claim_cycle_id = s.id
    join activity_instances ai on ai.stage_instance_id = si.id and ai.status in ('not_started', 'in_progress')
    join groups g on g.id = ai.group_id
    where p_group_id is null or ai.group_id = p_group_id
    group by g.id, g.name
    order by count(*) desc
    limit 20
  ),
  blocked as (
    select s.id as cycle_id, s.claim_id, c.claim_number,
           (select a.reason from audit_logs a where a.entity_id = s.id and a.action = 'cycle.blocked' order by a.created_at desc limit 1) as reason,
           (select a.created_at from audit_logs a where a.entity_id = s.id and a.action = 'cycle.blocked' order by a.created_at desc limit 1) as blocked_at
    from scoped s
    join claims c on c.id = s.claim_id
    where s.status = 'blocked'
  ),
  aging as (
    select s.id as cycle_id, s.claim_id, c.claim_number, s.status, s.formalized_at,
           floor(extract(epoch from (now() - s.formalized_at)) / 86400)::int as days
    from scoped s
    join claims c on c.id = s.claim_id
    where s.status in ('draft', 'open', 'in_progress', 'waiting') and s.formalized_at is not null
    order by s.formalized_at asc
    limit 8
  ),
  tracking as (
    select t.claim_cycle_id as cycle_id, t.started_at, t.target_at,
           coalesce((select min(x) from unnest(ws.alert_thresholds) x), 75) as first_threshold
    from sla_tracking t
    join scoped s on s.id = t.claim_cycle_id
    left join workflow_slas ws on ws.id = t.workflow_sla_id
    where t.status in ('on_track', 'at_risk')
      and (
        p_group_id is null
        or exists (
          select 1 from activity_instances ai
          where ai.stage_instance_id = t.stage_instance_id and ai.group_id = p_group_id
        )
      )
  ),
  overdue as (
    select cycle_id, max(round(extract(epoch from (now() - target_at)) / 60))::int as minutes
    from tracking
    where now() >= target_at
    group by cycle_id
  ),
  at_risk as (
    select cycle_id, (round(extract(epoch from (target_at - now())) / 60))::int * -1 as minutes
    from tracking
    where now() < target_at
      and target_at > started_at
      and (extract(epoch from (now() - started_at)) / extract(epoch from (target_at - started_at))) * 100 >= first_threshold
      and cycle_id not in (select cycle_id from overdue)
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped),
    'status_counts', coalesce((select jsonb_object_agg(status, n) from status_counts), '{}'::jsonb),
    'by_category', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n)) from by_category), '[]'::jsonb),
    'backlog', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'count', n)) from backlog), '[]'::jsonb),
    'blocked_count', (select count(*) from blocked),
    'blocked', coalesce((select jsonb_agg(to_jsonb(b)) from (select * from blocked order by blocked_at desc nulls last limit 8) b), '[]'::jsonb),
    'aging', coalesce((select jsonb_agg(to_jsonb(a)) from aging a), '[]'::jsonb),
    'sla_overdue_count', (select count(*) from overdue),
    'sla_overdue', coalesce((select jsonb_agg(jsonb_build_object('cycle_id', o.cycle_id, 'claim_id', s.claim_id, 'claim_number', c.claim_number, 'minutes', o.minutes))
                              from (select * from overdue order by minutes desc limit 8) o
                              join scoped s on s.id = o.cycle_id join claims c on c.id = s.claim_id), '[]'::jsonb),
    'sla_at_risk_count', (select count(*) from at_risk),
    'sla_at_risk', coalesce((select jsonb_agg(jsonb_build_object('cycle_id', r.cycle_id, 'claim_id', s.claim_id, 'claim_number', c.claim_number, 'minutes', r.minutes))
                              from (select * from at_risk order by minutes desc limit 8) r
                              join scoped s on s.id = r.cycle_id join claims c on c.id = s.claim_id), '[]'::jsonb)
  );
$$;

revoke all on function public.operational_summary(uuid, uuid) from public, anon;
grant execute on function public.operational_summary(uuid, uuid) to authenticated;
