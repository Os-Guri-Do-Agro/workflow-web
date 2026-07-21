# Spec: Notas P3 - edição ao vivo

**Status:** In Review
**Autor:** Nicolas (via spec-driven)
**Criado em:** 2026-07-21
**Última atualização:** 2026-07-21
**Versão:** 0.1
**Épico:** [notas-colaborativas-premium.md](./epicos/notas-colaborativas-premium.md)
**Depende de:** [P1](./notas-p1-editor-premium.md) e [P2](./notas-p2-compartilhamento.md)
**Repos:** `workflow-api` + `work-flow`

---

## Visão Geral

Duas ou mais pessoas editando a mesma nota ao mesmo tempo, com cursores nomeados e sem conflito, reaproveitando o servidor Hocuspocus que já roda no backend.

## Motivação

Sem isso, "compartilhar para editar" é uma armadilha: dois PATCHes concorrentes fazem o último gravar por cima do primeiro, e a P2 só consegue avisar com um 409. Com CRDT o problema deixa de existir, e a nota vira o lugar onde a ata da reunião é escrita durante a reunião.

---

## Research Findings

**O servidor de colaboração já existe e roda em produção há cerca de um mês** (migration `20260620140000_board_collaborative_canvas`).

[`workflow-api/src/board/board-collaboration.service.ts`](../../../workflow-api/src/board/board-collaboration.service.ts), 198 linhas, ligado em `main.ts:237-239` depois de `enableShutdownHooks()` e antes de `listen()`:

- Path `/collab`, na mesma porta HTTP. `WebSocketServer({ noServer: true })` + listener de `upgrade` filtrando por pathname (L162-176), deixando os demais upgrades seguirem para o engine.io
- `@hocuspocus/*` é ESM-only e o projeto compila CommonJS: resolvido com `await import()` dentro de `init()` (L52-53) e a interface local `HocuspocusLike`
- `debounce: 1000`, `maxDebounce: 4000`
- Persistência com a extensão `Database`: `fetch` lê `Board.ydocState`, `store` grava. Trata `P2025` como no-op e **re-lança** os demais erros de propósito, para o Hocuspocus manter o doc em memória e tentar de novo
- `onAuthenticate` (L96-142) valida o JWT com o mesmo `JWT_SECRET`, confere membership pelo array `companies` do token com fallback no `userCompany`, e devolve `{ userId, companyId }` como `context` dos demais hooks
- `onModuleDestroy` faz `flushPendingStores()` + 1,5s de graça, para o SIGTERM de redeploy do Railway não comer os últimos segundos de edição
- **`documentName` é o `boardId` cru**, sem namespace

**Frontend:** `BoardCanvasView.vue:290-295` monta o `HocuspocusProvider` com `url` derivada de `apiBaseUrl()` trocando o esquema para `wss:`/`ws:` e pathname `/collab` (L345-354), passando o JWT em `token`. Awareness com `user` e `cursor` já funciona (L297-322, 396-416).

**Falta instalar no front:** `@tiptap/extension-collaboration`, `@tiptap/extension-collaboration-caret`, `y-prosemirror` (todos MIT 3.28/1.3.7). `yjs` e `@hocuspocus/provider` já estão.

**Cuidado registrado:** `realtime.gateway.ts:35` usa `destroyUpgrade: false` justamente para o socket.io não destruir o upgrade do `/collab`. Não remover.

**Breaking changes:** `documentName` ganha namespace. Notas usam `note:<id>`; nome sem prefixo continua sendo tratado como board legado, então o front de Boards não muda.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| **Alto** | **Semeadura duplicada.** Toda nota existente tem `content` HTML e `ydocState` nulo. Se dois clientes converterem HTML → Y.Doc ao mesmo tempo, o CRDT funde as duas versões e o texto aparece duplicado | Seed só pelo cliente com menor `clientID` entre os conectados, protegido por flag `seeded` num `Y.Map('meta')` gravado na mesma transação. AC específico: abrir a mesma nota antiga em dois navegadores ao mesmo tempo não duplica |
| **Alto** | **Perda de conteúdo na virada.** Se o Y.Doc iniciar vazio e o `store` persistir esse vazio, a nota fica em branco | O `store` de nota **nunca** sobrescreve `content`; só grava `ydocState`. Enquanto o Y.Doc estiver vazio, o `content` antigo permanece intocado no banco e é a fonte de recuperação. Só depois do seed confirmado o `content` passa a ser projeção |
| **Médio** | **Duas réplicas = dois Y.Docs divergentes** (estado do Hocuspocus é em memória, sem Redis) | Confirmar 1 réplica no Railway antes de liberar. É o mesmo regime dos Boards hoje. Se escalar, entra `@hocuspocus/extension-redis` |
| **Médio** | **Autosave da P1 brigando com o CRDT** e regravando HTML velho por cima | Quando a colaboração está conectada, o autosave de `content` é desligado e substituído pela projeção do cliente eleito. Um único caminho de escrita por vez |
| **Médio** | Convidado VIEW conseguindo escrever via WebSocket, contornando o front | `onAuthenticate` devolve `{ readOnly: true }` para nível VIEW. AC verificado por tentativa real de escrita com conexão de leitor |
| **Baixo** | Renomear `BoardCollaborationService` quebrar o boot | A renomeação toca `main.ts:237-239` e `board.module.ts`. Verificação: subir o backend e confirmar o log "Colaboração Yjs ativa em WebSocket /collab" mais um board colaborativo abrindo |

