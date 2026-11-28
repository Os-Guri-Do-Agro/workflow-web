# Spec: Teste por plataforma (Web, iOS, Android) no card de Em teste

**Status:** Concluído (código na main; falta aplicar a migration `20261026120000_activity_test_check` em produção)
**Autor:** Claude (Opus 5.5) a pedido do Nicolas
**Criado em:** 2026-10-26
**Última atualização:** 2026-10-26
**Versão:** 0.2
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
| D5 | **Bloqueio:** `move` e `updateStatus` recusam com **409** a entrada em REVIEWED vinda de outro status quando falta alguma plataforma. A mensagem diz quais: "Marque o teste em iOS e Android antes de mover para Revisados". Reordenar dentro de Revisados não passa pela regra.<br>**Duas conferências.** A rápida, fora da transação, recusa na hora e descobre se a tabela existe. A segunda roda dentro da transação que grava, com a linha da tarefa travada (`SELECT ... FOR UPDATE`). O `set` do checklist trava a mesma linha, então desmarcar e mover ao mesmo tempo não se cruzam. | Palavra do dono: "só vai para Revisados depois dos 3 marcados". A segunda conferência fecha a corrida apontada na revisão. |
| D6 | **Sem a tabela, o bloqueio fica desligado** (com aviso no log uma vez). | O deploy chega antes da migration: travar Revisados até alguém rodar a migration pararia o time. |
| D7 | **A criação direto em Revisados não é bloqueada** (status inicial na criação e na rotina). | Criar já em Revisados é registrar algo testado por fora; bloquear quebraria o "+" da coluna sem ganho real. O fluxo normal (arrastar) é o bloqueado. |
| D8 | **Leitura:**<br>• Board do mês e `/board` anexam `testChecks` (os checks VÁLIDOS) a toda tarefa real, em qualquer coluna, com uma query `IN (...)` mais um `groupBy` só quando há check. Assim o card que entra em Em teste depois (arraste, realtime, dialog) já traz o checklist.<br>• O detalhe anexa em qualquer status.<br>• `null` = recurso indisponível (sem a tabela, ou card virtual `rec:`): o front esconde o checklist e não bloqueia nada.<br>• `[]` = nada marcado. | Mesmo custo do sinal, e o front sabe distinguir "nada marcado" de "ainda não existe". A primeira versão anexava só em Em teste, e o card que entrava depois ficava sem checklist até um refetch (revisão). |
| D9 | **Card (só Em teste, tarefa real):** faixa no rodapé, depois da linha de meta, separada por um fio de 1px `--border`.<br>• **Botões:** três, de 28px de altura (alvo de 44px por `::after`), em flex proporcional ao conteúdo, com ícone de 14px, nome e marca.<br>• **Marcado:** fundo verde suave (`--test-check-on-bg`), texto forte e a marca vira check.<br>• **Sem marcar:** contorno neutro, texto apagado e a marca é um círculo vazio.<br>• **Card estreito:** abaixo de 224px os nomes somem e ficam ícone e marca (é o caso das 5 colunas em 1440 com a barra lateral).<br>• **Tooltip e `aria-label`:** "Android: testado por Letícia Porfírio, há 2 h. Clique para desmarcar".<br>• O clique não abre a tarefa nem arrasta (`no-drag`). | O teste é feito sem abrir a tarefa, como a bolinha. Cor nunca é o único canal: a marca muda de forma. |
| D10 | **Dialog:** linha "Testes" logo abaixo do "Sinal do teste", com uma linha por plataforma.<br>• **Conteúdo:** ícone, nome e quem testou (avatar e primeiro nome) ou "Não testado".<br>• **O "quando":** fica no tooltip e no nome acessível, porque a coluna de propriedades tem uns 200px.<br>• **Dica abaixo:** "Falta testar em Android" ou "Pronto para Revisados".<br>• Editável em Em teste. Em Revisados e Concluído aparece só se houver check, somente leitura. | O "quem testou em qual plataforma" mora no dialog; o card só mostra o estado. |
| D11 | **Bloqueio também no front**, com a mesma mensagem: soltar em Revisados um card de Em teste com plataforma faltando devolve o card na hora, sem request. Vale no board do mês, no agrupado por pessoa, no "Mover para" do card, no `/board`, no dialog e na massa da Lista (as barradas continuam selecionadas). Vindo de outra coluna, quem decide é a API: 409, o card volta e o toast mostra a mensagem. | Resposta imediata no caso comum; a API continua sendo a regra. |
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
- [x] **AC1. Given** um card em Em teste **Then** ele mostra Web, iOS e Android sem marcar. **When** clico em Android **Then** ele fica marcado sem abrir a tarefa, persiste no reload e o dialog mostra "Android, Nicolas, agora".
- [x] **AC2. Given** Web e iOS marcados e Android não **When** arrasto o card para Revisados **Then** ele volta para Em teste, nenhuma request de move sai, e o toast diz "Marque o teste em Android antes de mover para Revisados".
- [x] **AC3. Given** as três marcadas **When** arrasto para Revisados **Then** ele fica em Revisados.
- [x] **AC4. Given** um card em Em andamento **When** chamo o `move` para REVIEWED **Then** a API responde 409 com as três plataformas na mensagem.
- [x] **AC5. Given** uma tarefa com as três marcadas **When** ela vai para Em andamento e volta para Em teste **Then** as três estão desmarcadas. **When** vai para Revisados e volta para Em teste **Then** as três continuam marcadas.
- [x] **AC6. Given** a API nova sem a migration **Then** o board carrega, o card de Em teste não mostra o checklist, mover para Revisados funciona como antes, e `PATCH /activity/:id/test-check` responde 503.
- [x] **AC7. Given** o dialog de uma tarefa em Em teste **Then** a linha "Testes" mostra as três plataformas com quem testou, e marcar ali muda o card do board na hora.

