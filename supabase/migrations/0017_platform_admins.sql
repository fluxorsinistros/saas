-- 0017: administradores de plataforma (Documento 5 §11) — gerenciam planos/limites/contratos,
-- entidade global, fora de qualquer tenant. Peça que nunca tinha sido construída.

create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now()
);

create or replace function app.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
revoke all on function app.is_platform_admin() from public;
grant execute on function app.is_platform_admin() to authenticated;

alter table platform_admins enable row level security;
create policy self_or_admin_read on platform_admins
  for select using (user_id = auth.uid() or app.is_platform_admin());
-- Sem policy de insert/update/delete para "authenticated": conceder/revogar admin passa por service role
-- (ação sensível demais para self-service, igual a criação do primeiro admin).

-- Escrita em plans/plan_limits/tenant_contracts era liberada só a leitura; agora administrador de
-- plataforma também pode gerenciar o catálogo comercial global.
create policy platform_admin_write on plans
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy platform_admin_write on plan_limits
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- tenant_contracts hoje só permite ao próprio tenant ver/gerenciar seu contrato; administrador de
-- plataforma precisa enxergar e atribuir contratos de qualquer tenant (é quem vende o plano).
create policy platform_admin_all on tenant_contracts
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Leitura de todos os tenants (para a tela de administração listar quem são os clientes).
create policy platform_admin_read on tenants
  for select using (app.is_platform_admin());

-- Conceder o primeiro administrador de plataforma.
insert into platform_admins (user_id)
select id from auth.users where email = 'fluxor.sinistros@gmail.com'
on conflict (user_id) do nothing;
