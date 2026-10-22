# Spec: Coluna "Revisados", sinal do teste no card e tarefa em dialog central

**Status:** Concluído (código completo e verificado; sem commit; migration pendente em produção)
**Autor:** Claude (Opus 5.5) a pedido do Nicolas
**Criado em:** 2026-10-22
**Última atualização:** 2026-10-22
**Versão:** 0.2

> Pedido do Nicolas (2026-10-22), com print do board e rascunho do dialog: *"abrir uma nova coluna, Revisados, após o Em teste"*; *"ficou difícil de ler o texto; a tarefa não deveria abrir lateral, deveria abrir centralizada"*; *"o título é o primeiro contato, deve ser entendido antes mesmo de expandir"*; *"a spec não precisa ser lida, precisa ser baixada ou copiada"* (quem lê são as IAs integradas ao dev); *"no Em teste, uma bolinha amarela, azul e vermelha, e a pessoa faz sem ter que abrir a atividade"*. Respostas dele que fecham as dúvidas: **Revisados = aprovados que ainda não subiram**; **reprovado fica em Em teste**, a pessoa move, corrige e depois só troca o sinal; a spec mora **dentro da tarefa**; bug reports vão deixar de existir (o model `Spec` deles está fora).

---

## Visão Geral

Três mudanças no board de tarefas, nos dois repos (work-flow e workflow-api):
1. Status novo **Revisados** entre Em teste e Concluído.
2. **Sinal do teste** (bolinha azul, amarela ou vermelha) nos cards de Em teste, trocado sem abrir a tarefa.
3. O detalhe da tarefa vira um **dialog centralizado em duas colunas**, com **Expandir** (tela cheia) e **Copiar link** que abre o board com a tarefa aberta.

Junto, o **título do card** fica mais legível.

## Motivação

- Hoje "aprovado no teste" e "no ar" são a mesma coluna (Concluído) ou ficam misturados em Em teste. O time precisa ver o que está aprovado e esperando o deploy.
- O resultado do teste só aparece abrindo a tarefa ou num comentário. A bolinha deixa o estado legível no board inteiro de relance.
- O painel lateral de 640px aperta título, descrição e documentos numa coluna só. A spec (documento `.md`) ocupa espaço de leitura, mas quem a lê são as IAs. O que a pessoa faz com ela é copiar e baixar.

---

## Research Findings

**Stack:**
- Front: Vue 3.5 + Vuetify 4 + Vue Query + reka-ui, fonte Figtree, sem test runner (gate `vue-tsc --build`).
- API: NestJS 11 + Prisma 7 (adapter pg), Jest 30.
- O deploy da API não aplica migration. O `.env` aponta para produção.

**Referências no código (API, `workflow-api/`):**
- `prisma/schema.prisma`:
  - `enum ActivityStatus { TODO IN_PROGRESS IN_TESTING DONE }`
  - `model Activity` (hot model, lido em todo lugar)
  - `model ActivityDoc` (`isPrimary`, `content` só por `GET /activity/doc/:id`): é a "spec da tarefa"
- `src/quarter/quarter.service.ts:152-162`: o board do mês monta **quatro chaves fixas**. Um REVIEWED sumiria do payload. Em :320-324, `roadmapStatusOf` trataria REVIEWED como "planned".
- `src/dashboard/dashboard.service.ts:107-118, 185-191, 404-417`: um `if` por status. REVIEWED entraria no total e em nenhum balde.
- `src/export/export.service.ts:20-25`: rótulos em pt hardcoded.
- `src/activity/activity.service.ts:710, 720`: a notificação e o feed mostram o enum cru (`mudou para IN_TESTING`).
- `src/copilot/agent.service.ts:57-61`: enum da ferramenta hardcoded.
- `src/streak/streak.service.ts:360-375`: conta o primeiro `newStatus = 'DONE'`. **REVIEWED não conta, como o produto quer.**
- `ActivityService.move`/`updateStatus` (:526-641) gravam o `ActivityLog` e emitem `activity:moved`.
- O padrão a seguir para tabela nova lida à parte, sem N+1 e degradando sem a tabela, é o `UserAvatarService.urlsFor` (`src/user-avatar/user-avatar.service.ts:110-151`).

