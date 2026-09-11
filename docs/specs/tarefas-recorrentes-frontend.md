# Tarefas recorrentes — a API, para o frontend

**Status:** backend completo · pronto para trocar o `localStorage` pela API
**Atualizado:** 10/09/2026
**Documento irmão:** [tarefas-recorrentes-handoff-backend.md](./tarefas-recorrentes-handoff-backend.md) — o delta que o frontend pediu
**Código:** [`src/activity-recurrence/`](../src/activity-recurrence/)

---

## 0. Como ler este documento

O [handoff](./tarefas-recorrentes-handoff-backend.md) é o que o frontend pediu.
Este documento é **a resposta**: o que a API entrega hoje, no shape exato em que
ela entrega, e o roteiro de troca do mock pela API.

As duas coisas que o §3 do handoff apontou como faltando **estão feitas**:

| Pedido                                                        | Onde está agora                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| §3.1 — as exceções do mês precisam chegar ao cliente          | `recurrences[].exceptions` no payload do board, recortadas pela janela do mês                         |
| §3.2 — `recurrenceId` e `occurrenceDate` nas atividades reais | já vão no card do board, e `occurrenceDate` sai como **dia puro** (`"2026-09-14"`), não como instante |

E uma terceira, que o §8 do handoff pedia de tabela: o board agora devolve
`monthNumber`, `from` e `to`. **`month-key.ts` pode ser apagado** — não é mais
preciso adivinhar `'YYYY-MM'` a partir do `monthId`.

Nada do que já existia mudou de forma. As chaves `TODO`, `IN_PROGRESS`,
`IN_TESTING`, `DONE`, `monthId` e `year` do board continuam idênticas.

---

## 1. O modelo em uma tela

Três entidades e um card que não existe:

- **`ActivityRecurrence`** — o modelo da tarefa (título, descrição,
  responsáveis, tags, roteiro de subtarefas) **mais a regra** de repetição. Uma
  linha por rotina. Nunca uma por data.
- **`ActivityRecurrenceException`** — uma data que foge da regra sem virar
  tarefa: `SKIPPED` (não acontece) ou `RESCHEDULED` (acontece noutro dia).
- **`Activity`** — a tarefa de verdade, com `recurrenceId` e `occurrenceDate`
  quando nasceu de uma rotina. É uma tarefa comum em todo o resto.
- **card virtual** — a ocorrência que ainda não virou linha. Ele é **calculado
  na leitura** e desaparece assim que alguém encosta nele.

O ciclo de vida de uma ocorrência é este, e vale ter na cabeça:

```
      regra expande a data
              │
              ▼
     card VIRTUAL no board          ── ninguém encostou: nunca vira linha
       │            │
  escreve       dispensa/remarca
       │            │
       ▼            ▼
  Activity real   Exception (SKIPPED | RESCHEDULED)
```

O ponto que economiza discussão depois: **a regra não cria tarefa**. Uma rotina
diária de dois anos são 500 dias e **zero** linhas na tabela `Activity` até
alguém arrastar um card. O banco só guarda o que alguém tocou.

---

## 2. O quadro do mês

`GET /month/:monthId/board?year=2026`

O `?year` é opcional e o padrão é o ano corrente. Ele existe porque `Month`, no
produto, **não é um período datado**: é um número 1‑12 dentro de um rótulo
Q1..Q4. Expandir uma regra exige uma âncora de ano vinda de fora. Ano fora de
`1970..2999` responde **400** (e não um 500 lá dentro).

### 2.1 O payload

```jsonc
{
  "monthId": "clx…",
  "year": 2026,
  "monthNumber": 9, // ← novo
  "from": "2026-09-01", // ← novo, inclusivo
  "to": "2026-09-30", // ← novo, inclusivo
  "recurrences": [
    /* §2.3 */
  ], // ← novo
  "TODO": [
    /* cards reais, depois virtuais */
  ],
  "IN_PROGRESS": [],
  "IN_TESTING": [],
  "DONE": [],
}
```

Dentro de cada coluna, **os cards reais vêm primeiro, os virtuais depois**. Não
é detalhe estético: o card virtual não tem `position` (não existe linha para
gravá‑la) e não pode empurrar a ordem que alguém montou à mão.

### 2.2 O card virtual

