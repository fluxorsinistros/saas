# Documento 3 — Workflow Engine

### Regras de execução, transições, branches, joins, loops, decisões e versionamento

> Deriva de `Gerenciador_de_Sinistros_CLAUDE_CODE_Master_v1.1.md` (Documento 1) e do
> [Documento 2 — Modelo de Dados](02-modelo-de-dados.md). Este documento não cria tabelas novas;
> descreve o **algoritmo** que opera sobre as tabelas de `0003_workflow.sql` e `0005_execution.sql`.

---

## 1. Princípio geral

O motor não interpreta o workflow como uma lista de etapas. Ele interpreta como um **grafo**: nós (`workflow_nodes`) e arestas (`workflow_edges`), onde o estado de execução vive em `stage_instances` / `activity_instances` / `branch_instances` / `join_instances`, nunca num único campo "etapa atual" do ciclo (§16, §58).

Toda decisão de runtime lê **apenas** `cycle_configuration_snapshots.snapshot` do ciclo — nunca a versão "viva" de `workflow_nodes`/`workflow_edges` do tenant. Isso é o que torna §30 e §31 verdade em runtime, não só em intenção: se o designer editar o workflow depois, o ciclo em andamento não vê a mudança porque nem consulta a tabela editável.

---

## 2. Ciclo de vida de um nó

1. Uma transição chega a um `node_id` → o motor cria um `stage_instances` novo com `pass_number = max(pass_number existente para este node_id neste ciclo) + 1` (§17). Nunca reaproveita uma linha existente.
2. Conforme `node_type`:
   - `stage`: cria uma ou mais `activity_instances` (uma por grupo responsável, se a config permitir múltiplos responsáveis) com `status = 'not_started'`.
   - `decision`: cria uma linha em `decisions` vinculada ao `stage_instance_id`, aguardando `selected_option`.
   - `parallel_split`: dispara o algoritmo de bifurcação (seção 4).
   - `join`: dispara o algoritmo de convergência (seção 5).
   - `wait`: `stage_instance` permanece `in_progress` até uma condição externa (evento, prazo, resposta) satisfazer a saída — não confundir com SLA de espera (Documento 4).
   - `pending`: não é um nó de fluxo por si — pendências (`pending_items`) são associadas a uma `activity_instance` existente e não bloqueiam a passagem de etapa por padrão; só bloqueiam se a config do nó explicitar `blocks_progress: true`.
   - `end`: encerra o ramo. Se for o último ramo pendente do ciclo, dispara avaliação de conclusão do ciclo (seção 8).
3. Quando todas as `activity_instances` de um `stage_instance` estão em estado terminal (`completed | cancelled | waived`), o `stage_instance.status` muda para `completed` e `exited_at = now()`.
4. Ao concluir um `stage_instance`, o motor avalia as `workflow_edges` que saem do `node_id` correspondente (seção 3) para decidir o próximo nó.

Cada transição relevante grava evento de auditoria (`audit_logs`, ação `activity.completed`, `stage.entered` etc.) e dispara notificação de domínio (`notifications.event_type`, catálogo do §62) — nunca o inverso: a UI não decide o que auditar, o motor decide.

---

## 3. Avaliação de transições (`workflow_edges`)

Ao concluir um nó, o motor busca as edges com `from_node_id = node concluído`, ordenadas por `order_index`, e avalia por `edge_type`:

| `edge_type` | Comportamento |
|---|---|
| `normal` | Segue incondicionalmente para `to_node_id`. Só pode haver uma edge `normal` saindo de um `stage`/`wait`/`pending` — o Workflow Validator (seção 7) rejeita ambiguidade. |
| `conditional` | Avalia `condition jsonb` contra o `result` acumulado da atividade/decisão. A primeira condição verdadeira, na ordem de `order_index`, vence. Se nenhuma vencer e não houver edge "senão", o ciclo entra em `blocked` e gera `audit_logs` com motivo `no_matching_edge`. |
| `parallel` | Todas as edges `parallel` saindo do mesmo nó são ativadas simultaneamente — é o mecanismo de baixo nível que o algoritmo de bifurcação (seção 4) usa. |
| `return` | Aponta para um nó já visitado no ciclo (loop, §22). Antes de seguir, o motor invoca a verificação de limite de loop (seção 6). |
| `close` | Encerra o ramo atual sem abrir novo `stage_instance` — usado para ramos que terminam sem passar por um nó `end` explícito (ex.: dispensa de ramo opcional). |

