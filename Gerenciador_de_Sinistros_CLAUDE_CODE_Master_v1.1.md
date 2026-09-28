# GERENCIADOR DE SINISTROS

## Especificação Mestre do Produto --- v1.0

### Documento-base para implementação no Claude Code

> **Status:** Base consolidada para início da construção\
> **Data:** 28/09/2026\
> **Produto:** SaaS B2B multi-tenant para gestão e orquestração de
> sinistros de transporte\
> **Nome comercial:** em definição\
> **Nome de trabalho:** Gerenciador de Sinistros

------------------------------------------------------------------------

# 1. Objetivo deste documento

Este documento consolida as decisões funcionais, operacionais,
comerciais, arquiteturais e de UX definidas para o Gerenciador de
Sinistros.

Ele deve ser utilizado como **fonte principal de contexto para a
construção do produto** no Claude Code.

O produto não deve ser tratado como um simples CRUD de sinistros. O
núcleo é um **motor configurável de workflow especializado em
sinistros**, capaz de:

-   executar processos sequenciais;
-   executar atividades simultaneamente;
-   criar bifurcações condicionais ou paralelas;
-   convergir atividades;
-   controlar SLAs;
-   controlar documentos e evidências;
-   registrar decisões;
-   manter histórico e auditoria;
-   permitir diferentes organizações e grupos trabalhando no mesmo
    processo;
-   preservar a versão das regras sob as quais cada processo foi
    executado;
-   gerar indicadores operacionais, financeiros e de qualidade.

------------------------------------------------------------------------

# 2. Princípios do produto

## 2.1 Configurável, não customizado por código

O cliente deve conseguir configurar:

-   grupos;
-   usuários;
-   organizações;
-   tipos de sinistro;
-   campos;
-   workflows;
-   etapas;
-   decisões;
-   bifurcações;
-   atividades paralelas;
-   convergências;
-   SLAs;
-   documentos;
-   notificações;
-   permissões;
-   dashboards.

O código-base deve permanecer único para todos os tenants.

## 2.2 Multi-tenant desde o primeiro dia

Todo dado operacional deve possuir contexto de tenant.

O isolamento deve ser garantido em múltiplas camadas:

-   banco de dados;
-   RLS;
-   autorização da aplicação;
-   armazenamento;
-   APIs;
-   logs;
-   notificações.

Nunca confiar apenas no frontend para isolamento.

## 2.3 Histórico é permanente

Movimentações relevantes não devem ser apagadas.

Correções devem gerar novos eventos.

Documentos substituídos devem preservar versões anteriores.

Workflow publicado não deve ser editado retroativamente.

## 2.4 O processo executado é imutável em relação às regras históricas

Um processo iniciado sob uma configuração deve continuar obedecendo
àquela configuração.

Alterações posteriores servem para novos processos.

## 2.5 O sistema deve mostrar onde o processo está parado

O produto deve responder rapidamente:

-   o que está atrasado?
-   quem está acumulando trabalho?
-   qual grupo está bloqueando?
-   qual atividade está esperando terceiro?
-   qual documento está faltando?
-   qual convergência está aguardando?
-   quais processos estão próximos do SLA?

Isso é o conceito de **Tower of Control**.

------------------------------------------------------------------------

# 3. Escopo e posicionamento

## 3.1 Público principal

-   transportadoras;
-   embarcadores.

## 3.2 Participantes

Podem participar de um tenant:

-   embarcador;
-   transportador;
-   gerenciadora de risco;
-   corretora;
-   seguradora;
-   áreas internas;
-   fornecedores;
-   outros participantes configuráveis.

Participantes externos não precisam necessariamente possuir uma licença
própria do SaaS. A arquitetura deve permitir participação e interação
sem transformar toda organização externa em cliente pagante.

## 3.3 Posicionamento

O produto deve ser percebido como:

> plataforma de governança, execução, rastreabilidade e controle do
> ciclo de sinistros.

Não como:

> simples cadastro de ocorrências.

------------------------------------------------------------------------

# 4. Hierarquia do sistema

A hierarquia conceitual é:

``` text
PLATAFORMA
└── TENANT
    ├── Organizações
    ├── Usuários / memberships
    ├── Grupos
    ├── Papéis e permissões
    ├── Tipos de sinistro
    ├── Workflows
    ├── Workflow Versions
    ├── Regras
    ├── SLAs
    ├── Documentos
    ├── Notificações
    ├── Integrações
    ├── Dashboards
    └── Sinistros
        └── Ciclos
            └── Execução do Workflow
                ├── Atividades
                ├── Bifurcações
                ├── Decisões
                ├── Pendências
                ├── Convergências
                └── Auditoria
```

------------------------------------------------------------------------

# 5. Multi-tenant e usuários

## 5.1 Usuário global

Um usuário pode existir globalmente e participar de vários tenants.

Exemplo:

``` text
Usuário
├── Tenant A
│   └── Grupo A
└── Tenant B
    └── Grupo B
```

As regras do Tenant A não devem ser carregadas para o Tenant B.

## 5.2 Membership

A relação entre usuário e tenant deve ser uma entidade própria.

Ela controla, entre outros:

-   tenant;
-   status;
-   grupos;
-   papel;
-   permissões efetivas;
-   data de entrada;
-   data de saída/inativação.

CPF pode ser atributo de identidade, mas não deve ser a chave de
autorização.

## 5.3 Grupos

Grupo representa uma unidade operacional.

Exemplos:

-   Regulação;
-   Operacional;
-   Jurídico;
-   Financeiro;
-   Gestão de Risco;
-   Seguros;
-   Comitê.

Uma etapa aponta para um grupo, não para uma pessoa.

Todos os membros ativos do grupo podem ser responsáveis pela atividade.

Não utilizar modelo obrigatório de "assumir tarefa" ou "dono individual"
no núcleo do produto.

## 5.4 Usuário inativo

Usuário inativo:

-   não recebe novas atribuições;
-   não recebe novas notificações;
-   permanece no histórico;
-   mantém autoria de eventos anteriores.

------------------------------------------------------------------------

# 6. Organizações

Uma organização pode participar de vários tenants.

Exemplo:

``` text
Organização X
├── é proprietária do Tenant A
└── participa do Tenant B
```

A relação organização-tenant deve ser independente.

O papel da organização deve ser configurável.

Não assumir que uma organização é sempre "transportadora" ou sempre
"seguradora".

------------------------------------------------------------------------

# 7. Sinistro x Ciclo

## 7.1 Sinistro

Representa o evento de negócio.

Exemplos:

-   ocorrência;
-   acidente;
-   roubo;
-   avaria;
-   perda;
-   outro tipo configurado.

## 7.2 Ciclo

Representa uma **execução formal do processo**.

O ciclo é a unidade operacional e comercial cobrável.

