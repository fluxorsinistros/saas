# Documento 6 — API / Integrações

### Contratos de API, eventos e webhooks

> Deriva de `Gerenciador_de_Sinistros_CLAUDE_CODE_Master_v1.1.md` §46, §47, §62.
> Tabelas: `webhooks` / `webhook_deliveries` / `integration_connections` (`0013_integrations.sql`),
> `notifications` / `notification_deliveries` (`0007_collaboration.sql`).

---

## 1. Princípio: eventos de domínio, nunca acoplamento direto (§46)

O motor de workflow (Documento 3) nunca chama um webhook, um serviço de e-mail ou uma API de ERP diretamente. Ele grava uma linha em `notifications` (`event_type` do catálogo abaixo). Um processo separado (fan-out) lê `notifications` novas e decide, por tenant, para quem/onde aquilo vira: notificação in-app, e-mail, WhatsApp, Teams (`notification_deliveries`) e/ou entrega de webhook (`webhook_deliveries`). Isso é o que permite adicionar um canal novo (ex.: Teams) sem tocar no motor.

```
Motor de workflow
      ↓ grava
 notifications (event_type, payload)
      ↓ fan-out (backend, não trigger de banco — precisa chamar APIs externas)
      ├── notification_deliveries (email | in_app | whatsapp | teams)
      └── webhook_deliveries (para cada webhooks.event_types que casar)
```

---

## 2. Catálogo de eventos de domínio (§62)

| `event_type` | Disparado quando | Payload mínimo |
|---|---|---|
| `claim.created` | `claims` criado | `{ claim_id, tenant_id, claim_number, claim_category_id }` |
| `cycle.created` | `claim_cycles` criado | `{ cycle_id, claim_id, cycle_number, workflow_version_id }` |
| `cycle.reopened` | Reabertura autorizada (§9.1) | `{ cycle_id, reason, authorized_by }` |
| `cycle.discarded` | Ciclo descartado (§9.2) | `{ cycle_id, reason, discarded_by }` |
| `cycle.completed` | Ciclo atinge status `completed` | `{ cycle_id, completed_at }` |
| `activity.started` | `activity_instances` → `in_progress` | `{ activity_id, stage_instance_id, group_id }` |
| `activity.completed` | `activity_instances` → `completed` | `{ activity_id, completed_by, result }` |
| `activity.overdue` | `sla_tracking.status` → `breached` (Documento 4, §4) | `{ sla_tracking_id, activity_id, target_at }` |
| `activity.sla_at_risk` | Threshold de alerta cruzado (Documento 4, §4) | `{ sla_tracking_id, threshold }` |
| `branch.opened` | `branches` criado (Documento 3, §4) | `{ branch_id, cycle_id, source_node_id, branch_mode }` |
| `join.waiting` | `joins.status = 'waiting'` (Documento 3, §5) | `{ join_id, node_id, rule_type }` |
| `join.released` | `joins.status = 'released'` | `{ join_id, released_at }` |
| `document.received` | Novo `document_versions` | `{ document_id, version_number, uploaded_by }` |
| `document.rejected` | `documents.status = 'rejected'` | `{ document_id, rejection_reason }` |
| `decision.made` | `decisions.selected_option` preenchido | `{ decision_id, selected_option, decided_by }` |
| `pending_item.created` | `pending_items` criado | `{ pending_item_id, cycle_id, due_at }` |
| `pending_item.overdue` | `pending_items.due_at` vencido | `{ pending_item_id }` |

Todo evento carrega, além do payload específico, o envelope comum: `{ event_id, event_type, tenant_id, occurred_at, payload }`. `event_id` é o `notifications.id` — garante idempotência de consumo do lado externo.

---

## 3. Contrato de webhook

### Registro (`webhooks`)
Um tenant cria um webhook escolhendo `target_url` e o subconjunto de `event_types` que quer receber (vazio ou `{*}` = todos). `secret` é gerado no registro e usado para assinar o payload — nunca é retornado em leitura após a criação (mostrado uma única vez na tela, igual a uma API key).

