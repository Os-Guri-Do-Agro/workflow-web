# Spec: Drive P1 - Drive nativo (pessoal + empresa)

**Status:** Em Implementação
**Autor:** Nicolas (via spec-driven)
**Criado em:** 2026-08-11
**Última atualização:** 2026-08-11
**Versão:** 0.1
**Épico:** [drive-de-arquivos.md](../../../epicos/drive-de-arquivos.md)
**Repos:** `workflow-api` (migration + módulo `drive/`) e `work-flow` (feature `drive/`)

---

## Visão Geral

Área de arquivos com espaço **pessoal** por usuário e espaço **compartilhado**
por empresa: pastas, upload com progresso, preview (imagem/PDF), download por
URL assinada, renomear, mover e excluir. Primeiro módulo do produto em bucket
**privado** com signed URL, no padrão que a Decisão 13 do EVOLUCAO.md exige.

## Motivação / Contexto de Negócio

Hoje não existe lugar para guardar um arquivo que não seja anexo de uma tarefa,
e todo anexo vive em bucket público com URL adivinhável. Um contrato de cliente
não tem onde morar. O Drive cria esse lugar e a fundação de storage privado que
P2 (integração com tarefas/notas), P3 (compartilhamento) e o portal do cliente
vão consumir.

---

## Research Findings

**Stack:** Vue 3.5 + Vuetify 4 + Pinia + TanStack Vue Query 5 + Axios · NestJS +
Prisma + Supabase Storage · roles `ADMIN`/`WORKER` por empresa (`UserCompany`).

**Padrões a seguir:**

- **Storage privado**: `workflow-api/src/ocr/ocr-storage.service.ts` - bucket
  por env com default, `ensureBucket({ public: false })` idempotente, path
  canônico, leitura só por `createSignedUrl(path, 300)`, upload que lança
  `BadGatewayException` (nunca finge sucesso). O `SupabaseService`
  (`src/supabase/supabase.service.ts`) é o anti-padrão: bucket público
  hardcoded, path flat, `deleteFile` silencioso.
- **Escopo pessoal/empresa**: QR - `scope: 'personal' | 'company'`,
  `companyId: string | null` no body (`null` = pessoal), contadores por escopo
  que ignoram o filtro ativo (`work-flow/src/service/qr/qr-service.ts:38-45,135-148`);
  sidebar Pessoal/Empresa (`src/features/qr/components/QrSidebar.vue`); filtro
  persistido em `?scope=` (`QrCodesView.vue:106-110`).
- **Árvore de pastas no schema**: `NoteFolder` com auto-relação
  `parentId`/`children` (`workflow-api/prisma/schema.prisma:336-349`).
- **Guard multi-tenant**: `CompanyRoleGuard` valida membership em todas as
  fontes de `companyId` e pendura `request.userRole`
  (`src/auth/guards/company-role.guard.ts`). Módulo típico:
  `@UseGuards(JwtAuthGuard, CompanyRoleGuard)` na classe +
  `@RequireRole(CompanyRole.WORKER)` por handler + `@Headers('x-company-id')`.
- **Validação de upload**: `src/common/upload-rules.ts` -
  `BLOCKED_EXTENSIONS` (denylist de executáveis) + limite + mensagens pt-BR,
  rodando **antes** de tocar o storage.
- **Módulo de referência (mais recente)**: `src/activity-doc/` - controller com
  Swagger em pt-BR, DTOs class-validator com limites em `*.constants.ts`,
  module com docblock.
- **Front - service**: objeto literal tipado em
  `src/service/<dominio>/<dominio>-service.ts` (estilo `qr-service.ts` /
  `ocr-service.ts`; NÃO o estilo classe com `handleRequest`).
- **Front - dados**: Vue Query com chaves prefixadas por empresa
  (`src/composables/useQrFolders.ts:7-65` é o molde de keys + mutations +
  invalidação + toasts).
- **Front - upload**: `src/features/tasks/components/TaskAttachments.vue` -
  dropzone com input nativo invisível, um request por arquivo em `Promise.all`,
  progresso por item, reset do input, grade/lista persistida.
- **Front - viewer**: `src/features/tasks/components/AttachmentViewer.vue` -
  overlay via `Teleport to="body"`, preview de imagem/PDF, foco preso, Esc.
- **Front - signed URL**: `ocrService.documentUrl()`
  (`src/service/ocr/ocr-service.ts:172-177`) - `GET .../url` devolve `{ url }`.
- **Design system**: `AppDialog` (zero `v-dialog`), `ConfirmDialog`,
  `EmptyState`, `Skeleton`, `Pill`, `InlineEditText`, tokens (nunca hex),
  lucide (nunca mdi), `useUiPreferences()` (nunca localStorage direto),
  sem border-left como recurso de hierarquia. Em copy visível ao usuário,
  caractere em-dash é proibido.
