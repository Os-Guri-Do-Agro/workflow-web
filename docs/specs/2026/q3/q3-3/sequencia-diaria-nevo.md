# Spec: Sequência Diária com o Nevo (gamificação estilo Duolingo)

**Status:** Em Implementação
**Autor:** Claude (Opus 5.5) a pedido do Nicolas
**Criado em:** 2026-09-25
**Última atualização:** 2026-09-25
**Versão:** 0.1

> Aprovação: o Nicolas pediu execução autônoma ("não precisa me pedir permissão, você não deve parar em nenhum momento"). A pausa de revisão do Modo 3 foi dispensada por instrução explícita dele; as decisões abaixo foram tomadas com defaults sensatos e ficam registradas para revisão posterior.

Spec irmã (backend): `workflow-api/docs/specs/2026/q3/q3-3/sequencia-diaria-api.md`.
Referência visual: mock enviado pelo Nicolas (tela "Sequência Diária", evolução do mascote, marcos, frames de animação) e a sprite sheet `C:/TRABALHO/workflow/sprites-nevo.png`.

---

## Visão Geral

Transformar a home e a topbar do Workflow num lugar que dá vontade de voltar todo dia: uma **sequência diária** (dias seguidos cumprindo a meta), **missões do dia**, **mascote Nevo que evolui** com a sequência, **marcos** com chamas, **visão de equipe** (cada um vê a sequência do colega) e uma **vitrine animada em 3D** (three.js + GSAP, estilo Rotato) na home.

## Motivação / Contexto de Negócio

O dono acha a plataforma "chata, sem graça, nada legal, até no menu superior". A spec `overhaul-visual-premium` deixou aberta a pergunta "Ranking/streaks no dashboard (gamificação) entram na próxima fase?" (seção de perguntas). Esta spec responde: sim. Métrica que move: retorno diário (DAU/WAU) e uso do cronômetro e do board, que são justamente as ações que garantem o dia.

---

## Research Findings

Research feito por 6 leitores paralelos (relatórios no scratchpad da sessão de 2026-09-25). Pontos que fundamentam as decisões:

**Stack:** Vue 3.5 + Vuetify 4 + Pinia + Vue Query 5 + reka-ui + gsap 3.15 + motion-v (web). NestJS 11 + Prisma 7, app Express (`main.ts:181`), sem prefixo global de rota (API).

**Padrões a seguir:**
- Serviço tipado no molde de `src/service/time/time-service.ts` (interfaces exportadas, `tzOffset: new Date().getTimezoneOffset()` em toda chamada, override opcional de `x-company-id`).
- Vue Query com chaves que carregam `companyId` (troca de empresa faz `removeQueries()`; `src/stores/authStores.ts:10-19`).
- Widget de topbar: trigger 44x44 no molde de `InboxBell.vue:173-203`; popover com **reka-ui `PopoverRoot` + `PopoverPortal`** (painel no `body`, z-index 3000, estilo global não scoped, como `styles/menus.css`). Portal é obrigatório: dentro da topbar o modo XP pinta texto branco (`xp.css:141-148`) e a barra do XP tem z 900/1000.
- Componentes em `core/components/shells/shared` **não importam de `features/*`** (`src/CLAUDE.md:614`).
- gsap e three.js **nunca no chunk de entrada**: `defineAsyncComponent` + `useLazyLoad` (padrão `DashboardView.vue:20-23`). **Proibido `manualChunks`** (`vite.config.ts:22-44`).
- Animação decorativa respeita `prefers-reduced-motion`: CSS com keyframe cujo 100% é o repouso (a chave global de `reset.css:62-70` roda 1 iteração), `useMediaQuery` para JS. rAF do three.js precisa de checagem própria.
- Tokens: zero hex em componente; cor nova entra em `plugins/tokens.ts` por tema.
- Avatares: `utils/avatar.ts` (`avatarTone`, `initials`).
- API: `@UseGuards(JwtAuthGuard, CompanyRoleGuard)` + `@CompanyId()` + `@CurrentUser()`; nunca `@Headers('x-company-id')` cru (`auth/decorators/company-id.decorator.ts:18-28`).
- Dia civil do usuário = `tzOffset` do cliente (`balance.service.ts:1064-1067`, `dayKey`). Nada de `setHours`/`toISOString` cru (erro do `dashboard.service.ts`).
- Meta diária/descanso: `BalanceService.targetOf` + `holidays.ts` (`holidayName`). Descanso = meta 0 (fim de semana na jornada padrão, feriado nacional).

