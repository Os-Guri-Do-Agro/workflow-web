# Spec: Time Tracking v2 — paridade Clockify + visão de equipe em tempo real

**Status:** Concluído (aguardando deploy do backend para e2e) · **Concluído em:** 2026-07-24
**Autor:** Nicolas (via Claude)
**Criado em:** 2026-07-24
**Última atualização:** 2026-07-24
**Versão:** 0.1
**Depende de:** [time-tracking.md](./time-tracking.md) (v1, aprovada e implementada)

---

## Visão Geral

> Evoluir o Time Tracking do work-flow para o usuário parar de usar o Clockify: badge de "gravando" no favicon, edição da entrada enquanto o timer roda, atribuição de tarefa funcionando de fato, layout melhor e uma visão de equipe em tempo real para o ADMIN acompanhar quem está trabalhando agora e quanto já fez.

## Motivação / Contexto de Negócio

A v1 entregou o timer pessoal (start/stop/entradas/summary) e um `company-report` agregado que **nunca foi ligado no frontend**. Na prática o usuário ainda abre o Clockify porque: (1) o feedback de "estou gravando" é fraco (só um emoji ⏱ no título da aba, que parece um relógio genérico); (2) não dá pra corrigir a entrada corrente sem parar o timer; (3) a atribuição de tarefa falha por abastecimento incompleto das opções; (4) não existe visão de gestor. Cada um desses é motivo isolado para não migrar. Fechar os cinco elimina a dependência externa.

---

## Research Findings

**Stack:** Frontend `work-flow` (Vue 3.5 + Vuetify 4 + Pinia 3 + Vue Query + lucide + tokens em `plugins/tokens.ts` + socket via `realtime-service.ts`). Backend `../workflow-api` (NestJS + Prisma + socket.io único gateway `RealtimeGateway`). Roles por empresa em `UserCompany.role` (`CompanyRole { ADMIN, WORKER }`).

**Estado real (Fase 0, 3 exploradores):**

