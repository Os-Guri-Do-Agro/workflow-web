# Épico: Notas colaborativas premium

**Status:** In Review
**Autor:** Nicolas (via spec-driven)
**Criado em:** 2026-07-21
**Última atualização:** 2026-07-21
**Versão:** 0.1
**Repos:** `work-flow` (frontend) + `workflow-api` (backend)

---

## Visão Geral

Tirar as Notas do estado de "bloco de texto pessoal, salvo na mão, com casca de HTML cru" e transformá-las no artefato colaborativo do produto: visual premium, salvamento invisível, compartilhável com a equipe e por link, editável ao vivo a várias mãos e com rabisco a mão livre para quem usa iPad.

## Motivação

Hoje a nota é a única feature grande do work-flow que ficou fora do design system, fora do Vue Query e fora de qualquer noção de time. O custo de não fazer:

- **Conteúdo preso a uma pessoa.** Não existe conceito de nota compartilhada no schema: `Note` tem `createdById` e nada mais. Quem escreve a ata da reunião manda print no Discord.
- **Perda de trabalho real.** Só existe botão "Salvar" e um Ctrl+S pendurado no DOM do ProseMirror que não funciona com foco no título nem nas tags ([NoteEditorView.vue:362-371](../../../src/features/notes/NoteEditorView.vue)). Fechar a aba perde tudo.
- **Débito visual concentrado.** 701 das 1410 linhas do editor são CSS legado com `rgba(var(--v-theme-secondary), X)`; a listagem dispara um request por tecla digitada e engole erro de rede em `console.error`.

---

## Research Findings

**Stack frontend:** Vue 3.5 · Vuetify 4 · Pinia 3 · Vue Query 5 · Vite 7 · TS 5.9 · TipTap 3.21 (18 extensões) · lucide-vue-next · tokens em [plugins/tokens.ts](../../../src/plugins/tokens.ts)

**Stack backend:** NestJS 11 · Prisma 7 · Postgres (Supabase) · Express · socket.io · Hocuspocus 4 embarcado · deploy Railway

### O que já existe e vai ser reaproveitado

| Ativo | Onde | Uso no épico |
|---|---|---|
| **Servidor Hocuspocus/Yjs no processo Nest** | `workflow-api/src/board/board-collaboration.service.ts` (198 linhas), ligado em `main.ts:237-239` | Base da P3. Path `/collab`, auth por JWT, persistência com debounce 1s/4s, flush no shutdown |
| `SaveStatus.vue` + `save-state.ts` + `InlineEditText.vue` | `src/components/ui/` | Autosave da P1, já em produção em `features/tasks/components/TaskDetailPanel.vue:272-277` |
| `ShareLink` + `/share` + `/public/*` | `workflow-api/src/share/` + `src/features/public/` | Link público da P2. Token `randomBytes(24)` hex, revogação soft, `expiresAt` já existe e nunca é escrito |
| `RepositoryAccess` + `RepositoryAccessLevel` | `workflow-api/prisma/schema.prisma:507-527` | Molde do ACL por usuário da P2 |
| `validMentions()` | `workflow-api/src/comment/comment.service.ts:186-198` | Molde de "só convida quem é da mesma empresa" |
| `perfect-freehand` + `freehandPath()` | `src/features/boards/BoardCanvasView.vue:847-871` e `423-433` | Motor de traço da P4, com pressão real de stylus (`simulatePressure: false`) |
| CRUD de pastas no backend | `workflow-api/src/note/note.controller.ts:38-64` | **Já existe e o front nunca chamou.** Ganho grátis na P1 |
| `Teleport` + tokens como padrão de overlay | `src/components/ui/ConfirmDialog.vue`, `features/tasks/components/TaskDetailPanel.vue:254-265` | Padrão para todo diálogo novo. Nada de `v-dialog` |
| `reka-ui` | `src/components/ui/AppSelect.vue:20-31` | Primitivas headless. `src/CLAUDE.md:21` diz que não é usado: **está desatualizado** |

### Dependências novas (todas MIT, verificadas em 2026-07-21)

| Pacote | Versão | Fase |
|---|---|---|
| `@tiptap/extension-drag-handle-vue-3` | 3.28.0 | P1 |
| `@tiptap/suggestion` | 3.28.0 | P1 (slash menu) |
| `@tiptap/extension-details` | 3.28.0 | P1 (era Pro no v2, virou MIT no v3) |
| `@tiptap/extension-emoji` | 3.28.0 | P1 |
| `@tiptap/extension-collaboration` | 3.28.0 | P3 |
| `@tiptap/extension-collaboration-caret` | 3.28.0 | P3 |
| `y-prosemirror` | 1.3.7 | P3 |