---

## Modelo de dados

```prisma
model Note {
  // ...
  ydocState Bytes?   // estado Yjs; quando presente, é a fonte da verdade
}
```

Migration `20260722120000_notes_ydoc`: uma coluna nullable. Aditiva, idempotente, sem backfill.

---

## Arquitetura

### Namespace de documento

```
note:<noteId>   -> Note.ydocState    auth por resolveAccess (P2)
<boardId>       -> Board.ydocState   auth por membership (legado, sem prefixo)
```

`BoardCollaborationService` vira `CollaborationService` em `src/collaboration/collaboration.service.ts`, com `fetch`, `store` e `onAuthenticate` roteando por prefixo. Uma instância, um `bindTo`, um `flushPendingStores`.

### Ciclo de vida no cliente

1. `GET /notes/:id` (Vue Query) devolve metadados + `content` + `accessLevel`
2. Monta `Y.Doc` e `HocuspocusProvider` com `name: 'note:<id>'` e o JWT
3. TipTap sobe com `Collaboration` (sem `history`, que a extensão substitui) e `CollaborationCaret` com nome e cor do usuário
4. No `synced`: se o fragmento está vazio, sou o menor `clientID` e `meta.seeded` não está marcado, semeia com o `content` HTML dentro de uma transação Yjs que também marca `seeded`
5. A cada 5s de ociosidade, o cliente eleito envia `PATCH /notes/:id { content: editor.getHTML() }` para manter a projeção
6. No unmount: limpa awareness, `provider.destroy()`, `ydoc.destroy()` (molde de `BoardCanvasView.vue:326-343`)

### Presença

Avatares por iniciais no header (o projeto não tem foto de usuário em nenhum tipo), com nome no tooltip e a mesma cor do cursor. Cor derivada determinística do `userId`, para a mesma pessoa ter sempre a mesma cor.

---

## Acceptance Criteria

- [ ] **Given** dois usuários com acesso Editar na mesma nota **When** ambos digitam ao mesmo tempo **Then** os dois textos coexistem, sem sobrescrita, e os dois veem o resultado em menos de 1s
- [ ] **Given** dois usuários na mesma nota **Then** cada um vê o cursor do outro com o nome ao lado e a seleção destacada na cor dele
- [ ] **Given** dois usuários na nota **Then** o header mostra os avatares de quem está presente, e o avatar some ao fechar a aba
- [ ] **Given** um usuário com acesso Ver conectado ao WebSocket **When** ele tenta escrever (inclusive forçando pelo console) **Then** a escrita é recusada pelo servidor e não chega ao outro cliente
- [ ] **Given** uma nota antiga (com `content` e sem `ydocState`) **When** dois navegadores a abrem simultaneamente pela primeira vez **Then** o conteúdo aparece **uma vez só**, sem duplicação
- [ ] **Given** uma nota já convertida **When** eu edito e fecho tudo **Then** `GET /notes` mostra o preview atualizado em até 5s após a última edição
- [ ] **Given** conexão caindo no meio da digitação **Then** o editor continua aceitando texto, o header indica "Reconectando", e ao voltar as edições locais são fundidas sem perda
- [ ] **Given** o backend reiniciando (redeploy) com nota aberta **Then** as edições dos últimos segundos são persistidas pelo `flushPendingStores`
- [ ] Boards colaborativos continuam funcionando após a renomeação do serviço e a mudança de `documentName`
- [ ] O autosave de `content` da P1 fica desativado enquanto a colaboração está conectada, e volta a valer se o WebSocket não estiver disponível

---

## Estratégia de Testes

### Integração (backend)
- [ ] `onAuthenticate` com `note:<id>`: dono → escrita; VIEW → `readOnly`; sem acesso → recusa
- [ ] Roteamento por prefixo: `fetch`/`store` de `note:` batem em `Note`, sem prefixo batem em `Board`

