# Spec: Notas P2 - compartilhar com a equipe e por link

**Status:** Implementado (código) — migration pendente de aplicar em produção
**Autor:** Nicolas (via spec-driven)
**Criado em:** 2026-07-21
**Última atualização:** 2026-07-21
**Versão:** 0.1
**Épico:** [notas-colaborativas-premium.md](./epicos/notas-colaborativas-premium.md)
**Depende de:** [P1](./notas-p1-editor-premium.md) (usa os componentes e composables criados lá)
**Repos:** `workflow-api` (migration + endpoints) e `work-flow` (UI)

---

## Visão Geral

Permitir convidar pessoas específicas da equipe para uma nota, com permissão de ver ou editar, e gerar link compartilhável revogável, no modelo do Google Drive.

## Motivação

Hoje a nota é estritamente do criador: o `where` do Prisma tem `createdById: userId` embutido em toda consulta, e não-dono recebe 404. Não existe tabela, rota nem conceito de compartilhamento. É o que impede a nota de ser o artefato de trabalho do time.

---

## Research Findings

### Estado atual do backend

**[note.service.ts](../../../workflow-api/src/note/note.service.ts)** - dois modelos de autorização convivendo:
- Notas: filtro no `where` (`{ id, createdById: userId }`, L82-83, 149, 170, 176). Não-dono recebe **404**
- Pastas: busca e compara (`if (folder.userId !== userId) throw new ForbiddenException()`, L119-121, 135-137). Não-dono recebe **403**

**[note.controller.ts](../../../workflow-api/src/note/note.controller.ts)** - `@UseGuards(JwtAuthGuard)` só. É o único módulo de produto sem `CompanyRoleGuard`. Ordem de rotas importa: `/notes/folders` (L32-64) vem antes de `/notes/:id` (L66); rotas literais novas precisam respeitar isso.

**`Note` no schema (L243-260):** sem `companyId`, sem nenhum `@@index`, `content String @db.Text`. `GET /notes` não tem `take` nem paginação e devolve o `content` inteiro de cada nota.

**`ShareLink` (L681-696):** `token` de `randomBytes(24)` hex (192 bits), `revoked` soft, `expiresAt` existe e **é validado** em `resolve()` mas nenhuma rota o escreve. `readOnly: true` é hardcoded em `share.service.ts:100,112`. `companyId` é NOT NULL com FK. Sem senha, sem nível de permissão.

**Rota pública:** não existe `@Public()`. O mecanismo é estrutural: `public.controller.ts` simplesmente não declara `@UseGuards`, e o único guard global é o `ThrottlerGuard`. Padrão a replicar.

**Molde de ACL:** `RepositoryAccess` + `RepositoryAccessLevel` (schema L507-527) é o único ACL por-usuário-por-recurso do projeto.

**Molde de escopo de convite:** `validMentions()` em `comment.service.ts:186-198` filtra ids contra `userCompany` para impedir menção cross-company com id forjado. O convite de nota precisa exatamente disso.

### Estado atual do frontend

- `share-service.ts`: `ShareResourceType = 'board'|'roadmap'|'BOARD'|'ROADMAP'`, sem `note`. Tem `list()`, `revoke(token)` e os `shareX()`, mas **não existe UI de compartilhamento em lugar nenhum do projeto**: em Boards é um `navigator.clipboard.writeText` direto (`BoardsListView.vue:88-92`)
- `PublicBoardView.vue` é o molde da view pública: `token` de `route.params`, `publicApi` sem interceptor de auth, três estados (loading/erro/conteúdo), read-only obtido por omissão de interatividade
- `PUBLIC_ROUTES` em `router/index.ts:126-134` é um `Set` de nomes de rota que escapa do guard
- Seletor de pessoas: `userService.searchUsers(q)` → `GET /user/search`, tipado `{ id, name, email }`, descrito como "usuários da empresa ativa". **Não existe avatar** em nenhum tipo do projeto: todos os avatares são iniciais em CSS
- `DOMPurify` já é dependência e é usado para conteúdo de IA

**Breaking changes:**