`yjs`, `@hocuspocus/provider`, `@hocuspocus/server`, `@hocuspocus/extension-database` e `perfect-freehand` **já estão instalados** nos dois repos.

### Decisão de biblioteca: por que continuar no TipTap

Você perguntou se não existe "uma lib completa nova open source 2026" para substituir o que está aí. Resposta direta: **não para Vue, e o problema não é a lib.**

- **BlockNote, Novel, Plate, Tiptap UI Components (oficial)**: todos React. Adotar qualquer um significa React no meio de um app Vue.
- **BlockSuite** (do AFFiNE): framework-agnóstico via web components, mas troca o modelo de documento inteiro e não fala ProseMirror. Migração de todo o conteúdo HTML existente, para ganhar o que já dá para construir.
- **tldraw** (para o rabisco): licença própria, exige marca d'água visível sem licença comercial paga, e é React. Descartado.
- **TipTap 3** é MIT, é ProseMirror por baixo, já está instalado com 18 extensões e é o que o New York Times e a Atlassian usam.

O que está feio não é o editor: é a casca em volta dele (toolbar de 28 botões em `<button>` cru, popovers sem click-outside, zero bubble menu, zero slash menu, CSS legado). A P1 resolve isso com extensões oficiais MIT + `reka-ui` + tokens.

**Breaking changes do épico:**

1. **`documentName` do Hocuspocus ganha namespace (P3).** Hoje o nome do documento Yjs é o `boardId` cru (`board-collaboration.service.ts:30`). Notas usarão `note:<id>`. Mitigação: o roteador trata nome sem prefixo como board legado, então o front de Boards não muda. Sem isso, um `boardId` e um `noteId` poderiam colidir no mesmo espaço de nomes.
2. **`GET /notes` muda de shape (P2).** Passa a incluir notas compartilhadas comigo, com `accessLevel` e `owner`. Consumidor único hoje: `NotesView.vue`. A IA (`copilot/agent.service.ts:425`) lê Notes direto do Prisma e assume "nota é pessoal, por createdById": precisa ser reavaliada na P2.
3. **`Note.content` deixa de ser a fonte da verdade durante edição ao vivo (P3).** Vira projeção do Y.Doc. Ver decisão A3.

---

## Decisões de Arquitetura (valem para todas as fases)

### A1. Compartilhamento é ACL por usuário, não flag de empresa

**Decisão:** modelo novo `NoteAccess { noteId, userId, level: VIEW|EDIT, grantedByLinkId?, invitedById, createdAt }` com PK composta `[noteId, userId]`, espelhando `RepositoryAccess`. Mais `Note.companyId String?` (nullable).

**Motivo:** você pediu "escolher as pessoas da equipe". Uma flag `visibility: COMPANY` não permite isso, e um toggle de empresa inteira vaza nota pessoal para todo mundo. O `companyId` na nota existe por dois motivos concretos: escopar **quem pode ser convidado** (só membros da mesma empresa, como `validMentions` faz) e satisfazer `ShareLink.companyId`, que é NOT NULL com FK.

**Backfill:** nenhum. `companyId` nasce `null` em toda nota existente, e é preenchido com a empresa ativa do request na primeira vez que a nota é compartilhada. Zero risco de vazamento retroativo: nota sem `companyId` e sem `NoteAccess` continua estritamente do dono.

**Alternativa rejeitada:** `visibility PRIVATE|COMPANY` como enum na nota. Simples demais para o pedido, e transforma cada compartilhamento numa decisão de tudo-ou-nada.

### A2. Regra de acesso: vale do convite até a revogação

**Decisão:** todo acesso é um registro com data e hora (`NoteAccess.createdAt`) que vale até alguém remover. A UI mostra "convidado em 21/07 às 14:32". Sem expiração automática nesta rodada (a coluna `ShareLink.expiresAt` já existe, fica reservada para depois).

**Revogar o link remove os acessos que nasceram dele.** `NoteAccess.grantedByLinkId` guarda a origem; `DELETE /share/:token` apaga os `NoteAccess` daquele link. A UI avisa antes: "Isso vai remover o acesso de 3 pessoas que entraram por este link."

**Motivo:** é o comportamento do Drive e é o que você descreveu. Sem o `grantedByLinkId`, revogar o link seria teatro: quem já entrou continuaria dentro para sempre.

### A3. Fonte da verdade do conteúdo

| Fase | Fonte da verdade | Como `content` (HTML) é atualizado |
|---|---|---|
| P1, P2 | `Note.content` (HTML) | PATCH debounced do cliente (autosave) |
| P3+ | `Note.ydocState` (Y.Doc binário) | Projeção: o cliente eleito escreve o HTML derivado |