**Gosto do dono (memória `nicolas-ui-taste-premium`):** nível Linear/Height com profundidade e mola; **nunca** border-left colorida; **nunca glow/neon** (box-shadow colorido, radial brilhante); cor como sinal chapado (dot, hairline, tint); sombras neutras. Os sprites já trazem o sombreamento do render; não adicionar brilho colorido em volta deles.

**Acessibilidade 50+:** texto mínimo 12px, alvo 44x44, foco visível, `aria-label` em pt-BR, glossário para termos. Copy visível **sem em-dash**.

**Nome da pontuação:** "pontos" (nunca "XP": colide com o Modo Windows XP, `ui.xp`).

**Breaking Changes:** Nenhuma. Tudo é aditivo: endpoints novos, componentes novos, módulo novo no dashboard. `BalanceService` passa a importar a regra de jornada de um arquivo puro, sem mudar comportamento (coberto por `balance.service.spec.ts`).

---

## Decisões de produto (regras da sequência)

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Dia garantido** = foco >= 30 min **ou** >= 1 tarefa concluída naquele dia civil do usuário. | As duas ações centrais do produto. Uma basta, para não punir quem trabalha fora do cronômetro. |
| D2 | **Foco** = soma de `TimeEntry.durationSec` do dia do `startedAt` (mesma regra do banco de horas, sem divisão na meia-noite), mais o timer aberto (`now - startedAt`, teto 24h) **só no dia de hoje**. Entrada `MANUAL` só conta para o dia D se `createdAt` <= fim do dia D+1 (tolerância de 1 dia para "esqueci o timer"; impede consertar sequência retroativa). | Consistência com `BalanceService` e anti-trapaça. |
| D3 | **Tarefa concluída** = primeiro `ActivityLog` com `newStatus = DONE` de cada `activityId`, creditado a `changedById` no dia civil do `changedAt`. Reabrir e concluir de novo não conta outra vez. | Anti-farm (DONE -> IN_PROGRESS -> DONE). |
| D4 | **Descanso** = meta do dia 0 pela jornada (`WorkSchedule`/padrão seg-sex 8h) ou feriado nacional. Dia de descanso **não quebra** a sequência; se o usuário garantir o dia mesmo assim, **conta** +1. | Ferramenta de trabalho não pode punir fim de semana. Mesma noção de "meta" do banco de horas. |
| D5 | **Hoje** pendente não quebra: a sequência atual conta até ontem e soma hoje quando garantido. | Semântica do Duolingo. |
| D6 | **Sequência global por pessoa** (todas as empresas). A visão de equipe lista os membros da empresa ativa com a sequência global de cada um. | Hábito é da pessoa, não da empresa. |
| D7 | **Janela**: 400 dias. `best` (recorde) é calculado nessa janela. | ActivityLog não tem índice (`schema.prisma:531-542`); janela limita o custo. |
| D8 | **Níveis do mascote** pela sequência atual: 0 Sem sequência; 1-3 Básico; 4-7 Em progresso; 8-14 Determinado; 15-30 Especialista; 31+ Lendário. | Mock do dono. |
| D9 | **Marcos** 7 (Primeiro marco), 14 (Constância), 30 (Disciplina), 60 (Nível avançado), 100 (Lendário). Conquistado quando `best >= dias`. | Mock do dono. Conquista não se perde quando a sequência quebra. |
| D10 | **Missões do dia** ("Sua jornada"): Foco (30 min), Tarefa (1 concluída), Colaboração (1 ação: comentar, mudar status ou atualizar tarefa; `FeedEvent` verbos `commented`, `status_changed`, `updated` com `actorId` = usuário). Colaboração sozinha **não** garante o dia. **Dia perfeito** = as 3 missões. | Engajamento extra sem abrir brecha (comentário é barato). |
| D11 | **Pontos da semana** (segunda a domingo local): tarefa +10; foco +1 a cada 3 min (teto 200/dia); colaboração +3 (teto 10 ações/dia); dia garantido +15; dia perfeito +10. Usados só no ranking da equipe. | Ranking com mais de um eixo que horas (a Equipe do /time hoje só ordena por horas). |
| D12 | **Privacidade**: para colegas a API expõe só número da sequência, recorde, nível, estado dos 7 dias (garantido/descanso/perfeito) e pontos. Nunca horas por dia nem descrição. | O dia a dia de outra pessoa continua fechado (`balance.service.ts:417-419`). Precedente: o ranking de tempo já é visível a todos os membros (`time-tracking.controller.ts:185-188`). |
| D13 | **Sequência do time** = dias seguidos em que todo membro **ativo** (garantiu pelo menos 1 dia nos últimos 14) garantiu o dia ou estava de descanso. Hoje entra quando todos garantiram. | Objetivo coletivo, sem deixar quem nunca usou travar o time para sempre. |
| D14 | **Sem congelamento (freeze) na v1.** Exigiria persistência (migration), proibida agora. | `.env` local aponta para produção; migration fica como follow-up. |
| D15 | **Sem lembrete push na v1.** Cron noturno "sua sequência está em risco" fica como follow-up com flag desligada por padrão. | Rodar a API local liga crons contra produção; risco de push real. |

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | API local aponta para o banco de produção; migration ou cron novo afetaria usuários reais. | Zero migration, zero cron, zero escrita: a sequência é **derivada** de dados existentes, só leitura. Verificação por script somente leitura e por teste HTTP com módulo isolado (sem `ScheduleModule`). |
| Médio | `ActivityLog` sem índice: seq scan a cada cálculo da equipe. | Janela de 400 dias; `/streak/team` com cache em memória de 30 s por empresa+fuso; `/streak/me` sem cache (1 usuário, barato) para a comemoração ser instantânea. Índice `("changedById","changedAt")` registrado como follow-up (migration à mão). |
| Médio | three.js pesa ~600 KB e pode entrar no chunk da home ou do login. | Import só dentro de `components/nevo/showcase/*`, carregado por `defineAsyncComponent` quando o slot entra no viewport. Checar o build: nenhum chunk de entrada contém `three`. |
| Médio | Excluir tarefa/comentário/entrada reescreve o passado (cascade) e a sequência pode diminuir retroativamente. | Aceito e documentado (derivado = fiel aos dados). Congelamento/persistência é follow-up. |
| Médio | Fuso: sem `tzOffset` o "hoje" vira amanhã depois das 21h. | `tzOffset` obrigatório no front; API faz clamp em [-840, 720] e fallback 180. |
| Baixo | Sprites com recorte imperfeito (halo, parte transparente). | Pipeline versionado em `scripts/sprites/` (ISNet + difference matte contra fundo reconstruído + descontaminação de cor), revisado em folha de contato nos dois temas. |
| Baixo | Modo XP: painel ilegível ou atrás da barra do XP. | Popover em portal com z 3000; trigger com fundo transparente. |

