-- 0002: fundação — tenants, organizações, usuários, memberships, grupos, papéis, tipos de sinistro (§5, §6, §53)

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  settings jsonb not null default '{}'::jsonb, -- white-label: nome comercial, logo, cores, domínio (§45)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on tenants
  for each row execute function app.set_updated_at();

-- Organização é entidade global; participa de vários tenants (§6)
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on organizations
  for each row execute function app.set_updated_at();

-- Papel da organização é contextual ao tenant, não um atributo fixo da organização (§6)
create table tenant_organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  role_kind text not null, -- 'transportadora','embarcador','seguradora','corretora','gerenciadora_risco','fornecedor','interno','outro' (catálogo aberto, configurável)
  is_owner boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, organization_id, role_kind)
);
create trigger set_updated_at before update on tenant_organizations
  for each row execute function app.set_updated_at();

-- Perfil global do usuário (auth.users já existe via Supabase Auth)
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  cpf text, -- identidade, nunca chave de autorização (§5.2)
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on user_profiles
  for each row execute function app.set_updated_at();

-- Membership é a entidade própria que controla a relação usuário-tenant (§5.2)
create table tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references organizations(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  invited_at timestamptz,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create trigger set_updated_at before update on tenant_memberships
  for each row execute function app.set_updated_at();
create index idx_tenant_memberships_user on tenant_memberships(user_id) where status = 'active';

-- Catálogo de permissões é global à plataforma (§32)
create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- ex.: 'claim.view', 'workflow.publish'
  description text,
  category text
);

-- Papéis podem ser templates de sistema (tenant_id null) ou customizados por tenant
create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on roles
  for each row execute function app.set_updated_at();

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table membership_roles (
  membership_id uuid not null references tenant_memberships(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (membership_id, role_id)
);

-- Grupo é unidade operacional; etapa aponta para grupo, não pessoa (§5.3)
create table groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create trigger set_updated_at before update on groups
  for each row execute function app.set_updated_at();

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  membership_id uuid not null references tenant_memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, membership_id)
);

-- Tipos de sinistro: categoria (família) + tipo (§10.1)
create table claim_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, -- ex.: 'Roubo', 'Acidente'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create trigger set_updated_at before update on claim_categories
  for each row execute function app.set_updated_at();

create table claim_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  claim_category_id uuid not null references claim_categories(id) on delete restrict,
  name text not null, -- ex.: 'Tombamento', 'Colisão'
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, claim_category_id, name)
);
create trigger set_updated_at before update on claim_types
  for each row execute function app.set_updated_at();
-- default_workflow_id é adicionado em 0003_workflow.sql após a tabela workflows existir

-- Isolamento multi-tenant (§54): toda tabela tenant-scoped usa esta função na policy.
-- security definer + search_path fixo evita bypass via search_path hijacking.
create or replace function app.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from tenant_memberships tm
    where tm.tenant_id = p_tenant_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

revoke all on function app.is_tenant_member(uuid) from public;
grant execute on function app.is_tenant_member(uuid) to authenticated;

-- RLS ---------------------------------------------------------------------

alter table tenant_organizations enable row level security;
create policy tenant_isolation on tenant_organizations
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table tenant_memberships enable row level security;
create policy tenant_isolation on tenant_memberships
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table roles enable row level security;
create policy tenant_isolation on roles
  using (tenant_id is null or app.is_tenant_member(tenant_id))
  with check (tenant_id is null or app.is_tenant_member(tenant_id));

alter table groups enable row level security;
create policy tenant_isolation on groups
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table claim_categories enable row level security;
create policy tenant_isolation on claim_categories
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

alter table claim_types enable row level security;
create policy tenant_isolation on claim_types
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));

-- Tenants: usuário só vê tenants onde tem membership ativa
alter table tenants enable row level security;
create policy member_can_read on tenants
  for select using (app.is_tenant_member(id));

-- Organizations/user_profiles: entidades globais, visibilidade por relacionamento com tenant comum
alter table organizations enable row level security;
create policy visible_via_shared_tenant on organizations
  for select using (
    exists (
      select 1 from tenant_organizations tor
      where tor.organization_id = organizations.id
        and app.is_tenant_member(tor.tenant_id)
    )
  );

alter table user_profiles enable row level security;
create policy self_or_shared_tenant on user_profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from tenant_memberships tm1
      join tenant_memberships tm2 on tm2.tenant_id = tm1.tenant_id
      where tm1.user_id = auth.uid() and tm1.status = 'active'
        and tm2.user_id = user_profiles.id and tm2.status = 'active'
    )
  );
create policy self_update on user_profiles
  for update using (id = auth.uid());

-- Catálogos globais somente leitura para autenticados
alter table permissions enable row level security;
create policy read_all on permissions for select using (auth.role() = 'authenticated');

alter table role_permissions enable row level security;
create policy read_all on role_permissions for select using (auth.role() = 'authenticated');

alter table membership_roles enable row level security;
create policy tenant_isolation on membership_roles
  using (exists (select 1 from tenant_memberships tm where tm.id = membership_id and app.is_tenant_member(tm.tenant_id)));

alter table group_members enable row level security;
create policy tenant_isolation on group_members
  using (exists (select 1 from groups g where g.id = group_id and app.is_tenant_member(g.tenant_id)));