Um sinistro pode possuir mais de um ciclo ao longo de sua existência.

Exemplo:

``` text
Sinistro 2026-00125
├── Ciclo 1 — Roubo — Descartado
└── Ciclo 2 — Acidente — Concluído
```

## 7.3 Regra de cobrança

Cada ciclo formalizado gera uma cobrança de ciclo conforme o
plano/contrato.

Uma bifurcação paralela não cria novo ciclo.

Uma etapa repetida não cria novo ciclo.

Uma contestação adicional não cria novo ciclo.

Uma correção de dados não cria novo ciclo.

------------------------------------------------------------------------

# 8. Quando criar novo ciclo

Novo ciclo somente quando houver uma **nova execução formal do
processo**.

### Não cria novo ciclo

-   alteração comum de campo;
-   inclusão de documento;
-   substituição de documento;
-   retorno de etapa;
-   repetição de etapa;
-   contestação;
-   nova rodada de análise;
-   bifurcação;
-   convergência;
-   reabertura autorizada para correção/complementação.

### Pode criar novo ciclo

-   processo anterior formalmente descartado e necessidade de novo
    processo;
-   reabertura estrutural de processo já encerrado;
-   mudança de classificação que exige outro workflow;
-   reinício formal autorizado.

A criação do novo ciclo deve registrar a relação com o ciclo anterior.

------------------------------------------------------------------------

# 9. Reabertura e descarte

## 9.1 Reabertura simples

Se houver autorização para editar/corrigir/complementar um processo:

-   mantém o mesmo ciclo;
-   registra evento de reabertura;
-   exige justificativa;
-   registra usuário e data/hora;
-   mantém histórico.

## 9.2 Descarte

Quando o processo anterior não deve mais ser considerado a execução
válida:

-   ciclo recebe status `DESCARTADO`;
-   não é apagado;
-   exige justificativa;
-   registra motivo;
-   pode originar novo ciclo.

Motivos sugeridos:

-   classificação incorreta;
-   processo duplicado;
-   dados insuficientes;
-   erro operacional;
-   reinício estrutural;
-   outro.

------------------------------------------------------------------------

# 10. Reclassificação

## 10.1 Dentro da mesma família de workflow

Exemplo:

``` text
Acidente
├── Tombamento
├── Colisão
└── Capotamento
```

Tombamento → Colisão pode ocorrer no mesmo ciclo se o workflow aplicável
permanecer o mesmo.

A alteração deve ser auditada.

## 10.2 Mudança estrutural de workflow

Exemplo:

``` text
Roubo
↓
Workflow Roubo

muda para

Acidente
↓
Workflow Acidente
```

Se os workflows forem estruturalmente diferentes, não alterar
retroativamente o ciclo original.

Fluxo:

``` text
Ciclo 1 — Roubo
        ↓
     DESCARTADO
        ↓
Ciclo 2 — Acidente
```

------------------------------------------------------------------------

# 11. Workflow Engine

O motor é o núcleo técnico do produto.

O workflow é um grafo configurável.

Ele não deve assumir que todos os processos são lineares.

## 11.1 Tipos de elementos

O builder deve suportar pelo menos:

1.  Etapa / atividade
2.  Decisão
3.  Bifurcação paralela
4.  Convergência / Join
5.  Espera
6.  Pendência
7.  Fim

## 11.2 Transições

Conexões entre elementos podem ser:

-   normais;
-   condicionais;
-   paralelas;
-   retorno;
-   encerramento.

------------------------------------------------------------------------

# 12. Bifurcação condicional e paralela

O produto deve ser neutro.

O administrador decide o comportamento.

## 12.1 Caminho único

``` text
Decisão
├── Transportadora
├── Seguradora
└── Embarcador
```

Configuração:

> escolha única.

Somente um caminho é ativado.

## 12.2 Paralelismo

``` text
Abertura
├── Operacional
├── Seguradora
└── Financeiro
```

Configuração:

> execução paralela.

Mais de um ramo pode ficar ativo simultaneamente.

## 12.3 Mistura

Um mesmo workflow pode possuir:

-   decisões exclusivas;
-   paralelismos;
-   joins;
-   loops;
-   retornos;
-   decisões dentro de ramos paralelos.

------------------------------------------------------------------------

# 13. Ramificações obrigatórias e opcionais

Cada ramo de uma bifurcação pode ser:

-   obrigatório;
-   opcional.

Isso é configurado pelo designer.

"Opcional" não significa irrelevante.

Uma atividade opcional ainda possui:

-   responsável;
-   SLA, quando aplicável;
-   histórico;
-   resultado;
-   auditoria.

Pode existir ação explícita:

> Dispensar ramificação.

Essa ação exige:

-   autorização;
-   justificativa;
-   usuário;
-   data/hora.

------------------------------------------------------------------------

# 14. Convergência / Join

Uma convergência controla quando o workflow pode continuar.

Regras configuráveis:

-   todos;
-   todos os obrigatórios;
-   qualquer um;
-   mínimo de N;
-   regra condicional.

Exemplo:

``` text
Operacional ─── concluído ─┐
Seguradora ──── concluído ─┼── JOIN
Financeiro ──── andamento ─┘
```

Se Financeiro for obrigatório:

> Join = aguardando.

O ciclo não avança para a próxima etapa.

As atividades já concluídas permanecem concluídas.

------------------------------------------------------------------------

# 15. Estado da atividade, ramificação e Join

## Atividade

-   não iniciada;
-   em andamento;
-   pausada;
-   concluída;
-   cancelada;
-   dispensada, quando aplicável.

## Ramificação

-   ativa;
-   concluída;
-   cancelada;
-   dispensada.

## Join

-   aguardando;
-   liberado;
-   bloqueado;
-   concluído.

O sistema deve ser capaz de mostrar:

> "Aguardando 1 de 3 atividades obrigatórias."

------------------------------------------------------------------------

# 16. Execução paralela

O sinistro/ciclo não deve possuir apenas um `current_stage_id`.

Um ciclo pode ter várias atividades ativas.

Exemplo:

``` text
Ciclo
├── Operacional — concluído
├── Seguradora — em andamento
└── Financeiro — aguardando terceiro
```

O estado geral do ciclo deve ser calculado/gerenciado a partir da
execução, sem destruir a visão detalhada das atividades.

------------------------------------------------------------------------

# 17. Stage Instance / Pass

Cada entrada em uma etapa deve gerar uma instância de execução.

Se uma etapa for executada novamente:

``` text
Análise
├── Passagem 1
└── Passagem 2
```

Não sobrescrever a passagem anterior.

Isso permite medir:

-   tempo por passagem;
-   quantidade de retornos;
-   retrabalho;
-   quantidade de tentativas;
-   histórico completo.

------------------------------------------------------------------------

# 18. Subfluxos