---

## Requisitos Não-Funcionais

- **Segurança:** `GET /streak/me` exige JWT e só lê dados do próprio `sub`. `GET /streak/team` exige JWT + `CompanyRoleGuard` (qualquer membro) e usa **só** `@CompanyId()`. Nenhum campo de outra empresa ou e-mail de colega sai no payload.
- **Privacidade:** ver D12.
- **Performance:** `/streak/me` < 400 ms p95 no banco atual; `/streak/team` < 800 ms frio, < 20 ms com cache. Home: nenhum chunk de entrada novo acima de 10 KB gzip; `three` só em chunk lazy.
- **Acessibilidade:** texto >= 12px, alvos >= 44x44, foco visível, `aria-label` pt-BR em chip, popover, missões, vitrine (com botão pausar/tocar), anúncio `aria-live="polite"` na comemoração. Movimento reduzido: sem flipbook, sem pulo, vitrine vira pôster estático.
- **Temas:** tudo legível no claro e no escuro e no Modo XP.

---

## Contrato da API

Todas as rotas aceitam `?tzOffset=<minutos>` (valor de `new Date().getTimezoneOffset()`; 180 no Brasil). Datas são `YYYY-MM-DD` do dia civil do usuário.

### `GET /streak/me`

Auth: JWT. Sem empresa.