**Referências no código (front, `work-flow/`):**
- `src/features/tasks/task-meta.ts:99-112`: `ACTIVITY_STATUSES` é a fonte da ordem e dos rótulos. `statusSpec()` cai em "A fazer" para valor desconhecido.
- Uniões de status **duplicadas**, que o vue-tsc não pega:
  - `TasksView.vue:85,129,250,252,458`: `STATUSES` e `BoardColumns`. Sem REVIEWED, o `syncFromQuery` pula a coluna e o card some.
  - `useActivityPublish.ts:21,34,36`
  - `BoardView.vue:48`
  - `realtime-service.ts:73`
  - `activity-service.ts:232` (`PickerStatus`). O `TaskPicker.vue:619` quebra em runtime.
  - `roadmap-monthly-service.ts:31`
- `TaskLanes.vue:91`: cast que viraria `NaN`. Em :302 e :309, `repeat(4, 280px)` fixo.
- `TaskColumn.vue:157-159`: coluna `min-width: 280px`. Em 1440, 5 colunas pedem 1432px e o board tem 1144px.
- `TaskCard.vue:542-555`: título 14/500 com clamp de 2 linhas, e o "…" absoluto cobre o fim do título no hover.
- `src/features/tasks/components/TaskDetailPanel.vue` (1890 linhas): painel lateral com `?task=`, Teleport, z 2400, `role=dialog`, trap de foco, ordem de fechar (flush de título, descrição e docs, depois `waitForIdle`). A classe `.task-panel` é contrato do `useTaskKeyboard.ts:81-89` e do `TaskListView.vue:331`.
- `TaskDocs.vue` + `MarkdownDocEditor.vue`: os documentos `.md`, com "Copiar markdown" e "Baixar" já prontos (`copyRaw`, `download`) e preview por `renderMarkdown`.
- `TasksView.vue:255, 1747`: o board **ignora `?company=`**. Um link do board aberto por quem está com outra empresa ativa falharia. A `TaskDetailsView` já troca a empresa (:418-423).
- z-index: menus reka em 3000 e `FileViewer` em 2600, ambos **acima** do painel (2400). Por isso o dialog fica em 2400, e não no `AppDialog` (5000).

**Breaking Changes:**
- **Payload do board do mês** ganha a chave `REVIEWED` e o campo `testSignal` em cada tarefa. É aditivo: o front antigo ignora os dois.
- **Dashboard** (`/dashboard/workspace`, `/dashboard/metrics`) ganha `reviewed`. Também aditivo.
- **Link das notificações de tarefa** (`activityLink`) passa de `/tasks/:month/:id` (página) para `/tasks/:month?task=:id&company=` (board com dialog). A página continua respondendo na rota antiga.
- **Ordem de deploy:** código da API primeiro, migration depois. O código antigo com o enum novo some com o card REVIEWED.

---

## Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | `REVIEWED` ("Revisados") entra no `ActivityStatus` entre `IN_TESTING` e `DONE`. **Não é entrega:** sequência, dashboard "concluídas", relatório e roadmap "done" continuam só com `DONE`. No roadmap vale "active". Prazo vencido em Revisados continua "Atrasada". | Palavra do dono: "aprovados que não subiram". |
| D2 | Sinal do teste em **tabela nova** `ActivityTestSignal` (`activityId` PK/FK cascade, `signal`, `setById`, `updatedAt`), com enum `TestSignal { TESTING, NEEDS_ADJUSTMENT, REJECTED }`. **Sem linha = azul.** | Coluna em `Activity` quebraria toda leitura até a migration rodar. Tabela à parte só falta para quem a consulta. |
| D3 | O sinal **só vale em Em teste**. `PATCH /activity/:id/test-signal` recusa (409) tarefa em outra coluna. **Sair de Em teste apaga o sinal**, best-effort e fora da transação do move. Voltar recomeça azul. Reprovar **não move** a tarefa. | Dono: "reprovado fica em teste e a pessoa tem que mover; depois só muda o sinal". |
| D4 | Ao marcar amarelo ou vermelho: notificação in-app para os responsáveis (menos quem marcou) e entrada no feed. Realtime `activity:updated`. No card, o seletor oferece um campo **opcional** "O que precisa mudar?", que vira comentário da tarefa (`POST /comments`, a rota que já existe). | O motivo do vermelho chega a quem corrige sem ninguém perguntar. |
| D5 | **Bolinha:** disco de 10px na linha de meta do card, antes da chave, só em Em teste, num alvo de 28px de altura com `::after` até 44px. Clique ou Enter abre um popover reka com os três estados (rádio; o clique já grava), o campo opcional e quem marcou e quando. Cores: azul `--test-signal-testing`, âmbar `--test-signal-adjust`, vermelho `--test-signal-rejected`. Cor chapada, sem glow. Nunca só cor: tooltip e `aria-label` "Sinal do teste: Reprovado (Letícia, há 2 h)". Some em card `readonly`, `pending` e `rec:`. | Cor como sinal (memória "não IA"). Alvo grande sem engordar o card. |
| D6 | **Colunas:** 5 colunas. A coluna passa a `flex: 1 1 236px; min-width: 220px`, para caber em 1440 com a sidebar aberta (1144px úteis). `TaskLanes` deixa o `repeat(4, …)` e usa o número de colunas. Revisados tem ícone e token próprios (`--task-status-review`), inclusive no Modo XP. | Cinco colunas sem rolagem horizontal na tela comum. |
| D7 | **"…" da coluna Revisados:** "Mover todas para Concluído", com confirmação. Move **em série** pelo `/move` (o mesmo caminho da massa da S5, por causa do deadlock em paralelo). | O dia do deploy vira um clique. |
| D8 | **Título do card:** 15px/21px peso 600, até **3 linhas**, e o "…" não cobre mais o título (o título reserva a largura do botão). Prefixo de área separado por ` › ` (ex.: `App › Parceiro › Indicados: lista...`) sai numa linha própria de 12px em `--text-3`, e o título real vem forte embaixo. Só ` › ` conta como separador; `:` e `·` são parte do título. | O título se lê antes de abrir. O prefixo é contexto, não o assunto. |
| D9 | **Dialog central:** o `TaskDetailPanel` vira dialog (mesmo componente, mesmo `?task=`, z 2400, Teleport, `role=dialog`, trap de foco, classe `.task-panel`, ordem de fechar intacta).<br>Tamanho `min(1120px, 100vw - 48px)` × `min(880px, 100dvh - 48px)`, raio 10px, scrim sem blur.<br>Corpo em grade `minmax(0,1fr) 340px`:<br>• **esquerda:** título 22/600, descrição, "Do módulo", **Specs**, comentários;<br>• **direita:** status, sinal (se Em teste), responsáveis, prioridade, prazo, mês, tags, rotina, arquivos, subtarefas (com criar) e histórico.<br>Abre crescendo do card clicado (FLIP 200ms); com reduced motion, sem animação. Em ≤ 760px abre em tela cheia, uma coluna. | Rascunho do dono. Mesmo componente para não perder autosave, J/K, permissões e realtime. |
| D10 | **Expandir:** botão no topo que alterna tela cheia (inset 0, raio 0) e esconde o assistente (`html[data-immersive]`, receita das Notas). Esc sai da tela cheia antes de fechar. A preferência fica no navegador. Substitui o "Abrir em página"; a página continua no "…" como "Abrir página completa", que tem IA e edição de subtarefa. | Dono: "só deveria ser full screen o modal". A página tem ferramentas que o dialog ainda não tem. |
| D11 | **Copiar link** (botão no topo e no "…") copia a URL absoluta `/tasks/<monthId>?task=<id>&company=<companyId>`. O `TasksView` passa a honrar `?company=`: troca a empresa ativa antes de abrir, como a página faz. O `activityLink` das notificações e o resolvedor `/activity/:id` apontam para o mesmo formato. | O link abre exatamente o que a pessoa via. |
| D12 | **Specs no dialog:** o bloco de documentos vem **recolhido por padrão**. Cada documento é uma linha com nome, "Copiar", "Baixar" e "Ver". "Ver" abre a leitura (`renderMarkdown`) e dali "Editar" vai ao editor. O documento principal vem primeiro. "Subir .md" e "Novo" continuam. | "A spec precisa ser baixada ou copiada, não lida." |
| D13 | Uniões de status duplicadas no front passam a derivar de `ActivityStatus`. Com isso, o vue-tsc obriga cada `Record` a ter REVIEWED. | Evita o próximo card fantasma. |

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | O código **antigo** da API com o enum **novo** some com o card REVIEWED do board. | Ordem obrigatória na migration e na spec: deploy do código, depois migration. O código novo sem a migration recusa REVIEWED com **503 e mensagem clara** (o 22P02 do Postgres vira "A coluna Revisados ainda não está disponível: falta aplicar a migração"). |
| Alto | Um card some no front por causa de uma união de status esquecida. | D13, mais uma busca por `IN_TESTING` em `src/` no fim, e o harness mostra uma tarefa REVIEWED em cada vista (board, pessoa, lista, `/board`, picker). |
| Médio | Limpar o sinal falha depois do move (tabela ausente ou rede), e o sinal velho reaparece quando a tarefa volta a Em teste. | Limpeza best-effort logada. Na leitura, o sinal só vale se `updatedAt` for **posterior** à última entrada em Em teste: o `ActivityLog` tem `changedAt` com `newStatus = IN_TESTING`, e o sinal anterior é descartado. |
| Médio | O dialog em 2400 fica sob menus e overlays mal posicionados. | Mantém o z do painel (2400), abaixo de reka (3000) e `FileViewer` (2600). Verificação abrindo cada menu dentro do dialog. |
| Médio | 5 colunas a 220px apertam o título. | Título em até 3 linhas (D8) e card medido no harness em 1440 e 1920. |
| Baixo | Link de notificação muda de formato. | A rota antiga continua; só o destino padrão muda. |