```jsonc
{
  "id": "rec:9f2c…:2026-09-07",
  "isVirtual": true,
  "recurrenceId": "9f2c…",
  "occurrenceDate": "2026-09-07", // a data ORIGINAL da regra: é a identidade
  "rescheduledTo": null, // preenchido quando uma exceção remarcou
  "title": "Reunião de alinhamento semanal",
  "priorityNumber": 1,
  "dueDate": "2026-09-07T12:00:00.000Z",
  "status": "TODO", // o initialStatus da rotina
  "position": null,
  "responsibles": [
    /* mesmo shape do card real */
  ],
  "tags": [{ "tag": { "id": "…", "name": "…", "slug": "…", "color": "#…" } }],
  "subtasks": [],
  "attachments": [],
  "_count": { "docs": 0, "attachments": 0 },
}
```

O id é `rec:<recurrenceId>:<YYYY-MM-DD>` — **o mesmo formato do protótipo**, de
propósito. Um cuid nunca começa com `rec:` e nunca tem `:`, então distinguir um
id virtual de um real é `id.startsWith('rec:')`, sem heurística.

`subtasks`, `attachments` e `_count` vêm vazios porque são exatamente o que
exige uma linha. O roteiro de subtarefas da rotina **existe**, e é copiado no
momento da materialização — mas antes disso não há progresso a mostrar.

Quatro regras decidem o que vira card virtual, e todas importam para a tela:

1. **Rotina pausada (`active: false`) não gera card novo.** As ocorrências que já
   viraram `Activity` continuam no quadro, porque são tarefas comuns.
2. **O que já é real não vira card virtual.** Senão o mesmo dia apareceria duas
   vezes.
3. **Data dispensada não aparece.**
4. **Data remarcada aparece no dia novo** (`dueDate` e `rescheduledTo` seguem a
   data nova), mantendo `occurrenceDate` na data original como identidade. Uma
   ocorrência remarcada **para outro mês** sai deste board e aparece no board do
   mês de destino, ainda com a `occurrenceDate` original.

A ordem é determinística: `(occurrenceDate, priorityNumber, title)`. Sem isso os
cards trocariam de lugar a cada refetch.

### 2.3 As regras do mês, com as exceções

Isto é o §3.1 do handoff. Vem **embutido**, como recomendado — sem requisição
extra por mês navegado.

```jsonc
"recurrences": [
  {
    "id": "9f2c…",
    "title": "Reunião de alinhamento semanal",
    "initialStatus": "TODO",
    "active": true,
    "rule": {
      "frequency": "WEEKLY",
      "interval": 1,
      "weekdays": [1],
      "monthDay": null,
      "monthDayLast": false,
      "skipWeekends": false,
      "startDate": "2026-09-01",
      "endDate": null
    },
    "exceptions": [
      { "occurrenceDate": "2026-09-07", "kind": "SKIPPED", "newDate": null },
      { "occurrenceDate": "2026-09-14", "kind": "RESCHEDULED", "newDate": "2026-09-15" }
    ]
  }
]
```

Quatro coisas para não descobrir na integração:

- **As exceções são recortadas pela janela do mês** — as de outros meses não
  vêm. O recorte pega tanto a data original quanto a `newDate` dentro do mês,
  então a remarcada que atravessa a virada do mês aparece nos dois boards.
- **A lista só tem rotinas `active: true`**, que são as que geram card. O campo
  `active` vem mesmo assim, para o shape não mudar quando a lista de origem
  mudar.
- **Entra a rotina que tem data no mês _ou_ exceção no mês.** A regra cujas
  únicas datas de setembro foram todas dispensadas continua aqui — é justamente
  o caso que precisa do botão de desfazer.
- **Não vêm responsáveis, tags nem descrição.** Isso já vai repetido em cada
  card. Para desenhar a linha apagada de uma data dispensada, `title` e
  `initialStatus` bastam; se precisar do resto, é `GET /activity-recurrence/:id`.

### 2.4 A atividade real que nasceu de uma rotina

Isto é o §3.2 do handoff.

```jsonc
{
  "id": "8b1e…",
  "title": "Triagem dos bug reports abertos",
  "status": "DONE",
  "position": 3,
  "recurrenceId": "9f2c…",
  "occurrenceDate": "2026-09-14", // dia puro, o MESMO formato do card virtual
}
```

`occurrenceDate` sai como `"2026-09-14"`, e não como `2026-09-14T00:00:00.000Z`.
Se saísse como instante, o casamento `(recurrenceId, occurrenceDate)` falharia
calado e o efeito seria exatamente o que o handoff descreveu: o dia apareceria
duas vezes no quadro e a rotina já concluída seria contada como atrasada.

