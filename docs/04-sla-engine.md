# Documento 4 — SLA Engine

### Calendários, pausas, alertas, escalonamentos e cálculo de tempo

> Deriva de `Gerenciador_de_Sinistros_CLAUDE_CODE_Master_v1.1.md` §24, §57, §68.7, §69 (Caso I).
> Tabelas: `workflow_slas` / `sla_calendars` / `sla_calendar_exceptions` (Documento 2, `0003`) definem a **regra**.
> `sla_tracking` / `sla_pauses` (`0012_sla_tracking.sql`) registram a **execução** da regra por ciclo.

---

## 1. Por que duas camadas (regra × execução)

`workflow_slas` vive dentro da versão do workflow — é config, imutável depois de publicada. `sla_tracking` vive por ciclo — é o relógio real correndo. Um `claim_cycles` referencia `workflow_slas` via seu snapshot (Documento 3, §9); quando o motor entra num nó com SLA aplicável, cria uma linha em `sla_tracking` com `target_at` calculado. Sem essa separação, mudar o SLA de um workflow afetaria retroativamente ciclos em andamento — exatamente o que §68.6 proíbe.

---

## 2. Quando um `sla_tracking` é criado

No momento em que o motor (Documento 3) cria um `stage_instances` ou `activity_instances`, ele verifica no snapshot se existe `workflow_slas` com `sla_scope` correspondente:

| `sla_scope` | Disparado quando |
|---|---|
| `activity` | Uma `activity_instances` entra em `in_progress` |
| `stage` | Um `stage_instances` é criado |
| `cycle` | O `claim_cycles` é formalizado (uma única linha de `sla_tracking` por ciclo) |
| `global` | Aplicado no nível do tenant/plano — foge do escopo por ciclo; tratado como métrica agregada (Documento 5), não gera `sla_tracking` |
| `external_response` | Uma atividade aguardando resposta de terceiro é criada (ex.: aguardar manifestação da transportadora, §49) |
| `wait` | Um nó `wait` é iniciado |

Pode haver mais de um `sla_tracking` simultâneo por ciclo (um por atividade ativa) — coerente com §16, "um ciclo pode ter várias atividades ativas".

---

## 3. Cálculo do prazo (`target_at`)

```
target_at = started_at
          + duração(duration_minutes, calendário)
          + pausas acumuladas (paused_minutes)
```

A função `duração()` avança minuto a minuto (ou em blocos, por performance) respeitando `sla_calendars.business_days`, `business_start`/`business_end` e as exceções em `sla_calendar_exceptions` (feriado = dia não útil mesmo que caia em `business_days`; exceção com `is_working_day = true` = dia útil extra, ex. sábado de plantão). Fora do calendário, o relógio não avança.

Quando o SLA não tem `calendar_id` (workflow_slas.calendar_id null), o cálculo é corrido (24/7) — comportamento explícito, não omissão.

Recalcula-se `target_at` sempre que `paused_minutes` muda (seção 5) ou quando um `sla_calendar_exceptions` é adicionado retroativamente ao calendário vigente (caso raro, tratado como recomputação em lote pelo scheduler, seção 7) — nunca editado manualmente por um usuário.

---

## 4. Alertas (§24.2)

`workflow_slas.alert_thresholds int[]` (ex.: `{75,90,95,100}`) é lido do snapshot, nunca hardcoded (§24.2 é explícito sobre isso). A cada execução do scheduler (seção 7):

1. Calcula `elapsed_pct = (now() - started_at - paused_minutes) / duration_minutes_efetivo * 100`.
2. Para cada threshold em `alert_thresholds` maior que `sla_tracking.last_alert_threshold` e menor ou igual a `elapsed_pct`: dispara `notifications` (`event_type = 'activity.sla_at_risk'` com `payload.threshold`), atualiza `last_alert_threshold` para não repetir o mesmo alerta.
3. Ao cruzar 100%: `sla_tracking.status = 'breached'`, dispara `notifications` (`event_type = 'activity.overdue'`) e aciona escalonamento (seção 6).
4. Entre 0% e o primeiro threshold configurado: `status = 'on_track'`. Entre o primeiro threshold e 100%: `status = 'at_risk'`.

---

## 5. Pausa de SLA (§24.4, §68.7)

Pausa não é um botão livre. Toda pausa cria uma linha em `sla_pauses` com `pause_type` + `reason` obrigatórios. Se `requires_authorization = true` (definido pela config do `pause_type` no tenant — catálogo de tipos de pausa que exigem aprovação, mantido em `tenants.settings.sla_pause_types` ou tabela de configuração dedicada na implementação), a constraint `authorization_required_check` impede gravar sem `authorized_by`.

