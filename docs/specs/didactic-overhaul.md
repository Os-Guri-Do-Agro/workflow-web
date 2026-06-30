# Spec: Overhaul Didatico do work-flow (branch develop)

**Status:** Implementado na branch `develop` (Ondas 1-3 + F8) — frontend completo; pendências de backend em [docs/BACKEND_HANDOFF.md](../BACKEND_HANDOFF.md)
**Criado em:** 2026-06-30
**Tipo:** Programa multi-fase (UX rework + a11y + fixes + débito técnico)
**Locale:** pt-BR (somente) — sem i18n nesta spec
**Specs-mãe:** [docs/specs/design-system-evolution.md](./design-system-evolution.md) (tokens, shells, lucide, motion) · [docs/specs/shell-nav-unification.md](./shell-nav-unification.md) (composables de nav, EventModal, dead buttons) — ambos confirmados em `docs/specs/`. Guia de código: `src/CLAUDE.md` (caminho real, confirmado).

---

## 1. Contexto e objetivo

O dono do produto rodou o app em uso real e listou 7 dores. Esta spec consolida essas 7 dores + uma auditoria de áreas com dados reais do repo num programa de fases entregáveis de forma independente. O alvo: o app sair de "MVP que mostra HTML cru e dados fake" para um produto **calmo, didático e acessível**, pronto para **100+ usuários novos** (muitos com 50+ anos), sem trocar a stack (Vue 3.5 + Vuetify 4 + Pinia + Vue Router + @tanstack/vue-query).

Os 7 pedidos do dono, mapeados para fases:

| # | Pedido do dono | Fase |
|---|---|---|
| 1 | Notas estilo Notion (título + preview limpo, nunca HTML cru) | F1 |
| 2 | Home `/` sobrecarregada → calma e didática | F2 |
| 3 | Selects com HTML cru/inconsistentes → 1 componente padrão (+ varredura de entities) | F3 |
| 4 | Esconder o Canvas (reversível, sem deletar) e manter o Kanban | F4 |
| 5 | Ícone de ajuda no topo com onboarding pronto | F5 |
| 6 | Texto da IA com cara de `.md` cru → renderizar markdown | F6 |
| 7 | Auditoria geral: arrumar incompletos, preparar p/ escala, a11y 50+, documentar backend | F7 (a11y) + F8 (débito) + §12 (backend) |

O objetivo não é adicionar features — é **estabilizar, limpar e tornar legível** o que já existe.

---

## 2. Princípios (guardrails para todas as fases)

Herdamos os guardrails da [spec-mãe](./design-system-evolution.md) e adicionamos os específicos deste programa:

1. **Didático antes de denso.** A spec-mãe diz "densidade é feature". Aqui invertemos o default na Home e no onboarding: para o público 50+, **menos por vez, com hierarquia clara** vence. Densidade continua opt-in via Settings.
2. **Nunca mostrar markup cru ao usuário.** HTML do TipTap, markdown da IA, **entities HTML cruas** (`&aacute;`, `&ccedil;`, `&otilde;`) — nada disso pode vazar como texto. Sempre renderizar ou sanitizar para texto limpo. Isso vale tanto para `<option>` quanto para **prosa de ajuda** (ex.: textos do Roadmap), não só para selects.
3. **Tokens, não hex.** Mantido. Qualquer hex encontrado em componente vira token (`src/plugins/tokens.ts`).
4. **lucide em código novo.** `mdi-*` proibido em arquivos tocados. Reka-ui liberado para o `AppSelect`.
5. **Reversível por design.** Esconder o Canvas é feature flag + condicionais, **zero deleção de arquivos**. Reativar = trocar uma constante.
6. **Sem vibecoding no backend.** Nenhuma dependência de backend é assumida silenciosamente. Toda necessidade vai para §12 com rota + método + payload, marcada como bloqueante, opcional ou **a confirmar** (contrato ainda não verificado contra o backend real).
7. **A11y é critério de aceite, não polish.** Contraste WCAG AA, alvos de toque, fonte mínima e linguagem simples entram nos acceptance criteria, não num "depois".
8. **Defensivo no frontend.** Todo `v-html` passa por sanitização (DOMPurify) independentemente do que o backend promete.

---

## 3. Visão geral das fases

| Fase | Objetivo | Esforço | Depende de backend? |
|---|---|---|---|
| **F1** Notas estilo Notion | Preview de texto limpo nos cards; pin no editor; sensação Notion incremental | M | Não p/ o fix crítico; **a confirmar** p/ pin/cores/templates persistirem |
| **F2** Home `/` calma | Decompor DashboardView (2268 linhas), progressive disclosure, remover sparkline fake | L | Opcional (endpoints `?context=hero`, paginação melhoram, mas não bloqueiam) |
| **F3** Selects padronizados + entities | `AppSelect` único (reka-ui) substituindo selects nativos/v-select; varredura de entities cruas; sanitizar v-html | M | Não (frontend); confirmar sanitização backend é recomendado |
| **F4** Esconder Canvas | Feature flag reversível, guard de rota, limpar nav/shells/palette/onboarding | S | Não |
| **F5** Ajuda + Onboarding | `HelpButton` nos 3 shells abrindo o onboarding já existente | S | Não p/ o P0; opcional p/ persistência multidevice e painel de ajuda |
| **F6** Texto da IA | Renderizar markdown (marked + DOMPurify) em ReportView/BugReport; composable único | M | Não p/ render defensivo; **confirmar contrato** dos endpoints AI é necessário |
| **F7** Acessibilidade 50+ | Contraste WCAG AA, fonte mínima 12px, alvos 44px (checklist por componente), density real, linguagem simples | M | Não |
| **F8** Débito técnico | `updateTaskStatus` real, roadmap sem mock, tirar `as any`, hex→token, error bridge | L | Sim (contratos de status de task, roadmap, quarters) |

Ordem recomendada e quick wins em §13. F4 e F5 são os mais baratos e desbloqueiam UX imediata.

---

## 4. F1 — Notas estilo Notion

> **Escopo desta onda:** o **P0 entrega apenas o fix de preview limpo + pin**. A "sensação geral de Notion" completa (emoji/cor/cover/drag-drop/templates) é **P1/P2 e Onda 3** — não chega na primeira entrega. Isso é deliberado, para não gerar expectativa de que o app vira Notion já no primeiro PR.

### Estado atual (verificado)

