# Spec: Legacy Views Migration — mdi → lucide + tokens

**Status:** Planejada (não iniciada)
**Criado em:** 2026-04-22
**Tipo:** Refactor por lote (sem mudança de comportamento)
**Locale:** pt-BR
**Spec-mãe:** [design-system-evolution.md](./design-system-evolution.md)
**Spec irmã:** [shell-nav-unification.md](./shell-nav-unification.md) — rodada anterior deixou estas views pendentes.

---

## Visão Geral

Depois da Fase P e da rodada de shell-nav-unification, o app tem duas camadas coexistindo:

- **Moderna** — Dashboard, CompanyVariables, Board (F3), CompanyUsers, Calendar, Notes, Settings, Login, AppShell e todos os shells. Usa tokens (`var(--text)`, `var(--surface)`, etc.), `lucide-vue-next` e tipografia Inter. É o padrão.
- **Legada** — views que não foram tocadas pela Fase P e ainda dependem de `mdi-*` (via fonte MDI carregada globalmente) e `rgb(var(--v-theme-primary))` / `rgba(var(--v-theme-secondary), 0.X)` para cores. É o que está destoando.

**Contagem atual** (`mdi-` + `rgb(var(--v-theme-`):

| Arquivo | Ocorrências | Prioridade |
|---|---|---|
| `features/tasks/TaskDetailsView.vue` | 47 | **Alta** — tela central de workflow, acessada toda hora |
| `components/modals/NoteModal.vue` | 31 | Alta — modal chave do fluxo de notas |
| `features/workspace/WorkspaceView.vue` | 23 | Média — agregado de empresas |
| `features/tickets/TicketsView.vue` | 22 | Média — lista de tickets |
| `features/tasks/TasksView.vue` | 21 | Alta — tela do mês (parcialmente tocada) |
| `components/tasks/KanbanBoard.vue` | 17 | **Alta** — componente de tasks, high-traffic |
| `features/notes/NoteEditorView.vue` | 14 | Média — editor de nota |
| `features/notes/NotesView.vue` | 10 | Baixa |
| `components/reports/TiptapEditor.vue` | 8 | Baixa |
| `features/reports/ReportView.vue` | 6 | Média |
| `features/companies/components/AddUserModal.vue` | 4 | Baixa |
| `features/companies/components/BulkAddUsersModal.vue` | 4 | Baixa |
| `src/core/components/NavigationDrawer.vue` | 4 | **Morto** — investigar se ainda é usado; se não, deletar |
| `features/download/DownloadView.vue` | 3 | Baixa |
| `components/CreateUserModal.vue` | 1 | Baixa |
| `CLAUDE.md` | 3 | Doc — atualizar contagem após migração |
| `plugins/tokens.ts` | 1 | Legítimo — `vuetifyThemeColors` exporta `rgb()` para compat |

**Total:** 219 ocorrências em 17 arquivos (somente 1 é legítima — a config de compat no `tokens.ts`).

**Meta final:** zero `mdi-*` no código (permite remover `@mdi/font` do `package.json`), zero `rgb(var(--v-theme-*))` fora de `plugins/tokens.ts`.

## Discovery

**Padrões herdados a eliminar:**

1. `<v-icon>mdi-xxx</v-icon>` — substituir por componente lucide com `:size` prop.
2. `<v-btn icon="mdi-xxx">` — trocar por `<v-btn><lucide-icon /></v-btn>` ou botão custom tokenizado quando for CTA principal.
3. `rgb(var(--v-theme-primary))` → `var(--surface)` ou `var(--bg)` conforme contexto.
4. `rgb(var(--v-theme-secondary))` → `var(--text)`.
5. `rgba(var(--v-theme-secondary), 0.7)` → `var(--text-2)` (70%), `0.48` → `var(--text-3)`, `0.32` → `var(--text-4)`, `0.12`-`0.06` → `var(--border)` ou `var(--surface-2)`.
6. Hex soltos em `<style>` — só quando não há token semântico aplicável (e nesse caso, **adicionar token** antes de usar).

**Guardrails da spec-mãe que se aplicam:**
- Tokens > overrides
- Monocromático semântico
- Inter em todo texto (já garantido por `font-family: inherit`)
- Motion 120-180ms
- `press` / `hover-lift` / `glass` utilities disponíveis em `styles/reset.css`