## Requisitos Não-Funcionais

- **Acessibilidade:** bolinha e Expandir com `aria-label` em pt-BR, alvo ≥ 44px, foco visível. O dialog prende o foco e o devolve ao card. Cor nunca é o único canal.
- **Performance:** o sinal entra no board numa query só (`IN (...)`), sem N+1. Nada de animação por card na carga.
- **Temas:** claro (o que o dono usa), escuro e Modo XP.
- **Copy:** pt-BR, sem em-dash, sem eyebrow.

## Acceptance Criteria

### Comportamentais
- [x] **AC1. Given** uma tarefa em Em teste **When** arrasto para Revisados e recarrego **Then** ela está em Revisados, e o histórico mostra "Em teste → Revisados".
- [x] **AC2. Given** a API nova sem a migration **When** movo para Revisados **Then** volta 503 com "falta aplicar a migração", o card volta para a coluna de origem e aparece o toast. O board continua carregando.
- [x] **AC3. Given** um card em Em teste sem sinal **Then** a bolinha é azul. **When** escolho Reprovado no popover **Then** a bolinha fica vermelha sem abrir a tarefa, persiste no reload e outra aba atualiza sozinha (realtime).
- [x] **AC4. Given** Reprovado escolhido com o texto "botão não envia" **Then** a tarefa ganha esse comentário e os responsáveis (menos eu) recebem a notificação "foi reprovada no teste".
- [x] **AC5. Given** uma tarefa vermelha em Em teste **When** movo para Em andamento e depois de volta para Em teste **Then** a bolinha volta azul.
- [x] **AC6. Given** a coluna Revisados com 3 tarefas **When** uso "Mover todas para Concluído" e confirmo **Then** as 3 vão para Concluído na mesma ordem.
- [x] **AC7. Given** um card **When** clico **Then** abre o dialog centralizado em duas colunas (D9), com J/K trocando de tarefa e Esc fechando, e o foco volta ao card.
- [x] **AC8. Given** o dialog aberto **When** clico Expandir **Then** ocupa a tela inteira. Esc sai da tela cheia, e o segundo Esc fecha.
- [x] **AC9. Given** "Copiar link" **When** abro a URL numa aba nova com outra empresa ativa **Then** a empresa troca e o board abre com a tarefa aberta.
- [x] **AC10. Given** uma tarefa com documento principal **Then** o bloco Specs vem recolhido, e "Copiar" põe o markdown exato no clipboard, "Baixar" salva `<filename>.md` e "Ver" mostra o preview.

### Observáveis
- [x] `GET /month/:id/board` tem a chave `REVIEWED`, e cada tarefa traz `testSignal` (`null` ou `{ signal, setBy, updatedAt }`).
- [x] As notificações de status mostram "Em teste", "Revisados" etc., nunca o enum cru.
- [x] Em 1440x900 com a sidebar aberta, as 5 colunas cabem sem rolagem horizontal.
- [x] O título do card mostra até 3 linhas a 15px/600, e um prefixo ` › ` aparece numa linha própria em 12px.
- [x] `rg "IN_TESTING" src` no front: todo uso com lista de status também tem REVIEWED, ou deriva de `ACTIVITY_STATUSES`.
- [x] Nenhum hex novo em componente, nenhum em-dash na copy, nenhuma `border-left` colorida.