### Observáveis
- [x] `GET /month/:id/board`: cada tarefa real traz `testChecks` (`[]` ou a lista `{ platform, checkedBy, checkedAt }` na ordem Web, iOS, Android); `null` só no card virtual e sem a tabela.
- [x] Nenhum hex novo em componente, nenhum em-dash na copy, nenhum `mdi-*` de fonte.

## Estratégia de Testes

### Unitários (API, Jest)
- [x] `ActivityTestCheckService`:
  - `checksFor` sem N+1, na ordem das plataformas, descartando o check mais velho que a última entrada em A fazer ou Em andamento, e degradando sem a tabela (`null` mais um aviso);
  - `set` recusa fora de Em teste (409), de outra empresa (404) e sem a tabela (503); faz upsert e delete e emite realtime;
  - `missingFor` devolve `null` sem a tabela e propaga outro erro;
  - `clear` nunca lança.
- [x] `ActivityService`:
  - `move` e `updateStatus` para REVIEWED com plataforma faltando: 409 com os nomes;
  - com as três: passa;
  - sem a tabela: passa;
  - reordenar dentro de Revisados não consulta;
  - voltar para A fazer ou Em andamento limpa.
- [x] HTTP: DTO inválido 400, sem token 401.

### Integração (PGlite)
- [x] Migration aplicada duas vezes sobre o schema atual (idempotente), e o Prisma gerado grava e lê `ActivityTestCheck`.

### Harness (front, Vite + API falsa + Edge)
- [x] Card com o checklist em claro e escuro, em 1440 e 390. Marcar e desmarcar (request certo). AC2 e AC3 no arraste. Dialog com quem testou. O `/board` com o mesmo card.

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

- [x] **T1 (api):** schema, migration, `prisma generate`, PGlite.
- [x] **T2 (api):** `ActivityTestCheckService`, rota, anexo no board, no `/board` e no detalhe. *(depende de T1)*
- [x] **T3 (api):** bloqueio e limpeza no `move` e no `updateStatus`. *(depende de T2)*
- [x] **T4 (api):** Jest, suíte inteira, tsc, lint dos arquivos tocados.
- [x] **T5 (web):** tipos, `test-platforms.ts`, `@mdi/js`, `PlatformIcon`, tokens.
- [x] **T6 (web):** `TestPlatformChecks` no card e no dialog, eventos até o estado do board. *(depende de T5)*
- [x] **T7 (web):** bloqueio no front (D11). *(depende de T5)*
- [x] **T8:** harness, prints, `vue-tsc`, lint, build, revisão do diff, commit e push nos dois repos.

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

