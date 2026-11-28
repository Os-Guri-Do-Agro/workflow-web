# Ala Marketing M3: Financeiro, Ativações, Parceiros e Orçamentos

**Status:** Implementado no harness (sem commit). Junção e auditoria em 06/11/2026.
**Épico:** [ala-marketing.md](../../../../epicos/ala-marketing.md) · **Fundação:** [00-fundacao.md](./00-fundacao.md) (leia as "Regras para quem implementa uma fase")
**Criado em:** 2026-11-06

## Objetivo

A planilha de gastos e o histórico de parceiros saem do celular: lançamentos com nota fiscal, orçamento x realizado, recorrentes e exportação; feiras, palestras e ações com checklist, fotos e custo; parceiros com WhatsApp, último contato e próximo passo; orçamentos de fornecedores.

## Divisão

- **M3-A, Financeiro:** lançamentos, categorias, notas fiscais, aviso de lançamento sem nota, orçamento x realizado, recorrentes, visão do ano, exportar Excel e PDF, zip das notas do mês.
- **M3-B, Ativações, Parceiros e Orçamentos:** ativações (checklist, fotos, custo, calendário), parceiros (contatos, WhatsApp, último contato, próximo passo), orçamentos (com arquivos, escolher o vencedor e lançar no financeiro) e o componente `QuotesPanel` que a Gráfica (M2) usa na junção.

Mesmo worktree, arquivos separados. M1 e M2 estão sendo feitas em OUTROS worktrees ao mesmo tempo (campanhas, cards e calendário são provisórios aqui). As tabelas delas existem: leia pelo Prisma quando precisar (ex.: lista de campanhas para o select do lançamento).

**Financeiro e papel:** TODA rota do financeiro chama `access.assertFinance(ctx)` (Visualizador vê por padrão; o Dono pode tirar). Gasto de ativação e de orçamento aparece na ativação e no parceiro também para quem não vê o financeiro? NÃO: valor em dinheiro só aparece para quem `canSeeFinance`; os outros veem a ativação sem os valores.

---

## M3-A: Financeiro

### Regras
- Lançamento: `date` `'YYYY-MM-DD'`, `amountCents > 0`, `category` de `settings.expenseCategories`, `status` `PAID` ou `PLANNED`. Vínculos opcionais (campanha, ativação, card, parceiro) precisam ser do grupo e da MESMA marca do lançamento (400 se não).
- **Sem nota:** pago, sem arquivo de nota e sem `noInvoiceNeeded` = aviso (chip na linha, contador no topo, filtro `missingInvoice=1`).
- **Recorrente:** regra mensal (`dayOfMonth`; mês curto usa o último dia; `startMonth`..`endMonth`). `GET` nunca escreve: a tela mostra "N recorrentes ainda não lançados neste mês" com o botão Lançar, que chama o `generate` (idempotente pelo `@@unique([recurringId, date])`: o P2002 é ignorado, não é erro).
- **Orçamento:** por marca, mês e categoria (`""` = total do mês). Só ADMIN+ edita.
- **Exportar:** Excel `.xlsx` de verdade (OOXML) sem dependência nova: escreva um gerador mínimo (zip com `zlib.deflateRawSync` + CRC32 e as partes XML) em `finance/export/`, com teste que abre o zip e confere as partes. PDF com `pdfkit` (já é dependência). Zip das notas do mês lendo do storage (`DriveStorageService.download`; importe o `DriveModule` no seu módulo), com teto de 300 MB (acima, 400 com a frase). Nome de arquivo sem acento no `Content-Disposition` (e `filename*` UTF-8).

### API (`workflow-api/src/marketing/finance/`, prefixo `/marketing/g/:groupId`)

| Rota | Papel | O quê |
|---|---|---|
| `GET /finance/expenses?month=YYYY-MM&companyId&category&campaignId&activationId&status&missingInvoice=1&q` | VIEWER + financeiro | Linhas com `invoices[]` (URLs), nomes de parceiro, campanha e ativação, `missingInvoice`; `totals { paidCents, plannedCents }` |
| `POST /finance/expenses` | EDITOR | Campos do lançamento |
| `PATCH /finance/expenses/:expenseId` | EDITOR | |
| `DELETE /finance/expenses/:expenseId` | `canDelete` | Apaga as notas do storage |
| `POST /finance/expenses/:expenseId/invoices` | EDITOR | Ticket de upload (dono `{ expenseId }`) |
| `DELETE /finance/expenses/:expenseId/invoices/:assetId` | EDITOR | |
| `GET /finance/summary?month&companyId` | VIEWER + financeiro | Por categoria: orçamento, pago, previsto, diferença; total; quantos sem nota; recorrentes pendentes do mês |
| `GET /finance/year?year&companyId` | VIEWER + financeiro | 12 meses x categorias (pago e previsto) e orçamentos |
| `GET /finance/budgets?year&companyId` / `PUT /finance/budgets` / `DELETE /finance/budgets/:budgetId` | VIEWER / ADMIN / ADMIN | `PUT { companyId, month, category, amountCents }` faz upsert |
| `GET /finance/recurring` / `POST` / `PATCH /:ruleId` / `DELETE /:ruleId` | VIEWER / EDITOR / EDITOR / ADMIN | Regras |
| `POST /finance/recurring/generate` | EDITOR | `{ month }` → `{ created, skipped }` |
| `GET /finance/options` | VIEWER + financeiro | Campanhas, ativações, parceiros e cards das marcas visíveis, para os selects |
| `GET /finance/export.xlsx?month=` ou `?year=` | VIEWER + financeiro | Arquivo |
| `GET /finance/export.pdf?month=` | VIEWER + financeiro | Relatório do mês (por categoria, orçamento x realizado, lista) |
| `GET /finance/invoices.zip?month=` | VIEWER + financeiro | Notas do mês |

