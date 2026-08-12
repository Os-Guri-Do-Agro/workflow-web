# Spec: Overhaul Visual Premium (F0 fundações + F1 Dashboard + F2 Roadmap)

**Status:** Concluído
**Autor:** Nicolas + Claude
**Criado em:** 2026-08-12
**Última atualização:** 2026-08-12
**Versão:** 0.2

---

## Visão Geral

Tirar do produto a assinatura de "layout genérico de IA": mesma receita de card
em toda tela, gráfico ECharts com cores default, motion quase inexistente.
Este é o primeiro passo de um programa gradual: fundações de motion e gráficos
(F0), Dashboard (F1) e Roadmap (F2). As telas seguintes replicam a linguagem
em specs próprias.

## Motivação / Contexto de Negócio

O dono declarou o layout "IAZADO em vários lugares" e pediu evolução real
(GSAP, gráficos com identidade), não microajustes. O produto vai receber 100+
usuários; a primeira impressão do Dashboard e do Roadmap é o cartão de visita.
Restrição herdada do programa didático ([didactic-overhaul](../../../didactic-overhaul.md)):
**nada aqui pode regredir acessibilidade 50+** — motion é progressivo e
respeita `prefers-reduced-motion` (convenção já presente em 58 arquivos).

---

## Research Findings

**Stack:** Vue 3.5 + Vite 7. Motion: `motion-v` (springs pontuais) + **gsap 3.15
(novo, adicionado nesta spec)** para coreografia de entrada e count-up.
Charts: `vue-echarts` 8 / `echarts` 6 com import por módulo.

**Padrões a seguir:**
- Tokens sempre (`var(--...)`), zero hex em componente; cor de canvas resolve
  via `readToken` de `plugins/tokens.ts` (cache limpo em `applyThemeTokens`).
- `prefers-reduced-motion: reduce` desliga qualquer animação decorativa
  (padrão do repo; ver `SubtaskProgress.vue`).
- Anel de progresso é a linguagem aprovada pelo dono para progresso
  (`features/tasks/components/SubtaskProgress.vue`, spring motion-v, começa às
  12h). O hero do Dashboard adota a mesma linguagem em tamanho maior.
- Ícones lucide; nada de `v-dialog`; AppSelect para selects.

**Referências no código:**
- `src/components/dashboard/OverviewChart.vue` — donut "Distribuição" 100%
  default do ECharts (cores default, legenda default). Pior ofensor do
  dashboard; vira gráfico tokenizado com legenda própria.
- `src/features/dashboard/components/` — decomposição da spec didática (F2
  "Home calma"): HeroSection, StatsRow, ActivityPanel etc. A estrutura fica;
  o upgrade é visual/motion.
- `src/features/dashboard/components/spark.ts` — `resolveCssColor`/`withAlpha`
  já resolvem token→hex p/ canvas; o tema de gráficos novo reusa esse padrão.
- `src/composables/useDashboardOrchestration.ts` — dados do dashboard; nada
  muda na camada de dados.
- `src/features/roadmap/RoadmapView.vue` (5.780 linhas) — mapa completo no
  research de 2026-08-12: **timeline anual e modo mensal são 100% API real**
  (a nota "mock" em didactic-overhaul §F8 está desatualizada). CSS 100%
  tokenizado fora do `@media print`. Gaps premium: ~150 linhas de CSS órfão
  (`.roadmap-hero`, `.summary-*`, `.monthly-overview/howto/stat`), 5
  `transition:` e zero `@keyframes` no arquivo, sem hover real nas barras,
  loading textual sem skeleton.
- `src/styles/reset.css` — utilitários `.press`, `.hover-lift`, `.glass`;
  `<Transition name="route">` no AppShell já cobre transição de rota.

**Breaking Changes:** Nenhuma de API/dados. Visual: o hero troca barra de
progresso por anel (mesma informação, outra forma).

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Médio | GSAP (~28 KB gzip core) entrar no chunk de entrada | Importar só em quem usa (dashboard/roadmap são lazy por rota); nunca registrar global no `main.ts` — exceto a diretiva `v-reveal`, que importa gsap dinamicamente no primeiro uso |
| Médio | Coreografia de entrada atrapalhar usuários 50+ / reduced-motion | `v-reveal` e `useCountUp` checam `prefers-reduced-motion` e aplicam estado final sem animar; durações ≤ 600ms; deslocamentos ≤ 16px |
| Médio | Tema de gráfico dessincronizar ao trocar tema/acento em runtime | Virou infraestrutura no fim: `themeVersion` (ref em `tokens.ts`, bump no `applyThemeTokens`) lida via `chartThemeDep()` dentro do computed da option — sem ritual manual por componente |
| Baixo | Flash de conteúdo invisível se o gsap falhar ao carregar | `v-reveal` só esconde o elemento DEPOIS que o módulo gsap resolve; fallback = conteúdo visível estático |
| Baixo | Regressão no print do Roadmap | Não tocar em `@media print` nem no DOM de impressão paralelo |

