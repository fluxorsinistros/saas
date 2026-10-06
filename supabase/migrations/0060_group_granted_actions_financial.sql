-- 0060: permissões extras que o grupo concede aos seus membros Operador (financial.manage e financial.configure) e a função
-- que grava o painel financeiro do fluxo. Ver a migração aplicada "group_granted_actions_financial".
alter table public.groups
  add column if not exists granted_actions text[] not null default '{}'
  check (granted_actions <@ array['financial.manage','financial.configure']::text[]);

create or replace function public.save_financial_panel(p_workflow_id uuid, p_panel jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_ok boolean;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  select tenant_id into v_tenant from workflows where id = p_workflow_id;
  if v_tenant is null then
    raise exception 'Fluxo não encontrado';
  end if;
  if p_panel is null or jsonb_typeof(p_panel) <> 'array' or jsonb_array_length(p_panel) > 20 then
    raise exception 'Painel inválido';
  end if;
  v_ok := app.is_tenant_admin(v_tenant) or exists (
    select 1
    from group_members gm
    join tenant_memberships tm on tm.id = gm.membership_id
    join groups g on g.id = gm.group_id
    where tm.user_id = v_user and tm.tenant_id = v_tenant and tm.status = 'active'
      and g.tenant_id = v_tenant and g.status = 'active'
      and 'financial.configure' = any (g.granted_actions)
  );
  if not v_ok then
    raise exception 'Sem permissão para configurar o painel financeiro';
  end if;
  update workflows set financial_panel = p_panel where id = p_workflow_id;
end;
$$;

revoke all on function public.save_financial_panel(uuid, jsonb) from public;
grant execute on function public.save_financial_panel(uuid, jsonb) to authenticated;
