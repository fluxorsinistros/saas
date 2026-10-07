-- 0062: linhas de tendência dos cards do Dashboard, por data de abertura (formalização) do sinistro.
-- Para cada um dos últimos p_days dias devolve quantos sinistros abertos NAQUELE dia estão hoje em cada situação
-- (mesmas regras de operational_summary: mesmo escopo de grupo, mesmos critérios de atraso e de risco).
-- security invoker: a segurança por linha (RLS) continua valendo.

create or replace function public.operational_trend(p_tenant_id uuid, p_group_id uuid default null, p_days int default 30)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series(current_date - (greatest(least(p_days, 90), 7) - 1), current_date, interval '1 day') d
  ),
  scoped as (
    select cy.id, cy.status, cy.formalized_at::date as day
    from claim_cycles cy
    where cy.tenant_id = p_tenant_id
      and cy.formalized_at is not null
      and cy.formalized_at::date >= current_date - (greatest(least(p_days, 90), 7) - 1)
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
    select distinct cycle_id from tracking where now() >= target_at
  ),
  at_risk as (
    select distinct cycle_id
    from tracking
    where now() < target_at
      and target_at > started_at
      and (extract(epoch from (now() - started_at)) / extract(epoch from (target_at - started_at))) * 100 >= first_threshold
      and cycle_id not in (select cycle_id from overdue)
  ),
  per_day as (
    select d.day,
      count(s.id) as total,
      count(s.id) filter (where s.status in ('open', 'in_progress', 'waiting')) as open_n,
      count(s.id) filter (where s.status = 'blocked') as blocked_n,
      count(s.id) filter (where s.status = 'completed') as completed_n,
      count(s.id) filter (where s.id in (select cycle_id from overdue)) as overdue_n,
      count(s.id) filter (where s.id in (select cycle_id from at_risk)) as at_risk_n
    from days d
    left join scoped s on s.day = d.day
    group by d.day
  )
  select jsonb_build_object(
    'days', coalesce((select jsonb_agg(day order by day) from per_day), '[]'::jsonb),
    'total', coalesce((select jsonb_agg(total order by day) from per_day), '[]'::jsonb),
    'open', coalesce((select jsonb_agg(open_n order by day) from per_day), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(blocked_n order by day) from per_day), '[]'::jsonb),
    'completed', coalesce((select jsonb_agg(completed_n order by day) from per_day), '[]'::jsonb),
    'overdue', coalesce((select jsonb_agg(overdue_n order by day) from per_day), '[]'::jsonb),
    'at_risk', coalesce((select jsonb_agg(at_risk_n order by day) from per_day), '[]'::jsonb)
  );
$$;

revoke all on function public.operational_trend(uuid, uuid, int) from public, anon;
grant execute on function public.operational_trend(uuid, uuid, int) to authenticated;
