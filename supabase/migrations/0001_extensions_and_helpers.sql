-- 0001: extensões e funções de apoio para RLS multi-tenant
create extension if not exists "pgcrypto";

create schema if not exists app;

-- app.is_tenant_member é criada em 0002_foundation.sql, após a tabela tenant_memberships existir
-- (CREATE FUNCTION language sql faz parse-analyze da query e exige que a relação já exista).

-- Trigger genérico de updated_at
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
