# work-flow — src/ guide

Guia interno para navegar e evoluir o código.

**Specs:**

- [design-system-evolution.md](../docs/specs/design-system-evolution.md) — spec-mãe (F1-F4 + Fase P)
- [shell-nav-unification.md](../docs/specs/shell-nav-unification.md) — Q1-Q4 em todos os shells + dead buttons + modais (entregue `0d1ea7c`)
- [legacy-views-migration.md](../docs/specs/legacy-views-migration.md) — migração mdi→lucide + tokens das views legadas (L1-L4, planejada)
- [overhaul-visual-premium.md](../docs/specs/2026/q3/q3-2/overhaul-visual-premium.md) — F0 fundações (gsap, `v-reveal`, `useCountUp`, `ProgressRing`, `echarts-theme`) + F1 Dashboard + F2 Roadmap (entregue ago/2026)

## Stack

- Vue 3.5 + Vuetify 4.0 + Pinia 3 + Vue Router 5
- @tanstack/vue-query para cache de fetch
- TypeScript 5.9, Vite 7
- Ícones: **lucide-vue-next** (padrão) + `mdi` via fonte (legado, em migração)
- Fonte: **Geist** (Vercel, OFL 1.1; self-host VARIÁVEL 100–900 + itálico em `assets/fonts/geist/`, importada no `main.ts`; Inter fica de fallback). Trocar em `tokens.ts` (`--font-family`). Não ligar stylistic sets no reset: o corte padrão é o desenho do produto
- Motion: `motion-v` (springs de estado, ex.: anéis de progresso) + **gsap** (coreografia de entrada e count-up; spec overhaul-visual-premium). O gsap NUNCA entra no chunk de entrada: a diretiva `v-reveal` (`plugins/reveal.ts`, registrada no `main.ts`) importa a lib dinamicamente, e `useCountUp` só é importado por views lazy. Toda animação decorativa respeita `prefers-reduced-motion`
- Toast: **vue-sonner** (consumido via `useToast()` bridge)
- Charts: `vue-echarts` (line, bar, pie). **Proibido usar as cores default do ECharts**: todo gráfico resolve tokens via `plugins/echarts-theme.ts` (paleta de status, tooltip, textStyle) e monta o `option` num `computed` que depende de `uiStore.theme`/`accent` pra repintar na troca de tema. Ver `components/dashboard/OverviewChart.vue` como referência
- Headless primitives: `reka-ui` — em uso em `components/ui/AppSelect.vue`. Preferir para menus/popovers/selects novos.
- Editor de texto rico: **TipTap 3.28** (MIT). Configuração de notas centralizada em `features/notes/composables/useNoteEditor.ts`. Toolbar compartilhada em `components/ui/TipTapToolbar.vue`. **Link e Underline vêm dentro do StarterKit no v3** — declarar por fora derruba o editor com "duplicate extension names".

## Design System

### Tokens

**Single source of truth:** [`plugins/tokens.ts`](./plugins/tokens.ts).

Camadas disponíveis como CSS custom properties em `:root` (atualizadas runtime ao trocar tema/acento):

| Família            | Tokens                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| **Background**     | `--bg`, `--surface`, `--surface-2`, `--surface-3`                                     |
| **Tag**            | `--tag-slate`, `--tag-blue`, `--tag-cyan`, `--tag-teal`, `--tag-green`, `--tag-lime`, `--tag-amber`, `--tag-orange`, `--tag-red`, `--tag-pink`, `--tag-purple`, `--tag-indigo` (paleta das tags de atividade; a lista precisa bater com `TAG_COLOR_KEYS` da API) |
| **Border**         | `--border`, `--border-strong`                                                         |
| **Text hierarchy** | `--text`, `--text-2` (70%), `--text-3` (48%), `--text-4` (32%)                        |
| **Status**         | `--status-todo`, `--status-prog`, `--status-test`, `--status-done`, `--status-block`  |
| **Semantic**       | `--success`, `--warn`, `--err`, `--info`                                              |
| **Accent**         | `--accent`, `--accent-fg` (trocável em runtime via `uiStore.accent`)                  |
| **Radius**         | `--radius-sm` (6px), `--radius` (10px), `--radius-lg` (14px), `--radius-xl` (20px)    |
| **Shadow**         | `--shadow-sm`, `--shadow`, `--shadow-overlay`                                         |
| **Motion**         | `--motion-fast` (120ms), `--motion` (180ms), `--motion-slow` (280ms), `--motion-ease` |
| **Typography**     | `--font-family` (Geist), `--font-mono`                                                 |

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

