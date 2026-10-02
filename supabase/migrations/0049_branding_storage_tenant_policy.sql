-- 0049: Permite que administradores e membros do tenant gerenciem ícones e logos
-- no bucket público 'branding' dentro da pasta tenants/<tenant_id>/*

drop policy if exists branding_tenant_insert on storage.objects;
create policy branding_tenant_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = 'tenants'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and app.is_tenant_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists branding_tenant_update on storage.objects;
create policy branding_tenant_update on storage.objects
for update to authenticated using (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = 'tenants'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and app.is_tenant_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists branding_tenant_delete on storage.objects;
create policy branding_tenant_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'branding'
  and (storage.foldername(name))[1] = 'tenants'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and app.is_tenant_member(((storage.foldername(name))[2])::uuid)
);

drop policy if exists branding_public_read on storage.objects;
create policy branding_public_read on storage.objects
for select using (bucket_id = 'branding');