- **Favicon:** `index.html` aponta `rel=icon` → `/brand/marca.svg` (a carinha do mascote). **Não há manipulação dinâmica de favicon** em `src/`. O "relógio" que incomoda é o emoji `⏱` injetado no `document.title` por [`src/composables/useTimerDocumentTitle.ts:30`](../../src/composables/useTimerDocumentTitle.ts). Montado em `AppShell.vue:56`.
- **Editar rodando:** o backend `PATCH /time/entries/:id` (`time-tracking.service.ts:211-281`) **já aceita** editar entrada com `endedAt=null` (descrição, companyId, activityId, startedAt, billable; não checa overlap com timer aberto). O frontend é que trava: `TimeTrackingView.vue` filtra `visibleEntries = list.filter(e => e.endedAt)` (L169 — a entrada corrente nunca entra na lista, e é lá que ficam os botões Editar) e a barra do timer faz `:disabled="isRunning"` no input/empresa e esconde o select de tarefa (`v-if="companyId && !isRunning"`, L392).
- **Atribuição de tarefa:** envio/persistência/exibição OK. `activityId` sai no start/manual/patch e volta como `entry.activity.title`. Backend valida com `assertActivityCompany` (`time-tracking.service.ts:619-631`): **exige `companyId` e** que a activity pertença à empresa via `Activity → month → quarter → companyId`. O furo é o **abastecimento das opções** no front: `activityOptionsFor()` (`TimeTrackingView.vue:35-42`) lê `workspace.workspaceData.activities` (subconjunto vindo de `GET /dashboard/workspace`), filtra por `companyId` exato, e watchers zeram `activityId` ao trocar de empresa (L51-56, L316-321; `TimerWidget.vue:50-52`). Em "Pessoal" (`companyId=null`) a lista é sempre vazia e o backend rejeitaria `activityId` sem company.
- **Admin / tempo real:** `timeService.companyReport()` existe no front mas **nenhum componente chama**. O endpoint `GET /time/company-report` (`ADMIN` via `CompanyRoleGuard` + `x-company-id`) agrega **só entradas fechadas** (`where: { companyId, durationSec: { not: null } }`) — **exclui timers rodando**. Eventos `time:started`/`time:stopped` saem **só** via `emitToUser` → room `user:<id>` (`time-tracking.service.ts:93,135,478`). **Nenhum** evento `time:*` vai para `company:<id>`. Listar funcionários já existe: `GET /company/:id/members` (`company.controller.ts:82`, exige apenas membership).
- **Model `TimeEntry`** (schema `workflow-api/prisma/schema.prisma:323-351): tem tudo da v1 + `autoStopped Boolean`. Índice parcial `TimeEntry_one_running_per_user` (1 timer ativo/usuário) vive na migration `20260703120000_time_tracking`.

**Padrões a seguir:**
- Tokens de cor (nunca hex em componente): `plugins/tokens.ts` é a fonte. Reusar `--err` para o vermelho do badge; `--brand-*` (adicionados na sessão do launcher) para a carinha.
- ADMIN-only no front: rota com `meta.requiredRole: 'ADMIN'` (padrão de `CompanyUsersView`, `router/index.ts:112`) + `workspaceStore.isAdmin`.
- Realtime: `realtime-service.ts` com `fanout<T>` + handlers em `RealtimeHandlers`; backend emite por room.
- Overlay/aba: seguir `AppSelect`, `Pill`, `EmptyState`, `Skeleton`, tokens; lucide icons.
- Cronômetro: cliente **nunca** é fonte de verdade — deriva de `startedAt` (`useTimeTracking.ts:73`).

**Breaking Changes:** Nenhuma quebra de contrato existente. Aditivo: 1 novo endpoint, novos eventos socket em room de empresa, novos campos no payload de eventos `time:*` (adicionar `userId`/`userName` — consumidores atuais ignoram campos extras). Sem migration de schema.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | **Vazamento cross-company:** funcionário membro de várias empresas com timer sem vínculo (ou vinculado à empresa Y) apareceria para o ADMIN da empresa X. | Regra de emissão/consulta explícita: o ADMIN de X só recebe timers de membros de X **vinculados a X ou sem vínculo (geral)**. Timer vinculado a **outra** empresa Y **não** é emitido para `company:X` nem retornado no `company-live` de X. Implementado no backend (server-side), nunca filtrado só no cliente. |
| Alto | **Privacidade do funcionário (LGPD):** "tudo que rodar no expediente" expõe descrição de tempo pessoal ao gestor. | Decisão de produto explícita do dono (resposta 1 = "tudo que rodar no expediente"). Mitigação: timers **sem vínculo** aparecem para o admin como atividade em andamento **com** descrição (escolha do dono), mas isolados por membership (linha acima). Documentar no README/onboarding que o gestor vê timers em andamento. Reavaliar se surgir requisito de ocultar pessoal. |
| Médio | **Edição ao vivo dispara PATCH a cada tecla** → flood de request + corrida com o tick. | Autosave **debounced** (600ms) + flush no blur; PATCH parcial só dos campos alterados; nunca envia `endedAt` para entrada corrente (mantém `null`); reusa o padrão `InlineEditText`/`useNoteAutosave`. |
| Médio | **Atribuir tarefa em "Pessoal"** → backend 400 (`companyId` ausente). | UX: tarefa exige empresa. Selecionar uma tarefa **auto-preenche** a empresa dela; sem empresa, o select de tarefa fica desabilitado com hint "escolha uma empresa". Nunca envia `activityId` sem `companyId`. |
| Médio | **Favicon canvas com SVG externo** (`marca.svg`) pode falhar por CORS/timing ao desenhar `<img>` no canvas. | `marca.svg` é same-origin (`/brand/`); pré-carregar a imagem uma vez, cache do dataURL base; fallback: se o desenho falhar, badge sobre disco creme sólido desenhado no canvas (sem depender do SVG). |
| Baixo | Emissão para company room aumenta tráfego socket. | Só emite em start/stop (não a cada tick — o tick da tela admin é derivado client-side de `startedAt`, igual ao timer pessoal). |

---

## Requisitos Não-Funcionais

- **Segurança:** `GET /time/company-live` exige JWT + `CompanyRoleGuard` + `@RequireRole(ADMIN)` + `x-company-id` (mesmo padrão de `company-report`). Filtro de membership + isolamento cross-company feito no service.
- **Privacidade / LGPD:** ver riscos Alto. Isolamento por membership é server-side.
- **Performance:** `company-live` responde <300ms (query indexada `endedAt IS NULL` + join membros). Tela admin não faz polling: estado inicial via REST + atualizações via socket.
- **Acessibilidade:** badge do favicon é reforço, não único sinal (título e widget também indicam). Botões novos com `aria-label`; edição inline navegável por teclado (Esc cancela, Enter/blur salva). Respeitar `prefers-reduced-motion` em pulsos.

---

## User Stories

- Como **usuário**, quero ver na aba do navegador um indicador claro de que estou gravando tempo, para não esquecer o timer rodando.
- Como **usuário**, quero corrigir descrição/empresa/tarefa **enquanto** o timer roda, para não precisar parar e recomeçar.
- Como **usuário**, quero escolher a tarefa certa da empresa ao trackear, para meu tempo ficar atribuído corretamente.
- Como **ADMIN**, quero abrir uma visão de equipe e ver quem está trabalhando agora (em tempo real) e quanto cada um já fez no período, para gerir sem pedir print do Clockify.

---

## Acceptance Criteria

### 1. Favicon "gravando"
- [ ] **Given** nenhum timer rodando **When** a página carrega **Then** o favicon é a carinha (`marca.svg`) sem badge e o `document.title` é o base (sem `⏱`).
- [ ] **Given** um timer inicia **When** `isRunning` vira true **Then** o favicon passa a exibir um ponto vermelho (`--err`) no canto da carinha e o título passa a `● MM:SS · <descrição>` (sem o emoji `⏱`).
- [ ] **Given** o timer para **Then** favicon e título voltam ao estado base em <1s.
- [ ] O favicon é gerado por canvas → `toDataURL` trocando `<link rel=icon>`; se o desenho do SVG falhar, um fallback sólido com o badge ainda é aplicado (nunca fica sem ícone).

### 2. Editar entrada corrente
- [ ] **Given** timer rodando **When** o usuário edita descrição na barra do timer **Then** após 600ms (ou no blur) um `PATCH /time/entries/:id` salva só a descrição, sem parar o timer, e o cronômetro segue.
- [ ] **Given** timer rodando **When** o usuário troca a empresa **Then** salva via PATCH, o select de tarefa recarrega para a empresa nova, e a tarefa é resetada apenas se incompatível.
- [ ] **Given** timer rodando **When** o usuário atribui uma tarefa **Then** salva via PATCH e o chip da tarefa aparece; nunca envia `endedAt`.
- [ ] Um indicador de autosave ("Salvando…/Salvo") reflete o estado; erro de PATCH mostra toast e mantém o valor editado.

### 3. Atribuição de tarefa
- [ ] **Given** uma empresa selecionada **When** o usuário abre o select de tarefa **Then** a lista contém **todas** as atividades daquela empresa (fonte dedicada por empresa, não o subconjunto do dashboard).
- [ ] **Given** "Pessoal" (sem empresa) selecionado **Then** o select de tarefa fica desabilitado com hint "Escolha uma empresa para atribuir uma tarefa" e nenhum `activityId` é enviado.
- [ ] **Given** o usuário escolhe uma tarefa **Then** a empresa da tarefa é preenchida automaticamente se ainda não houver empresa selecionada.
- [ ] **Given** start/manual/patch com `activityId` de outra empresa **Then** o front previne (não oferece a opção); se o backend retornar 400, um toast explica "Tarefa não pertence à empresa".

### 4. Visão de equipe (ADMIN)
- [ ] **Given** um ADMIN da empresa X **When** abre a aba "Equipe" em `/time` **Then** vê a lista de membros de X (nome) com: estado atual (Trabalhando agora / Ocioso), descrição+tarefa+cronômetro ao vivo do timer corrente, e total do dia/período.
- [ ] **Given** um WORKER **When** tenta acessar a aba/rota admin **Then** é bloqueado (aba não aparece; rota redireciona) — 403 no endpoint.
- [ ] **Given** a tela admin aberta **When** um membro de X inicia/para um timer vinculado a X ou geral **Then** a tela reflete em tempo real (via socket `company:<X>`), sem reload.
- [ ] **Given** um membro com timer vinculado a **outra** empresa Y (da qual o admin de X não participa) **Then** esse timer **não** aparece na tela de X (isolamento cross-company, verificável no payload do endpoint e do socket).
- [ ] `GET /time/company-live` retorna, para a empresa do header, os timers com `endedAt IS NULL` de membros da empresa, `companyId ∈ {X, null}`, com `{ userId, userName, description, activity, startedAt }`.

### Observáveis
- [ ] `useTimeSummary`/`companyReport` passam a ser consumidos (deixam de ser código morto).
- [ ] Nenhum `:disabled="isRunning"` remanescente que impeça editar a entrada corrente.

---

## Estratégia de Testes

### Unitários (backend)
- [ ] `TimeTrackingService.companyLive` — retorna só membros da empresa; inclui `companyId=null`; **exclui** `companyId=Y`; exclui entradas fechadas.
- [ ] Emissão: `start`/`stop` com `companyId=X` emite para `company:X`; com `companyId=null` emite para todas as company rooms do usuário; com `companyId=Y` **não** emite para `company:X`.
- [ ] `assertActivityCompany` continua barrando activity de empresa errada (regressão).

### Unitários (frontend)
- [ ] `useFaviconBadge` — alterna dataURL do link em `isRunning`; fallback quando `img.onerror`.
- [ ] `activityOptionsFor` (nova fonte) — lista completa por empresa; vazia em "Pessoal".

### Integração
- [ ] Editar entrada corrente: PATCH parcial não fecha o timer (`endedAt` segue null); cronômetro não zera.
- [ ] Tela admin: estado inicial (REST) + evento socket atualiza a linha do membro.

### Manuais (happy path)
- [ ] Start → editar descrição/empresa/tarefa ao vivo → ver chips → stop; conferir aba/título/favicon a cada transição.
- [ ] Dois usuários (ou duas sessões): worker inicia timer vinculado; admin vê aparecer em tempo real; worker para; some.
- [ ] Verificação visual via Edge headless (screenshot) da view redesenhada e do favicon-badge.

### Regressão
- [ ] v1: trocar empresa mantém timer; duas abas sincronizam; reload retoma `GET /time/current`; `company-report` (agregado) segue 200 para ADMIN e 403 para WORKER.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `work-flow/src/composables/useFaviconBadge.ts` | Criar | Canvas desenha `marca.svg` + badge `--err`; troca `<link rel=icon>`; fallback sólido. |
| `work-flow/src/composables/useTimerDocumentTitle.ts` | Modificar | Trocar `⏱` por `●`; montar `useFaviconBadge` junto. |
| `work-flow/src/core/components/shells/AppShell.vue` | Modificar | Chamar `useFaviconBadge()` no ponto sempre-presente. |
| `work-flow/src/features/time/TimeTrackingView.vue` | Modificar/Quebrar | Remover travas `:disabled="isRunning"`; edição ao vivo da entrada corrente; corrigir fonte de tarefas; abas "Meu tempo"/"Equipe"; extrair componentes. |
| `work-flow/src/features/time/components/*` | Criar | `TimerBar.vue`, `EntryRow.vue`, `DayGroup.vue`, `ManualEntryForm.vue`, `TeamView.vue`, `TeamMemberRow.vue` (quebrar as 1345 linhas). |
| `work-flow/src/features/time/composables/useTeamTime.ts` | Criar | Query `company-live` + `company-report` + socket `company:<id>` para a aba admin. |
| `work-flow/src/composables/useTimeTracking.ts` | Modificar | Expor helper de PATCH parcial da entrada corrente; garantir tarefa da empresa. |
| `work-flow/src/composables/useCompanyActivities.ts` | Criar (ou reusar) | Fonte dedicada: atividades por empresa (endpoint existente de activities), com cache. |
| `work-flow/src/service/time/time-service.ts` | Modificar | Adicionar `companyLive(filters)` → `GET /time/company-live`; tipo `TeamLiveEntry`. |
| `work-flow/src/service/realtime/realtime-service.ts` | Modificar | Handlers de eventos de time na room de empresa (ex: `teamTimeStarted/Stopped`). |
| `work-flow/src/router/index.ts` | Modificar | (se aba for rota) `meta.requiredRole: 'ADMIN'`. |
| `workflow-api/src/time-tracking/time-tracking.controller.ts` | Modificar | `GET /time/company-live` (ADMIN + `x-company-id`). |
| `workflow-api/src/time-tracking/time-tracking.service.ts` | Modificar | `companyLive()`; emitir `time:*` para company rooms conforme regra de isolamento; incluir `userId/userName` no payload. |
| `workflow-api/src/realtime/realtime.service.ts` | Verificar/Modificar | Garantir `emitToCompany` para os eventos de time (já existe `emitToCompany`). |

> Confirmar na T3 o endpoint real de "atividades por empresa" (feature board/tasks já lista atividades) antes de criar `useCompanyActivities`.

---

## Tasks Técnicas

Fatiadas para serem **shippáveis isoladamente**. Ordem sugerida; T1–T3 são frontend puro e entregam valor sem tocar backend.

- [x] **T1 — Favicon "gravando"** — `useFaviconBadge.ts` (canvas + badge `--err` + fallback sólido), `⏱`→`●` em `useTimerDocumentTitle.ts`, montado em `AppShell.vue`. Verificação visual OK (screenshot carinha + ponto vermelho).
- [x] **T2 — Editar entrada corrente ao vivo** — `useRunningEntryEditor.ts` (autosave debounced 600ms via `PATCH` parcial, sem `endedAt`, sem clobber no refetch); barra editável rodando na view e no `TimerWidget`; `SaveStatus`.
- [x] **T3 — Corrigir atribuição de tarefa** — `useCompanyActivities.ts` (hidrata `workspaceData` se null — causa raiz do select vazio); `applyCompanyChange/applyActivityChange` (reset inteligente + auto-preencher empresa); "Pessoal" desabilita tarefa com hint. Aplicado na view e no widget.
- [x] **T4 — Backend: live + emissão para equipe** — `GET /time/company-live` (ADMIN, isolamento no servidor); `time:team-started/stopped` para `company:<id>` (X, ou todas as empresas do user se geral, nunca Y); payload com `userId/userName`. **5 testes de isolamento passando** (`time-tracking.service.spec.ts`).
- [x] **T5 — Frontend: aba "Equipe" (ADMIN)** — `useTeamTime.ts` (members + company-live + company-report + socket `time:team-*`); `TeamView.vue`; abas "Meu tempo"/"Equipe" gated por `isAdmin` dentro de `/time`.
- [x] **T6 — Evoluir layout** — Abas, estado de gravação em vermelho (borda + cronômetro com ponto pulsante, casando com favicon/título), autosave visível, TeamView com linhas ao vivo vs ocioso. Verificação visual OK. **Desvio consciente:** extraí `TeamView` + composables, mas NÃO fatiei a view em `TimerBar/EntryRow/DayGroup/ManualEntryForm` — a view coesa reduz risco de regressão nos comportamentos F1–F6 já entregues; fatiamento fino fica como follow-up de manutenção.
- [x] **T7 — Testes + gates** — `vue-tsc --build` (frontend) e `tsc --noEmit` (backend) limpos; `eslint` limpo nos arquivos tocados (2 repos); 5 testes de isolamento passando; verificação visual dos estados novos. **Não feito:** testes automatizados de frontend (composables) e e2e ao vivo contra backend — ver "Estado da entrega".

---

## Considerações de Arquitetura

- **Decisão:** Isolamento cross-company feito no **backend** (service), não no filtro do cliente.
  **Motivo:** privacidade é garantia de segurança; filtro só no front é burlável.
  **Alternativa rejeitada:** enviar tudo e filtrar na tela admin — vaza no payload/socket.

- **Decisão:** Tela admin não faz polling; estado inicial REST + atualização por socket na room `company:<id>`; cronômetro derivado de `startedAt` no cliente.
  **Motivo:** consistente com o timer pessoal (v1), barato, tempo real de verdade.
  **Alternativa rejeitada:** polling do `company-report` (não tem timers rodando e é caro).

- **Decisão:** Editar a entrada corrente reusa o `PATCH` existente com payload **parcial** e **sem** `endedAt`.
  **Motivo:** o backend já trata timer aberto; não precisa endpoint novo.
  **Alternativa rejeitada:** endpoint dedicado `/time/current` PATCH — redundante.

- **Decisão:** Badge no favicon via canvas + `toDataURL`, base é `marca.svg`.
  **Motivo:** coerência de marca (mesma carinha do launcher) e um sinal inequívoco de "gravando".
  **Alternativa rejeitada:** manter só o emoji no título — é o que já confunde o usuário.

---

## Plano de Rollout

- [ ] T1–T3 (frontend) podem ir a produção antes do backend — valor imediato, zero risco de contrato.
- [ ] T4 (backend) deploy aditivo (novo endpoint + emissão extra). Sem migration. `git push` derruba o container (ver memória de deploy Railway) — validar endpoint logo após subir.
- [ ] T5 depois do T4 no ar.

## Plano de Rollback

- Frontend (T1–T3, T5, T6): reverter commits; sem estado persistido novo.
- Backend (T4): reverter commit do módulo `time-tracking` + realtime. **Sem migration** → reverter commit basta; nenhum dado a desfazer (endpoint é read-only e a emissão extra é efêmera).

---

## Observabilidade

- **Log:** backend loga em `company-live` o `companyId` e contagem retornada (nível debug); warn se `assertActivityCompany` barrar (já existe exceção).
- **Métrica:** não aplicável (sem infra de métricas no projeto hoje) — justificado.
- **Alerta:** não aplicável.

---

## Definition of Done

- [ ] Todos os AC atendidos e verificados (marcados Atendido/Não atendido com motivo)
- [ ] Testes da Estratégia implementados e passando; regressão v1 rodada
- [ ] `npx tsc --noEmit` limpo em `work-flow` **e** `workflow-api`
- [ ] `/code-review` rodado e findings de correção resolvidos
- [ ] `/verify` — fluxo exercitado ponta a ponta (start→editar→atribuir→stop; worker↔admin em tempo real) + verificação visual (screenshots)
- [ ] Isolamento cross-company verificado no payload (não só na UI)
- [ ] Spec com status `Concluído` + data + Change Log
- [ ] `/spec-sync` rodado (ou sugerido)

## Perguntas em Aberto

- [x] Confirmar o endpoint real de "atividades por empresa" no backend (T3) — **Resolvido: NÃO existe listagem no `activity.controller` (só por id). Decisão: usar `workspaceData.activities` garantindo o carregamento (`useCompanyActivities` dispara `fetchWorkspace` se `workspaceData` for null — a causa real do select vazio). Endpoint dedicado de catálogo por empresa fica como follow-up se surgir necessidade de histórico completo.** O AC "auto-preenche empresa ao escolher tarefa" é adaptado ao design de 2 selects (empresa→tarefa): a tarefa só aparece com empresa escolhida; sem empresa a tarefa fica desabilitada com hint.
- [x] A aba "Equipe" é aba interna de `/time` ou rota própria? **Resolvido (dono, 2026-07-24): aba interna de `/time`, sem item de menu dedicado.**

## Estado da entrega (honesto)

**Feito e verificado:**
- Código completo das 7 tasks nos dois repos. `vue-tsc`/`tsc`/`eslint` limpos. 5 testes de isolamento cross-company passando. Verificação visual dos estados novos (favicon-badge, barra em gravação, aba Equipe) via render fiel com os tokens reais.

**Gaps declarados (não feito):**
1. **Deploy do backend pendente.** As mudanças de backend (endpoint `company-live` + eventos `time:team-*`) precisam ir a produção (Railway). Sem isso a aba Equipe carrega vazia / sem tempo real e o `company-live` responde 404. Deploy não foi feito (sem autorização de push/deploy; ver memória de deploy Railway — push derruba o container). **Frontend (T1–T3) pode subir antes, é seguro.**
2. **E2E ao vivo não exercitado.** O round-trip real (autosave PATCH na aba do navegador, broadcast de socket entre worker e admin, favicon numa aba real) não foi rodado ponta a ponta contra um backend vivo — não há credenciais de teste e o backend não está deployado com estas mudanças. A verificação foi por typecheck + testes de unidade do isolamento + render visual fiel.
3. **Sem testes automatizados de frontend** (composables `useRunningEntryEditor`/`useTeamTime`/`useFaviconBadge`). Cobertos por typecheck + verificação visual; teste automatizado fica como follow-up.
4. **`/code-review` formal não rodado** (comando do usuário); fiz auto-revisão do diff. Nada commitado — o dono revisa o diff.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-24 | 0.1 | Criação a partir da Fase 0 (3 exploradores) + decisões do dono (visão admin = tudo no expediente com isolamento cross-company; timer default = escolha do usuário, editável depois) | Nicolas via Claude |
| 2026-07-24 | 1.0 | Implementação das 7 tasks. Concluído no código; deploy do backend e e2e ao vivo pendentes (ver "Estado da entrega"). | Nicolas via Claude |