- **Migrations**: escritas à mão, aditivas e idempotentes; `.env` local aponta
  para produção; drift pendente torna `prisma migrate dev` proibido
  (`prisma/migrations/20260810120000_.../migration.sql:1-16`).

**Referências no código (âncoras):**

- `workflow-api/src/ocr/ocr-storage.service.ts` - molde do storage service
- `workflow-api/src/auth/guards/company-role.guard.ts` - multi-tenant
- `workflow-api/src/common/upload-rules.ts` - validação a generalizar
- `workflow-api/prisma/schema.prisma:336-349` - `NoteFolder` (árvore)
- `work-flow/src/features/qr/` - anatomia pessoal/empresa/pastas na UI
- `work-flow/src/features/tasks/components/TaskAttachments.vue` e
  `AttachmentViewer.vue` - upload e viewer a reaproveitar
- `work-flow/src/features/tasks/attachment-kind.ts` - `kindOf/isPreviewable/formatBytes`

**Breaking Changes:**

- Nenhuma de API. Módulo e rotas novos.
- **Movimentação interna no front**: `AttachmentViewer.vue` é promovido de
  `features/tasks/components/` para `src/components/ui/FileViewer.vue`
  (generalizado). Consumidores atuais atualizam import:
  `TaskDetailPanel.vue:720` e 4 pontos de `TaskDetailsView.vue`. Regressão
  manual obrigatória nos anexos de tarefa.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | **Migration em produção Supabase, aplicada à mão, com drift pendente** | SQL aditivo e idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), zero `DROP`, zero `ALTER` em tabela existente. SQL de compensação (drop das tabelas novas) escrito **antes** de aplicar. Aplicar fora de horário de pico |
| Alto | **Vazamento cross-tenant ou cross-usuário por handler esquecido** (8 rotas novas) | `resolveFileAccess()` / `resolveFolderAccess()` únicos no service, retornando `'OWNER' \| 'ADMIN' \| 'MEMBER' \| null`; nenhum handler monta `where` de autorização direto. Testes unitários cobrem a matriz inteira (pessoal alheio → 404; empresa sem membership → 403; WORKER apagando arquivo alheio → 403) |
| Alto | **Arquivo de empresa acessível sem login** (repetir o erro do bucket público) | Bucket novo `drive-files` criado com `public: false` via `ensureBucket()`; leitura exclusivamente por `createSignedUrl`; AC dedicado verifica que a URL pública do objeto responde erro |
| Médio | **Upload sem limite derruba o container** (Railway, deploy por push já é frágil) | `FileInterceptor('file', { limits: { fileSize: DRIVE_MAX_FILE_BYTES } })` no controller (multer corta o stream) + `assertUploadAllowed` no service antes do storage. Default 25 MB, configurável por env |
| Médio | **Objetos órfãos no storage** (delete de DB ok, storage falha) | Ordem: apaga objeto primeiro, depois a linha; falha de storage é **logada** com `storagePath` (nunca silenciosa como `SupabaseService.deleteFile`). Órfão residual é aceitável e rastreável pelo log; linha órfã (sem objeto) não é |
| Médio | **Signed URL de preview expira com a grade aberta** | Dois TTLs: preview de imagem na listagem = 3600 s (batch `createSignedUrls`); abrir/baixar = 300 s gerada na hora via `GET /drive/files/:id/url`. `FileViewer` sempre pede URL fresca ao abrir |
| Baixo | Colisão de nome de arquivo | Path do objeto usa `fileId` (cuid) + extensão; nome de exibição vive só no banco. Renomear não toca o storage |
| Baixo | Usuário deletado deixa arquivos de empresa acéfalos | `ownerId` nullable com `onDelete: SetNull` (precedente `Attachment.uploadedBy`); arquivo de empresa sem dono passa a ser gerenciável só por ADMIN. Arquivo pessoal órfão fica invisível (não há fluxo de deleção de usuário no produto hoje; registrado como follow-up) |

---

## Requisitos Não-Funcionais

- **Segurança:** bucket privado; toda rota exige JWT; rotas de empresa passam
  pelo `CompanyRoleGuard` com `@RequireRole(WORKER)`; denylist de extensões
  executáveis reaproveitada de `upload-rules.ts`; limite de tamanho aplicado no
  interceptor (stream) e revalidado no service.
- **Privacidade / LGPD:** documentos de empresa são dados de terceiros;
  exclusão remove o objeto do storage, não só a linha. Signed URL curta evita
  links perenes em histórico de chat/e-mail.
- **Performance:** listagem de arquivos paginada (pageSize 50) com busca por
  nome no servidor; previews assinados em batch (1 chamada por página, não 1
  por arquivo); índices `(companyId, folderId)`, `(ownerId)`, `(folderId)`.
- **Observabilidade:** log estruturado (Nest Logger + requestId já global) em
  upload, delete e falha de storage, sempre com `storagePath` e `userId`.
  Métricas não aplicáveis (repo não tem infra de métricas).