## Estratégia de Testes

### Unitários (API, Jest)
- [x] `ActivityTestSignalService`:
  - `signalsFor` deduplica, sem N+1, e degrada sem a tabela (vazio + aviso uma vez);
  - `set` recusa fora de Em teste, 404 de outra empresa, 503 sem a tabela, faz upsert, notifica em vermelho e amarelo, emite realtime;
  - `clear` nunca lança;
  - o sinal anterior à última entrada em Em teste é descartado.
- [x] `QuarterService.findMonthBoard`: chave REVIEWED, e `testSignal` anexado só em IN_TESTING.
- [x] `ActivityService.move`/`updateStatus`: sair de IN_TESTING chama `clear`; REVIEWED sem a migration vira 503; o rótulo pt aparece na notificação.
- [x] Dashboard: o balde `reviewed`, e `totalPending` inclui Revisados.
- [x] HTTP: `PATCH /activity/:id/test-signal` com DTO inválido dá 400, sem token dá 401, empresa de que a pessoa não faz parte dá 403 (guard). A tarefa de outra empresa dá 404 (teste do serviço).

### Integração (PGlite)
- [x] Migration aplicada em cima do schema atual, duas vezes (idempotente). O Prisma gerado grava REVIEWED e o sinal. **Sem a migration**, o erro do Postgres em REVIEWED é reconhecido como "falta migração".

### Manuais / harness (front, Vite + API falsa)
- [x] Board com tarefa em cada coluna, inclusive Revisados, nos temas claro e escuro, em 1440 e 390 (1920 não exercitado), nos cenários esparso e cheio.
- [x] Bolinha: trocar, digitar o motivo, conferir o comentário enviado.
- [x] Dialog: abrir, J/K, menus internos acima do dialog, Expandir, Copiar link (URL esperada), Specs (copiar, baixar, ver), em 390px.
- [x] `/board`, Agrupar por pessoa e Lista com uma tarefa REVIEWED. O seletor de tarefa do Meu tempo não foi aberto no navegador: ele fica garantido pelo `Record<PickerStatus, ...>`, que agora exige REVIEWED na compilação.

## Arquivos Impactados

| Repo | Arquivo | Ação |
|---|---|---|
| api | `prisma/schema.prisma` | REVIEWED, `TestSignal`, `ActivityTestSignal` |
| api | `prisma/migrations/20261022120000_activity_reviewed_test_signal/migration.sql` | Criar |
| api | `src/activity-test-signal/*` (module, service, controller, dto, specs) | Criar |
| api | `src/activity/activity-status-label.ts` | Criar (rótulos pt) |
| api | `src/activity/activity.service.ts`, `activity-events.ts`, `activity.module.ts` | REVIEWED 503, limpar sinal, rótulos, payload do evento |
| api | `src/quarter/quarter.service.ts`, `quarter.module.ts` | Chave REVIEWED, roadmap, anexar sinal |
| api | `src/dashboard/dashboard.service.ts` | Balde reviewed, anexar sinal no workspace |
| api | `src/export/export.service.ts`, `src/copilot/agent.service.ts`, `src/common/front-links.ts` | Rótulo, enum, link |
| web | `src/features/tasks/task-meta.ts`, `activity-types.ts`, `src/plugins/tokens.ts`, `src/styles/xp.css` | Status, tipos, tokens |
| web | `TasksView.vue`, `useActivityPublish.ts`, `BoardView.vue`, `realtime-service.ts`, `activity-service.ts`, `roadmap-monthly-service.ts`, `TaskPicker.vue`, `TaskLanes.vue`, `TaskColumn.vue`, `KanbanBoard.vue`, `OverviewChart.vue`, `workspaceStores.ts` | REVIEWED (D13), colunas |
| web | `src/components/tasks/TaskCard.vue`, novo `TestSignalDot.vue` | Título, bolinha |
| web | `src/features/tasks/components/TaskDetailPanel.vue`, `TaskDocs.vue` | Dialog, Expandir, link, Specs |
| web | `src/features/tasks/ActivityResolverView.vue` | Link novo |

## Tasks Técnicas

