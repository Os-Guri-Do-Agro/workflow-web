# Spec: Tarefa com tags, arquivos visíveis e documentos .md

**Status:** Em Implementação (código completo; bloqueada no gate de e2e, ver *Estado da entrega*)
**Autor:** Nicolas (via spec-driven, modo 3)
**Criado em:** 2026-08-10
**Última atualização:** 2026-08-10
**Versão:** 0.2
**Épico:** [workflow-v2](../../../epicos/workflow-v2.md)
**Antecessora:** [workflow-v2 R1 — A tarefa como superfície de trabalho](../../../workflow-v2-r1-tarefa-como-superficie.md)
**Repos:** `work-flow` (frontend) + `workflow-api` (backend)

---

## Visão Geral

A tarefa ganha três coisas que hoje não existem ou existem mal: **tags livres reutilizáveis** por empresa (estilo Azure Boards), **visualização de arquivos** que não seja uma lista de links azuis, e **documentos `.md` de primeira classe** dentro da atividade, porque o trabalho aqui é spec-driven com IA e o markdown é o conteúdo, não um anexo.

## Motivação / Contexto de Negócio

O que custa não fazer:

1. **Não existe eixo de classificação transversal.** A atividade só pode ser recortada por mês, status, prioridade e responsável. Não dá para responder "o que é do CMS?" ou "o que é dívida técnica?" sem ler título por título. Nota já tem `tags` (`Note.tags String[]`), tarefa não tem nada.
2. **Arquivo na tarefa é um link.** O painel mostra `<a>` com o nome do arquivo e, se for imagem, um thumb de 64px ([TaskDetailPanel.vue:616-637](../../../../../src/features/tasks/components/TaskDetailPanel.vue#L616-L637)). Não há tamanho, tipo, autor, preview de PDF nem forma de ver a imagem grande sem abrir outra aba. O mesmo markup está duplicado em quatro lugares.
3. **O markdown não tem casa.** O fluxo real é: escrever a spec em `.md`, jogar no agente, iterar. Hoje esse `.md` ou vira anexo opaco (baixa, abre fora, perde o contexto) ou vira cópia colada na descrição, que é HTML do TipTap e destrói o markdown cru que o agente precisa receber de volta.
4. **A hierarquia pai/filha não carrega contexto.** Atividade pai é módulo, filhas são frentes (`(cms)`, `(app)`). O `Leia-primeiro.md` do módulo é invisível de dentro da filha, que é exatamente onde a pessoa está trabalhando.

---

## Research Findings

**Stack:** Vue 3.5 · Vite 7 · TS 5.9 · Vuetify 4 + reka-ui 2 · Pinia 3 · Vue Query 5 · TipTap 3.28 · `marked` 18 + `dompurify` 3.4 · lucide · tokens em [plugins/tokens.ts](../../../../../src/plugins/tokens.ts) — API NestJS 11 + Prisma + Postgres (Supabase), Storage no bucket `workflow-attachments`, deploy Railway

### O que já existe e vai ser reaproveitado

| Ativo | Onde | Uso nesta rodada |
|---|---|---|
| `renderMarkdown()` / `renderHtml()` | [src/composables/useMarkdownRenderer.ts](../../../../../src/composables/useMarkdownRenderer.ts) | Render de `.md` já resolvido: `marked` + DOMPurify, memoizado, com highlight de código. Não escrever renderer novo |
| `useActivityDetail` | [src/features/tasks/useActivityDetail.ts](../../../../../src/features/tasks/useActivityDetail.ts) | Gravação por campo com otimista, rollback só das chaves tocadas, `retry` e `waitForIdle()`. `tags` entra como `ActivityField` novo |
| `ActivitySelect.vue` | [src/components/ui/ActivitySelect.vue](../../../../../src/components/ui/ActivitySelect.vue) | Molde do `TagInput`: reka `ComboboxRoot` + campo de busca no topo + item fixo. Já resolve teclado e portal |
| `note-palette.ts` | `src/features/notes/note-palette.ts` | Precedente de paleta persistida como dado (não como tema). Molde do `tag-palette.ts` |
| `SaveStatus` + `save-state.ts` | `src/components/ui/` | Indicador honesto de autosave, já consumido pelo painel. O editor de doc usa o mesmo |
| `AppDialog` / `ConfirmDialog` | `src/components/ui/` | Toda confirmação de remoção passa por aqui. Zero `v-dialog` |
| `emitActivityChange` | `workflow-api/src/activity/activity.service.ts` | Já propaga anexo como `updated` da atividade ([:566](../../../../../../workflow-api/src/activity/activity.service.ts#L566)). Tag e doc entram no mesmo caminho, sem evento novo |
| `HtmlSanitizerService.toPlainText()` | `workflow-api/src/shared/security/` | Já usado antes da IA e do embedding |
| `CompanyRoleGuard` + `@RequireRole(WORKER)` | `workflow-api/src/auth/` | Todo endpoint de atividade já é WORKER. Tag e doc seguem igual |

### Estado atual dos três alvos

**Tags:** não existem em `Activity`. O precedente `Note.tags String[]` ([schema.prisma:259](../../../../../../workflow-api/prisma/schema.prisma#L259)) é array solto: sem cor, sem rename global, sem defesa contra duplicata por acento.

**Arquivos:** o modelo `Attachment` tem só `id`, `url`, `filename`, `activityId`, `createdAt` ([schema.prisma:159-167](../../../../../../workflow-api/prisma/schema.prisma#L159-L167)). Sem `mimeType`, `size` nem autor, qualquer visualização decente vira adivinhação por extensão. O upload é single-file (`FileInterceptor('file')`), o limite de 10MB só existe no cliente ([TaskForm.vue:78](../../../../../src/components/tasks/TaskForm.vue#L78)) e o servidor não valida nada. O bucket é público (`getPublicUrl`, sem URL assinada).

**Markdown:** não há campo nenhum. `Activity.description` é HTML do TipTap desde a R1.

**Duplicação de markup de anexo em 4 lugares:** [TaskDetailPanel.vue:616](../../../../../src/features/tasks/components/TaskDetailPanel.vue#L616), [TaskDetailsView.vue:981](../../../../../src/features/tasks/TaskDetailsView.vue#L981) e [:1193](../../../../../src/features/tasks/TaskDetailsView.vue#L1193), e a capa do card em [KanbanBoard.vue:178](../../../../../src/components/tasks/KanbanBoard.vue#L178).

### Consumidores do payload de atividade (todos precisam do campo novo)

| Consumidor | Onde | Hoje traz |
|---|---|---|
| `ACTIVITY_INCLUDE` | `activity.service.ts:25-38` | `responsibles`, `attachments`, `subtasks` |
| `findMonthBoard` (kanban de `/tasks/:month`) | `quarter.service.ts:68-95` | idem, com `attachments: true` por card |
| `/dashboard/workspace` (cards do `/board`) | `dashboard.service.ts:48-130` | `select` explícito, **sem** anexos |
| `KanbanTask` | `KanbanBoard.vue:39-47` | `attachments?: { filename, url }[]` |
| `ActivityItem` (store do workspace) | `workspaceStores.ts:28-46` | sem anexos, sem tags |

**Não é consumidor:** o board público por token (`/public/board/:token`) é o Canvas com snapshot Yjs ([share.service.ts:91](../../../../../../workflow-api/src/share/share.service.ts#L91)), não o kanban. Nada a fazer lá.

### Padrões a seguir

- Zero hex em componente: só tokens de `plugins/tokens.ts`. Cor de tag é **chave de paleta** persistida, resolvida para token no front
- `lucide-vue-next` para todo ícone novo; nunca `mdi-*`
- Zero `v-dialog`; overlay é `AppDialog`, tela cheia é `Teleport to="body"`
- Sem em-dash em copy visível
- Todo `v-html` passa por `renderMarkdown`/`renderHtml`, com `<!-- eslint-disable-next-line vue/no-v-html -->` e comentário dizendo por onde passou
- `prefers-reduced-motion: reduce` respeitado em animação nova
- Toda query de tag e de doc filtra por empresa na cláusula `where`, nunca só no guard

### Breaking Changes

1. **`POST /activity/:id/attachment` passa a rejeitar `.md`/`.markdown`** com 400 e mensagem apontando para o endpoint de documento. Consumidores: `TaskDetailsView` (3 chamadas) e `TasksView:177`, todos ajustados nesta rodada para rotear `.md` ao endpoint novo. Anexos `.md` **já gravados** continuam existindo e aparecem na lista de arquivos normalmente (não são migrados).
2. **`Attachment` ganha 3 colunas nullable.** Nenhum consumidor quebra (campos novos são opcionais), mas todo consumidor precisa tratar `size: null` e `uploadedById: null` nos registros legados.
3. **`GET /activity/:id` ganha `tags`, `docs` e `inheritedDocs`.** Aditivo. `docs` vem **sem** `content` de propósito (ver Decisão A4).

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| **Alto** | Conteúdo dos docs infla o payload do board. `findMonthBoard` já inclui `attachments: true` por card e por subtarefa; incluir markdown de spec (dezenas de KB cada) em 40 cards derruba a tela | `ActivityDoc.content` **nunca** entra em payload de lista. Board e `GET /activity/:id` trazem só metadados + `_count`. Content vem por `GET /activity/doc/:docId`, sob demanda, cacheado por Vue Query. AC mede o tamanho da resposta do board antes e depois, com teto de +15% |
| **Alto** | XSS via markdown. `marked` repassa HTML cru embutido no `.md`, e o conteúdo é escrito por qualquer WORKER da empresa | `renderMarkdown` já sanitiza com DOMPurify e é o **único** caminho de render. AC explícito com `<img src=x onerror=...>`, `<script>` e `[x](javascript:alert(1))` dentro do `.md`. Nenhum `v-html` novo fora do composable |
| **Alto** | Autosave do doc entra em laço: `onInput` grava, a resposta entra no cache, o watcher reescreve o textarea, dispara `onInput` de novo | Mesma guarda do `InlineEditText.vue:116-123` e do editor de descrição da R1: o watcher só aplica valor de fora quando (a) o campo não está focado **e** (b) não há rascunho sujo **e** (c) o texto difere. AC: digitar 2 minutos sem o cursor pular |
| **Médio** | Tag nunca é excluída (decisão do produto), então o catálogo da empresa só cresce e o autocomplete vira lixão | Busca é **no servidor** (`GET /tag?q=`), ordenada por uso desc e limitada a 50. A lista mostra a contagem de uso. Tag com 0 uso aparece por último. Sem exclusão, mas com renomeação livre, o caminho de conserto é renomear, não apagar |
| **Médio** | Duplicata de tag por caixa, acento ou espaço (`Bug`, `bug`, `Bùg `) polui o catálogo para sempre, já que não dá para excluir | `slug` normalizado (lowercase + `NFD` sem diacrítico + trim + espaços colapsados) com `@@unique([companyId, slug])`. `POST /tag` é idempotente por slug e trata `P2002` relendo o existente (corrida entre dois usuários criando a mesma tag) |
| **Médio** | Backfill de `mimeType` por extensão erra (arquivo sem extensão, extensão mentindo sobre o conteúdo) | O backfill é best-effort e o campo é nullable. O front deriva o tipo por `mimeType ?? extensão ?? 'other'`, e `other` tem ícone e download, nunca quebra. Nenhuma decisão de segurança depende do `mimeType` gravado |
| **Médio** | Doc gigante (spec de 300KB colada) trava o textarea e estoura o payload | Teto de **512KB** por doc validado no servidor, com 400 em pt-BR. O editor mostra o contador e avisa a partir de 80% do teto |
| **Médio** | Dois docs marcados como principal na mesma atividade (corrida entre duas abas) deixam a herança ambígua | Índice único parcial no Postgres (`CREATE UNIQUE INDEX ... WHERE "isPrimary"`) escrito à mão na migration, mais transação que zera o anterior antes de marcar o novo. O banco é a última linha, não a única |
| **Médio** | Anexo continua em bucket público sem URL assinada; o viewer torna o conteúdo mais visível dentro do produto, o que pode dar falsa sensação de que é privado | Dívida **pré-existente**, não introduzida aqui, e explicitamente fora do escopo. Registrada em Follow-up com o caminho (URL assinada com TTL). Nenhuma copy nova afirma que o arquivo é privado |
| **Baixo** | PDF embutido bloqueado por política do navegador ou por `X-Frame-Options` do Storage | O viewer usa `<object>` com conteúdo filho: quando o tipo não pode ser renderizado, o navegador mostra o filho (cartão de download) por conta própria, na hora. Descartada a alternativa de medir a altura do elemento depois de um prazo, que dá falso positivo e esconde PDF funcionando. Imagem e download nunca dependem do embed |
| **Baixo** | `dashboard.service` passa a fazer join de tags para todas as atividades de todas as empresas do usuário | O join é sobre a pivot com índice em `tagId`/`activityId`, e o `select` traz só `id`, `name`, `color`. Medir o tempo do `/dashboard/workspace` antes e depois; se passar de +100ms, mover a tag do `/board` para carregamento sob demanda |

---

## Requisitos Não-Funcionais

- **Segurança:** todo markdown renderizado passa por `renderMarkdown` (DOMPurify). Upload valida tamanho (10MB) e rejeita tipos executáveis (`.exe`, `.bat`, `.cmd`, `.sh`, `.msi`, `.scr`, `.jar`) no **servidor**, não só no cliente. Toda query de `Tag` e `ActivityDoc` filtra por `companyId` na cláusula `where`, com 404 (não 403) para não vazar existência.
- **Performance:** resposta de `GET /quarter/month/:id/board` não cresce mais de 15% em bytes com a rodada (medido com um mês real). `ActivityDoc.content` fora de todo payload de lista.
- **Acessibilidade:** o viewer prende o foco, fecha com Esc, navega com setas e devolve o foco ao elemento que o abriu. A dropzone é operável por teclado (input file real por trás). Chip de tag tem contraste ≥ 4.5:1 nos dois temas. Toda animação nova respeita `prefers-reduced-motion`.
- **Compatibilidade:** anexos legados (sem `mimeType`, sem `size`, sem autor) renderizam sem erro e sem campo vazio pendurado. Temas claro e escuro. As 3 variantes de shell.
- **Observabilidade:** `src/composables/useAnalytics.ts` **não existe** (era a T13 da R1 e não foi entregue). Esta rodada **não** instrumenta PostHog; a lista do que instrumentar quando a camada existir está na seção Observabilidade.

---

## User Stories

- Como **worker**, quero marcar a tarefa com uma tag que eu digito na hora, e reencontrar essa mesma tag na próxima tarefa, para classificar trabalho sem depender de cadastro prévio.
- Como **worker**, quero filtrar o board por tag, para ver só o que é do CMS.
- Como **worker**, quero ver os arquivos da tarefa com tipo, tamanho e quem subiu, e abrir imagem e PDF sem sair do produto.
- Como **worker em fluxo spec-driven**, quero guardar vários `.md` dentro da atividade e copiar o markdown cru com um clique, para levar ao agente sem perder formatação.
- Como **worker numa frente `(app)`**, quero enxergar o `Leia-primeiro.md` do módulo pai sem sair da minha subtarefa.
- Como **worker**, quero criar a tarefa já com tags, arquivos e o `.md` inicial, em uma passada só.

---

## Acceptance Criteria

### Tags: criar e reusar

- [ ] **Given** o campo de tags de uma tarefa **When** digito `infra` e aperto Enter, e `infra` não existe na empresa **Then** a tag é criada, vinculada à tarefa e aparece como chip colorido, sem passo de cadastro separado
- [ ] **Given** a tag `infra` já existente na empresa **When** abro o campo de tags de **outra** tarefa e digito `inf` **Then** `infra` aparece na lista com a mesma cor e com a contagem de uso
- [ ] **Given** a tag `Bug` existente **When** digito `bug ` (minúsculo, com espaço no fim) e aperto Enter **Then** a tarefa é vinculada à tag `Bug` existente, e **não** é criada uma segunda tag
- [ ] **Given** a tag `Ação` existente **When** digito `acao` **Then** a tag existente é encontrada (slug sem diacrítico)
- [ ] **Given** duas empresas A e B, com a tag `cms` criada em A **When** abro o campo de tags de uma tarefa da empresa B **Then** `cms` **não** aparece no autocomplete
- [ ] **Given** uma tarefa com 2 tags **When** clico no X de uma delas **Then** a tag é desvinculada da tarefa e **continua existindo** no autocomplete da empresa
- [ ] Não existe endpoint nem UI de excluir tag. `grep -rn "Delete" workflow-api/src/tag/` não retorna rota de remoção
- [ ] **Given** a tag `infra` usada em 3 tarefas **When** renomeio para `infraestrutura` **Then** as 3 tarefas passam a mostrar `infraestrutura`, sem tag órfã
- [ ] **Given** as tags `infra` e `deploy` **When** tento renomear `infra` para `deploy` **Then** recebo 409 com mensagem em pt-BR e nada é alterado
- [ ] **Given** o autocomplete de tags com 60 tags na empresa **When** abro sem digitar nada **Then** vejo no máximo 50, ordenadas por uso decrescente
- [ ] Um WORKER (não ADMIN) consegue criar, vincular, desvincular e renomear tag

### Tags no board

- [ ] **Given** uma tarefa com 2 tags **When** olho o card no kanban de `/tasks/:month` **Then** vejo os 2 chips com a cor de cada tag
- [ ] **Given** uma tarefa com 5 tags **When** olho o card **Then** vejo 3 chips e um indicador `+2`, sem quebrar a altura do card
- [ ] **Given** o board de `/tasks/:month` **When** filtro pela tag `cms` **Then** só cards com essa tag permanecem, nas 4 colunas, e o contador de filtros ativos sobe
- [ ] **Given** o filtro de tag aplicado **When** copio a URL, abro em outra aba e recarrego **Then** o mesmo filtro está aplicado (`?tags=cms`)
- [ ] **Given** o `/board` agregado (todas as empresas) **When** olho os cards **Then** as tags aparecem, com a cor correta por empresa
- [ ] **Given** a tarefa aberta em duas abas **When** adiciono uma tag na aba 1 **Then** a aba 2 reflete a mudança sem F5 (realtime `activity:updated`)

### Arquivos: lista e metadados

- [ ] **Given** uma tarefa com 1 imagem, 1 PDF e 1 `.zip` **When** abro a seção de arquivos **Then** cada item mostra ícone conforme o tipo, nome, tamanho legível (ex.: `2,4 MB`) e quem subiu
- [ ] **Given** um anexo legado (gravado antes desta rodada, sem `mimeType`/`size`/autor) **When** abro a seção de arquivos **Then** o item renderiza com o tipo derivado da extensão, sem mostrar tamanho vazio nem autor vazio, e o download funciona
- [ ] **Given** a seção de arquivos **When** alterno entre lista e grade **Then** os dois modos mostram os mesmos itens, e a escolha persiste ao reabrir a tarefa
- [ ] **Given** uma imagem anexada **When** olho a grade **Then** vejo o thumbnail real da imagem, não um ícone genérico
- [ ] **Given** a seção de arquivos **When** arrasto 3 arquivos de uma vez para a área **Then** os 3 sobem, cada um com sua barra de progresso, e um erro em um deles não cancela os outros dois
- [ ] **Given** um arquivo de 12MB **When** tento subir **Then** recebo erro legível em pt-BR ("O arquivo deve ter menos de 10 MB"), o item **não** fica pendurado na lista, e o servidor responde 400 mesmo se a validação do cliente for burlada
- [ ] **Given** um arquivo `.exe` **When** tento subir **Then** o servidor responde 400 com mensagem em pt-BR e nada é gravado no Storage
- [ ] **Given** um anexo qualquer **When** clico em excluir **Then** aparece `ConfirmDialog`, e só depois de confirmar o arquivo some da lista e do Storage

### Arquivos: viewer

- [ ] **Given** uma imagem na lista **When** clico nela **Then** abre um overlay em tela cheia com a imagem, por cima do chrome do shell, nas 3 variantes (`command`, `focus`, `canvas`)
- [ ] **Given** o viewer aberto com 3 arquivos na tarefa **When** aperto seta direita **Then** vou para o próximo arquivo, circulando no fim
- [ ] **Given** o viewer aberto **When** aperto Esc **Then** fecha e o foco volta para o item que o abriu
- [ ] **Given** um PDF **When** abro no viewer **Then** vejo o PDF renderizado; **se** o navegador recusar embutir **Then** aparece o cartão de download com nome, tamanho e botão (fallback nativo do `<object>`, imediato, sem prazo)
- [ ] **Given** um `.zip` **When** clico nele **Then** o viewer abre no cartão de download (sem tentar renderizar)
- [ ] **Given** o viewer aberto **When** navego por Tab **Then** o foco circula dentro do overlay e não alcança o conteúdo atrás

### Documentos .md

- [ ] **Given** uma atividade sem documentos **When** abro a seção Documentos **Then** vejo um estado vazio com ação de criar documento e de subir `.md`
- [ ] **Given** uma atividade **When** crio 3 documentos **Then** os 3 aparecem na lista lateral e alterno entre eles sem recarregar a página
- [ ] **Given** um arquivo `leia-primeiro.md` **When** arrasto para a seção Documentos **Then** um documento é criado com o conteúdo do arquivo já dentro, título derivado do nome do arquivo, e **não** aparece nada na seção de arquivos
- [ ] **Given** um arquivo `.md` **When** tento subir pela seção de **arquivos** **Then** recebo 400 com mensagem dizendo que `.md` vira documento da tarefa
- [ ] **Given** um documento com `# Título`, `**negrito**`, lista, tabela e bloco de código **When** olho o leitor **Then** vejo tudo renderizado e formatado, não texto literal
- [ ] **Given** um documento **When** clico em "Copiar markdown" **Then** o que vai para a área de transferência é o **markdown cru**, byte a byte igual ao gravado, não o HTML renderizado
- [ ] **Given** um documento **When** clico em baixar **Then** recebo um `.md` com o conteúdo cru e o nome de arquivo do documento
- [ ] **Given** 3 documentos **When** arrasto o terceiro para a primeira posição **Then** a nova ordem persiste após F5
- [ ] **Given** o documento A marcado como principal **When** marco o B como principal **Then** o A deixa de ser, e nenhum momento tem dois principais
- [ ] **Given** um documento **When** edito o conteúdo e paro de digitar por 800ms **Then** o `SaveStatus` passa por "Salvando…" e chega em "Salvo às HH:MM"
- [ ] **Given** que estou digitando há 2 minutos num documento **When** continuo digitando **Then** o cursor nunca pula nem o texto é reescrito por resposta do servidor
- [ ] **Given** um documento com conteúdo **When** apago o documento inteiro (com confirmação) **Then** ele some da lista e a seleção cai no principal, ou no primeiro
- [ ] **Given** um conteúdo de 600KB **When** tento salvar **Then** recebo 400 com mensagem em pt-BR e o texto continua na tela
- [ ] **Given** um `.md` contendo `<img src=x onerror="alert(1)">`, `<script>alert(1)</script>` e `[clique](javascript:alert(1))` **When** abro o leitor **Then** nenhum script executa, o `onerror` não sobrevive no DOM e o `href` `javascript:` não sobrevive

### Herança pai/filha

- [ ] **Given** uma atividade pai com `Leia-primeiro.md` marcado como principal **When** abro uma subtarefa dela **Then** vejo uma seção "Do módulo" com esse documento, recolhida por padrão
- [ ] **Given** a seção "Do módulo" expandida **When** tento editar o conteúdo **Then** não há campo editável: é leitura, com link "Abrir no módulo" que leva à tarefa pai
- [ ] **Given** uma atividade pai sem documentos **When** abro uma subtarefa **Then** a seção "Do módulo" não aparece
- [ ] **Given** uma atividade pai com 2 subtarefas, uma com 1 doc e outra com 2 **When** abro o pai **Then** a lista de subtarefas mostra a contagem de documentos de cada uma

### Criação de tarefa

- [ ] **Given** o formulário de nova atividade **When** adiciono 2 tags (uma nova e uma existente), 2 arquivos e colo um markdown **Then** a tarefa nasce com as 2 tags vinculadas, os 2 anexos e 1 documento marcado como principal
- [ ] **Given** o formulário **When** o upload de um dos arquivos falha **Then** a tarefa **é criada** mesmo assim, com um toast dizendo qual arquivo falhou

### Higiene

- [ ] O markup de item de anexo existe em **um** componente; `grep -rn "attachment-item\|attachment__file" src/` não encontra duplicata nas 4 telas antigas
- [ ] Nenhum em-dash em copy nova; nenhum `v-dialog` novo; nenhum hex em componente novo
- [ ] `npx vue-tsc --build` limpo no front e `npx tsc --noEmit` limpo na API
- [ ] Resposta de `GET /quarter/month/:id/board` de um mês real não cresce mais de 15% em bytes (medida registrada no relatório)

---

## Estratégia de Testes

O repo **não tem suíte de testes** (sem `vitest`, sem `jest`, sem workflow de CI) — confirmado na R1 e ainda verdade. Os testes são manuais e por API, mais os gates determinísticos que existem.

### Automatizados (o que existe hoje)

- [ ] `npm run type-check` limpo no front; `npx tsc --noEmit` limpo na API
- [ ] `npm run lint` limpo no front
- [ ] `npm run build` limpo

### Por API (`curl`, contra a API local)

- [ ] `POST /tag {name:"Bug"}` duas vezes, depois `POST /tag {name:" bug "}` e `POST /tag {name:"Bùg"}`: os quatro devolvem o **mesmo** id
- [ ] `POST /tag` com o mesmo nome em duas requisições simultâneas: nenhuma retorna 500, ambas devolvem o mesmo id (corrida `P2002`)
- [ ] `GET /tag?q=` com header `x-company-id` de outra empresa: a tag da primeira não aparece
- [ ] `PATCH /tag/:id` renomeando para um slug já usado: 409
- [ ] `PATCH /activity/:id {tagIds:[a,b]}` depois `{tagIds:[a]}`: a tag `b` some da atividade e **continua** em `GET /tag`
- [ ] `POST /activity/:id/doc` com 600KB: 400
- [ ] `POST /activity/:id/doc` marcando principal duas vezes em docs diferentes: `GET` mostra exatamente um `isPrimary: true`
- [ ] `GET /activity/:id` de uma subtarefa cujo pai tem doc principal: `inheritedDocs` traz 1 item; nenhum item traz `content`
- [ ] `GET /activity/doc/:docId` traz o `content` cru, idêntico ao enviado
- [ ] `POST /activity/:id/attachment` com arquivo de 12MB: 400; com `.exe`: 400; com `.md`: 400 apontando o endpoint de doc
- [ ] `GET /quarter/month/:id/board` com e sem a rodada: comparar `Content-Length`

### Manuais (happy path, o passo a passo)

- [ ] Criar atividade pai "Módulo X" pelo `TaskForm`, já com a tag nova `modulo-x` e um `Leia-primeiro.md` colado
- [ ] Criar subtarefa `(cms)` com 1 doc, e subtarefa `(app)` com 2 docs
- [ ] Anexar 1 imagem e 1 PDF na `(app)`, arrastando os dois de uma vez
- [ ] Abrir a imagem no viewer, navegar para o PDF com a seta, fechar com Esc
- [ ] Abrir a `(cms)` e conferir a seção "Do módulo" com o `Leia-primeiro.md` do pai, em leitura
- [ ] Copiar o markdown cru de um doc e colar num editor de texto: conferir que é markdown, não HTML
- [ ] Voltar ao board, filtrar por `modulo-x`, recarregar a página com a URL filtrada
- [ ] Repetir a abertura da tarefa nos temas claro e escuro, com screenshot de cada
- [ ] Repetir a abertura do viewer nas 3 variantes de shell

### Manuais (erro)

- [ ] DevTools em modo offline: digitar num doc e esperar o debounce. Esperado: `SaveStatus` em erro com "Tentar de novo", **o texto continua na tela**, e voltar a rede + clicar grava
- [ ] Subir arquivo de 12MB e conferir que a lista não fica com item fantasma
- [ ] Derrubar a rede no meio de um upload de 3 arquivos: os que já subiram permanecem

### Regressão

- [ ] Arrastar card no kanban continua funcionando (`activity:moved` intacto)
- [ ] Painel do `/board` continua abrindo card de outra empresa com o `x-company-id` correto
- [ ] Editor de descrição (R1) intacto: negrito, checklist, autosave
- [ ] Comentários e feed da atividade continuam funcionando
- [ ] `/tickets`, `/notes` e `/time` abrem sem erro (nada compartilhado foi tocado)

---

## Arquivos Impactados

### Backend (`workflow-api`)

| Arquivo | Ação | Descrição |
|---|---|---|
| `prisma/schema.prisma` | Modificar | `Tag`, `ActivityTag`, `ActivityDoc`; `Attachment.{mimeType,size,uploadedById}`; relações reversas em `Company`, `User` e `Activity` |
| `prisma/migrations/20260810120000_activity_tags_docs_attachment_meta/migration.sql` | Criar | Tabelas + colunas + backfill de `mimeType` por extensão + índice único parcial de `isPrimary` (SQL à mão) |
| `src/common/slug.ts` | Criar | `normalizeSlug(name)`: lowercase, `NFD` sem diacrítico, trim, espaços colapsados. Ponto único |
| `src/tag/tag.module.ts` · `tag.service.ts` · `tag.controller.ts` · `dto/` | Criar | `GET /tag?q=&limit=`, `POST /tag` (idempotente), `PATCH /tag/:id`. **Sem** rota de exclusão |
| `src/activity-doc/activity-doc.module.ts` · `activity-doc.service.ts` · `activity-doc.controller.ts` · `dto/` | Criar | CRUD de doc, `PATCH /activity/doc/:id/primary`, `PATCH /activity/:id/doc/reorder`, `GET /activity/doc/:id` (único com `content`) |
| `src/activity/activity.service.ts` | Modificar | `tagIds` no create e no update; `ACTIVITY_INCLUDE` com tags e docs sem content; `inheritedDocs` no `findOne`; metadados e validação no `uploadAttachment`; label `tags` no feed |
| `src/activity/dto/create-activity.dto.ts` · `update-activity.dto.ts` | Modificar | `tagIds?: string[]` |
| `src/activity/activity.module.ts` | Modificar | Importar o módulo de tag |
| `src/quarter/quarter.service.ts` | Modificar | `findMonthBoard`: incluir tags e `_count` de anexos e docs; **não** incluir content |
| `src/dashboard/dashboard.service.ts` | Modificar | `select` das atividades com tags (id, name, color) |
| `src/intelligence/intelligence.service.ts` | Modificar | Concatenar conteúdo dos docs (teto de 2000 chars) no item `ACTIVITY` do embedding |
| `src/common/upload-rules.ts` | Criar | Teto de tamanho, blocklist de extensão executável, regra do `.md` |

### Frontend (`work-flow`)

| Arquivo | Ação | Descrição |
|---|---|---|
| `src/features/tasks/activity-types.ts` | Modificar | `ActivityTag`, `ActivityDocMeta`, `ActivityDoc`; `ActivityAttachment` com `mimeType`, `size`, `uploadedBy`; `docs`, `inheritedDocs`, `tags` em `ActivityDetail`; `tagIds` em `ActivityPatchPayload` |
| `src/service/activities/activity-service.ts` | Modificar | Upload com `onUploadProgress`; métodos de doc |
| `src/service/tags/tag-service.ts` | Criar | `list(q)`, `create(name)`, `rename(id, name, color)` |
| `src/features/tasks/tag-palette.ts` | Criar | Conjunto fechado de chaves de cor → tokens; atribuição determinística por slug quando não escolhida |
| `src/components/ui/TagChip.vue` | Criar | Chip de tag tokenizado, com X opcional |
| `src/components/ui/TagInput.vue` | Criar | Combobox múltiplo (reka), busca no servidor, cria no Enter, chips removíveis, teclado completo |
| `src/composables/useTags.ts` | Criar | Vue Query: lista com busca debounced, create idempotente, rename com invalidação |
| `src/features/tasks/attachment-kind.ts` | Criar | `kindOf(att)`, ícone, rótulo, `formatBytes` |
| `src/features/tasks/components/TaskAttachments.vue` | Criar | Lista/grade + dropzone + progresso por arquivo + excluir com `ConfirmDialog`. Único dono do markup de anexo |
| `src/features/tasks/components/AttachmentViewer.vue` | Criar | Overlay `Teleport to="body"`, imagem e PDF, setas, foco preso, fallback de download |
| `src/features/tasks/composables/useActivityDocs.ts` | Criar | Vue Query dos docs + autosave com guarda anti-laço + reorder + primary |
| `src/features/tasks/components/TaskDocs.vue` | Criar | Lista lateral de docs + leitor + ações (novo, renomear, principal, copiar cru, baixar, excluir) |
| `src/features/tasks/components/MarkdownDocEditor.vue` | Criar | Textarea monoespaçada + preview via `renderMarkdown` + contador + `SaveStatus` |
| `src/features/tasks/components/InheritedDocs.vue` | Criar | Seção "Do módulo", recolhida, somente leitura, com link para o pai |
| `src/features/tasks/styles/markdown-doc.css` | Criar | Prosa do doc, tokenizada (escala de documento, molde em `note-content.css`) |
| `src/features/tasks/components/TaskDetailPanel.vue` | Modificar | Tags, `TaskAttachments`, `TaskDocs`, `InheritedDocs`; remover o markup de anexo local |
| `src/features/tasks/TaskDetailsView.vue` | Modificar | Idem, nos 2 blocos de anexo; rotear `.md` para doc; contagem de docs por subtarefa |
| `src/components/tasks/TaskForm.vue` | Modificar | Tags, múltiplos arquivos, doc inicial |
| `src/components/tasks/KanbanBoard.vue` | Modificar | `KanbanTask` com `tags`, `attachmentCount`, `docCount`; chips e indicadores no card |
| `src/features/tasks/TasksView.vue` | Modificar | Filtro por tag na barra de filtros + `?tags=` na URL; envio de tags/arquivos/doc na criação |
| `src/features/board/BoardView.vue` | Modificar | Chips de tag no card agregado + filtro por tag |
| `src/stores/workspaceStores.ts` | Modificar | `ActivityItem.tags` |
| `src/features/tasks/useActivityDetail.ts` | Modificar | `'tags'` como `ActivityField`; espelhar tags no card do board (`syncBoardCard`) |
| `src/CLAUDE.md` | Modificar | Tags, arquivos e documentos da tarefa; primitives novos |

---

## Tasks Técnicas

Três fatias independentes e shippáveis: **A (tags)**, **B (arquivos)**, **C (documentos)**. A T1 é comum às três.

### Comum

- [x] **T1** — Schema + migration única: `Tag`, `ActivityTag`, `ActivityDoc`, colunas novas em `Attachment`, relações reversas, backfill de `mimeType` por extensão e índice único parcial de `isPrimary`. Aplicar em dev e registrar o que fica pendente em prod

### Fatia A — Tags

- [x] **T2** — `src/common/slug.ts` + módulo `tag/` (service, controller, DTOs): `GET /tag?q=&limit=` ordenado por uso, `POST /tag` idempotente com tratamento de `P2002`, `PATCH /tag/:id` com 409 em colisão. Sem rota de exclusão *(dep: T1)*
- [x] **T3** — `tagIds` no create e no update de atividade (set replace dentro da transação existente), tags no `ACTIVITY_INCLUDE`, label `tags` no feed *(dep: T2)*
- [x] **T4** — `findMonthBoard` e `dashboard.service` devolvendo tags nos cards *(dep: T3)*
- [x] **T5** — Front: `tag-palette.ts`, `TagChip.vue`, `tag-service.ts`, `useTags.ts`, `TagInput.vue` *(dep: T2)*
- [x] **T6** — Front: tags no `TaskDetailPanel` e no `TaskDetailsView` via `saveFields('tags', ...)`, com espelho no card (`syncBoardCard`) *(dep: T5, T3)*
- [x] **T7** — Front: chips no card do kanban e do `/board`, filtro por tag com `?tags=` na URL nas duas telas *(dep: T5, T4)*

### Fatia B — Arquivos

- [x] **T8** — `src/common/upload-rules.ts` + validação no `uploadAttachment` (tamanho, blocklist executável, `.md` rejeitado apontando o doc) e gravação de `mimeType`, `size`, `uploadedById` *(dep: T1)*
- [x] **T9** — Front: `activity-types.ts` e `activity-service.ts` com os campos novos e upload com progresso *(dep: T8)*
- [x] **T10** — Front: `attachment-kind.ts` + `TaskAttachments.vue` (lista/grade com preferência persistida, dropzone múltipla, progresso por arquivo, excluir com confirmação) *(dep: T9)*
- [x] **T11** — Front: `AttachmentViewer.vue` (overlay, imagem, PDF com fallback em 3s, setas, foco preso, Esc) *(dep: T10)*
- [x] **T12** — Front: substituir os 4 pontos de markup duplicado (painel, detalhe x2, capa do card) pelo componente novo *(dep: T11)*

### Fatia C — Documentos .md

- [x] **T13** — Módulo `activity-doc/`: CRUD, `content` só no `GET /activity/doc/:id`, teto de 512KB, `setPrimary` transacional, reorder *(dep: T1)*
- [x] **T14** — `GET /activity/:id` com `docs` (metadados) e `inheritedDocs` (docs do pai quando `parentId != null`); `_count` de docs no board *(dep: T13)*
- [x] **T15** — `intelligence.service`: conteúdo dos docs (teto de 2000 chars) no embedding de `ACTIVITY` *(dep: T13)*
- [x] **T16** — Front: `useActivityDocs.ts` + `markdown-doc.css` + `MarkdownDocEditor.vue` (autosave com guarda anti-laço, contador, `SaveStatus`) *(dep: T9)*
- [x] **T17** — Front: `TaskDocs.vue` (lista lateral, criar, subir `.md` por arrasto, renomear, principal, reordenar, copiar cru, baixar, excluir) *(dep: T16)*
- [x] **T18** — Front: `InheritedDocs.vue` no painel e no detalhe de subtarefa + contagem de docs por subtarefa na lista do pai *(dep: T17, T14)*

### Fechamento

- [x] **T19** — `TaskForm.vue`: tags, múltiplos arquivos e doc inicial na criação *(dep: T5, T10, T17)*
- [x] **T20** — Testes da Estratégia (curl, manuais nos 2 temas com screenshot, 3 shells, regressão) *(dep: T19)*
- [x] **T21** — `src/CLAUDE.md` + Change Log desta spec *(dep: T20)*

---

## Considerações de Arquitetura

- **Decisão A1: tag é tabela com pivot, não `String[]`.**
  **Motivo:** cor persistida, rename global em uma linha, contagem de uso para ordenar o autocomplete, e unicidade garantida pelo banco por `(companyId, slug)`. Como a tag **nunca é excluída** (decisão de produto), a defesa contra duplicata por acento e caixa deixa de ser cosmética e passa a ser estrutural: o lixo entrou, ficou.
  **Alternativa rejeitada:** `Note.tags String[]`, o precedente do repo. Rename viraria `UPDATE` em array de N linhas e a cor não teria onde morar.

- **Decisão A2: tag não tem exclusão, só desvinculação.**
  **Motivo:** pedido explícito. O catálogo da empresa é permanente; remover da tarefa apaga a linha da pivot, nunca a tag. Consequência assumida: o catálogo só cresce, e por isso a busca é no servidor, ordenada por uso e limitada a 50.
  **Alternativa rejeitada:** soft delete com `archivedAt`. Seria uma exclusão disfarçada, contrariando a decisão.

- **Decisão A3: WORKER faz tudo em tag.**
  **Motivo:** criar tag é parte de criar tarefa; exigir ADMIN travaria o fluxo. Todo o `activity.controller` já é `@RequireRole(WORKER)`. Sem exclusão, o pior estrago possível é um rename, que é reversível por outro rename.

- **Decisão A4: `ActivityDoc.content` nunca entra em payload de lista.**
  **Motivo:** `findMonthBoard` já traz `attachments` de todo card e de toda subtarefa. Somar markdown de spec a isso é o caminho mais curto para um board de 40 cards ficar inutilizável. Lista traz metadados e `_count`; conteúdo vem por `GET /activity/doc/:id`, sob demanda e cacheado.
  **Alternativa rejeitada:** `content` no include com truncamento no servidor. Truncar dá conteúdo pela metade em cache, e a próxima tela que precisar do inteiro não sabe distinguir.

- **Decisão A5: o editor de doc é markdown cru, não TipTap.**
  **Motivo:** o valor do campo é ser markdown fiel para levar ao agente. TipTap converteria para HTML e a volta para markdown perderia formatação (o round-trip não é fiel). Textarea monoespaçada com preview ao lado preserva o texto byte a byte, que é o requisito.
  **Alternativa rejeitada:** TipTap com serializador markdown. Round-trip lossy num campo cujo propósito é fidelidade.

- **Decisão A6: `.md` tem uma casa só, e é o documento.**
  **Motivo:** aceitar `.md` como anexo **e** como doc criaria dois lugares para a mesma coisa, com o usuário descobrindo pela sorte qual escolheu. O upload de `.md` pela seção de arquivos responde 400 dizendo para onde ir. Anexos `.md` legados continuam aparecendo (não migramos), mas não é possível criar novos.
  **Alternativa rejeitada:** migrar anexos `.md` existentes para docs. Mexe em dado de produção para resolver um problema que a leitura já resolve.

- **Decisão A7: doc vive no Postgres, não no Storage.**
  **Motivo:** é texto pequeno que precisa ser buscável, versionável no futuro, editável in-app e indexável no embedding. Storage daria um `fetch` extra, CORS e nenhum ganho. O download é gerado no cliente a partir do texto.

- **Decisão A8: herança traz os docs do pai, não copia.**
  **Motivo:** `inheritedDocs` é leitura derivada da relação `parentId`. Copiar criaria divergência silenciosa entre a cópia e o original. Como o schema só tem um nível de subtarefa (`create` bloqueia sub-subtarefa em `activity.service.ts:60`), não há recursão a resolver.

- **Decisão A9: uma migration só, com backfill embutido.**
  **Motivo:** as três fatias compartilham o mesmo deploy de banco. Três migrations separadas dariam três janelas de risco em produção para o mesmo ganho.

- **Decisão A10: upload continua single-file; o paralelismo é do cliente.**
  **Motivo:** N requisições paralelas dão progresso e erro por arquivo de graça, sem `FilesInterceptor`, sem mudar contrato e sem "um arquivo ruim derruba o lote".

- **Decisão A11: cor de tag é chave de paleta, não hex.**
  **Motivo:** a regra do design system proíbe hex em componente. A paleta fechada resolve para token e funciona nos dois temas. Tag sem cor escolhida recebe uma determinística pelo hash do slug, então nunca existe chip sem identidade.

---

## Plano de Rollout

Ordem obrigatória:

1. **Migration + backend primeiro.** Tudo é aditivo: colunas nullable, tabelas novas, campos novos no payload. Um front antigo ignora o que não conhece e continua funcionando.
2. **Front por fatia**, em qualquer ordem entre A, B e C. Cada uma é shippável sozinha:
   - **A** sem B e C: tarefa ganha tags e o board filtra.
   - **B** sem A e C: arquivos ficam legíveis e o viewer funciona.
   - **C** sem A e B: documentos existem e a herança funciona.
3. **Sem feature flag.** Nada some se uma fatia não subir; os campos novos simplesmente não aparecem.
4. **A única regressão possível de ordem invertida** (front antes do backend) é `tagIds` sendo ignorado pelo `PATCH`, que falha em silêncio. Por isso o backend vai primeiro.

## Plano de Rollback

- **Front:** reverter o commit e redeploy. Nada é perdido: tags, docs e metadados continuam no banco, apenas invisíveis.
- **Backend:** reverter o commit e redeploy. As rotas novas somem; as tabelas permanecem sem uso.
- **Migration (não basta reverter commit):** para desfazer o schema,
  ```sql
  DROP INDEX IF EXISTS "ActivityDoc_activityId_primary_key";
  DROP TABLE IF EXISTS "ActivityDoc";
  DROP TABLE IF EXISTS "ActivityTag";
  DROP TABLE IF EXISTS "Tag";
  ALTER TABLE "Attachment" DROP COLUMN IF EXISTS "mimeType",
                           DROP COLUMN IF EXISTS "size",
                           DROP COLUMN IF EXISTS "uploadedById";
  ```
  **Isto destrói dado:** toda tag e todo documento criados desde o deploy. Só executar com backup do banco confirmado. O caminho preferido é deixar o schema e reverter só o código, que é reversível sem perda.
- **Storage:** nenhum arquivo é movido nem apagado por esta rodada. Rollback não toca no bucket.

---

## Observabilidade

**Nada de PostHog nesta rodada.** `src/composables/useAnalytics.ts` não existe (era a T13 da R1, não entregue), e criar a camada tipada aqui seria escopo de outra spec. Instrumentar com `posthog.capture` de string solta é proibido pelo padrão da R1.

Quando a camada existir, os eventos desta rodada são:

| Evento | Quando | Propriedades |
|---|---|---|
| `task_tag_added` | vínculo de tag gravado | `is_new_tag`, `tag_count` |
| `task_tag_filter_used` | filtro de tag aplicado no board | `tag_count`, `surface` (`month` \| `aggregate`) |
| `task_file_uploaded` | upload concluído | `kind`, `size_bucket`, `batch_size` |
| `task_file_viewed` | viewer aberto | `kind` |
| `task_doc_created` | doc criado | `origin` (`typed` \| `uploaded`), `doc_count` |
| `task_doc_copied` | markdown cru copiado | `char_count` |

**Log no servidor:** o `uploadAttachment` passa a logar rejeição por regra (`tamanho`, `extensão bloqueada`, `markdown`) com `activityId` e `companyId`, porque hoje uma rejeição de upload é invisível na operação.

---

## Definition of Done

- [ ] Todos os acceptance criteria verificados um a um, com veredito **Atendido** ou **Não atendido (motivo)**
- [ ] Testes da Estratégia executados (curl, manuais nos 2 temas com screenshot, 3 shells, regressão)
- [ ] `npm run type-check` e `npm run lint` limpos no front; `npx tsc --noEmit` limpo na API
- [ ] `npm run build` limpo
- [ ] Fluxo exercitado de ponta a ponta: pai com `Leia-primeiro.md`, duas filhas com docs próprios, upload múltiplo, viewer, herança, filtro por tag, F5
- [ ] Tamanho da resposta do board medido antes e depois, registrado no relatório
- [ ] Migration aplicada em dev; **estado em produção declarado explicitamente** no relatório final
- [ ] Nenhum em-dash em copy nova; nenhum `v-dialog` novo; nenhum hex em componente novo
- [ ] Breaking changes documentadas e consumidores ajustados
- [ ] `src/CLAUDE.md` atualizado
- [ ] Spec com status `Concluído` + data + Change Log
- [ ] `/spec-sync` rodado (ou sugerido)
- [ ] **Nada commitado** sem pedido explícito

## Fora de Escopo

- Versionamento, diff ou histórico de docs e arquivos
- Comentário ancorado em trecho de doc ou anotação em PDF
- Preview de vídeo, áudio, `.docx` e `.xlsx` (caem no cartão de download)
- Sincronizar docs da tarefa com arquivo real do repositório Git ou com `docs/specs/`
- Edição colaborativa em tempo real de doc (é território das notas)
- Editar o doc herdado a partir da filha
- Herança em mais de um nível
- Pastas ou árvore de docs dentro da tarefa
- Migrar `Note.tags` para o modelo novo
- Excluir tag (decisão de produto: não existe)
- URL assinada no bucket do Supabase (ver Follow-up)
- Aplicar migration em produção sem autorização explícita

## Follow-up

- **Anexo em bucket público.** `SupabaseService.uploadFile` devolve `getPublicUrl`: qualquer pessoa com o link lê o arquivo, sem autenticação e sem escopo de empresa. Dívida pré-existente, agravada em visibilidade por esta rodada. Caminho: URL assinada com TTL curto, emitida no `GET` da atividade. Merece spec própria por tocar todo consumidor de `attachment.url`.
- **Camada de analytics tipada** (T13 da R1, não entregue). Sem ela, nenhuma das telas desta rodada é mensurável.
- **Busca por tag fora do board** (busca global, command palette).

## Perguntas em Aberto

Nenhuma. As duas que existiam foram decididas em 2026-08-10: tabela `Tag` com pivot; WORKER faz tudo; tag nunca é excluída, só desvinculada.

## Estado da entrega (2026-08-10)

**Código completo nas 21 tasks. A entrega está parada num gate, não terminada.**

### Verde

- `npx tsc --noEmit` limpo na API; `vue-tsc --build` limpo no front
- `nest build` e `vite build` limpos
- Lint sem erro novo: front 251 contra 253 no HEAD (dois a menos), API só com dois erros pré-existentes de import não usado
- **Regras de upload exercitadas de verdade** (10 casos contra o código compilado): 12MB recusado, exatamente 10MB aceito, arquivo vazio recusado, `.exe`/`.EXE` recusados, `.md`/`.MARKDOWN` recusados com a mensagem que aponta o endpoint de documento, arquivo sem extensão aceito
- **Normalização de slug exercitada** (9 casos): `Bug`, `bug `, `Bùg`, `Ação`/`acao` e espaço interno repetido colapsam no mesmo slug
- **Sanitização de markdown exercitada em navegador de verdade** (Edge headless, DOMPurify real): `<img src=x onerror>` perde o `onerror`, `<script>` some, `[x](javascript:)` perde o `href`, `<svg onload>` perde o `onload`, `<iframe>` é removido, e o markdown legítimo (título, negrito, código, checklist, tabela, bloco) renderiza inteiro
- **Helpers de arquivo exercitados**: tipo derivado de mimeType e de extensão, legado sem mimeType cai em `other` sem quebrar, `formatBytes(null)` devolve string vazia (não "0 B" nem "desconhecido"), ordenação com imagem primeiro
- **Cor de tag determinística** confirmada: mesmo slug devolve a mesma cor, cor explícita é respeitada, chave inválida cai no fallback

### Bloqueado

**O fluxo de ponta a ponta não foi exercitado, e não dá para exercitar hoje.** O `.env` local aponta para `db.plgjjpicmwhrddliyeii.supabase.co`, que é o banco de **produção** ([EVOLUCAO.md](../../../../EVOLUCAO.md), Problema 2: "o ambiente de desenvolvimento é a produção"). Não há Docker nem Postgres local nesta máquina. Sem a migration aplicada, nenhuma rota nova responde.

Consequência: **todo AC que depende de banco está não verificado.** Criar tag, reusar no autocomplete, isolamento entre empresas, chips no board, filtro por tag, upload com progresso, viewer, documentos, herança pai/filha e criação em uma passada estão implementados e tipados, mas não exercitados.

### O `migrate diff` revelou drift pré-existente, que NÃO entrou na migration

Comparar o schema com o banco vivo trouxe, além das mudanças desta rodada:

- `DROP INDEX "TimeEntry_one_running_per_user"` (índice único parcial que garante um timer rodando por usuário)
- `DROP INDEX "Event_companyId_idx"`
- `CREATE TYPE "VariableType"`
- uma dezena de `ALTER COLUMN ... DROP DEFAULT`

Por isso a migration foi escrita à mão com apenas o que a spec pede: rodar `prisma migrate dev` aqui aplicaria esse drift junto, destruindo garantias em produção sob o disfarce de "a migration da feature". **O drift continua aberto e merece investigação própria.**

### Próximo passo (precisa de autorização)

1. Aplicar `prisma/migrations/20260810120000_activity_tags_docs_attachment_meta/migration.sql`, com backup do banco antes. O SQL é aditivo: nenhum `DROP` de dado existente.
2. Subir API e front locais e percorrer o teste manual desta spec.
3. Só então marcar os AC um a um e fechar o DoD.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-10 | 0.1 | Criação | Nicolas (via spec-driven, modo 3) |
| 2026-08-10 | 0.2 | Implementação das 21 tasks. Dois desvios da spec, ambos registrados no texto: o fallback de PDF passou a ser o nativo do `<object>` (o prazo de 3s dava falso positivo e escondia PDF que funcionava) e o markup duplicado de anexo eram **seis** pontos, não quatro (os modais de subtarefa também repetiam). Seção *Estado da entrega* com o gate de e2e bloqueado. | Nicolas (via spec-driven) |
