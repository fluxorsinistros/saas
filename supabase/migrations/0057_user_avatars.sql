-- 0057: foto opcional de cada pessoa. A foto é da PESSOA (vale em todas as empresas dela), fica em área privada do
-- Storage e só é vista por quem divide uma empresa com ela (links temporários gerados pelo app).
alter table public.user_profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 262144, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 262144, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

-- cada pessoa grava, troca e apaga só dentro da própria pasta (<id da pessoa>/arquivo)
drop policy if exists avatars_own_insert on storage.objects;
create policy avatars_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_own_update on storage.objects;
create policy avatars_own_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ler: a própria pessoa ou quem enxerga o perfil dela (a regra de user_profiles já limita a quem divide empresa)
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and exists (select 1 from public.user_profiles up where up.id::text = (storage.foldername(name))[1])
  );
