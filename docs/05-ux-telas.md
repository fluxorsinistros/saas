# Documento 5 — UX / Telas

### Mapa de telas, componentes, estados e fluxos de usuário

> Deriva de `Gerenciador_de_Sinistros_CLAUDE_CODE_Master_v1.1.md` §34, §37, §39–§41, §59–§61, §70–§72.
> Este documento não define pixels — define **o que cada tela precisa mostrar e por quê**,
> amarrado às tabelas dos Documentos 2–4. Vira input direto para o Documento de design visual/wireframes.

---

## 1a. Decisão: "portal externo" é visão, não produto separado

Referência visual trazida pelo usuário (mockup "Fluxor") sugeriu dois produtos distintos — um voltado a transportadoras/embarcadores (operação interna do tenant) e outro voltado a seguradoras/corretoras/gerenciadoras de risco (colaboração entre organizações). Decisão tomada: **não são dois produtos, é uma segunda visão sobre o mesmo tenant**, já prevista no Documento 1 §3.2 ("participantes externos não precisam necessariamente possuir uma licença própria do SaaS").

Mecanismo: a mesma `claim_cycles` é visível para qualquer `tenant_organizations` cujo `role_kind` esteja associado ao ciclo (via `claims.primary_organization_id`, responsabilidade financeira do Documento 1 §20, ou participação explícita em atividades/decisões). A "visão de colaboração" filtra a Tela de Sinistro (seção 5) para mostrar somente os ciclos em que a organização do usuário logado participa, com ações limitadas ao seu papel — não é uma tabela nova, é uma query com filtro diferente sobre o que já existe (`claim_cycles`, `tenant_organizations`, `activity_instances.group_id` quando o grupo pertence à organização externa).

Nenhuma migração adicional foi necessária: `tenant_organizations.role_kind` já é o catálogo aberto que distingue "interno operando o processo" de "participante externo acompanhando/decidindo sua parte".

---

## 1. Princípios que toda tela deve respeitar (§71)

- Produtividade operacional acima de estética decorativa.
- Poucas ações primárias por tela — nunca mais de 3–4 CTAs visíveis simultaneamente.
- Informação crítica sempre visível: status, SLA, responsável, próximo passo.
- Nunca esconder decisões importantes em menus de overflow.
- Mostrar **motivo do bloqueio**, não só "bloqueado" — isso significa toda tela de ciclo precisa expor a razão estruturada (join aguardando N de M, documento pendente, loop no limite), não um texto genérico.
- Configuração avançada é progressiva (§37: básico → avançado → especialista), nunca uma tela única com centenas de campos.

---

## 2. Inventário de telas

| # | Tela | Alimentada por |
|---|---|---|
| 1 | Onboarding assistido | seção 3 |
| 2 | Workflow Builder | seção 4 |
| 3 | Tela de Sinistro (execução) | seção 5 |
| 4 | Tower of Control | seção 6 |
| 5 | Dashboard | seção 7 |
| 6 | Gestão de usuários/grupos/organizações | seção 8 |
| 7 | GED (documentos) | seção 9 |
| 8 | Importação em massa | seção 10 |
| 9 | Configuração comercial (admin) | seção 11 |
| 10 | Minhas Tarefas | seção 13 |
| 11 | Financeiro do ciclo | seção 14 |
| 12 | Linha do tempo simplificada (modo alternativo da Tela de Sinistro) | seção 15 |

---

## 3. Onboarding assistido (§39)

Wizard linear de 9 passos — cada passo grava estado parcial (não é uma transação única no final, para permitir retomar):

```
1. Escolher modelo operacional
2. Selecionar tipos de sinistro          → grava claim_categories/claim_types
3. Escolher template                     → copia workflow (§40) para workflows/workflow_versions do tenant
4. Configurar grupos                     → grava groups
5. Convidar usuários                     → grava tenant_memberships (status='invited' até aceite)
6. Revisar workflow                      → abre o Workflow Builder em modo revisão
7. Validar workflow                      → roda o Workflow Validator (Documento 3, §7)
8. Publicar                              → workflow_versions.status='published'
9. Criar primeiro sinistro               → claims + claim_cycles
```

Ao aplicar um template (§40), a cópia é literal: nova linha em `workflows` com `source_template_id` apontando ao template original, e `workflow_nodes`/`workflow_edges`/`workflow_rules`/`workflow_slas` duplicados para a nova versão do tenant. Edição posterior do template original nunca deve refletir no tenant que já copiou — a tela de template deixa isso explícito ("cópia independente, não vínculo").

---

## 4. Workflow Builder (§60)

Canvas de grafo (nós = `workflow_nodes`, arestas = `workflow_edges`), editável apenas quando a `workflow_versions` aberta tem `status = 'draft'` — a UI **desabilita edição** (não só o backend rejeita) no momento em que `status != 'draft'`, para não dar falsa sensação de que a mudança "pegou".