- `src/features/notes/NotesView.vue` — **linha 134**: `note.content.substring(0, 100)` renderiza **HTML bruto** do TipTap como texto no card. O **título já é renderizado** (`note-title`); o bug é só no preview.
- `src/features/workspace/WorkspaceView.vue` — **linha 295**: mesmo bug com `.substring(0, 60)`. O título também já aparece aqui.
- `src/features/notes/NoteEditorView.vue`: editor TipTap completo. **Sem UI de pin** — `notesService.togglePin(id)` (notes-service.ts:39) existe mas nunca é chamado.
- `src/components/modals/NoteModal.vue`: editor em modal **nunca importado** em nenhuma view. Código duplicado; usa `mdi-*` violando convenção lucide.
- `src/service/notes/notes-service.ts:39`: expõe `togglePin(id: string)` — **sem parâmetro booleano**. Não existe `updatePin(id, isPinned)`.
- Conteúdo salvo como HTML string via `editor.getHTML()`. Sem sanitização frontend.
- `WorkspaceView.vue` usa `mdi-pin` (**linha 292**) e `mdi-folder` (**linha 297**) no card de notas do dashboard — `mdi-*` que precisa migrar para lucide ao tocar o arquivo (pedido 1).

### Mudanças

1. **Helper de preview limpo (P0, o bug crítico).** Criar `src/utils/html-preview.ts` com `stripHtmlPreview(html: string, max = 150): string` — extrai texto via `DOMParser` (`doc.body.textContent`), colapsa whitespace, trunca com reticências. Consumir em:
   - `NotesView.vue:134` → card mantém o **título** em destaque (já existe) + preview de texto limpo (3-line clamp já existe).
   - `WorkspaceView.vue:295` → mesmo helper.
2. **Pin no editor principal (P0).** Botão toggle de pin no topbar do `NoteEditorView.vue`. **Usar a API real `notesService.togglePin(id)`** (sem booleano). Se o produto exigir set explícito (idempotência) em vez de toggle, isso vira uma mudança de service documentada em §12 como **a confirmar** com o backend — não referenciar uma assinatura `updatePin(id, isPinned)` que não existe hoje. Notas pinadas aparecem primeiro em `NotesView` e `WorkspaceView`.
3. **Migrar `mdi-*` → lucide (P0, pedido 1).** Trocar `mdi-pin`/`mdi-folder` (WorkspaceView 292/297) e os `mdi-*` de qualquer arquivo de notas tocado por equivalentes lucide (`Pin`, `Folder`).
4. **Sensação Notion (P1).** Integrar o que o `NoteModal.vue` já tinha mas não plugou: emoji/cor por nota no header do editor. Cover image opcional. Drag-drop de notas entre pastas usando **sortablejs** (já em `package.json`). **Não entra no P0.**
5. **Consolidar duplicação (P1).** Decidir: integrar `NoteModal.vue` ao fluxo de edição rápida OU removê-lo do escopo ativo (mantido no repo, não importado). Não manter dois editores TipTap divergentes. Se mantido, migrar `mdi-*` → lucide.
6. **UX (P2).** Trocar `window.prompt()` de imagem por input/file-picker integrado. Confirm ao excluir nota (reusar `ConfirmDialog`).

### Criterios de aceite

- [ ] Card de nota em `NotesView` mostra título + preview de **texto legível** (zero tags HTML visíveis)
- [ ] Card de nota no `WorkspaceView` (últimas 5) usa o mesmo helper e mostra texto limpo
- [ ] `stripHtmlPreview('<h1>Olá</h1><p>mundo</p>')` retorna `"Olá mundo"` (não `"<h1>Olá..."`)
- [ ] Botão de pin existe no `NoteEditorView`, alterna estado **via `togglePin(id)`** e persiste; notas pinadas aparecem primeiro
- [ ] Nenhum `mdi-*` em arquivo de notas tocado, incluindo `mdi-pin`/`mdi-folder` (WorkspaceView 292/297)
- [ ] `window.prompt` removido do fluxo de inserir imagem
- [ ] Excluir nota pede confirmação

### Backend needs

- `PATCH /notes/:id` aceitando `{ isPinned?, coverImage?, noteColor? }` — **contrato a confirmar**: o service atual só expõe `togglePin(id)`, sem rota/payload de pin/cor/cover conhecidos. Não tratar o payload abaixo como definitivo até o backend confirmar (§12).
- `GET /notes?isPinned=true&sort=updatedAt` para ordenar pinadas primeiro — **a confirmar**.
- (opcional, otimização) campo `preview` plaintext no `GET /notes` para não derivar no cliente.
- (P1) sanitização de `content` HTML no backend antes de persistir (defesa XSS).

---

## 5. F2 — Home `/` calma

### Estado atual

- `src/features/dashboard/DashboardView.vue`: **2268 linhas / ~57KB**, monolítico. 7 seções num único arquivo (Hero, Stats Row, Grid Main, Agenda, Copilot, Feed, Projects).
- **Linha 269** (confirmado): fallback de sparkline `Array(7).fill(Math.max(0, v))` vira flatline sem indicar "sem dados" — confunde 50+.
- **Linhas 516-519** (confirmado): `heroSpark` é 100% fake (`Math.round(... + Math.sin(i * 0.6) * ...)`), consumido em `:option="sparkOption(heroSpark, ...)"` na linha 602; nunca sincroniza com `weeklyTrendData` real.
- **Linha 663** (confirmado): `color-mix(in srgb, ...)` resolvido em JS inline a cada render (há outros `color-mix` em CSS estático, que são OK; o alvo é o inline de runtime).
- **Linha 2249** (confirmado): breakpoint único `@media (max-width: 960px)`. Tablets (768-1024px) ficam apertados.
- **Linha 410** (confirmado): `const projects = computed(...)` — Projects deriva da lista de companies; carrega todas sem limite/paginação.
- `onMounted` dispara múltiplas queries em paralelo sem priorização. Usuário 50+ vê skeleton de tudo antes de qualquer informação útil.

> Linhas 269, 410, 516-519, 663 e 2249 **foram verificadas no código atual** antes de publicar.

### Mudanças

1. **Decompor em sub-componentes (P0).** Quebrar `DashboardView.vue` em `src/features/dashboard/components/`: `HeroSection.vue`, `StatsRow.vue`, `ActivityPanel.vue`, `AgendaSection.vue`, `CopilotSection.vue`, `FeedSection.vue`, `ProjectsSection.vue`. Orquestração em `src/composables/useDashboardOrchestration.ts`.
2. **Progressive disclosure (P0).** Hero + Stats carregam primeiro (caminho crítico). Activity + Chart depois. Agenda/Feed/Projects via lazy-load (IntersectionObserver, novo `src/composables/useLazyLoad.ts`).
3. **Acabar com o fake (P1).** Remover `heroSpark` (Math.sin, 516-519) — ou usar `weeklyTrendData` real, ou remover a decoração. Quando sparkline está em fallback (sem dados, linha 269), marcar visualmente como "sem atividade" em vez de flatline ambíguo.
4. **Responsividade escalonada (P1).** Além do `@media (max-width: 960px)` (linha 2249), adicionar breakpoints `1024px` e `768px`. Stats e grid principal degradam em passos.
5. **Limites e calma visual (P2).** `color-mix()` inline (linha 663) → classe CSS/token pré-computado. Projects (linha 410) com "Ver todos" / paginação para orgs grandes. Reduzir ruído: menos seções acima da dobra, mais respiro.

