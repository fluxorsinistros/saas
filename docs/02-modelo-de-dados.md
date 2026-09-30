# Documento 2 — Modelo de Dados

### Gerenciador de Sinistros — v1.0

> Deriva diretamente de `Gerenciador_de_Sinistros_CLAUDE_CODE_Master_v1.1.md` (Documento 1).
> Cada tabela abaixo referencia a seção do Documento 1 que a fundamenta.
> SQL executável em [`supabase/migrations/`](../supabase/migrations/).

---

## 1. Como ler este documento

Cada bloco abaixo corresponde a um arquivo de migração. A ordem dos arquivos é a ordem de aplicação e reflete as dependências de FK. Todas as tabelas tenant-scoped têm `tenant_id` **direto** na própria linha (não apenas via join), conforme §54 — isso simplifica RLS e evita joins caros nas policies.

Convenção geral:
- `uuid primary key default gen_random_uuid()` em toda tabela.
- `created_at` / `updated_at` em tabelas mutáveis; tabelas append-only (`audit_logs`, `document_versions`, `cycle_configuration_snapshots`) não têm `updated_at` e têm trigger bloqueando `UPDATE`/`DELETE`.
- Enums são `text` + `check` (não `enum` do Postgres) para permitir adicionar valores sem `ALTER TYPE` bloqueante — importante porque o produto é configurável (§2.1) e alguns catálogos (`role_kind`, `rule_type`, `limit_key`, `event_type`) são deliberadamente abertos.

---

## 2. Isolamento multi-tenant (§2.2, §54)

Função `app.is_tenant_member(tenant_id)` (`0001_extensions_and_helpers.sql`): `security definer`, verifica se `auth.uid()` tem `tenant_memberships` ativa para o tenant. Toda tabela tenant-scoped usa uma única policy:

```sql
create policy tenant_isolation on <tabela>
  using (app.is_tenant_member(tenant_id)) with check (app.is_tenant_member(tenant_id));
```

Isso cobre `SELECT`/`INSERT`/`UPDATE`/`DELETE` num só policy. **RLS aqui garante isolamento de tenant, não autorização granular.** Visibilidade de campo, editabilidade e ações permitidas (§32) são resolvidas na camada de aplicação a partir de `role_permissions` + `group_members` — RLS não tenta expressar "campo X visível apenas para grupo Y", porque isso pertenceria à configuração de UI/API, não ao acesso à linha.

Entidades **globais** (não tenant-scoped): `organizations`, `user_profiles`, `permissions`, `plans`, `plan_limits`. Visibilidade dessas segue relacionamento (ex.: uma organização é visível se participa de algum tenant que o usuário também integra).

`audit_logs` tem policy de leitura por tenant, mas **nenhuma policy de escrita para `authenticated`** — grava-se apenas via service role no backend, nunca direto do cliente (§56 "autorização deve ser validada no backend").

---

## 3. Fundação — `0002_foundation.sql` (§5, §6, §53)

| Tabela | Papel |
|---|---|
| `tenants` | Unidade de isolamento raiz. `settings jsonb` guarda config white-label (§45). |
| `organizations` | Entidade **global** — participa de N tenants (§6). |
| `tenant_organizations` | Relação organização↔tenant; `role_kind` é o papel contextual (transportadora, seguradora, etc.), nunca fixo na organização. |
| `user_profiles` | Perfil global sobre `auth.users`. CPF é identidade, não chave de autorização (§5.2). |
| `tenant_memberships` | Entidade própria da relação usuário↔tenant (§5.2) — é o que a função de RLS consulta. |
| `roles` / `permissions` / `role_permissions` / `membership_roles` | RBAC. `permissions` é catálogo global; `roles` pode ser template de sistema (`tenant_id null`) ou custom por tenant. |
| `groups` / `group_members` | Unidade operacional (§5.3). **Etapas apontam para grupo, nunca para pessoa.** |
| `claim_categories` / `claim_types` | Família (Acidente) e subtipo (Colisão, Tombamento) — base da reclassificação dentro da família (§10.1). |

`claim_types.default_workflow_id` é adicionado via `ALTER TABLE` em `0003` (depende de `workflows`, que só existe ali) — dependência circular resolvida assim de propósito.

