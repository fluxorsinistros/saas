-- 0019: gestão de usuários e organizações (Documento 5 §8).
-- Duas lacunas reais resolvidas aqui:
--   1. "organizations" só tinha policy de leitura — nunca existiu como criar uma organização parceira.
--   2. Não existe convite por e-mail para quem ainda não tem conta (isso pede envio de e-mail
--      transacional e chave de serviço, que não fazem parte desta fatia — ver Documento 6, fora
--      de escopo agora). O que dá para fazer honestamente: adicionar ao tenant quem JÁ tem conta.

-- Adiciona ao tenant um usuário que já possui conta (login) com o e-mail informado.
-- Se não existir conta com esse e-mail, erro explícito orientando a pessoa a se cadastrar primeiro.
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

  perform app.write_audit(p_tenant_id, 'member.added', 'tenant_membership', v_membership, null, jsonb_build_object('email', p_email));
  return v_membership;
end;
$$;
revoke all on function public.add_tenant_member(uuid, text) from public, anon;
grant execute on function public.add_tenant_member(uuid, text) to authenticated;

-- Cria a organização parceira e já a vincula ao tenant com o papel escolhido (§3.2, §6).
-- security definer porque "organizations" nunca teve policy de insert (só existia leitura).
create or replace function public.create_partner_organization(p_tenant_id uuid, p_name text, p_role_kind text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not app.is_tenant_member(p_tenant_id) then
    raise exception 'Sem acesso a este tenant';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome da organização é obrigatório';
  end if;

  insert into organizations (name) values (trim(p_name)) returning id into v_org;
  insert into tenant_organizations (tenant_id, organization_id, role_kind) values (p_tenant_id, v_org, p_role_kind);

  perform app.write_audit(p_tenant_id, 'organization.created', 'organization', v_org, null, jsonb_build_object('name', p_name, 'role_kind', p_role_kind));
  return v_org;
end;
$$;
revoke all on function public.create_partner_organization(uuid, text, text) from public, anon;
grant execute on function public.create_partner_organization(uuid, text, text) to authenticated;