O produto deve estar arquiteturalmente preparado para subfluxos
reutilizáveis.

Exemplo:

``` text
Workflow Roubo
└── Subfluxo Seguradora

Workflow Acidente
└── Subfluxo Seguradora
```

Não é requisito obrigatório do primeiro MVP, mas o modelo não deve
impedir essa evolução.

------------------------------------------------------------------------

# 19. Decisões

Decisões devem ser entidades estruturadas.

Uma decisão pode registrar:

-   pergunta;
-   opções;
-   resultado escolhido;
-   responsável;
-   data/hora;
-   justificativa;
-   evidências;
-   aprovação;
-   histórico.

Exemplo:

> Quem absorverá o prejuízo?

Resultado:

> Seguradora.

A decisão deve controlar o caminho seguinte quando configurada como
decisão de roteamento.

------------------------------------------------------------------------

# 20. Responsabilidade financeira

O produto deve suportar o cenário atual de decisão entre:

-   transportadora;
-   seguradora;
-   embarcador/CD/planta.

A arquitetura deve permitir **responsabilidade compartilhada**, mesmo
que o primeiro template utilize responsabilidade única.

Modelo recomendado:

``` text
Responsabilidade
├── Organização A — percentual/valor
├── Organização B — percentual/valor
└── Organização C — percentual/valor
```

A decisão pode ser:

-   exclusiva;
-   compartilhada.

Essa capacidade deve ser configurável.

------------------------------------------------------------------------

# 21. Pendências

Pendência não é necessariamente uma nova etapa.

Exemplo:

``` text
Aguardar análise da seguradora
└── Pendência:
    Documento complementar solicitado
```

A pendência deve registrar:

-   título;
-   descrição;
-   solicitante;
-   responsável;
-   prazo;
-   documentos;
-   status;
-   data de abertura;
-   data de resolução;
-   histórico.

Isso evita retornar artificialmente a etapa anterior apenas para pedir
um documento.

------------------------------------------------------------------------

# 22. Repetição e loops

Loops são permitidos.

Exemplo:

``` text
Contestação
↓
Análise
↓
Resposta
↓
Mantém contestação?
├── Não → Comitê
└── Sim → Contestação
```

O limite de repetições deve ser configurável:

-   ilimitado;
-   máximo N;
-   exigir autorização após N;
-   condicionado a regra.

Cada repetição gera nova instância/pass e mantém o histórico.

------------------------------------------------------------------------

# 23. Status geral do ciclo

Status sugeridos:

-   Rascunho
-   Aberto
-   Em andamento
-   Aguardando
-   Bloqueado
-   Concluído
-   Cancelado
-   Descartado
-   Arquivado

### Regras

`Concluído`, `Cancelado` e `Descartado` são estados controlados.

Reabertura exige permissão e justificativa.

`Descartado` não significa apagado.

`Arquivado` é política de armazenamento/retensão e não substitui o
estado operacional original.

------------------------------------------------------------------------

# 24. SLA

O motor de SLA deve suportar:

-   SLA por atividade;
-   SLA por etapa;
-   SLA do ciclo;
-   SLA global;
-   SLA de execução;
-   SLA de resposta externa;
-   SLA de espera.

## 24.1 Calendário

Deve suportar:

-   dias úteis;
-   fins de semana;
-   feriados;
-   horários comerciais;
-   calendários por tenant;
-   exceções.

## 24.2 Alertas

Percentuais configuráveis, por exemplo:

-   75%;
-   90%;
-   95%;
-   100%.

Não hardcodar esses valores.

## 24.3 Escalonamento

Pode escalar para:

-   grupo responsável;
-   gestor;
-   administrador;
-   outro grupo configurado.

## 24.4 Pausa

Pausa de SLA não pode ser um botão livre para evitar atraso.

Deve exigir:

-   motivo;
-   tipo de pausa;
-   autorização, quando aplicável;
-   data/hora;
-   regra que determina se o relógio para.

Exemplo:

> aguardando terceiro.

------------------------------------------------------------------------

# 25. Documento / GED

Documento é entidade de negócio, não apenas arquivo.

## 25.1 Tipos

Exemplos:

-   BO/ocorrência;
-   laudo;
-   relatório;
-   comprovante;
-   documento de motorista;
-   documento de veículo;
-   documento financeiro;
-   documento jurídico;
-   documento de seguradora;
-   outros.

Os tipos são configuráveis.

## 25.2 Obrigatoriedade

Um documento pode ser:

-   obrigatório;
-   opcional.

A obrigatoriedade pode estar vinculada:

-   à etapa;
-   à atividade;
-   à transição;
-   à decisão.

## 25.3 Estados

-   solicitado;
-   recebido;
-   em validação;
-   validado;
-   rejeitado;
-   substituído.

## 25.4 Versionamento

Substituição não apaga versão anterior.

Exemplo:

``` text
Laudo
├── v1
├── v2
└── v3
```

## 25.5 Permissões

Configurar:

-   quem pode visualizar;
-   quem pode enviar;
-   quem pode validar;
-   quem pode rejeitar.

------------------------------------------------------------------------

# 26. Armazenamento

Não usar limite universal fixo.

A política deve separar:

1.  limite por arquivo;
2.  quantidade de arquivos por ciclo;
3.  franquia de armazenamento por ciclo;
4.  armazenamento total do tenant;
5.  excedente.

Política de excedente deve ser configurável:

-   bloquear;
-   permitir e cobrar;
-   permitir até limite adicional;
-   outro comportamento contratual.

O armazenamento deve ser tratado como variável comercial.

------------------------------------------------------------------------

# 27. Retenção

Política mínima planejada:

> 24 meses.

Retenção não encerra processo.

Após o período aplicável:

``` text
Concluído
↓
Elegível para arquivamento
↓
Exportação/backup
↓
Arquivado
```

A retenção deve respeitar:

-   contrato;
-   obrigações legais;
-   política do tenant;
-   requisitos de auditoria.

------------------------------------------------------------------------

# 28. Detecção de duplicidade

A verificação ocorre **na primeira entrada do processo**, antes da
execução normal.

Dados usados como evidência podem incluir:

-   placa;
-   data;
-   horário;
-   transportador;
-   número externo;
-   referência da seguradora;
-   local;
-   tipo de sinistro;
-   outros campos configuráveis.

Exemplo:

> mesma placa + data próxima ±2 dias.

O sistema deve apresentar:

> Possível duplicidade. Verifique antes de continuar.

Não bloquear automaticamente.

Usuário pode:

-   confirmar duplicidade;
-   informar que não é duplicado.

Registrar:

-   candidato;
-   evidências;
-   confiança;
-   decisão;
-   usuário;
-   data/hora;
-   justificativa.

Após uma decisão de "não é duplicado", evitar repetir a mesma
advertência sem nova evidência relevante.