---

## 4. Workflow Engine — `0003_workflow.sql` (§11–§14, §18, §22, §24, §30, §53)

O motor é um **grafo**, não uma sequência. Núcleo:

- `workflows` → `workflow_versions` → `workflow_nodes` + `workflow_edges`.
- `node_type`: `stage | decision | parallel_split | join | wait | pending | end` (§11.1).
- `edge_type`: `normal | conditional | parallel | return | close` (§11.2). `is_required` no edge implementa ramo obrigatório/opcional (§13).
- `workflow_rules` é uma tabela **genérica e orientada a dados** (`rule_type` + `config jsonb`) para join rules, limites de loop (§22) e condições de roteamento — em vez de uma tabela por tipo de regra, porque o princípio do produto é "configurável, não customizado por código" (§2.1, §64): novos tipos de regra não devem exigir migração.
- `sla_calendars` + `sla_calendar_exceptions` + `workflow_slas`: calendário de dias úteis/feriados por tenant (§24.1) e SLA por ativididade/etapa/ciclo/global (§24). `alert_thresholds int[]` é explicitamente configurável — **nunca hardcoded** (§24.2 exige isso).
- `document_types` + `workflow_document_requirements`: obrigatoriedade de documento vinculada a nó da versão (§25.2).

**Imutabilidade de versão publicada (§30, §68.2):** trigger `app.block_published_workflow_version_edit` impede qualquer alteração estrutural em `workflow_versions` com `status = 'published'`, exceto a transição controlada para `archived`. Isso é a proteção de banco; a proteção de aplicação (bloquear edição de `workflow_nodes`/`workflow_edges` de uma versão publicada) deve ser reforçada no backend antes de qualquer `UPDATE` chegar ao Postgres — o trigger aqui é a rede de segurança final, não a única camada.

---

## 5. Sinistro × Ciclo — `0004_claims_and_cycles.sql` (§7–§10, §31, §53)

Ponto mais sensível do modelo, porque **sinistro e ciclo são entidades diferentes** (§68.19):

- `claims`: o evento de negócio. `external_reference` existe para alimentar a detecção de duplicidade (§28).
- `claim_cycles`: a **execução formal** — unidade cobrável (§7.3, §68.18). `workflow_version_id` é fixado na criação e **imutável depois** (trigger `app.block_cycle_workflow_version_change`, aplicando §68.6: "nunca alterar silenciosamente o workflow de um ciclo em andamento").
- `previous_cycle_id`: link explícito quando um ciclo nasce de descarte/reclassificação estrutural (§8, §76).
- `formalized_at`: separa rascunho (não cobrável) de ciclo formalizado (cobrável) — implementa §63 ("rascunho que nunca virou ciclo formal não gera cobrança").
- `cycle_configuration_snapshots`: snapshot congelado (§31) tomado na formalização — **append-only** (trigger bloqueia update/delete). Guarda cópia de nodes/edges/rules/SLAs/doc requirements/políticas comerciais vigentes, para que uma mudança de configuração futura nunca afete um processo já em andamento.

---

## 6. Execução — `0005_execution.sql` (§14–§22, §53)

Este é o motor "rodando":

- `stage_instances`: uma linha por **passagem** por nó (§17) — `unique(claim_cycle_id, node_id, pass_number)` garante que repetição nunca sobrescreve a anterior.
- `activity_instances`: trabalho de fato, ligado a um `group_id` (snapshot do grupo responsável no momento). Um ciclo tem N atividades ativas ao mesmo tempo (§16) — não há `current_stage_id` único em `claim_cycles`; o estado geral é **derivado**, não uma coluna (§58).
- `decisions`: entidade estruturada com pergunta/opções/resultado/justificativa/aprovação (§19).
- `branches` + `branch_instances`: `branches` é o evento de bifurcação (o "fan-out"); `branch_instances` é cada ramo individual, com seu próprio estado (`active|completed|cancelled|waived`, §15). Constraint `waive_requires_reason` obriga motivo + autor + data quando um ramo é dispensado (§13).
- `joins` + `join_instances`: `joins` é o ponto de convergência com sua regra (`all|all_required|any|min_count|conditional`, §14); `join_instances` rastreia a contribuição de cada `branch_instance` para aquele join especificamente.
- `pending_items`: pendência não é uma etapa nova (§21) — é uma entidade paralela com prazo, solicitante, grupo responsável e histórico próprio.