---

## Requisitos Não-Funcionais

- **Acessibilidade:** reduced-motion desliga animações decorativas; nenhum
  texto < 12px novo; contraste segue os tokens vigentes (já auditados AA).
- **Performance:** count-up e reveals usam GSAP (rAF), sem layout thrash;
  options de gráfico memoizadas (padrão StatsRow).

---

## Acceptance Criteria

### F0 — Fundações
- [x] `src/plugins/echarts-theme.ts` existe: paleta de status/acento resolvida
  de tokens, tooltip tokenizado (surface/border/shadow/Geist) e `textStyle`
  compartilhados; nenhuma cor default do ECharts em gráfico tocado
- [x] Diretiva global `v-reveal` (em `src/plugins/reveal.ts`, registrada no
  `main.ts`): entrada opacity+translateY≤16px com stagger por índice; com
  `prefers-reduced-motion: reduce` o elemento nunca fica invisível
- [x] `src/composables/useCountUp.ts`: número anima até o valor em ≤ 700ms,
  formata pt-BR, salta direto no reduced-motion e re-anima quando o valor muda
- [x] `src/components/ui/ProgressRing.vue`: anel genérico (props `value`,
  `size`, `stroke`), mesma linguagem do `SubtaskProgress` (12h, spring
  motion-v, done = `--status-done`, senão `--accent`)

### F1 — Dashboard
- [x] Hero: "Progresso geral" renderiza como número com count-up + `ProgressRing`
  (a barra linear sai); dado idêntico ao anterior (`hero.progress`)
- [x] StatsRow: valores com count-up; cards entram com stagger via `v-reveal`
- [x] "Distribuição" (`OverviewChart`): donut com cores dos tokens de status,
  total no centro, legenda própria em HTML com contagem por status e tooltip
  tokenizado; **Given** troca de tema dark↔light **Then** o gráfico repinta
  com os tokens do tema novo sem reload
- [x] Atividade recente: itens entram com stagger; avatar usa os tokens
  `--avatar-*` (identidade por pessoa) em vez de cinza
- [x] Seções lazy (Agenda/Copilot/Feed/Projects) revelam com `v-reveal` ao
  entrar no viewport
- [x] Dark e light OK (screenshot dos dois); reduced-motion mostra tudo
  estático e completo

### F2 — Roadmap
- [x] CSS órfão removido (`.roadmap-hero`, `.hero-*`, `.summary-*`,
  `.monthly-overview`, `.monthly-howto`, `.monthly-stat`,
  `.monthly-summary-grid` + referências nas media queries); template não muda
- [x] Cards de mês entram com stagger (`v-reveal`); hover com elevação real
  (borda + sombra + translateY) na linguagem do Drive
- [x] Barras da timeline anual têm hover de verdade (crescem/brilham) e
  `title` nativo com nome + período; marco (`milestone-pin`) tem hover visível
- [x] Linha "hoje" da timeline tem presença visual (glow/pulse discreto,
  desligado em reduced-motion)
- [x] Números do resumo anual (`annual-summary`) com count-up
- [x] Loading da timeline vira skeleton (componente `Skeleton` existente), não
  texto cru
- [x] `@media print` e DOM de impressão intocados (diff não toca as faixas
  5252-5573 exceto se remoção de CSS órfão exigir)

**Proibido:** regressão de dados (nenhuma chamada de serviço muda), regressão
de a11y (aria-labels e teclado do Roadmap ficam como estão).

---

## Estratégia de Testes

Sem testes unitários novos (área é visual); verificação é determinística via:

### Manuais/automatizados (happy path)
- [x] `vue-tsc --build` limpo
- [x] Verificação visual por CDP (harness da memória `verificacao-visual-cdp`):
  screenshots do Dashboard (dark + light) e Roadmap (mensal + timeline) com
  API mockada; conferir gráfico tokenizado, anel, stagger aplicado
  (data-reveal presente) e ausência de flash invisível
- [x] Rodada com `prefers-reduced-motion: reduce` emulada por CDP: tudo
  visível e estático — via override no matchMedia validado no harness
- [x] Regressão: menu de 3 pontos do Drive (mexemos em CSS global ontem),
  board `/board` abre sem erro de console novo

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `package.json` | Modificar | + `gsap` |
| `src/plugins/echarts-theme.ts` | Criar | paleta/tooltip/textStyle tokenizados p/ ECharts |
| `src/plugins/reveal.ts` | Criar | diretiva `v-reveal` (gsap dinâmico + IO + reduced-motion) |
| `src/main.ts` | Modificar | registrar diretiva |
| `src/composables/useCountUp.ts` | Criar | número animado tokenized pt-BR |
| `src/components/ui/ProgressRing.vue` | Criar | anel genérico (linguagem SubtaskProgress) |
| `src/components/dashboard/OverviewChart.vue` | Modificar | donut tokenizado + centro + legenda HTML |
| `src/features/dashboard/components/HeroSection.vue` | Modificar | anel + count-up |
| `src/features/dashboard/components/StatsRow.vue` | Modificar | count-up + reveal |
| `src/features/dashboard/components/ActivityPanel.vue` | Modificar | stagger + avatar tokenizado |
| `src/features/dashboard/DashboardView.vue` | Modificar | reveals nas seções |
| `src/features/roadmap/RoadmapView.vue` | Modificar | CSS órfão fora, hovers, reveal, count-up, skeleton |
| `src/CLAUDE.md` | Modificar | documentar F0 (echarts-theme, v-reveal, useCountUp, ProgressRing) |