### Criterios de aceite

- [ ] `DashboardView.vue` orquestra sub-componentes; nenhum sub-componente passa de ~400 linhas
- [ ] Hero + Stats renderizam antes de Feed/Projects (verificável: Feed/Projects só fazem fetch quando entram no viewport)
- [ ] Nenhum dado fake (`Math.sin`) em sparkline — ou some, ou reflete dado real
- [ ] Sparkline sem dados mostra estado "sem atividade" distinguível de zero
- [ ] Layout não quebra em 768px, 1024px e 1440px (sem scroll horizontal em nenhum)
- [ ] Acima da dobra em 1440px: Hero + Stats cabem **sem scroll horizontal e com altura combinada ≤ altura do viewport** (critério objetivo; "sem aperto" = sem clipping nem overflow)

### Backend needs

- (opcional) `GET /dashboard/company/:id?context=hero` — só hero/stats, para priorizar caminho crítico
- (opcional) `GET /backlog/company/:id?limit=20&offset=0` — paginação
- (opcional) `GET /companies/withMetrics?limit=12` + `totalCount` — evitar carregar todas as companies
- Nenhum é bloqueante: o frontend já tem os dados, só reorganiza a entrega.

---

## 6. F3 — Selects padronizados (AppSelect) + varredura de entities

> **Dois problemas distintos nesta fase:** (a) selects inconsistentes → `AppSelect`; (b) **entities HTML cruas em texto** (`&aacute;`, `&ccedil;`, `&otilde;`). O (b) é **mais amplo** que um único `<option>`: aparece em **prosa de ajuda**, não só em selects, e não será resolvido por trocar o select. Por isso há um item de **varredura global de entities** separado da migração do AppSelect.

### Estado atual (verificado)

`grep -rl '<select'` retorna **9 arquivos**:
- `src/features/board/BoardView.vue` — `.filter-select`
- `src/features/tasks/TaskDetailsView.vue` — `.meta-select`
- `src/features/tasks/TasksView.vue` — `.filter-select` (variante diferente do BoardView)
- `src/features/roadmap/RoadmapView.vue` — `.monthly-control` / `.select-control` / `.monthly-export-select`
- `src/features/repos/RepoBrowserView.vue` — `<select>` sem classe
- `src/features/notes/NoteEditorView.vue` — `.sidebar-select`
- **`src/features/companies/components/VariablesToolbar.vue`** — **estava faltando na lista original; incluído agora** (sem ele, "padronizar em todo o app" é falso)
- `src/components/modals/EventModal.vue` — select(s) em modal
- `src/components/modals/NoteModal.vue` — select(s) em modal (editor não importado; tratado junto com F1)

V-Select Vuetify dispersos (densidades inconsistentes): `TaskDetailsView.vue` (3x), `CreateUserModal.vue`, `AddUserModal.vue`, `BulkAddUsersModal.vue`.

**Entities HTML cruas (escopo ampliado):**
- `RoadmapView.vue:1965`: `<option>Todas as &aacute;reas</option>` (entity em `<option>`).
- **Prosa de ajuda do Roadmap** com entities cruas, que **não são `<select>`** e **não serão corrigidas pela migração do AppSelect**: linhas **1297, 1315, 1316, 1329, 1335, 1343, 1350, 1362, 1364, 1368** (e arredores). Esses textos precisam de uma **varredura de entities em texto**, separada.

HTML cru / risco de `v-html` sem sanitização: `TaskDetailsView.vue`, `RepoBrowserView.vue`, `ReportView.vue:199` (este se reconcilia com F6).

### Mudanças

1. **Criar `src/components/ui/AppSelect.vue` (P0).** Primitivo único sobre **reka-ui Select** (liberado pelo dono), tokenizado, API unificada: `:items`, `v-model`, `label`, `placeholder`, `density`, `disabled`. Renderiza opções como **texto** (nunca v-html), corrigindo o `&aacute;` na origem do `<option>`. Alvo de toque ≥ 44px (alinhado com F7). Chevron lucide.
2. **Migrar selects nativos (P1).** Substituir as classes locais por `AppSelect` em **BoardView, TasksView, TaskDetailsView, RoadmapView, NoteEditorView, RepoBrowserView e VariablesToolbar**. Avaliar EventModal/NoteModal junto (NoteModal depende da decisão de F1). Remover as classes locais.
3. **Varredura global de entities em texto (P0, separado do AppSelect).** Substituir entities cruas (`&aacute;`, `&ccedil;`, `&otilde;`, etc.) por caracteres acentuados reais (UTF-8) em **toda prosa**, com foco no Roadmap (linhas 1297-1368 listadas acima) e em qualquer `<option>` (1965). Critério: `grep` por `&[a-z]+;` em `.vue` de texto visível volta vazio nos arquivos tocados.
4. **Sanitizar v-html (P0).** Adicionar DOMPurify em todo `v-html` de conteúdo: `TaskDetailsView.vue`, `ReportView.vue:199`, `RepoBrowserView.vue`. (ReportView se reconcilia com F6.)
5. **Documentar (P2).** Registrar a convenção `AppSelect` + "texto, nunca entity" no `src/CLAUDE.md` e referenciar `AppSelect` na [design-system-evolution.md](./design-system-evolution.md).

### Criterios de aceite

- [ ] `src/components/ui/AppSelect.vue` existe, tokenizado, sem hex, lucide para o chevron
- [ ] Nenhum `<select>` nativo permanece em BoardView, TasksView, TaskDetailsView, RoadmapView, NoteEditorView, RepoBrowserView **e VariablesToolbar**
- [ ] Opção "Todas as áreas" (RoadmapView:1965) renderiza com acento correto, sem `&aacute;` literal nem v-html
- [ ] **Prosa de ajuda do Roadmap (linhas ~1297-1368) sem entities cruas** — `grep` por `&[a-z]+;` em texto visível volta vazio nos arquivos tocados
- [ ] Todo `v-html` listado passa por DOMPurify (injetar `<img onerror>` não executa)
- [ ] `AppSelect` é navegável por teclado (abrir, setas, Enter, Esc) e tem foco visível
- [ ] Convenção documentada no `src/CLAUDE.md`

