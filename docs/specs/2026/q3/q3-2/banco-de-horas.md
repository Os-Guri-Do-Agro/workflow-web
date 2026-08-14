# Spec: Banco de horas, relatórios e o Meu tempo como player

**Status:** Em Implementação (A, B e C entregues e verificados; falta aplicar a migration)
**Autor:** Nicolas (com Claude)
**Criado em:** 2026-08-14
**Última atualização:** 2026-08-14
**Versão:** 1.0

---

## Visão Geral

> Transformar o cronômetro em resposta para a pergunta que a pessoa realmente
> tem: **estou devendo ou sobrando horas, e como termino o mês se seguir assim?**
> Junto, tirar da tela os dois atritos que fazem o registro ser abandonado: o
> campo de título que ninguém preenche e a falta de um pause de almoço.

## Motivação / Contexto de Negócio

O produto já mede tempo com precisão e já protege contra corte indevido
(`timer-confiavel.md`). O que ele **não** faz é dizer o que aquilo significa. Um
número de horas sem meta não informa nada: ninguém sabe, olhando o Meu tempo, se
está adiantado ou atrasado, e por isso o registro vira obrigação burocrática em
vez de ferramenta.

Custo de não fazer: o time continua registrando por cobrança, o gestor continua
somando planilha à mão para fechar o mês, e o esforço de quem trabalha demais
fica invisível — que é o pior dos três.

Métrica que move: número de dias com registro por pessoa (o heatmap já mede) e
quantas correções manuais de entrada acontecem por semana.

---

## Research Findings

**Stack:** NestJS + Prisma + Postgres (`workflow-api`) · Vue 3.5 + Pinia + Vue
Query (`work-flow`). **Nenhuma biblioteca de data** nos dois repositórios, e
nenhuma de feriados.

**Padrões a seguir:**

- **O servidor é a fonte de verdade do tempo.** O cliente nunca conta para
  gravar; manda instantes e o service materializa `durationSec`
  (`time-tracking.service.ts:165`). O saldo do banco de horas segue a mesma
  regra: calculado no servidor, o cliente só desenha.
- **Agregação já existe e não precisa de query nova.** `summary()` devolve
  `byDay` (`time-tracking.service.ts:582`) e `companyReport()` devolve
  `byUserDay` (feito para o heatmap). Os relatórios derivam desses dois.
- **`tzOffset` é obrigatório em qualquer agrupamento por dia** (`dayKey()`,
  `time-tracking.service.ts:967`). Banco de horas errado por fuso é banco de
  horas errado.
- Preferência de UI mora no `uiStore`/localStorage; **a meta de jornada não**,
  porque a visão de equipe precisa da meta de cada pessoa para calcular saldo.
- Vue Query com `staleTime` e chave por período (`useTimePeriod`).
- Tokens do design system, `lucide-vue-next`, zero hex em componente.

**Referências no código:**

- `workflow-api/src/time-tracking/time-tracking.service.ts` — `summary`,
  `companyReport`, `dayKey`, `rangeFilter`, `start`, `stop`.
- `workflow-api/prisma/schema.prisma:516` — `TimeEntry` (tem `description`,
  `activityId`, `companyId`; **não** tem nada de jornada).
- `workflow-api/prisma/schema.prisma:9` — `User` não tem tabela de preferências:
  a jornada é modelo novo.
- `work-flow/src/features/time/TimeTrackingView.vue:860` — a linha da lista já
  mostra `description` e, separado, o chip `activity.title`. É a duplicação que
  esta spec elimina.
- `work-flow/src/core/components/shells/shared/TimerWidget.vue` — só tem Play e
  Square; não existe pausa nem retomar.
- `work-flow/src/composables/useTimerIdleGuard.ts:299` — `resume()` já sabe
  recriar uma entrada com os mesmos vínculos. É a base do "retomar".

**Breaking Changes:**

- **`description` deixa de ser o campo primário na UI**, mas permanece no schema
  e na API sem alteração de contrato. Entrada antiga com descrição e sem tarefa
  continua exibindo a descrição. Nada quebra para consumidores da API.
