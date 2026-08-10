# Spec: Períodos do Time Tracking (mês navegável + lifetime)

**Status:** Concluído
**Autor:** Nicolas (via Claude)
**Criado em:** 2026-08-09
**Concluído em:** 2026-08-09
**Última atualização:** 2026-08-09
**Versão:** 1.0

---

## Visão Geral

> Trocar os filtros de período do `/time` (Hoje / 7 dias / 30 dias) por **Hoje ·
> Mês navegável · Tudo**, nas duas abas (Meu tempo e Equipe), e passar os totais
> e o ritmo a serem calculados no **servidor** em vez de derivados da página de
> 50 entradas que a lista carregou.

## Motivação / Contexto de Negócio

"Últimos 30 dias" é uma janela deslizante: o número muda todo dia e não fecha com
nada. Ninguém fatura, presta conta ou compara desempenho em janela deslizante,
faz isso **por mês**. Hoje não dá para responder "quanto eu registrei em julho?"
sem sair da tela.

O segundo motivo é de correção, e só aparece quando o período cresce: a aba Meu
tempo calcula "Período", "faturável", média por dia, melhor dia e todos os
insights do rail **somando as entradas que a lista carregou**, que hoje são 50
por página ([TimeTrackingView.vue:220-226](../../../../src/features/time/TimeTrackingView.vue#L220-L226)
lendo `visibleEntries`, alimentado por `take: limit.value` com `PAGE_SIZE = 50`).
Em 7 dias, 50 entradas costumam cobrir o período e o número sai certo por acaso.
Em um mês, ou em "Tudo", o total exibido fica **silenciosamente menor que o
real** até o usuário clicar "carregar mais" o suficiente. Introduzir mês e
lifetime sem corrigir isso é entregar um relatório que mente.

---

## Research Findings

**Stack:** Vue 3.5 + Vue Query + Pinia; backend NestJS + Prisma (repo irmão
`workflow-api`). Sem mudança de stack.

**Padrões a seguir:**
- Tokens do design system, lucide, `AppSelect` (nada de `v-select` novo) conforme
  [src/CLAUDE.md](../../../../src/CLAUDE.md).
- Composable por feature em `features/time/composables/`, igual a
  [useTeamTime.ts](../../../../src/features/time/composables/useTeamTime.ts).
- Preferência de UI persistida via `localStorage` com chave namespaced
  (`ui.*` no `uiStore`; aqui usamos `time.period` por ser estado de tela, não
  preferência global de tema).
- Query key derivada do filtro reativo, como em `useTimeEntries`/`useTimeSummary`
  ([useTimeTracking.ts:176-201](../../../../src/composables/useTimeTracking.ts#L176-L201)).

**Referências no código:**
- [TimeTrackingView.vue:130-149](../../../../src/features/time/TimeTrackingView.vue#L130-L149) — `type Preset = 'today' | '7d' | '30d'` e `rangeFor()`: a origem do range na aba individual.
- [TimeTrackingView.vue:220-314](../../../../src/features/time/TimeTrackingView.vue#L220-L314) — todos os agregados (`rangeTotalSec`, `avgPerDaySec`, `last7Days`, `bestDay`, `streakDays`, `byProject`, `byTask`, `longestSessionSec`) derivam de `visibleEntries`, ou seja, da página carregada.
- [TeamView.vue:22-46](../../../../src/features/time/components/TeamView.vue#L22-L46) — o mesmo preset triplicado, com `range` próprio.
- [useTeamTime.ts:75-84](../../../../src/features/time/composables/useTeamTime.ts#L75-L84) e [:169-187](../../../../src/features/time/composables/useTeamTime.ts#L169-L187) — `last7Range()` fixo do gráfico de ritmo da equipe, com o comentário explicando que ele reaproveita a query quando o preset é "7 dias" (esse reaproveitamento deixa de existir e é intencional).
- [useTimeTracking.ts:189-201](../../../../src/composables/useTimeTracking.ts#L189-L201) — `useTimeSummary` **já existe e nenhum componente usa**. É o agregado do servidor que resolve o total truncado.
- [time-service.ts:59-80](../../../../src/service/time/time-service.ts#L59-L80) — `TimeSummary` traz `totalSec`, `billableSec`, `byDay[]` e `byCompany[]` (com `companyId: null` para o tempo pessoal); `ReportFilters.from/to` são **opcionais**.
- `workflow-api/src/time-tracking/time-tracking.service.ts:767-776` — `rangeFilter(from, to)` retorna `undefined` quando ambos faltam, ou seja, **lifetime já é suportado pela API**: basta não enviar `from`/`to`. Nenhuma mudança de backend é necessária para esta spec.
- `workflow-api/src/time-tracking/time-tracking.service.ts:338-389` (`summary`) e `:396-...` (`companyReport`) — agregam com `findMany` + laço em JS, sem `groupBy` e sem teto de linhas. É o que torna "Tudo" um risco de performance (ver Riscos).

**Breaking Changes:**
- `useTeamTime(range, scope)` passa a aceitar `Ref<{ from?: string; to?: string }>`
  em vez de `Ref<{ from: string; to: string }>`. Consumidor único: `TeamView.vue`.
- O tipo `Preset` some das duas telas, substituído por `TimePeriod`. Nenhum outro
  arquivo importa esses tipos (são locais de cada componente).
- Nenhuma mudança de contrato de API, nenhuma migration.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Médio | A paginação da lista só cresce o `take`, e o backend teto em 200. Passando disso a lista parava de crescer e `hasMore` virava falso: o botão sumia, a nota de amostra sumia junto, e 200 entradas passavam por período completo. Achado no `/code-review`, não na spec. | `MAX_TAKE = 200` no cliente; `hasMore` só enquanto `limit < MAX_TAKE`; e a nota de base passa a considerar também o teto (`loadedIsCapped`), então ela permanece exatamente no caso em que o número é parcial. Ver Follow-up para a paginação real por `skip`. |
| Médio | "Tudo" faz `/time/summary` e `/time/company-report` carregarem **todas** as entradas do usuário/empresa em memória no backend (findMany sem teto, agregação em JS). Cresce linearmente com o histórico. | `staleTime` de 5 min nas queries de período `all` (contra 15s dos demais), para o modo raro não virar tráfego repetido; o modo não é o padrão (padrão = mês corrente); e fica registrado o follow-up de trocar a agregação por `groupBy` no Prisma. Volume atual é de semanas de uso, não de anos. |
| Médio | O rail de insights continua com dois itens que só existem no nível de entrada ("Top tarefas" e "sessão mais longa") e seguirão derivados da página carregada, agora sob períodos muito maiores. Número calado e errado é pior que número ausente. | Esses dois cards passam a declarar a base: rótulo "nas N entradas carregadas" sempre que a lista estiver truncada (`hasMore === true`). Follow-up com solução de raiz (campo `byActivity` no `/time/summary`) registrado abaixo. |
| Baixo | 31 barras no gráfico de ritmo dentro de um rail de 340px podem virar borrão ilegível. | `MiniBars` ganha modo denso: gap menor, e rótulo só nos múltiplos de 5 mais o último dia; `title` por barra mantém o valor acessível no hover. |
| Baixo | Fuso: "agosto" começa 01/08 00:00 **local**, e o backend agrupa `byDay` por `tzOffset` recebido. Range montado em UTC mostraria tempo do dia 31/07 dentro de agosto. | O range do mês é construído com `new Date(ano, mes, 1, 0,0,0)` (local) e enviado em ISO; `tzOffset` continua sendo enviado como já é hoje em `useTimeSummary`/`companyReport`. AC cobre a borda de virada de mês. |

---

## Requisitos Não-Funcionais

- **Performance:** trocar de período dispara no máximo 2 requisições por aba
  (entradas + summary na aba Meu tempo; live + report por empresa na Equipe).
  Navegar para o mês anterior e voltar deve servir do cache do Vue Query, sem
  novo request dentro do `staleTime`.
- **Acessibilidade:** o seletor de período é um `role="group"` com `aria-label`;
  as setas de mês têm `aria-label` explícito ("Mês anterior" / "Próximo mês") e
  a seta de avanço fica `disabled` no mês corrente; alvo de toque ≥ 32px de
  altura, coerente com os chips atuais.
- **Compatibilidade:** funciona com o backend em produção **sem deploy da API**
  (lifetime usa a ausência de `from`/`to`, já suportada).

---

## User Stories

- Como **pessoa que registra tempo**, quero filtrar por **mês** e navegar para
  meses anteriores, para fechar o mês e comparar com o anterior.
- Como **pessoa que registra tempo**, quero ver o total **de todo o meu
  histórico**, para saber quanto já dediquei ao longo do tempo.
- Como **membro da equipe**, quero o mesmo recorte mensal no ranking, para o
  placar do mês não mudar de base todo dia.
- Como **qualquer usuário**, quero que o total do período seja o total real do
  período, e não a soma do que a lista carregou.

---

## Acceptance Criteria

### Comportamentais

- [x] **Given** a aba "Meu tempo" recém-aberta sem preferência salva **When** a tela carrega **Then** o período selecionado é o **mês corrente**, com o rótulo no formato "Agosto 2026".
- [x] **Given** o período "Mês" em agosto/2026 **When** clico na seta esquerda **Then** o rótulo passa a "Julho 2026" e a lista, os totais e o ritmo recarregam para 01/07 00:00 até 31/07 23:59:59 (horário local).
- [x] **Given** o período no mês corrente **When** olho a seta direita **Then** ela está desabilitada (`disabled` + `aria-disabled`), porque não há tempo registrado no futuro.
- [x] **Given** um mês anterior selecionado **When** clico na seta direita até voltar ao mês corrente **Then** a seta direita fica desabilitada novamente.
- [x] **Given** o período "Hoje" ou "Tudo" **When** clico numa das setas **Then** entro no modo mês no mês exibido, sem pular um mês no primeiro clique.
- [x] **Given** o período "Tudo" **When** a tela carrega **Then** nenhuma query envia `from` ou `to`, e o total exibido é o histórico completo do usuário.
- [x] **Given** o período "Hoje" **When** a tela carrega **Then** o range é 00:00:00 até 23:59:59 do dia local corrente, e o bloco de total "Hoje" não aparece duplicado ao lado do total do período.
- [x] **Given** eu escolhi "Tudo" e recarreguei a página **When** a tela volta **Then** o período continua "Tudo" (persistido em `localStorage`), e se o período era "Mês", volta no **mês corrente**, não no mês que eu estava navegando.
- [x] **Given** o modo escolhido numa aba **When** abro a outra aba **Then** ela mantém o próprio modo (chaves `time.period.me` e `time.period.team` são independentes).
- [x] **Given** um mês com mais de 50 entradas e o filtro de empresa em "Todas" **When** o mês é selecionado **Then** o total do período mostra o total do mês inteiro (vindo de `/time/summary`), mesmo com a lista exibindo só as 50 primeiras entradas.
- [x] **Given** a aba "Equipe" **When** troco o período **Then** o ranking, o pódio e o rail de equipe recalculam para o mesmo range, e o seletor de escopo (Grupo/empresa) permanece como estava.
- [x] **Given** o período "Mês" **When** olho o card de ritmo do rail **Then** o card se chama "Ritmo (Agosto)" e tem uma barra por dia do mês, com a barra de hoje destacada apenas quando o mês exibido é o corrente.
- [x] **Given** o período "Tudo" **When** olho o card de ritmo **Then** o card se chama "Ritmo (por mês)" e tem uma barra por mês com registro, em ordem cronológica.
- [x] **Given** a lista truncada (botão "Carregar mais" visível) **When** olho os cards "Top tarefas" e "sessão mais longa" **Then** cada um exibe a nota "nas N entradas carregadas".

### Observáveis

- [x] Nenhuma ocorrência de `'7d'` ou `'30d'` resta em `src/features/time/`.
- [x] `useTimeSummary` passa a ter ao menos um consumidor real (`TimeTrackingView.vue`).
- [x] O composable `useTimePeriod` é a única fonte de range das duas abas (nenhum `rangeFor`/`last7Range` local sobrevive).
- [x] Queries com período `all` usam `staleTime` de 5 minutos; as demais mantêm 15 segundos.
- [x] `npm run type-check` sem erros novos.

---

## Estratégia de Testes

O repo não tem runner de teste de unidade no front (não há `vitest` configurado
em `package.json`), então a verificação é por typecheck + exercício real da tela
via CDP, que é o padrão já usado neste projeto. Não vou introduzir infra de teste
nova dentro desta spec.

### Manuais (happy path, via CDP com API mockada)
- [ ] Abrir `/time` com dados em 3 meses distintos: conferir mês corrente por padrão, navegar 2 meses para trás e para frente, conferir rótulos e ranges enviados na query string.
- [ ] Selecionar "Tudo" e confirmar, nas requisições capturadas, que `from`/`to` não são enviados.
- [ ] Mês com 60+ entradas mockadas: confirmar que "Período" bate com o total do summary e não com a soma das 50 exibidas.
- [ ] Aba Equipe: trocar período e conferir que o report é refeito com o novo range para cada empresa do escopo.
- [ ] Recarregar a página após escolher "Tudo" e após navegar para julho: confirmar persistência do modo e reset do mês âncora.

### Regressão
- [ ] Timer rodando continua fora da lista (só entradas fechadas aparecem) e o widget global não é afetado.
- [ ] Filtro por empresa da aba Meu tempo continua funcionando combinado com o período novo, inclusive "Pessoal".
- [ ] "Carregar mais" continua paginando dentro do período selecionado.
- [ ] Entrada manual, edição inline e exclusão continuam invalidando a lista e os totais.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `src/features/time/composables/useTimePeriod.ts` | Criar | Estado do período (`today` / `month` + âncora / `all`), range local, rótulo, navegação, persistência e `staleTime` sugerido. |
| `src/features/time/components/PeriodPicker.vue` | Criar | Seletor visual: chips "Hoje" e "Tudo" + bloco de mês com setas. Usado pelas duas abas. |
| `src/features/time/TimeTrackingView.vue` | Modificar | Trocar `Preset`/`rangeFor` por `useTimePeriod`; ligar `useTimeSummary`; recalcular totais/insights a partir do summary; passar ritmo e rótulos novos ao rail. |
| `src/features/time/components/TeamView.vue` | Modificar | Trocar os presets pelo `PeriodPicker`; passar o range novo ao `useTeamTime`. |
| `src/features/time/composables/useTeamTime.ts` | Modificar | Aceitar range parcial (lifetime); remover `last7Range` fixo e derivar o ritmo do período selecionado. |
| `src/features/time/components/TimeInsightsRail.vue` | Modificar | Título do card de ritmo dinâmico; barras do período; nota de base nos cards derivados da amostra. |
| `src/features/time/components/TeamInsightsRail.vue` | Modificar | Mesmo tratamento do título/ritmo. |
| `src/features/time/components/MiniBars.vue` | Modificar | Modo denso (até 31 barras) e rótulos esparsos. |
| `src/CLAUDE.md` | Modificar | Atualizar a linha de Time Tracking na tabela de features. |

---

## Tasks Técnicas

- [x] **T1** — Criar `useTimePeriod.ts`: `kind` (`today`/`month`/`all`) + `anchor`, `range` computado (`{ from?, to? }`, montado em horário local), `label`, `prev()`, `next()`, `canGoNext`, `setKind()`, `staleTime`, persistência do `kind` por aba (`time.period.me` / `time.period.team`).
- [x] **T2** — Criar `PeriodPicker.vue` consumindo o composable, com a11y da seção Não-Funcionais *(depende de: T1)*.
- [x] **T3** — `TimeTrackingView.vue`: substituir preset/rangeFor pelo composable e pelo picker; remover `rangeFor` *(depende de: T2)*.
- [x] **T4** — `TimeTrackingView.vue`: ligar `useTimeSummary(range)` e mover `rangeTotalSec`, `rangeBillableSec`, `billablePct`, `avgPerDaySec`, `activeDaysCount`, `bestDay`, `streakDays` e `byProject` para derivar do summary (`byDay` e `byCompany`) *(depende de: T3)*.
- [x] **T5** — Ritmo do período: `buildPulseBars` derivando de `summary.byDay` (dia a dia no mês, mês a mês em "Tudo", últimos 7 dias em "Hoje") e `MiniBars` com modo denso *(depende de: T4)*.
- [x] **T6** — Marcar "Top tarefas" e "sessão mais longa" com a nota de base quando `hasMore` for verdadeiro *(depende de: T4)*.
- [x] **T7** — `useTeamTime.ts`: recebe a instância do período, range parcial, remoção do `last7Range` e ritmo derivado do período *(depende de: T1)*.
- [x] **T8** — `TeamView.vue` + `TeamInsightsRail.vue` usando o picker e o ritmo novo *(depende de: T7, T2)*.
- [x] **T9** — Verificação conforme Estratégia de Testes (CDP, cenários mockados) e typecheck.
- [x] **T10** — Atualizar `src/CLAUDE.md` e o Change Log desta spec.

---

## Considerações de Arquitetura

- **Decisão:** um único composable `useTimePeriod` compartilhado pelas duas abas,
  cada aba com sua instância (estado independente).
  **Motivo:** hoje a mesma lógica de range está duplicada em dois arquivos e já
  divergiu (a Equipe não tem filtro de empresa, a individual não tem escopo).
  Instância por aba evita que mudar o mês no ranking mexa na minha lista.
  **Alternativa rejeitada:** estado global no Pinia. Acopla duas telas que o
  usuário lê em contextos diferentes, e não há terceira tela pedindo isso.

- **Decisão:** "Tudo" é a **ausência** de `from`/`to`, não uma data mínima
  artificial tipo `2000-01-01`.
  **Motivo:** o backend já trata ausência como "sem filtro"
  (`rangeFilter` retorna `undefined`), então é o caminho sem código morto e sem
  data mágica. Também deixa a query key do Vue Query naturalmente distinta.
  **Alternativa rejeitada:** `from` na data de criação da conta. Exigiria buscar
  o `createdAt` do usuário só para montar filtro, sem ganho nenhum.

- **Decisão:** totais e ritmo vêm de `/time/summary`; a lista continua paginada.
  **Motivo:** separa "quanto foi" (agregado, exato, barato) de "o que foi"
  (detalhe, paginado). É o desenho que o backend já oferece e que o front
  ignorava.
  **Alternativa rejeitada:** subir o `take` para 200 e seguir somando no cliente.
  Empurra o problema para frente (200 também estoura em lifetime) e desperdiça
  banda trazendo entrada por entrada para exibir um número só.

- **Decisão:** o mês âncora não persiste entre sessões; só o modo persiste, e
  com uma chave por aba (`time.period.me`, `time.period.team`).
  **Motivo:** abrir a tela dias depois em "Maio 2026" porque foi lá que você
  parou é uma armadilha silenciosa; o mês corrente é o contexto padrão correto.
  Chave única para as duas abas fazia a última escolha vencer, e "Tudo" no meu
  histórico reconfigurava o placar da equipe na visita seguinte.

- **Decisão (tomada na implementação):** com filtro de empresa ativo, TODOS os
  agregados voltam a ser derivados da amostra, inclusive o total.
  **Motivo:** `/time/summary` não aceita `companyId`. Dava para servir o total
  exato pelo `byCompany` e deixar média, melhor dia e sequência na amostra, mas
  o card ficaria com um total do período ao lado de uma média que não fecha com
  ele. Coerência interna vale mais que um número exato solitário, e a nota de
  base diz de onde os números saíram.
  **Alternativa rejeitada:** aceitar `companyId` no `/time/summary`. É a
  correção de raiz, mas exige deploy da API e ficou no Follow-up.

---

## Plano de Rollout

- [ ] Mudança 100% frontend. Sem deploy de API, sem migration, sem feature flag.
- [ ] Publicar junto com a verificação visual dos dois modos (mês e lifetime).

## Plano de Rollback

- Reverter o commit do front e republicar. Não há estado no servidor tocado por
  esta spec. Único resíduo possível é a chave `time.period` no `localStorage` do
  usuário, ignorada por qualquer versão anterior.

---

## Observabilidade

Não aplicável: mudança de UI sem efeito colateral no servidor, sem novo endpoint
e sem estado persistido remotamente. Os erros de query já são tratados pelos
estados de erro existentes das duas abas.

---

## Definition of Done

- [x] Todos os acceptance criteria atendidos e verificados
- [x] Verificação manual da Estratégia de Testes executada (CDP, com evidência)
- [x] Typecheck (`npm run type-check`) sem erros novos
- [x] `/code-review` rodado e findings de correção resolvidos
- [x] Fluxo exercitado de ponta a ponta nas duas abas, não apenas typecheck
- [x] Sem breaking change não documentada
- [x] `src/CLAUDE.md` atualizado
- [x] Spec com status `Concluído` + data + Change Log
- [ ] `/spec-sync` rodado (sugerido ao Nicolas; não roda sem pedido por
      reindexar embeddings do repo inteiro)

## Evidência da verificação (2026-08-09)

Script `C:/tmp/time-period-verify.mjs` (Edge headless + CDP, API mockada com a
semântica real: `entries` pagina, `summary` agrega o range inteiro). Massa de
91 entradas em junho, julho e agosto/2026, sendo 63 em agosto para forçar o
truncamento em 50.

| Cenário | Resultado |
|---|---|
| Carga padrão | "Agosto 2026", 31 barras densas, seta direita `disabled` |
| Total do mês com lista truncada | `47h 15m` exato (63 × 45min) com 50 entradas na tela |
| Seta esquerda | "Julho 2026", requests `2026-07-01..2026-08-01`, total `30h`, sem nota de amostra (20 entradas) |
| "Tudo" | requests sem `from`/`to`, total `93h 15m`, ritmo com 3 barras (jun/jul/ago) |
| "Hoje" | ritmo volta a 7 barras, um único bloco de total |
| Equipe | picker próprio, "Grupo · Agosto 2026: 27h · 1 pessoa", "Ritmo (Agosto)", report por empresa no range novo |
| Persistência | `time.period.me = all` respeitado no reload, mês âncora de volta no corrente |
| Lacunas em "Tudo" | massa com jan e mar preenchidos e fev/abr/mai vazios: 8 colunas, as três vazias presentes, tooltip com ano (`fev/2026: 0s`) |
| Teto de 200 | com 211 entradas, "Carregar mais" para em 200, o botão some e a nota permanece ("nas 200 entradas carregadas") |

Screenshots em `C:/tmp/time-shots/`.

### Correções vindas do `/code-review`

Sete achados, todos corrigidos e reverificados:

1. Teto de 200 do `take` mascarando amostra (ver Riscos).
2. e 3. `AddUserModal`/`BulkAddUsersModal`: o reset de função ao abrir estava
   invertido, então um ADMIN que escolheu "Admin" numa empresa reabria o modal
   noutra com "Admin" pré-selecionado. Agora toda abertura começa em WORKER.
4. `streakDays` passou a ser recortado pelo período (no dia 1º do mês, meio ano
   de hábito virava "1 dia"): o rótulo agora diz "dentro do período".
5. Ritmo no modo "Hoje" ignorava o filtro de empresa e mostrava todas.
6. "Tudo" colapsava meses sem registro e não tinha ano no rótulo.
7. `canCreateCompany` tratava falha de rede como "usuário sem vínculo" e
   liberava o botão para WORKER; e criar empresa não recarregava a lista de
   vínculos.

## Follow-up (fora do escopo desta spec)

- **Paginação real por `skip`** na lista de entradas. Hoje ela cresce o `take` e
  para no teto de 200 do servidor: acima disso não há como ver as entradas mais
  antigas do período (a nota de amostra avisa, mas avisar não é navegar).
- **`companyId` no `/time/summary`** (backend): destravaria os agregados exatos
  também com filtro de empresa, que hoje voltam para a amostra.
- **`byActivity` no `/time/summary`** (backend): hoje o resumo do usuário agrega
  por dia e por empresa, mas não por tarefa, e é por isso que "Top tarefas"
  segue dependendo da amostra carregada. Espelhar o que `companyReport` já faz
  resolve de raiz. Exige deploy da API, por isso ficou fora daqui.
- **Agregação por `groupBy` do Prisma** em `summary`/`companyReport`, no lugar do
  `findMany` + laço em JS, para o modo lifetime não crescer linearmente em
  memória.

## Perguntas em Aberto

- Nenhuma. Conjunto de períodos (Hoje · Mês · Tudo) confirmado pelo Nicolas em
  2026-08-09.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-09 | 0.1 | Criação | Nicolas (via Claude) |
| 2026-08-09 | 1.0 | Implementado e verificado. Decisões novas registradas na implementação: chave de persistência por aba, agregados 100% na amostra sob filtro de empresa, seta entra no modo mês antes de navegar, total "Hoje" não duplica no modo Hoje | Nicolas (via Claude) |