| Variante            | Arquivo                                                         | Descrição                                                  |
| ------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `command` (default) | [`CommandShell.vue`](./core/components/shells/CommandShell.vue) | Topbar + sidebar clássica. Breadcrumbs na topbar.          |
| `focus`             | [`FocusShell.vue`](./core/components/shells/FocusShell.vue)     | Rail 56px + coluna de contexto 240px. Inspirado em Linear. |
| `canvas`            | [`CanvasShell.vue`](./core/components/shells/CanvasShell.vue)   | Nav horizontal + dock flutuante. Full-bleed.               |

Trocar a variante é feito em `/settings` e é aplicada em runtime (sem reload).

**Para rotas sem shell** (`login`, `download`, `public-file` e as públicas de board/roadmap/bug-report): `AppShell` renderiza `<slot />` raw quando `route.name` é uma dessas. Rota nova sem shell precisa entrar em DOIS lugares: no `bare` do `AppShell` e no `PUBLIC_ROUTES` do router (senão o guard manda pro login).

**Componentes shared dos shells** em [`core/components/shells/shared/`](./core/components/shells/shared/):

- `BrandMark.vue` — logo do mascote (icone-rosto-detalhes.png) clicável, leva ao Dashboard; usado nos 3 shells
- `CompanySwitcher.vue` — toggle de empresa (3 variantes: full / compact / inline); avatar é a logo do mascote (icone-cabeca-circulo.png)
- `UserMenu.vue` — avatar + dropdown com Settings / Logout
- `CmdKButton.vue` — disparador da Command Palette (full / compact / icon)
- `ThemeToggle.vue` — botão sol/lua que usa `useUiPreferences`
- `NavList.vue` — lista de navegação reutilizável (usada em CommandShell; quarters carregadas da API)

## UI Primitives

Em [`components/ui/`](./components/ui/):

| Componente             | Uso                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `EmptyState.vue`       | Estado vazio padrão. Props: `icon`, `title`, `description`. Slot `action`.                                           |
| `Skeleton.vue`         | Loading. Types: `row`, `card`, `text`, `block`.                                                                      |
| `Pill.vue`             | Chip monocromático com ícone. Variants: `soft`, `outline`, `solid`.                                                  |
| `AuroraBackground.vue` | Gradient blobs animados + noise + grid mask. Props: `intensity="subtle\|medium\|bold"`. Usado no fundo dos 3 shells. |
| `SaveStatus.vue` + `save-state.ts` | Indicador de autosave ("Salvando… / Salvo às HH:MM / Erro + Tentar de novo"). Nunca diz "salvo" antes do servidor confirmar. |
| `InlineEditText.vue`   | Campo com autosave debounced, flush no blur, Esc desfaz.                                                             |
| `AppDialog.vue`        | **Casca de overlay do design system** (Teleport + scrim `--scrim` + Esc + foco entra/volta). Props: `label`, `size` (sm 400/md 520/lg 640/xl 900), `loading` (trava fechar), `persistent`. Conteúdo via slot (header ícone+X, body, footer ghost+primary). **Zero `v-dialog` no código** (migração concluída em jul/2026) e proibido reintroduzir. |
| `ConfirmDialog.vue`    | Modal de confirmação pronto por cima do AppDialog. Para confirmar exclusão etc., use ele direto.                     |
| `TipTapToolbar.vue`    | Toolbar tokenizada de editor. Prop `groups` escolhe o que aparece; `bare` para uso dentro de popover.                |
| `FileViewer.vue`       | Visualizador de arquivo em tela cheia (Teleport, imagem/PDF/markdown/vídeo/áudio, setas, foco preso). Promovido do antigo `AttachmentViewer` das tarefas. `item.url` pronto OU `resolveUrl` assíncrono (Drive: URL assinada fresca). |
| `AppSelect.vue`        | Select padrão (reka-ui Select). Single/multiple. Sem busca.                                                          |
| `ProgressRing.vue`     | Anel de progresso genérico (linguagem do `SubtaskProgress`: 12h, spring motion-v, done = `--status-done`). Slot no centro p/ número/label. |
| `CountUp.vue` + `useCountUp` | Número que conta até o valor (gsap, pt-BR, reduced-motion salta direto). O componente existe p/ uso em `v-for`. |
| `ActivitySelect.vue`   | Select COM busca (reka-ui Combobox): trigger estilo select + campo de filtro no topo. Contrato `{label, value}[]` com "Sem tarefa" (value null) fixo. **Não é mais usado no time tracking** (ver `TaskPicker`); segue disponível para lista plana. |
| `TaskPicker.vue`       | Seletor de tarefa do Meu tempo: menu navegável trimestre → mês → tarefa, busca global sem acento, atalhos (Recentes / Minhas), concluídas ocultas por padrão e teclado completo. Props `modelValue` + `companyId` (ele mesmo busca a árvore, via `useTaskPicker`). Inclui **subtarefas**. |
| `MascotCard.vue`       | Aviso do Nevo no formato de mensagem recebida: carinha da marca como avatar à esquerda e balão com bico. Slots `meta` / `actions` / `dismiss`; prop `tone` (`warn` tinge de âmbar) e `live` (`assertive` para o que pede ação). Posicionamento é do container, não dele. |
| `TagChip.vue` + `tag-palette.ts` | Chip de tag. Cor vem de `var(--tag-<chave>)` (definido em `tokens.ts`, por tema), nunca hex. Tag sem cor recebe uma determinística pelo slug. |
| `TagInput.vue`         | Campo de tags estilo Azure Boards: chips na caixa, Enter cria a que não existe, Backspace remove a última. Combobox ARIA à mão (não reka) — ver o comentário no arquivo. |