- Nenhuma mudança destrutiva de schema: tudo aditivo.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| **Alto** | Saldo errado vira conflito trabalhista. Um bug aqui não é bug de UI: é a pessoa achando que tem 12h de crédito que o sistema não reconhece. | O saldo **nunca** é armazenado, sempre derivado das entradas + jornada, então não existe estado corrompido a arrastar. Testes unitários com data fixa cobrindo virada de mês, fuso e feriado móvel. A tela mostra a conta aberta (dias úteis × meta − trabalhado), não só o resultado. |
| **Alto** | Feriado errado deturpa o mês inteiro (um dia a mais de meta = uma jornada de dívida falsa). | Tabela de feriados nacionais derivada por algoritmo (Páscoa por Meeus/Jones/Butcher) com **teste por ano de 2024 a 2035** contra a lista oficial. Sem dependência externa que possa mudar sem aviso. |
| **Médio** | Fuso: entrada às 21h de Brasília cai no dia seguinte em UTC e joga horas para o dia errado. | `tzOffset` já é exigido no agrupamento existente; o cálculo de saldo reusa `dayKey()`. Teste com offset −180 na virada. |
| **Médio** | Projeção otimista demais vira promessa falsa ("você vai ter 20h de crédito") e frustra. | A projeção declara a premissa na própria frase ("no seu ritmo destes N dias") e some quando há menos de 3 dias úteis com registro no período. |
| **Médio** | Pessoa em duas empresas com metas diferentes: qual manda? | Resolvido no desenho: **a jornada é da pessoa, não do vínculo**. Uma meta, um saldo. O admin vê o saldo dela e, separado, quanto do tempo foi na empresa dele. |
| Baixo | Meta alterada no meio do mês recalcula o passado. | A jornada é versionada por `validFrom`; o cálculo usa a vigente em cada dia. |

---

## Requisitos Não-Funcionais

- **Segurança:** meta e saldo próprios exigem JWT. Saldo de terceiro só para
  ADMIN da empresa onde ambos são membros, reusando `assertMembership()`.
- **Privacidade:** saldo é dado sensível de trabalho. Não entra em payload de
  realtime nem em feed. A visão de equipe mostra saldo só para quem administra,
  nunca de par para par.
- **Performance:** relatório mensal de equipe com 30 pessoas × 31 dias em uma
  query agregada, resposta < 500ms. Nada de N+1 por pessoa.
- **Acessibilidade:** o saldo nunca é comunicado só por cor (crédito verde,
  dívida vermelha) — sempre com sinal e palavra.
- **Compatibilidade:** feriados apenas nacionais do Brasil na v1.

---

## User Stories

- Como **quem registra o tempo**, quero ver se estou devendo ou sobrando horas
  hoje, na semana e no mês, para não descobrir no fim do mês.
- Como **quem registra o tempo**, quero saber como o mês termina se eu mantiver
  este ritmo, para poder corrigir enquanto dá tempo.
- Como **quem registra o tempo**, quero pausar para o almoço e retomar sem
  procurar a entrada na lista.
- Como **quem registra o tempo**, quero escolher a tarefa e não ter que digitar
  um título, porque eu não vou digitar.
- Como **quem tem jornada diferente do padrão**, quero definir minha meta diária
  uma vez, e não todo dia.
- Como **admin**, quero o fechamento semanal e mensal do time em uma tela, para
  não montar planilha.

---

## Acceptance Criteria

### Jornada e dias úteis

- [ ] **Given** um usuário sem jornada configurada **When** o saldo é calculado
      **Then** a meta usada é **8h (28.800s) por dia útil**, que fecha as 40h
      semanais de segunda a sexta.
- [ ] **Given** um sábado, domingo ou feriado nacional **When** o saldo do
      período é calculado **Then** aquele dia contribui com meta **zero**, e o
      tempo registrado nele entra **inteiro como crédito**.
- [ ] Feriados nacionais reconhecidos: 1/1, Carnaval (segunda e terça),
      Sexta-feira Santa, 21/4, 1/5, Corpus Christi, 7/9, 12/10, 2/11, 15/11,
      20/11 (Consciência Negra, nacional desde 2024), 25/12.