Ações mínimas por nó:
- Criar / duplicar / editar / excluir nó.
- Definir `group_id` (responsável), SLA (`workflow_slas`), documentos exigidos (`workflow_document_requirements`), campos.
- Conectar nós (criar edge), escolher `edge_type`, marcar `is_required`.
- Para `join`: escolher `rule_type` e, se `min_count`, o número.
- Para `decision`: definir opções e, por opção, a edge de saída correspondente.
- Configurar condições (nível "especialista", §37) via editor de condição estruturado (não JSON cru na v1, ainda que o dado seja `jsonb`).

**Painel de validação** sempre visível (não modal): lista erros críticos e avisos do Workflow Validator (Documento 3, §7) em tempo real, com clique no erro levando direto ao nó problemático. Botão "Publicar" fica desabilitado enquanto houver erro crítico — nunca é reforçado só por mensagem de toast.

Três camadas de complexidade (§37):
- **Básico**: nome, grupo, SLA, documentos, transições simples.
- **Avançado**: campos customizados, permissões por campo, notificações, bifurcação/join/regras.
- **Especialista**: automações, integrações, webhooks, condições avançadas.

A UI deve permitir alternar entre camadas sem perder o que foi configurado nas outras — são visões do mesmo nó, não modos exclusivos.

---

## 5. Tela de Sinistro / execução (§59)

### Cabeçalho
Número do sinistro, tipo, status do ciclo atual, ciclo ativo (com link para ciclos anteriores se houver), SLA mais crítico em andamento, criticidade, valor, organização primária.

### Execução (visualização do grafo em runtime)
Renderiza o mesmo grafo do builder, mas com overlay de estado — lê diretamente `stage_instances` + `activity_instances` + `branch_instances` + `joins` do ciclo (Documento 3):
- Nó/ramo ativo: destaque visual + responsável (`group_id`) + SLA restante (`sla_tracking.target_at`, Documento 4).
- Nó concluído: check + quem concluiu + quando.
- Ramo bloqueado/aguardando: mostra o motivo estruturado — "aguardando 1 de 3 atividades obrigatórias" lido de `join_instances` (Documento 3, §5), não texto livre.
- Loop: indica passagem atual / limite configurado (`stage_instances.pass_number` vs. `workflow_rules.config.max_count`).

### Timeline
Feed cronológico de `audit_logs` + `decisions` + `document_versions` + reaberturas/descartes daquele `claim_cycle_id` — é uma **leitura**, nunca uma tabela própria (evita duplicar histórico).

### Ações
Somente as permitidas ao usuário atual na etapa atual (interseção de `role_permissions` do usuário com as ações configuradas no nó) — nunca lista ação que vai falhar ao clicar por falta de permissão.

---

## 6. Tower of Control (§34)

Tela de gestão operacional, não de um sinistro específico. Cards de indicador (total, abertos, em andamento, próximos do SLA, atrasados, aguardando terceiros, bloqueados, aguardando convergência, documentação pendente, backlog, aging) — cada card é uma query agregada sobre `claim_cycles` + `sla_tracking` + `pending_items` + `joins`, recalculada pelo scheduler (Documento 4, §7), não em tempo real a cada carregamento de página (custo).

Visualizações cruzadas: por grupo, etapa, tipo, organização, SLA, idade (aging), responsável operacional, resultado. Implementadas como o mesmo dataset agregado, pivotado por dimensão diferente — não telas separadas com lógica duplicada.

"O que precisa de atenção agora?" é uma lista ordenada por criticidade operacional (peso configurável: SLA vencido > próximo do SLA > bloqueado > aguardando terceiro > backlog comum) — a fórmula de peso deve ser dado de configuração do tenant, não constante fixa no código (mesmo princípio de §64 aplicado aqui).

---

## 7. Dashboard (§61)

Cards (mesmos indicadores operacionais do Tower of Control, versão resumida) + gráficos (evolução por período, aging, backlog por grupo, SLA por grupo, tempo por etapa, tipos de sinistro, valores financeiros — Documento 4 §9 e Documento 2 §10 fornecem os dados) + lista operacional priorizada (mesma fórmula da seção 6).

Diferença de propósito: Tower of Control é operacional (agir agora); Dashboard é gerencial (entender tendência). Ambos leem o mesmo dado agregado — evitar duas fontes de verdade para "quantos estão atrasados".

---

## 8. Gestão de usuários / grupos / organizações

CRUD sobre `tenant_memberships`, `groups`/`group_members`, `tenant_organizations`. Pontos que a UX precisa deixar explícitos (porque são regra de domínio, não capricho de tela):
- Desativar um usuário (§5.4) não remove seu nome do histórico — a tela de desativação avisa isso antes de confirmar.
- Um grupo não tem "dono individual" — a tela de grupo lista membros, nunca um único responsável.
- Papel de uma organização (§6) é editável por tenant, nunca implica mudar a organização globalmente — se a organização participa de outro tenant, isso é visível mas não editável daqui.

---

## 9. GED / Documentos (§25)

Lista de documentos do ciclo com status (`requested|received|in_validation|validated|rejected|substituted`), obrigatoriedade, e histórico de versões por documento (nunca esconde versões antigas — botão "ver histórico" sempre visível, não enterrado). Upload dispara criação de `document_versions`; validar/rejeitar exige permissão específica (§25.5), resolvida na aplicação, e a UI oculta os botões quando o usuário não tem a permissão (não apenas desabilita — evita vazar existência da ação a quem não pode vê-la, dependendo do nível de sensibilidade que o produto definir).