------------------------------------------------------------------------

# 29. Importação em massa

Roadmap inicial.

Fluxo:

``` text
Upload
↓
Validação
↓
Prévia
↓
Erros
↓
Correção
↓
Confirmação
↓
Criação
↓
Relatório
```

A importação deve utilizar as mesmas regras de negócio da criação
manual.

Deve validar:

-   tenant;
-   tipo;
-   campos obrigatórios;
-   workflow;
-   versão;
-   grupos;
-   duplicidade;
-   limites;
-   permissões.

Relatório:

``` text
300 enviados
287 criados
8 com erro
3 possíveis duplicidades
2 ignorados
```

------------------------------------------------------------------------

# 30. Workflow Versioning

Workflow deve possuir:

-   Draft;
-   validação;
-   publicação;
-   versão publicada;
-   status de versão.

Após publicação:

> versão é imutável.

Alterações criam nova versão.

Ciclos existentes continuam vinculados à versão original.

Migração de ciclo para nova versão, se futuramente necessária, deve ser:

-   explícita;
-   autorizada;
-   registrada;
-   auditada.

------------------------------------------------------------------------

# 31. Snapshot de configuração

No início do ciclo, registrar a configuração efetiva necessária para
reproduzir sua execução.

Referências/versionamentos devem incluir, conforme aplicável:

-   workflow;
-   regras;
-   SLAs;
-   documentos;
-   campos;
-   permissões operacionais relevantes;
-   políticas de armazenamento/cobrança aplicáveis.

O objetivo é:

> alteração futura de configuração não modificar retroativamente
> processos existentes.

------------------------------------------------------------------------

# 32. Visibilidade e permissões

Separar:

1.  acesso ao sinistro;
2.  visibilidade de campo;
3.  visibilidade no grid;
4.  editabilidade;
5.  obrigatoriedade;
6.  acesso a documentos;
7.  ações permitidas.

Não usar uma única regra de "usuário pode ver".

Campos podem ser:

-   visíveis;
-   ocultos;
-   somente leitura;
-   editáveis;
-   obrigatórios.

A configuração deve ser feita pelo tenant.

------------------------------------------------------------------------

# 33. Auditoria

Audit log é obrigatório.

Registrar:

-   quem;
-   quando;
-   tenant;
-   ação;
-   entidade;
-   identificador;
-   valor anterior;
-   valor novo;
-   motivo;
-   origem;
-   contexto.

Exemplos:

-   alteração de valor;
-   alteração de classificação;
-   abertura de atividade;
-   conclusão;
-   retorno;
-   bifurcação;
-   Join;
-   decisão;
-   reabertura;
-   descarte;
-   nova versão;
-   documento;
-   mudança de permissão;
-   configuração de workflow.

O audit log deve ser append-only na prática operacional.

------------------------------------------------------------------------

# 34. Tower of Control

É uma das principais telas do produto.

Deve responder:

> "Onde está o gargalo?"

Indicadores:

-   total;
-   abertos;
-   em andamento;
-   próximos do SLA;
-   atrasados;
-   aguardando terceiros;
-   bloqueados;
-   aguardando convergência;
-   documentação pendente;
-   backlog;
-   aging;
-   atividades por grupo;
-   reaberturas;
-   descartes;
-   retrabalho.

Visualizações:

-   por grupo;
-   por etapa;
-   por tipo;
-   por organização;
-   por SLA;
-   por idade;
-   por responsável operacional;
-   por resultado.

------------------------------------------------------------------------

# 35. Métricas

## Operacionais

-   abertos;
-   concluídos;
-   atrasados;
-   próximos do SLA;
-   tempo médio;
-   tempo por etapa;
-   tempo por atividade;
-   aging;
-   backlog;
-   reincidência.

## Financeiras

-   prejuízo total;
-   valor em análise;
-   valor debitado;
-   valor recuperado;
-   valor pendente;
-   custo por ciclo;
-   responsabilidade por organização.

## Qualidade

-   documentos pendentes;
-   documentos rejeitados;
-   retrabalho;
-   retornos;
-   reaberturas;
-   descartes;
-   reincidência;
-   causas.

## Workflow

-   quantidade de bifurcações;
-   tempo de espera em Join;
-   atividade mais lenta;
-   grupo com maior backlog;
-   loops;
-   quantidade de passagens;
-   SLA por atividade.

------------------------------------------------------------------------

# 36. LGPD e segurança

LGPD é requisito arquitetural desde o início.

## Dados potencialmente pessoais

-   CPF;
-   telefone;
-   e-mail;
-   dados de motoristas;
-   documentos;
-   imagens;
-   informações jurídicas;
-   informações financeiras.

## Requisitos

-   minimização;
-   controle de acesso;
-   segregação de tenant;
-   RLS;
-   logs;
-   retenção;
-   exportação;
-   anonimização quando aplicável;
-   exclusão quando aplicável;
-   gestão de base legal e responsabilidades contratuais;
-   proteção de arquivos;
-   criptografia em trânsito e em repouso conforme infraestrutura.

Não criar um módulo gigantesco de LGPD no MVP, mas nenhuma decisão
arquitetural deve inviabilizar conformidade futura.

------------------------------------------------------------------------

# 37. UX de configuração

Evitar uma interface com centenas de opções simultaneamente.

Três níveis:

## Básico

-   nome;
-   grupo;
-   SLA;
-   documentos;
-   transições.

## Avançado

-   campos;
-   permissões;
-   notificações;
-   bifurcações;
-   joins;
-   regras.

## Especialista

-   automações;
-   integrações;
-   webhooks;
-   condições avançadas.

Princípio:

> simples para começar, poderoso quando necessário.

------------------------------------------------------------------------

# 38. Workflow Validator

Antes de publicar um workflow, validar:

-   etapas sem responsável;
-   transições sem destino;
-   bifurcação sem saída;
-   Join sem origem;
-   Join impossível;
-   ramo obrigatório sem encerramento;
-   loop sem saída;
-   SLA inválido;
-   documento obrigatório impossível de satisfazer;
-   decisão sem opções;
-   condição inconsistente;
-   caminho que nunca chega a um fim.

O workflow só deve ser publicado se não houver erro crítico.

Avisos podem existir sem bloquear.

------------------------------------------------------------------------

# 39. Onboarding

Fluxo assistido:

1.  escolher modelo operacional;
2.  selecionar tipos de sinistro;
3.  escolher template;
4.  configurar grupos;
5.  convidar usuários;
6.  revisar workflow;
7.  validar workflow;
8.  publicar;
9.  criar primeiro sinistro.

O objetivo é reduzir tempo até o primeiro processo real.

------------------------------------------------------------------------

# 40. Templates

Templates iniciais:

-   roubo;
-   acidente;
-   avaria;
-   perda;
-   quebra de GR;
-   acionamento de seguradora.