---

# PARTE 1 — Design Doc

## 1.1 Fase L1 — Tasks Stack (TaskDetails + KanbanBoard + TasksView)

**Escopo:**
- `features/tasks/TaskDetailsView.vue` (47 ocorrências)
- `components/tasks/KanbanBoard.vue` (17 ocorrências)
- `features/tasks/TasksView.vue` (21 ocorrências remanescentes — cabeçalho, filtros, dialog de delete)

**Razão de juntar:** os três compõem o fluxo de task — abrir mês → ver kanban → clicar card → editar detalhes. Tocar um sem tocar os outros deixa a cadeia inconsistente.

### TaskDetailsView

- Cabeçalho com breadcrumb inline (`Tarefas / Mês / Título`) — hoje é `v-breadcrumbs` com `mdi-chevron-right`.
- Painel esquerdo: título (inline-edit), descrição (Tiptap), metadados (responsáveis/prazo/prioridade/anexos).
- Painel direito: subtasks (lista + modal de criação rápida).
- "Improve with AI" (`improveWithAI()`) — botão e card de sugestão usam mdi; migrar pra `Sparkles` + card tokenizado.
- Modais internos (subtask view, quick subtask) — reusar o estilo do `TaskForm` novo.

### KanbanBoard

- Status colors hardcoded (`#6B7280`, `#F59E0B`, `#8B5CF6`, `#10B981`) → `var(--status-todo)`, `var(--status-prog)`, `var(--status-test)`, `var(--status-done)`.
- Cards: remover `rgb(var(--v-theme-primary))` → `var(--surface)`.
- Indicador de drag/drop (vue-draggable-plus) — preservar comportamento.

### TasksView

- Toolbar (botões de view toggle / filtros / nova atividade) já está 80% tokenizada; restam `<v-icon>mdi-*</v-icon>` dentro dos botões — trocar.
- Dialog de delete — migrar para padrão inline confirm (igual ao do novo EventModal).

## 1.2 Fase L2 — Notes Stack (NoteModal + NoteEditorView + NotesView + TiptapEditor)

**Escopo total:**
- `components/modals/NoteModal.vue` (31)
- `features/notes/NoteEditorView.vue` (14)
- `features/notes/NotesView.vue` (10)
- `components/reports/TiptapEditor.vue` (8)

**Razão de juntar:** mesmo editor compartilhado (Tiptap), mesmos tipos de controles (toolbar bold/italic/link). Criar **um** `TipTapToolbar.vue` primitivo em `components/ui/` tokenizado, reusado pelos 4.

### Artefato novo: `components/ui/TipTapToolbar.vue`

Props: `editor: Editor`, `compact?: boolean`. Ícones lucide (`Bold`, `Italic`, `Underline`, `List`, `ListOrdered`, `Link2`, `Strikethrough`, `Code2`, `AlignLeft/Center/Right`). Usa as classes `.tool-btn` / `.tool-sep` já padronizadas no `EventModal` novo — extrair para um CSS utility ou primitive.

## 1.3 Fase L3 — Tickets + Reports + Workspace

**Escopo:**
- `features/tickets/TicketsView.vue` (22)
- `features/reports/ReportView.vue` (6)
- `features/workspace/WorkspaceView.vue` (23)

Cada uma é self-contained. Tickets tem filtros parecidos com TasksView — reusar o padrão de `.filter-chip` e `.view-toggle` já tokenizados. Reports usa echarts + Tiptap — a parte de TipTap sai na L2. Workspace é agregado de empresas — padrão de "card de empresa" reusa o estilo do card de projeto do Dashboard.

## 1.4 Fase L4 — Modais administrativos e polish final

**Escopo:**
- `features/companies/components/AddUserModal.vue` (4)
- `features/companies/components/BulkAddUsersModal.vue` (4)
- `components/CreateUserModal.vue` (1)
- `features/download/DownloadView.vue` (3)
- `src/core/components/NavigationDrawer.vue` (4) — investigar se ainda é referenciado

Após L4: rodar `grep -r "mdi-" src/` deve retornar zero. Remover `@mdi/font` do `package.json`, remover import em `main.ts` se houver, remover dependência do bundle.