- [ ] **Given** jornada alterada em 20/08 **When** o saldo de agosto é calculado
      **Then** os dias 1 a 19 usam a meta anterior e 20 em diante a nova.

### Saldo e projeção

- [ ] **Given** 3 dias úteis com 10h, 10h e 10h e meta de 8h **When** abro o Meu
      tempo **Then** o saldo é **+6h** e a conta aparece aberta na tela (30h
      trabalhadas contra 24h de meta).
- [ ] **Given** 3 dias úteis com 10h, 10h e 3h **Then** o saldo é **−1h**,
      exibido com o sinal e a palavra ("devendo"), nunca só pela cor.
- [ ] **Given** o dia de hoje ainda em andamento **When** o saldo é exibido
      **Then** hoje entra pelo tempo já registrado, e a meta de hoje **conta**
      (a pessoa precisa ver o que falta hoje, não um saldo que ignora o dia).
- [ ] **Given** 4 dias úteis registrados com ritmo médio de 9h30 e 12 dias úteis
      restantes no mês **Then** a projeção exibida é `saldo atual + (ritmo −
      meta) × dias restantes`, com o texto declarando o ritmo usado.
- [ ] **Given** menos de 3 dias úteis com registro no período **Then** a projeção
      **não é exibida** (amostra insuficiente).
- [ ] **Given** o cronômetro é parado **When** o stop retorna **Then** saldo e
      projeção da tela refletem a entrada nova sem recarregar a página.

### Relatórios

- [ ] `GET /time/balance` devolve, para o período pedido: `workedSec`,
      `targetSec`, `balanceSec`, `businessDays`, `daysLeft`, `paceSec`,
      `projectedBalanceSec` e `byDay[]` com `{day, workedSec, targetSec, holiday}`.
- [ ] `GET /time/company-balance` (ADMIN) devolve o mesmo por pessoa da empresa,
      mais o recorte `companySec` de quanto do tempo dela foi naquela empresa.
- [ ] Semana começa na **segunda** e o mês é o calendário civil, nos dois
      relatórios.
- [ ] **Given** um não-ADMIN **When** chama `GET /time/company-balance` **Then**
      403.

### Player

- [ ] **Given** o cronômetro rodando **When** clico em Pausar **Then** a entrada
      é encerrada agora e o botão vira **Retomar**, exibindo o que estava sendo
      feito.
- [ ] **Given** uma pausa **When** clico em Retomar **Then** uma entrada nova
      começa com a mesma tarefa, empresa e faturável da anterior, sem eu
      escolher nada.
- [ ] **Given** uma pausa **When** recarrego a página ou abro em outra aba
      **Then** o Retomar continua disponível (o contexto sobrevive ao reload).
- [ ] **Given** uma pausa iniciada há mais de 12h **Then** o Retomar não é mais
      oferecido (é outro dia de trabalho, não a volta do almoço).

### Título

- [ ] **Given** uma tarefa escolhida **Then** o campo de texto livre não é
      exibido e o título da entrada na lista é o título da tarefa.
- [ ] **Given** nenhuma tarefa escolhida **Then** o campo de texto livre é
      exibido para descrever o trabalho.
- [ ] **Given** entrada antiga com descrição e sem tarefa **Then** a lista
      continua exibindo a descrição, sem migração de dados.

---

## Estratégia de Testes

### Unitários (backend)

- [ ] `holidays.ts` — todos os feriados nacionais de **2024 a 2035** contra a
      lista oficial; Páscoa correta em ano bissexto; Carnaval e Corpus Christi
      derivados dela.
- [ ] `businessDaysBetween()` — mês começando no sábado; período de um dia só;
      período inteiro de feriados; borda inclusiva nas duas pontas.
- [ ] `balance()` — saldo positivo, negativo e zero; dia sem registro conta meta
      cheia; fim de semana trabalhado vira crédito integral; jornada versionada
      no meio do período; `tzOffset` −180 na virada de dia.
- [ ] `projection()` — menos de 3 dias úteis devolve `null`; ritmo acima e
      abaixo da meta; nenhum dia útil restante devolve o saldo atual.
- [ ] `companyBalance()` — não-ADMIN recebe 403; pessoa de outra empresa não
      aparece; `companySec` ≤ `workedSec`.