---

## Tasks Técnicas

- [x] **T1** — `echarts-theme.ts` (paleta status + acento, tooltip, textStyle)
- [x] **T2** — `reveal.ts` + registro no `main.ts` *(independente)*
- [x] **T3** — `useCountUp.ts` *(independente)*
- [x] **T4** — `ProgressRing.vue` *(independente)*
- [x] **T5** — `OverviewChart.vue` redesign *(depende de T1)*
- [x] **T6** — HeroSection (anel + count-up) *(depende de T3, T4)*
- [x] **T7** — StatsRow + ActivityPanel + DashboardView (stagger/avatar) *(depende de T2, T3)*
- [x] **T8** — RoadmapView: CSS órfão + hovers + reveal + count-up + skeleton *(depende de T2, T3)*
- [x] **T9** — Gate: vue-tsc + CDP screenshots + reduced-motion + docs

---

## Considerações de Arquitetura

- **Decisão:** GSAP para coreografia de entrada/count-up; motion-v continua
  para springs de estado (anel).
  **Motivo:** o dono pediu GSAP explicitamente; gsap dá timeline/stagger
  determinístico e ScrollTrigger fica disponível para as próximas fases.
  **Alternativa rejeitada:** anime.js (redundante com gsap), CSS puro
  (sem orquestração entre elementos).
- **Decisão:** diretiva `v-reveal` global com import dinâmico do gsap.
  **Motivo:** uso em qualquer view sem boilerplate e sem colocar gsap no
  chunk de entrada; elemento nunca nasce invisível (só esconde quando o
  módulo carrega), então falha de rede degrada para estático.
  **Alternativa rejeitada:** gsap.timeline por view (repetitivo) e
  @vueuse/motion (não instalado; motion-v não tem stagger declarativo entre
  componentes irmãos distintos).
- **Decisão:** F2 desta rodada NÃO extrai sub-componentes do RoadmapView.
  **Motivo:** a extração (MonthCard, TimelineBoard etc.) é refactor L à parte;
  misturar com a camada visual aumentaria o risco de regressão da camada de
  dados (que é madura e fica intacta).
  **Follow-up registrado:** spec futura `roadmap-decomposicao` (extração +
  workbench→toolbar compacta + memoPorArg com deps consolidadas).

## Plano de Rollout / Rollback

- Frontend puro, sem migration. Rollback = reverter o(s) commit(s) da spec.
- `v-reveal` é aditivo: remover a diretiva de um template devolve o estático.

## Observabilidade

Não aplicável (mudança visual client-side; sem novos eventos/erros a logar).

---

## Definition of Done

- [x] Todos os AC atendidos e verificados (CDP + screenshots)
- [x] `vue-tsc --build` e lint sem erros novos
- [x] `/code-review` rodado e findings de correção resolvidos
- [x] Fluxo exercitado: Dashboard e Roadmap abertos de verdade (CDP), dark+light
- [x] Spec atualizada (tasks, status, Change Log) + memória sincronizada

## Perguntas em Aberto

- [ ] Ranking/streaks no dashboard (gamificação) entram na próxima fase? —
  responsável: Nicolas

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-12 | 0.1 | Criação (research + escopo F0-F2) | Claude |
| 2026-08-12 | 0.2 | Implementação + code-review de 8 ângulos aplicado: `chartThemeDep()`/`themeVersion` (repaint de TODOS os canvas na troca de tema, verificado por hash de pixels), legenda do donut com toggle de fatia (paridade com a legenda ECharts removida, alvo ≥44px), `v-reveal` com observer compartilhado + hook `beforeprint` (imprimir não sai em branco) + anti-flash em rede lenta + `transition: none` durante o tween, `SubtaskProgress` reconstruído sobre `ProgressRing`, `StatCard.value` virou number, skin dos menus dropdown unificado em `styles/menus.css` (`.dd-menu`), `resolveCssColor` local do BoardCanvasView substituído pelo canônico, `monthlySummary` morto removido. Verificação CDP: dark, light, reduced-motion, toggle de legenda (48→28 no centro), hover de barra, regressão dos menus do Drive. Nota: o skeleton da timeline foi implementado mas o mock responde instantâneo, então não foi capturado em screenshot (caminho é um v-if simples). Follow-ups deliberados: utilitário comum p/ a regra `:has(data-state)` das barras de ação (3 cópias no Drive), auto-index no v-reveal (`v-reveal-group`), AppDropdownMenu wrapper | Claude |