- **Acessibilidade:** dropzone com input nativo focável (padrão
  `TaskAttachments`), diálogos via `AppDialog` (foco preso, Esc), botões com
  `aria-label` quando só ícone.

---

## User Stories

- Como **usuário**, quero **guardar arquivos pessoais em pastas** para **ter
  meus documentos de trabalho num lugar só, invisíveis para os demais**.
- Como **membro (WORKER) de uma empresa**, quero **ver e subir arquivos na área
  da empresa** para **compartilhar material com o time sem mandar link solto**.
- Como **ADMIN da empresa**, quero **organizar (criar/renomear/mover/excluir)
  pastas e qualquer arquivo da empresa** para **manter a área utilizável**.
- Como **usuário**, quero **pré-visualizar imagem e PDF e baixar qualquer
  arquivo** para **não depender de baixar para ver**.

---

## Acceptance Criteria

### Comportamentais - escopo e permissão

- [ ] **AC1 Given** usuário autenticado **When** `GET /drive/files?scope=personal`
  **Then** só arquivos com `ownerId = eu` e `companyId = null` retornam.
- [ ] **AC2 Given** membro da empresa A **When**
  `GET /drive/files?scope=company&companyId=A` **Then** só arquivos com
  `companyId = A` retornam; com `companyId` (query ou header) de empresa da
  qual não sou membro, 403. A empresa alvo é explícita e independe da empresa
  ativa do topo (v0.3).
- [ ] **AC3 Given** arquivo pessoal de outro usuário **When** qualquer rota com
  o id dele (`GET .../url`, `PATCH`, `DELETE`) **Then** 404.
- [ ] **AC4 Given** WORKER que não subiu o arquivo de empresa **When**
  `PATCH` ou `DELETE` no arquivo **Then** 403; **Given** ADMIN da empresa
  **Then** 200.
- [ ] **AC5 Given** WORKER **When** `POST/PATCH/DELETE /drive/folders` com
  `companyId` preenchido **Then** 403; ADMIN → 2xx. Pasta pessoal
  (`companyId` ausente/null) → o próprio usuário cria e gerencia.
- [ ] **AC6 Given** upload com `companyId` de empresa da qual não sou membro
  **When** `POST /drive/files` **Then** 403 (guard valida body).

### Comportamentais - upload, arquivo e pasta

- [ ] **AC7 Given** arquivo de 26 MB (default 25 MB) **When** upload **Then**
  400 com mensagem pt-BR, e nenhum objeto é criado no storage.
- [ ] **AC8 Given** arquivo `.exe` (denylist) **When** upload **Then** 400
  antes de tocar o storage. `.md` é aceito (a regra "md é documento" é
  específica de Activity).
- [ ] **AC9 Given** upload válido **Then** resposta contém
  `{ id, name, mimeType, size, folderId, companyId, ownerId, createdAt }` e a
  linha persiste `storagePath` no formato
  `drive/company/<companyId>/<fileId>.<ext>` ou `drive/user/<userId>/<fileId>.<ext>`.
- [ ] **AC10 Given** arquivo renomeado via `PATCH` **Then** `name` muda,
  `storagePath` não muda, e a URL assinada continua servindo o objeto.
- [ ] **AC11 Given** mover arquivo para pasta de escopo diferente (pessoal →
  empresa ou vice-versa) **Then** 400 (mover não troca escopo na P1).
- [ ] **AC12 Given** pasta com subpastas e N arquivos **When** `DELETE` (após
  confirmação na UI) **Then** todas as linhas somem, os N objetos são removidos
  do storage, e falha de remoção de objeto gera log com `storagePath`.
- [ ] **AC13 Given** pasta com `parentId` formando ciclo (mover A para dentro
  de descendente de A) **When** `PATCH /drive/folders/:id` **Then** 400.

### Observáveis - storage privado

- [ ] **AC14** Bucket `drive-files` existe com `public: false`; acessar a URL
  pública de um objeto (`/storage/v1/object/public/drive-files/...`) responde
  erro (400/403/404), enquanto a signed URL do mesmo objeto responde 200.
- [ ] **AC15** `GET /drive/files/:id/url` devolve `{ url }` com expiração de
  300 s; previews de imagem na listagem vêm assinados com TTL 3600 s, gerados
  em batch.

### Comportamentais - UI

- [ ] **AC16 Given** `/drive` aberto **Then** sidebar mostra Pessoal e TODAS
  as empresas do usuário, cada uma com contador; clicar numa empresa mostra os
  arquivos dela sem alterar a empresa ativa do topo; a seleção persiste em
  `?scope=personal|<companyId>` (v0.3).
- [ ] **AC17 Given** arrastar 3 arquivos para a área **Then** 3 requests
  paralelos com progresso individual; falha de um não cancela os outros; item
  com erro mostra retry ou remoção da fila.
