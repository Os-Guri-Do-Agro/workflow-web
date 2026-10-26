# Spec: Teste por plataforma (Web, iOS, Android) no card de Em teste

**Status:** Em Implementação
**Autor:** Claude (Opus 5.5) a pedido do Nicolas
**Criado em:** 2026-10-26
**Última atualização:** 2026-10-26
**Versão:** 0.1
**Base:** [board-revisados-sinal-e-dialog.md](./board-revisados-sinal-e-dialog.md) (coluna Revisados e sinal do teste)

> Pedido do Nicolas (2026-10-26): *"na parte de Em teste, ser um tico mais e mais conteúdo, porque deve conter os campos testados Web, Apple e Android, com o ícone de todos. Quem testou em qual plataforma dá um check, e só vai para Revisados depois dos 3 marcados. Caso não tenha web, a pessoa marca mesmo assim para ir, mas precisa desses 3 campos. Algo bonitinho, com uma lib de ícones que tenha o logo do Android e da Apple, mais um de navegador para fechar."* Implementar, commitar e dar push estão liberados.

---

## Visão Geral

O card em **Em teste** ganha uma faixa com três botões, **Web**, **iOS** e **Android**, cada um com o ícone da plataforma. Quem testa marca a plataforma direto no card, e o sistema grava quem marcou e quando. A tarefa **só entra em Revisados com as três marcadas**: o board recusa a soltura e a API recusa o `move` e o `status`.

## Motivação

- Hoje "testado" é um estado só (a bolinha), sem dizer onde foi testado. App com web e mobile quebra em uma plataforma e passa nas outras.
- Revisados significa "aprovado, esperando subir". Sem o checklist, uma tarefa testada só no navegador chega a Revisados e sobe quebrada no celular.

---

## Research Findings

**Molde a seguir:** o sinal do teste (`workflow-api/src/activity-test-signal/`).
- Tabela à parte, lida em uma query só para os cards de Em teste (`withTestSignal`).
- Leitura nunca derruba o board: sem a tabela, sai `null`.
- Escrita sem a tabela responde 503 com mensagem clara.
- Apagado ao sair da coluna e descartado na leitura se ficou velho (`ActivityLog.changedAt`).

**API (`workflow-api/`):**
- O status só muda por `ActivityService.updateStatus` (`activity.service.ts:544`) e `ActivityService.move` (:600). `PATCH /activity/:id` não aceita status. A criação aceita status inicial (:136), e a rotina também (`initialStatus`).
- `ActivityService` recebe o serviço do sinal como `@Optional()` (:69) e o board do mês (`quarter.service.ts:159`) e o `/board` (`dashboard.service.ts:178`) anexam o sinal só em `IN_TESTING`.
- `findOne` (:181) anexa `testSignal` no detalhe.
- O deploy não aplica migration (`shared/prisma/schema-errors.ts`, cabeçalho). O `.env` aponta para produção.

**Front (`work-flow/`):**
- O card único é `components/tasks/TaskCard.vue`. A bolinha (`TestSignalDot.vue`) grava sozinha, otimista, e emite `changed`. O evento sobe por `KanbanBoard`/`TaskLanes` (`test-signal`) até `TasksView.onCardSignal` (:852) e, no `/board`, até `BoardView` (:626).
- Soltura no board do mês: `TasksView.handleMove` (:806). O `onAdd` do Sortable emite `move-task` **antes** do `onEnd`, e o `onEnd` ressincroniza as colunas pela prop (`KanbanBoard.vue:176-185`). Recusar de forma síncrona devolve o card à coluna de origem sem request.
- `/board`: `BoardView.updateTaskStatus` (:450), otimista com rollback e a mensagem da API no toast.
- Dialog: `saveStatus` (`TaskDetailPanel.vue:601`) → `useActivityDetail.runSave` (:134), que já desfaz e mostra a mensagem da API.
- `activity:updated` recarrega o board (`useActivityBoardRealtime.ts:80-85`): marcar plataforma propaga para outras abas sem código novo.
- **Ícones:** o projeto usa Lucide, que não tem logos de marca. O `@mdi/font` é legado em migração (proibido em código novo). Avaliados `simple-icons@16.36.0` (CC0, tem Android e Apple, **não tem navegador genérico**) e `@mdi/js@7.4.47` (Apache-2.0, `mdiWeb`, `mdiApple`, `mdiAndroid`, SVG por constante, tree-shakable).

