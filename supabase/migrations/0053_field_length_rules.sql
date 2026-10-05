-- 0053: tamanho mínimo/máximo de caracteres por campo personalizado (ex.: Placa do veículo = 7).
alter table public.workflow_fields
  add column if not exists min_length integer check (min_length is null or min_length >= 1),
  add column if not exists max_length integer check (max_length is null or max_length >= 1);

alter table public.workflow_fields
  drop constraint if exists workflow_fields_length_order,
  add constraint workflow_fields_length_order check (min_length is null or max_length is null or min_length <= max_length);
