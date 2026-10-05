-- 0051: um Operador pode pertencer a vários grupos (atua em um por vez — grupo ativo escolhido no menu).
-- Substitui a regra da 0040 (um grupo por usuário). Administrador continua sem grupo.
--  * remove o índice único de um grupo por pessoa;
--  * set_member_groups troca, de uma vez, a lista de grupos de um membro (Administrador da conta ou Gestor
--    da plataforma). As funções de salvar usuário continuam gravando o primeiro grupo; o app chama esta depois
--    para gravar a lista completa.

drop index if exists public.uq_group_members_one_group;

create or replace function public.set_member_groups(p_membership_id uuid, p_group_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_is_operator boolean;
begin
  select tenant_id, user_id into v_tenant, v_user from tenant_memberships where id = p_membership_id;
  if v_tenant is null then
    raise exception 'Usuário não encontrado';
  end if;
  if not (app.is_platform_admin() or app.is_tenant_admin(v_tenant)) then
    raise exception 'Somente um Administrador da conta altera os grupos dos usuários';
  end if;
  if v_user = auth.uid() and not app.is_platform_admin() then
    raise exception 'Você não pode alterar o seu próprio acesso. Peça a outro Administrador.';
  end if;

  select exists (
    select 1 from membership_roles mr join roles r on r.id = mr.role_id
    where mr.membership_id = p_membership_id and r.name = 'Operador'
  ) into v_is_operator;

  delete from group_members where membership_id = p_membership_id;
  if v_is_operator then
    insert into group_members (membership_id, group_id)
    select distinct p_membership_id, g.id from groups g
    where g.tenant_id = v_tenant and g.id = any (coalesce(p_group_ids, '{}'::uuid[]));
  end if;

  if app.is_platform_admin() then
    perform app.write_audit_platform(v_tenant, 'member.groups_changed_by_platform', 'tenant_membership', p_membership_id,
      jsonb_build_object('groups', coalesce(cardinality(p_group_ids), 0)));
  else
    perform app.write_audit(v_tenant, 'member.groups_changed', 'tenant_membership', p_membership_id, null,
      jsonb_build_object('groups', coalesce(cardinality(p_group_ids), 0)));
  end if;
end;
$$;
revoke all on function public.set_member_groups(uuid, uuid[]) from public, anon;
grant execute on function public.set_member_groups(uuid, uuid[]) to authenticated;