**Breaking changes:**
- Payloads do board do mês, do `/board` e do detalhe ganham `testChecks`. Aditivo.
- **Regra nova:** mover para Revisados exige as três plataformas. Tarefas que hoje estão em Em teste precisam ser marcadas antes de seguir. Quem já está em Revisados ou Concluído não é afetado.

---

## Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Tabela nova `ActivityTestCheck`** (`activityId` FK cascade, `platform`, `checkedById` FK set null, `checkedAt`), PK `(activityId, platform)`. Enum `TestPlatform { WEB IOS ANDROID }`. Linha existe = plataforma testada. | Mesmo motivo do sinal: coluna em `Activity` quebraria toda leitura até a migration rodar. |
| D2 | **Sem "não se aplica".** As três são obrigatórias; sem web, a pessoa marca Web mesmo assim. | Palavra do dono. Uma opção a mais seria uma decisão a mais em todo card. |
| D3 | **Marcar só em Em teste.** `PATCH /activity/:id/test-check` `{ platform, checked }` responde 409 fora de Em teste, 404 de outra empresa e 503 sem a tabela. Devolve a lista inteira de checks válidos da tarefa. Marcar de novo atualiza autor e hora. | O checklist é do teste. Fora da coluna ele é registro, não controle. |
| D4 | **Os checks sobrevivem a Revisados e Concluído** e **somem quando a tarefa volta para A fazer ou Em andamento** (retrabalho: o teste antigo não vale para o código novo). A limpeza é best-effort, fora da transação. Na leitura, check mais velho que a última entrada em A fazer ou Em andamento é descartado. | Voltar de Revisados para Em teste não pode perder o teste feito. Corrigir e voltar precisa testar de novo. |
| D5 | **Bloqueio:** `move` e `updateStatus` recusam com **409** a entrada em REVIEWED vinda de outro status quando falta alguma plataforma. A mensagem diz quais: "Marque o teste em iOS e Android antes de mover para Revisados". Reordenar dentro de Revisados não passa pela regra. | Palavra do dono: "só vai para Revisados depois dos 3 marcados". |
| D6 | **Sem a tabela, o bloqueio fica desligado** (com aviso no log uma vez). | O deploy chega antes da migration: travar Revisados até alguém rodar a migration pararia o time. |
| D7 | **A criação direto em Revisados não é bloqueada** (status inicial na criação e na rotina). | Criar já em Revisados é registrar algo testado por fora; bloquear quebraria o "+" da coluna sem ganho real. O fluxo normal (arrastar) é o bloqueado. |
| D8 | **Leitura:** board do mês e `/board` anexam `testChecks` só aos cards de Em teste (uma query `IN (...)` mais um `groupBy` só quando há check). O detalhe anexa em qualquer status. `null` = recurso indisponível (sem a tabela): o front esconde o checklist e não bloqueia nada. `[]` = nada marcado. | Mesmo custo do sinal, e o front sabe distinguir "nada marcado" de "ainda não existe". |
| D9 | **Card (só Em teste, tarefa real):** faixa no rodapé, depois da linha de meta, separada por um fio de 1px `--border`. Três botões de 28px de altura (alvo de 44px por `::after`) com ícone de 14px e nome. **Marcado:** fundo verde suave (`--test-check-on-bg`), texto forte e um selo de check. **Sem marcar:** contorno neutro e texto apagado. Em card estreito (< 232px) os nomes somem e ficam só os ícones. Tooltip e `aria-label`: "Android: testado por Letícia, há 2 h. Clique para desmarcar". O clique não abre a tarefa nem arrasta (`no-drag`). | O teste é feito sem abrir a tarefa, como a bolinha. Cor nunca é o único canal: o selo e o texto mudam junto. |
| D10 | **Dialog:** linha "Testes" logo abaixo do "Sinal do teste", com uma linha por plataforma: ícone, nome, e quem testou (avatar, primeiro nome e "há 2 h") ou "Não testado". Abaixo, "Revisados só com as 3 marcadas" ou "Pronto para Revisados". Editável em Em teste. Em Revisados e Concluído aparece só se houver check, somente leitura. | O "quem testou em qual plataforma" mora no dialog; o card só mostra o estado. |
| D11 | **Bloqueio também no front**, com a mesma mensagem: soltar em Revisados um card de Em teste com plataforma faltando devolve o card na hora, sem request (board do mês, agrupado por pessoa, "Mover para" do card, `/board` e dialog). Vindo de outra coluna, quem decide é a API (409, o card volta e o toast mostra a mensagem). | Resposta imediata no caso comum; a API continua sendo a regra. |
| D12 | **Ícones de `@mdi/js`** (`mdiWeb`, `mdiApple`, `mdiAndroid`), desenhados num `<svg>` próprio (`PlatformIcon.vue`). Só esses três são importados. Não é o `@mdi/font`: nada de classe `mdi-*`. | Uma família só para os três, com o mesmo peso visual. O `simple-icons` não tem navegador genérico, e misturar com o `Globe` do Lucide (traço) daria dois estilos lado a lado. |

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | Tarefas paradas em Em teste no dia da migration não sobem mais para Revisados sem marcar. | É a regra pedida. O toast diz exatamente o que falta, e marcar é um clique no próprio card. |
| Médio | Limpeza dos checks falha ao voltar para Em andamento, e o teste velho libera Revisados. | D4: a leitura descarta check mais velho que a última entrada em A fazer ou Em andamento (o mesmo `ActivityLog` do sinal). O bloqueio usa essa mesma leitura. |
| Médio | Dois cliques rápidos em plataformas diferentes chegam fora de ordem e um apaga o outro na tela. | O componente trava os três botões enquanto uma gravação está no ar. A resposta é a lista inteira, e a dos dados que chegam depois (refetch, realtime) vence. |
| Médio | O card de Em teste cresce e o board fica mais alto. | Só Em teste muda; 37px a mais por card. Em card estreito os nomes somem antes de quebrar linha. |
| Baixo | Erro de banco qualquer na leitura do bloqueio. | O bloqueio só desliga com a tabela ausente; qualquer outro erro sobe (500), porque liberar Revisados por engano é pior do que falhar a soltura. |