- [ ] **AC18 Given** escopo vazio **Then** `EmptyState` com ação de upload;
  carregando **Then** `Skeleton`; erro de API **Then** toast via `useToast()`
  com mensagem do backend.
- [ ] **AC19 Given** clicar em imagem ou PDF **Then** `FileViewer` abre com URL
  fresca (300 s); outros tipos mostram cartão de download. Toggle grade/lista
  persistido via `useUiPreferences()`.
- [ ] **AC20 Given** troca de empresa selecionada na sidebar **Then** a
  listagem reflete a nova empresa sem mostrar dados da anterior (query keys
  prefixadas pela empresa SELECIONADA); permissões (Nova pasta, gerenciar
  arquivo) seguem a MINHA role naquela empresa, não na ativa (v0.3).
- [ ] **AC21** Item "Drive" aparece na navegação dos três shells (NavList,
  FocusShell rail, CanvasShell tabs+dock) e na Command Palette, seção Trabalho,
  visível para WORKER.

---

## Estratégia de Testes

O repo da API tem Jest configurado (scaffold); o front não tem infra de teste.
Estratégia realista: unitário onde o risco mora (autorização e validação),
manual + CDP no resto.

### Unitários (workflow-api)

- [ ] `drive.service` `resolveFileAccess` / `resolveFolderAccess` - matriz
  completa: dono pessoal, não-dono pessoal (null), membro empresa (MEMBER),
  uploader empresa (OWNER), ADMIN empresa, não-membro (null) → cobre AC1-AC6.
- [ ] `assertUploadAllowed` generalizado - tamanho no limite, acima do limite,
  extensão bloqueada, `.md` aceito → cobre AC7-AC8.
- [ ] Validação de ciclo em mover pasta → cobre AC13.

### Integração (manual via API, transcrito na PR)

- [ ] Fluxo completo com dois usuários e duas empresas: upload pessoal e de
  empresa, listagem cruzada (AC1-AC4), signed URL vs URL pública (AC14-AC15),
  delete de pasta recursivo (AC12).

### Manuais (happy path, com screenshot CDP)

- [ ] Upload multi-arquivo com progresso, preview de imagem e PDF, renomear
  inline, mover, excluir com confirmação, alternar escopo, trocar empresa
  (AC16-AC20).

### Regressão

- [ ] Anexos de tarefa continuam abrindo no viewer após a promoção para
  `FileViewer` (`TaskDetailPanel` e `TaskDetailsView`, 5 pontos de uso).

---

## Arquivos Impactados

### workflow-api

| Arquivo | Ação | Descrição |
|---|---|---|
| `prisma/schema.prisma` | Modificar | Modelos `DriveFolder` e `DriveFile` + relações em `User`/`Company` |
| `prisma/migrations/20260811120000_drive_files/migration.sql` | Criar | À mão, aditiva, idempotente |
| `src/drive/drive-storage.service.ts` | Criar | Molde `OcrStorageService`: bucket `DRIVE_BUCKET ?? 'drive-files'`, `ensureBucket` privado, `upload`, `remove`, `signedUrl`, `signedUrls` (batch) |
| `src/drive/drive.service.ts` | Criar | CRUD + `resolveFileAccess`/`resolveFolderAccess` + delete recursivo de pasta |
| `src/drive/drive.controller.ts` | Criar | 8 rotas sob `@Controller('drive')`, Swagger pt-BR |
| `src/drive/drive.module.ts` | Criar | Providers + import de `PrismaModule` |
| `src/drive/drive.constants.ts` | Criar | `DRIVE_MAX_FILE_BYTES` (env, default 25 MB), TTLs (300/3600), pageSize |
| `src/drive/dto/*.dto.ts` | Criar | create/update de file e folder, query de listagem |
| `src/common/upload-rules.ts` | Modificar | Extrair `assertUploadAllowed({ maxBytes, allowMarkdown })`; `assertAttachmentAllowed` vira wrapper sem mudança de comportamento |
| `src/app.module.ts` | Modificar | Registrar `DriveModule` |
| `.env.example` | Modificar | `DRIVE_BUCKET`, `DRIVE_MAX_FILE_BYTES` documentadas |

### work-flow