---

## 10. Importação em massa (§29)

Wizard: Upload → Validação → Prévia → Erros → Correção → Confirmação → Criação → Relatório — espelha exatamente `imports.status` (Documento 2, §12). A tela de "Prévia" mostra `import_rows` com seu `status` individual antes da confirmação; nenhuma linha é criada em `claims` antes do usuário confirmar o lote inteiro (ou subconjunto válido). Relatório final é literal ao formato do §29 (enviados/criados/erro/duplicidade/ignorados).

---

## 11. Configuração comercial (admin, §42–§44)

Tela restrita a administradores de plataforma (não do tenant): CRUD de `plans`/`plan_limits`, atribuição de `tenant_contracts` com overrides. Sempre exibe o efetivo calculado (`tenant_effective_limits`) ao lado do padrão do plano, para deixar visível quando um contrato está sobrescrevendo algo — nunca esconder que um limite foi customizado.

---

## 12. Direção visual (§70) — restrições para o Documento de design

- Paleta: Navy `#0B1220`, Blue `#2563EB`, Cyan `#22D3EE`, Violet `#7C3AED`, Background `#F8FAFC`. Sem laranja como cor principal.
- Evitar iconografia literal de seguro (escudo, cadeado, veículo genérico).
- Transmitir precisão, controle, clareza, tecnologia, confiança, rastreabilidade — não "seguradora tradicional".

---

## 13. Minhas Tarefas

Tela cross-sinistro (diferente da lista de ações dentro da Tela de Sinistro, seção 5, que é escopada a um ciclo só). Agrega `activity_instances` com `status in ('not_started','in_progress')` do usuário logado, com três recortes:

- **Minhas tarefas**: `activity_instances` cujo `group_id` está entre os grupos do usuário (via `group_members`), priorizadas por SLA (`sla_tracking.status`, Documento 4).
- **Da minha equipe**: mesmo filtro, mas sem restringir a quem já iniciou — mostra tudo que está no backlog do grupo, não só o que o usuário individualmente tocou (coerente com §5.3: grupo é responsável, não pessoa; a tarefa pertence ao grupo até alguém iniciar).
- **Todas**: leque completo, restrito às `activity_instances` que a permissão do usuário permite ver (não é "toda atividade de todo tenant" para qualquer papel).

Cada linha mostra: sinistro, tipo, etapa, prazo, status. Ação "Iniciar"/"Concluir" direto da lista quando a atividade não exige campos adicionais; caso exija, leva à Tela de Sinistro na aba correspondente. Não duplica dado — é uma projeção de `activity_instances` + `sla_tracking`, sem tabela própria.

---

## 14. Financeiro do ciclo

Aba dentro da Tela de Sinistro (não tela isolada), cobrindo o lado de valores do §20 (responsabilidade financeira) e do modelo comercial (Documento 2, §10):

- **Resumo**: valor de carga/prejuízo declarado (`claims`/`claim_cycles`, campo de valor do domínio), total de despesas, recebimentos, ressarcimentos, saldo.
- **Movimentações**: lista de lançamentos (despesa/recebimento/ressarcimento) com tipo, valor, data, status (pago/pendente). Este é um dado de **domínio do sinistro** (guincho, armazenagem, reparo, ressarcimento de seguradora), diferente de `billing_events` (Documento 2, §10), que é a cobrança do SaaS ao tenant — os dois nunca devem ser confundidos na implementação. Se o produto vier a precisar de uma tabela própria para lançamentos financeiros do sinistro (ex. `cycle_financial_entries`), ela é uma extensão do Documento 2 a fazer quando esta tela for implementada, não antes.
- Todo lançamento é auditável (`audit_logs`) e reflete a responsabilidade definida em `decisions` (§20: exclusiva ou compartilhada entre organizações).

---

## 15. Linha do tempo simplificada (modo alternativo)

Visão alternativa da execução (seção 5), para o usuário que só quer saber "em que pé está e o que falta" sem ler um grafo. Mesma fonte de dados (`stage_instances` em ordem cronológica de `entered_at`), renderizada como trilha linear com marcos (não o grafo completo com ramos/joins visíveis). Ramos paralelos aparecem como sub-trilhas recolhidas por padrão, expansíveis — o grafo completo (seção 5) continua existindo como modo "avançado" para quem precisa ver bifurcação/convergência de verdade. Alternância entre os dois modos é preferência de usuário (client-side), nunca dado de configuração do tenant.

---

## 16. O que ainda não está aqui

- Wireframes/mockups pixel-level — este documento define conteúdo e comportamento, não layout visual.
- Especificação de componentes reutilizáveis (design system) — decisão de implementação (ex.: shadcn/ui sobre Next.js, alinhado à stack do §55).
- Fluxo de aceite de convite de usuário (tela pública de "aceitar convite") — detalhe de Auth, não modelado aqui.