### Backend needs

- Confirmar contrato de sanitização de `activityInfo.description` / `selectedSubtask.description` (`GET/PATCH /activity/:id`): o backend já remove `<script>`/`<iframe>`? Mesmo que sim, o frontend sanitiza por defesa. (§12, **a confirmar**)

---

## 7. F4 — Esconder o Canvas (manter Kanban)

> **Decisão travada:** esconder é **reversível** e **não deleta** arquivos. O Kanban (`/board`, `src/features/board/BoardView.vue`) **fica** — é separado do Canvas.

### Estado atual (verificado)

Canvas = boards de desenho colaborativo Yjs/Hocuspocus, integrado em 4 camadas:
- **Rotas** `src/router/index.ts`: `/boards`, `/boards/:id`, `/public/board/:token`.
- **Nav**: `NavList.vue:51` (item "Canvas"), `CommandShell.vue` (breadcrumb), `CanvasShell.vue` (aba, dock), `FocusShell.vue` (aba, botão).
- **Palette/Onboarding**: `CommandPalette.vue:100` (`nav-canvas`), `WelcomeGuide.vue:40` (step "Canvas", `to: /boards` — confirmado).
- **Shell variant**: `tokens.ts:4` (`ShellVariant = 'command'|'focus'|'canvas'` — confirmado), `SettingsView.vue` (opção + preview), `AppShell.vue` (import/seleção de `CanvasShell`).
- **Arquivos Canvas-only**: `features/boards/BoardsListView.vue`, `features/boards/BoardCanvasView.vue`, `features/public/PublicBoardView.vue`, `composables/useBoards.ts`, `useCompanyBoards.ts`, `service/boards/boards-service.ts`, `service/share/share-service.ts`.
- **Deps Canvas-only** (`yjs`, `@hocuspocus/provider`, `perfect-freehand`) — nenhuma outra feature usa.

### Mudanças

1. **Feature flag (P0).** `export const CANVAS_ENABLED = import.meta.env.VITE_CANVAS_ENABLED === 'true'` (default `false`) em `src/plugins/tokens.ts` (ou novo `src/config/feature-flags.ts`).
2. **Guard de rota (P0).** Em `router.beforeEach`, se `!CANVAS_ENABLED` e `to.name ∈ {boards, board-canvas, public-board}` → redireciona para `home`.
3. **Limpar nav (P0).** `NavList.vue:51` condicional ao flag. `CommandPalette.vue:100` remove `nav-canvas` quando flag off. `CommandShell.vue` não renderiza breadcrumb de `/boards`.
4. **Limpar shells (P0).** `CanvasShell.vue`, `FocusShell.vue`: abas/dock/botão Canvas condicionais. `SettingsView.vue`: remover opção e preview "Canvas" da grade de shells.
5. **Fallback de shell variant (P1).** `AppShell.vue`: se `!CANVAS_ENABLED && shell === 'canvas'`, resetar para `'command'` (usuários com `ui.shell=canvas` em localStorage não quebram).
6. **Onboarding (P0).** `WelcomeGuide.vue:40`: remover step Canvas dos tours.
7. **Plano de reversão (P1).** Criar `docs/CANVAS_DEACTIVATION.md` com o checklist exato de reativação (= `VITE_CANVAS_ENABLED=true`). Marcar Canvas como "Desabilitado (feature flag)" no `src/CLAUDE.md`.
8. **(P2)** `PublicBoardView.vue` mostra mensagem graciosa se acessado com flag off; lazy-load das deps Yjs para tirar ~50-100KB do bundle quando desabilitado.

### Criterios de aceite

- [ ] `CANVAS_ENABLED = false` esconde Canvas de nav, palette, shells, settings e onboarding
- [ ] `/boards`, `/boards/:id`, `/public/board/:token` redirecionam para `home` quando flag off
- [ ] Usuário com `ui.shell='canvas'` em localStorage cai em `CommandShell` sem tela quebrada
- [ ] **Kanban (`/board`) continua 100% funcional e visível**
- [ ] **Nenhum arquivo de Canvas foi deletado** (`git status` não mostra deleções em `features/boards/`, `features/public/`, services/composables de boards)
- [ ] `VITE_CANVAS_ENABLED=true` restaura tudo sem outras edições
- [ ] `docs/CANVAS_DEACTIVATION.md` existe com checklist de reativação

### Backend needs

- **Nenhum obrigatório.** Endpoints `/boards/*` permanecem vivos; o guard frontend basta. (Opcional futuro: `GET /feature-flags { canvasEnabled }` para controle server-side; e `GET/PUT /user/shell-preference` para sync multidevice — §12.)

---

## 8. F5 — Ajuda + Onboarding no topo

### Estado atual (verificado)

Onboarding **já existe e funciona**:
- `src/components/onboarding/WelcomeGuide.vue`: modal, steps (Dashboard, Roadmap, Canvas, AI, Variables, Settings), linguagem acessível.
- `src/composables/useOnboarding.ts`: persiste em localStorage (`onboarding.autoShown`, `onboarding.completed`).
- `AppShell.vue`: abre 1x automaticamente na primeira rota logada.
- `CommandPalette.vue`: "Primeiros passos" via ícone Compass.

**Problema:** acesso só via Ctrl+K. Usuário 50+ não sabe que Cmd+K existe. As topbars têm `InboxBell` (32x32), `ThemeToggle` (30x30), `UserMenu`, `CmdKButton` — **mas nenhum botão de ajuda visível**.

### Mudanças

1. **Criar `HelpButton.vue` (P1).** Em `src/core/components/shells/shared/HelpButton.vue`, seguindo o modelo do `InboxBell.vue` (botão + tooltip, sem dropdown). Ícone lucide `HelpCircle`. Ao clicar, chama `useOnboarding().open()`. Tooltip exibe o atalho Cmd+K. Alvo ≥ 44px (F7).
2. **Integrar nos 3 shells (P1).**
   - `CommandShell.vue`: topbar, entre `CmdKButton` e `InboxBell`.
   - `FocusShell.vue`: slim-top, entre spacer e `InboxBell`.
   - `CanvasShell.vue`: topnav, entre `CmdKButton` e `InboxBell` (renderiza só se `CANVAS_ENABLED`, ver F4).
3. **(P2)** Linguagem mais explícita nos steps do `WelcomeGuide.vue` para 50+. Como Canvas está escondido (F4), o step Canvas sai dos tours.

### Criterios de aceite