Template é ponto de partida.

Ao ser aplicado ao tenant:

> o template é copiado.

Alterações posteriores no template original não alteram automaticamente
o tenant.

Templates também devem ser versionados.

------------------------------------------------------------------------

# 41. Limite entre configuração e customização

## Configuração

Incluída no produto.

Exemplos:

-   alterar SLA;
-   criar grupo;
-   criar campo;
-   criar etapa;
-   configurar documento.

## Parametrização

Usa capacidades existentes para regras específicas.

Pode fazer parte do onboarding/contrato conforme plano.

## Desenvolvimento sob medida

Necessidade que exige mudança do produto.

Deve ser tratado como projeto separado.

Princípio:

> não criar uma versão de código exclusiva para cada cliente.

Se uma necessidade aparecer repetidamente, avaliar transformá-la em
capacidade nativa da plataforma.

------------------------------------------------------------------------

# 42. Planos comerciais

Valores de referência consolidados:

  Plano             Implantação    Mensalidade   Valor por ciclo
  -------------- -------------- -------------- -----------------
  Standard              R\$ 750        R\$ 349            R\$ 92
  Professional        R\$ 1.650        R\$ 649            R\$ 87
  Enterprise          R\$ 2.300        R\$ 989            R\$ 81
  Custom           Sob proposta   Sob proposta      Sob contrato

Os valores devem ficar em configuração comercial, nunca hardcoded no
código.

## Cobrança

### Na abertura do ciclo

Cobrar o valor base do ciclo.

### No encerramento do ciclo

Calcular excedentes aplicáveis, principalmente armazenamento.

Exemplo:

``` text
Ciclo aberto em janeiro
→ cobrança do ciclo em janeiro

Ciclo concluído em dezembro
→ cálculo do armazenamento final
→ cobrança do excedente em dezembro
```

------------------------------------------------------------------------

# 43. Limites dos planos

Os planos não devem ser diferenciados apenas por "quantidade de
sinistros".

Devem representar capacidade.

Categorias de limites:

-   usuários;
-   usuários ativos;
-   administradores;
-   grupos;
-   organizações;
-   workflows;
-   versões;
-   etapas;
-   transições;
-   bifurcações;
-   joins;
-   campos personalizados;
-   tipos de sinistro;
-   ciclos;
-   arquivos por ciclo;
-   armazenamento por ciclo;
-   tamanho máximo de arquivo;
-   armazenamento total;
-   documentos;
-   automações;
-   notificações;
-   integrações;
-   webhooks;
-   relatórios;
-   retenção;
-   white-label;
-   suporte.

A matriz deve ser configurável.

Modelo:

``` text
Plan
↓
Plan Limits
↓
Tenant Contract
↓
Effective Limits
```

O contrato pode sobrescrever limites padrão.

------------------------------------------------------------------------

# 44. Storage e excedentes

A política deve separar:

-   franquia;
-   consumo real;
-   excedente;
-   preço por unidade;
-   regra de cobrança.

Evento de cobrança deve registrar:

-   tenant;
-   ciclo;
-   consumo;
-   franquia;
-   excedente;
-   tarifa;
-   competência;
-   status.

------------------------------------------------------------------------

# 45. White-label

Arquitetura preparada desde o início.

Tenant pode configurar:

-   nome comercial;
-   logo;
-   favicon;
-   cores;
-   domínio/subdomínio;
-   identidade de e-mails;
-   templates de e-mail.

Modos futuros:

1.  marca da plataforma;
2.  co-branding;
3.  white-label.

A marca comercial do produto permanece separada da marca do tenant.

------------------------------------------------------------------------

# 46. Integrações

Não são requisito completo do primeiro MVP, mas a arquitetura deve
prever:

-   API;
-   webhooks;
-   ERP;
-   TMS;
-   sistemas de gerenciamento de risco;
-   seguradoras;
-   BI;
-   e-mail;
-   WhatsApp;
-   Teams.

Evitar acoplamento direto entre workflow e uma integração específica.

Usar eventos de domínio quando apropriado.

------------------------------------------------------------------------

# 47. Notificações

Notificações devem ser dirigidas por eventos.

Exemplos:

-   atividade criada;
-   atividade próxima do SLA;
-   SLA vencido;
-   documento solicitado;
-   documento rejeitado;
-   decisão tomada;
-   pendência criada;
-   pendência vencida;
-   Join aguardando;
-   ciclo concluído;
-   ciclo reaberto;
-   ciclo descartado.

Destinatários podem ser:

-   grupo;
-   usuário;
-   organização;
-   gestor;
-   participante configurado.

O sistema deve resolver membros ativos no momento do envio.

O histórico deve preservar quem efetivamente recebeu.

------------------------------------------------------------------------

# 48. Caso real inicial --- fluxo de gestão de sinistros

O primeiro template deve ser inspirado no fluxo operacional fornecido:

## Macroprocesso 1 --- Regulação e análise técnica

Responsabilidades possíveis:

-   receber e registrar;
-   coletar documentos;
-   analisar ocorrido;
-   elaborar relatório;
-   análise crítica;
-   consolidar análise.

SLA de referência do modelo:

> até 7 dias.

## Macroprocesso 2 --- Definição da responsabilidade financeira

Atividades:

-   avaliar documentação;
-   verificar quebra de GR;
-   verificar enquadramento;
-   definir responsável;
-   emitir decisão;
-   encaminhar tratamento.

SLA de referência:

> até 5 dias.

## Decisão de responsabilidade

Possíveis destinos iniciais:

-   transportadora;
-   seguradora;
-   CD/planta/embarcador.

O mecanismo deve permitir escolha única ou paralelo, conforme
configuração do workflow.

------------------------------------------------------------------------

# 49. Subfluxo 3A --- Transportadora

Fluxo de referência:

``` text
Notificar Transportadora
↓
Aguardar manifestação
↓
Transportadora contesta?
├── Não → Débito
└── Sim
    ↓
    Análise da contestação
    ↓
    Enviar para Transportadora
    ↓
    Mantém contestação?
    ├── Não → Comitê
    └── Sim → nova rodada de contestação
             ↓
             Comitê
             ↓
             Decisão Jurídica
```

A repetição de contestação é permitida e configurável.

------------------------------------------------------------------------

# 50. Subfluxo 3B --- Seguradora

Fluxo de referência:

``` text
Acionar Seguradora
↓
Enviar documentação
↓
Aguardar análise
↓
Indenização aprovada?
├── Não → Encerrar
└── Sim
    ↓
    Aguardar pagamento
    ↓
    Encerrar
```

Se houver solicitação de documentação complementar:

``` text
Aguardar análise
↓
Pendência de documento complementar
↓
Documento recebido
↓
Retorna à espera de análise
```

Não é necessário voltar artificialmente à etapa de envio original.