## Requisitos Não-Funcionais

- **Acessibilidade:** cada botão é `aria-pressed`, com nome acessível completo. Alvo de 44px. Foco visível. O grupo tem `aria-label` "Testes por plataforma: 2 de 3".
- **Performance:** uma query `IN (...)` para os cards de Em teste do board, e um `groupBy` no `ActivityLog` só quando há check.
- **Temas:** claro, escuro e Modo XP (tokens novos nos três).
- **Copy:** pt-BR, sem em-dash.

## Acceptance Criteria

### Comportamentais
- [ ] **AC1. Given** um card em Em teste **Then** ele mostra Web, iOS e Android sem marcar. **When** clico em Android **Then** ele fica marcado sem abrir a tarefa, persiste no reload e o dialog mostra "Android, Nicolas, agora".
- [ ] **AC2. Given** Web e iOS marcados e Android não **When** arrasto o card para Revisados **Then** ele volta para Em teste, nenhuma request de move sai, e o toast diz "Marque o teste em Android antes de mover para Revisados".
- [ ] **AC3. Given** as três marcadas **When** arrasto para Revisados **Then** ele fica em Revisados.
- [ ] **AC4. Given** um card em Em andamento **When** chamo o `move` para REVIEWED **Then** a API responde 409 com as três plataformas na mensagem.
- [ ] **AC5. Given** uma tarefa com as três marcadas **When** ela vai para Em andamento e volta para Em teste **Then** as três estão desmarcadas. **When** vai para Revisados e volta para Em teste **Then** as três continuam marcadas.
- [ ] **AC6. Given** a API nova sem a migration **Then** o board carrega, o card de Em teste não mostra o checklist, mover para Revisados funciona como antes, e `PATCH /activity/:id/test-check` responde 503.
- [ ] **AC7. Given** o dialog de uma tarefa em Em teste **Then** a linha "Testes" mostra as três plataformas com quem testou, e marcar ali muda o card do board na hora.

### Observáveis
- [ ] `GET /month/:id/board`: cada tarefa de Em teste traz `testChecks` (`[]` ou a lista `{ platform, checkedBy, checkedAt }` na ordem Web, iOS, Android); as outras, `null`.
- [ ] Nenhum hex novo em componente, nenhum em-dash na copy, nenhum `mdi-*` de fonte.

## Estratégia de Testes

### Unitários (API, Jest)
- [ ] `ActivityTestCheckService`:
  - `checksFor` sem N+1, na ordem das plataformas, descartando o check mais velho que a última entrada em A fazer ou Em andamento, e degradando sem a tabela (`null` mais um aviso);
  - `set` recusa fora de Em teste (409), de outra empresa (404) e sem a tabela (503); faz upsert e delete e emite realtime;
  - `missingFor` devolve `null` sem a tabela e propaga outro erro;
  - `clear` nunca lança.
- [ ] `ActivityService`:
  - `move` e `updateStatus` para REVIEWED com plataforma faltando: 409 com os nomes;
  - com as três: passa;
  - sem a tabela: passa;
  - reordenar dentro de Revisados não consulta;
  - voltar para A fazer ou Em andamento limpa.