1. **`GET /notes` muda de shape**: passa a devolver notas compartilhadas comigo, com `accessLevel` e `owner`. Consumidor único: `NotesView.vue`
2. **`copilot/agent.service.ts:425`** tem comentário explícito "Note NÃO tem companyId (é pessoal, por createdById)" e lê Notes direto do Prisma. Precisa ser revisto para não expor nota compartilhada de terceiro no contexto da IA sem checar acesso
3. **XSS deixa de ser auto-infligido.** Hoje o HTML da nota só é renderizado para o próprio autor. Ao compartilhar, HTML de um usuário passa a ser renderizado no navegador de outro, e `BACKEND_HANDOFF.md` registra que o servidor não sanitiza. Ver Requisitos Não-Funcionais

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| **Alto** | **XSS entre usuários.** Nota com `<img onerror=...>` compartilhada executa no navegador de quem abrir | Sanitizar com DOMPurify **toda** renderização de conteúdo de nota que não seja o próprio TipTap em modo edição: view pública, preview de leitura e qualquer `v-html`. AC dedicado com payload de teste |
| **Alto** | **Migration em produção Supabase, aplicada à mão** | SQL aditivo e idempotente no estilo do repo, aplicado por `node scripts/run-prod-migration.mjs 20260721120000_notes_sharing`. Nenhum `DROP`, nenhuma coluna `NOT NULL` sem default. Rollback com SQL de compensação escrito **antes** de aplicar |
| **Alto** | **Vazamento por handler esquecido.** São 6 rotas de nota, cada uma com seu `where` | Uma função `resolveAccess(noteId, userId)` no service, retornando `'OWNER'\|'EDIT'\|'VIEW'\|null`, usada por todos. Nenhum handler consulta `createdById` direto. Teste de integração cobre 403 em cada verbo |
| **Médio** | **Convite para userId forjado de outra empresa** | Validar contra `userCompany` da empresa da nota, no molde de `validMentions()`. Convidar quem não é da empresa devolve 400 |
| **Médio** | **Revogar link vira teatro** se quem já entrou continuar dentro | `NoteAccess.grantedByLinkId` guarda a origem; revogar apaga os acessos originados. Confirmação na UI informa quantas pessoas perderão acesso |
| **Médio** | **`GET /notes` sem índice e sem paginação** piora com notas compartilhadas | Índices em `Note(createdById)`, `Note(folderId)`, `NoteAccess(userId)`; listagem para de trazer `content` (só `preview`) |
| **Médio** | Duas abas da mesma conta sobrescrevendo texto | PATCH aceita `expectedUpdatedAt`; divergência devolve 409 e a UI oferece recarregar ou sobrescrever |
| **Baixo** | Nota sem `companyId` (todas as atuais) não consegue gerar `ShareLink`, que exige `companyId` | O primeiro compartilhamento preenche `companyId` com a empresa ativa do request. Se não houver empresa ativa, 400 com mensagem explícita |

---

## Modelo de dados

```prisma
model Note {
  // ... campos atuais
  companyId String?   // null = nota pessoal nunca compartilhada
  company   Company?  @relation(fields: [companyId], references: [id])
  accesses  NoteAccess[]

  @@index([createdById])
  @@index([folderId])
  @@index([companyId])
}

model NoteAccess {
  noteId          String
  userId          String
  level           NoteAccessLevel
  invitedById     String
  grantedByLinkId String?          // origem: convite direto (null) ou link
  createdAt       DateTime         @default(now())

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([noteId, userId])
  @@index([userId])
  @@index([grantedByLinkId])
}

enum NoteAccessLevel { VIEW  EDIT }

model ShareLink {
  // ... campos atuais
  accessLevel NoteAccessLevel @default(VIEW)
}

enum ShareResourceType { BOARD  ROADMAP_YEAR  NOTE }
```

**Migration** `prisma/migrations/20260721120000_notes_sharing/migration.sql`, escrita à mão no estilo idempotente do repo (molde: `20260620170000_intelligence_share_notifications`). Esqueleto:

```sql
-- Fora de transação: ADD VALUE em enum não é transacional em Postgres < 12.
ALTER TYPE "ShareResourceType" ADD VALUE IF NOT EXISTS 'NOTE';

BEGIN;

DO $$ BEGIN
  CREATE TYPE "NoteAccessLevel" AS ENUM ('VIEW','EDIT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Note"      ADD COLUMN IF NOT EXISTS "companyId"   TEXT;
ALTER TABLE "ShareLink" ADD COLUMN IF NOT EXISTS "accessLevel" "NoteAccessLevel" NOT NULL DEFAULT 'VIEW';

CREATE TABLE IF NOT EXISTS "NoteAccess" (
  "noteId"          TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "level"           "NoteAccessLevel" NOT NULL,
  "invitedById"     TEXT NOT NULL,
  "grantedByLinkId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoteAccess_pkey" PRIMARY KEY ("noteId","userId")
);

CREATE INDEX IF NOT EXISTS "Note_createdById_idx"        ON "Note"("createdById");
CREATE INDEX IF NOT EXISTS "Note_folderId_idx"           ON "Note"("folderId");
CREATE INDEX IF NOT EXISTS "Note_companyId_idx"          ON "Note"("companyId");
CREATE INDEX IF NOT EXISTS "NoteAccess_userId_idx"       ON "NoteAccess"("userId");
CREATE INDEX IF NOT EXISTS "NoteAccess_grantedByLink_idx" ON "NoteAccess"("grantedByLinkId");

-- FKs por DO/EXCEPTION, porque ADD CONSTRAINT não aceita IF NOT EXISTS.
DO $$ BEGIN
  ALTER TABLE "NoteAccess" ADD CONSTRAINT "NoteAccess_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- idem para userId -> User(id) e Note.companyId -> Company(id)

COMMIT;
```

**Regras fixadas:** nenhum `DROP`, nenhuma coluna `NOT NULL` sem default, nenhum backfill. Validar em banco local antes de aplicar em produção, e conferir a versão do Postgres do Supabase na T1 (se for 12+, o `ADD VALUE IF NOT EXISTS` pode entrar na transação).

---

## Contrato de API

### Autorização central

```ts
resolveAccess(noteId, userId): Promise<'OWNER' | 'EDIT' | 'VIEW' | null>
```

- `OWNER` se `createdById === userId`
- senão o `level` de `NoteAccess`
- senão `null`

Regras: leitura exige não-nulo; escrita de conteúdo exige `OWNER` ou `EDIT`; convidar, revogar, mudar pasta, excluir e gerar link exigem `OWNER`. Acesso negado devolve **403** (`ForbiddenException`), não 404, uma vez que quem tem o id da nota já sabe que ela existe. As rotas de pasta continuam como estão (pastas não são compartilháveis nesta fase).

### Rotas novas

| Rota | Permissão | Descrição |
|---|---|---|
| `GET /notes/:id/access` | OWNER | Lista quem tem acesso: `{ user: {id,name,email}, level, invitedAt, viaLink }` |
| `POST /notes/:id/access` | OWNER | `{ userId, level }`. Valida membership na empresa da nota. Preenche `Note.companyId` se estiver null |
| `PATCH /notes/:id/access/:userId` | OWNER | Muda o nível |
| `DELETE /notes/:id/access/:userId` | OWNER | Remove acesso |
| `POST /notes/:id/share-link` | OWNER | `{ accessLevel }`. Cria/retorna `ShareLink` de `resourceType: NOTE`. Devolve `{ token, path, accessLevel }` |
| `GET /notes/:id/share-link` | OWNER | Links ativos da nota |
| `DELETE /share/:token` | OWNER da nota | **Já existe.** Estender: ao revogar link de nota, apagar `NoteAccess` com aquele `grantedByLinkId` |
| `POST /notes/claim/:token` | autenticado | Resgata link EDIT: cria `NoteAccess { level: EDIT, grantedByLinkId }` e devolve `{ noteId }`. Recusa link revogado, expirado ou VIEW |
| `GET /public/note/:token` | público | Link VIEW. Devolve `{ note: { title, contentHtml, emoji, coverImage, updatedAt }, readOnly: true }`. **Não** devolve tags, pasta, id nem dados do autor além do nome |

### Rotas alteradas