**Decisão:** na P3, `ydocState` passa a ser a verdade, e `content` vira projeção materializada escrita pelo **cliente com menor `clientID`** entre os conectados (eleição determinística via awareness), a cada 5s de ociosidade.

**Motivo:** `content` não pode morrer. Dele dependem o `preview` da listagem (`note.service.ts:56-69`), a busca por `search`, os embeddings (`EmbeddingEntityType` já inclui `NOTE`) e a IA. Derivar HTML do Y.Doc **no servidor** exigiria replicar o schema de 18 extensões do TipTap no backend com `y-prosemirror` + `prosemirror-model`: frágil, e qualquer extensão nova no front quebraria a derivação silenciosamente.

**Alternativa rejeitada:** derivação no servidor via `@hocuspocus/transformer`. Reavaliar se um dia houver edição por API sem cliente conectado.

**Risco aceito:** se o cliente eleito perde a conexão no meio, o `content` fica até 5s atrasado em relação ao `ydocState`. Como `ydocState` é a verdade e é persistido pelo próprio Hocuspocus com debounce de 1s, nenhuma edição se perde: só o preview da listagem fica velho por alguns segundos.

### A4. Link público: anônimo lê, editar exige conta

**Decisão:** dois tipos de link, ambos no `ShareLink` existente com uma coluna nova `accessLevel VIEW|EDIT`.

- **Link VIEW** (`/public/note/:token`): sem login, HTML sanitizado, read-only. Mesmo padrão de `PublicBoardView.vue`.
- **Link EDIT** (`/notes/:id?invite=<token>`): exige login. Sem sessão, cai no `/login?redirect=`, que já funciona. Autenticado, o front chama `POST /notes/claim/:token`, que cria o `NoteAccess` e redireciona para a nota.

**Motivo:** foi a sua escolha, e é a certa. Edição anônima obrigaria a emitir token de convidado aceito pelo `onAuthenticate` do Hocuspocus, criando uma segunda via de autenticação no WebSocket sem identidade rastreável. Com login, todo cursor tem nome e toda edição tem dono.

### A5. Um servidor de colaboração, com namespace

**Decisão:** `BoardCollaborationService` vira `CollaborationService` em `src/collaboration/`, roteando por prefixo do `documentName`:

```
note:<noteId>   -> Note.ydocState,  auth por NoteAccess/dono
<boardId>       -> Board.ydocState, auth por membership (legado, sem prefixo)
```

**Motivo:** uma instância significa um `bindTo`, um `flushPendingStores` no shutdown, um lugar com o `await import()` de ESM. Duas instâncias em paths diferentes duplicariam os três e dobrariam a chance de perder edição no redeploy.

**Cuidado registrado:** `realtime.gateway.ts:35` usa `destroyUpgrade: false` justamente para o socket.io não matar o upgrade do `/collab`. Essa flag não pode ser removida.

### A6. Read-only no Yjs vem do servidor

**Decisão:** `onAuthenticate` retorna `{ readOnly: true }` quando o nível resolvido é VIEW. Não se esconde o botão no front e pronto.

**Motivo:** esconder controle no cliente não é permissão, é decoração.

### A7. Rabisco é um bloco dentro do documento

**Decisão:** node customizado do TipTap (`drawing`), com NodeView Vue, renderizado em SVG, traços gerados por `perfect-freehand`, guardados como JSON no atributo do nó.