| Arquivo | Ação | Descrição |
|---|---|---|
| `src/service/drive/drive-service.ts` | Criar | Objeto literal tipado; upload multipart com `onUploadProgress`; `fileUrl(id)` |
| `src/features/drive/DriveView.vue` | Criar | Toolbar (busca, toggle grade/lista, upload, nova pasta) + conteúdo |
| `src/features/drive/components/DriveSidebar.vue` | Criar | Escopos Pessoal/Empresa com contadores + árvore de pastas (molde `QrSidebar` + `NoteFolderTree`) |
| `src/features/drive/components/FileGrid.vue` / `FileListRows.vue` | Criar | Grade e lista (molde `TaskAttachments` modos de exibição) |
| `src/features/drive/components/UploadDropzone.vue` | Criar | Dropzone + fila com progresso por item (extraído do padrão `TaskAttachments`) |
| `src/features/drive/components/FolderDialog.vue` / `MoveDialog.vue` | Criar | Via `AppDialog` |
| `src/features/drive/composables/useDriveFiles.ts` / `useDriveFolders.ts` | Criar | Vue Query, keys prefixadas por companyId (molde `useQrFolders`) |
| `src/features/drive/types.ts` | Criar | `DriveFile`, `DriveFolder`, `DriveScope` |
| `src/components/ui/FileViewer.vue` | Criar (promover) | `AttachmentViewer` generalizado: aceita resolvedor assíncrono de URL |
| `src/features/tasks/components/AttachmentViewer.vue` | Remover | Substituído pelo `FileViewer`; imports atualizados |
| `src/features/tasks/components/TaskAttachments.vue`, `TaskDetailPanel.vue`, `TaskDetailsView.vue` | Modificar | Trocar import do viewer (5 pontos) |
| `src/router/index.ts` | Modificar | Rota `/drive`, lazy |
| `src/core/components/shells/shared/NavList.vue` | Modificar | Item Drive em `mainItems` |
| `src/core/components/shells/FocusShell.vue` / `CanvasShell.vue` | Modificar | `railItems` / `tabs` + `dockItems` |
| `src/components/CommandPalette.vue` | Modificar | Entrada Drive |
| `src/CLAUDE.md` | Modificar | Tabela de features |

---

## Tasks Técnicas

- [x] **T1** - Schema: `DriveFolder` + `DriveFile` no `schema.prisma` +
  migration `20260811120000_drive_files` à mão (com SQL de compensação escrito
  junto, em comentário no rodapé)
- [x] **T2** - `drive-storage.service.ts` (bucket privado, paths canônicos,
  signed single/batch) *(independente de T1)*
- [x] **T3** - Generalizar `upload-rules.ts` (`assertUploadAllowed`) mantendo
  `assertAttachmentAllowed` como wrapper
- [x] **T4** - `drive.service.ts`: resolvers de acesso + CRUD de pasta (com
  validação de ciclo) + CRUD de arquivo + delete recursivo *(depende de T1-T3)*
- [x] **T5** - `drive.controller.ts` + DTOs + module + registro no
  `app.module.ts` + `.env.example` *(depende de T4)*
- [x] **T6** - Testes unitários dos resolvers, do `assertUploadAllowed` e do
  ciclo de pasta *(depende de T4)* - 25 testes passando
- [x] **T7a** - Migration `20260811120000_drive_files`: **já aplicada em
  produção** (verificado: `DriveFile` e `DriveFolder` existem). Storage
  verificado contra o Supabase real com `scripts/drive-storage-smoke.mjs`:
  bucket privado, signed URL serve com content-type correto, URL pública
  responde 400, batch de assinaturas ok (AC14 e AC15 atendidos de verdade)
- [ ] **T7b** - Aplicar `20260811150000_drive_share_links` em produção:
  `node scripts/run-prod-migration.mjs 20260811150000_drive_share_links`
  *(gate humano; bloqueado pelo classificador de segurança nesta sessão)*
- [ ] **T7c** - Smoke test dos endpoints com dois usuários/duas empresas após
  o deploy da API *(depende de T7b)*
- [x] **T8** - Front: `drive-service.ts` + `types.ts` + composables com query
  keys por empresa *(depende de T5)*
- [x] **T9** - Front: promover `AttachmentViewer` → `components/ui/FileViewer.vue`
  com resolvedor assíncrono de URL; atualizar os pontos de uso (o único import
  direto era `TaskAttachments.vue`); `attachment-kind.ts` virou
  `src/utils/file-kind.ts` e o `markdown-doc.css` subiu para `src/styles/`
  (fronteira components/ui → features zerada) *(independente de T8)*
- [x] **T10** - Front: `DriveView` + sidebar + grade/lista + empty/skeleton +
  toggle persistido *(depende de T8)*
- [x] **T11** - Front: `UploadDropzone` com fila e progresso por item
  *(depende de T8)*
- [x] **T12** - Front: diálogos (nova pasta, mover, confirmar exclusão com
  contagem) + renomear inline *(depende de T10)*
- [x] **T13** - Navegação: rota + NavList + FocusShell + CanvasShell +
  CommandPalette + `src/CLAUDE.md` *(depende de T10)*
- [x] **T14** - Verificação: typecheck e lint limpos nos dois repos,
  `/code-review` no diff (fixes aplicados, ver Change Log), tela exercitada
  nos dois escopos via Edge headless + mock de API (screenshots) *(depende de
  tudo; o e2e real contra produção fica com o T7)*

---

## Considerações de Arquitetura

- **Decisão:** bucket novo `drive-files`, separado do `workflow-attachments`.
  **Motivo:** o bucket atual é público e o Supabase não permite virar privado
  sem quebrar as URLs persistidas dos anexos; separar deixa a Decisão 13
  (migração do acervo) para uma spec própria sem bloquear o Drive.
  **Alternativa rejeitada:** reusar `workflow-attachments` (herdaria o acesso
  público) ou migrar tudo agora (escopo explode).