**Nota sobre `NavigationDrawer.vue`:** criado antes dos shells atuais. Se nenhum arquivo em `src/**/*.{ts,vue}` o importar, deletar junto com a L4 (não é backwards-compat, é código morto).

---

# PARTE 2 — Architecture Doc

## 2.1 Novo primitive: `TipTapToolbar`

```
src/components/ui/TipTapToolbar.vue       (novo)
```

Consolida a toolbar de edição de texto rica em um componente único. Evita que os 4 consumidores divirjam de novo.

## 2.2 Não há novos composables

Nem estado novo nem fetch novo. Migração é puramente de estilo + ícones. Se durante a implementação aparecer lógica duplicada (ex.: `formatDate` em 3 views), extrair para `utils/format.ts` — decisão no momento.

## 2.3 Decisões

### Decisão 1 — Migração em 4 fases, não arquivo-por-arquivo

A regra "uma fase = uma PR / um commit" da spec-mãe se mantém. Fatias menores geram churn no design system: cada fase fecha uma área inteira para não deixar sub-telas destoando entre si.

### Decisão 2 — Vuetify permanece onde faz sentido

`<v-dialog>` continua sendo o container de modais (provê backdrop + escape + scroll trap). `<v-progress-circular>`, `<v-pagination>` e `<v-data-table>` seguem Vuetify. O que migra é **ícone** (mdi → lucide) e **cor** (rgb theme → token). Props `color="secondary"` dos componentes Vuetify permanecem — elas resolvem pra `vuetifyThemeColors` exportado de `tokens.ts`, o que é legítimo.

### Decisão 3 — Remover `@mdi/font` só ao final da L4

Remover antes quebra os arquivos ainda não migrados. Não criar flag de transição: migrar tudo, depois deletar a dependência em um commit atômico.

### Decisão 4 — `KanbanBoard.vue` é primitivo de features/tasks, não de components/ui

Apesar de estar em `components/`, é acoplado ao domínio de tasks. Não será movido nesta spec (reorganização de pastas é escopo à parte).

## 2.4 Não escopo

- **Redesign funcional** de qualquer view. Nada de adicionar features novas, só alinhar visual.
- **Substituição do Tiptap** por outro editor.
- **Testes automatizados**. Projeto não tem framework de testes de UI instalado.
- **Migração do `workflow-api` backend**. Totalmente fora.

---

# PARTE 3 — Tasks e Implementação

## L1 — Tasks Stack

**Entrega esperada:** 1 commit, ~600-900 linhas de diff.

- [ ] Migrar `TaskDetailsView.vue` — ícones, tokens, inline-edit de título, card de sugestão AI
- [ ] Migrar `KanbanBoard.vue` — status tokenizado, cards tokenizados
- [ ] Migrar `TasksView.vue` (restante) — filtros, dialog de delete virar inline confirm
- [ ] Unificar dialog de subtask com o padrão do novo `TaskForm`

## L2 — Notes Stack

**Entrega esperada:** 1 commit, ~400-700 linhas.

- [ ] Criar `components/ui/TipTapToolbar.vue`
- [ ] `NoteModal.vue` consumindo TipTapToolbar
- [ ] `NoteEditorView.vue` consumindo TipTapToolbar
- [ ] `NotesView.vue` tokenizada
- [ ] `components/reports/TiptapEditor.vue` consumindo TipTapToolbar

## L3 — Tickets + Reports + Workspace

**Entrega esperada:** 1 commit, ~500-800 linhas.

- [ ] `TicketsView.vue` — filtros + cards tokenizados, ícones lucide
- [ ] `ReportView.vue` — tokenizar echarts wrapper + controles
- [ ] `WorkspaceView.vue` — cards de empresa + filtros

## L4 — Admin modals + cleanup final

**Entrega esperada:** 1 commit final, ~200-400 linhas + package.json delta.

- [ ] `AddUserModal.vue`, `BulkAddUsersModal.vue`, `CreateUserModal.vue`
- [ ] `DownloadView.vue`
- [ ] Auditar uso de `NavigationDrawer.vue` — remover se morto
- [ ] Remover `@mdi/font` do `package.json` e imports em `main.ts`
- [ ] `grep -r "mdi-" src/` → zero ocorrências
- [ ] `grep -r "rgb(var(--v-theme-" src/ | grep -v tokens.ts` → zero
- [ ] Atualizar `src/CLAUDE.md` — remover aviso "~171 ocorrências restantes"

