-- 0024: catálogo de permissões e papéis do sistema (Documento 1 §32, Documento 5 "ocultar ações sem
-- permissão"). `permissions`/`roles`/`role_permissions`/`membership_roles` existiam desde a migração
-- 0002 e nunca tinham sido povoadas — toda ação aparecia pra qualquer membro do tenant, sem checar
-- papel nenhum.

insert into permissions (code, description, category) values
  ('claim.formalize', 'Formalizar sinistro', 'sinistro'),
  ('claim.execute', 'Concluir atividade / registrar decisão', 'sinistro'),
  ('claim.reopen', 'Reabrir ciclo concluído', 'sinistro'),
  ('claim.discard', 'Descartar ciclo e reiniciar', 'sinistro'),
  ('document.validate', 'Validar ou rejeitar documento', 'documento'),
  ('workflow.edit', 'Editar rascunho de fluxo', 'fluxo'),
  ('workflow.publish', 'Publicar versão de fluxo', 'fluxo'),
  ('import.confirm', 'Confirmar lote de importação em massa', 'importacao'),
  ('user.manage', 'Gerenciar usuários e organizações do tenant', 'usuarios'),
  ('financial.manage', 'Lançar/editar movimentações financeiras do ciclo', 'financeiro')
on conflict (code) do nothing;

insert into roles (id, tenant_id, name, description, is_system) values
  ('00000000-0000-0000-0000-000000000001', null, 'Administrador', 'Acesso completo às ações do tenant.', true),
  ('00000000-0000-0000-0000-000000000002', null, 'Operador', 'Executa o processo do dia a dia — sem publicar fluxos, gerenciar usuários ou reabrir/descartar ciclos.', true)
on conflict (id) do nothing;

insert into role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000001', id from permissions
on conflict do nothing;

insert into role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000002', id from permissions
where code in ('claim.formalize', 'claim.execute', 'document.validate')
on conflict do nothing;

-- Backfill: nenhum membership tinha papel nenhum até aqui. Atribuir 'Operador' sem revisão quebraria
-- o acesso de quem já usa o produto (inclusive os 4 logins de teste) — o padrão seguro é dar
-- Administrador a todo mundo que já está ativo hoje, e quem administra o tenant rebaixa manualmente
-- quem precisar depois, pela tela de Usuários.
insert into membership_roles (membership_id, role_id)
select tm.id, '00000000-0000-0000-0000-000000000001'
from tenant_memberships tm
where tm.status = 'active'
  and not exists (select 1 from membership_roles mr where mr.membership_id = tm.id)
on conflict do nothing;

-- Daqui pra frente: quem cria o tenant vira Administrador; quem é adicionado depois entra como
-- Operador por padrão (privilégio mínimo) — a tela de Usuários promove quando fizer sentido.
create or replace function public.create_tenant(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_slug text;
  v_group text;
  v_membership uuid;
begin
  if v_user is null then
    raise exception 'Não autenticado';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome da empresa é obrigatório';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'))
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into tenants (name, slug) values (trim(p_name), v_slug) returning id into v_tenant;

  insert into user_profiles (id, full_name, email)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
  from auth.users u where u.id = v_user
  on conflict (id) do nothing;

  insert into tenant_memberships (tenant_id, user_id, status, joined_at)
  values (v_tenant, v_user, 'active', now())
  returning id into v_membership;
  insert into membership_roles (membership_id, role_id) values (v_membership, '00000000-0000-0000-0000-000000000001');

  foreach v_group in array array['Regulação','Operacional','Jurídico','Financeiro','Gestão de Risco','Seguros','Comitê'] loop
    insert into groups (tenant_id, name) values (v_tenant, v_group);
  end loop;

  perform app.write_audit(v_tenant, 'tenant.created', 'tenant', v_tenant, null, jsonb_build_object('name', p_name));
  return v_tenant;
end;
$$;

create or replace function public.add_tenant_member(p_tenant_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
  v_membership uuid;
begin
  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'Sem acesso a este tenant';
  end if;

  select id into v_target from auth.users where lower(email) = lower(trim(p_email));
  if v_target is null then
    raise exception 'Não existe conta com o e-mail %. Peça para a pessoa criar uma conta primeiro (tela de login → Criar conta) e adicione de novo.', p_email;
  end if;

  insert into user_profiles (id, full_name, email)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), u.email
  from auth.users u where u.id = v_target
  on conflict (id) do nothing;

  insert into tenant_memberships (tenant_id, user_id, status, joined_at)
  values (p_tenant_id, v_target, 'active', now())
  on conflict (tenant_id, user_id) do update set status = 'active'
  returning id into v_membership;

  insert into membership_roles (membership_id, role_id)
  values (v_membership, '00000000-0000-0000-0000-000000000002')
  on conflict do nothing;

  perform app.write_audit(p_tenant_id, 'member.added', 'tenant_membership', v_membership, null, jsonb_build_object('email', p_email));
  return v_membership;
end;
$$;

-- Trocar o papel de um membro (só quem já tem user.manage deveria chamar isto — checado na aplicação).
create or replace function public.set_membership_role(p_membership_id uuid, p_role_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from tenant_memberships where id = p_membership_id;
  if v_tenant is null or not app.is_tenant_member(v_tenant) then
    raise exception 'Sem acesso a este membro';
  end if;
  if not exists (select 1 from roles where id = p_role_id and (tenant_id is null or tenant_id = v_tenant)) then
    raise exception 'Papel inválido para este tenant';
  end if;

  delete from membership_roles where membership_id = p_membership_id;
  insert into membership_roles (membership_id, role_id) values (p_membership_id, p_role_id);
  perform app.write_audit(v_tenant, 'member.role_changed', 'tenant_membership', p_membership_id, null, jsonb_build_object('role_id', p_role_id));
end;
$$;
revoke all on function public.set_membership_role(uuid, uuid) from public, anon;
grant execute on function public.set_membership_role(uuid, uuid) to authenticated;