- **Decisão:** storage service próprio do módulo (`drive-storage.service.ts`)
  em vez de estender `SupabaseService`.
  **Motivo:** mesmo racional documentado em `ocr-storage.service.ts:9-27`; o
  serviço público retorna `getPublicUrl` por contrato e tem delete silencioso.
  **Alternativa rejeitada:** um "StorageService v2" compartilhado agora; vira
  refactor transversal, é trabalho da spec da Decisão 13.
- **Decisão (v0.3, revisada pelo Nicolas na revisão de produto):** sidebar
  mostra Pessoal + **TODAS as empresas do usuário**, modelo QR. Clicar numa
  empresa mostra os arquivos dela SEM alterar a empresa ativa do topo; a
  empresa alvo vai explícita na query (`companyId`) e o guard valida
  membership de qualquer fonte.
  **Motivo:** exigir troca de empresa ativa pra ver arquivos é fricção sem
  ganho; o vínculo já existe no dado e o interceptor do axios respeita header
  explícito por request.
  **Alternativa rejeitada:** a decisão original (só empresa ativa), descartada
  por gap de UX apontado na revisão; `GET /drive/folders` devolve todas as
  pastas visíveis numa resposta e os contadores por empresa saem de um
  `groupBy` único.
- **Decisão:** mover arquivo nunca troca escopo (pessoal ↔ empresa) na P1.
  **Motivo:** trocar escopo é mudança de dono e de path no storage (copy +
  delete) com semântica de permissão nova; é feature de P2/P3.
- **Decisão (v0.4):** link público em tabela própria (`DriveShareLink`), e não
  `ShareResourceType` ganhando `FILE`.
  **Motivo:** `ShareLink.companyId` é NOT NULL (board e roadmap sempre têm
  empresa) e arquivo pessoal não tem empresa nenhuma — justamente o caso mais
  comum de compartilhar. Usar a tabela existente exigiria relaxar uma coluna
  usada por board, roadmap e notas em produção. A tabela nova também carrega
  `downloadCount`/`lastAccessAt`, que não fazem sentido nos outros tipos.
  **Alternativa rejeitada:** `ALTER TABLE "ShareLink" ALTER COLUMN "companyId"
  DROP NOT NULL` (mexe em tabela de três features vivas) ou forçar o
  `companyId` da empresa ativa em arquivo pessoal (mentira no dado: o arquivo
  não pertence àquela empresa).
- **Decisão (v0.4):** capas derivadas no NAVEGADOR, não no servidor.
  **Motivo:** thumbnail server-side exige ffmpeg e renderizador de PDF no
  container; o Railway já é frágil no deploy e o custo por upload viraria CPU
  de render. No cliente, o custo é de quem está olhando a pasta, e existe
  fallback desenhado (capa tipográfica) para todo caso que falhar.
  **Alternativa rejeitada:** worker de thumbnail no backend (registrado como
  fora de escopo no épico; vale reconsiderar se o acervo crescer muito).
- **Decisão:** delete de pasta é recursivo com confirmação (contagem de itens
  no `ConfirmDialog` em modo danger), sem senha.
  **Motivo:** fricção proporcional; senha (padrão QR) protege recurso com
  superfície pública, que não é o caso aqui.

---

## Plano de Rollout

- [ ] 1. Migration aplicada à mão em produção (T7) - aditiva, não afeta nada
  existente.
- [ ] 2. Deploy da API (deploy por push derruba o container: aplicar migration
  **antes**, e fora de pico). Bucket é criado on-demand pelo `ensureBucket`.
- [ ] 3. Smoke test dos endpoints em produção (script/curl com dois usuários).
- [ ] 4. Deploy do front. Feature entra visível direto (sem flag): módulo novo,
  isolado, sem caminho de código compartilhado com fluxos críticos.

## Plano de Rollback

- Front: revert do commit + redeploy (nav some, rota some).
- API: revert do commit + redeploy (rotas somem; tabelas ficam, inertes).
- Migration: **não reverter por padrão** (tabelas novas não afetam o resto).
  Se necessário limpar: SQL de compensação escrito na T1
  (`DROP TABLE IF EXISTS "DriveFile"; DROP TABLE IF EXISTS "DriveFolder";`)
  + remoção manual dos objetos `drive/*` no bucket.

---

## Observabilidade

- **Log:** Nest Logger com requestId (já global): upload
  (`userId, companyId|personal, size, mimeType, storagePath`), delete
  (idem + resultado da remoção no storage), falha de storage em qualquer
  operação (`storagePath` + erro). Nunca logar nome de arquivo em nível info
  (pode conter dado pessoal); nome só em debug.
- **Métrica / alerta:** não aplicável (repo sem infra de métricas/alertas).

