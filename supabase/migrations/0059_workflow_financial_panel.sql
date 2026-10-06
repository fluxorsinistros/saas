-- 0059: painel financeiro de cada fluxo: lista ordenada de itens {key, tone}. key aponta para um campo numérico
-- (número, R$, % ou calculado) do catálogo do fluxo.
alter table public.workflows
  add column if not exists financial_panel jsonb not null default '[]'::jsonb
  check (jsonb_typeof(financial_panel) = 'array' and jsonb_array_length(financial_panel) <= 20);