### Integração

- [ ] `POST /time/stop` seguido de `GET /time/balance` reflete a entrada nova.
- [ ] `PATCH /time/schedule` cria versão nova sem apagar a anterior.

### E2E (CDP, o harness já existente)

- [ ] Pausar e retomar sem tocar na lista; a entrada nova nasce com a mesma
      tarefa.
- [ ] Escolher tarefa esconde o campo de texto; tirar a tarefa traz de volta.
- [ ] Parar o cronômetro atualiza o saldo na tela sem reload.

### Regressão

- [ ] O heatmap de constância e o ranking da equipe continuam corretos (os dois
      consomem `byUserDay`, que esta spec toca).
- [ ] Entradas manuais e edição de entrada continuam funcionando com o campo de
      texto escondido.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `workflow-api/prisma/schema.prisma` | Modificar | `WorkSchedule` (jornada versionada por usuário) |
| `workflow-api/prisma/migrations/<data>_work_schedule/migration.sql` | Criar | Aditiva, à mão, `migrate deploy` |
| `workflow-api/src/time-tracking/holidays.ts` | Criar | Feriados nacionais por cálculo, sem dependência |
| `workflow-api/src/time-tracking/balance.service.ts` | Criar | Dias úteis, meta, saldo, projeção |
| `workflow-api/src/time-tracking/time-tracking.controller.ts` | Modificar | `GET /balance`, `GET /company-balance`, `GET/PATCH /schedule` |
| `workflow-api/src/time-tracking/dto/work-schedule.dto.ts` | Criar | Meta por dia da semana |
| `work-flow/src/features/time/components/BalanceCard.vue` | Criar | Saldo + conta aberta + projeção |
| `work-flow/src/features/time/components/BalanceReport.vue` | Criar | Relatório semanal/mensal, individual e equipe |
| `work-flow/src/features/time/composables/useBalance.ts` | Criar | Vue Query do saldo |
| `work-flow/src/features/time/TimeTrackingView.vue` | Modificar | Player, campo único, saldo no rail |
| `work-flow/src/core/components/shells/shared/TimerWidget.vue` | Modificar | Pausar/Retomar + saldo do dia |
| `work-flow/src/composables/useTimerPause.ts` | Criar | Contexto da pausa, persistido, com validade de 12h |
| `work-flow/src/features/settings/SettingsView.vue` | Modificar | Definir a jornada |

---

## Tasks Técnicas

**Fase A — Player e título** (independente do resto, entrega valor sozinha)

- [x] **A1** — `useTimerPause.ts`: guarda o contexto da entrada pausada em
      `localStorage` (tarefa, empresa, faturável, instante), expira em 12h.
- [x] **A2** — Pausar/Retomar no `TimerWidget` e no `TimeTrackingView`.
- [x] **A3** — Campo único: com tarefa escolhida, o próprio `TaskPicker`
      (`variant="hero"`) vira o título e o campo de texto some.
- [x] **A4** — Lista: título = tarefa, descrição como subtítulo só quando as
      duas existem (entradas anteriores, sem migração).

**Fase B — Banco de horas**

- [x] **B1** — `holidays.ts` + 34 testes (12 anos de datas móveis conferidos).
- [x] **B2** — `WorkSchedule` no schema + migration à mão, aditiva. **Não aplicada.**
- [x] **B3** — `balance.service.ts`: dias úteis, meta versionada, saldo, projeção.
- [x] **B4** — `GET /time/balance` + `GET/PATCH /time/schedule`.
- [x] **B5** — 21 testes unitários de saldo, jornada versionada, fuso e projeção.
- [x] **B6** — `BalanceCard` no rail do Meu tempo, com a conta aberta.
- [x] **B7** — Jornada em `/settings`, com o padrão explicado antes de pedir nada.

**Fase C — Relatórios**

- [x] **C1** — `GET /time/company-balance` (ADMIN, com `companySec`).
- [x] **C2** — `BalanceReport`: semana e mês navegáveis, dia a dia.
- [x] **C3** — Fechamento da equipe na aba nova, ordenado por quem deve mais.
- [x] **C4** — CSV do fechamento (`;` e vírgula decimal, com BOM para o Excel).