---

# PARTE 4 — Acceptance Criteria

## Por fase

**L1**
- Toda ação de uma task (abrir detalhes, mover no kanban, criar subtask, deletar, filtrar) funciona igual a hoje
- Zero `mdi-*` em `features/tasks/**`, `components/tasks/**`
- Status no kanban usa tokens `--status-*`
- Dialog de delete é inline confirm no estilo do EventModal novo

**L2**
- Todos os 4 consumidores de Tiptap usam `<TipTapToolbar :editor="editor" />`
- Zero `mdi-*` em `features/notes/**`, `components/modals/NoteModal.vue`, `components/reports/TiptapEditor.vue`
- Toolbar tem comportamento idêntico entre os 4 (mesma ordem, mesmos atalhos)

**L3**
- Tickets e Reports seguem o padrão visual de Dashboard e CompanyUsers
- Workspace consolida cards reutilizando o estilo de `.project-card` da Dashboard
- Zero `mdi-*` em `features/tickets/**`, `features/reports/**`, `features/workspace/**`

**L4 (final)**
- `grep -r "mdi-" src/` retorna zero
- `grep -r "rgb(var(--v-theme-" src/ | grep -v tokens.ts` retorna zero
- `@mdi/font` removido de `package.json` e bundle
- Build de produção não quebra
- `npx vue-tsc --noEmit` passa
- Dev server sobe sem warnings novos

## Global (ao fechar L4)

- [ ] Toda UI do app usa Inter + lucide + tokens
- [ ] CLAUDE.md atualizado: remover nota sobre migração mdi incompleta
- [ ] Bundle size: medir antes / depois (expectativa: -150KB de MDI font)
- [ ] Lighthouse: nenhuma regressão em `Performance` nem `Accessibility`

---

# PARTE 5 — Testes Manuais (happy path por fase)

**L1**
1. Login → ir em `/tasks/:monthId`
2. Criar tarefa via modal → cria e aparece em `TODO`
3. Arrastar card de `TODO` → `DONE` → status persiste no backend
4. Clicar card → abre `TaskDetailsView`
5. Editar título inline → salva
6. Criar subtask → aparece na lista
7. Usar "Improve with AI" → recebe sugestão, aplicar funciona
8. Deletar tarefa → confirm inline → sumiu do board

**L2**
1. Ir em `/notes` → criar nota via modal → salva
2. Abrir nota existente → editor carrega com toolbar lucide
3. Testar cada botão da toolbar (bold/italic/link/lista)
4. Salvar e reabrir → conteúdo preservado

**L3**
1. Ir em `/tickets` → filtrar por status → funciona
2. Ir em `/relatorio/:quarterId` → charts renderizam
3. Ir em `/workspace` → cards de todas as empresas, clicar troca contexto

**L4**
1. Criar usuário via admin → modal funciona, visual consistente
2. Bundle em produção (`npm run build`) → sem erros
3. Abrir app com Devtools Network → requisição a `@mdi/font` não existe mais

---

## Definition of Done

Cada fase:
- Commit único no `develop` com prefixo `refactor(views):` ou `chore(ds):`
- Type-check limpo
- Diff coerente com o escopo declarado da fase
- Usuário valida visualmente antes da próxima fase começar

Global:
- Todas as 4 fases entregues
- `@mdi/font` fora do bundle
- Esta spec vira `Status: Concluída` e a spec-mãe tem sua nota de "~171 ocorrências restantes" removida

---

## Perguntas em aberto

1. `NavigationDrawer.vue` é código morto? Decisão: auditar em L4, deletar se confirmado.
2. `TiptapEditor.vue` (em `components/reports/`) e `NoteEditor` (em `features/notes/`) usam a mesma lib mas têm wrappers diferentes. Consolidar em um único? Decisão: resolver durante L2 — se a diferença é só config, consolidar; se há lógica específica por contexto, manter separados e só compartilhar a toolbar.
3. Depois da L4, faz sentido extrair um pacote interno `@/design-system` com os primitives? Não nesta spec — overhead de manutenção sem benefício enquanto o app é mono-repo.