### Manuais
- [ ] Dois navegadores, duas contas, digitando ao mesmo tempo no mesmo parágrafo
- [ ] Nota antiga aberta simultaneamente nos dois: sem duplicação
- [ ] Conta VIEW tentando escrever
- [ ] Desligar a rede de um dos lados, digitar, religar
- [ ] Reiniciar o backend com nota aberta e conferir persistência
- [ ] Abrir um board colaborativo (com `VITE_CANVAS_ENABLED=true`) e confirmar que nada quebrou

---

## Arquivos Impactados

| Arquivo | Ação |
|---|---|
| `workflow-api/src/collaboration/collaboration.service.ts` | Criar (movido de `board/board-collaboration.service.ts`), com roteamento por prefixo |
| `workflow-api/src/collaboration/collaboration.module.ts` | Criar |
| `workflow-api/src/board/board-collaboration.service.ts` | Remover |
| `workflow-api/src/board/board.module.ts`, `src/main.ts` | Modificar - referência ao serviço novo |
| `workflow-api/prisma/schema.prisma` + `migrations/20260722120000_notes_ydoc/` | Modificar/Criar - `Note.ydocState` |
| `src/features/notes/composables/useNoteCollaboration.ts` | Criar - provider, awareness, eleição de líder, seed |
| `src/features/notes/composables/useNoteEditor.ts` | Modificar - `Collaboration` + `CollaborationCaret`, `history: false` |
| `src/features/notes/composables/useNoteAutosave.ts` | Modificar - desligar quando colaborativo |
| `src/features/notes/components/NotePresence.vue` | Criar - avatares de presença |
| `src/features/notes/components/NoteHeader.vue` | Modificar - presença + status de conexão |
| `package.json` (front) | Modificar - collaboration, collaboration-caret, y-prosemirror |

## Tasks Técnicas

- [ ] **T1** - Migration `Note.ydocState` (aditiva, nullable)
- [ ] **T2** - Extrair `CollaborationService` com roteamento por prefixo, mantendo board sem prefixo *(depende de: T1)*
- [ ] **T3** - `onAuthenticate` de nota usando `resolveAccess` da P2, com `readOnly` para VIEW *(depende de: T2)*
- [ ] **T4** - Front: `useNoteCollaboration.ts` com provider, awareness e eleição de líder *(depende de: T3)*
- [ ] **T5** - Seed HTML → Y.Doc com flag `seeded` e eleição *(depende de: T4)*
- [ ] **T6** - Projeção do `content` pelo cliente eleito, a cada 5s de ociosidade *(depende de: T4)*
- [ ] **T7** - `Collaboration` + `CollaborationCaret` no `useNoteEditor`, `history: false` *(depende de: T4)*
- [ ] **T8** - `NotePresence.vue` e status de conexão no header *(depende de: T4)*
- [ ] **T9** - Desligar o autosave de `content` quando conectado *(depende de: T6)*
- [ ] **T10** - Testes e roteiro manual *(depende de: T5..T9)*

## Plano de Rollout

1. Migration aditiva em produção
2. Deploy do backend (roteamento por prefixo é retrocompatível: cliente antigo de board segue funcionando)
3. Deploy do frontend

## Plano de Rollback

- **Código:** `git revert`. Notas voltam ao autosave por PATCH; o `content` continua íntegro no banco porque nunca deixou de ser escrito pela projeção
- **Migration:** `ALTER TABLE "Note" DROP COLUMN IF EXISTS "ydocState";` só se for necessário de fato. Aditiva e inerte para o código antigo
- **Cuidado:** edições feitas só no Y.Doc entre a última projeção e o rollback (até 5s) se perdem. Aceito e documentado

## Observabilidade

- **Log:** manter o padrão verboso já existente (`[collab] auth INÍCIO/OK/FALHOU/COMPLETO`), agora com o prefixo do documento. Adicionar `[collab] seed doc=note:<id> bytes=<n>`
- **Métrica:** contagem de recusas de autenticação por documento

## Definition of Done

- [ ] Acceptance criteria verificados com dois navegadores e duas contas
- [ ] `npx tsc --noEmit` limpo nos dois repos
- [ ] Backend sobe com o log de colaboração ativa e board colaborativo abre sem erro
- [ ] `/code-review` rodado
- [ ] Spec `Concluído` + Change Log + `/spec-sync`

## Perguntas em Aberto

- [ ] Confirmar que o serviço do backend roda com **1 réplica** no Railway antes de liberar - responsável: Nicolas

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-21 | 0.1 | Criação | Nicolas |
