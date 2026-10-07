-- 0072: o lote de e-mails leva também o nome do subgrupo da etapa (aparece junto do grupo no e-mail).
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
      'group_name', (select g.name from groups g where g.id = nullif(n.payload ->> 'group_id', '')::uuid),
      'subgroup_name', (select s.name from group_subgroups s where s.id = nullif(n.payload ->> 'subgroup_id', '')::uuid))), '[]'::jsonb)
  into out
  from bumped b join notifications n on n.id = b.notification_id join tenants t on t.id = b.tenant_id;
  return out;
end $$;
