-- 0025: já existiam papéis por tenant chamados 'Administrador'/'Operador' (de uma fatia anterior de
-- gestão de usuários) sem nenhuma role_permissions — a 0024 só populou os papéis de sistema
-- (tenant_id null). Espelha as mesmas permissões para qualquer papel já nomeado assim num tenant,
-- para nenhum membro ficar sem permissão por causa de um papel tenant-scoped órfão.

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
cross join permissions p
where r.tenant_id is not null and r.name = 'Administrador'
  and not exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id);

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.code in ('claim.formalize', 'claim.execute', 'document.validate')
where r.tenant_id is not null and r.name = 'Operador'
  and not exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_id = p.id);