## Colaboração

- `components/collaboration/CommentsPanel.vue` — painel reutilizável para `/comments`, menções por IDs e reações.
- `composables/useCompanyFeed.ts` — timeline da empresa com `/feed` e `feed:new`.
- `composables/useComments.ts` — comentários por entidade com `comment:new`.

## Utilities CSS (em [`styles/reset.css`](./styles/reset.css))

Classes utilitárias premium que qualquer componente pode usar:

| Classe             | Efeito                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `.glass`           | Backdrop-filter blur 14px + superfície semi-transparente. Use em topbars/sidebars.                                            |
| `.glass-strong`    | Blur 20px, mais opaco. Para overlays (command palette, dock).                                                                 |
| `.gradient-border` | Borda cônica rotacionando 9s infinito. Pseudo-elemento, não afeta layout. Use em CTAs premium (plan card, palette container). |
| `.press`           | Scale 0.97 + brightness 0.95 no `:active`.                                                                                    |
| `.hover-lift`      | translateY(-2px) + shadow on hover.                                                                                           |

View Transitions API registrado via `::view-transition-*` no reset — ativo se o browser suportar e for usado via `document.startViewTransition`. Atualmente usamos `<Transition name="route">` em `AppShell.vue` (fade + translate + blur) como fallback universal.

**Diretiva `v-reveal`** (global, `plugins/reveal.ts`): entrada opacity+translateY quando o elemento entra no viewport. `v-reveal` simples, `v-reveal="indice"` pra stagger entre irmãos, `v-reveal="{ index, y }"`. O elemento nunca nasce invisível (só esconde depois do gsap carregar) e reduced-motion desliga tudo. Em uso no Dashboard e no Roadmap (spec `docs/specs/2026/q3/q3-2/overhaul-visual-premium.md`).

## Features registradas