- [x] AC1 a AC7 e os observáveis conferidos, cada um com evidência (teste ou print).
- [x] Jest inteiro verde; `tsc` limpo; lint dos arquivos tocados limpo; `vue-tsc --build` limpo; build do front ok.
- [x] Prints claro e escuro.
- [x] Commit e push nos dois repos (autorizados pelo Nicolas neste pedido).

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-10-26 | 0.1 | Criação a partir do pedido e da pesquisa na API e no board. Implementação autorizada no próprio pedido. | Claude |
| 2026-10-26 | 0.2 | Entrega (o Nicolas commitou a primeira versão: API `a05c641`, web `dc115a7`), revisão independente do diff e as correções dela num segundo commit. Detalhe abaixo. | Claude |

### v0.2: entrega e revisão

**Verificação.**
- **API:**
  - Jest inteiro: 832 passando. As 11 falhas são do OCR (`pdf-text`, `page-selector`, `ocr.service`) e são as mesmas na main.
  - `tsc` e eslint limpos nos arquivos tocados (o import sem uso do `dashboard.service.ts`, que vinha da main, saiu).
- **Integração com o código real contra Postgres embutido (PGlite), 26 checagens:**
  - **Sem a migration:** board carrega, o checklist some, Revisados funciona como antes e marcar dá 503.
  - **Migration:** idempotente.
  - **Bloqueio de ponta a ponta:** inclusive a corrida simulada (desmarcar entre a conferência e a escrita: 409 pela transação com a linha travada).
  - **Registro e limpeza:** registro em Revisados, limpeza no retrabalho e descarte de check velho.
- **Front:**
  - `vue-tsc`, eslint e oxlint limpos; build ok. Do `@mdi/js` só os três ícones entram no bundle.
  - Os 12 `any` do `activity-service.ts` já existiam.
- **Harness no navegador (Vite + API falsa + Edge), 32 checagens:** claro e escuro em 1440, claro em 1920, e prints em 390. Cobre:
  - o card e o bloqueio no arraste, no "Mover para", no dialog e no `/board`;
  - o 409 vindo de outra coluna;
  - o retrabalho;
  - o dialog com quem testou;
  - o cache do dialog;
  - o formulário em Revisados;
  - o modo sem a migration.

**Achados da revisão independente, todos corrigidos e provados:**
1. **Formulário completo criando já em Revisados levava 409.** Ele criava em A fazer e movia. Agora o `POST` leva o `status`, e o move que sobra só ordena na mesma coluna.
2. **`testChecks: null` fora de Em teste não se recuperava.** O card que entrava em Em teste (arraste no `/board`, realtime, dialog) ficava sem checklist e sem bloqueio até um refetch. Agora a leitura anexa os checks válidos a toda tarefa real (D8).
3. **Corrida no servidor:** desmarcar e mover ao mesmo tempo deixava entrar em Revisados faltando plataforma, e marcar junto de uma volta para retrabalho ressuscitava check. Agora há segunda conferência na transação, com `FOR UPDATE`, e o `set` roda em transação com a mesma trava (D5).
4. **Cache do dialog desatualizado** depois de marcar no card, ou com o dialog fechado antes da resposta. O próprio componente passou a acertar o cache `['activity', id]`.

**Desvios conscientes:**
1. O "quando" saiu da linha do dialog (fica no tooltip e no nome acessível): a coluna de propriedades tem uns 200px e cortava o nome.
2. O `TaskLanes` passou a ressincronizar no fim do arraste, como o `KanbanBoard`: sem isso, a soltura recusada deixava o card na coluna errada no agrupado por pessoa.
3. O `container-type` do dialog precisou de `width: 100%`: sem largura explícita ele media 0px dentro do `<dd>`.

**Fica para depois (follow-ups):**
- **Dialog aberto enquanto um colega marca:** fica com o dado velho até o foco da janela. O realtime não invalida `['activity', id]`; o sinal do teste tem a mesma limitação.
- **"Quando" congelado:** o tooltip ("há 2 h") não se atualiza sozinho com o dialog parado. Também é igual no sinal.
- **Lista:** a vista Lista não mostra o checklist (só aplica a regra na massa), como a bolinha.
- **Bloqueio na criação:** criar já em Revisados não passa pelo bloqueio (D7).
