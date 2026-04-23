# work-flow — src/ guide

Guia interno para navegar e evoluir o código.

**Specs:**
- [design-system-evolution.md](../docs/specs/design-system-evolution.md) — spec-mãe (F1-F4 + Fase P)
- [shell-nav-unification.md](../docs/specs/shell-nav-unification.md) — Q1-Q4 em todos os shells + dead buttons + modais (entregue `0d1ea7c`)
- [legacy-views-migration.md](../docs/specs/legacy-views-migration.md) — migração mdi→lucide + tokens das views legadas (L1-L4, planejada)

## Stack

- Vue 3.5 + Vuetify 4.0 + Pinia 3 + Vue Router 5
- @tanstack/vue-query para cache de fetch
- TypeScript 5.9, Vite 7
- Ícones: **lucide-vue-next** (padrão) + `mdi` via fonte (legado, em migração)
- Fonte: **Inter Variable** (`@fontsource-variable/inter`)
- Motion: **@vueuse/motion** (instalado via `MotionPlugin`) + `motion-v` (disponível para uso)
- Toast: **vue-sonner** (consumido via `useToast()` bridge)
- Charts: `vue-echarts` (line, bar, pie)
- Headless primitives disponíveis: `reka-ui` (não usado ainda, reservado para componentes customizados)

## Design System

### Tokens

**Single source of truth:** [`plugins/tokens.ts`](./plugins/tokens.ts).

Camadas disponíveis como CSS custom properties em `:root` (atualizadas runtime ao trocar tema/acento):

| Família | Tokens |
|---|---|
| **Background** | `--bg`, `--surface`, `--surface-2`, `--surface-3` |
| **Border** | `--border`, `--border-strong` |
| **Text hierarchy** | `--text`, `--text-2` (70%), `--text-3` (48%), `--text-4` (32%) |
| **Status** | `--status-todo`, `--status-prog`, `--status-test`, `--status-done`, `--status-block` |
| **Semantic** | `--success`, `--warn`, `--err`, `--info` |
| **Accent** | `--accent`, `--accent-fg` (trocável em runtime via `uiStore.accent`) |
| **Radius** | `--radius-sm` (6px), `--radius` (10px), `--radius-lg` (14px), `--radius-xl` (20px) |
| **Shadow** | `--shadow-sm`, `--shadow`, `--shadow-overlay` |
| **Motion** | `--motion-fast` (120ms), `--motion` (180ms), `--motion-slow` (280ms), `--motion-ease` |
| **Typography** | `--font-family` (Inter), `--font-mono` |

**Nunca escreva hex em componentes.** Se precisar de uma cor que não existe, adicione o token em `tokens.ts` primeiro.

Para Vuetify-compat, `plugins/tokens.ts` também exporta `vuetifyThemeColors` que alimenta o `createVuetify({ theme })`. Mantemos o padrão do projeto:
- `primary` = bg do surface elevado (drawer/appbar background)
- `secondary` = cor do texto principal

Classes tipográficas utilitárias estão em [`styles/typography.css`](./styles/typography.css): `.text-display`, `.text-title`, `.text-subtitle`, `.text-body`, `.text-label`, `.text-meta`, `.text-eyebrow`, `.text-mono`.

### Preferências do usuário

- **Store:** [`stores/uiStores.ts`](./stores/uiStores.ts) — Pinia store persistida em `localStorage` (`ui.theme`, `ui.accent`, `ui.density`, `ui.shell`).
- **Composable:** [`composables/useUiPreferences.ts`](./composables/useUiPreferences.ts) — API ergonômica. Use sempre este composable para ler/escrever preferências (não acesse `localStorage` direto).

```ts
const { theme, accent, density, shell, setTheme, toggleTheme, setAccent } = useUiPreferences()
```

### Ícones

- Sempre `lucide-vue-next` em código novo: `import { Search } from 'lucide-vue-next'`.
- **Não** use `<v-icon>mdi-*</v-icon>` em componentes novos.
- Componentes legados ainda têm `mdi-*` — serão migrados incrementalmente ao serem tocados. A fonte `@mdi/font` só sai quando todos os `mdi-*` desaparecerem do código (~171 ocorrências restantes em 19 files de features).

## App Shell

O layout principal é gerenciado por [`core/components/shells/AppShell.vue`](./core/components/shells/AppShell.vue), que escolhe a variante de shell a partir do store `ui.shell`:

| Variante | Arquivo | Descrição |
|---|---|---|
| `command` (default) | [`CommandShell.vue`](./core/components/shells/CommandShell.vue) | Topbar + sidebar clássica. Breadcrumbs na topbar. |
| `focus` | [`FocusShell.vue`](./core/components/shells/FocusShell.vue) | Rail 56px + coluna de contexto 240px. Inspirado em Linear. |
| `canvas` | [`CanvasShell.vue`](./core/components/shells/CanvasShell.vue) | Nav horizontal + dock flutuante. Full-bleed. |

Trocar a variante é feito em `/settings` e é aplicada em runtime (sem reload).

**Para rotas sem shell** (`login`, `download`): `AppShell` renderiza `<slot />` raw quando `route.name` é uma dessas.

**Componentes shared dos shells** em [`core/components/shells/shared/`](./core/components/shells/shared/):
- `CompanySwitcher.vue` — toggle de empresa (3 variantes: full / compact / inline)
- `UserMenu.vue` — avatar + dropdown com Settings / Logout
- `CmdKButton.vue` — disparador da Command Palette (full / compact / icon)
- `ThemeToggle.vue` — botão sol/lua que usa `useUiPreferences`
- `NavList.vue` — lista de navegação reutilizável (usada em CommandShell; quarters carregadas da API)

## UI Primitives

Em [`components/ui/`](./components/ui/):

