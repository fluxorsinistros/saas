-- 0031: marca da plataforma (nome + logo configuráveis) e white-label por contrato.
--  1. platform_settings: uma única linha com nome, subtítulo e logo do produto (o nome comercial ainda
--     está em definição — não deve ser constante no código);
--  2. tenant_contracts: white_label_enabled + white_label_surcharge_pct. O white-label é liberado por
--     cliente, independente do plano, com acréscimo percentual sobre a mensalidade;
--  3. bucket público "branding" para os logos; só administrador de plataforma grava;
--  4. tenant_contracts deixa de aceitar escrita de membro do tenant (antes a policy "tenant_isolation"
--     era ALL, então um membro poderia trocar o próprio plano ou ligar o white-label pela API).

create table platform_settings (
  id boolean primary key default true check (id), -- singleton
  product_name text not null default 'Gerenciador de Sinistros',
  tagline text not null default 'Workflow de sinistros',
  logo_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create trigger set_updated_at before update on platform_settings
  for each row execute function app.set_updated_at();
insert into platform_settings (id) values (true);

alter table platform_settings enable row level security;
-- nome e logo aparecem até na tela de login, então a leitura é pública
create policy read_all on platform_settings for select using (true);
create policy platform_admin_write on platform_settings
  for all using (app.is_platform_admin()) with check (app.is_platform_admin());

alter table tenant_contracts
  add column white_label_enabled boolean not null default false,
  add column white_label_surcharge_pct numeric(5,2) not null default 0 check (white_label_surcharge_pct >= 0);

drop policy if exists tenant_isolation on tenant_contracts;
create policy tenant_read on tenant_contracts
  for select using (app.is_tenant_member(tenant_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy branding_admin_select on storage.objects
  for select to authenticated using (bucket_id = 'branding' and app.is_platform_admin());
create policy branding_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'branding' and app.is_platform_admin());
create policy branding_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'branding' and app.is_platform_admin());
create policy branding_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'branding' and app.is_platform_admin());
