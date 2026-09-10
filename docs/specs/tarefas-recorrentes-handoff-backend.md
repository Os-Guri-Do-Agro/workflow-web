# Tarefas recorrentes — handoff para o backend

**Status:** frontend completo e em uso local · backend a fazer
**Atualizado:** 10/09/2026
**Contrato de referência:** [tarefas-recorrentes-backend-contract.md](./tarefas-recorrentes-backend-contract.md)
**Código:** [`src/features/tasks/recurring/`](../../src/features/tasks/recurring/)

---

## 0. Como ler este documento

O [contrato](./tarefas-recorrentes-backend-contract.md) continua sendo **a
especificação**: modelo de dados (§4), algoritmo de expansão (§5), vetores de
teste (§6), endpoints (§7), resolução de mês (§8), fuso (§9) e as duas mudanças
pedidas em `POST /activity` e `PATCH /activity/:id` (§10). **Nada disso mudou.**

Este documento é o **delta**: o que o frontend passou a fazer depois que aquele
contrato foi escrito, o que isso pede do backend que o contrato não previa, e o
mapeamento campo a campo para a troca do mock pela API não virar arqueologia.

Se você só tem tempo para uma seção, leia a **§3** — são as duas coisas que o
contrato atual **não** entrega e sem as quais a tela perde função.

---

## 1. O resumo em uma tela

O frontend saiu de "protótipo com dado fictício" e virou uma implementação
local completa: as regras são criadas pelo formulário de tarefa, gravadas em
`localStorage` por empresa, e as ocorrências são derivadas da regra a cada
render. **Nenhuma requisição de recorrência sai para o servidor** — a tarefa
avulsa (`frequency: 'once'`) continua indo pela API real.

Três mudanças de comportamento, todas de **exibição**, nenhuma de modelo:

| | O que é | Onde vive |
|---|---|---|
| **Colapso do board** | O quadro do mês mostra **uma linha por regra**, não uma por data | `boardOccurrences` |
| **Dívida visível** | Um chip "N atrasadas" no card, para atrasar não ficar invisível | `overdueInMonth` |
| **Estado persistido** | `localStorage` por empresa, sobrevive ao F5 | `workflow:recurring:v1:<companyId>` |

O modelo de dados que o contrato descreve (§4) continua exatamente igual — o
frontend não inventou campo novo em `ActivityRecurrence` nem em
`ActivityRecurrenceException`.

---

## 2. O que mudou desde o contrato

### 2.1 O board mostra uma linha por regra, não uma por data

**O problema.** O contrato descreve o board devolvendo um card virtual por
ocorrência do mês (§7.2), e era isso que o frontend desenhava. Uma regra
`DAILY` com `skipWeekends` em setembro/2026 gera **22 datas** — e o quadro
recebia 22 cards com o mesmo título, um embaixo do outro, na mesma coluna. Uma
`WEEKLY` de terça e quinta gerava 9.

Isso é o trabalho manual que a feature existe para matar, só que gerado
automaticamente: a pessoa passou a ter mais cards duplicados do que tinha
copiando à mão.

**A causa.** O board é a superfície do **mês**, mas uma rotina diária é uma
coisa do **dia**. Expandir todas as datas dentro das colunas trata a repetição
como N tarefas diferentes. O mês visto por dia já tem um lugar: a aba
**Agenda**.

**A regra nova.** Por recorrência, entram no quadro:

- a **ocorrência corrente** — a de hoje; se hoje não tem, a próxima do mês; se
  não há futuro no mês (mês passado, ou regra encerrada), a última;
- as **ocorrências já materializadas que continuam abertas** — trabalho que
  alguém começou e não terminou. Sem elas, começar a tarefa de segunda e voltar
  na quarta faria o trabalho em andamento sumir do quadro.

Tudo o mais vira um contador no card: `+N no mês`, que leva para a Agenda.