| Componente | Uso |
|---|---|
| `EmptyState.vue` | Estado vazio padrão. Props: `icon`, `title`, `description`. Slot `action`. |
| `Skeleton.vue` | Loading. Types: `row`, `card`, `text`, `block`. |
| `Pill.vue` | Chip monocromático com ícone. Variants: `soft`, `outline`, `solid`. |
| `AuroraBackground.vue` | Gradient blobs animados + noise + grid mask. Props: `intensity="subtle\|medium\|bold"`. Usado no fundo dos 3 shells. |

## Utilities CSS (em [`styles/reset.css`](./styles/reset.css))

Classes utilitárias premium que qualquer componente pode usar:

| Classe | Efeito |
|---|---|
| `.glass` | Backdrop-filter blur 14px + superfície semi-transparente. Use em topbars/sidebars. |
| `.glass-strong` | Blur 20px, mais opaco. Para overlays (command palette, dock). |
| `.gradient-border` | Borda cônica rotacionando 9s infinito. Pseudo-elemento, não afeta layout. Use em CTAs premium (plan card, palette container). |
| `.press` | Scale 0.97 + brightness 0.95 no `:active`. |
| `.hover-lift` | translateY(-2px) + shadow on hover. |

View Transitions API registrado via `::view-transition-*` no reset — ativo se o browser suportar e for usado via `document.startViewTransition`. Atualmente usamos `<Transition name="route">` em `AppShell.vue` (fade + translate + blur) como fallback universal.

## Features registradas

| Feature | View principal | Rota | Observações |
|---|---|---|---|
| Dashboard | [`features/dashboard/DashboardView.vue`](./features/dashboard/DashboardView.vue) | `/` e `/dashboard` | Usa Vue Query |
| Board | [`features/board/BoardView.vue`](./features/board/BoardView.vue) | `/board` | Kanban |
| Tarefas | [`features/tasks/TasksView.vue`](./features/tasks/TasksView.vue) | `/tasks/:month` | Por trimestre → mês |
| Tickets | [`features/tickets/TicketsView.vue`](./features/tickets/TicketsView.vue) | `/tickets` | |
| **Variáveis** ★ | [`features/companies/CompanyVariablesView.vue`](./features/companies/CompanyVariablesView.vue) | `/variables` | Refatorada em F3 — sub-components em `features/companies/components/` |
| Notas | [`features/notes/NotesView.vue`](./features/notes/NotesView.vue) | `/notes` | TipTap editor |
| Calendário | [`features/calendar/CalendarView.vue`](./features/calendar/CalendarView.vue) | `/calendar` | Google Calendar integration |
| Usuários | [`features/companies/CompanyUsersView.vue`](./features/companies/CompanyUsersView.vue) | `/company-users` | ADMIN only |
| Configurações | [`features/settings/SettingsView.vue`](./features/settings/SettingsView.vue) | `/settings` | Tema, acento, densidade, shell variant |

★ = redesign completo entregue pelo design-system-evolution spec.

### Sub-components de Variables (F3)

Em [`features/companies/components/`](./features/companies/components/):

- `VariablesToolbar.vue` — busca + filtro por tipo + sort + view toggle + export dropdown
- `VariablesList.vue` + `VariableRow.vue` — tabela densa (view default)
- `VariablesGrid.vue` — view em cards (opcional via toggle)
- `VariableDrawer.vue` — drawer 480px com edit inline + tabs (Campos / Histórico)
- `VariableCreateDialog.vue` — modal rápido de criação
- `VariableFieldInput.vue` — linha key/value/type com copy, reveal SECRET (30s auto-hide), open URL
- `VariableTypeChip.vue` — chip colorido por tipo (TEXT/URL/SECRET)
- `useEnvExport.ts` — composable que gera `.env` a partir de variáveis (`KEY=value` com prefixo automático)

Atalhos globais na página Variables: `/` (foca busca), `N` (abre criação), `Esc` (fecha drawer).

## Convenções

### Organização
- Tudo por feature em `features/<feature>/`. Sub-components da feature em `features/<feature>/components/`.
- Componentes globais em `components/`. Primitives reutilizáveis em `components/ui/`.
- Plumbing do shell em `core/components/shells/`.

### Nomenclatura
- Componentes em PascalCase. Composables em `useX.ts`. Stores em `xStores.ts`.

### State
- Preferências de UI → `uiStore` via `useUiPreferences`.
- Dados de auth/company → `authStores.ts`, `workspaceStores.ts`.
- Dados remotos → Vue Query (`composables/useX.ts`).

### Boundaries
- `rgb(var(--v-theme-X))` — só use para compor com estilos internos do Vuetify (quando um componente Vuetify toca `color` prop). Para estilo próprio, sempre tokens `var(--text)` / `var(--surface)` etc.
- Componentes shared dos shells **não devem** importar de `features/*`. Features podem importar de `components/`, `components/ui/`, `composables/`, `stores/`.

## Como adicionar uma feature nova

1. Crie `features/<nome>/<Nome>View.vue`.
2. Registre a rota em [`router/index.ts`](./router/index.ts).
3. Adicione entrada em `NavList.vue` (`mainItems` ou `personalItems`) e nos shells `FocusShell` / `CanvasShell` (railItems / tabs / dockItems) se deve aparecer lá.
4. Use tokens e lucide icons desde o início.
5. Atualize a tabela de features nesta doc.

## Como adicionar uma variante de shell nova

1. Crie `core/components/shells/XShell.vue` consumindo `shared/*`.
2. Adicione o valor no tipo `ShellVariant` em `plugins/tokens.ts`.
3. Adicione opção no `SettingsView.vue` (com wireframe preview).
4. Atualize o `computed ActiveShell` em `AppShell.vue`.