**Motivo:** vivendo dentro do documento, o desenho sincroniza pelo Yjs de graça na P3, sobrevive a copiar/colar, entra no undo do editor e acompanha o texto quando o parágrafo acima cresce. Uma camada solta por cima da página descolaria do texto na primeira edição.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| **Alto** | **Migration em produção.** O banco é Supabase de produção e não existe automação: as migrations são escritas à mão e aplicadas por `node scripts/run-prod-migration.mjs <pasta>`, sem registrar em `_prisma_migrations` | Todo SQL das P2/P3 é **aditivo e idempotente** (`CREATE TABLE IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN duplicate_object`), no estilo de `20260620170000_intelligence_share_notifications`. Nenhum `DROP`, nenhum `NOT NULL` sem default. `prisma migrate dev` é proibido (`schema.prisma:313`) |
| **Alto** | **Uma nota compartilhada vaza para quem não deveria** por causa de checagem só no front | A permissão vira uma função única no service (`resolveAccess(noteId, userId)`), aplicada em **todos** os handlers. AC dedicado com teste de integração para 403 em cada verbo |
| **Alto** | **Redesign de 1410 linhas vira regressão funcional.** Nove comportamentos vivem hoje só nesse arquivo (pin otimista, convenção `""` limpa/omitir mantém, melhoria por IA, tabela, capa, emoji, cor, tags, link) | Inventário de comportamento na P1 vira checklist de AC um a um, verificado no app antes de fechar. Nada é "removido por parecer inútil" sem estar na spec |
| **Médio** | **Duas réplicas no Railway = dois Y.Docs divergentes** para a mesma nota. O estado do Hocuspocus é em memória, sem extensão de scaling | Confirmar 1 réplica antes de liberar a P3 (é o regime atual dos Boards). Se um dia escalar, entra `@hocuspocus/extension-redis`. Registrado como limitação conhecida |
| **Médio** | **`content` e `ydocState` divergirem** depois da P3 | `ydocState` é a verdade; `content` é projeção. Na abertura, se existe `ydocState`, ele manda, e o HTML é ignorado. Migração one-way por nota, na primeira abertura pós-P3 (ver P3) |
| **Médio** | **`GET /notes` sem paginação e sem índice** carrega toda nota com `content` inteiro. Compartilhamento multiplica o volume | P2 adiciona `@@index([createdById])` e `@@index([folderId])` em `Note`, `@@index([userId])` em `NoteAccess`, e troca o `select` da listagem para não trazer `content` (só `preview`) |
| **Médio** | **Edição simultânea na mesma conta em duas abas** perde texto antes da P3 (sem optimistic locking) | P2 adiciona `expectedUpdatedAt` no PATCH, respondendo 409. Na P1 o risco é aceito e documentado: autosave só envia o que mudou localmente, e a P3 elimina o problema com CRDT |
| **Baixo** | Desenho com muitos pontos incha o HTML da nota | Simplificação do traço ao soltar o ponteiro + teto de pontos por traço (P4) |
| **Baixo** | `start:prod` aponta para `start-ipv4.js`, arquivo que não existe no repo | Não é do escopo. Registrado para não ser descoberto no meio de um deploy |

---

## Fases

Cada parte é entregável sozinha e tem spec própria. Ordem escolhida por você: **visual primeiro**.

| Parte | Spec | Entrega | Toca backend? |
|---|---|---|---|
| **P1** | [notas-p1-editor-premium.md](../notas-p1-editor-premium.md) | Redesign completo (editor, listagem, pastas com CRUD, modo imersivo) + autosave + Vue Query + quebra do SFC | Não |
| **P2** | [notas-p2-compartilhamento.md](../notas-p2-compartilhamento.md) | Convidar pessoas (Ver/Editar), link público, revogação, nota pública, 409 | Sim (migration) |
| **P3** | [notas-p3-edicao-ao-vivo.md](../notas-p3-edicao-ao-vivo.md) | Edição simultânea com cursores e presença, sobre o Hocuspocus existente | Sim (migration) |
| **P4** | [notas-p4-rabisco.md](../notas-p4-rabisco.md) | Bloco de desenho a mão livre com pressão de stylus | Não |

**Por que P1 sem backend:** o redesign inteiro cabe no front porque o CRUD de pastas já existe na API e nunca foi consumido. Isso torna a P1 uma entrega de risco baixíssimo, sem migration e sem deploy coordenado.

**Custo da ordem escolhida:** o editor é tocado de novo na P3 para plugar a extensão de colaboração. Mitigado na P1 pelo `useNoteEditor.ts`, que centraliza a configuração do TipTap num único lugar: a P3 muda esse arquivo, não os componentes visuais.

---

## Definition of Done do épico

- [ ] P1 a P4 com status `Concluído` nas specs filhas
- [ ] Nenhuma nota pré-existente ficou acessível a alguém além do dono sem convite explícito
- [ ] `npm run type-check` limpo nos dois repos
- [ ] Zero `mdi-*` e zero hex fora de `plugins/tokens.ts` em `src/features/notes/**`
- [ ] Nenhum caractere `—` em copy visível ao usuário
- [ ] `src/CLAUDE.md` atualizado: tabela de features, correção sobre `reka-ui`, novos componentes
- [ ] `docs/specs/legacy-views-migration.md` reconciliada: a fase L2 (Notes Stack) é absorvida pela P1
- [ ] `/spec-sync` rodado

## Perguntas em Aberto

Nenhuma. As quatro que existiam foram respondidas em 2026-07-21: link público (anônimo lê, editar exige login), regra de acesso (vale do convite até revogar), rabisco (bloco dentro do texto), ordem (visual primeiro).

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-21 | 0.1 | Criação a partir de `A-FAZER-21-07.MD` + research nos dois repos | Nicolas |