### Envio
```http
POST {target_url}
Content-Type: application/json
X-Webhook-Id: {webhooks.id}
X-Webhook-Signature: sha256={HMAC(secret, raw_body)}
X-Webhook-Delivery: {webhook_deliveries.id}

{
  "event_id": "uuid",
  "event_type": "activity.overdue",
  "tenant_id": "uuid",
  "occurred_at": "2026-09-28T14:00:00Z",
  "payload": { ... }
}
```

### Retentativa
`webhook_deliveries.status` segue `pending → sent | failed`. Em `failed`, `next_retry_at` é calculado com backoff exponencial (ex.: 1min, 5min, 30min, 2h, 12h). Após N tentativas (configurável por tenant, default 5), `status = 'exhausted'` e o tenant é notificado in-app que aquele webhook está falhando — nunca falha silenciosamente para sempre.

### Verificação do lado do consumidor
O consumidor recalcula o HMAC com o `secret` (obtido uma vez no registro) sobre o corpo bruto da requisição e compara com `X-Webhook-Signature`. Consumidores devem responder `2xx` rapidamente e processar de forma assíncrona — o motor não espera confirmação de processamento, só de recebimento HTTP.

---

## 4. API interna (aplicação → banco)

A stack (§55) é Next.js sobre Supabase. Não existe uma "API pública" separada no MVP — as rotas internas (Route Handlers/Server Actions do Next.js) são a única porta de escrita que:
1. Valida autorização (role/permission/group) **antes** de tocar o banco (§56 — nunca confiar só em RLS para regra de negócio fina).
2. Grava a mutação de domínio (ex.: concluir atividade).
3. Grava o `audit_logs` correspondente.
4. Grava a `notifications` do evento de domínio.

RLS (Documentos 2–4) é a rede de segurança que impede vazamento entre tenants mesmo que a camada de aplicação tenha um bug — não é o mecanismo primário de regra de negócio.

### API pública (roadmap, §46)
Quando existir, deve ser uma camada REST/GraphQL fina sobre as mesmas rotinas de domínio da aplicação interna (nunca acesso direto às tabelas via chave de serviço para o cliente externo) — autenticada por `create_api_keys`-equivalente por tenant, com o mesmo RBAC de `role_permissions`.

---

## 5. Integrações nomeadas (§46)

`integration_connections.provider` é o catálogo aberto (`erp`, `tms`, `gr_system`, `insurer`, `bi`, `email`, `whatsapp`, `teams`). Cada provider tem um adaptador na aplicação que traduz `notifications`/ação de domínio para o formato daquele sistema — o adaptador é código, mas o **registro de qual conexão está ativa e com qual config não sensível** é dado (`integration_connections.config jsonb`). Credenciais/segredos ficam fora do Postgres (vault do provedor, ex. Supabase Vault ou secret manager do Vercel), e `integration_connections` guarda apenas a referência ao segredo, nunca o valor.

Exemplos de uso do catálogo:
- `email`: adaptador chama Resend (§55) a partir de `notification_deliveries` com `channel='email'`.
- `whatsapp`/`teams`: adaptadores futuros, mesma mecânica de `notification_deliveries`.
- `erp`/`tms`/`insurer`: consomem principalmente `webhooks` (evento de domínio → payload) ou, quando exigem leitura ativa (pull), usam `integration_connections.config` para saber onde buscar.

---

## 6. O que ainda não está aqui

- Especificação OpenAPI/GraphQL schema da API pública — depende de qual (REST vs GraphQL) for escolhido na implementação; este documento fixa o contrato de eventos, não o formato de transporte da API pública.
- Rate limiting e quotas de API pública — decisão de infraestrutura (Vercel/Supabase), não de modelo de dados.
- Mapeamento campo-a-campo por integração específica (ex.: qual campo do ERP X corresponde a `claims.external_reference`) — isso é config de implantação por cliente, não uma decisão de arquitetura do produto.