```ts
type StreakTierKey = 'none' | 'basico' | 'progresso' | 'determinado' | 'especialista' | 'lendario'

interface StreakDay {
  date: string          // YYYY-MM-DD
  secured: boolean      // D1
  rest: boolean         // D4 (meta 0)
  perfect: boolean      // D10: foco+tarefa+colaboração
  focusSec: number      // D2 (só no /me)
  tasksDone: number     // D3 (só no /me)
  collab: number        // D10 (só no /me)
  isToday: boolean
}

interface StreakMission {
  key: 'focus' | 'task' | 'collab'
  label: string         // "Foque por 30 minutos" | "Conclua 1 tarefa" | "Movimente o time"
  hint: string          // "Use o cronômetro em qualquer tarefa" | "Mova uma tarefa para Concluído" | "Comente ou atualize uma tarefa"
  current: number       // minutos | tarefas | ações
  target: number        // 30 | 1 | 1
  done: boolean
}

interface StreakMilestone { days: number; key: 'basico'|'constancia'|'disciplina'|'avancado'|'lendario'; label: string; reached: boolean }

interface StreakMe {
  date: string
  tzOffset: number
  current: number
  best: number
  securedToday: boolean
  perfectToday: boolean
  todayIsRest: boolean
  atRisk: boolean                 // !securedToday && !todayIsRest && current > 0
  previous: number                // tamanho da última sequência que quebrou (0 se nenhuma na janela)
  brokenOn: string | null         // primeiro dia perdido que quebrou `previous`
  tier: { key: StreakTierKey; label: string; min: number; max: number | null }
  nextTier: { key: StreakTierKey; label: string; at: number } | null
  milestones: StreakMilestone[]   // 7,14,30,60,100
  nextMilestone: { days: number; label: string; remaining: number } | null  // relativo a `current`
  missions: StreakMission[]       // sempre as 3, nessa ordem
  week: StreakDay[]               // segunda..domingo da semana local de hoje (7 itens; futuros com secured=false)
  recent: StreakDay[]             // últimos 35 dias até hoje, do mais antigo ao mais novo
  points: { today: number; week: number }
  rules: { focusGoalSec: 1800; windowDays: 400 }
}
```

Labels de nível: `none` "Sem sequência", `basico` "Básico", `progresso` "Em progresso", `determinado` "Determinado", `especialista` "Especialista", `lendario` "Lendário".
Labels de marco: 7 "Primeiro marco", 14 "Constância", 30 "Disciplina", 60 "Nível avançado", 100 "Lendário".

### `GET /streak/team`

Auth: JWT + `CompanyRoleGuard` (qualquer membro). Empresa = header `x-company-id` validado (`@CompanyId()`).

```ts
interface StreakTeamMember {
  user: { id: string; name: string }
  isMe: boolean
  current: number
  best: number
  securedToday: boolean
  todayIsRest: boolean
  tier: { key: StreakTierKey; label: string }
  week: { date: string; secured: boolean; rest: boolean; perfect: boolean; isToday: boolean }[]  // seg..dom
  points: { week: number }
}

interface StreakTeam {
  date: string
  companyId: string
  members: StreakTeamMember[]     // ordenado por points.week desc, depois current desc, depois nome
  summary: { securedToday: number; active: number; total: number; teamStreak: number }
}
```

---

## User Stories

- Como **pessoa do time**, quero ver na topbar quantos dias seguidos estou cumprindo a meta, para ter um motivo leve de abrir o Workflow e trabalhar nele todo dia.
- Como **pessoa do time**, quero missões claras do dia e ver o Nevo reagir quando eu as cumpro, para sentir progresso.
- Como **pessoa do time**, quero ver a sequência e o ranking de pontos dos colegas, para criar ritmo coletivo.
- Como **dono**, quero uma vitrine animada do produto na home, para a primeira impressão ser de produto vivo.

---

## Acceptance Criteria

### Comportamentais (API)
- [ ] **Given** usuário com 45 min de foco hoje **When** `GET /streak/me` **Then** `securedToday=true` e a missão `focus` tem `current>=30, done=true`.
- [ ] **Given** usuário sem foco mas que moveu 1 tarefa para DONE hoje **When** `GET /streak/me` **Then** `securedToday=true` e `missions[1].done=true`.
- [ ] **Given** sequência seg-sex garantida e sábado/domingo sem nada (jornada padrão) **When** segunda consulta sem ter garantido ainda **Then** `current=5`, `atRisk=true`, `todayIsRest=false`.
- [ ] **Given** uma quarta útil sem nada entre dias garantidos **When** consulta **Then** a sequência atual conta só depois da quarta e `previous`/`brokenOn` apontam a sequência quebrada.
- [ ] **Given** tarefa concluída, reaberta e concluída de novo em outro dia **When** consulta **Then** só o primeiro dia conta a tarefa.
- [ ] **Given** entrada MANUAL criada 3 dias depois do dia a que se refere **When** consulta **Then** ela não garante aquele dia.
- [ ] **Given** membro de outra empresa **When** `GET /streak/team` com header de empresa da qual não é membro **Then** 403.
- [ ] **Given** `GET /streak/team` **Then** nenhum membro traz `focusSec`, `tasksDone`, `collab` nem e-mail.