| Feature         | View principal                                                                                 | Rota               | Observações                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------- |
| Dashboard       | [`features/dashboard/DashboardView.vue`](./features/dashboard/DashboardView.vue)               | `/` e `/dashboard` | Vue Query. **Layout bento assimétrico** (grid por `grid-template-areas`, direção aprovada pelo dono): módulos em `features/dashboard/components/` (DashboardHeader, HeroSection=Progresso, MovementModule, StatsRow=tiles com `display: contents`, ActivityPanel=feed) — cada módulo declara a própria `grid-area`; célula base `.bento-cell` em `dashboard-shared.css` |
| Board           | [`features/board/BoardView.vue`](./features/board/BoardView.vue)                               | `/board`           | Kanban                                                                |
| Canvas          | [`features/boards/BoardsListView.vue`](./features/boards/BoardsListView.vue)                   | `/boards`          | **Desabilitado (feature flag)** — `CANVAS_ENABLED` (`config/feature-flags.ts`); reativar com `VITE_CANVAS_ENABLED=true`. Ver [docs/CANVAS_DEACTIVATION.md](../docs/CANVAS_DEACTIVATION.md). Arquivos preservados, nada deletado |
| Público         | [`features/public/PublicBoardView.vue`](./features/public/PublicBoardView.vue)                 | `/public/board/:token` | Board read-only por token                                         |
| Público         | [`features/public/PublicRoadmapView.vue`](./features/public/PublicRoadmapView.vue)             | `/public/roadmap/:token` | Roadmap read-only por token                                   |
| Roadmap         | [`features/roadmap/RoadmapView.vue`](./features/roadmap/RoadmapView.vue)                       | `/roadmap`         | Timeline anual + calendários mensais, **100% API real** (a nota antiga de "mockados" está obsoleta desde o contrato `GET /company/:id/roadmap`) |
| Tarefas         | [`features/tasks/TasksView.vue`](./features/tasks/TasksView.vue)                               | `/tasks/:month`    | Por trimestre → mês. Tags, arquivos e documentos `.md` na tarefa (ver abaixo). Filtro por tag em `?tags=slug1,slug2` |
| Tickets         | [`features/tickets/TicketsView.vue`](./features/tickets/TicketsView.vue)                       | `/tickets`         | Rota registrada na navegação                                           |
| **Variáveis** ★ | [`features/companies/CompanyVariablesView.vue`](./features/companies/CompanyVariablesView.vue) | `/variables`       | Refatorada em F3 — sub-components em `features/companies/components/` |
| **Notas** ★     | [`features/notes/NotesView.vue`](./features/notes/NotesView.vue)                               | `/notes`           | Redesenhada na P1 do épico de notas colaborativas. Autosave, pastas com CRUD e aninhamento, bubble/slash menu, modo imersivo. Sub-components em `features/notes/` |
| Calendário      | [`features/calendar/CalendarView.vue`](./features/calendar/CalendarView.vue)                   | `/calendar`        | Google Calendar integration                                           |
| Time Tracking   | [`features/time/TimeTrackingView.vue`](./features/time/TimeTrackingView.vue)                   | `/time`            | Timer estilo Clockify. Widget global nos 3 shells + `useTimeTracking` (Vue Query + socket `time:*`). Período = **Hoje · Mês navegável · Tudo** (`useTimePeriod` + `PeriodPicker`, uma instância por aba); totais e ritmo vêm de `/time/summary`, não da lista paginada. **Aviso de ociosidade** (ver abaixo). Specs: [time-periodos-mes-e-lifetime.md](../docs/specs/2026/q3/q3-2/time-periodos-mes-e-lifetime.md) · [timer-ociosidade.md](../docs/specs/2026/q3/q3-2/timer-ociosidade.md) |
| **Drive** ★     | [`features/drive/DriveView.vue`](./features/drive/DriveView.vue)                               | `/drive`           | Arquivos em bucket PRIVADO (signed URL, nunca URL pública). Sidebar **multi-empresa** (modelo QR): Pessoal + TODAS as empresas do usuário, seleção em `?scope=personal\|<companyId>` sem mexer na empresa ativa do topo. Capas derivadas no navegador (`useFileCover`: pdf.js p/ 1ª página, frame de vídeo, snippet de texto, capa tipográfica por extensão em `file-palette.ts`), menu de ações reka-ui, painel de detalhes, ordenação, upload com fila, viewer compartilhado (`components/ui/FileViewer.vue`). **Link público** de download (`/f/:token`, rota sem shell): token revogável, URL assinada de 60s gerada no acesso e nunca persistida. Permissão padrão QR: pessoal = dono; empresa = membro vê/sobe, uploader gerencia o próprio, ADMIN tudo. Spec: docs/specs/2026/q3/q3-2/drive-p1-nativo.md |
| OCR Digital     | [`features/ocr/OcrDigitalView.vue`](./features/ocr/OcrDigitalView.vue)                         | `/ocr`             | Ferramenta de integração (seção Ferramentas): leitura inteligente sem configuração (template opcional por empresa), acervo de documentos lidos, webhook. Spec: docs/specs/ocr-digital.md |
| Acessos Públicos | [`features/public-access/PublicAccessView.vue`](./features/public-access/PublicAccessView.vue) | `/public-access`   | Tokens de API das ferramentas (seção Ferramentas): listagem agregada de todas as empresas onde o usuário é ADMIN, escopo por ferramenta (QR/OCR/ambas), revogação só pelo criador. Gate `meta.anyCompanyAdmin`. Spec: docs/specs/acessos-publicos.md |
| Usuários        | [`features/companies/CompanyUsersView.vue`](./features/companies/CompanyUsersView.vue)         | `/company-users`   | ADMIN only                                                            |
| Configurações   | [`features/settings/SettingsView.vue`](./features/settings/SettingsView.vue)                   | `/settings`        | Tema, acento, densidade, shell variant                                |

★ = redesign completo entregue pelo design-system-evolution spec.

### Seleção de tarefa e som do Meu tempo