- **`GET /notes`**: `where` vira `OR: [{ createdById: userId }, { accesses: { some: { userId } } }]`. Cada item ganha `accessLevel` e `owner: { id, name }`. `select` para de trazer `content` (o `preview` já é derivado no servidor). Adicionar `take` de 200 com ordenação estável
- **`GET /notes/:id`**: passa por `resolveAccess`, devolve `accessLevel` no corpo
- **`PATCH /notes/:id`**: exige OWNER ou EDIT. Aceita `expectedUpdatedAt` opcional; se divergir do `updatedAt` atual, responde **409** com `{ currentUpdatedAt }`
- **`DELETE /notes/:id`** e **`POST /notes/:id/pin`**: OWNER apenas (pin é preferência do dono nesta fase)
- **`DELETE /notes/folders/:id`**: hoje faz `updateMany({ where: { folderId, createdById: userId } })`; revisar para não deixar nota de terceiro órfã apontando para pasta apagada

---

## Requisitos Não-Funcionais

- **Segurança:** toda rota de nota passa por `resolveAccess`. Convite restrito a membros da mesma empresa. Token do link mantém `randomBytes(24)` e continua em claro (é o padrão do projeto e o token é o segredo). `GET /public/note/:token` fica sob `@SkipThrottle()`? **Não**: mantém o rate limit global de 300req/60s, ao contrário de `public.controller.ts:11`, porque nota pública é alvo mais provável de varredura de token do que board
- **XSS:** todo HTML de nota renderizado fora do TipTap em modo edição passa por `DOMPurify.sanitize` com allowlist. Inclui `PublicNoteView.vue` e qualquer preview de leitura
- **Privacidade:** a resposta pública não inclui id da nota, tags, pasta, id de usuário nem e-mail. Segue o critério já aplicado em `share.service.ts:107-108` para o roadmap público
- **Performance:** `GET /notes` responde sem trazer `content`; índices em `Note(createdById)`, `Note(folderId)`, `NoteAccess(userId)`
- **Observabilidade:** log estruturado em conceder, mudar nível, revogar acesso e revogar link, com `noteId`, `actorId`, `targetUserId` e `level`

---

## User Stories

- Como **dono de nota**, quero convidar colegas por nome ou e-mail escolhendo Ver ou Editar
- Como **dono de nota**, quero gerar um link para mandar no chat, e revogá-lo depois
- Como **dono de nota**, quero ver quem tem acesso e desde quando
- Como **convidado**, quero encontrar a nota compartilhada comigo na minha lista, marcada como não minha
- Como **pessoa de fora**, quero abrir o link e ler a nota sem precisar de conta

---

## Acceptance Criteria

### Permissão (backend)

- [ ] **Given** uma nota minha **When** convido alguém com nível Ver **Then** essa pessoa vê a nota em `GET /notes` com `accessLevel: 'VIEW'`, e o `PATCH /notes/:id` dela responde **403**
- [ ] **Given** nível Editar **Then** o `PATCH` dela é aceito e persiste
- [ ] **Given** alguém sem nenhum acesso **When** chama `GET /notes/:id` **Then** recebe 403
- [ ] **Given** um userId de outra empresa **When** tento convidar **Then** recebe 400 e nenhum `NoteAccess` é criado
- [ ] **Given** um convidado com nível Editar **When** ele tenta convidar outra pessoa, excluir a nota ou gerar link **Then** recebe 403
- [ ] Convidar, mudar nível, remover acesso e revogar link emitem log com `noteId`, `actorId` e `targetUserId`
- [ ] `resolveAccess` é o único lugar do service que decide permissão de nota (verificável por leitura: nenhum outro `createdById:` em cláusula de autorização)

### Link

- [ ] **Given** um link Ver **When** abro `/public/note/<token>` sem estar logado **Then** vejo título, emoji, capa e conteúdo, sem nenhum controle de edição
- [ ] **Given** um link Editar **When** abro sem estar logado **Then** sou levado ao login e, após autenticar, volto para a nota já com acesso de edição concedido
- [ ] **Given** um link revogado **When** abro **Then** recebo mensagem de link inválido, sem distinguir "não existe" de "revogado"
- [ ] **Given** um link Editar resgatado por 3 pessoas **When** revogo o link **Then** as 3 perdem o acesso, e a confirmação avisou o número antes
- [ ] **Given** um convite direto (não por link) **When** revogo o link **Then** esse acesso **não** é afetado
- [ ] O acesso registra data e hora, e a UI mostra "convidado em DD/MM às HH:MM"