------------------------------------------------------------------------

# 51. Subfluxo 3C --- CD/Planta/Prejuízo

Fluxo de referência:

``` text
Comunicar CD/Planta
↓
Registrar aceite da absorção do prejuízo
↓
Registrar tratativas/justificativas
↓
Encerrar
```

Impactos financeiros devem ser registrados para indicadores.

------------------------------------------------------------------------

# 52. O que o primeiro protótipo deve provar

O primeiro protótipo não precisa implementar todos os módulos
comerciais.

Ele deve provar o motor.

### Cenário 1

Sinistro de roubo:

-   regulação;
-   responsabilidade;
-   seguradora;
-   documentação;
-   espera;
-   aprovação;
-   pagamento;
-   encerramento.

### Cenário 2

Acidente:

-   contestação;
-   retorno;
-   nova rodada;
-   comitê;
-   jurídico;
-   encerramento.

### Cenário 3

Workflow paralelo:

``` text
Operacional
Seguradora
Financeiro
↓
Join
↓
Jurídico
```

### Cenário 4

Classificação incorreta:

``` text
Ciclo 1 — Roubo
↓
Descartado
↓
Ciclo 2 — Acidente
```

### Cenário 5

Reabertura simples:

``` text
Concluído
↓
Reaberto com autorização
↓
Correção
↓
Concluído
```

------------------------------------------------------------------------

# 53. Modelo de dados conceitual

Entidades principais:

``` text
tenants
organizations
tenant_organizations
users
tenant_memberships
groups
group_members
roles
permissions
role_permissions
claim_types
claim_categories

workflows
workflow_versions
workflow_nodes
workflow_edges
workflow_rules
workflow_slas
workflow_document_requirements

claims
claim_cycles
cycle_configuration_snapshots

stage_instances
activity_instances
decisions
branches
branch_instances
joins
join_instances
pending_items

documents
document_types
document_versions

comments
notifications
notification_deliveries

duplicate_checks
duplicate_candidates

billing_events
storage_usage

audit_logs

imports
import_rows
```

O modelo físico pode ser refinado durante implementação, mas os
conceitos acima devem ser preservados.

------------------------------------------------------------------------

# 54. RLS e segurança de dados

Todas as entidades tenant-scoped devem possuir referência ao tenant
direta ou por relacionamento seguro.

RLS deve impedir:

-   leitura cruzada;
-   escrita cruzada;
-   acesso a storage de outro tenant;
-   consulta de auditoria de outro tenant.

Não depender apenas de filtros na aplicação.

------------------------------------------------------------------------

# 55. Arquitetura técnica inicial

Stack preferencial:

-   Next.js;
-   Vercel;
-   Supabase;
-   PostgreSQL;
-   Supabase Auth;
-   Supabase Storage;
-   Supabase Edge Functions quando apropriado;
-   Supabase Cron/scheduler para rotinas;
-   Resend para e-mail;
-   GitHub.

## Desenvolvimento

Priorizar recursos gratuitos durante construção/testes.

## Produção comercial

Planejar upgrade para infraestrutura comercial adequada.

Não criar dependências que exijam reconstrução quando o projeto sair do
free tier.

------------------------------------------------------------------------

# 56. Princípios de backend

-   lógica de negócio não deve ficar apenas no frontend;
-   autorização deve ser validada no backend;
-   RLS como camada adicional;
-   eventos relevantes devem ser auditáveis;
-   operações críticas devem ser idempotentes;
-   jobs de SLA devem ser centralizados;
-   notificações devem ser orientadas a eventos;
-   arquivos devem ser tratados via storage seguro;
-   preços e limites devem ser dados/configuração;
-   workflow publicado é imutável.

------------------------------------------------------------------------

# 57. Scheduler de SLA

Não criar um cron independente para cada sinistro/atividade.

Usar mecanismo centralizado para:

-   localizar atividades próximas do vencimento;
-   gerar alertas;
-   marcar atraso;
-   executar escalonamento;
-   processar esperas;
-   atualizar indicadores.

------------------------------------------------------------------------

# 58. Estado derivado e fonte de verdade

O sistema deve distinguir:

-   estado persistido da atividade;
-   eventos históricos;
-   estado do ciclo;
-   estado do Join;
-   estado geral do workflow.

Não depender de um único campo para representar todo o processo.

------------------------------------------------------------------------

# 59. UX operacional

A tela de sinistro deve priorizar:

## Cabeçalho

-   número;
-   tipo;
-   status;
-   ciclo atual;
-   SLA;
-   criticidade;
-   valor;
-   organização.

## Execução

Mostrar visualmente:

-   atividades ativas;
-   ramos paralelos;
-   concluídos;
-   aguardando;
-   bloqueados;
-   Join;
-   próxima ação.

## Timeline

Mostrar:

-   eventos;
-   decisões;
-   documentos;
-   mudanças;
-   retornos;
-   reaberturas;
-   auditoria relevante.

## Ações

Mostrar somente ações permitidas ao usuário atual.

------------------------------------------------------------------------

# 60. Tela do Workflow Builder

Deve permitir:

-   criar nó;
-   conectar;
-   duplicar;
-   editar;
-   excluir;
-   definir grupo;
-   definir SLA;
-   definir documentos;
-   definir campos;
-   definir transições;
-   criar decisão;
-   criar paralelo;
-   criar Join;
-   criar espera;
-   criar pendência;
-   configurar condições;
-   validar;
-   publicar.

A interface deve mostrar erros antes da publicação.

------------------------------------------------------------------------

# 61. Dashboard inicial

Dashboard deve conter:

### Cards

-   total;
-   em andamento;
-   próximos do SLA;
-   atrasados;
-   aguardando terceiros;
-   bloqueados;
-   aguardando convergência.

### Gráficos

-   evolução por período;
-   aging;
-   backlog por grupo;
-   SLA por grupo;
-   tempo por etapa;
-   tipos de sinistro;
-   valores financeiros.

### Lista operacional

> "O que precisa de atenção agora?"

Ordenada por criticidade operacional.

------------------------------------------------------------------------

# 62. API e eventos futuros

Preparar conceitos de eventos como:

-   `claim.created`
-   `cycle.created`
-   `cycle.reopened`
-   `cycle.discarded`
-   `activity.started`
-   `activity.completed`
-   `activity.overdue`
-   `branch.opened`
-   `join.waiting`
-   `join.released`
-   `document.received`
-   `document.rejected`
-   `decision.made`
-   `cycle.completed`

Esses eventos podem futuramente alimentar:

-   webhooks;
-   integrações;
-   notificações;
-   BI;
-   automações.

------------------------------------------------------------------------

# 63. Regras de cobrança

A cobrança deve ser orientada a eventos de negócio.

## Evento de abertura

Quando o ciclo for formalmente protocolizado/iniciado:

