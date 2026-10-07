-- 0063: notificações por e-mail (abertura de sinistro, SLA em risco, SLA estourado, resumo diário, documento extra).
-- Regras por empresa (Administrador), preferência por pessoa, fila de entregas e a rotina que prepara tudo no banco.
-- O envio em si (Resend) é feito pela rota /api/notificacoes/processar, que só fala com o banco por funções protegidas
-- por um segredo compartilhado; o app não precisa da chave de serviço do Supabase.

-- ---------------------------------------------------------------- tabelas
create table notification_rules (
  tenant_id uuid not null references tenants(id) on delete cascade,
  rule_key text not null check (rule_key in ('claim_opened', 'sla_at_risk', 'sla_breached', 'sla_digest', 'document_extra')),
  enabled boolean not null default false,
  to_event_group boolean not null default true,   -- grupo ligado ao fato (1ª etapa, etapa do prazo, grupo do documento)
  to_requester boolean not null default false,    -- quem formalizou o sinistro / quem pediu o documento
  to_admins boolean not null default false,
  to_groups uuid[] not null default '{}',
  extra_emails text[] not null default '{}',
  digest_hour int not null default 8 check (digest_hour between 0 and 23),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, rule_key)
);

create table notification_preferences (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_key text not null check (rule_key in ('claim_opened', 'sla_at_risk', 'sla_breached', 'sla_digest', 'document_extra')),
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, rule_key)
);

alter table notifications add column dedupe_key text;
alter table notifications add column processed_at timestamptz;
create unique index uq_notifications_dedupe on notifications(tenant_id, dedupe_key) where dedupe_key is not null;
create index idx_notifications_unprocessed on notifications(created_at) where processed_at is null;

alter table notification_deliveries add column recipient_email text;
alter table notification_deliveries add column rule_key text;
alter table notification_deliveries add column error text;
alter table notification_deliveries add column attempts int not null default 0;
create index idx_notification_deliveries_pending on notification_deliveries(created_at) where status = 'pending' and channel = 'email';

-- ---------------------------------------------------------------- RLS
alter table notification_rules enable row level security;
create policy member_read on notification_rules for select using (app.is_tenant_member(tenant_id));
create policy admin_write on notification_rules for all
  using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