- [ ] `HelpButton.vue` existe em `shells/shared/`, tokenizado, ícone lucide, tooltip com Cmd+K
- [ ] Botão de ajuda visível nas topbars de CommandShell, FocusShell e CanvasShell
- [ ] Clicar no botão abre o `WelcomeGuide` (mesmo fluxo do "Primeiros passos")
- [ ] Botão tem alvo de toque ≥ 44px e foco visível por teclado
- [ ] Onboarding não mostra mais o step de Canvas

### Backend needs

- **Nenhum para o P0** (tudo frontend + localStorage). Opcionais (§12): `PATCH/GET /user/onboarding-flags` (persistência multidevice), `GET /api/help/topics?lang=pt-BR` (painel de ajuda contextual), `DELETE /api/admin/users/:id/onboarding-state` (reset por suporte).

---

## 9. F6 — Texto da IA (renderização + prosa)

### Estado atual (verificado)

- `src/components/assistant/AssistantPanel.vue`: `formatRich()` (linha 99) faz markdown→HTML **manual** + `v-html` (linha 292). Padrão correto, mas limitado (não trata `#` headers, listas aninhadas, tabelas).
- `src/features/reports/ReportView.vue:199`: `<div v-html="suggestedContent">` **sem parsing nem sanitização**. Markdown cru aparece como texto literal. Conteúdo vem de `POST /quarter/:id/report/improve`.
- `src/features/bug-report/BugReportDetailView.vue` (linhas 137, 144): spec da IA em `<pre class="markdown-pre">` — markdown cru, sem formatação.
- `src/components/reports/TiptapEditor.vue`: aceita/emite HTML; sem conversão markdown→HTML no fluxo de melhoria.
- **Nenhuma lib de markdown nem DOMPurify instalada** (`marked`/`markdown-it`/`remark`/`dompurify` ausentes do `package.json`; **nenhum DOMPurify usado no repo hoje** — confirmado).

### Mudanças

1. **Adicionar `marked` + `DOMPurify` (P1).** Criar `src/composables/useMarkdownRenderer.ts` exportando `renderMarkdown(md: string): string` = `DOMPurify.sanitize(marked.parse(md))`. Único source of truth markdown→HTML seguro.
2. **Corrigir ReportView (P0).** `ReportView.vue:199`: `v-html="renderMarkdown(suggestedContent)"`. Headers, listas, ênfase renderizam; XSS sanitizado.
3. **Corrigir BugReportDetailView (P1).** Trocar o `<pre>` (137/144) por `v-html="renderMarkdown(...)"`. Manter `<pre>` apenas onde for código de verdade.
4. **Convergir AssistantPanel (P2).** Migrar `formatRich()` (99) para `useMarkdownRenderer` — remove o parser manual frágil e unifica o comportamento.

### Criterios de aceite

- [ ] `useMarkdownRenderer.ts` existe e sempre sanitiza com DOMPurify
- [ ] ReportView renderiza `# Título`, `**negrito**`, listas e links como HTML formatado (não texto literal)
- [ ] BugReportDetailView renderiza a spec da IA formatada (não `<pre>` cru)
- [ ] Markdown malicioso (`[x](javascript:alert(1))`, `<img onerror>`) é neutralizado
- [ ] AssistantPanel usa o composable comum (sem `formatRich` duplicado)

### Backend needs

- **Confirmar contrato** (necessário; não bloqueia o frontend defensivo): `POST /quarter/:id/report/improve` retorna **markdown ou HTML**? `POST /copilot/ask|diagram|roadmap|improve` retornam markdown, HTML ou plain text? Documentar o formato e se já vem sanitizado. (§12, **a confirmar**)

---

## 10. F7 — Acessibilidade 50+

### Estado atual (verificado)

- **Tipografia** (`src/styles/typography.css`): `.text-meta` (**11.5px**, linha 57) e `.text-eyebrow` (**10.5px**, linha 64) usados em ~30% da UI. Abaixo do mínimo 12px recomendado para 50+.
- **Contraste** (`src/plugins/tokens.ts`): `--text-3` (≈ 0.48 opacity, linhas 34-35) ≈ 3:1 e `--text-4` (≈ 0.32, linhas 59-60) ≈ 2:1 — **falham WCAG AA** (4.5:1). Scrollbar thumb quase invisível no light (`src/styles/reset.css`).
- **Alvos de toque** (padrão 26-32px vs WCAG 44x44).
- **Density**: `useUiPreferences.setDensity()` existe mas **só `v-list` Vuetify consome**. NotesView, VariableRow, NavList ignoram `uiStore.density`.
- **Linguagem**: jargão (Board, Canvas, Sprint, Backlog) sem explicação para 50+.

### Mudanças

1. **Fonte mínima 12px (P0).** Elevar `.text-meta` 11.5→12px e `.text-eyebrow` 10.5→12px (ou aposentar `.text-eyebrow` minúsculo) em `typography.css`. Ajustar usos hardcoded em NotesView, VariableRow, InboxBell.
2. **Contraste WCAG AA (P0).** Subir `--text-3` e `--text-4` para ≥ 4.5:1 (dark e light) em `tokens.ts`. Scrollbar thumb mínimo 0.4 de opacity por tema em `reset.css`.
3. **Density real (P1).** Fazer NotesView, VariableRow, NavList, NavigationDrawer consumirem `uiStore.density`.
4. **Alvos 44px — checklist por componente (P1).** Cada item abaixo é um critério verificável individual (área clicável; padding interno pode manter o visual compacto):

   | Componente | Alvo atual | Alvo final |
   |---|---|---|
   | `ThemeToggle` | 30×30 | ≥ 44×44 |
   | `InboxBell` | 32×32 | ≥ 44×44 |
   | `CmdKButton` (icon) | 30×30 | ≥ 44×44 |
   | Botão dismiss (toast/banner) | 28×28 | ≥ 44×44 |
   | `VariableRow` (ação de linha) | 30×30 | ≥ 44×44 |
   | `UserMenu` (avatar) | 26 | ≥ 44×44 |
   | `HelpButton` (F5) | novo | ≥ 44×44 |

5. **Escala "modo 50+" (P1-P2).** Tokens `--text-body-large`, `--text-title-large` e opção "Aumento de fonte" (1.0/1.1/1.2/1.3x) em Settings + `uiStores`.
6. **Linguagem (P1).** Tooltips/rótulos amigáveis para jargão em `SettingsView`, `WelcomeGuide`, `CommandShell`.

### Criterios de aceite