Uma `decision` node resolve sua edge de saída por `selected_option` (mapeado em `workflow_nodes.config.options[].edge_key`), não por `condition` — decisão é escolha humana registrada, não avaliação de regra.

---

## 4. Bifurcação (`branches` / `branch_instances`) — §12, §13, §15

Quando um `stage_instance` de um nó `decision` (roteamento) ou `parallel_split` conclui:

1. Cria uma linha em `branches` com `source_node_id` e `branch_mode`:
   - `exclusive` (decision com escolha única, §12.1): apenas a edge correspondente ao `selected_option` é ativada.
   - `parallel` (parallel_split, §12.2): **todas** as edges `parallel` saindo do nó são ativadas.
2. Para cada edge ativada, cria uma `branch_instances` com `status = 'active'` e `is_required` copiado do `workflow_edges.is_required` daquela edge.
3. Cada `branch_instances` ativa dispara a criação de um novo `stage_instances` no seu `target_node_id` (volta ao algoritmo da seção 2).
4. Um ramo conclui (`branch_instances.status = 'completed'`) quando seu `stage_instance` de destino atinge um nó `end` ou converge num `join` que o consome.
5. **Dispensar ramificação** (§13): ação explícita que exige `waived_reason` + `waived_by` + `waived_at` (constraint `waive_requires_reason` já impede gravar sem isso). Só é permitida em ramo com `is_required = false`, salvo override administrativo auditado.

Um ramo `parallel_split` pode conter, dentro de si, decisões exclusivas e novos `parallel_split` — o algoritmo é recursivo por natureza porque cada `branch_instance` apenas alimenta um novo `stage_instance`, que segue as mesmas regras da seção 2 (§12.3).

---

## 5. Convergência / Join (`joins` / `join_instances`) — §14, §15

1. Quando uma `branch_instances` conclui, o motor verifica se seu `target_node_id`/rota leva a um nó `join` configurado para consumi-la. Se sim, cria (ou reaproveita, se já existir um `joins` aberto para aquele `branch_id` + `node_id`) a linha em `joins`, e grava/atualiza `join_instances(join_id, branch_instance_id, satisfied=true, satisfied_at=now())`.
2. A cada atualização de `join_instances`, o motor recalcula `joins.status` segundo `rule_type`:
   - `all`: libera quando **toda** `branch_instances` do `branch_id` (obrigatórias ou não) está em estado terminal.
   - `all_required`: libera quando toda `branch_instances` com `is_required = true` está terminal; ramos opcionais pendentes não bloqueiam.
   - `any`: libera na primeira `branch_instances` que atinge `completed`.
   - `min_count`: libera quando `count(satisfied=true) >= min_count`.
   - `conditional`: avalia `condition jsonb` contra o estado agregado das branch_instances.
3. Enquanto a regra não é satisfeita, `joins.status = 'waiting'`; branch_instances já concluídas **permanecem concluídas** — o Join nunca desfaz progresso de um ramo (§14, "as atividades já concluídas permanecem concluídas").
4. Quando a regra é satisfeita, `joins.status = 'released'`, `released_at = now()`, e o motor cria o `stage_instances` seguinte a partir do `node_id` do join. Em seguida `joins.status = 'completed'`.
5. A UI de execução (Documento 5) deve poder exibir "aguardando 1 de 3 atividades obrigatórias" (§15) — isso é uma leitura direta de `join_instances` filtrado por `join_id`, sem estado adicional.