alter table notification_preferences enable row level security;
create policy own_rows on notification_preferences for all
  using (user_id = auth.uid() and app.is_tenant_member(tenant_id))
  with check (user_id = auth.uid() and app.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------- segredo
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.notif_config (id int primary key default 1 check (id = 1), secret text not null);
insert into private.notif_config (secret) values (encode(gen_random_bytes(32), 'hex'));
revoke all on private.notif_config from public, anon, authenticated;

create or replace function private.notif_check(p_secret text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if p_secret is null or not exists (select 1 from private.notif_config where secret = p_secret) then
    raise exception 'acesso negado';
  end if;
end $$;
revoke all on function private.notif_check(text) from public, anon, authenticated;

create or replace function private.notif_rule_key(p_event text) returns text
language sql immutable as $$
  select case
    when p_event = 'claim.opened' then 'claim_opened'
    when p_event = 'sla.at_risk' then 'sla_at_risk'
    when p_event = 'sla.breached' then 'sla_breached'
    when p_event = 'sla.digest' then 'sla_digest'
    when p_event like 'document_extra.%' then 'document_extra'
    else null end
$$;

-- ---------------------------------------------------------------- detecção de SLA e resumo diário
create or replace function private.notif_detect() returns void
language plpgsql security definer set search_path = public, private as $$
begin
  -- SLA em risco e estourado: um evento por controle de prazo (dedupe_key), só se a empresa ligou a regra.
  insert into notifications (tenant_id, event_type, claim_cycle_id, payload, dedupe_key)
  select t.tenant_id,
         case when now() >= t.target_at then 'sla.breached' else 'sla.at_risk' end,
         t.claim_cycle_id,
         jsonb_build_object(
           'claim_id', cy.claim_id, 'claim_number', c.claim_number,
           'stage_name', wn.name, 'group_id', ai.group_id,
           'target_at', t.target_at, 'requested_by', cy.created_by),
         (case when now() >= t.target_at then 'sla.breached:' else 'sla.at_risk:' end) || t.id::text
  from sla_tracking t
  join claim_cycles cy on cy.id = t.claim_cycle_id
  join claims c on c.id = cy.claim_id
  left join workflow_slas ws on ws.id = t.workflow_sla_id
  left join stage_instances si on si.id = t.stage_instance_id
  left join workflow_nodes wn on wn.id = si.node_id
  left join lateral (select group_id from activity_instances a where a.stage_instance_id = t.stage_instance_id order by a.created_at limit 1) ai on true
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

  -- Resumo diário: uma vez por dia (horário de Brasília), na hora escolhida pela empresa.
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

-- ---------------------------------------------------------------- eventos viram entregas (uma por pessoa)
create or replace function private.notif_prepare() returns void
language plpgsql security definer set search_path = public, private as $$
declare
  n record;
  r notification_rules%rowtype;
  rk text;
  gid uuid;
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
      requester := nullif(n.payload ->> 'requested_by', '')::uuid;
      want_event_group := r.to_event_group;
      want_requester := r.to_requester;
      if rk = 'document_extra' then
        -- pedido e decisão vão para o grupo que entrega; a entrega vai para quem pediu
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
              select 1 from group_members gm where gm.membership_id = tm.id and gm.group_id = any(ev_group_ids)))
            or (want_requester and requester is not null and tm.user_id = requester)
            or (r.to_admins and exists (
              select 1 from membership_roles mr join roles ro on ro.id = mr.role_id
              where mr.membership_id = tm.id and ro.name = 'Administrador'))
          )
          and coalesce((select p.email_enabled from notification_preferences p
                        where p.tenant_id = n.tenant_id and p.user_id = u.id and p.rule_key = rk), true)
      ) x;

      -- e-mails fixos escolhidos pelo Administrador (sem conta, sem preferência individual)
      insert into notification_deliveries (tenant_id, notification_id, channel, status, recipient_email, rule_key)
      select n.tenant_id, n.id, 'email', 'pending', lower(e), rk
      from unnest(r.extra_emails) e
      where not exists (select 1 from notification_deliveries d where d.notification_id = n.id and lower(d.recipient_email) = lower(e));
    end if;
    update notifications set processed_at = now() where id = n.id;
  end loop;
end $$;
revoke all on function private.notif_prepare() from public, anon, authenticated;

-- ---------------------------------------------------------------- funções chamadas pela rota de envio (exigem o segredo)
create or replace function public.notif_tick(p_secret text) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.notif_check(p_secret);
  perform private.notif_detect();
  perform private.notif_prepare();
end $$;

create or replace function public.notif_next_batch(p_secret text, p_limit int default 20) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare out jsonb;
begin
  perform private.notif_check(p_secret);
  with picked as (
    select d.id from notification_deliveries d
    where d.status = 'pending' and d.channel = 'email' and d.attempts < 3
    order by d.created_at limit greatest(least(p_limit, 50), 1) for update skip locked
  ), bumped as (
    update notification_deliveries d set attempts = d.attempts + 1 from picked where d.id = picked.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'email', b.recipient_email, 'rule_key', b.rule_key, 'event_type', n.event_type,
      'payload', n.payload, 'tenant_name', t.name,
      'group_name', (select g.name from groups g where g.id = nullif(n.payload ->> 'group_id', '')::uuid))), '[]'::jsonb)
  into out
  from bumped b join notifications n on n.id = b.notification_id join tenants t on t.id = b.tenant_id;
  return out;
end $$;

create or replace function public.notif_mark(p_secret text, p_id uuid, p_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  perform private.notif_check(p_secret);
  update notification_deliveries
     set status = case when p_ok then 'sent' when attempts >= 3 then 'failed' else 'pending' end,
         sent_at = case when p_ok then now() else sent_at end,
         error = case when p_ok then null else left(coalesce(p_error, 'erro'), 300) end
   where id = p_id;
end $$;

revoke all on function public.notif_tick(text), public.notif_next_batch(text, int), public.notif_mark(text, uuid, boolean, text) from public;
grant execute on function public.notif_tick(text), public.notif_next_batch(text, int), public.notif_mark(text, uuid, boolean, text) to anon, authenticated;
