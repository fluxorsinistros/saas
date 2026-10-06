-- 0058: campos de valor em R$, porcentagem e calculados (fórmula), com mínimo/máximo de valor.
-- O valor de money/percent é guardado como número em claims.custom_fields, igual ao tipo number. O calculado nunca é
-- gravado em claims: a fórmula (formula) é avaliada na leitura com os campos digitados do sinistro.
alter table public.workflow_fields drop constraint if exists workflow_fields_field_type_check;
alter table public.workflow_fields add constraint workflow_fields_field_type_check
  check (field_type in ('text','number','date','select','boolean','textarea','attachment','person','money','percent','calculated'));

alter table public.workflow_fields
  add column if not exists min_value numeric,
  add column if not exists max_value numeric,
  add column if not exists formula text check (formula is null or char_length(formula) <= 300);

alter table public.workflow_fields drop constraint if exists workflow_fields_value_order;
alter table public.workflow_fields add constraint workflow_fields_value_order
  check (min_value is null or max_value is null or min_value <= max_value);
alter table public.workflow_fields drop constraint if exists workflow_fields_formula_only_calculated;
alter table public.workflow_fields add constraint workflow_fields_formula_only_calculated
  check ((field_type = 'calculated') = (formula is not null));