---

## 7. Documentos — `0006_documents.sql` (§25, §53)

- `documents`: entidade de negócio (não é o arquivo em si).
- `document_versions`: append-only (§25.4) — substituição sempre cria versão nova, nunca apaga a anterior. Trigger bloqueia `UPDATE`/`DELETE` na tabela inteira.

Permissões de quem pode visualizar/enviar/validar/rejeitar (§25.5) não geram tabela própria — resolvem-se via `role_permissions` + `group_members` na aplicação, como já vale para §32 em geral.

---

## 8. Colaboração — `0007_collaboration.sql` (§47, §62, §53)

- `notifications`: uma linha por disparo de evento de domínio (`event_type` do catálogo do §62: `activity.started`, `join.waiting`, etc.).
- `notification_deliveries`: quem **efetivamente** recebeu — preservado mesmo que a membership do destinatário mude depois (§47: "o histórico deve preservar quem efetivamente recebeu").

---

## 9. Duplicidade — `0008_duplicates.sql` (§28, §53)

`duplicate_checks` roda **uma vez, na primeira entrada do sinistro** (não é um job contínuo). `decision` é `pending|confirmed_duplicate|not_duplicate` — o sistema avisa, nunca bloqueia automaticamente (§28). `duplicate_candidates` guarda os candidatos com `confidence` e `matched_fields`, para exibir a evidência ao usuário.

---

## 10. Comercial — `0009_billing.sql` (§42–§44, §63–§65, §53)

Modelo em cadeia, exatamente como descrito em §43:

```
plans → plan_limits → tenant_contracts (overrides) → tenant_effective_limits
```

- `plans`/`plan_limits`: catálogo global, somente leitura para qualquer autenticado (preço não é segredo de tenant).
- `tenant_contracts.overrides jsonb`: contrato pode sobrescrever qualquer limite/preço padrão do plano.
- `tenant_effective_limits`: tabela materializada (recalculada quando plano/contrato muda) para consulta rápida sem recomputar a cadeia toda a cada request.
- `billing_events`: eventos de cobrança (`claim_open`, `cycle_overage`, `plan_change`, `limit_override`, `contract_change` — §65), com `competence_date` para o modelo "cobra na abertura, ajusta excedente no encerramento" (§63). **Cobrança é por sinistro** (decisão 2026-09-30, migração 0029): `claim_id` identifica o sinistro e um índice único garante uma única `claim_open` por sinistro, mesmo com vários ciclos. `plans.claim_price` é o valor por sinistro.
- `storage_usage`: consumo por sinistro (`claim_id`), separando franquia/consumo/excedente (§44). Limites em `plan_limits`: `file_max_mb` (10), `storage_per_claim_mb` (50/100/200) e `storage_overage_price_per_mb`.

Nenhum valor comercial é constante de código — tudo é linha nessas tabelas (§64).

---

## 11. Auditoria — `0010_audit.sql` (§33, §53, §68.16)

`audit_logs` é append-only por trigger (bloqueia `UPDATE` e `DELETE` incondicionalmente) e **não tem policy de escrita para `authenticated`** — apenas o backend com service role grava, o que impede um cliente comprometido de forjar ou apagar entradas de auditoria. Índice em `(entity_type, entity_id)` para "histórico desta entidade" e em `(tenant_id, created_at desc)` para "atividade recente do tenant".

---

## 12. Importação — `0011_imports.sql` (§29, §53)

`imports` guarda o resumo do lote (contadores de criados/erro/duplicidade/ignorados, espelhando o relatório do §29). `import_rows` guarda cada linha com seu `status` individual e, se criada, o `created_claim_id` resultante. A regra de negócio (§29: "usar as mesmas regras de criação manual") é responsabilidade da camada de aplicação — a importação não tem caminho de escrita paralelo para `claims`, ela chama a mesma rotina de criação.

---

