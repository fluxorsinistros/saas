-- 0073: consultas que precisam olhar TODOS os sinistros da empresa (numeração, duplicidade, campo único), feitas por funções do banco.
-- Hoje o app faz isso lendo a tabela de sinistros direto. Quando o Operador passar a ver só os sinistros em que está envolvido
-- (migração seguinte), essas leituras diretas ficariam incompletas: número repetido, duplicidade não detectada. Estas funções
-- confirmam que a pessoa é da empresa e devolvem só o necessário (um número, um sim ou não, os candidatos a duplicidade).

create or replace function public.next_claim_number(p_tenant_id uuid, p_year int, p_attempt int default 0)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_last int;
begin
  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  select coalesce(max((substring(claim_number from '-([0-9]+)$'))::int), 0) into v_last
  from claims
  where tenant_id = p_tenant_id and claim_number like p_year::text || '-%';
  return p_year::text || '-' || lpad((v_last + 1 + greatest(coalesce(p_attempt, 0), 0))::text, 5, '0');
end;
$$;

create or replace function public.claim_field_value_in_use(p_tenant_id uuid, p_key text, p_value text, p_exclude_claim uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  return exists (
    select 1 from claims
    where tenant_id = p_tenant_id and custom_fields ->> p_key = p_value
      and (p_exclude_claim is null or id <> p_exclude_claim)
  );
end;
$$;

create or replace function public.claim_number_by_external_reference(p_tenant_id uuid, p_reference text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_number text;
begin
  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  select claim_number into v_number from claims where tenant_id = p_tenant_id and external_reference = p_reference limit 1;
  return v_number;
end;
$$;

create or replace function public.find_duplicate_claim_candidates(
  p_tenant_id uuid, p_claim_id uuid, p_category_id uuid, p_external_reference text default null, p_day date default null
)
returns table (candidate_claim_id uuid, kind text, location jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'Sem acesso a esta empresa';
  end if;
  return query
    select c.id, 'external_reference'::text, null::jsonb
    from claims c
    where p_external_reference is not null and p_external_reference <> ''
      and c.tenant_id = p_tenant_id and c.external_reference = p_external_reference and c.id <> p_claim_id
    union all
    select c.id, 'same_day'::text, c.location
    from claims c
    where p_day is not null
      and c.tenant_id = p_tenant_id and c.claim_category_id = p_category_id and c.id <> p_claim_id
      and c.occurred_at >= p_day::timestamptz and c.occurred_at < (p_day + 1)::timestamptz;
end;
$$;

revoke all on function public.next_claim_number(uuid, int, int) from public, anon;
revoke all on function public.claim_field_value_in_use(uuid, text, text, uuid) from public, anon;
revoke all on function public.claim_number_by_external_reference(uuid, text) from public, anon;
revoke all on function public.find_duplicate_claim_candidates(uuid, uuid, uuid, text, date) from public, anon;
grant execute on function public.next_claim_number(uuid, int, int) to authenticated;
grant execute on function public.claim_field_value_in_use(uuid, text, text, uuid) to authenticated;
grant execute on function public.claim_number_by_external_reference(uuid, text) to authenticated;
grant execute on function public.find_duplicate_claim_candidates(uuid, uuid, uuid, text, date) to authenticated;
