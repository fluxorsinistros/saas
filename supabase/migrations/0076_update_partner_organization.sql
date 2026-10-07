-- 0076: editar o nome (e o papel) de uma organização da empresa. A organização dona só muda de nome.

create or replace function public.update_partner_organization(p_tenant_id uuid, p_organization_id uuid, p_name text, p_role_kind text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner boolean;
begin
  if not app.is_tenant_admin(p_tenant_id) then
    raise exception 'Somente um Administrador da conta edita organizações';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome da organização é obrigatório';
  end if;
  select is_owner into v_owner from tenant_organizations where tenant_id = p_tenant_id and organization_id = p_organization_id;
  if not found then
    raise exception 'Organização não encontrada nesta empresa';
  end if;

  update organizations set name = trim(p_name) where id = p_organization_id;
  if not v_owner and p_role_kind is not null then
    update tenant_organizations set role_kind = p_role_kind where tenant_id = p_tenant_id and organization_id = p_organization_id;
  end if;

  perform app.write_audit(p_tenant_id, 'organization.updated', 'organization', p_organization_id, null,
    jsonb_build_object('name', trim(p_name), 'role_kind', p_role_kind));
end;
$$;

revoke all on function public.update_partner_organization(uuid, uuid, text, text) from public, anon;
grant execute on function public.update_partner_organization(uuid, uuid, text, text) to authenticated;