### Conflito

- [ ] **Given** a mesma nota aberta em duas abas **When** a segunda salva com `expectedUpdatedAt` antigo **Then** recebe 409 e a UI oferece "Recarregar" ou "Sobrescrever", sem descartar o texto digitado

### Segurança

- [ ] **Given** uma nota contendo `<img src=x onerror="alert(1)">` **When** outro usuário abre a nota ou o link público **Then** nada é executado e a imagem quebrada é renderizada inerte
- [ ] `GET /public/note/:token` não devolve id da nota, tags, pasta, e-mail nem id de usuário

### UI

- [ ] Botão "Compartilhar" no header do editor abre diálogo com: busca de pessoas, lista de quem tem acesso com nível editável, remover, gerar link com escolha de Ver/Editar, copiar e revogar
- [ ] O diálogo usa Teleport + tokens (nada de `v-dialog`), fecha com Esc e clique fora, e prende o foco
- [ ] Notas compartilhadas comigo aparecem na listagem com marca visual e nome do dono
- [ ] Nota em modo Ver abre o editor em somente leitura, com aviso "Você tem acesso apenas para ver"
- [ ] Copiar link mostra confirmação e o link funciona colado em aba anônima

---

## Estratégia de Testes

### Integração (backend, Jest - criar os primeiros testes de nota do projeto)
- [ ] `resolveAccess` - dono, EDIT, VIEW, sem acesso
- [ ] `PATCH /notes/:id` com VIEW → 403; com EDIT → 200
- [ ] `POST /notes/:id/access` com usuário de outra empresa → 400
- [ ] `POST /notes/claim/:token` com link revogado → 404; com link VIEW → 400
- [ ] `DELETE /share/:token` apaga só os `NoteAccess` com aquele `grantedByLinkId`
- [ ] `PATCH` com `expectedUpdatedAt` divergente → 409

### Manuais (dois usuários da mesma empresa)
- [ ] A convida B como Ver: B vê na lista, não consegue editar
- [ ] A promove B para Editar: B edita e A vê ao recarregar
- [ ] A remove B: a nota some da lista de B e `GET` devolve 403
- [ ] A gera link Ver, abre em aba anônima: lê
- [ ] A gera link Editar, B abre deslogado: passa pelo login e cai na nota com acesso
- [ ] A revoga: aba anônima e B perdem o acesso
- [ ] Payload de XSS numa nota compartilhada não executa em B nem na view pública

### Regressão
- [ ] Notas não compartilhadas continuam invisíveis para todos, incluindo membros da mesma empresa
- [ ] Board e roadmap públicos continuam funcionando após a mudança no `ShareLink` e no `DELETE /share/:token`
- [ ] A IA (`copilot/agent.service.ts`) não passa a expor nota de terceiro no contexto

---

## Arquivos Impactados

### Backend (`workflow-api`)

| Arquivo | Ação |
|---|---|
| `prisma/schema.prisma` | Modificar - `NoteAccess`, `NoteAccessLevel`, `Note.companyId`, índices, `ShareLink.accessLevel`, `ShareResourceType.NOTE` |
| `prisma/migrations/20260721120000_notes_sharing/migration.sql` | Criar - SQL idempotente escrito à mão |
| `src/note/note.service.ts` | Modificar - `resolveAccess`, `findAll` com OR, `findOne`, `update` com 409, share-link, claim |
| `src/note/note.controller.ts` | Modificar - rotas de acesso e de link (antes de `/:id`) |
| `src/note/note.module.ts` | Modificar - importar `AuthModule` e `ShareModule` |
| `src/note/dto/*.dto.ts` | Criar - `grant-access.dto.ts`, `create-note-share-link.dto.ts`; modificar `update-note.dto.ts` (+`expectedUpdatedAt`) |
| `src/share/share.service.ts` | Modificar - `NOTE` em `publicPath`, `getPublicNote`, revogação em cascata |
| `src/share/public.controller.ts` | Modificar - `GET /public/note/:token` |
| `src/copilot/agent.service.ts` | Modificar - revisar leitura de Note à luz do compartilhamento |