### O que a revisão de código pegou (todos corrigidos)

Dez achados, cinco deles produzindo número errado ou comportamento contrário à
regra escrita:

- **O relatório cobrava dia futuro.** `byDay` mantém a meta cheia dos dias que
  ainda vão acontecer (a pessoa precisa ver o que a espera), mas o saldo do
  período não os cobra — então as linhas do dia somavam diferente do total do
  topo. Agora dia futuro mostra "a cumprir", e o CSV segue a mesma regra.
- **`companySec` contava fora do período.** A consulta é alargada em um dia para
  cada lado por causa do fuso, e o acumulador não filtrava: dava para exibir
  mais tempo "nesta empresa" do que a pessoa trabalhou no total.
- **A pausa não expirava com a aba aberta.** As 12h só eram checadas na carga do
  módulo; quem deixava o Nevo aberto a noite toda encontrava "Retomar" de manhã
  e recriava uma entrada com o contexto de ontem.
- **A pausa capturava o estado do servidor, não o da tela.** O autosave da
  edição ao vivo é debounced: trocar a tarefa e pausar em seguida salvava o
  contexto com a tarefa anterior.
- **`validFrom` padrão usava o dia UTC**, então quem salvasse a jornada depois
  das 21h em UTC−3 a veria valer só no dia seguinte, contra o que a tela promete.
- Sem teto de intervalo, `from=0001-01-01&to=9999-12-31` materializava milhões
  de dias; datas impossíveis (`2026-13-45`) davam 500 em vez de 400.
- Período congelado no carregamento: a tela aberta na virada do mês continuava
  no mês anterior.
- A instância de equipe do relatório disparava um `GET /time/balance` pessoal
  que nunca era renderizado.
- O layout colapsava para uma coluna sem entradas, esticando o card de saldo.
- O CSV reimplementava o download em vez de usar o `downloadBlob` do repositório
  (que anexa a âncora ao DOM antes do clique, exigência de parte dos navegadores).

### O que a verificação mudou no desenho

- **`businessDaysElapsed` não existia na spec.** O card mostrava "21 dias úteis"
  ao lado de uma meta que só cobrava 10 dias, e quem conferisse a conta não
  fecharia. Agora a contagem exibida é a dos dias já cobrados.
- **`fallbackTitle` no `TaskPicker`.** Com a árvore ainda carregando (ou tarefa
  concluída, que fica oculta), o título do trabalho em andamento aparecia como
  "Tarefa indisponível". A entrada já traz `activity.title` do servidor.
- **Dia sem registro no relatório mostrava `0s`**, que lê como defeito. Virou
  travessão.

**Verificado** (Edge headless, API interceptada):

| Cenário | Resultado |
|---|---|
| Saldo no Meu tempo | "−58h devendo · 30h trabalhadas · meta 88h" + projeção com o ritmo declarado |
| Fechamento individual | Dia a dia com meta, saldo por dia e totais; feriado e fim de semana sem meta |
| Fechamento da equipe | "Bia 120h (90h aqui) 150h −30h", ordenado por quem deve mais |
| Pausar | 1 stop, botão "Retomar SITE - Criar menu lateral" aparece |
| Retomar | `{"companyId":"c1","activityId":"act-1"}` — mesma tarefa, sem escolher nada |
| Timer com tarefa | Campo de texto some, título é a tarefa, sem seletor duplicado |
| Jornada em /settings | 7 campos por dia, total de 44h calculado ao vivo |
| Dias futuros no relatório | 11 linhas com "a cumprir"; nenhuma dívida falsa |

93 testes no backend (55 novos: 34 de feriados, 21 de saldo e projeção).

---

## Considerações de Arquitetura

- **Decisão:** o saldo é **sempre derivado**, nunca armazenado.
  **Motivo:** saldo materializado desincroniza no primeiro backfill, na primeira
  edição retroativa de entrada, no primeiro ajuste de jornada. E saldo errado
  aqui é conflito com gente, não bug de tela.
  **Alternativa rejeitada:** tabela `HourBalance` com fechamento mensal. Só vale
  quando houver homologação de fechamento (assinado, imutável) — que é outra
  feature, e está em Follow-up.