- [ ] Nenhum texto de UI abaixo de 12px (`.text-meta` e `.text-eyebrow` ≥ 12px)
- [ ] `--text-3` e `--text-4` atingem ≥ 4.5:1 contra a surface base (verificado com checker WCAG) em dark e light
- [ ] Scrollbar visível no tema claro
- [ ] Setting "Confortável" muda visivelmente NotesView, VariableRow e NavList
- [ ] **ThemeToggle 30→44** com hit-area ≥ 44×44
- [ ] **InboxBell 32→44** com hit-area ≥ 44×44
- [ ] **CmdKButton (icon) 30→44** com hit-area ≥ 44×44
- [ ] **Botão dismiss 28→44** com hit-area ≥ 44×44
- [ ] **VariableRow (ação) 30→44** com hit-area ≥ 44×44
- [ ] **UserMenu (avatar) 26→44** com hit-area ≥ 44×44
- [ ] **HelpButton (F5)** com hit-area ≥ 44×44
- [ ] Foco por teclado visível em todos os interativos citados
- [ ] Jargão (Canvas/Board/Sprint/Backlog) tem tooltip ou rótulo explicativo

> Nota de escopo: o pedido do dono falava em "acessível 50+ itens". Esta fase entrega um **checklist por componente** (alvos acima + tipografia + contraste + density + linguagem) em vez de uma contagem agregada; a granularidade por componente é o que torna cada item verificável um a um. Itens adicionais por componente serão acrescentados a esta tabela conforme a auditoria visual rota a rota.

### Backend needs

- **Nenhum.** (Os findings desta área não listam dependência de backend.)

---

## 11. F8 — Divida tecnica / itens incompletos

### Estado atual (verificado)

- **`src/features/board/BoardView.vue` (linhas 157-159)**: `updateTaskStatus(taskId, newStatus)` é **dead code** — só `console.log`, sem chamada de API. A chamada em `handleDrop` **não persiste**. Drag-drop do Kanban é visual mas não salva.
- **`src/features/roadmap/RoadmapView.vue`**: `quarters` (linha 130), `reviewMarkers` (linha 137) e demais (`lanes`, `roadmapItems`) **mockados hardcoded** (Q1-Q4 2026 fake). Modo `monthly` usa backend; modo timeline cai em mock.
- **`src/features/workspace/WorkspaceView.vue`**: hex hardcoded violando CLAUDE.md, nas faixas **22-117** — `statusConfig`/`roleConfig` (106-117), `eventColors` (75-83), cards de stats (22-43), além de um hex inline em estilo na **linha 234** (`style="color: #10B981"`). Hex confirmados: `#3B82F6, #10B981, #F59E0B, #EF4444, #8B5CF6, #6B7280`. Quebra theme switching. **(Faixa corrigida — não é "105-118".)**
- **`as any` / `: any`**: **46 arquivos contêm** a construção; o literal `as any` ocorre **~27 vezes** (a contagem total de ocorrências de `as any`/`: any` é maior que 27 e a de arquivos é 46 — não confundir as duas métricas). Pontos críticos: `useNavQuarters.ts`, `TasksView.vue`, `NoteEditorView.vue` (chains TipTap), `NavigationDrawer.vue`, `workspaceStores.ts`.
- **`console.error/log/warn`** dispersos em vez de `useToast` (que já existe).
- **`DownloadView.vue`**: `@ts-ignore` sem justificativa.

### Mudanças

1. **`updateTaskStatus` real (P0).** Implementar a persistência no Kanban via `PATCH /activity/:id/status` (BoardView 157-159). Drag-drop salva e dá feedback (toast).
2. **Roadmap sem mock (P0).** Substituir os dados hardcoded do modo timeline (quarters 130, reviewMarkers 137, lanes, roadmapItems) por carregamento real (`GET /company/:id/roadmap`). Se backend não tiver timeline anual, exibir empty state honesto em vez de fake. (Quebrar `RoadmapView` por modo é recomendado mas pode ser spec separada.)
3. **Hex → token (P1).** `WorkspaceView.vue` (faixas 22-117 + inline 234): trocar hex por `--status-*` / `--text-*`.
4. **Tipar `as any` (P1).** Tipos reais nos pontos críticos de onboarding/escala: `useNavQuarters`, `TasksView`, `workspaceStores`, `NavigationDrawer`. Helper tipado para os chains de tabela do TipTap (NoteEditorView).
5. **Error bridge (P1).** Substituir `console.error` em handlers por `useToast` (NavigationDrawer, workspaceStores, DashboardView, NotesView).
6. **(P2)** Documentar ou remover `@ts-ignore` em `DownloadView.vue`.

### Criterios de aceite

- [ ] Arrastar card no Kanban (`/board`) persiste o status (recarregar a página mantém a mudança)
- [ ] Roadmap em modo timeline mostra dados reais da API **ou** empty state — zero dados 2026 inventados (quarters/reviewMarkers/lanes/items)
- [ ] Nenhum hex hardcoded em `WorkspaceView.vue` (faixas 22-117 + linha 234); dark/light corretos
- [ ] `as any`/`: any` removidos em `useNavQuarters`, `TasksView`, `workspaceStores`, `NavigationDrawer` e nos chains do TipTap
- [ ] Handlers de erro citados usam `useToast`, não `console.error`
- [ ] `vue-tsc --noEmit` passa exit 0
- [ ] `@ts-ignore` em DownloadView tem comentário justificando ou foi removido

### Backend needs

- Confirmar `PATCH /activity/:id/status` — payload exato (`{ status: 'TODO'|'IN_PROGRESS'|'IN_TESTING'|'DONE' }`?) e se retorna a atividade inteira. (**a confirmar**)
- Validar retorno de `GET /company/:id/roadmap` — `{ quarters, lanes, items, milestones }`? Timeline anual existe ou só monthly? (**a confirmar**)
- Confirmar shape de `quarters` + `months` (`GET /company/:id/quarters`): `months` sempre array ou pode ser null? (**a confirmar**)

---

## 12. Backend: contrato consolidado

Toda dependência de backend reunida. **B = bloqueante** (a fase não entrega sem isso) · **O = opcional/otimização** (frontend funciona, backend melhora) · **C = a confirmar** (contrato ainda não verificado contra o backend real — **não tratar o payload como definitivo**).

> Aviso anti-vibecoding: os contratos de **pin/cor/cover de nota** e dos **endpoints de IA** estão marcados **C** porque o frontend hoje só conhece `togglePin(id)` e o formato das respostas de IA não foi verificado. Os payloads abaixo são propostas a validar, não verdades.

