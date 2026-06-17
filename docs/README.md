# Documentação — work-flow

Frontend web do **work-flow**: plataforma de gestão de trabalho por empresa, com tarefas trimestrais, board Kanban, variáveis de ambiente, notas, calendário, bug reports e integrações (GitHub, Google Calendar, Discord, Jira).

## Índice

| Documento | Conteúdo |
|---|---|
| [architecture.md](./architecture.md) | Stack, estrutura de pastas, padrões e fluxo de dados |
| [screens.md](./screens.md) | Mapa de rotas, telas, navegação e permissões |
| [api-services.md](./api-services.md) | Camada de serviços HTTP e endpoints consumidos |
| [design-system.md](./design-system.md) | Tokens, shells, componentes UI e convenções visuais |

## Specs técnicas (evolução)

Documentos de especificação e migração em [`specs/`](./specs/):

- [design-system-evolution.md](./specs/design-system-evolution.md) — evolução do design system (F1–F4 + Fase P)
- [shell-nav-unification.md](./specs/shell-nav-unification.md) — unificação de navegação nos shells
- [legacy-views-migration.md](./specs/legacy-views-migration.md) — migração mdi → lucide e tokens

## Setup rápido

```sh
npm install
cp .env.example .env   # configure VITE_API_URL
npm run dev
```

| Variável | Descrição |
|---|---|
| `VITE_API_URL` | URL base da API backend |

## Deploy

SPA Vue/Vite hospedada na Vercel (`vercel.json` com rewrite para `index.html`).

## Guia para desenvolvedores

O arquivo [`src/CLAUDE.md`](../src/CLAUDE.md) contém um guia operacional conciso para quem trabalha no código-fonte (convenções, como adicionar features, etc.).