---

## 6. Loops (§22)

Uma edge `return` aponta para um `node_id` já visitado no ciclo. Antes de criar o novo `stage_instances` (que seria a passagem N+1 daquele nó), o motor:

1. Conta `stage_instances` existentes para `(claim_cycle_id, node_id)` → `current_pass_count`.
2. Consulta `workflow_rules` com `rule_type = 'loop_limit'` para o `node_id` de destino. Config esperada: `{ "limit_type": "unlimited" | "max_count" | "require_auth_after" | "conditional", "max_count": n, "condition": {...} }`.
3. Comportamento por `limit_type`:
   - `unlimited`: sempre permite.
   - `max_count`: bloqueia se `current_pass_count >= max_count`; gera `pending_items` do tipo "limite de repetição atingido" endereçado ao grupo escalonado, em vez de deixar o ciclo travar silenciosamente.
   - `require_auth_after`: permite normalmente até `max_count`; a partir daí exige uma `decisions` de autorização explícita antes de criar a nova passagem (auditada).
   - `conditional`: avalia `condition` contra o histórico do ciclo (ex.: "só permite nova rodada se o motivo da contestação for diferente do anterior").
4. Cada nova passagem é uma linha nova em `stage_instances` — nunca sobrescreve; isso é o que permite medir retrabalho, tempo por passagem e quantidade de tentativas (§17).

---

## 7. Workflow Validator (§38)

Executado antes de permitir `workflow_versions.status: draft → validated → published`. Roda como função de validação (não trigger — precisa retornar lista de erros, não só rejeitar) e grava o resultado em `workflow_versions.validation_errors`.

Checklist mínimo (erro crítico = bloqueia publicação; aviso = não bloqueia):

| Verificação | Severidade |
|---|---|
| Nó sem responsável (`group_id` nulo em `stage`) | erro |
| Edge sem `to_node_id` válido | erro |
| `parallel_split` sem nenhuma edge `parallel` saindo | erro |
| `join` sem nenhuma `branch` que o alimente (nenhum caminho leva a ele) | erro |
| `join` com `rule_type = min_count` e `min_count` maior que o número de ramos possíveis | erro |
| Ramo obrigatório (`is_required=true`) sem caminho até um nó `end` | erro |
| Loop (`edge_type='return'`) sem `workflow_rules(rule_type='loop_limit')` associado ao nó de destino | aviso — assume `unlimited` por omissão, mas alerta o designer |
| `workflow_slas` com `duration_minutes <= 0` | erro |
| `workflow_document_requirements` apontando para `node_id` inexistente na versão | erro |
| `decision` sem opções em `config.options` | erro |
| `condition` de edge `conditional` referenciando campo que não existe no schema de resultado do nó de origem | erro |
| Existe algum `node_type != 'end'` sem qualquer caminho (direto ou via joins/loops) que alcance um `end` | erro |

A publicação só é permitida com **zero erros críticos**; avisos ficam visíveis no builder (§37, §38) mas não bloqueiam.

---

## 8. Conclusão do ciclo

O `claim_cycles.status` é **derivado**, recalculado a cada transição relevante (nunca editado diretamente por uma tela):

- `open` → primeira `stage_instances` criada.
- `in_progress` → existe ao menos uma `activity_instances` com `status in ('in_progress')`.
- `waiting` → todas as atividades ativas estão em `not_started`/aguardando externo, sem nenhuma `in_progress`.
- `blocked` → existe `joins.status = 'blocked'` ou edge `conditional` sem correspondência (seção 3) ou `pending_items` com `blocks_progress=true` em aberto.
- `completed` → todo ramo raiz do grafo (todas as `branch_instances` derivadas do nó inicial) atingiu um nó `end`, e não há `joins` em `waiting`.
- `cancelled` / `discarded` → só por ação explícita do usuário (Documento 1, §9), nunca inferido pelo motor.