| Fase | Necessidade | Método + rota | Payload / resposta | Tipo |
|---|---|---|---|---|
| F1 | Persistir pin/cor/cover da nota | `PATCH /notes/:id` | `{ title?, content?, tags?, folderId?, isPinned?, coverImage?, noteColor? }` | **C** (service hoje só tem `togglePin(id)`) |
| F1 | Toggle de pin (existente) | `togglePin(id)` (notes-service.ts:39) | sem booleano | confirmado |
| F1 | Listar pinadas primeiro | `GET /notes?isPinned=true&sort=updatedAt` | query params | **C** |
| F1 | Preview plaintext otimizado | `GET /notes` (+ campo `preview`) | resposta inclui `preview: string` (150c) | O |
| F1 | Bulk move (drag-drop pastas) | `POST /notes/bulk/move` | `{ noteIds: string[], folderId }` | O |
| F1 | Sanitizar HTML do corpo | interceptor em `POST/PATCH /notes` | remover `<script>/<iframe>` | O (defesa) |
| F2 | Hero/stats isolados | `GET /dashboard/company/:id?context=hero` | `{ metrics: {...} }` | O |
| F2 | Paginação backlog | `GET /backlog/company/:id?limit=20&offset=0` | params | O |
| F2 | Limite de companies | `GET /companies/withMetrics?limit=12` | `Company[]` + `totalCount` | O |
| F2 | Weekly-trend rápido | `GET /dashboard/company/:id/weekly-trend` | `{ series: [{created, completed}] }` 7d | O |
| F3/F6 | Confirmar sanitização de descriptions | `GET/PATCH /activity/:id` | `description` já sanitizado? | **C** |
| F4 | (futuro) flag server-side | `GET /feature-flags` | `{ canvasEnabled: boolean }` | O |
| F4/F5 | Shell pref multidevice | `GET/PUT /user/shell-preference` | `{ shell: 'command'\|'focus'\|'canvas' }` | O |
| F5 | Onboarding multidevice | `GET/PATCH /user/onboarding-flags` | `{ stepId: string, completed: boolean }` | O |
| F5 | Painel de ajuda contextual | `GET /api/help/topics?lang=pt-BR` | `[{ id, title, description, videoUrl?, docUrl?, category }]` | O |
| F5 | Reset onboarding (suporte) | `DELETE /api/admin/users/:id/onboarding-state` | `200 OK` | O |
| F6 | Contrato do "melhorar relatório" | `POST /quarter/:id/report/improve` | req `{ html }` · res `{ improvedReport }` — **markdown ou HTML?** | **C/B** (definir antes de F6) |
| F6 | Contrato dos endpoints AI | `POST /copilot/ask\|diagram\|roadmap\|improve` | formato da resposta (md/html/plain) + se já sanitizado | **C/B** (definir antes de F6) |
| F6 | (futuro) streaming/timeout AI | `POST /copilot/improve` | SSE ou polling via `jobId` | O |
| F8 | Status de task (Kanban) | `PATCH /activity/:id/status` | `{ status: 'TODO'\|'IN_PROGRESS'\|'IN_TESTING'\|'DONE' }` → atividade? | **C/B** (definir antes de F8) |
| F8 | Roadmap timeline real | `GET /company/:id/roadmap` | `{ quarters, lanes, items, milestones }` | **C/B** (definir antes de F8) |
| F8 | Shape de quarters/months | `GET /company/:id/quarters` | `months` sempre array? | **C** |
| Escala | Limitar @mention | `GET /user/search?q=&limit=5` | `[{ id, name, email }]` top 5 | O |
| Escala | Export além de PDF | `POST /export/activities`, `/export/variables` | `{ format: 'csv'\|'json', companyId, filters? }` → Blob | O |
| Escala | Import 100 users async | `POST /company/:id/member/lote-async` + `GET .../import/:jobId` | `{ jobId }` + `{ status, progress }` | O |

**Itens que precisam de decisão do backend antes de F6 e F8 começarem:** formato de resposta de `/quarter/:id/report/improve` e dos `/copilot/*`; payload e retorno de `PATCH /activity/:id/status`; existência de timeline anual em `/roadmap`; contrato de pin/cor/cover em `/notes/:id` (hoje só `togglePin`).

---

## 13. Ordem de execução sugerida + quick wins

**Quick wins (alto impacto, baixo esforço — fazer primeiro):**

1. **F1.1** `stripHtmlPreview` + plugar em NotesView/WorkspaceView — mata o bug mais visível (HTML cru nos cards). Esforço S.
2. **F4** Feature flag + guard + limpeza de nav do Canvas — esconde o que o dono não quer ver. Esforço S, zero backend.
3. **F5** `HelpButton` nos 3 shells — onboarding já existe, só falta o botão. Esforço S, zero backend.
4. **F6 (P0)** `useMarkdownRenderer` + ReportView/BugReport — acaba com o `.md` cru. Esforço S após instalar `marked`+`DOMPurify`.
5. **F7 (P0)** Fonte mínima 12px + contraste `--text-3/4` — uma rodada em `typography.css` + `tokens.ts`. Esforço S.
6. **F3 (parcial)** Varredura de entities cruas no Roadmap (1297-1368, 1965) — busca-e-substitui, sem depender do AppSelect. Esforço S.

**Sequência completa sugerida:**

- **Onda 1 (sem backend, alto retorno):** F1-quickwin → F4 → F5 → F6(P0) → F7(P0) → F3(entities). Tudo frontend; entrega "calma + legível + sem markup cru" rápido. **Atenção:** o P0 de F1 entrega só o **preview limpo + pin** — a "sensação Notion" completa não vem nesta onda.
- **Onda 2 (precisa contrato backend):** F8 (status de task, roadmap) e F6(restante) assim que o backend confirmar os contratos **C** de §12. F3 (AppSelect, incluindo VariablesToolbar) entra aqui — esforço M, sem bloqueio, mas maior.
- **Onda 3 (refactor grande + Notion completo):** F2 (decompor DashboardView) — esforço L, melhor depois que F7 fixou tokens de a11y. Restante de F7 (density, escala 50+) e F1 completo (cores, cover, drag-drop, templates — a verdadeira "sensação Notion").

**Critério de paralelização:** F1, F4, F5, F6, F7 podem ir em branches distintas a partir de `develop` sem conflito sério (tocam arquivos diferentes). F2 e F8 tocam views grandes (DashboardView, RoadmapView, WorkspaceView) — evitar rodar em paralelo com quem mexe nas mesmas views.

---

## 14. Riscos e plano de rollback

