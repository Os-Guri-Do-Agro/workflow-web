# Spec: Shell Navigation Unification + Dead Buttons + Modal Stability

**Status:** Entregue — commit `0d1ea7c` no branch `develop` (2026-04-22)
**Criado em:** 2026-04-22 (retroativa)
**Tipo:** Fix batch + refactor localizado
**Locale:** pt-BR
**Spec-mãe:** [design-system-evolution.md](./design-system-evolution.md) — esta spec é uma rodada de evolução pós-F4/P que corrige lacunas funcionais.

---

## Visão Geral

Três problemas foram acumulados entre a entrega da Fase P (premium) e as primeiras sessões de uso real:

1. **Só o `CommandShell` tinha navegação por Q1-Q4 / meses.** FocusShell e CanvasShell não expunham a área de Tarefas — ao trocar o shell em `/settings`, a feature central do app sumia da UI.
2. **Botões decorativos sem handler.** Dashboard ("Nova tarefa", card de projeto), CanvasShell ("Novo", sino), FocusShell (sino) — todos clicáveis, nenhum funcional. Além disso, o FocusShell tinha contagens de "Visão rápida" chumbadas (12/8/3) que não mudavam.
3. **Calendário travava ao criar evento repetido.** O `EventModal` recriava a instância do Tiptap em cada abertura e tinha CSS inválido (`var(--type-color) + '10'` no scoped style, concatenação impossível em CSS), causando lag perceptível após 2-3 aberturas.

Paralelamente, `TaskForm` ainda era um conjunto cru de `<v-*>` com ícones `mdi-*`, destoando do padrão tokenizado que o resto do app adotou.

## Discovery

