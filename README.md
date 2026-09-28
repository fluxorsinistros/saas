# Gerenciador de Sinistros

SaaS B2B multi-tenant de workflow para sinistros de transporte. Nome comercial ainda em definição.

- Especificação e decisões: `Gerenciador_de_Sinistros_CLAUDE_CODE_Master_v1.1.md` e `docs/02` a `docs/06`.
- Banco: Supabase (migrações em `supabase/migrations/`, já aplicadas no projeto `fluxor`).
- App: Next.js 16 (App Router) + Supabase Auth/RLS + React Flow para o editor visual de fluxos.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha URL e chave publicável do Supabase
npm install
npm run dev
```

Abra http://localhost:3000, crie uma conta e configure a empresa. Os grupos operacionais sugeridos são criados
automaticamente.

## O que já existe

- Login/cadastro e onboarding (criação do tenant com grupos padrão).
- **Editor visual de fluxos** (`/fluxos`): etapas, decisões, paralelos, convergências, esperas, pendências e fim;
  arrastar e soltar, conexões, SLA, grupo responsável, limite de loop, validação ao vivo (Documento 3 §7),
  publicação com revalidação no servidor, versões imutáveis e nova versão a partir de uma publicada.
- Modelos prontos: Responsabilidade Financeira (§73) e Análise paralela com convergência (§74).
- Gestão de grupos (`/grupos`).