---

## Definition of Done

- [ ] Todos os acceptance criteria (AC1-AC21) atendidos e verificados um a um
- [ ] Testes da Estratégia implementados e passando (unitários API) +
  integração manual transcrita + regressão dos anexos de tarefa
- [ ] `npx tsc --noEmit` limpo nos dois repos; lint sem erros novos
- [ ] `/code-review` rodado e findings de correção resolvidos
- [ ] Fluxo exercitado de ponta a ponta (upload → preview → download →
  renomear → mover → excluir, nos dois escopos) com screenshots
- [ ] Migration aplicada e verificada em produção antes do deploy da API
- [ ] Sem breaking change não documentada
- [ ] Logs conforme seção Observabilidade
- [ ] Spec com status `Concluído` + data + Change Log; `/spec-sync` rodado

## Perguntas em Aberto

- [ ] Quota de storage por empresa (e exibição de uso) - responsável: Nicolas,
  decidir até a P3.
- [ ] Limpeza de arquivos pessoais órfãos se um dia existir deleção de usuário -
  registrado no risco Baixo; sem prazo.

## v0.4 - Capas ricas, redesign e link público

Rodada de produto pedida na revisão ("está em 5%"). Três frentes:

**1. Capas de verdade, derivadas no navegador**
(`features/drive/composables/useFileCover.ts` + `components/FileCover.vue`)

| Tipo | Capa |
|---|---|
| imagem | URL assinada da listagem |
| PDF | primeira página rasterizada com pdf.js (chunk lazy de 415 KB) |
| vídeo | frame extraído a 10% da duração com `<video>` + `<canvas>` |
| texto/md/código | primeiras linhas do arquivo (fetch com `Range`) |
| demais | capa tipográfica: extensão grande + cor da família (`file-palette.ts`) |

Guardas contra virar peso morto: só deriva quando o card entra na viewport
(`useElementVisibility`), cache de módulo por `fileId`, no máximo 2
rasterizações simultâneas, e o backend só assina URL para derivar capa de
arquivo abaixo de 12 MB (`needsCoverSource`). Falha cai na capa tipográfica,
que é estado desenhado, não erro.

**2. Redesign**: card de 232px com capa de 150px (era 180/116 com ícone de
30px), nome em duas linhas, duas ações visíveis + menu reka-ui com seis itens
rotulados (eram cinco ícones de 26px sem rótulo), painel de detalhes lateral,
ordenação (recentes/nome/tamanho, com `id` como desempate para a paginação não
embaralhar), vídeo e áudio tocando dentro do viewer.

**3. Link público** (`DriveShareLink`, migration `20260811150000`): quem pode
gerenciar o arquivo gera link revogável, com validade opcional e contador de
downloads. A rota pública resolve token, gera URL assinada de 60s e
redireciona; a URL assinada nunca é persistida, então revogar corta o acesso de
fato. Página `/f/:token` sem shell, com nome/tipo/tamanho antes do botão e
mensagens distintas para inexistente, revogado e expirado.

### Correções da rodada de review da v0.4

O review adversarial achou 12 defeitos reais na primeira versão da v0.4. Os que
valem registro porque a causa não é óbvia:

1. **Capa sumia para sempre.** Todos os derivadores rejeitam ao serem
   abortados, e o `catch` gravava `{kind:'none'}` no cache de módulo sem
   distinguir abort de falha. Trocar de pasta durante uma rasterização marcava
   aqueles PDFs como "sem capa" pelo resto da sessão. Agora `signal.aborted`
   sai do `catch` sem cachear.
2. **Um webm de gravação de tela travava TODAS as capas.** `MediaRecorder`
   reporta `duration = Infinity`, e atribuir isso a `currentTime` lança
   `TypeError` dentro do handler: a Promise nunca resolvia e o slot de render
   ficava preso. Dois desses esgotavam os 2 slots e nenhuma capa renderizava
   mais. Corrigido com `Number.isFinite` e timeout de 15s.
3. **Menu saltava para o canto da tela no modo lista.** O dropdown do reka é
   modal e zera `pointer-events` do body; a linha perdia `:hover`, a barra com
   `display:none` saía do layout e o floating-ui reancorava sobre um retângulo
   0x0. Agora a barra usa `opacity` e se mantém visível via
   `:has([data-state='open'])`.
4. **`.ts` abria player de vídeo.** O Windows rotula TypeScript como
   `video/mp2t`; `kindOf` confiava no mimetype. Agora, quando as duas fontes
   discordam sobre mídia, a extensão vence. Verificado no browser: badge "TS",
   sem player.
5. **Lista rasterizava PDF a 480px para um quadrado de 32px.** `FileCover`
   ganhou `mode="thumb"`, que só usa a imagem já assinada.
6. **Vídeo cortava aos 5 minutos.** A URL assinada de `fileUrl` alimenta o
   `<video>`; os range requests seguintes voltavam 403 e o player travava mudo.
   TTL passou para 1h.
