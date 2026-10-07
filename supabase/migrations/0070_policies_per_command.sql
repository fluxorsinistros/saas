-- 0070: regras de acesso uma por operação (como nas demais tabelas), em vez de "for all" com função de administrador.
drop policy admin_write on group_subgroups;
create policy admin_insert on group_subgroups for insert with check (app.is_tenant_admin(tenant_id));
create policy admin_update on group_subgroups for update using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy admin_delete on group_subgroups for delete using (app.is_tenant_admin(tenant_id));

drop policy admin_write on notification_rules;
create policy admin_insert on notification_rules for insert with check (app.is_tenant_admin(tenant_id));
create policy admin_update on notification_rules for update using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy admin_delete on notification_rules for delete using (app.is_tenant_admin(tenant_id));