Esse recálculo é o "estado derivado" do §58: o motor nunca confia em um único campo para representar o processo todo — ele projeta o status a partir de `stage_instances` + `activity_instances` + `joins` no momento da leitura (ou recalcula e persiste em cache invalidado a cada evento, decisão de performance que fica para a implementação).

---

## 9. Versionamento em runtime (§30, §31)

- `claim_cycles.workflow_version_id` é fixado na criação e imutável (trigger já existente em `0004`).
- Toda leitura de `node_type`, `config`, `edges`, `rules`, `slas` e `document_requirements` durante a execução do ciclo usa `cycle_configuration_snapshots.snapshot`, não as tabelas `workflow_*` diretamente. As tabelas `workflow_*` são a fonte de verdade só para o **builder** (edição de versões em draft) e para gerar o snapshot na formalização.
- Migração de ciclo para nova versão (se necessário no futuro) é uma operação **explícita, autorizada e auditada** (§30) — não existe hoje caminho automático, e não deve existir sem uma tela e um `audit_logs` dedicados.

---

## 10. Máquina de estados — referência rápida

```
stage_instances:    not_started → in_progress → { completed | cancelled | paused → in_progress }
                                                → waived (só se nó permitir dispensa)

activity_instances:  not_started → in_progress → { completed | cancelled | waived }
                                                → paused → in_progress

branch_instances:    active → { completed | cancelled | waived }

joins:               waiting → { released → completed | blocked → waiting }

decisions:           (sem status próprio) — "pendente" = selected_option is null
                      "decidido" = selected_option not null
                      "aprovado" = approved_at not null (quando requires_approval=true)

claim_cycles:        draft → open → in_progress ⇄ waiting ⇄ blocked → completed
                                  ↘ cancelled
                                  ↘ discarded (com previous_cycle_id apontando para o novo, se houver)
```

Nenhuma transição de estado pula direto para um estado terminal sem passar pelo evento que a causa (conclusão de atividade, decisão registrada, join liberado) — cada mudança de status tem uma linha correspondente em `audit_logs`.

---

## 11. Casos de aceite do motor (§69) — como cada caso exercita o algoritmo

| Caso | Seção deste documento que resolve |
|---|---|
| A — sequência simples | §2 + §3 (`edge_type='normal'`) |
| B — decisão de escolha única | §4 (`branch_mode='exclusive'`) |
| C — três atividades simultâneas | §4 (`branch_mode='parallel'`, 3 `branch_instances`) |
| D — aguardar Join configurado | §5, `joins.status='waiting'` |
| E — Join "todos obrigatórios" | §5, `rule_type='all_required'` |
| F — Join "qualquer um" | §5, `rule_type='any'` |
| G — loop | §6 |
| H — pendência dentro de atividade | §2.2 (`pending_items` associado a `activity_instance_id`) |
| I — SLA independente de atividade | Documento 4 (fora do escopo deste documento) |
| J — reabrir ciclo com autorização | Documento 1 §9.1 — grava novo `stage_instances` com `entry_reason='reopen'` sobre o mesmo `claim_cycle_id` |
| K — descartar e criar novo ciclo relacionado | `claim_cycles.previous_cycle_id` (Documento 2, §5) |
| L — execução sob versão antiga | §9 deste documento (snapshot + `workflow_version_id` imutável) |
| M — audit log de toda alteração | §2, última frase de cada seção de transição |

Todos os 13 casos de aceite do Documento 1 têm mecanismo correspondente já modelado em `0003_workflow.sql` e `0005_execution.sql` — nenhum exige tabela nova além do que o Documento 2 já define.

---

## 12. O que ainda não está aqui

- Cálculo de prazo/SLA sobre calendário e pausa justificada → **Documento 4 (SLA Engine)**.
- Onde e como o job de scheduler (§57) dispara essas reavaliações (cron centralizado, não um job por sinistro) → também Documento 4.
- Contrato de payload dos eventos de domínio para webhooks/BI → Documento 6.
- Telas do builder e da execução → Documento 5.
