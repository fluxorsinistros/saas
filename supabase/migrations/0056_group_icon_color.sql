-- 0056: ícone e cor de cada grupo (escolhidos de um catálogo fechado no app; aqui só guardamos a chave).
alter table public.groups
  add column if not exists icon text,
  add column if not exists color text;