**O que isso pede do backend: nada.** O servidor devolve o mês inteiro; quem
recorta é o cliente. Decidir o que ocupa o quadro é decisão de tela — muda sem
migração, e o mesmo payload alimenta o board e a Agenda. **Não tente adivinhar o
recorte no servidor** e não pagine a expansão do mês.

### 2.2 Atrasar virou número, nunca card novo

Colapsar tinha um efeito colateral perverso: quem ignorava a rotina a semana
toda via um quadro **tão limpo quanto** quem estava em dia. O board deixava de
poluir e passava a esconder o problema.

O card corrente carrega um segundo contador, `overdueInMonth`: as datas da mesma
regra que **já venceram, ficaram fora do quadro e ninguém encostou**. Aparece
como um chip âmbar "6 atrasadas".

O critério que fechou a feature, e que vale gravar:

> **O quadro não engorda porque a regra repete, só porque a pessoa atrasou.**

Ignorar nunca cria card — vira número. Começar e não terminar cria card, porque
aí existe trabalho real inacabado.

**O que isso pede do backend:** ver §3.2. O cálculo é do cliente, mas ele só
consegue fazê-lo se souber quais datas já viraram atividade real.

### 2.3 O estado é local e persistido

Regras e alterações por data vivem em `localStorage`, chaveados por empresa:

```
workflow:recurring:v1:<companyId>
{ "templates": [...], "overrides": { "rec:<templateId>:<YYYY-MM-DD>": {...} } }
```

Não sincroniza entre navegadores nem entre pessoas — é a ponte até a API
existir. **Não há migração a fazer**: quando os endpoints subirem, o frontend
para de ler a chave e o dado local é descartado. A versão `v1` na chave existe
justamente para isso.

---

## 3. O que o backend precisa devolver e o contrato não previa

Duas coisas. Ambas são de **leitura**, nenhuma muda o modelo de dados.

### 3.1 As exceções do mês precisam chegar ao cliente

