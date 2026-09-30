-- 0030: suspender / reativar conta de cliente (tenant).
-- tenants.status já existia ('active' | 'suspended' | 'archived') mas nada o aplicava. Agora:
--  1. motivo e data da suspensão ficam registrados;
--  2. só administrador de plataforma altera o status (um membro do tenant não pode se reativar);
--  3. app.is_tenant_member() passa a exigir tenant ativo — como todas as policies de RLS dependem dela,
--     uma conta suspensa perde acesso a TODOS os dados de uma vez, sem mexer tabela por tabela;
--  4. my_blocked_tenants() deixa o app saber que a conta foi suspensa (para mostrar a tela certa
--     em vez de mandar o usuário para o onboarding).
-- Os dados são preservados; reativar devolve o acesso.

alter table tenants
  add column suspended_at timestamptz,
  add column suspension_reason text;

create or replace function app.guard_tenant_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status
      or new.suspended_at is distinct from old.suspended_at
      or new.suspension_reason is distinct from old.suspension_reason)
     and auth.uid() is not null
     and not app.is_platform_admin() then
    raise exception 'Somente o administrador da plataforma altera o status da conta.';
  end if;
  return new;
end;
$$;

create trigger guard_tenant_status before update on tenants
  for each row execute function app.guard_tenant_status();

create policy platform_admin_update on tenants
  for update using (app.is_platform_admin()) with check (app.is_platform_admin());

create or replace function app.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from tenant_memberships tm
    join tenants t on t.id = tm.tenant_id
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and t.status = 'active'
  );
$$;

-- Contas do usuário que estão suspensas/arquivadas (RLS as esconderia, então precisa de security definer)
create or replace function public.my_blocked_tenants()
returns table (id uuid, name text, status text, suspension_reason text)
language sql
security definer
set search_path = public
stable
as $$
  select t.id, t.name, t.status, t.suspension_reason
  from tenants t
  join tenant_memberships tm on tm.tenant_id = t.id
  where tm.user_id = auth.uid()
    and tm.status = 'active'
    and t.status <> 'active';
$$;

revoke all on function public.my_blocked_tenants() from public;
grant execute on function public.my_blocked_tenants() to authenticated;