Tarefa comum devolve `recurrenceId: null` e `occurrenceDate: null`.

### 2.5 O que o board NÃO devolve, e por quê

Combinado com o §3.3 do handoff, e vale manter assim:

- **Total de atividades do mês.** Quem decide o que está na tela é o cliente. Um
  total do servidor anunciaria "53 atividades" num quadro com 10.
- **Nada de "atrasado".** É derivado do calendário **local de quem olha**. Duas
  pessoas em fusos diferentes veem a mesma lista de ocorrências e podem,
  legitimamente, ver contadores de atraso diferentes.
- **O colapso por regra.** O servidor devolve o mês inteiro, sem paginar; o
  recorte de `boardOccurrences` continua sendo do cliente, e muda sem migração.

---

## 3. Os endpoints

Todos exigem `Authorization: Bearer <token>`. Os que não têm `:companyId` na
rota leem a empresa do header **`x-company-id`**. Toda **escrita** exige papel
`WORKER` na empresa.

| Verbo    | Rota                                       | O que faz                                                             |
| -------- | ------------------------------------------ | --------------------------------------------------------------------- |
| `GET`    | `/company/:companyId/activity-recurrence`  | Lista as rotinas, com a prévia das 3 próximas ocorrências de cada uma |
| `POST`   | `/company/:companyId/activity-recurrence`  | Cria a rotina                                                         |
| `GET`    | `/activity-recurrence/:id`                 | A rotina inteira                                                      |
| `PATCH`  | `/activity-recurrence/:id`                 | Edita a rotina                                                        |
| `DELETE` | `/activity-recurrence/:id`                 | Apaga a regra. As tarefas já criadas **ficam**                        |
| `POST`   | `/activity-recurrence/:id/materialize`     | Abre a tarefa de uma data. **Idempotente**                            |
| `POST`   | `/activity-recurrence/:id/exception`       | Dispensa (`SKIPPED`) ou remarca (`RESCHEDULED`) uma data              |
| `DELETE` | `/activity-recurrence/:id/exception/:date` | Devolve a data ao calendário                                          |

### 3.1 Criar (`POST /company/:companyId/activity-recurrence`)

```jsonc
{
  "title": "Reunião de alinhamento semanal",
  "description": "<p>Texto rico. Sanitizado na escrita.</p>",
  "priorityNumber": 1,
  "initialStatus": "TODO", // TODO | IN_PROGRESS | IN_TESTING | DONE
  "active": true,
  "responsibleUserIds": ["uuid"], // precisam ser MEMBROS da empresa
  "tagIds": ["uuid"], // tags que já existem
  "tagNames": ["fixas do mês"], // criadas na hora; mesma gramática do POST /activity
  "subtasks": [{ "title": "Conferir os números", "description": null }],
  "rule": {
    "frequency": "WEEKLY", // ONCE | DAILY | WEEKLY | MONTHLY
    "interval": 1, // 1..366
    "weekdays": [1, 4], // 0 = domingo … 6 = sábado
    "monthDay": null, // 1..31
    "monthDayLast": false, // "último dia do mês", vence o monthDay
    "skipWeekends": false,
    "startDate": "2026-09-01", // obrigatório. Em ONCE, é o prazo
    "endDate": null, // null = sem fim
  },
}
```

Os campos que não valem para a frequência escolhida são **ignorados**, não
recusados: o formulário mantém o estado de `weekdays` e `monthDay` enquanto a
pessoa alterna entre as opções, e recusar transformaria toda troca de frequência
em erro de validação.

`initialStatus` é o que dispensa arrastar a tarefa fixa toda vez: uma rotina
pode nascer direto em `IN_TESTING`.

**A resposta** é a rotina completa, mais dois campos que o front não precisa
calcular:

```jsonc
{
  "id": "9f2c…",
  "startDate": "2026-09-01", // datas sempre como dia puro
  "endDate": null,
  "exceptions": [],
  "nextOccurrences": ["2026-09-14", "2026-09-21", "2026-09-28"],
  "_count": { "materialized": 0, "exceptions": 0 },
}
```

`nextOccurrences` são as 3 próximas datas a partir de hoje (janela de 5 anos).
Serve para o card da listagem e, de quebra, é a **conferência cruzada**:
divergência entre esta prévia e a do motor local é o sinal de que as duas
implementações do `expandRule` saíram de sincronia.