Fluxo:
1. Usuário/sistema solicita pausa com motivo (ex.: "aguardando terceiro", §24.4) → grava `sla_pauses` com `resumed_at = null`.
2. Enquanto `resumed_at is null`, o scheduler (seção 7) **não avança o relógio** daquele `sla_tracking`: `sla_tracking.status = 'paused'` e nenhum cálculo de `elapsed_pct` ocorre.
3. Ao retomar: grava `resumed_at = now()`, soma `(resumed_at - paused_at)` em minutos a `sla_tracking.paused_minutes`, recalcula `target_at`, volta `status` para `on_track`/`at_risk` conforme o novo `elapsed_pct`.
4. Toda pausa/retomada gera `audit_logs` (ação `sla.paused` / `sla.resumed`) — a regra "o relógio para" é auditável, nunca silenciosa.

Uma regra que determina **se** o relógio pode parar (§24.4: "regra que determina se o relógio para") é, na prática, a combinação de `pause_type` permitido para aquele `sla_scope`/nó + `requires_authorization` — validado na aplicação antes de aceitar a gravação, não apenas no banco.

---

## 6. Escalonamento (§24.3)

Ao `sla_tracking.status` tornar-se `breached` (ou atingir um threshold configurado especificamente para escalonar, ex. 100%), o motor consulta `workflow_slas.escalation_target_type`:

| `escalation_target_type` | Ação |
|---|---|
| `group` | Notifica `escalation_target_group_id` além do grupo responsável original — **não substitui** a atribuição original, apenas amplia visibilidade/responsabilidade. |
| `manager` | Notifica o gestor do grupo responsável (resolvido via papel/hierarquia na aplicação — não há tabela de "gestor" própria; é um papel dentro de `role_permissions`). |
| `admin` | Notifica administradores do tenant. |
| `null` | Sem escalonamento automático — o item permanece visível na Tower of Control (Documento 5) como atrasado. |

Escalonamento não transfere a responsabilidade da atividade (`activity_instances.group_id` não muda) — apenas amplia quem é notificado. Transferir responsabilidade é uma ação distinta, auditada separadamente, se o produto vier a suportá-la.

---

## 7. Scheduler centralizado (§57)

Não existe um cron por sinistro/atividade. Um único job periódico (Supabase Cron/Edge Function, conforme §55) executa, por tenant, em lote:

1. `select * from sla_tracking where status in ('on_track','at_risk')` — calcula `elapsed_pct` de cada um contra o calendário aplicável.
2. Dispara alertas/escalonamentos pendentes (seções 4 e 6).
3. Atualiza `sla_tracking.status` e `last_alert_threshold`.
4. Processa nós `wait` cujo prazo (se houver) expirou, entregando o evento correspondente ao motor de workflow (Documento 3) para seguir a transição configurada (ex.: "wait com timeout segue para nó X se não houver resposta").
5. Recalcula indicadores agregados usados na Tower of Control (Documento 5) — "próximos do SLA", "atrasados" por grupo/etapa/tipo.

O job é idempotente por design: reprocessar o mesmo `sla_tracking` sem mudança de estado não duplica notificação, porque `last_alert_threshold` já registra o que foi disparado.

---

## 8. Conclusão de um `sla_tracking`

Quando a `activity_instances`/`stage_instances`/`claim_cycles` correspondente atinge estado terminal, o motor de workflow (Documento 3) marca `sla_tracking.status = 'completed'` e `completed_at = now()` — mesmo que o prazo já tivesse sido ultrapassado (`breached` → `completed` é uma transição válida; o SLA "descumprido mas encerrado" continua sendo dado histórico para métricas de §35, não é apagado).

---

## 9. Métricas alimentadas por este motor (§35, prévia do Documento 5)

- Tempo médio por etapa/atividade: `activity_instances.completed_at - started_at`, líquido de pausas (via `sla_tracking.paused_minutes` correlato).
- SLA por atividade: `count(sla_tracking) group by status`.
- Tempo de espera em Join: não é `sla_tracking` — deriva de `joins.released_at - branches.created_at` (Documento 3, §5).
- Grupo com maior backlog: `count(activity_instances) where status in ('not_started','in_progress') group by group_id`.

---

## 10. O que ainda não está aqui

- Tela de configuração de calendário/SLA no builder → Documento 5.
- Payload exato de `activity.overdue` para webhook externo → Documento 6.
- Catálogo de `pause_type` por tenant como tabela própria (hoje descrito como config em `tenants.settings`) — decisão de implementação a confirmar quando o volume de tipos justificar tabela dedicada.