- [x] **T1 (api):** schema + migration + `prisma generate`; migration validada em PGlite.
- [x] **T2 (api):** rótulos pt + payload de evento compartilhado; REVIEWED 503; board, roadmap, dashboard, export, copilot. *(depende de T1)*
- [x] **T3 (api):** módulo do sinal (service, controller, dto), limpeza no move e no status, anexo no board, no workspace e no `findOne`. *(depende de T1)*
- [x] **T4 (api):** testes Jest + suíte inteira + tsc + lint dos arquivos tocados. *(depende de T2, T3)*
- [x] **T5 (web):** status REVIEWED em tudo (D13), tokens, colunas a 220px, lanes dinâmicas, "Mover todas para Concluído". *(depende do contrato de T2)*
- [x] **T6 (web):** título do card (D8) + `TestSignalDot` com popover e comentário. *(depende de T3 e T5)*
- [x] **T7 (web):** dialog central (D9 a D12), `?company=` no TasksView, resolvedor. *(depende de T5)*
- [x] **T8:** harness Vite + API falsa, prints claro e escuro, esparso e cheio, 1440 e 390; `vue-tsc`; revisão do diff.

## Plano de Rollout

1. Deploy da API (push na main). Sem a migration: tudo funciona, só mover para Revisados e trocar o sinal respondem 503.
2. Aplicar a migration (`node scripts/run-prod-migration.mjs 20261022120000_activity_reviewed_test_signal`).
3. Deploy do front.

## Plano de Rollback

- **Front:** reverter o commit (a API nova serve o front antigo: chave e campo extras são ignorados, mas cards REVIEWED não aparecem no front antigo; devolver antes, pelo SQL abaixo).
- **API com migration aplicada:**
  ```sql
  UPDATE "Activity" SET "status" = 'IN_TESTING' WHERE "status" = 'REVIEWED';
  DROP TABLE IF EXISTS "ActivityTestSignal";
  DROP TYPE IF EXISTS "TestSignal";
  ```
  REVIEWED fica no enum; isso é inofensivo sem linhas usando.

## Observabilidade

- **Log:**
  - aviso uma vez por processo quando a tabela do sinal não existe;
  - erro com `activityId` quando a limpeza do sinal falha;
  - aviso quando REVIEWED é recusado por falta de migration.
- **Feed:** `test_signal` com "marcou X como Reprovado".

## Definition of Done

- [x] AC1 a AC10 e os observáveis conferidos, cada um com evidência (teste ou print).
- [x] Jest da API inteiro verde; `tsc` limpo; lint dos arquivos tocados limpo; `vue-tsc --build` limpo.
- [x] Prints claro e escuro, esparso e cheio.
- [x] Spec com Change Log atualizado; commit só com pedido explícito.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-10-22 | 0.1 | Criação a partir do pedido, das respostas do Nicolas e da pesquisa em três frentes (API, board e detalhe) | Claude |
| 2026-10-22 | 0.2 | T1 a T8 entregues e verificados; correções da revisão do diff (detalhe abaixo). Sem commit. | Claude |

### v0.2: entrega

**API (workflow-api).**
- Schema: `REVIEWED` entre `IN_TESTING` e `DONE`; enum `TestSignal`; tabela `ActivityTestSignal`.
- Migration `20261022120000_activity_reviewed_test_signal`: o DDL bate com o `prisma migrate diff`.
- Módulo `src/activity-test-signal/`: `PATCH /activity/:id/test-signal`, `withTestSignal`, `set`, `clear`.
- Rótulos em português (`activity-status-label.ts`): notificação, feed e PDF.
- Board do mês com uma chave por valor do enum, e roadmap tratando REVIEWED como "active".
- Dashboard com o balde `reviewed` (pendente, nunca concluída) e o sinal no `/board`.
- Copilot conhece REVIEWED.
- `activityLink` aponta para o board com o dialog.
- REVIEWED gravado antes da migration vira 503 no move, no status, no create e na rotina (create e update).
- Testes:
  - 42 novos, incluindo o HTTP da rota nova;
  - suíte inteira com 795 testes verdes;
  - tsc e lint limpos nos arquivos tocados (os 20 erros de lint do `agent.service.ts` e o import sem uso do dashboard já existiam na main).
- Integração: o código real (Prisma gerado, serviços) rodou contra Postgres embutido com o schema de antes, em 17 checagens.
  - **Sem a migration:** o erro real é `P2007` com a mensagem do banco, e o detector o reconhece. O board carrega e o sinal responde 503.
  - **Com a migration aplicada duas vezes:** ela é idempotente e o enum fica na ordem certa.
  - **Fluxo:** vermelho, notificação, sinal no board, 409 fora de Em teste e Revisados no board. O sinal some ao sair de Em teste, e o sinal velho é descartado ao voltar.