### 3.2 Editar (`PATCH /activity-recurrence/:id`)

Mesma gramática do `PATCH /activity/:id`, para não haver duas:

- campo **ausente** não é tocado;
- `tagIds` e `responsibleUserIds` são o conjunto **completo** (`[]` desvincula
  tudo);
- `rule.endDate: null` limpa a data;
- **`rule` é substituída inteira** quando vem. Não há edição parcial de regra:
  "mudei só o `interval`" é ambíguo na hora de decidir o que fazer com
  `weekdays` e `monthDay`, e o formulário sempre tem a regra completa em mãos.

**Editar o modelo não reescreve as ocorrências já materializadas.** A partir do
primeiro toque, a tarefa daquele dia é de quem a tocou.

### 3.3 Apagar (`DELETE /activity-recurrence/:id`)

```jsonc
{ "deleted": true, "keptActivities": 12 }
```

As `Activity` já materializadas **ficam** e viram tarefas comuns
(`recurrenceId → null`): elas podem ter tempo apontado, comentário e anexo em
cima. `keptActivities` é quantas — bom para a confirmação dizer o que vai
sobrar.

---

## 4. Escrever numa ocorrência

Esta é a parte que muda menos do que parece: **as rotas de escrita de atividade
aceitam o id virtual**.

`PATCH /activity/rec:9f2c…:2026-09-07`, mover, comentar, anexar — toda escrita
passa antes por um tradutor que, vendo um id `rec:…`, materializa a ocorrência e
segue a operação sobre a atividade recém‑criada. **O card é arrastado e fica
onde foi solto**, sem o front saber que ele não existia até aquele instante.

A resposta é uma `Activity` normal, com o mesmo `include` de sempre: o id muda de
`rec:…` para um cuid, e é isso que a tela precisa reconciliar.

Três consequências:

- **Não é preciso chamar `materialize` antes de escrever.** A rota existe para
  quando você quer a linha sem uma edição junto (abrir o painel de detalhe, por
  exemplo). Ela é **idempotente**: chamar duas vezes devolve a mesma tarefa, sem
  escrita nenhuma.
- **Materialização concorrente é resolvida no servidor.** Duas abas arrastando o
  mesmo card não geram erro nem duplicata: o índice único decide quem cria e
  quem perdeu opera sobre a linha do vencedor.
- **A tarefa nasce no fim da coluna** do `initialStatus`, com o `dueDate` ao
  meio‑dia UTC do dia da ocorrência (a mesma convenção do resto do produto, que é
  o que mantém o dia‑calendário estável em qualquer fuso habitado).

### 4.1 Dispensar e remarcar

**Pelo botão de apagar do card:** `DELETE /activity/rec:9f2c…:2026-09-07` **não**
materializa para depois apagar — grava a exceção `SKIPPED` e responde
`{ "message": "Ocorrência dispensada" }`. É o resultado que a pessoa espera
("esta segunda não tem"), pelo botão que ela já conhece, sem linha morta no
banco.

**Pela agenda**, com a intenção explícita:

```jsonc
// POST /activity-recurrence/:id/exception
{ "date": "2026-09-07", "kind": "SKIPPED" }
{ "date": "2026-09-14", "kind": "RESCHEDULED", "newDate": "2026-09-15" }
```

`date` é sempre a data **original** gerada pela regra — é a identidade da
ocorrência, inclusive depois de remarcada. É idempotente por
`(rotina, data)`: dispensar duas vezes a mesma segunda é dispensar uma vez.

**Desfazer:** `DELETE /activity-recurrence/:id/exception/2026-09-07` →
`{ "deleted": true }`. A data volta ao calendário e o card virtual reaparece no
próximo refetch.

### 4.2 Realtime

- **`activity:created`** quando uma ocorrência é materializada — sem isso a
  segunda aba continuaria mostrando o card como virtual depois de a primeira ter
  arrastado.
- **`activity:deleted` com o id VIRTUAL** quando uma ocorrência é dispensada pelo
  botão de apagar. É o id do card na tela; mandar o id real deixaria um card
  fantasma que responde 400 ao ser arrastado.

---

## 5. Os erros que a tela precisa tratar

