-- 0046 (ajustado: só o Gestor define senhas; o Administrador só envia link por e-mail): cadastrar usuário já com senha, sem depender de e-mail (e sem a chave de serviço no servidor).
--  * create_user_with_password: SÓ o Gestor cria a conta de login (e-mail confirmado, senha
--    definida) e já a adiciona à empresa com tipo/grupo. Se o e-mail já tem conta:
--      - conta ainda não usada, só com convite pendente desta empresa → a senha é definida (caso do convite que
--        nunca chegou a funcionar);
--      - conta de quem já participa de outras empresas → a senha NÃO é alterada, só entra na empresa.
--  * admin_set_user_password: o Gestor define a senha de qualquer usuário que não seja outro Gestor.

create or replace function app.insert_login_user(p_email text, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id,
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true),
          'email', v_id::text, now(), now(), now());
  return v_id;
end;
$$;
revoke all on function app.insert_login_user(text, text) from public, anon, authenticated;

create or replace function public.create_user_with_password(
  p_tenant_id uuid, p_email text, p_password text, p_role_id uuid, p_group_id uuid,
  p_full_name text default null, p_phone text default null, p_cpf text default null
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user uuid;
  v_result text := 'created';
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o Gestor da plataforma define senhas';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres';
  end if;

  select id into v_user from auth.users where lower(email) = v_email;

  if v_user is null then
    perform app.insert_login_user(v_email, p_password);
  else
    if exists (select 1 from platform_admins where user_id = v_user) then
      raise exception 'Este e-mail não pode ser adicionado a uma empresa.';
    end if;
    if not exists (select 1 from tenant_memberships where user_id = v_user)
       and exists (select 1 from tenant_invites where tenant_id = p_tenant_id and lower(email) = v_email and accepted_at is null) then
      -- conta criada por um convite que nunca foi concluído: a senha passa a ser a informada agora
      update auth.users
      set encrypted_password = crypt(p_password, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = v_user;
      v_result := 'password_reset';
    else
      v_result := 'added_keep_password';
    end if;
  end if;

  perform public.admin_add_person(p_tenant_id, v_email, p_role_id, p_group_id, p_full_name, p_phone, p_cpf);
  update tenant_invites set accepted_at = now()
  where tenant_id = p_tenant_id and lower(email) = v_email and accepted_at is null;
  return v_result;
end;
$$;
revoke all on function public.create_user_with_password(uuid, text, text, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_user_with_password(uuid, text, text, uuid, uuid, text, text, text) to authenticated;

create or replace function public.admin_set_user_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Somente o Gestor da plataforma define senhas';
  end if;
  if exists (select 1 from platform_admins where user_id = p_user_id) and p_user_id <> auth.uid() then
    raise exception 'Esta tela não altera a senha de outro Gestor da plataforma.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'A senha precisa ter pelo menos 8 caracteres';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user_id;
  if not found then raise exception 'Usuário não encontrado'; end if;
end;
$$;
revoke all on function public.admin_set_user_password(uuid, text) from public, anon;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;