**Web (work-flow).**
- Status REVIEWED em toda parte (D13), derivado de `ACTIVITY_STATUSES`: TasksView, publish, BoardView, realtime, picker e roadmap.
- Tokens nos dois temas e no Modo XP.
- Colunas de 220px a 360px, lanes dinâmicas e "Mover todas para Concluído".
- Card com título 15/600 em 3 linhas, prefixo de área (`task-title.ts`), `TestSignalDot` e o "…" na linha de meta.
- Dialog central em duas colunas, com Expandir, Copiar link, subtarefa no mesmo dialog e criar subtarefa.
- Specs recolhidas, com Copiar, Baixar e Ver.
- `?company=` honrado e resolvedor `/activity/:id` levando ao board com o dialog.
- Gates: `vue-tsc`, eslint e oxlint limpos nos arquivos tocados (os 12 `any` do `activity-service.ts` já existiam); build de produção ok.

**Verificação (Vite + API falsa + Edge, harness `scratchpad/verify/verify-board.mjs` e `verify-fixes.mjs`):**
- Cenários: claro e escuro, cheio e esparso, 1440 e 390. Todos os ACs conferidos e prints olhados.
- Medidas em 1440 com a sidebar aberta: 5 colunas sem rolagem horizontal; dialog de 1120px centralizado; tela cheia de 1440x900.

**Desvios conscientes:**
1. **Onde fica o "…" do card.** Saiu do canto do título para a ponta da linha de meta, com 20px sempre reservados. A outra saída (reservar a largura no título) exigiria trocar o `line-clamp` por altura fixa e perder as reticências.
2. **"Abrir página completa" no "…" do dialog.** A página antiga tem ferramentas que o dialog ainda não tem: "Aprimorar com IA" e editar ou excluir subtarefa.
3. **Subtarefa aberta no dialog usa `replace`, e não `push`.** Fechar continua fechando, em vez de voltar à tarefa anterior.
4. **Sem a coluna da chave nas subtarefas do dialog.** A coluna da direita tem 340px; a chave continua no topo do dialog da subtarefa.

**Achados da revisão do diff (10), todos corrigidos e provados no navegador:**
1. Link de outra empresa com o board já montado: `companyId` do TasksView agora vem do store (reativo), e `?company=` é observado.
2. Esc no popover do sinal fechava o dialog junto: o guard do dialog ignora `.tsd-pop`, e o popover prende o foco.
3. As setas no seletor gravavam cada opção: viraram botões `role="radio"` em que as setas só movem o foco; clique, Enter ou Espaço gravam.
4. Sinal velho no dialog depois de trocar o status: trocar de coluna zera o sinal no cache, no card e no realtime (board e `/board`).
5. Sinal trocado no card não chegava ao estado do board: evento `signal`/`test-signal` até TasksView e BoardView; o dialog do `/board` ganhou `applyPatch`.
6. Criar subtarefa perdia o foco (J/K e Esc iam para o board): o campo fica `readonly` durante o POST e o foco volta a ele.
7. J/K com subtarefa aberta pulava para o primeiro card: o J/K parte do pai (`anchorTaskId`).
8. Copiar e Baixar das Specs podiam pegar texto velho e falhar no Safari: o `flush` é aguardado, a busca usa `staleTime: 0`, e o copiar usa `ClipboardItem` com Promise.
9. "Novo" com as Specs recolhidas não abria o editor: agora abre.
10. Rotina com REVIEWED antes da migration dava 500: virou 503, como o resto.

**Fica para depois (follow-ups):**
- Bolinha também na vista Lista e "Mover todas" no "Agrupar por pessoa": hoje só no board simples e no `/board`.
- Índice em `ActivityLog("activityId")`: o descarte de sinal velho e o histórico por tarefa leem por ele. Hoje é só um `groupBy` quando há sinal, então ficou fora desta migration de propósito (não mexer em tabela grande no mesmo passo).
- Filtro do copilot por REVIEWED antes da migration responde erro na ferramenta (só cliente de API chega aí).
- Levar "Aprimorar com IA" e editar ou excluir subtarefa para o dialog e aposentar a página antiga.