> gerar evento de cobrança do ciclo.

## Excedente

Quando o ciclo terminar:

> consolidar armazenamento/uso aplicável.

## Cancelamento antes da formalização

Rascunho que nunca virou ciclo formal não deve gerar cobrança de ciclo.

Uma vez formalizado, o comportamento comercial deve seguir o contrato.

------------------------------------------------------------------------

# 64. Configuração comercial

Nunca hardcodar:

-   preço do ciclo;
-   mensalidade;
-   franquia;
-   limites;
-   preço de storage;
-   limites de usuários.

Tudo deve estar em configuração comercial.

------------------------------------------------------------------------

# 65. Auditoria comercial

Registrar eventos de:

-   ciclo faturável;
-   excedente;
-   alteração contratual;
-   alteração de limite;
-   mudança de plano;
-   override de limite;
-   cobrança.

------------------------------------------------------------------------

# 66. Roadmap sugerido

## Fase 1 --- Fundamento

-   autenticação;
-   tenants;
-   memberships;
-   grupos;
-   organizações;
-   RLS;
-   auditoria;
-   estrutura de sinistro/ciclo.

## Fase 2 --- Workflow Engine

-   builder;
-   etapas;
-   transições;
-   decisões;
-   loops;
-   bifurcação;
-   paralelo;
-   Join;
-   espera;
-   pendências;
-   versionamento.

## Fase 3 --- Operação

-   documentos;
-   SLA;
-   notificações;
-   reabertura;
-   descarte;
-   duplicidade;
-   histórico.

## Fase 4 --- Gestão

-   Tower of Control;
-   indicadores;
-   dashboards;
-   relatórios.

## Fase 5 --- Entrada de dados

-   importação em massa;
-   templates;
-   onboarding assistido.

## Fase 6 --- Comercial/escala

-   billing;
-   excedentes;
-   white-label;
-   integrações;
-   API;
-   webhooks.

------------------------------------------------------------------------

# 67. MVP recomendado

O MVP deve conseguir executar um processo real do início ao fim.

### Obrigatório

-   multi-tenant;
-   usuários;
-   grupos;
-   organizações;
-   sinistro;
-   ciclo;
-   workflow;
-   workflow version;
-   etapas;
-   decisões;
-   bifurcação;
-   paralelismo;
-   Join;
-   loops;
-   SLA;
-   documentos;
-   histórico;
-   auditoria;
-   reabertura;
-   descarte;
-   duplicidade;
-   permissões;
-   dashboard básico.

### Pode entrar logo depois

-   importação em massa;
-   templates avançados;
-   billing automatizado;
-   white-label completo;
-   integrações;
-   API pública.

------------------------------------------------------------------------

# 68. Regras de produto que não devem ser quebradas

1.  Nunca misturar dados de tenants.
2.  Nunca alterar retroativamente workflow publicado.
3.  Nunca apagar histórico operacional relevante.
4.  Nunca transformar uma bifurcação paralela em novo ciclo
    automaticamente.
5.  Nunca criar novo ciclo por simples edição.
6.  Nunca alterar silenciosamente o workflow de um ciclo em andamento.
7.  Nunca permitir pausa de SLA sem regra/justificativa adequada.
8.  Nunca excluir versão anterior de documento quando substituída.
9.  Nunca depender apenas do frontend para autorização.
10. Nunca hardcodar regras comerciais.
11. Nunca assumir que todo workflow é linear.
12. Nunca assumir que toda bifurcação é paralela.
13. Nunca assumir que toda decisão é exclusiva.
14. Nunca permitir workflow publicado inválido.
15. Nunca apagar um ciclo descartado.
16. Toda ação sensível deve ser auditável.
17. Configuração de cliente deve ser separada do código-base.
18. O ciclo é a unidade formal de execução e cobrança.
19. Sinistro e ciclo são entidades diferentes.
20. Retenção não equivale a conclusão.

------------------------------------------------------------------------

# 69. Critérios de aceite do motor

O motor será considerado funcional quando conseguir:

### Caso A

Executar uma sequência simples.

### Caso B

Executar decisão com escolha única.

### Caso C

Executar três atividades simultaneamente.

### Caso D

Aguardar Join configurado.

### Caso E

Executar Join por "todos obrigatórios".

### Caso F

Executar Join por "qualquer um".

### Caso G

Executar loop.

### Caso H

Criar pendência dentro de uma atividade.

### Caso I

Controlar SLA independente de atividade.

### Caso J

Reabrir ciclo com autorização.

### Caso K

Descartar ciclo e criar novo ciclo relacionado.

### Caso L

Manter execução sob versão antiga do workflow.

### Caso M

Registrar todas as alterações no audit log.

------------------------------------------------------------------------

# 70. Direção visual

A identidade ainda está em definição.

Direção aprovada:

> tecnologia B2B + governança + fluxo.

Evitar símbolos visuais genéricos e excessivamente literais de:

-   escudo;
-   veículo;
-   cadeado;
-   símbolos tradicionais de seguradora.

Paleta inicial de referência:

-   Navy: `#0B1220`
-   Blue: `#2563EB`
-   Cyan: `#22D3EE`
-   Violet: `#7C3AED`
-   Background: `#F8FAFC`

Não usar laranja como cor principal da identidade.

A interface deve transmitir:

-   precisão;
-   controle;
-   clareza;
-   tecnologia;
-   confiança;
-   rastreabilidade.

------------------------------------------------------------------------

# 71. Princípios de UX

-   produtividade operacional acima de estética decorativa;
-   poucas ações primárias por tela;
-   informação crítica sempre visível;
-   status visual claro;
-   mostrar motivo do bloqueio;
-   mostrar próximo passo;
-   mostrar responsável;
-   mostrar SLA;
-   reduzir cliques;
-   não esconder decisões importantes em menus;
-   configuração avançada progressiva.

------------------------------------------------------------------------

# 72. Nome e marca

Nome comercial ainda não está fechado.

Não bloquear desenvolvimento técnico por naming.

A arquitetura deve utilizar identificadores internos neutros e permitir
alteração posterior da marca.

------------------------------------------------------------------------

# 73. Primeiro fluxo oficial

O fluxo fornecido como referência operacional deve ser transformado no
primeiro template de validação:

> **Gestão de Sinistro --- Responsabilidade Financeira**

Macroestrutura:

``` text
Regulação e Análise Técnica
        ↓
Definição da Responsabilidade Financeira
        ↓
Decisão de Responsabilidade
        ↓
┌──────────────┬──────────────┬──────────────┐
│              │              │
Transportadora Seguradora     CD/Planta
│              │              │
Subfluxo 3A    Subfluxo 3B    Subfluxo 3C
│              │              │
└──────────────┴──────────────┴──────────────┘
        ↓
Encerramento
```

O tipo de roteamento deve ser configurável.