### Comportamentais (Web)
- [ ] **Given** usuário logado em qualquer shell (Command, Focus, Canvas) **When** a topbar renderiza **Then** aparece o chip com chama + número da sequência; **When** clica **Then** abre popover com semana (seg..dom), missões, próximo marco e link para a home.
- [ ] **Given** hoje garantido **Then** a chama do chip fica acesa (colorida) e sem pulso; **Given** pendente com sequência > 0 **Then** a chama fica apagada (cinza) com indicação "garanta hoje".
- [ ] **Given** o usuário conclui a tarefa ou para o timer que garante o dia **When** o evento realtime chega **Then** em até 3 s a sequência atualiza e aparece a comemoração (Nevo pulando + confete + texto "Dia garantido!"), uma vez por dia.
- [ ] **Given** a sequência atinge um marco (7/14/30/60/100) **Then** a comemoração mostra a chama do marco e o nome dele.
- [ ] **Given** a home **Then** o primeiro módulo é "Sua sequência" (número grande com count-up, humor do Nevo, semana, missões, evolução do mascote, marcos) e existe o painel "Seu time" com colegas, chamas e ranking de pontos.
- [ ] **Given** a home rolada até a vitrine **Then** a cena 3D carrega sob demanda e toca em loop com legendas; botão pausar/tocar funciona; fora da tela ou aba escondida ela pausa.
- [ ] **Given** `prefers-reduced-motion: reduce` **Then** nenhum flipbook/pulo/confete anima e a vitrine mostra quadro estático.
- [ ] **Given** a aba Equipe do /time **Then** cada linha mostra a chama com a sequência do colega e há alternância de ordenação "Horas / Sequência".

### Observáveis
- [ ] `npx vue-tsc --build` limpo no web; `npx tsc --noEmit -p tsconfig.json` limpo na API.
- [ ] `npx jest src/streak src/time-tracking` passa na API.
- [ ] `npm run build-only` no web: nenhum chunk referenciado por `index.html` contém `three`.
- [ ] Nenhum `—` em texto visível novo (grep nos `.vue` novos).
- [ ] Nenhum hex novo em componente (cores via token).

---

## Estratégia de Testes

### Unitários (API)
- [ ] `streak-engine.spec.ts`: dia garantido por foco, por tarefa; descanso não quebra e conta se garantido; hoje pendente; quebra no meio (previous/brokenOn); janela; tiers nas fronteiras (0,1,3,4,7,8,14,15,30,31); marcos por `best`; pontos com tetos; dia perfeito; teamStreak com membro inativo.
- [ ] `streak.service.spec.ts`: dedupe da primeira conclusão; regra MANUAL D+1; timer aberto só conta hoje; clamp de tzOffset.
- [ ] `streak.http.spec.ts` (padrão `short-link.http.spec.ts`): 200 no `/me`; 403 no `/team` sem membership; payload do `/team` sem campos privados.
- [ ] `balance.service.spec.ts` continua verde após extrair a jornada para `schedule.ts`.

### Integração (somente leitura, banco real)
- [ ] `scripts/verify-streak.ts <email>`: calcula `/me` e `/team` para o usuário real, imprime resumo e checa invariantes (week tem 7 dias, recent 35, current <= best, missões 3). Não escreve nada.

### Visual (web)
- [ ] Prints de: home, popover do chip, comemoração, equipe do /time, vitrine. **Tema claro e escuro, cenário esparso (sequência 0, time vazio) e cheio** (memória `verificacao-visual-cdp`).

---

## Arquivos Impactados