O contrato manda o board **omitir** as datas dispensadas (§7.2: "Exceção
`SKIPPED` para a data → nada"). Isso está certo para o **board** — o card não
deve aparecer no quadro.

Mas a **Agenda** desenha a data dispensada apagada, com um botão de trazer de
volta, e é esse o único desfazer que existe para a ação "dispensar esta
segunda". Se o servidor nunca contar quais datas foram dispensadas, a Agenda não
tem o que desenhar e **dispensar vira uma ação sem volta**.

> Este bug existiu na implementação local: `monthOccurrences` filtrava as
> dispensadas na origem e o botão de restaurar da Agenda era inalcançável. O
> card sumia e não sobrava nada em tela para clicar.

**Pedido:** o payload do mês deve trazer as exceções da empresa no intervalo do
board, junto das regras. A forma mais barata é embutir na resposta que já vai:

```json
{
  "recurrences": [
    {
      "id": "9f2c…",
      "title": "Reunião de alinhamento semanal",
      "rule": { "frequency": "WEEKLY", "weekdays": [1], "...": "..." },
      "initialStatus": "TODO",
      "active": true,
      "exceptions": [
        { "occurrenceDate": "2026-09-07", "kind": "SKIPPED" },
        { "occurrenceDate": "2026-09-14", "kind": "RESCHEDULED", "newDate": "2026-09-15" }
      ]
    }
  ]
}
```

Alternativa aceitável, se preferir manter o board enxuto:
`GET /company/:companyId/activity-recurrence/exception?from=&to=`. Custa uma
requisição a mais por mês navegado; o embutido é melhor.

### 3.2 `recurrenceId` e `occurrenceDate` nas atividades REAIS do board

O contrato já põe os dois campos na tabela `Activity` (§4). O que falta dizer é
que eles precisam ser **serializados no payload do board**, não só existir no
banco.

Sem eles o frontend não consegue:

- **evitar a duplicata**: uma atividade materializada é indistinguível de uma
  tarefa comum, então a regra continuaria gerando um card virtual para a mesma
  data e o dia apareceria duas vezes;
- **contar o atraso** (§2.2): "a rotina do dia 14 já foi feita" só é dedutível
  se a atividade real disser de qual regra e de qual data ela nasceu. Sem isso o
  dia 14 seria contado como atrasado mesmo estando concluído;
- **contar o `+N no mês`**: o total de datas da regra no mês é
  `virtuais + reais da mesma recorrência`.

```json
{
  "id": "8b1e…",
  "title": "Triagem dos bug reports abertos",
  "status": "DONE",
  "recurrenceId": "9f2c…",
  "occurrenceDate": "2026-09-14"
}
```

Tarefa comum devolve `recurrenceId: null` — é o que já está no modelo.

### 3.3 O que o backend NÃO precisa devolver

- **Total de atividades do mês.** O cabeçalho conta o que está na tela, e quem
  decide o que está na tela é o cliente (§2.1). Um total do servidor que somasse
  todas as virtuais anunciaria "53 atividades" num quadro com 10.
- **Nada de "atrasado".** É derivado no cliente a partir do calendário **local
  de quem olha** (§4.3). O relógio e o fuso do servidor não entram na conta.
- **Ordem dos cards virtuais.** O cliente reordena por
  `(occurrenceDate, priorityNumber, title)`.

---

## 4. A regra de colapso, precisa o suficiente para reimplementar

Está em `boardOccurrences`
([`useRecurringTasks.ts`](../../src/features/tasks/recurring/useRecurringTasks.ts)).
Não precisa existir no backend — está aqui para os dois lados falarem a mesma
língua quando alguém abrir um chamado de "sumiu um card".

### 4.1 O algoritmo

```
para cada recorrência R com ocorrências no mês:
    lista ← ocorrências de R no mês, SEM as dispensadas, ordenadas por data

    corrente ← a de hoje
             ?? a primeira com data > hoje
             ?? a última da lista

    mostradas ← { corrente } ∪ { o ∈ lista | o já foi tocada E o.status ≠ DONE }

    escondidas ← |lista| − |mostradas|
    atrasadas  ← |{ o ∈ lista | o ∉ mostradas E o.data < hoje E o não foi tocada }|

    emite as `mostradas`; os dois contadores vão SÓ na `corrente`
```

Três detalhes que não são óbvios:

1. **Os contadores vão só na corrente.** Repetidos em cada card, dariam a
   impressão de que cada um esconde outras tantas datas.
2. **`atrasadas` conta só o que está fora do quadro.** O card em tela já pinta o
   próprio prazo vencido de vermelho; contá-lo de novo seria avisar duas vezes a
   mesma coisa.
3. **`atrasadas` ⊆ `escondidas`.** São a parte da dívida que já venceu. Um mês
   futuro tem `escondidas > 0` e `atrasadas = 0`.

### 4.2 O que muda quando as ocorrências forem reais

Hoje "tocada" quer dizer "tem `override` local". No mundo com backend isso se
parte em dois, e o mapeamento é direto:

| Protótipo | Com a API |
|---|---|
| `override.status` | existe `Activity` com `(recurrenceId, occurrenceDate)` → **materializada** |
| `override.skipped` | existe exceção `SKIPPED` para a data |
| `override.dueDate` | existe exceção `RESCHEDULED` para a data |

Ou seja: **o colapso passa a valer só para os cards virtuais.** Atividade
materializada é atividade normal e entra no quadro como qualquer outra, sem
recorte. Isso simplifica o cliente e não muda o resultado para o caso comum.

**Uma decisão de produto cai junto** (§6.4): hoje a ocorrência tocada e
**concluída** sai do quadro no dia seguinte. Quando ela virar `Activity` real,
o caminho natural é ela ficar na coluna Concluído como qualquer tarefa — e uma
rotina diária passa a acumular ~22 cards em Concluído por mês.

### 4.3 O "hoje" é o do navegador

`hoje` é o dia-calendário **local de quem está olhando a tela**, e é revalidado
quando a aba volta ao foco e na virada da meia-noite
([`current-day.ts`](../../src/features/tasks/recurring/current-day.ts)). Uma aba
aberta durante a madrugada trocava o card de dia sozinha só depois do F5 — foi
bug e está corrigido.

Consequência para o backend: **não devolva nada pré-calculado que dependa de
"hoje"**. Duas pessoas em fusos diferentes olhando o mesmo board veem a mesma
lista de ocorrências e podem, legitimamente, ver contadores de atraso
diferentes. As datas em si continuam sendo data pura, como manda a §9 do
contrato.

---

## 5. Mapeamento campo a campo

O que o frontend tem hoje × o que o contrato define. É a lista de adaptações da
troca do mock pela API — todas concentradas em
[`useRecurringTasks.ts`](../../src/features/tasks/recurring/useRecurringTasks.ts).

### 5.1 A regra

| Front (`RecurrenceRule`) | API (`rule`) | Adaptação |
|---|---|---|
| `frequency: 'once' \| 'daily' \| 'weekly' \| 'monthly'` | `ONCE \| DAILY \| WEEKLY \| MONTHLY` | **caixa** — minúscula no front, maiúscula no enum |
| `interval: number` | `interval` | igual. A UI limita a **1–12** |
| `weekdays: number[]` | `weekdays` | igual (0 = domingo). A UI **nunca deixa esvaziar**: desmarcar o último dia é ignorado |
| `monthDay: number \| 'last'` | `monthDay: number \| null` + `monthDayLast: boolean` | **um campo vira dois**: `'last'` → `{ monthDay: null, monthDayLast: true }` |
| `skipWeekends: boolean` | `skipWeekends` | igual |
| `startDate: 'YYYY-MM-DD'` | `startDate` (DATE) | igual |
| `endDate: 'YYYY-MM-DD' \| null` | `endDate` (DATE, nullable) | igual. `null` = sem fim |

A UI só oferece **dia 1 a 28 + "último dia"** no seletor mensal. O motor aceita
29–31 e recorta para o último dia do mês (§5.3 do contrato) — a API deve
continuar aceitando, porque a restrição é da tela, não do modelo.

### 5.2 O modelo da tarefa

| Front (`RecurringTemplate`) | API | Adaptação |
|---|---|---|
| `title`, `description`, `priorityNumber` | iguais | — |
| `initialStatus: ActivityStatus` | `initialStatus` | igual (`TODO\|IN_PROGRESS\|IN_TESTING\|DONE`) |
| `assignees: string[]` (**nomes**) | `responsibleUserIds: string[]` (**uuid**) | o protótipo não tem catálogo de membros; a conversão nome↔id some |
| `tags: RecurringTag[]` (objeto) | `tagIds: string[]` | envia só os ids; a resposta devolve os objetos |
| `subtasks: { title, description }[]` | igual | o roteiro do modelo, sem status |
| `active: boolean` | `active` | igual — pausada não gera ocorrência nova |
| `rule` | `rule` | §5.1 |
| `id`, `createdAt` | iguais | id local é `tpl-local-…`; passa a ser uuid |

### 5.3 A ocorrência

| Front (`RecurringOccurrence`) | De onde vem com a API |
|---|---|
| `id` | o `id` virtual `rec:<recurrenceId>:<YYYY-MM-DD>` do §7.2 — **mesmo formato, de propósito** |
| `date` | `occurrenceDate` |
| `status` | `initialStatus` da regra, ou o status da `Activity` materializada |
| `touched` | existe `Activity` materializada, ou exceção para a data |
| `skipped` | exceção `SKIPPED` |
| `hiddenInMonth`, `overdueInMonth` | **derivados no cliente** (§4.1) — não existem na API |

---

## 6. Decisões que continuam abertas

As quatro do §14 do contrato seguem valendo (mês inexistente na materialização,
edição do modelo afetar o já materializado, teto de expansão, documento/anexo na
recorrência). Somam-se duas, nascidas do trabalho de frontend:

5. **A rotina concluída acumula em "Concluído"?** (§4.2) Uma diária materializada
   e concluída todo dia deixa ~22 cards na coluna. Alternativas: deixar (é
   trabalho feito de verdade, e o board já acumula tarefa comum concluída), ou
   esconder as materializadas concluídas de dias anteriores. **Recomendo
   deixar** e revisitar se incomodar — esconder atividade real do quadro é
   surpresa pior que uma coluna cheia.
6. **As exceções vêm embutidas no board ou em rota própria?** (§3.1) Recomendo
   embutidas: economiza uma requisição por mês navegado e mantém a Agenda e o
   board alimentados pelo mesmo payload.

---

## 7. Como conferir que os dois lados concordam

### 7.1 O motor de datas

Os 9 vetores da **§6 do contrato** continuam sendo o teste de aceite do
`expandRule`, e passam no motor do frontend
([`recurrence-engine.ts`](../../src/features/tasks/recurring/recurrence-engine.ts)).
Se passarem no backend, as duas implementações concordam. Nada mudou aí.

Lembrete de calendário: **01/09/2026 é uma terça-feira**.

### 7.2 O board (casos que o frontend já valida)

Setembro/2026, regra `DAILY` com `skipWeekends`, `startDate = 2026-09-10`
(15 ocorrências no mês). "Hoje" fixado para o teste ser determinístico:

| Situação | Cards no quadro | `hiddenInMonth` | `overdueInMonth` |
|---|---|---|---|
| Hoje = 10/09, nada tocado | 1 (o do dia 10) | 14 | 0 |
| Hoje = 11/09, nada tocado | 1 (o do dia 11) | 14 | 1 |
| Hoje = 18/09, nada tocado desde o dia 10 | **1** (o do dia 18) | 14 | **6** |
| Idem, dia 11 dispensado | 1 | 13 | 5 |
| Idem, dia 14 concluído | 1 | 13 | 4 |
| Hoje = 11/09, dia 10 em andamento | **2** (dia 10 e dia 11) | 13 | 0 |
| Hoje = 11/09, dia 10 concluído | 1 (o do dia 11) | 14 | 0 |
| Board de **outubro**/2026 (22 ocorrências) | 1 | 21 | **0** |

As oito linhas acima são verificadas contra a implementação do frontend.

Duas invariantes que valem como asserção em qualquer implementação:

- `overdueInMonth ≤ hiddenInMonth`, sempre;
- mês **futuro** ⇒ `overdueInMonth = 0`.

---

## 8. O que some do frontend quando a API chegar

| Arquivo | Destino |
|---|---|
| [`month-key.ts`](../../src/features/tasks/recurring/month-key.ts) | **apagado.** Adivinha `'YYYY-MM'` a partir do `monthId` porque o contrato atual não devolve o intervalo de datas do mês. Some com a §8 |
| Persistência em `localStorage` | **apagada.** A chave `workflow:recurring:v1:*` deixa de ser lida; sem migração |
| [`recurring-mock.ts`](../../src/features/tasks/recurring/recurring-mock.ts) | fica como sementes de demonstração, não carregadas |
| [`useRecurringTasks.ts`](../../src/features/tasks/recurring/useRecurringTasks.ts) | **vira o composable de Vue Query.** É o único arquivo que troca de dentro |
| [`recurrence-engine.ts`](../../src/features/tasks/recurring/recurrence-engine.ts) | **fica.** A Agenda desenha o mês inteiro e precisa expandir a regra localmente |
| [`current-day.ts`](../../src/features/tasks/recurring/current-day.ts) | **fica.** O "hoje" é do navegador (§4.3) |
| Componentes (`RecurrenceRuleEditor`, `RecurringAgenda`, …) | **não mudam** |

A ordem de entrega sugerida continua a do **§13 do contrato**. Os passos 1 e 2
(`status` no `POST /activity`, `monthId` derivado do `dueDate`, tabelas + CRUD)
não dependem de nada deste documento — as duas seções §3.1 e §3.2 só entram no
passo 3, quando o board passar a devolver os cards virtuais.