Spec: [time-selecao-de-tarefa-e-som.md](../docs/specs/2026/q3/q3-2/time-selecao-de-tarefa-e-som.md).

O seletor de tarefa do time tracking (`components/ui/TaskPicker.vue` +
`composables/useTaskPicker.ts`) lê `GET /activity/picker`, **não** o payload do
dashboard. A diferença importa:

1. **O dashboard exclui subtarefas** (`parentId: null`, deliberado para o board
   agregado não duplicar métricas), então elas nunca podiam receber tempo. A rota
   do picker inclui, com o título do pai junto.
2. **`workspaceData` era carregado uma vez por sessão**, então tarefa criada
   agora só aparecia depois de recarregar a página. A query do picker tem
   `staleTime` de 30s e revalida ao abrir o menu.
3. **Concluídas ficam ocultas** por padrão (`ui.pickerShowDone`), porque em
   empresa madura elas são a maioria e enterravam a tarefa certa. O estado vazio
   oferece "Mostrar N concluídas" quando é isso que está escondendo tudo.

Navegação, busca e contagens são 100% locais (a árvore vem inteira numa
requisição, só com títulos). Ordem da raiz: Sem tarefa → Recentes (por empresa,
em `localStorage`) → Minhas tarefas → Trimestres.

**Constância (heatmap)** (`features/time/components/TimeHeatmap.vue`): grade estilo
GitHub, uma coluna por semana. Aparece no rail do Meu tempo (26 semanas, query
própria com `staleTime` de 5 min) e na Equipe em dois lugares: o mapa do escopo
no rail e uma faixa de 13 semanas por pessoa no ranking, herdando a cor do avatar
(`--accent` local). A escala é sempre do **máximo da janela desenhada**, nunca do
mapa inteiro — quem recebe 6 meses e desenha 13 semanas teria tudo achatado por
um pico antigo. O backend ganhou `byUserDay` no `company-report` só para isso.

**Sons** (`composables/useTimerSounds.ts`): sintetizados com Web Audio no mesmo
molde do `useXpSounds` (sem arquivo binário, volume baixo). São SEIS timbres à
escolha (`TIMER_SOUND_PACKS`: nevo, sino, marimba, bolha, retrô, suave), todos
obedecendo a mesma gramática — **início sobe, parada desce e resolve** —, com
variação de ±5 cents por execução para a repetição não cansar. Tocam DEPOIS da
confirmação do servidor e só em gesto do usuário: o corte por ociosidade é
silencioso de propósito.

Preferências: `ui.timerSounds` (liga/desliga), `ui.timerSoundPack` (timbre) e
`ui.timerVolume` (0.35 | 0.6 | 1). A galeria de `/settings` toca ao escolher, e
a prévia funciona mesmo com o som desligado — quem está decidindo precisa ouvir
antes de ligar.

Para timbre novo, acrescente um item em `TIMER_SOUND_PACKS` com `start`/`stop`:
a UI é derivada da lista. Os auxiliares de síntese já cobrem os casos comuns
(`note` com envelope, `sweep` para deslize, `bell` com parciais inarmônicas,
`wood` para percussão de madeira, `breath` para ruído filtrado).

### Banco de horas, fechamento e o player do Meu tempo

Spec: [banco-de-horas.md](../docs/specs/2026/q3/q3-2/banco-de-horas.md).

**O saldo é sempre derivado, nunca armazenado.** Quem calcula é o servidor
(`balance.service.ts`), a partir das entradas mais a jornada — saldo
materializado desincroniza na primeira edição retroativa, e aqui um número
errado não é bug de tela, é discussão sobre horas trabalhadas.

Quatro regras que o cálculo carrega:

1. **Padrão de 8h por dia útil** (`DEFAULT_DAY_TARGET_SEC`), que fecha 40h
   semanais de segunda a sexta. Ninguém precisa configurar nada.
2. **A jornada é do usuário e versionada** (`WorkSchedule.validFrom`): o dia 10
   usa a jornada vigente no dia 10. Alterar a meta não reescreve mês fechado.
3. **Feriado nacional zera a meta**, e trabalho em dia sem meta (fim de semana,
   feriado) entra inteiro como crédito. Os feriados são calculados em
   `holidays.ts` (Páscoa por Meeus, sem dependência externa) e testados ano a
   ano de 2024 a 2035 — lista errada = uma jornada de dívida falsa para o time.
4. **Dia futuro não cobra meta.** Senão o mês nasce todo devedor no dia 1. Por
   isso a UI mostra `businessDaysElapsed` (dias já cobrados) ao lado da meta, e
   não `businessDays` do período: usar o segundo faz a conta não fechar na tela.