| Situação                                             | Resposta                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Materializar/dispensar uma data que a regra não gera | `400` — `A data 2026-09-09 não pertence a esta recorrência`                                     |
| Materializar uma data dispensada                     | `400` — `Esta data foi dispensada. Remova a exceção antes de criar a tarefa.`                   |
| Dispensar/remarcar uma data **já materializada**     | `400` — `Esta data já virou tarefa (<id>). Para dispensá-la, apague a tarefa.`                  |
| Remarcar sem `newDate`                               | `400` — `Remarcar exige a data nova (newDate)`                                                  |
| `endDate` antes de `startDate`                       | `400`                                                                                           |
| Responsável que não é membro da empresa              | `400` — o vínculo errado não ficaria numa tarefa, seria copiado para **toda** ocorrência futura |
| Rotina de outra empresa, ou inexistente              | `404`                                                                                           |
| Apagar uma exceção que não existe                    | `404`                                                                                           |

O terceiro caso é o que mais aparece na tela: a data já virou tarefa, então
dispensá‑la é apagar a tarefa (`DELETE /activity/:id` com o id real), não
esconder a ocorrência.

---

## 6. Mapeamento campo a campo

A resposta ponto a ponto ao §5 do handoff. Tudo se concentra em
`useRecurringTasks.ts`.

### 6.1 A regra

| Front (`RecurrenceRule`)                                | API (`rule`)                                         | Adaptação                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `frequency: 'once' \| 'daily' \| 'weekly' \| 'monthly'` | `ONCE \| DAILY \| WEEKLY \| MONTHLY`                 | **caixa** — `toUpperCase()` na ida, `toLowerCase()` na volta                |
| `interval`                                              | `interval`                                           | igual. A API aceita **1–366**; a UI limita a 1–12, e está certa             |
| `weekdays: number[]`                                    | `weekdays`                                           | igual (0 = domingo)                                                         |
| `monthDay: number \| 'last'`                            | `monthDay: number \| null` + `monthDayLast: boolean` | **um campo vira dois**: `'last'` → `{ monthDay: null, monthDayLast: true }` |
| `skipWeekends`                                          | `skipWeekends`                                       | igual                                                                       |
| `startDate`                                             | `startDate`                                          | igual — `YYYY-MM-DD` nos dois lados, **sempre dia puro**                    |
| `endDate: string \| null`                               | `endDate`                                            | igual. `null` = sem fim                                                     |

A API aceita `monthDay` de 1 a 31 e recorta para o último dia do mês (31 vira 28
em fevereiro). A UI oferecer só 1–28 + "último dia" é restrição **da tela**, não
do modelo: continue oferecendo o que oferece hoje.

### 6.2 O modelo da tarefa

| Front (`RecurringTemplate`)              | API                                            | Adaptação                                                               |
| ---------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `title`, `description`, `priorityNumber` | iguais                                         | `description` é HTML, sanitizado na escrita                             |
| `initialStatus`                          | `initialStatus`                                | igual                                                                   |
| `assignees: string[]` (nomes)            | `responsibleUserIds: string[]` (uuid)          | some a conversão nome↔id: agora existe catálogo de membros              |
| `tags: RecurringTag[]`                   | `tagIds: string[]` **ou** `tagNames: string[]` | envia ids (ou nomes, para criar na hora); a resposta devolve os objetos |
| `subtasks: { title, description }[]`     | igual                                          | o roteiro do modelo, sem status                                         |
| `active`                                 | `active`                                       | igual                                                                   |
| `rule`                                   | `rule`                                         | §6.1                                                                    |
| `id`, `createdAt`                        | iguais                                         | `tpl-local-…` vira cuid                                                 |

### 6.3 A ocorrência

| Front (`RecurringOccurrence`)     | De onde vem                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `id`                              | o `id` do card virtual — **mesmo formato**, `rec:<recurrenceId>:<YYYY-MM-DD>`      |
| `date`                            | `occurrenceDate`                                                                   |
| `status`                          | `status` do card virtual (= `initialStatus`), ou o da `Activity` materializada     |
| `touched`                         | existe `Activity` com `(recurrenceId, occurrenceDate)`, **ou** exceção para a data |
| `skipped`                         | exceção `SKIPPED` em `recurrences[].exceptions`                                    |
| `dueDate` alterado                | exceção `RESCHEDULED` → `newDate` (e `rescheduledTo` no card)                      |
| `hiddenInMonth`, `overdueInMonth` | **derivados no cliente** — não existem na API, e não devem existir                 |