## 13. Rastreabilidade Documento 1 → tabelas

| Entidade do §53 | Tabela(s) |
|---|---|
| tenants, organizations, tenant_organizations, users, tenant_memberships | ✅ idem |
| groups, group_members | ✅ idem |
| roles, permissions, role_permissions | ✅ idem (+ `membership_roles`, extensão necessária) |
| claim_types, claim_categories | ✅ idem |
| workflows, workflow_versions, workflow_nodes, workflow_edges, workflow_rules, workflow_slas, workflow_document_requirements | ✅ idem (+ `sla_calendars`, `sla_calendar_exceptions`, `document_types`, extensões necessárias) |
| claims, claim_cycles, cycle_configuration_snapshots | ✅ idem |
| stage_instances, activity_instances, decisions, branches, branch_instances, joins, join_instances, pending_items | ✅ idem |
| documents, document_types, document_versions | ✅ idem |
| comments, notifications, notification_deliveries | ✅ idem |
| duplicate_checks, duplicate_candidates | ✅ idem |
| billing_events, storage_usage | ✅ idem (+ `plans`, `plan_limits`, `tenant_contracts`, `tenant_effective_limits`, extensão necessária para operacionalizar §42/§43) |
| audit_logs | ✅ idem |
| imports, import_rows | ✅ idem |

Nenhuma entidade do §53 foi omitida. As extensões (`membership_roles`, `sla_calendars`/`exceptions`, `document_types` promovido a tabela própria, `plans`/`plan_limits`/`tenant_contracts`/`tenant_effective_limits`) existem porque o Documento 1 exige o *comportamento* (papéis compostos, calendário de SLA, catálogo de documentos, matriz de planos) sem nomear a tabela — conforme a nota do próprio §53: "o modelo físico pode ser refinado durante a implementação, mas os conceitos devem ser preservados."

---

## 14. Regras estruturais aplicadas por trigger/constraint (não só por convenção)

| Regra (§68) | Mecanismo |
|---|---|
| #2 Nunca alterar retroativamente workflow publicado | Trigger em `workflow_versions` |
| #3 Nunca apagar histórico operacional relevante | Nenhuma tabela de execução/auditoria tem `ON DELETE CASCADE` a partir de uma ação de usuário comum; `audit_logs` e `document_versions` bloqueiam `DELETE` |
| #6 Nunca alterar silenciosamente o workflow de um ciclo em andamento | Trigger em `claim_cycles.workflow_version_id` |
| #7 Nunca permitir pausa de SLA sem justificativa | A modelar no Documento 4 (SLA Engine) — campo de pausa ainda não existe nesta versão do modelo; ver seção 15 |
| #8 Nunca excluir versão anterior de documento substituída | Trigger em `document_versions` |
| #9 Nunca depender apenas do frontend para autorização | RLS + `audit_logs` gravado só via service role |
| #13 Nunca dispensar ramo sem justificativa | Constraint `waive_requires_reason` em `branch_instances` |
| #16 Toda ação sensível deve ser auditável | `audit_logs` — a gravação é responsabilidade do backend, não do banco |

---

## 15. O que este documento **não** resolve (fica para os próximos)

- **Documento 3 — Workflow Engine**: algoritmo de avaliação do grafo (como o runtime decide qual `stage_instance` abrir a partir de `workflow_edges` + `workflow_rules`), validação de publicação (§38), motor de loop com limite.
- **Documento 4 — SLA Engine**: cálculo de prazo sobre calendário, pausa de SLA com motivo/autorização (falta campo/tabela — provável `sla_pauses`), escalonamento efetivo, job do scheduler (§57).
- **Documento 5 — UX/Telas**: nada aqui prescreve tela; `config jsonb` em `workflow_nodes` e `settings jsonb` em `tenants` são propositalmente abertos para o builder decidir a forma.
- **Documento 6 — API/Integrações**: eventos de domínio (§62) já têm "gancho" em `notifications.event_type`, mas payload/contrato de webhook não está definido aqui.

Este documento cobre integralmente o pedido do Documento 1 em §81 ("Documento 2 — Modelo de Dados: tabelas, relações, índices, RLS e constraints").