------------------------------------------------------------------------

# 74. Exemplo de execução paralela

Quando o processo exigir:

``` text
Levantamento
      ↓
Abrir paralelo
├── Operacional
├── Seguradora
└── Financeiro
      ↓
Join
Regra: todos obrigatórios
      ↓
Consolidação
      ↓
Jurídico
```

O ciclo continua sendo único.

------------------------------------------------------------------------

# 75. Exemplo de execução exclusiva

``` text
Definição de responsabilidade
          ↓
       Decisão
       /  |  \
      /   |   \
Transport. Seguradora MDLZ
```

Configuração:

> escolha única.

Somente um caminho é ativado.

------------------------------------------------------------------------

# 76. Exemplo de novo ciclo

``` text
Ciclo 1
Tipo: Roubo
Workflow: Roubo v2
Status: Descartado
Motivo: classificação incorreta

        ↓

Ciclo 2
Tipo: Acidente
Workflow: Acidente v1
Status: Em andamento
```

Os dois permanecem auditáveis.

------------------------------------------------------------------------

# 77. Exemplo de reabertura sem novo ciclo

``` text
Ciclo 1
Status: Concluído
       ↓
Reabertura autorizada
Motivo: documento incorreto
       ↓
Correção
       ↓
Concluído
```

Continua sendo o mesmo ciclo.

------------------------------------------------------------------------

# 78. Regras de implementação para Claude Code

Ao construir o produto:

1.  começar pelo domínio e banco;
2.  implementar isolamento multi-tenant;
3.  implementar autorização;
4.  implementar entidades de workflow;
5.  implementar motor de execução;
6.  implementar versionamento;
7.  implementar atividades paralelas;
8.  implementar Join;
9.  implementar SLA;
10. implementar documentos;
11. implementar auditoria;
12. implementar dashboards;
13. depois ampliar billing e integrações.

Não começar pelo dashboard ou pelo visual.

O núcleo do produto é o **workflow engine**.

------------------------------------------------------------------------

# 79. Ordem de desenvolvimento recomendada

``` text
Foundation
   ↓
Tenant/Auth/RLS
   ↓
Domain Model
   ↓
Workflow Builder
   ↓
Workflow Runtime
   ↓
Parallel/Join
   ↓
SLA
   ↓
Documents
   ↓
Audit
   ↓
Operational UI
   ↓
Tower of Control
   ↓
Billing
   ↓
Import
   ↓
Integrations
```

------------------------------------------------------------------------

# 80. Definição de sucesso do produto

O sistema será bem-sucedido quando uma empresa conseguir pegar um
processo real de sinistros que hoje está em:

-   planilhas;
-   e-mails;
-   fluxogramas;
-   documentos;
-   mensagens;
-   controles paralelos;

e transformar isso em:

> **um processo executável, rastreável, mensurável, auditável e
> configurável.**

O produto deve permitir que o gestor saiba não apenas:

> "quantos sinistros temos?"

mas:

> "qual processo está parado, em qual atividade, com qual grupo, por
> qual motivo, há quanto tempo, qual o impacto e qual é a próxima ação?"

------------------------------------------------------------------------

# 81. Próximas entregas após este documento

A construção deve seguir esta ordem de artefatos:

### Documento 1 --- Especificação Mestre

Este documento.

### Documento 2 --- Modelo de Dados

Detalhamento das tabelas, relações, índices, RLS e constraints.

### Documento 3 --- Workflow Engine

Regras de execução, transições, branches, joins, loops, decisões e
versionamento.

### Documento 4 --- SLA Engine

Calendários, pausas, alertas, escalonamentos e cálculo de tempo.

### Documento 5 --- UX / Telas

Mapa de telas, componentes, estados e fluxos de usuário.

### Documento 6 --- API / Integrações

Contratos de API, eventos e webhooks.

------------------------------------------------------------------------

# 82. Instrução final para implementação

O produto deve ser construído como uma **plataforma multi-tenant de
workflow especializado em sinistros**, e não como um CRUD que
posteriormente receberá workflow.

A arquitetura deve permitir que o mesmo motor execute:

-   fluxos lineares;
-   fluxos condicionais;
-   fluxos paralelos;
-   fluxos com loops;
-   fluxos com espera;
-   fluxos com pendências;
-   fluxos com convergência;
-   fluxos com subfluxos;
-   múltiplas organizações;
-   múltiplos grupos;
-   múltiplas atividades simultâneas.

A configuração deve ser orientada a dados.

O código deve implementar o motor.

O cliente deve configurar o processo.

------------------------------------------------------------------------

# 83. Decisões consolidadas --- checklist

## Produto

-   [x] SaaS B2B
-   [x] Multi-tenant
-   [x] Transportador/embarcador como clientes principais
-   [x] Organizações participantes
-   [x] Grupos
-   [x] Workflow configurável
-   [x] Workflow versionado
-   [x] Atividades paralelas
-   [x] Bifurcação condicional
-   [x] Join configurável
-   [x] Loops
-   [x] Pendências
-   [x] Decisões
-   [x] SLA
-   [x] Documentos
-   [x] Auditoria
-   [x] Tower of Control
-   [x] Importação no roadmap
-   [x] Templates
-   [x] White-label preparado

## Ciclo

-   [x] Ciclo é unidade formal de execução
-   [x] Ciclo é unidade de cobrança
-   [x] Paralelismo não cria ciclo
-   [x] Edição não cria ciclo
-   [x] Reabertura simples não cria ciclo
-   [x] Descarte pode originar novo ciclo
-   [x] Mudança estrutural de workflow pode exigir novo ciclo
-   [x] Novo ciclo exige justificativa/registro
-   [x] Histórico preservado

## Governança

-   [x] Audit log
-   [x] LGPD desde arquitetura
-   [x] RLS
-   [x] Permissões
-   [x] Versionamento
-   [x] Snapshot
-   [x] Retenção separada de conclusão
-   [x] Ações sensíveis com justificativa

## Comercial

-   [x] Standard
-   [x] Professional
-   [x] Enterprise
-   [x] Custom
-   [x] Implantação
-   [x] Mensalidade
-   [x] Cobrança por ciclo
-   [x] Excedente de storage
-   [x] Limites configuráveis
-   [x] Configuração ≠ desenvolvimento sob medida

------------------------------------------------------------------------

# 84. Nota de implementação

Este documento é a **especificação funcional e arquitetural de
referência v1.0**.

Durante a implementação, qualquer necessidade nova deve ser analisada
contra estes princípios.

Não alterar uma regra estrutural apenas para facilitar uma implementação
local.

Quando houver conflito entre uma implementação simples e uma regra de
domínio importante, preservar o domínio e ajustar a implementação.

Toda mudança estrutural futura deve ser registrada como nova decisão de
produto/arquitetura.