### API (`workflow-api`)
| Arquivo | Ação | Descrição |
|---|---|---|
| `src/time-tracking/schedule.ts` | Criar | Regra pura de jornada: `ScheduleRow`, `PADRAO`, `targetOf(day, versoes)` (movidos do BalanceService sem mudar comportamento) |
| `src/time-tracking/balance.service.ts` | Modificar | Passa a importar `targetOf`/`ScheduleRow`/`PADRAO` de `schedule.ts` |
| `src/shared/date/day-key.ts` | Criar | `dayKey(date, tzOffset)`, `clampTzOffset`, `addDays`, `mondayOf` |
| `src/streak/streak-engine.ts` (+ `.spec.ts`) | Criar | Cálculo puro (dias, sequência, recorde, níveis, marcos, missões, pontos, sequência do time) |
| `src/streak/streak.service.ts` (+ `.spec.ts`) | Criar | Consultas Prisma (TimeEntry, ActivityLog via `$queryRaw`, FeedEvent, WorkSchedule, UserCompany) + cache do time |
| `src/streak/streak.controller.ts` (+ `streak.http.spec.ts`) | Criar | `GET /streak/me`, `GET /streak/team` |
| `src/streak/dto/streak-query.dto.ts` | Criar | `tzOffset` validado |
| `src/streak/streak.module.ts` | Criar | Módulo |
| `src/app.module.ts` | Modificar | Registrar `StreakModule` |
| `scripts/verify-streak.ts` | Criar | Verificação somente leitura |

### Web (`work-flow`)
| Arquivo | Ação | Descrição |
|---|---|---|
| `public/brand/nevo/*.webp` | Criar | 48 sprites recortados |
| `scripts/sprites/*` | Criar | Pipeline de recorte reproduzível (README + python) |
| `src/plugins/tokens.ts` | Modificar | Tokens `--streak-*` e `--tier-*` por tema |
| `src/service/streak/streak-service.ts` | Criar | Cliente tipado |
| `src/composables/useStreak.ts` | Criar | Vue Query (`streakKeys`) |
| `src/composables/useStreakCelebration.ts` | Criar | Detecta dia garantido / marco e dispara a comemoração (1x por dia, `localStorage`) |
| `src/composables/useRealtimeQuerySync.ts` | Modificar | Invalida `['streak']` em `activity:moved` DONE, `time:stopped`, `time:team-stopped`, `comment:new` |
| `src/components/nevo/nevo-assets.ts` | Criar | Manifesto dos sprites, níveis, humores |
| `src/components/nevo/NevoSprite.vue` | Criar | Sprite com animações (idle, walk/run flipbook, jump) |
| `src/components/nevo/NevoFlame.vue` | Criar | Chama (flipbook dos 3 frames) por nível/marco, estado aceso/apagado |
| `src/components/nevo/StreakWeek.vue` | Criar | Semana seg..dom com estados |
| `src/components/nevo/StreakMissions.vue` | Criar | "Sua jornada" (3 missões) |
| `src/components/nevo/TierTrack.vue` | Criar | Evolução do mascote (5 níveis) |
| `src/components/nevo/MilestoneTrack.vue` | Criar | Marcos 7/14/30/60/100 |
| `src/components/nevo/StreakCelebration.vue` | Criar | Overlay de comemoração (montado no AppShell) |
| `src/components/nevo/showcase/NevoShowcase.vue` + `*.ts` | Criar | Vitrine three.js + GSAP |
| `src/core/components/shells/shared/StreakChip.vue` | Criar | Chip + popover |
| `src/core/components/shells/{Command,Focus,Canvas}Shell.vue` | Modificar | Inserir o chip antes do TimerWidget |
| `src/core/components/shells/AppShell.vue` | Modificar | Montar `StreakCelebration` |
| `src/features/dashboard/components/StreakHero.vue` | Criar | Módulo principal da home |
| `src/features/dashboard/components/TeamStreakPanel.vue` | Criar | Painel "Seu time" |
| `src/features/dashboard/DashboardView.vue` | Modificar | Nova composição (hero no topo, time, bento, vitrine) |
| `src/features/dashboard/components/DashboardHeader.vue` + `useDashboardOrchestration.ts` | Modificar | Saudação com primeiro nome |
| `src/features/time/components/TeamView.vue` + `composables/useTeamTime.ts` | Modificar | Chama/sequência por colega, ordenação Horas/Sequência, textos >= 12px |
| `src/CLAUDE.md` | Modificar | Registrar a feature e os componentes do Nevo |

---

## Tasks Técnicas