### Frontend (`work-flow`)

| Arquivo | Ação |
|---|---|
| `src/features/notes/components/NoteShareDialog.vue` | Criar |
| `src/features/notes/components/NotePeoplePicker.vue` | Criar - busca via `searchUsers`, avatar por iniciais |
| `src/features/public/PublicNoteView.vue` | Criar - molde de `PublicBoardView`, HTML sanitizado |
| `src/features/notes/composables/useNoteAccess.ts` | Criar - Vue Query para acesso e links |
| `src/service/notes/notes-service.ts` | Modificar - endpoints novos |
| `src/service/share/share-service.ts` | Modificar - `'note'` em `ShareResourceType`, `publicNote(token)` |
| `src/router/index.ts` | Modificar - rota `public-note` + entrada em `PUBLIC_ROUTES` |
| `src/features/notes/NoteEditorView.vue` | Modificar - botão Compartilhar, modo somente leitura, tratamento de 409 |
| `src/features/notes/NotesView.vue` | Modificar - marca de compartilhada e dono |
| `src/features/notes/types.ts` | Modificar - `NoteAccess`, `AccessLevel` |

---

## Tasks Técnicas

- [ ] **T1** - Escrever `schema.prisma` + `migration.sql` idempotente + **SQL de compensação** para rollback; validar em banco local antes de qualquer coisa
- [ ] **T2** - `resolveAccess` em `note.service.ts` e aplicá-la em todos os handlers existentes *(depende de: T1)*
- [ ] **T3** - Rotas de acesso (`GET/POST/PATCH/DELETE /notes/:id/access`) + DTOs + validação de membership *(depende de: T2)*
- [ ] **T4** - `GET /notes` com OR, `accessLevel`, `owner`, sem `content`, com `take` *(depende de: T2)*
- [ ] **T5** - Share link de nota + `claim` + revogação em cascata + `GET /public/note/:token` *(depende de: T2)*
- [ ] **T6** - `expectedUpdatedAt` e 409 no `PATCH` *(depende de: T2)*
- [ ] **T7** - Testes de integração da seção de testes *(depende de: T3, T4, T5, T6)*
- [ ] **T8** - Revisar `copilot/agent.service.ts` *(depende de: T2)*
- [ ] **T9** - Front: service + `useNoteAccess.ts` + tipos *(depende de: T3, T5)*
- [ ] **T10** - `NoteShareDialog.vue` + `NotePeoplePicker.vue` *(depende de: T9)*
- [ ] **T11** - `PublicNoteView.vue` + rota + `PUBLIC_ROUTES` + sanitização DOMPurify *(depende de: T9)*
- [ ] **T12** - Editor em modo somente leitura, aviso de nível, tratamento de 409 *(depende de: T9)*
- [ ] **T13** - Listagem com marca de compartilhada e dono *(depende de: T9)*
- [ ] **T14** - Roteiro manual com dois usuários + teste de XSS *(depende de: T10..T13)*

---

## Plano de Rollout

1. Aplicar a migration em produção com `node scripts/run-prod-migration.mjs 20260721120000_notes_sharing` **antes** do deploy do backend (é aditiva, o código antigo ignora as colunas novas)
2. Deploy do backend. Nada muda para o usuário: sem `NoteAccess`, todo mundo continua vendo só as próprias notas
3. Deploy do frontend

**Atenção registrada:** conforme a memória do projeto, deploy por push no Railway derruba o container antes de validar. A migration ser aditiva e o backend novo ser compatível com o front antigo é o que torna essa janela segura.

## Plano de Rollback

- **Código:** `git revert` nos dois repos
- **Migration:** não reverter por padrão. As colunas e tabelas novas são aditivas e inertes para o código antigo (`Note.companyId` nullable, `NoteAccess` vazia, `ShareLink.accessLevel` com default). Se for necessário desfazer de fato, existe o SQL de compensação escrito na T1: `DROP TABLE IF EXISTS "NoteAccess"; ALTER TABLE "Note" DROP COLUMN IF EXISTS "companyId"; ALTER TABLE "ShareLink" DROP COLUMN IF EXISTS "accessLevel";`. O valor `NOTE` do enum **não é removível** em Postgres sem recriar o tipo: fica órfão e inofensivo
- **Dados:** revogar todos os compartilhamentos sem apagar tabela: `DELETE FROM "NoteAccess";`

