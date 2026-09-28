---
target: Workflow Builder
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-09-28T17-21-01Z
slug: src-components-builder-workflowbuilder-tsx
---
# Crítica — Workflow Builder (23/40, Aceitável)

| # | Heurística | Nota | Problema |
|---|---|---|---|
| 1 | Visibilidade do estado | 3 | Fit zoom 0.34 deixa nós ilegíveis |
| 2 | Mundo real | 3 | "Todos" vs "Todos os obrigatórios" sem explicação |
| 3 | Controle e liberdade | 1 | Sem desfazer; exclusão imediata |
| 4 | Consistência | 3 | Ponto de erro da Decisão sem aria-label |
| 5 | Prevenção de erros | 2 | Duas saídas só detectadas após desenhar |
| 6 | Reconhecimento | 2 | Gesto de conectar só em nota; conexão sem origem/destino |
| 7 | Flexibilidade | 1 | Só Ctrl+S; sem duplicar/busca/auto-layout |
| 8 | Estética | 3 | Quadro perde espaço para os painéis |
| 9 | Recuperação | 2 | Lista não agrupada; culpa nó errado |
| 10 | Ajuda | 3 | Regras de convergência sem explicação |

## Especificidade
Estrutura genérica de editor de fluxos; identidade só nas formas dos nós. Governança (versão imutável) invisível; paleta da marca ausente no editor.

## Problemas prioritários
- [P0] Quadro espremido (776px em 1280; 264px em 768) e zoom inicial 0.34 ilegível → layout
- [P1] Sem desfazer; Delete/lixeira apagam na hora → harden
- [P1] Publicar sem confirmação/diff/nota → harden
- [P1] Foco invisível (globals.css outline:none), aria-labels de conexão com UUID, inputs sem label, slate-400 2.6:1 → audit
- [P2] Validação pune iniciantes (erro no vazio, 5 erros por nó novo, lista sem agrupamento) → clarify

## Personas
Alex: sem duplicar/multiseleção/busca/conexão por teclado. Sam: foco invisível, sem conexão sem mouse, erro/aviso só por cor, toasts 3.5s. Marta: 2 modelos só, sem modo guiado, jargão sem explicação, publicar sem confirmação.

## Menores
Cartão Elementos/Conexões inútil; documentos exigidos ausentes; só 1 camada "Avançado"; cores fixas no minimapa/arestas; window.confirm; Controls em inglês.

## Perguntas
Por que o quadro fica com a sobra? Marta precisa desenhar ou responder perguntas? Publicar como ato de governança?