Download no front: as três rotas de arquivo vêm por `api.get(..., { responseType: 'blob' })` (o axios do app manda o token) e o front salva com o nome do `Content-Disposition`.

### Front (`features/marketing/finance/`, `service/marketing/marketing-finance.ts`, `views/MarketingFinanceView.vue`)
Navegador de mês; abas **Lançamentos** (tabela densa com filtros na URL, linha de lançamento rápido no topo, soltar a nota na linha, chip "sem nota", totais pago e previsto), **Orçamento** (categoria: orçado, pago, previsto, barra fina, diferença em vermelho quando estoura; ADMIN edita na célula), **Ano** (matriz 12 meses, totais por linha e coluna), **Recorrentes** (regras e o aviso de pendentes do mês). Botões Excel, PDF e "Notas do mês (.zip)". Campo de dinheiro com `parseMoneyToCents`/`formatCents`. Somente leitura para VIEWER.

### Critérios de aceite (M3-A)
- [ ] F1. Lançamento com campanha de outra marca: 400. Categoria fora da lista: 400.
- [ ] F2. Pago sem nota aparece com aviso e no filtro; subir a nota tira o aviso; `noInvoiceNeeded` também tira.
- [ ] F3. Recorrente do dia 31 em fevereiro cai no dia 28 (ou 29); gerar duas vezes o mesmo mês não duplica.
- [ ] F4. Resumo do mês bate com a soma dos lançamentos (teste com 3 categorias, pago e previsto) e mostra o estouro do orçamento.
- [ ] F5. O `.xlsx` abre (o teste lê o zip e confere `[Content_Types].xml`, `xl/workbook.xml` e a planilha com os valores); o PDF começa com `%PDF`; o zip das notas tem os arquivos com os bytes certos.
- [ ] F6. Com `viewerSeesFinance = false` no banco, Diretoria leva 403 em tudo do financeiro e a aba some do menu (o menu já esconde; a tela também trata o 403).
- [ ] F7. Freelancer não vê lançamento da Emmitec.

---

## M3-B: Ativações

### API (`workflow-api/src/marketing/activations/`)

| Rota | Papel | O quê |
|---|---|---|
| `GET /activations?from&to&status&kind&companyId&partnerId` | VIEWER | Com progresso do checklist, quantas fotos, parceiro e, para quem `canSeeFinance`, o custo (soma dos `MarketingExpense` com o `activationId`) |
| `GET /activations/:activationId` | VIEWER | Detalhe, checklist, fotos (URLs), lançamentos (só leitura e só com financeiro), orçamentos |
| `POST /activations` / `PATCH /:id` / `DELETE /:id` | EDITOR / EDITOR / `canDelete` | `{ companyId, kind, title, startAt, endAt?, location?, partnerId?, status?, notes?, results? }`. Fim >= início. Apagar remove as fotos do storage |
| `POST /activations/:id/checklist` / `PATCH .../:itemId` / `DELETE .../:itemId` | EDITOR | Itens `TASK` |
| `POST /activations/:id/checklist/template` | EDITOR | Checklist padrão de evento (estande e banner, folders com QR testado, brindes, cadastro no tablet ou link, fotos e vídeos, lista de contatos, retirada do material) se ainda não houver itens |
| `POST /activations/:id/photos` / `DELETE .../:assetId` | EDITOR | Ticket de upload (dono `{ activationId }`) |
| `GET /activations/calendar?from&to&companyId` | VIEWER | Para o calendário |

### Front (`features/marketing/activations/`, `views/MarketingActivationsView.vue`)
Lista Próximas e Passadas; painel pela URL `?ativacao=<id>`: dados, checklist, fotos em grade (várias de uma vez; abrir no `FileViewer`), custo e lançamentos (só com financeiro), orçamentos (`QuotesPanel`), "Como foi". **Fonte do calendário:** `features/marketing/activations/activations-calendar-source.ts` exporta `activationsCalendarSource: MarketingCalendarSource` (contrato em `features/marketing/marketing-calendar.ts`), `draggable: false`, `to: { name: 'marketing-activations', query: { ativacao: id } }`.