## Observabilidade

- **Log:** `[notes] access granted note=<id> actor=<id> target=<id> level=<VIEW|EDIT>`; equivalentes para `revoked`, `level-changed`, `link-created`, `link-revoked cascade=<n>`
- **Métrica:** contagem de 403 em rotas de nota (indicador de tentativa de acesso indevido ou de bug de permissão)
- **Alerta:** nenhum automatizado nesta fase

---

## Definition of Done

- [ ] Todos os acceptance criteria verificados, com dois usuários reais
- [ ] Testes de integração passando
- [ ] `npx tsc --noEmit` limpo nos dois repos
- [ ] Migration aplicada em produção e confirmada por consulta ao `information_schema`
- [ ] `/code-review` e `/security-review` rodados, findings de correção resolvidos
- [ ] Teste de XSS executado e documentado no relatório
- [ ] Spec com status `Concluído` + data + Change Log
- [ ] `/spec-sync` rodado

## Implementação (2026-07-22)

**Código completo nos dois repos, verde em typecheck e lint. A migration NÃO foi aplicada em produção** (aguarda sua autorização; ver Rollout).

Backend (`workflow-api`):
- Schema: `Note.companyId`, `NoteAccess` + `NoteAccessLevel`, `ShareLink.accessLevel`, `ShareResourceType.NOTE`, índices. `prisma format` + `generate` rodados.
- Migration: `prisma/migrations/20260722120000_notes_sharing/migration.sql` (aditiva, idempotente, com SQL de compensação comentado no fim).
- `note.service.ts` reescrito com `resolveAccess` central + `requireRead/requireEdit/requireOwner` em todos os handlers; `findAll` com OR (minhas + compartilhadas), sem `content`, com `take: 200`; 409 via `expectedUpdatedAt`; grant/list/update/revoke de acesso; share-link + claim; `getPublicNote` minimizado.
- Controller: rotas novas na ordem certa (literais antes de `:id`); `NotePublicController` (sem guard) para `GET /public/note/:token`.
- `share.service.ts`: `revoke` faz cascata de `NoteAccess` para links `NOTE`.
- `copilot/agent.service.ts`: comentário corrigido; IA segue lendo só notas próprias (seguro).

Frontend (`work-flow`):
- `notes-service` + `share-service` estendidos; `useNoteAccess` (Vue Query); tipos.
- `NoteShareDialog.vue` (busca de pessoas, níveis Ver/Editar, lista com acesso, link público com revogação em cascata confirmada), `PublicNoteView.vue` (DOMPurify), rota `public-note` + `PUBLIC_ROUTES` + bare shell.
- `NoteEditorView`: botão Compartilhar (só dono), modo somente-leitura para VIEW, tratamento de 409, resgate de link `?invite=`.
- `NoteCard`: selo "compartilhada por X".

**Verificado no app rodando** (mock com estado): botão Compartilhar aparece, dialog abre, busca acha a pessoa, convite entra em "Com acesso", link público é gerado/copiado, view pública renderiza read-only com HTML sanitizado. Zero exceções de console.

**Não verificado com dois usuários reais** (exige duas contas): o 403 de VIEW no PATCH, a cascata de revogação e o XSS entre navegadores estão implementados e cobertos por lógica, mas a prova ponta a ponta com dois logins fica para quando a migration estiver em produção.

**Desvios da spec:** migration nomeada `20260722120000` (não `21`); `getPublicNote` e a view pública ficam no domínio de Notas (`NotePublicController` + `PublicNoteView`) em vez de no `ShareModule`, para não acoplar `ShareModule`↔`NoteModule`.

## Perguntas em Aberto

- [ ] Aplicar a migration em produção (`node scripts/run-prod-migration.mjs 20260722120000_notes_sharing`) e fazer deploy — responsável: Nicolas (autorização explícita necessária).

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-21 | 0.1 | Criação | Nicolas |
| 2026-07-22 | 1.0 | Implementada (código); migration pendente de aplicar em produção | Nicolas |