7. Race no `ShareFileDialog` que podia exibir (e copiar) o link de outro
   arquivo; trigger do menu virou `<button>` (era `<span>`, inalcançável por
   teclado); "Renomear" da lista agora foca o campo em vez de abrir Detalhes;
   `encodeURIComponent` no token da página pública; cache de capas com teto de
   150 entradas.

### Rodada de acabamento (revisão visual do Nicolas)

1. **Dois `<select>` nativos** eram os únicos do projeto inteiro (toolbar de
   ordenação e validade do link). Trocados por `AppSelect` (reka-ui). O trigger
   dele é `width: 100%` e a classe não chega na raiz headless, então o de
   ordenação vai dentro de um wrapper de largura fixa — sem isso ele estica e
   quebra a toolbar em três linhas.
2. **`ShareFileDialog` sem padding.** O `AppDialog` é casca pura (conteúdo 100%
   slot), então o respiro é de quem preenche; o conteúdo encostava na borda.
   Ganhou o mesmo cabeçalho (ícone + título + X, com divisor) e `padding: 16px`
   dos outros diálogos do Drive.
3. **Visualizar mandava baixar.** JSON, SQL, CSV, txt e código caíam no cartão
   de download: o visualizador não visualizava. Agora o `FileViewer` lê o
   conteúdo e mostra com realce (highlight.js, o mesmo do navegador de
   repositórios), e JSON passa por `parse` + `stringify` indentado antes —
   resposta de API vem numa linha só, e uma linha de 40 mil caracteres não é
   leitura. Teto de 2 MB.
4. **Quatro ícones de 12px por pasta na sidebar** viraram um `FolderActionsMenu`
   (mesmo padrão do menu de arquivo), com o mesmo cuidado de `opacity` em vez
   de `display:none` para não desancorar o menu portalado.

## Follow-ups (do code-review, fora do escopo da P1)

- Contadores da sidebar rodam 2 COUNTs globais por listagem; com acervo grande,
  mover para cálculo só na página 1 ou endpoint próprio com cache.
- Limite de upload no cliente é espelho do default do servidor
  (`DRIVE_MAX_FILE_BYTES_CLIENT`); se a env de produção mudar, expor o limite
  efetivo num endpoint de config.
- `UploadDropzone` é genérico (recebe `uploader`); na P2, promover para
  `components/ui` e fazer `TaskAttachments` delegar a fila para ele (mesmo
  movimento feito com o `FileViewer`).
- `DriveStorageService` duplica o molde do `OcrStorageService` por decisão
  registrada (Considerações de Arquitetura); um storage-base compartilhado é
  trabalho da spec da Decisão 13.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-11 | 0.1 | Criação (research consolidado dos dois repos) | Nicolas (via spec-driven) |
| 2026-08-11 | 0.2 | Implementação da P1 (tudo menos T7). Ajustes pós-review: upload em escrita única (storage antes do banco, id gerado na aplicação; elimina a janela de linha com `storagePath` vazio), campo `sha256` removido (hash síncrono de até 25 MB sem consumidor), `requireScope` unifica a validação de membership das listagens, dropzone emite invalidação por lote, viewer referencia arquivo por id, sync bidirecional da URL, `refDebounced` na busca, fronteira `components/ui` → `features` zerada (`file-kind.ts` + `markdown-doc.css` promovidos) | Claude (via spec-driven) |
| 2026-08-11 | 0.4.1 | Acabamento após revisão visual: `<select>` nativos trocados por `AppSelect`, `ShareFileDialog` com cabeçalho e padding do padrão, visualizador de texto/código/JSON com realce (o que caía em "baixar" agora abre), menu único nas pastas da sidebar | Claude (via spec-driven) |
| 2026-08-11 | 0.4 | Capas ricas por tipo (pdf.js, frame de vídeo, snippet, capa tipográfica), redesign do card e do menu de ações, painel de detalhes, ordenação, vídeo/áudio no viewer, e link público de download (`DriveShareLink` + migration `20260811150000` + rota `/f/:token`). Verificado contra o Supabase real: bucket privado, signed URL 200, URL pública 400. Decisão divergente do plano: tabela própria em vez de `ShareLink` ganhando `FILE`, porque `ShareLink.companyId` é NOT NULL e arquivo pessoal não tem empresa | Claude (via spec-driven) |
| 2026-08-11 | 0.3 | Sidebar multi-empresa (modelo QR), decisão revisada pelo Nicolas: `GET /drive/folders` devolve todas as pastas visíveis, `GET /drive/files` aceita `companyId` explícito com counts por empresa (`groupBy` único), seleção local em `?scope=personal\|<companyId>` sem tocar na empresa ativa, permissões por role NA empresa selecionada. AC2/AC16/AC20 atualizados; 28 testes na API (3 novos de multi-empresa) | Claude (via spec-driven) |