---

## 7. O que continua sendo do cliente

Confirmado, e vale deixar escrito para ninguém "corrigir" isso no servidor
depois:

- **O colapso do board** (uma linha por regra). O servidor devolve o mês inteiro;
  o recorte é decisão de tela, muda sem migração, e o mesmo payload alimenta o
  board e a Agenda.
- **`overdueInMonth` e `hiddenInMonth`.** Derivados do "hoje" do navegador.
- **O "hoje".** É o dia‑calendário **local de quem olha**, revalidado no foco da
  aba e na virada da meia‑noite. Nada pré‑calculado que dependa de "hoje" sai da
  API.
- **`recurrence-engine.ts`.** Fica: a Agenda desenha o mês inteiro e expande a
  regra localmente. Os vetores de teste continuam sendo o contrato entre as duas
  implementações.

---

## 8. Roteiro da troca

Na ordem, e cada passo é entregável sozinho:

1. **`month-key.ts` sai.** O board devolve `monthNumber`, `from` e `to`; não há
   mais o que adivinhar a partir do `monthId`.
2. **A leitura passa a vir do board.** `boardOccurrences` deixa de expandir a
   partir do `localStorage` e passa a ler `recurrences` + os cards virtuais que
   já chegam nas colunas. `touched` vira "tem `Activity` com o par
   `(recurrenceId, occurrenceDate)`".
3. **A escrita passa a ir pela API.** Arrastar e editar já funcionam pelo id
   virtual, sem rota nova. Dispensar/remarcar viram
   `POST /activity-recurrence/:id/exception`.
4. **O formulário passa a criar rotina de verdade** —
   `POST /company/:companyId/activity-recurrence`. A tarefa avulsa
   (`frequency: 'once'`) continua indo por `POST /activity`.
5. **A persistência local sai.** A chave `workflow:recurring:v1:*` deixa de ser
   lida. **Não há migração**: o `v1` no nome existe justamente para o dado local
   poder ser descartado.

`recurring-mock.ts` pode ficar como sementes de demonstração, e os componentes
(`RecurrenceRuleEditor`, `RecurringAgenda`, …) não mudam.

---

## 9. Como conferir que os dois lados concordam

**O motor de datas.** Os vetores de aceite do `expandRule` estão em
[`recurrence-engine.spec.ts`](../src/activity-recurrence/recurrence-engine.spec.ts)
e passam nas duas implementações. Se um deles quebrar de um lado só, é aí que a
divergência está. Lembrete de calendário: **01/09/2026 é uma terça‑feira**.

**O board.** [`recurrence-board.service.spec.ts`](../src/activity-recurrence/recurrence-board.service.spec.ts)
cobre as quatro regras do card virtual e o recorte das exceções;
[`month-board-recurrence-payload.spec.ts`](../src/quarter/month-board-recurrence-payload.spec.ts)
cobre o formato de `occurrenceDate` e o mês datado.

**Em produção**, `nextOccurrences` é a conferência barata: se a prévia da API e a
do motor local discordarem para a mesma regra, as duas saíram de sincronia.

### 9.1 Limites que a UI deve respeitar

| Limite                   | Valor          | Efeito de estourar                                                                                                                                     |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `interval`               | 1..366         | `400`                                                                                                                                                  |
| `weekdays`               | cada item 0..6 | `400`                                                                                                                                                  |
| `monthDay`               | 1..31          | `400`                                                                                                                                                  |
| Ocorrências por expansão | 400            | A resposta é truncada em silêncio para o cliente (o servidor loga um `warn`). Não é alcançável por um mês de calendário: só por uma janela muito maior |
| `?year`                  | 1970..2999     | `400`                                                                                                                                                  |

---

## 10. O que continua em aberto

As duas do §6 do handoff, e a recomendação de lá segue valendo:

1. **A rotina concluída acumula em "Concluído"?** Uma diária materializada e
   concluída todo dia deixa ~22 cards na coluna. A API não esconde nada: uma
   `Activity` materializada é uma atividade normal e entra no quadro como
   qualquer outra. Se incomodar, o filtro é de tela — e esconder atividade real
   do quadro é surpresa pior que uma coluna cheia.
2. **Mês inexistente na materialização.** Quando a ocorrência cai num mês que a
   empresa ainda não tem, o mês é criado na hora, fora da transação. Nada a
   fazer no front.