Stack e convenções: reutilizamos os guardrails da [spec-mãe](./design-system-evolution.md#11-princípios-guardrails-para-todas-as-fases) — tokens em `plugins/tokens.ts`, ícones `lucide-vue-next`, tipografia Inter, motion 120-180ms, shells em `core/components/shells/`.

Áreas afetadas:

| Arquivo | Papel |
|---|---|
| `src/core/components/shells/CommandShell.vue` | Shell padrão, já tinha Q1-Q4 via `NavList` |
| `src/core/components/shells/FocusShell.vue` | Rail 56px + coluna de contexto 240px |
| `src/core/components/shells/CanvasShell.vue` | Topbar com tabs + dock flutuante |
| `src/core/components/shells/shared/NavList.vue` | Tree de navegação (usado pelo CommandShell) |
| `src/composables/useCompanyQuarters.ts` | Wrapper existente de Vue Query para quarters |
| `src/features/dashboard/DashboardView.vue` | Home — "Nova tarefa", cards de projeto, agenda |
| `src/components/modals/EventModal.vue` | Modal de criar/editar evento do calendário |
| `src/components/tasks/TaskForm.vue` | Modal de criar tarefa (usado em TasksView) |
| `src/features/tasks/TasksView.vue` | View do mês com kanban |

**Padrões a preservar:**
- Tokens CSS (nada de hex em componentes)
- Lucide icons em código novo (mdi proibido em arquivos tocados)
- `ui.shell` em `uiStore` controla qual shell renderiza — não mexer aqui
- `useCompanyQuarters(companyId)` é a fonte de quarters — usar sempre via composable, nunca `quartersService` direto em componentes

---

# PARTE 1 — Design Doc

## 1.1 Navegação de Tarefas — unificação entre shells

Em todos os 3 shells a feature **Tarefas** precisa estar acessível, mas cada shell tem geometria diferente. A solução respeita a identidade de cada variante:

| Shell | Superfície usada | Padrão de interação |
|---|---|---|
| `command` | Sidebar vertical (`NavList.vue`) | Tree colapsável 3 níveis: Tarefas → Q1..Q4 → Relatório + meses |
| `focus` | Coluna de contexto (240px) | Tree condicional: quando `route.path` começa com `/tasks` ou `/relatorio`, a coluna mostra árvore de Q1..Q4. Fora desses routes, mostra atalhos (Visão rápida + Pessoal). |
| `canvas` | Aba na topbar | Aba "Tarefas" abre **popover** ancorado com grupos Q1..Q4, cada um com Relatório + meses. Fecha ao clicar fora. |

**Fonte de dados única:** novo composable `composables/useNavQuarters.ts`.

```ts
export type NavQuarter = {
  id: string
  label: string          // "Q1" | "Q2" | ...
  monthsLabel: string    // "Jan-Fev-Mar" (pré-computado)
  months: { id: string; name: string }[]
}

export function useNavQuarters(): {
  quarters: ComputedRef<NavQuarter[]>
  firstMonth: ComputedRef<{ id: string; name: string } | null>
  loading: Ref<boolean>
}
```

**Motivos do composable:**
- `NavList` tinha `loadQuarters()` ad-hoc (bypass do Vue Query, sem cache entre remounts de shell)
- FocusShell e CanvasShell precisam da mesma lista para renderizar suas variantes de nav
- `firstMonth` é reutilizado pelo Dashboard (botão "Nova tarefa")

Internamente `useNavQuarters` compõe `useCompanyQuarters` (já existente) + reatividade ao `useActiveCompanyId` store.

### FocusShell — coluna de contexto

```
┌─ rail (56px) ─┬─ context (240px) ──────────┐
│               │ CompanySwitcher            │
│  logo         ├────────────────────────────┤
│  Dashboard    │                            │
│  Board        │  ▼ Tarefas (eyebrow)       │
│  Tarefas      │  ▸ Q1  Jan-Fev-Mar         │
│  Tickets      │    └ Relatório Q1          │
│  ...          │    └ Janeiro (ativo)       │
│               │    └ Fevereiro             │
│               │  ▸ Q2  Abr-Mai-Jun         │
│               │                            │
│  Settings     │  [CmdKButton compact]      │
│  UserMenu     └────────────────────────────┘
```

- Cada Q é um collapsible: `openQuarter: Ref<string | null>`. Abre/fecha via click na head.
- Ao navegar via URL (`/tasks/:monthId` ou `/relatorio/:quarterId`), o `watch` abre o quarter correspondente automaticamente.
- Fora de rotas de tasks, a coluna volta a mostrar atalhos (Dashboard, Board, Tarefas-primeiromês, Tickets + Notas/Calendário).

### CanvasShell — aba + popover

```
[ logo ] [ Dashboard ] [ Board ] [ Tickets ] [ Variáveis ] [ Notas ] [ Calendário ] [ Tarefas ▾ ]
                                                                                      ┌──────────┐
                                                                                      │ Q1  Jan- │
                                                                                      │ Fev-Mar  │
                                                                                      │ • Relat  │
                                                                                      │ • Janei  │
                                                                                      │ • Fever  │
                                                                                      │ • Março  │
                                                                                      │──────────│
                                                                                      │ Q2 ...   │
                                                                                      └──────────┘
```

- Popover absoluto, ancorado no wrapper da aba, `z-index: 50`.
- Click outside detection via `mousedown` listener registrado em setup + cleanup em `onBeforeUnmount`.
- Dock inferior também ganha o ícone `ListTodo` apontando pro `firstMonth`.

### Estados visuais

- Q/mês ativo: mesma regra das tree-items do FocusShell (`background: var(--surface-2)` + `font-weight: 600`).
- Popover: `background: var(--surface)`, borda `var(--border-strong)`, shadow `var(--shadow-overlay)`, radius `var(--radius)`.
- Eyebrow de cada Q dentro do popover: `font-size: 11px`, `letter-spacing: .06em`, uppercase, tom `--text-2`. Meta (Jan-Fev-Mar) vai à direita, `--text-4`.

## 1.2 Botões mortos — wire-up

| Local | Antes | Depois |
|---|---|---|
| `DashboardView` — "Nova tarefa" | `<button class="ghost-btn press">` sem handler | `@click="handleNewTask"` → `router.push('/tasks/:firstMonthId?new=1')`. Disabled quando `firstMonth == null`. |
| `DashboardView` — card de projeto | `@click="handleProjectClick(name)"` com corpo `// future: navegação` | Troca `activeCompany` via localStorage + store e roteia para `/variables` |
| `DashboardView` — item de "Próximos eventos" | Não tinha click | `@click="openCalendar"` → `/calendar` |
| `CanvasShell` — botão "Novo" | Sem handler | `@click` → emit `open-command-palette` |
| `CanvasShell` — sino (Bell) com dot decorativo | Sem handler, dot fake | Removido (não temos sistema de notificações ainda) |
| `FocusShell` — sino no slim-top | Sem handler | Reutilizado como atalho pro Command Palette |
| `FocusShell` — quick-list com contagens chumbadas (12/8/3) | Mock | Substituído por atalhos reais com ícones lucide (sem contagens falsas) |

**Contrato do `?new=1`:** quando `TasksView` monta e `route.query.new === '1'`, ele abre `dialog = true` e chama `router.replace({ path: route.path })` pra limpar a query. Isso evita reabrir o dialog se o usuário recarregar a página.

## 1.3 EventModal — estabilidade e tokens

**Causa do travamento reportado:**
1. `useEditor` estava sendo chamado uma única vez no setup, mas **não havia `onBeforeUnmount`** para destruir. Não é o principal — o pior era o CSS inválido:
2. `background: var(--type-color) + '10'` no `<style scoped>` é uma **expressão JS dentro de CSS**, parseada como string literal. O browser tenta reparseá-la a cada mudança de `eventType`, mas mais relevante: a regra nunca pinta, então havia fallback implícito e muitas reflows em cada troca de tipo.
3. `eventTypes.find(...)` inline no template (4-5 vezes por render): degradação cumulativa, não trava, mas contribui.
4. Tipos `PERSONAL` e `TASK` existiam no schema mas **não estavam no grid** → ao editar um evento desses, `find` retornava `undefined` e o ícone/cor caíam em fallback ruim.

**Refactor:**
- Todos os 7 tipos no grid (MEETING, DEADLINE, REMINDER, SPRINT, RETROSPECTIVE, TASK, PERSONAL) com ícones lucide e tokens (`var(--info)`, `var(--err)`, `var(--warn)`, `var(--success)`, `var(--status-test)`, `var(--accent)`, `var(--status-todo)`).
- `currentType = computed(...)` calculado uma única vez por render.
- Editor Tiptap permanece vivo entre aberturas (evita churn de mount/unmount), mas `onBeforeUnmount(() => editor.value?.destroy())` é obrigatório.
- `clearContent()` ao fechar (evita vazamento de conteúdo entre eventos).
- CSS usa `color-mix(in srgb, var(--type-c) 14%, transparent)` — agora o tom do tipo selecionado é dinâmico via CSS var, não concatenação.
- Confirm de deletar virou overlay inline (antes era `confirm()` nativo do browser).

## 1.4 TaskForm — tokens + UX

Antes: `<v-textarea>` + `<v-select>` + `<v-file-input>` crus, ícones `mdi-*`, sem atalho de submit.

Depois — componentes customizados com tokens:
- **Título**: textarea 2 linhas, `autofocus` quando modal abre, atalho `⌘+Enter` / `Ctrl+Enter` para submeter.
- **Descrição**: textarea 3 linhas (antes não existia — o payload sempre enviava `description: ''`).
- **Prioridade**: 6 chips (P0-P5) com tons semânticos — `--text-3` (P0), `--info` (P1-P2), `--warn` (P3), `--err` (P4-P5).
- **Entrega**: `<input type="date">`.
- **Responsáveis**: chips com avatar inicial, toggle por click, `Check` lucide no ativo. Fallback "Nenhum membro disponível" quando lista vazia.
- **Anexo**: botão custom (não `<v-file-input>`) mostrando nome + tamanho (MB) + botão de limpar. Erro "> 10MB" em `field-err`.
- **Footer**: hint "⌘+Enter para criar" à esquerda, ações à direita.

---

# PARTE 2 — Architecture Doc

## 2.1 Novo composable

```
src/composables/useNavQuarters.ts
```

Mono-responsabilidade: normalizar quarters para o shape de navegação. NavList, FocusShell, CanvasShell e DashboardView consomem. Implementado em cima de `useCompanyQuarters` (Vue Query, cache automático por `['quarters', companyId]`).

## 2.2 Decisões

### Decisão 1 — Popover DIY no CanvasShell em vez de `reka-ui`

`reka-ui` está disponível mas nunca usado no projeto. Para manter a PR pequena e consistente com o que já existe (ex.: `UserMenu.vue` também é um popover DIY), adotamos a mesma abordagem: `ref` + click-outside via `document.addEventListener('mousedown')`. Migrar para `reka-ui` é um item da spec de legacy-views.

### Decisão 2 — Tiptap persistente no EventModal

Alternativa considerada: destruir + recriar editor a cada abertura. Rejeitada: `useEditor` precisa ser chamado em contexto de setup; chamar dentro de watcher quebra a regra dos composables. Manter persistente + `clearContent()` no fechamento resolve o problema sem essa complicação.

### Decisão 3 — `TaskForm` continua dentro de `<v-dialog>`

TasksView ainda envelopa `TaskForm` em `<v-dialog max-width="600">`. O dialog provê backdrop + scroll trap. TaskForm só se preocupa com o conteúdo (seu próprio card tokenizado). Não foi migrado para Teleport próprio porque o custo excede o benefício e `<v-dialog>` segue coerente com o resto dos modais de listas.

### Decisão 4 — `?new=1` como contrato de deep-link

Era tentador passar um estado via Pinia entre Dashboard e TasksView. Pior — acopla duas views sem necessidade. Query param é URL-first, shareable, e o `router.replace` pós-abertura limpa. Mesmo padrão pode ser reusado para `?edit=:id` no futuro.

## 2.3 Arquivos alterados (commit `0d1ea7c`)

```
+ src/composables/useNavQuarters.ts                   (novo)
~ src/core/components/shells/shared/NavList.vue       (usa composable)
~ src/core/components/shells/FocusShell.vue           (tree de Tarefas)
~ src/core/components/shells/CanvasShell.vue          (aba + popover + dock)
~ src/features/dashboard/DashboardView.vue            (3 botões wired)
~ src/features/tasks/TasksView.vue                    (?new=1 → dialog)
~ src/components/modals/EventModal.vue                (rewrite tokens)
~ src/components/tasks/TaskForm.vue                   (rewrite tokens)
```

Diff: **+1666 / -613** em 8 arquivos.

## 2.4 Não escopo

- **Sistema de notificações** (sinos dos shells). Removidos, não substituídos.
- **Criação inline na Dashboard.** "Nova tarefa" redireciona pra TasksView com `?new=1`; criar direto na home sem contexto de mês não é coerente.
- **TaskDetailsView** — continua com `mdi-*` e `rgb(var(--v-theme-*))`. Escopo da [próxima spec](./legacy-views-migration.md).

---

# PARTE 3 — Acceptance Criteria

**Shells**
- [x] Em `ui.shell = command`: sidebar mostra Tarefas > Q1..Q4 > Relatório + meses (comportamento preexistente)
- [x] Em `ui.shell = focus`: rail tem botão Tarefas; coluna de contexto mostra árvore Q1..Q4 quando em `/tasks` ou `/relatorio`
- [x] Em `ui.shell = canvas`: topbar tem aba "Tarefas" com popover; dock tem ícone `ListTodo`
- [x] Ao navegar por URL direta (`/tasks/:id`), o shell ativo destaca o mês correspondente sem reload

**Dead buttons**
- [x] Dashboard "Nova tarefa" abre o modal de criação direto no primeiro mês disponível
- [x] Card de projeto na Dashboard troca empresa ativa + vai pra `/variables`
- [x] Agenda da Dashboard leva pra `/calendar`
- [x] CanvasShell "Novo" abre Command Palette
- [x] Botões decorativos sem função foram removidos (não deixados "em breve")

**EventModal**
- [x] Abrir e fechar 10x seguidos não causa lag perceptível
- [x] Todos os 7 tipos (MEETING/DEADLINE/REMINDER/SPRINT/RETROSPECTIVE/TASK/PERSONAL) aparecem no grid
- [x] Editar evento de tipo TASK mostra ícone + cor corretos (antes caía em fallback)
- [x] Tiptap não acumula listeners entre aberturas (editor persistente + clear no close)

**TaskForm**
- [x] Campo de descrição existe e é enviado no payload (antes era sempre vazio)
- [x] ⌘+Enter / Ctrl+Enter cria a tarefa
- [x] Chips de prioridade com tom semântico por nível
- [x] Anexo mostra tamanho + botão de remoção

## Testes manuais executados

- `npx vue-tsc --noEmit` → exit 0
- `npm run dev` → inicia sem erros
- Validação visual no browser: **pendente** — feita pelo usuário após o commit, confirmada como "perfeita"

## Definition of Done

- [x] Commit único no `develop` (`0d1ea7c`)
- [x] Type-check limpo
- [x] Dev server sem warnings novos
- [x] Spec retroativa (este documento)
- [ ] Push para remote — deferido ao usuário