## M3-B: Parceiros

### API (`workflow-api/src/marketing/partners/`)

| Rota | Papel | O quê |
|---|---|---|
| `GET /partners?status&kind&companyId&q&nextStepDue=1` | VIEWER | Com `lastContactAt`, `nextStep`, `nextStepAt`, `whatsappUrl` (`https://wa.me/<dígitos>`) |
| `POST /partners` / `PATCH /:id` / `DELETE /:id` | EDITOR / EDITOR / `canDelete` | Telefone por `normalizePhone`; e-mail e Instagram validados de leve |
| `GET /partners/:id/contacts` / `POST` / `DELETE /:contactId` | VIEWER / EDITOR / autor ou ADMIN | `{ channel, note, at? }`; o `lastContactAt` do parceiro é o maior `at` (recalculado ao criar e apagar) |

### Front (`features/marketing/partners/`, `views/MarketingPartnersView.vue`)
Tabela densa com status (Prospecção, Negociando, Ativo, Pausado, Encerrado), tipo, cidade, último contato, próximo passo (vencido em vermelho); painel `?parceiro=<id>`: contato com botão WhatsApp (abre `wa.me` em nova aba), Instagram, histórico de contatos com "registrar contato", próximo passo com data, ativações ligadas, orçamentos (`QuotesPanel`).

## M3-B: Orçamentos

### API (`workflow-api/src/marketing/quotes/`)

| Rota | Papel | O quê |
|---|---|---|
| `GET /quotes?partnerId&cardId&activationId&status` | VIEWER | Com arquivos; `amountCents` só para quem `canSeeFinance` (os outros recebem `null`) |
| `POST /quotes` / `PATCH /:id` / `DELETE /:id` | EDITOR / EDITOR / `canDelete` | `{ description, amountCents, companyId?, partnerId?, supplierName?, cardId?, activationId?, validUntil?, notes? }`; parceiro OU fornecedor avulso; vínculos do grupo e da marca |
| `POST /quotes/:id/choose` | ADMIN | Vira `CHOSEN`; os outros do mesmo card ou ativação viram `DECLINED`. `{ createExpense?: { date, category } }` cria o lançamento PREVISTO ligado (card, ativação, parceiro) |
| `POST /quotes/:id/files` / `DELETE .../:assetId` | EDITOR | Ticket de upload (dono `{ quoteId }`) |

### Front
`features/marketing/quotes/QuotesPanel.vue` com props `groupId`, `companyId?`, `partnerId?`, `cardId?`, `activationId?`: lista, novo orçamento, arquivos, Escolher (ADMIN) com a opção de lançar no financeiro. Usado na ativação e no parceiro aqui, e na Gráfica (M2) na junção: não dependa de nada da M2.

### Critérios de aceite (M3-B)
- [ ] V1. Ativação com fim antes do início: 400. Checklist padrão cria os itens uma vez só.
- [ ] V2. Fotos sobem pelo ticket, aparecem na grade e somem do storage ao apagar a ativação.
- [ ] V3. Custo da ativação soma os lançamentos ligados e não aparece para quem não vê o financeiro (`viewerSeesFinance = false` no banco).
- [ ] P1. Telefone "(67) 99999-8888" vira `5567999998888` e o botão abre `https://wa.me/5567999998888`.
- [ ] P2. Registrar contato atualiza o último contato; apagar o mais recente volta para o anterior.
- [ ] Q1. Escolher um orçamento recusa os outros do mesmo card e, com `createExpense`, cria o lançamento previsto ligado; Editor tentando escolher leva 403.
- [ ] Q2. A fonte do calendário devolve a ativação do mês.

---

## Ambiente de cada agente

| | Worktree | Banco | API | Vite |
|---|---|---|---|---|
| M3-A | `C:\TRABALHO\workflow\wt\m3` | `wf_m3a` | 3631 | 5185 |
| M3-B | `C:\TRABALHO\workflow\wt\m3` | `wf_m3b` | 3632 | 5186 |

Mesmos comandos da M1 (seção "Ambiente" de [m1-aprovacao-calendario.md](./m1-aprovacao-calendario.md)), trocando banco, porta e `VITE_CACHE_DIR` (`node_modules/.vite-m3a` / `-m3b`). Postgres (55432) e fake-storage (54329) já estão no ar e são de todos.

## Change Log

| Data | Versão | Mudança |
|---|---|---|
| 2026-11-06 | 0.1 | Spec da M3 com contrato de API e divisão em dois agentes |
| 2026-11-06 | 1.0 | M3-A (170 checagens, xlsx conferido no openpyxl e zip no .NET) e M3-B (cerca de 250) entregues e juntados; fonte de ativações no calendário. Auditoria: histórico e painel sem valores para quem não vê o financeiro; Editor só apaga nota, foto, item e arquivo que ele criou; escolher orçamento travado contra dois cliques e contra dois escolhidos no mesmo item |