- [ ] **T0** Sprites: recorte, WebP em `public/brand/nevo/`, pipeline em `scripts/sprites/`.
- [ ] **T1** API: `schedule.ts` + `day-key.ts` + refactor do BalanceService (sem mudança de comportamento).
- [ ] **T2** API: `streak-engine.ts` + spec *(depende de T1)*.
- [ ] **T3** API: service + controller + DTO + module + registro + specs *(depende de T2)*.
- [ ] **T4** API: `scripts/verify-streak.ts` *(depende de T3)*.
- [ ] **T5** Web: tokens + service + `useStreak` + `nevo-assets` + componentes base do Nevo *(depende de T0 e do contrato)*.
- [ ] **T6** Web: StreakChip nos 3 shells + comemoração no AppShell + invalidação realtime *(depende de T5)*.
- [ ] **T7** Web: StreakHero + TeamStreakPanel + nova composição da home + saudação com nome *(depende de T5)*.
- [ ] **T8** Web: vitrine three.js + GSAP *(depende de T5)*.
- [ ] **T9** Web: sequência na Equipe do /time *(depende de T5)*.
- [ ] **T10** Gates: typecheck, lint, testes, build (three fora da entrada), code review adversarial, prints 2 temas x 2 cenários.

---

## Considerações de Arquitetura

- **Decisão:** sequência derivada, calculada a cada request, sem tabela.
  **Motivo:** proibido mexer em schema agora (`.env` aponta para produção, memória `prisma-migrate-dev-e-perigoso`); os dados necessários já existem.
  **Alternativa rejeitada:** tabela `StreakDay` materializada por evento. Mais rápida e permitiria freeze, mas exige migration.
- **Decisão:** atualização em tempo real **só no front** (invalidar `['streak']` com eventos que já existem).
  **Motivo:** nenhum evento novo no backend, nenhuma dependência nova (`@nestjs/event-emitter`).
  **Alternativa rejeitada:** listener no backend emitindo `streak:updated`. Fica como follow-up se a latência incomodar.
- **Decisão:** mascote 2D com sprites recortados + CSS/GSAP; three.js só na vitrine.
  **Motivo:** o chip vive montado em toda tela; CSS custa zero. A vitrine é a única peça que ganha com 3D.
- **Decisão:** GSAP para coreografia (já no projeto); **sem anime.js** (rejeitado na `overhaul-visual-premium` por redundância).

---

## Plano de Rollout

- [ ] Backend primeiro (rotas novas, aditivas). O front degrada: 404/403 no `/streak/*` esconde chip/hero de sequência e mantém o resto da home.
- [ ] Web em seguida.

## Plano de Rollback

- Reverter os commits. Sem migration, sem dado novo: rollback é só código.

---

## Follow-ups

- Índice `ActivityLog("changedById","changedAt")` (migration à mão, `CREATE INDEX CONCURRENTLY`).
- Congelamento de sequência e opt-in de lembrete (precisam de persistência).
- Cron "sua sequência está em risco" com `STREAK_REMINDER_ENABLED` desligado por padrão e dedupe no banco.
- Presença online no ranking (hoje `usePresence` é código morto e a presença é por processo).
- Vitrine também na tela de login (reuso do `NevoShowcase`).

## Decisões tomadas na implementação

- **D3 refinada:** a "primeira conclusão" de uma tarefa é a de qualquer pessoa, e só depois se filtra por quem pergunta. Filtrar antes fazia quem reabre e conclui a tarefa de um colega ganhar o crédito no `/me` e perder no `/team` (chip e painel com números diferentes). Custo: duas leituras de `ActivityLog` por cálculo, até o índice sair.
- **D2 refinada:** o timer aberto só conta se começou hoje. Um timer esquecido desde ontem só entra quando for parado.
- **D10, colaboração no `/me`:** o feed é lido desde o início do `recent` (35 dias), para dias antigos também poderem aparecer como perfeitos. No `/team`, a leitura vai de segunda menos 1 dia.
- **D13 refinada:** um dia em que os membros ativos só descansaram, sem ninguém garantir, é neutro: não soma nem quebra. Assim um fim de semana parado não rende +2. Hoje soma quando nenhum ativo está pendente e pelo menos um garantiu.
- **Segurança extra no `/team`:** além do guard, que confia na lista de empresas do token (válido por 7 dias), o service confere no banco se quem pergunta ainda é membro. Se não for, responde 403.

## Change Log

- 2026-09-25 v0.1: criação, decisões D1-D15, contrato da API.
- 2026-09-25 v0.2: refinamentos de D2, D3, D10 e D13 e checagem de membro no banco, decididos na implementação da API.