| Risco | Severidade | Mitigação / Rollback |
|---|---|---|
| Deep-links públicos `/public/board/:token` em emails/chats quebram ao esconder Canvas | Alta | Guard redireciona com mensagem; comunicar usuários. Rollback: `VITE_CANVAS_ENABLED=true` (instantâneo, sem deploy de código) |
| Usuário com `ui.shell='canvas'` em localStorage | Média | Fallback para `CommandShell` em `AppShell` (sem tela quebrada) |
| `stripHtmlPreview` via DOMParser pode ser pesado em listas grandes | Baixa | Truncar antes de parsear; memoizar por nota; ou usar campo `preview` do backend (§12) |
| Pin de nota referenciando API inexistente | Média | Usar a API real `togglePin(id)`; só estender o service se o backend confirmar `PATCH /notes/:id` (§12, C) |
| Decompor DashboardView (2268 linhas) introduz regressão de layout | Média | Fase L isolada em branch; checklist visual rota a rota em dark/light antes do merge; manter `DashboardView` como orquestrador fino |
| `marked` sem sanitização = XSS | Alta | `useMarkdownRenderer` **sempre** passa por DOMPurify; nunca expor `marked.parse` direto; teste com payload malicioso nos acceptance |
| Roadmap real ainda não existe no backend | Média | Em vez de mock, mostrar empty state honesto; não inventar dados 2026 |
| Subir contraste de `--text-3/4` "achata" a hierarquia visual | Baixa | Ajustar opacity por tema mantendo distinção entre níveis; validar com checker WCAG |
| `AppSelect` (reka-ui) diverge do visual Vuetify em modais | Baixa | Tokenizar igual aos outros campos; migrar incrementalmente, um arquivo por vez (incluindo VariablesToolbar), com revisão visual |
| `updateTaskStatus` real falha sem contrato confirmado | Média | Bloquear F8 até backend confirmar `PATCH /activity/:id/status`; até lá, manter optimistic update + revert no erro |

**Rollback geral:** cada fase é um PR independente a partir de `develop`. Reverter uma fase = reverter seu PR, sem afetar as outras. F4 (Canvas) é reversível por env var sem nem reverter código.

---

## 15. Checklist mestre

### F1 — Notas estilo Notion
- [ ] `stripHtmlPreview` criado e plugado em NotesView (134) + WorkspaceView (295) — zero HTML cru nos cards
- [ ] Pin no NoteEditorView persistindo via `togglePin(id)`; pinadas aparecem primeiro
- [ ] `mdi-pin`/`mdi-folder` (WorkspaceView 292/297) → lucide; `mdi-*` removido de arquivos de notas tocados
- [ ] (P1/Onda 3) Emoji/cor/cover integrados; drag-drop entre pastas (sortablejs)
- [ ] NoteModal consolidado ou marcado fora-de-uso
- [ ] `window.prompt` de imagem removido; confirm ao excluir

### F2 — Home calma
- [ ] DashboardView decomposto em 7 sub-componentes + `useDashboardOrchestration`
- [ ] Progressive disclosure (hero/stats primeiro; feed/projects lazy)
- [ ] Sparkline fake (516-519) removido/sincronizado; fallback (269) "sem atividade" claro
- [ ] Breakpoints 768/1024/1440 sem scroll horizontal (além do 960px da linha 2249)
- [ ] `color-mix` inline (663) → classe/token
- [ ] Hero + Stats acima da dobra em 1440px sem overflow

### F3 — Selects padronizados + entities
- [ ] `AppSelect.vue` (reka-ui) criado, tokenizado, acessível por teclado
- [ ] Selects nativos migrados em Board/Tasks/TaskDetails/Roadmap/NoteEditor/RepoBrowser **+ VariablesToolbar**
- [ ] Entities cruas do Roadmap (prosa 1297-1368) e `<option>` (1965) corrigidas para acento UTF-8 — `grep '&[a-z]+;'` vazio nos arquivos tocados
- [ ] Todo `v-html` listado sanitizado com DOMPurify
- [ ] Convenção documentada no `src/CLAUDE.md`

### F4 — Esconder Canvas
- [ ] `CANVAS_ENABLED` flag + guard de rota
- [ ] Canvas removido de NavList/CommandPalette/CommandShell/CanvasShell/FocusShell/SettingsView/WelcomeGuide (condicional)
- [ ] Fallback de shell `canvas → command`
- [ ] **Kanban intacto; nenhum arquivo deletado** (`git status`)
- [ ] `docs/CANVAS_DEACTIVATION.md` com checklist de reativação
- [ ] `src/CLAUDE.md` marca Canvas como desabilitado

### F5 — Ajuda + Onboarding
- [ ] `HelpButton.vue` criado (modelo InboxBell, lucide HelpCircle, tooltip Cmd+K)
- [ ] Integrado nos 3 shells
- [ ] Clique abre WelcomeGuide; alvo ≥ 44px; foco visível
- [ ] Step Canvas removido do onboarding

### F6 — Texto da IA
- [ ] `useMarkdownRenderer` (marked + DOMPurify) criado
- [ ] ReportView (199) renderiza markdown formatado e sanitizado
- [ ] BugReportDetailView (137/144) renderiza spec formatada (não `<pre>`)
- [ ] AssistantPanel (99/292) migrado para o composable comum
- [ ] Contrato dos endpoints AI confirmado e documentado (§12, C)

### F7 — Acessibilidade 50+
- [ ] Nenhum texto < 12px (`.text-meta` 57, `.text-eyebrow` 64)
- [ ] `--text-3` (34-35) e `--text-4` (59-60) ≥ 4.5:1 (dark + light); scrollbar visível no claro
- [ ] Density real em NotesView/VariableRow/NavList
- [ ] Alvos ≥ 44px: ThemeToggle 30→44, InboxBell 32→44, CmdKButton 30→44, dismiss 28→44, VariableRow 30→44, UserMenu 26→44, HelpButton
- [ ] Escala "modo 50+" + opção de aumento de fonte em Settings
- [ ] Tooltips para jargão

### F8 — Débito técnico
- [ ] `updateTaskStatus` (BoardView 157-159) persiste no Kanban (drag-drop salva)
- [ ] Roadmap timeline (quarters 130, reviewMarkers 137) com dados reais ou empty state — sem mock 2026
- [ ] Hex → token em WorkspaceView (22-117 + inline 234)
- [ ] `as any` removido nos pontos críticos; helper tipado p/ chains TipTap
- [ ] Error bridge `console.error → useToast`
- [ ] `vue-tsc --noEmit` exit 0; `@ts-ignore` (DownloadView) justificado/removido

### Global
- [ ] Cada fase entregue como PR independente a partir de `develop`
- [ ] §12 atualizada conforme backend confirma cada contrato **C**
- [ ] `src/CLAUDE.md` atualizado (AppSelect + "texto, nunca entity", Canvas desabilitado, convenção markdown)
- [ ] Happy path manual em Chrome + Firefox + Safari, dark e light