A projeção só aparece com 3+ dias úteis registrados e sempre declara a premissa
("no seu ritmo de Xh por dia"). Projeção sem premissa vira promessa.

```
features/time/
  components/BalanceCard.vue      saldo + conta aberta + projeção (rail do Meu tempo)
  components/BalanceReport.vue    fechamento semanal/mensal, individual e equipe, CSV
  composables/useBalance.ts       Vue Query + currentWeek/currentMonth (semana começa segunda)
composables/useTimerPause.ts      contexto da pausa (localStorage, expira em 12h)
features/settings/components/WorkScheduleCard.vue   jornada por dia da semana
```

Três coisas que não são óbvias:

1. **Pausar encerra a entrada** e guarda o contexto; retomar abre uma entrada
   nova com os mesmos vínculos. `durationSec` continua significando o que
   sempre significou, então nada muda no heartbeat nem na reconciliação. A
   pausa expira em 12h: retomar de ontem criaria entrada com contexto de um dia
   já fechado.
2. **A tarefa é o título da entrada.** Com tarefa escolhida, o campo de texto
   some e o próprio `TaskPicker` (`variant="hero"`) vira o título da barra.
   Passe `fallbackTitle` quando você já souber o nome: a árvore do picker não
   contém tarefa concluída nem de outra empresa, e sem isso o título do
   trabalho em andamento aparece como "Tarefa indisponível".
3. **`timeKeys.balance` entra em todo `invalidateAll`**: parar o cronômetro
   precisa mexer o saldo na hora, senão vira relatório em vez de acompanhamento.

### Aviso de ociosidade do timer

Specs: [timer-ociosidade.md](../docs/specs/2026/q3/q3-2/timer-ociosidade.md) (o
recurso) · [timer-confiavel.md](../docs/specs/2026/q3/q3-2/timer-confiavel.md)
(a política de corte, que corrigiu o cronômetro parando ao minimizar).

**A regra que manda em tudo:** corte automático só acontece com fonte de sinal
que enxergue o computador inteiro (`protectionLevel === 'full'`). Em modo `tab`
— só eventos da própria aba — "não vejo eventos" é indistinguível de "minimizou
o navegador", então o Nevo **avisa e nunca corta**. Foi a falta dessa regra que
parou o cronômetro de quem só tinha ido trabalhar em outro programa.

