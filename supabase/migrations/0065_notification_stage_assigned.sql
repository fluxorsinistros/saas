-- 0065: aviso "etapa atribuída ao grupo" (stage.assigned) nas notificações por e-mail.
alter table notification_rules drop constraint if exists notification_rules_rule_key_check;
alter table notification_rules add constraint notification_rules_rule_key_check
  check (rule_key in ('claim_opened', 'stage_assigned', 'sla_at_risk', 'sla_breached', 'sla_digest', 'document_extra'));
alter table notification_preferences drop constraint if exists notification_preferences_rule_key_check;
alter table notification_preferences add constraint notification_preferences_rule_key_check
  check (rule_key in ('claim_opened', 'stage_assigned', 'sla_at_risk', 'sla_breached', 'sla_digest', 'document_extra'));

create or replace function private.notif_rule_key(p_event text) returns text
language sql immutable as $$
  select case
    when p_event = 'claim.opened' then 'claim_opened'
    when p_event = 'stage.assigned' then 'stage_assigned'
    when p_event = 'sla.at_risk' then 'sla_at_risk'
    when p_event = 'sla.breached' then 'sla_breached'
    when p_event = 'sla.digest' then 'sla_digest'
    when p_event like 'document_extra.%' then 'document_extra'
    else null end
$$;