- [ ] HTTP: DTO inválido 400, sem token 401.

### Integração (PGlite)
- [ ] Migration aplicada duas vezes sobre o schema atual (idempotente), e o Prisma gerado grava e lê `ActivityTestCheck`.

### Harness (front, Vite + API falsa + Edge)
- [ ] Card com o checklist em claro e escuro, em 1440 e 390. Marcar e desmarcar (request certo). AC2 e AC3 no arraste. Dialog com quem testou. O `/board` com o mesmo card.

## Arquivos Impactados

| Repo | Arquivo | Ação |
|---|---|---|
| api | `prisma/schema.prisma` | `TestPlatform`, `ActivityTestCheck`, relações |
| api | `prisma/migrations/20261026120000_activity_test_check/migration.sql` | Criar |
| api | `src/activity-test-signal/activity-test-check.service.ts` (+ spec), `dto/set-test-check.dto.ts`, controller, constants, module | Criar / alterar |
| api | `src/activity/activity.service.ts` | Bloqueio de Revisados, limpeza, `testChecks` no detalhe |
| api | `src/quarter/quarter.service.ts`, `src/dashboard/dashboard.service.ts` | Anexar `testChecks` |
| web | `package.json` | `@mdi/js` |
| web | `src/features/tasks/activity-types.ts`, novo `test-platforms.ts` | Tipos, rótulos, regra do bloqueio |
| web | novo `components/tasks/PlatformIcon.vue`, novo `components/tasks/TestPlatformChecks.vue` | Ícones e checklist |
| web | `TaskCard.vue`, `KanbanBoard.vue`, `TaskLanes.vue`, `TasksView.vue`, `BoardView.vue`, `workspaceStores.ts`, `TaskDetailPanel.vue`, `activity-service.ts` | Checklist, eventos, bloqueio |
| web | `src/plugins/tokens.ts`, `src/styles/xp.css` | `--test-check-*` |

## Tasks Técnicas

- [ ] **T1 (api):** schema, migration, `prisma generate`, PGlite.
- [ ] **T2 (api):** `ActivityTestCheckService`, rota, anexo no board, no `/board` e no detalhe. *(depende de T1)*
- [ ] **T3 (api):** bloqueio e limpeza no `move` e no `updateStatus`. *(depende de T2)*
- [ ] **T4 (api):** Jest, suíte inteira, tsc, lint dos arquivos tocados.
- [ ] **T5 (web):** tipos, `test-platforms.ts`, `@mdi/js`, `PlatformIcon`, tokens.
- [ ] **T6 (web):** `TestPlatformChecks` no card e no dialog, eventos até o estado do board. *(depende de T5)*
- [ ] **T7 (web):** bloqueio no front (D11). *(depende de T5)*
- [ ] **T8:** harness, prints, `vue-tsc`, lint, build, revisão do diff, commit e push nos dois repos.

## Plano de Rollout

1. Push da API e do front (qualquer ordem: sem a tabela, o front esconde o checklist e não bloqueia).
2. Aplicar a migration: `node scripts/run-prod-migration.mjs 20261026120000_activity_test_check` e depois `npx prisma migrate resolve --applied 20261026120000_activity_test_check`.
3. A partir daí o checklist aparece e o bloqueio vale.

## Plano de Rollback

- **Front:** reverter o commit.
- **API:** reverter o commit. Com a migration aplicada, a tabela fica sem uso (inofensiva). Para apagar:
  ```sql
  DROP TABLE IF EXISTS "ActivityTestCheck";
  DROP TYPE IF EXISTS "TestPlatform";
  DELETE FROM "_prisma_migrations" WHERE migration_name = '20261026120000_activity_test_check';
  ```

## Observabilidade

- Aviso uma vez por processo quando a tabela não existe (checklist e bloqueio desligados).
- Erro com `activityId` quando a limpeza falha.
- Log `info` do 409 do bloqueio com a tarefa e as plataformas que faltam.

## Definition of Done

- [ ] AC1 a AC7 e os observáveis conferidos, cada um com evidência (teste ou print).
- [ ] Jest inteiro verde; `tsc` limpo; lint dos arquivos tocados limpo; `vue-tsc --build` limpo; build do front ok.
- [ ] Prints claro e escuro.
- [ ] Commit e push nos dois repos (autorizados pelo Nicolas neste pedido).

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-10-26 | 0.1 | Criação a partir do pedido e da pesquisa na API e no board. Implementação autorizada no próprio pedido. | Claude |