- **Decisão:** a jornada pertence ao **usuário**, versionada por `validFrom`.
  **Motivo:** a pessoa tem uma jornada, não uma por empresa; e alterar a meta
  não pode reescrever o passado.
  **Alternativa rejeitada:** meta em `UserCompany`. Some metas de quem atua em
  duas empresas e produz saldo sem sentido físico.

- **Decisão:** pausa = encerrar a entrada e guardar o contexto para retomar.
  **Motivo:** escolha do dono do produto. Mantém `durationSec` com o significado
  que já tem, não mexe no heartbeat nem na arbitragem entre dispositivos, e
  entrega o ganho real (retomar sem procurar na lista).
  **Alternativa rejeitada:** `pausedSec` dentro da entrada. Uma linha por dia na
  lista, mas muda o invariante de duração, contamina o corte por ociosidade e a
  reconciliação de entrada abandonada.

- **Decisão:** feriados por cálculo, em código, sem dependência.
  **Motivo:** a lista nacional é estável e as datas móveis derivam da Páscoa por
  algoritmo determinístico. Dependência externa de feriados atualiza sozinha e
  muda o saldo do time sem ninguém pedir.
  **Alternativa rejeitada:** API pública de feriados (indisponibilidade vira
  saldo errado) e tabela no banco (exige manutenção anual manual).

---

## Plano de Rollout

- [ ] Migration `work_schedule` por `migrate deploy` (aditiva; nenhuma coluna
      existente é tocada).
- [ ] Backend primeiro: o front chama rotas novas e não pode subir antes.
- [ ] Fase A pode ir sozinha antes de B e C.
- [ ] Sem jornada configurada, todo mundo cai no padrão de 8h. Nenhum backfill
      é necessário.

## Plano de Rollback

- A migration é aditiva: reverter o código deixa a tabela órfã, sem efeito.
  Se for preciso remover, `DROP TABLE "WorkSchedule"` depois do redeploy.
- Nenhum dado de `TimeEntry` é alterado por esta spec, então rollback não perde
  registro de tempo em hipótese nenhuma.
- Fase A é só front: reverter o commit basta.

---

## Observabilidade

- **Log:** `time.schedule_changed userId=<id> from=<meta> to=<meta>` — alteração
  de jornada muda saldo retroativo e precisa de rastro.
- **Log:** `time.balance_query userId=<id> range=<from..to> ms=<duração>` em
  nível debug, para achar relatório lento antes de virar reclamação.
- **Alerta:** não aplicável nesta fase (sem SLA definido no produto).

---

## Definition of Done

- [ ] Todos os acceptance criteria atendidos e verificados
- [ ] Testes da Estratégia implementados e passando
- [ ] Typecheck e lint sem erros novos nos dois repositórios
- [ ] `/code-review` rodado e findings de correção resolvidos
- [ ] Fluxo exercitado de ponta a ponta (pausar, retomar, ver saldo mudar)
- [ ] Sem breaking change não documentada
- [ ] Observabilidade implementada conforme a seção acima
- [ ] Spec com status `Concluído` + data + Change Log
- [ ] `/spec-sync` rodado

## Perguntas em Aberto

- [ ] Feriado municipal e estadual, férias e atestado ficam de fora da v1. Sem
      eles, quem tira férias aparece com dívida enorme. Resolver antes de expor
      o saldo na visão de equipe? — responsável: Nicolas.
- [ ] O saldo deve ter teto de acúmulo (a CLT limita compensação a 6 meses no
      banco de horas por acordo individual)? — responsável: Nicolas.

## Follow-up (fora do escopo)

- Fechamento mensal homologado (imutável, com aceite das duas partes).
- Ausências: férias, atestado, folga compensada.
- Feriado municipal e estadual por empresa.
- Alerta ativo ("você já passou de 44h nesta semana").

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-14 | 1.0 | Fases A, B e C implementadas e verificadas na tela; `businessDaysElapsed` e `fallbackTitle` nasceram da verificação | Nicolas + Claude |
| 2026-08-14 | 0.1 | Criação, com research e as quatro decisões de produto fechadas | Nicolas + Claude |
