-- 0071: o subgrupo vale também nos indicadores e nos e-mails.
--  * Indicadores (resumo e tendência): o Operador de um subgrupo vê só o que é do grupo dele para o subgrupo dele (ou sem subgrupo).
--    p_scope_subgroup liga essa regra; p_subgroup_id é o subgrupo da pessoa (nulo = ela não está em nenhum).
--  * E-mails: a etapa de um subgrupo avisa só as pessoas daquele subgrupo e o e-mail de contato dele.

drop function if exists public.operational_summary(uuid, uuid);
create or replace function public.operational_summary(p_tenant_id uuid, p_group_id uuid default null, p_subgroup_id uuid default null, p_scope_subgroup boolean default false)
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
            and (not p_scope_subgroup or ai.subgroup_id is null or ai.subgroup_id = p_subgroup_id)
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
    where p_group_id is null
       or (ai.group_id = p_group_id and (not p_scope_subgroup or ai.subgroup_id is null or ai.subgroup_id = p_subgroup_id))
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
            and (not p_scope_subgroup or ai.subgroup_id is null or ai.subgroup_id = p_subgroup_id)
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
revoke all on function public.operational_summary(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.operational_summary(uuid, uuid, uuid, boolean) to authenticated;

drop function if exists public.operational_trend(uuid, uuid, int);
create or replace function public.operational_trend(p_tenant_id uuid, p_group_id uuid default null, p_days int default 30, p_subgroup_id uuid default null, p_scope_subgroup boolean default false)
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
            and (not p_scope_subgroup or ai.subgroup_id is null or ai.subgroup_id = p_subgroup_id)
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
            and (not p_scope_subgroup or ai.subgroup_id is null or ai.subgroup_id = p_subgroup_id)
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
revoke all on function public.operational_trend(uuid, uuid, int, uuid, boolean) from public, anon;
grant execute on function public.operational_trend(uuid, uuid, int, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------- e-mails: eventos de SLA levam o subgrupo da etapa
create or replace function private.notif_detect() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  insert into notifications (tenant_id, event_type, claim_cycle_id, payload, dedupe_key)
  select t.tenant_id,
         case when now() >= t.target_at then 'sla.breached' else 'sla.at_risk' end,
         t.claim_cycle_id,
         jsonb_build_object(
           'claim_id', cy.claim_id, 'claim_number', c.claim_number,
           'stage_name', wn.name, 'group_id', ai.group_id, 'subgroup_id', ai.subgroup_id,
           'target_at', t.target_at, 'requested_by', cy.created_by),
         (case when now() >= t.target_at then 'sla.breached:' else 'sla.at_risk:' end) || t.id::text
  from sla_tracking t
  join claim_cycles cy on cy.id = t.claim_cycle_id
  join claims c on c.id = cy.claim_id
  left join workflow_slas ws on ws.id = t.workflow_sla_id
  left join stage_instances si on si.id = t.stage_instance_id
  left join workflow_nodes wn on wn.id = si.node_id
  left join lateral (select group_id, subgroup_id from activity_instances a where a.stage_instance_id = t.stage_instance_id order by a.created_at limit 1) ai on true
  join notification_rules r on r.tenant_id = t.tenant_id and r.enabled
       and r.rule_key = (case when now() >= t.target_at then 'sla_breached' else 'sla_at_risk' end)
  where t.status in ('on_track', 'at_risk', 'breached')
    and cy.status not in ('completed', 'cancelled', 'discarded')
    and (
      now() >= t.target_at
      or (t.target_at > t.started_at
          and (extract(epoch from (now() - t.started_at)) / extract(epoch from (t.target_at - t.started_at))) * 100
              >= coalesce((select min(x) from unnest(ws.alert_thresholds) x), 75))
    )
  on conflict do nothing;

  insert into notifications (tenant_id, event_type, payload, dedupe_key)
  select r.tenant_id, 'sla.digest',
         jsonb_build_object('items', coalesce((
           select jsonb_agg(jsonb_build_object('claim_id', cy.claim_id, 'claim_number', c.claim_number, 'target_at', t.target_at,
                                               'overdue', now() >= t.target_at) order by t.target_at)
           from sla_tracking t
           join claim_cycles cy on cy.id = t.claim_cycle_id
           join claims c on c.id = cy.claim_id
           where t.tenant_id = r.tenant_id and t.status in ('on_track', 'at_risk', 'breached')
             and cy.status not in ('completed', 'cancelled', 'discarded')
             and (now() >= t.target_at or t.target_at < now() + interval '24 hours')
         ), '[]'::jsonb)),
         'sla.digest:' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
  from notification_rules r
  where r.rule_key = 'sla_digest' and r.enabled
    and extract(hour from (now() at time zone 'America/Sao_Paulo')) >= r.digest_hour
  on conflict do nothing;
end $$;
revoke all on function private.notif_detect() from public, anon, authenticated;

-- ---------------------------------------------------------------- e-mails: quem recebe quando a etapa é de um subgrupo
create or replace function private.notif_prepare() returns void
language plpgsql security definer set search_path = public, private as $$
declare
  n record;
  r notification_rules%rowtype;
  rk text;
  gid uuid;
  sgid uuid;
  requester uuid;
  ev_group_ids uuid[];
  want_event_group boolean;
  want_requester boolean;
begin
  for n in select * from notifications where processed_at is null order by created_at limit 200 for update skip locked loop
    rk := private.notif_rule_key(n.event_type);
    select * into r from notification_rules where tenant_id = n.tenant_id and rule_key = rk and enabled;
    if rk is not null and found then
      gid := nullif(n.payload ->> 'group_id', '')::uuid;
      sgid := nullif(n.payload ->> 'subgroup_id', '')::uuid;
      requester := nullif(n.payload ->> 'requested_by', '')::uuid;
      want_event_group := r.to_event_group;
      want_requester := r.to_requester;
      if rk = 'document_extra' then
        want_event_group := n.event_type in ('document_extra.requested', 'document_extra.validated', 'document_extra.rejected');
        want_requester := n.event_type = 'document_extra.delivered' or r.to_requester;
      end if;
      ev_group_ids := r.to_groups || case when want_event_group and gid is not null then array[gid] else '{}'::uuid[] end;

      insert into notification_deliveries (tenant_id, notification_id, recipient_user_id, recipient_group_id, channel, status, recipient_email, rule_key)
      select n.tenant_id, n.id, x.user_id, null, 'email', 'pending', x.email, rk
      from (
        select u.id as user_id, u.email::text as email
        from tenant_memberships tm
        join auth.users u on u.id = tm.user_id
        where tm.tenant_id = n.tenant_id and tm.status = 'active' and u.email is not null
          and (
            (cardinality(ev_group_ids) > 0 and exists (
              select 1 from group_members gm
              where gm.membership_id = tm.id and gm.group_id = any(ev_group_ids)
                -- etapa de um subgrupo: dentro do grupo da etapa, só quem está nele
                and (sgid is null or gm.group_id is distinct from gid or gm.subgroup_id = sgid)))
            or (want_requester and requester is not null and tm.user_id = requester)
            or (r.to_admins and exists (
              select 1 from membership_roles mr join roles ro on ro.id = mr.role_id
              where mr.membership_id = tm.id and ro.name = 'Administrador'))
          )
          and coalesce((select p.email_enabled from notification_preferences p
                        where p.tenant_id = n.tenant_id and p.user_id = u.id and p.rule_key = rk), true)
      ) x;

      -- e-mails fixos da regra e o e-mail de contato do subgrupo da etapa (parte externa, sem conta ou sem preferência)
      insert into notification_deliveries (tenant_id, notification_id, channel, status, recipient_email, rule_key)
      select n.tenant_id, n.id, 'email', 'pending', lower(e), rk
      from (
        select unnest(r.extra_emails) as e
        union
        select gs.contact_email from group_subgroups gs
        where want_event_group and sgid is not null and gs.id = sgid and gs.contact_email is not null
      ) mails
      where not exists (select 1 from notification_deliveries d where d.notification_id = n.id and lower(d.recipient_email) = lower(mails.e));
    end if;
    update notifications set processed_at = now() where id = n.id;
  end loop;
end $$;
revoke all on function private.notif_prepare() from public, anon, authenticated;