As duas permissões são **independentes**: a de detecção (que muda o
comportamento) vem primeiro, a de notificação (que muda o alcance do aviso)
depois. Encadear as duas fazia a detecção nunca ser pedida em máquina com
"silenciar solicitações de notificação" ligado. Quando a proteção está limitada,
`IdleProtectionDialog` interrompe no início do cronômetro (adia 24h no "agora
não") — o card discreto no canto não estava sendo visto por ninguém.

Sem atividade por 15 min com o timer rodando, o Nevo avisa (notificação do
sistema com botões + favicon e título piscando); se ninguém responder em mais 5,
a entrada é encerrada **no instante da última atividade** e o tempo ocioso não
entra em total nenhum, com recuperação de um clique por 12h.

```
composables/
  idle-state.ts          estado compartilhado (refs + localStorage + IDLE_DEBUG)
  useIdleDetection.ts    sensores: IdleDetector (SO) + eventos de DOM + cross-tab
  useTimerIdleGuard.ts   política: alerta → carência → corte, ações e recuperação
  useSystemNotification.ts  permissão, service worker e notificação com actions
  useIdleAlerts.ts       as duas permissões, sempre sob gesto do usuário
components/onboarding/   IdleAlert.vue (card com as ações), IdlePermissionPrompt.vue
public/idle-sw.js        service worker SÓ de notificação (sem handler de fetch)
```

Cinco coisas que não são óbvias:

1. **Ociosidade nunca sai do cliente.** O backend recebe só o fim da entrada
   (`POST /time/stop` com `endedAt` retroativo, que marca `autoStopped`). Nada de
   "fulano está ocioso" no socket ou na visão de equipe: o produto é de gestão de
   tempo, não de vigilância, e esse sinal faria o time abandonar o timer.
2. **A última atividade é da ORIGEM, não da aba** (`localStorage` +
   evento `storage`). Sem isso, a aba esquecida em segundo plano mataria o timer
   de quem está trabalhando na outra aba.
3. **As permissões só podem ser pedidas dentro de um clique**, e o pedido roda
   ANTES do `await` do start (a ativação do gesto expira e não sobrevive à
   resposta da rede). Pontos de pedido: card do primeiro acesso e os três botões
   de iniciar timer.
4. **O service worker não tem handler de `fetch`** — existe só porque notificação
   com botões exige `ServiceWorkerRegistration.showNotification`. Não intercepta
   nem cacheia nada; reverter o front exige `unregister()` (ver Plano de Rollback
   da spec).
5. **As ações do alerta vivem fora do popover do timer** (`IdleAlert.vue`, montado
   no AppShell). Foi o que a verificação de ponta a ponta mostrou: com os botões
   dentro do painel fechado, quem voltava ao computador não via nada na tela.

Os avisos vivem na pilha `.nevo-stack` (AppShell), fixa no canto inferior direito
ACIMA do botão do assistente — os dois disputavam o mesmo canto. O container tem
`pointer-events: none` e os cards `auto`, senão a área vazia roubaria cliques.

**Teste de notificação** (`/settings`): dispara o aviso real com os dois botões.
O `data.kind` (`idle-warning` / `idle-cut` / `idle-test`) viaja pelo canal de
ações e é o que impede o botão "Parar agora" de um TESTE de parar o timer de
verdade — o guard ignora tudo que não for aviso real.

Para exercitar sem esperar 20 minutos: `?idleDebug=1` (só em dev) usa 30s de
aviso e 15s de carência, e ignora o sinal da `IdleDetector` (a API só informa
"parado há pelo menos 60s", o que atropelaria limiares de segundos).

**Diagnóstico na tela** (`features/settings/components/IdleDiagnostics.vue`, em
`/settings`): mostra os quatro sinais que decidem o comportamento — nível de
proteção, fonte do sinal, extensão conectada e último batimento aceito pelo
servidor — e o botão **Testar agora**, que chama `simulateAbsence()` e faz o
ciclo real acontecer na hora. Existe porque "isso funciona na minha máquina?"
não podia depender de esperar 15 minutos nem de uma flag que só roda em dev:
quem instala a extensão precisa conseguir provar em produção. O teste NÃO é
encenação; com proteção completa ele encerra a entrada de verdade (recuperável
em um clique, como qualquer corte), e a tela avisa disso antes.

**Extensão do Nevo** (`extension/`, MV3 com `chrome.idle`): fonte de maior
confiança, enxerga o sistema sem permissão web e sobrevive à aba fechada. Fala
com o app por `postMessage` (`useExtensionBridge`), trafegando só o instante da
última atividade. Empacotar com `npm run extension:build -- --origin https://...`: ele injeta o
domínio (o manifesto versionado guarda um marcador), gera o `.zip` da loja e as
políticas de instalação automática para Chrome, Edge e MDM. **Nunca** use
curinga de plataforma (`*.vercel.app` injetaria o content script em todo site
hospedado lá).

**A extensão não é o primeiro caminho.** A tela `/protecao`
(`features/settings/ProtectionView.vue`) oferece, nesta ordem: permitir no
navegador (um clique, nada para instalar, mesma proteção), instalar da loja
(`VITE_EXTENSION_STORE_URL`) e pedir para a TI (política do navegador, zero
passos para o funcionário). Mandar cada pessoa carregar extensão sem compactação
não é distribuição.

### Estrutura de Notas (P1 do épico de notas colaborativas)

```
features/notes/
  NotesView.vue           lista, busca com debounce, filtros, seções fixadas/outras
  NoteEditorView.vue      orquestrador (~250 linhas); no imersivo é teleportado pro body
  types.ts                Note, NoteListItem, NoteFolder, NoteFolderNode
  note-palette.ts         cores e emojis (hex aqui é dado persistido, não tema)
  components/             NoteHeader, NoteMetaMenu, NoteBubbleMenu, NoteSlashMenu,
                          NoteCard, NoteFolderTree (recursivo), NoteFolderDialog
  composables/            useNotes (Vue Query + buildFolderTree), useNote,
                          useNoteEditor, useNoteAutosave, useNoteImmersive
  extensions/             slash-command.ts (menu "/" via @tiptap/suggestion)
  styles/note-content.css tipografia e blocos do conteúdo, reusável na leitura
```

**Header fixo:** `NoteEditorView` é o container de scroll (`.note-page` height 100% + `.note-scroll` overflow interno); a região do topo (`.note-topbar` = NoteHeader + TipTapToolbar) fica fora do scroll. Não depende do scroll do shell. As opções de formatação existem em DOIS lugares: a toolbar fixa do header E o slash menu (`/`).

**Compartilhamento (P2, código pronto — migration pendente em prod):** `NoteShareDialog` (convidar pessoas VIEW/EDIT + link público revogável), `PublicNoteView` (`/public/note/:token`, HTML via DOMPurify), `useNoteAccess`. Backend: `NoteAccess` + `resolveAccess` central em `note.service.ts`. Nota compartilhada abre em somente-leitura para nível VIEW; 409 no PATCH trata edição concorrente.

Especificações: [épico](../docs/specs/epicos/notas-colaborativas-premium.md) · [P1](../docs/specs/notas-p1-editor-premium.md) · [P2](../docs/specs/notas-p2-compartilhamento.md) · [P3](../docs/specs/notas-p3-edicao-ao-vivo.md) · [P4](../docs/specs/notas-p4-rabisco.md)

### Tarefa: tags, arquivos e documentos

Spec: [tasks-tags-arquivos-markdown.md](../docs/specs/2026/q3/q3-2/tasks-tags-arquivos-markdown.md).

```
features/tasks/
  (o antigo attachment-kind.ts foi promovido para @/utils/file-kind pela spec do Drive)
  components/
    TaskAttachments.vue     DONO ÚNICO do markup de anexo (lista/grade, dropzone, progresso)
                            (o viewer virou components/ui/FileViewer.vue, compartilhado)
    TaskDocs.vue            lista lateral de documentos + leitor/editor
    MarkdownDocEditor.vue   textarea mono + preview (renderMarkdown)
    InheritedDocs.vue       "Do módulo": documentos do pai, somente leitura
  composables/useActivityDocs.ts   conteúdo sob demanda + autosave com guarda anti-laço
  styles/task-content.css   (a prosa do documento virou src/styles/markdown-doc.css,
                            compartilhada com o FileViewer do design system)
```

Três coisas que não são óbvias e custam caro se forem esquecidas:

1. **Conteúdo de documento nunca entra em payload de lista.** O board e o `GET /activity/:id` trazem só metadados e `_count`; o markdown vem por `GET /activity/doc/:id`. Incluir o conteúdo no board multiplica specs de dezenas de KB pelos cards do mês.
2. **O editor de documento é textarea, não TipTap, de propósito.** O valor do campo é ser markdown fiel para levar ao agente; o round-trip por HTML é lossy. Todo render passa por `renderMarkdown` (marked + DOMPurify).
3. **Tag não é excluída, nunca.** Tirar a tag da tarefa apaga o vínculo (`PATCH /activity/:id` com `tagIds`), não a tag. A API não tem rota de delete, e isso é a regra, não uma lacuna. Por isso o slug é normalizado (sem acento, sem caixa, sem espaço sobrando) com unicidade no banco: duplicata que entra fica para sempre.

**`.md` tem dois destinos e quem escolhe é o usuário** (spec [tasks-markdown-anexo-ou-documento.md](../docs/specs/2026/q3/q3-2/tasks-markdown-anexo-ou-documento.md)): documento (legível, herdado, copiável cru) ou anexo (arquivo na lista). Onde a pergunta aparece:

- **Criação** (`TaskForm`): cada `.md` escolhido vira uma linha com o seletor `Documento | Anexo`. O primeiro do lote assume Documento só se o campo ainda estiver vazio.
- **Tarefa existente** (`TaskAttachments`): arrastar/escolher um `.md` abre o diálogo de destino antes de qualquer upload. Os arquivos comuns do mesmo lote sobem na hora, sem esperar a resposta.
- **Seção Documentos** (`TaskDocs`): "Subir .md" não pergunta nada — quem entra por ali já escolheu documento.

No servidor, `POST /activity/:id/attachment` **continua recusando `.md` com 400** a menos que o multipart traga o campo `asFile=true`. A declaração é o que impede um cliente que desconhece a bifurcação de criar anexo `.md` por acidente; a regra vive em `common/upload-rules.ts` (com testes) e nada além dela mudou (10 MB, denylist de executável).

Anexo `.md` é legível: o `FileViewer` baixa o texto e renderiza por `renderMarkdown`. Sem isso, escolher "anexo" devolveria um link opaco.

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
- **Conteúdo de rota não cobre a topbar por `z-index`.** A view renderiza dentro do `main` do shell, que cria contexto de empilhamento próprio: nenhum `z-index` de dentro passa por cima do chrome do shell. Para overlay de tela cheia (modo imersivo, viewer), use `Teleport to="body"` — funciona igual nas três variantes de shell sem que a feature precise conhecê-las. Ver `features/notes/NoteEditorView.vue`.

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
