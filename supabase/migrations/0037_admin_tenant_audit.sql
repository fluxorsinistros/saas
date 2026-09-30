-- 0037: aba "Histórico" da conta no painel do administrador da plataforma.
-- As ações do administrador (suspender, trocar plano, white-label...) são gravadas com tenant_id nulo
-- (eventos de plataforma) apontando a conta ou o contrato como entidade; as ações dentro da empresa
-- levam o tenant_id. Esta função junta os dois tipos para uma conta.

create or replace function public.admin_tenant_audit(p_tenant_id uuid, p_limit integer default 100)
returns table (
  id uuid, created_at timestamptz, action text, actor_email text, entity_type text, new_value jsonb, reason text
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.created_at, a.action, up.email, a.entity_type, a.new_value, a.reason
  from audit_logs a
  left join user_profiles up on up.id = a.actor_id
  where app.is_platform_admin()
    and (
      a.tenant_id = p_tenant_id
      or a.entity_id = p_tenant_id
      or a.entity_id in (select c.id from tenant_contracts c where c.tenant_id = p_tenant_id)
    )
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 500);
$$;
revoke all on function public.admin_tenant_audit(uuid, integer) from public, anon;
grant execute on function public.admin_tenant_audit(uuid, integer) to authenticated;
