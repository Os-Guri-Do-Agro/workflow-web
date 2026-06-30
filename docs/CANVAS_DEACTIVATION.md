# Canvas — desativação reversível (feature flag)

O **Canvas** (boards de desenho colaborativo Yjs/Hocuspocus — rotas `/boards`,
`/boards/:id`, `/public/board/:token`) está **desabilitado por padrão** via a
feature flag `CANVAS_ENABLED`.

A desativação é **100% reversível** e **não deletou nenhum arquivo**. Todos os
arquivos de Canvas (`features/boards/*`, `features/public/PublicBoardView.vue`,
`service/boards/*`, `service/share/*`, `composables/useBoards.ts`,
`composables/useCompanyBoards.ts`) continuam no repositório, intactos.

> O **Kanban** (`/board`, `BoardView.vue`, `KanbanBoard.vue`) é uma feature
> **separada** e **não** é afetado por esta flag — permanece sempre visível.

## Como reativar tudo

1. No `.env` (ou `.env.local` / variáveis de ambiente do build), defina:

   ```bash
   VITE_CANVAS_ENABLED=true
   ```

2. Rebuild / restart do dev server (Vite lê `import.meta.env.*` em build/boot).

Pronto. Isso restaura **todas** as superfícies do Canvas automaticamente, sem
nenhuma outra edição de código:

- Rotas `/boards`, `/boards/:id`, `/public/board/:token` deixam de redirecionar
  para a home (guard em `src/router/index.ts`).
- Item "Canvas" volta à sidebar (`NavList.vue`).
- Comando `nav-canvas` volta à Command Palette (`CommandPalette.vue`).
- Breadcrumb de `/boards` volta no `CommandShell.vue`.
- Aba/dock do Canvas voltam no `CanvasShell.vue`.
- Item Canvas (rail + atalho "Visão rápida") volta no `FocusShell.vue`.
- Opção e preview do shell "Canvas" voltam em `SettingsView.vue`.
- Shell `canvas` volta a ser selecionável em `AppShell.vue` (sem fallback p/ command).
- Step "Canvas" volta ao onboarding (`WelcomeGuide.vue`).

Para desativar de novo: remova a variável ou defina `VITE_CANVAS_ENABLED=false`.

## Single source of truth

A flag é lida em um único lugar:

```ts
// src/config/feature-flags.ts
export const CANVAS_ENABLED = import.meta.env.VITE_CANVAS_ENABLED === 'true'
```

Todos os pontos abaixo importam **dessa** constante — não duplique a leitura de
`import.meta.env` em outros arquivos.

## Checklist de arquivos tocados (condicionais à flag)

| Camada              | Arquivo                                                        | O que é condicional               |
| ------------------- | ------------------------------------------------------------- | --------------------------------- |
| Flag                | `src/config/feature-flags.ts`                                 | define `CANVAS_ENABLED`           |
| Rota (guard)        | `src/router/index.ts`                                         | redirect de `boards/board-canvas/public-board` → home |
| Nav (sidebar)       | `src/core/components/shells/shared/NavList.vue`               | item "Canvas"                     |
| Command Palette     | `src/components/CommandPalette.vue`                           | comando `nav-canvas`              |
| Shell (command)     | `src/core/components/shells/CommandShell.vue`                 | breadcrumb `/boards`              |
| Shell (canvas)      | `src/core/components/shells/CanvasShell.vue`                  | aba + item do dock                |
| Shell (focus)       | `src/core/components/shells/FocusShell.vue`                   | item do rail + atalho "Canvas"    |
| Shell (seletor)     | `src/core/components/shells/AppShell.vue`                     | fallback `canvas → command`       |
| Settings            | `src/features/settings/SettingsView.vue`                      | opção + preview do shell "Canvas" |
| Onboarding          | `src/components/onboarding/WelcomeGuide.vue`                  | step "Canvas"                     |

## Observações

- O **tipo** `ShellVariant = 'command' | 'focus' | 'canvas'` (`plugins/tokens.ts`)
  **não** foi alterado: `'canvas'` continua válido para que valores antigos em
  `localStorage` (`ui.shell='canvas'`) não causem erro de tipo. Com a flag off,
  `AppShell.vue` faz fallback para `CommandShell` em runtime.
- As classes CSS `.preview--canvas` em `SettingsView.vue` ficam sem uso enquanto
  a flag está off, mas **não foram removidas** (reversibilidade limpa).
- (Otimização futura, não feita aqui) lazy-load das deps Yjs/Hocuspocus/perfect-freehand
  para tirar peso do bundle quando o Canvas está desabilitado.
