# Ala Marketing M1: aprovação, calendário, links e painel

**Status:** Implementado no harness (sem commit). Junção e auditoria em 06/11/2026; produção pendente da migration `20261106120000_ala_marketing`.
**Épico:** [ala-marketing.md](../../../../epicos/ala-marketing.md) · **Fundação:** [00-fundacao.md](./00-fundacao.md) (leia as "Regras para quem implementa uma fase")
**Criado em:** 2026-11-06

## Objetivo

Arte, vídeo e texto saem do WhatsApp: o Editor sobe a versão, o Admin aprova ou pede ajuste (pelo celular também), todo mundo vê o calendário editorial, e os links de trabalho com senha ficam num lugar só.

## Divisão

- **M1-A, Aprovação:** cards, versões, arquivos do card, aprovar e pedir ajuste, comentários presos na arte e no vídeo, checklist de ajustes, board e lista, página do card (é também a tela de aprovar no celular), diálogo de criar card.
- **M1-B, Calendário, Links e Painel:** calendário editorial (mês, semana, lista, arrastar muda a data, clicar no dia cria), Links de trabalho (cofre), Painel inicial da ala e o aviso diário de prazo.

Os dois mexem no MESMO worktree. Não editem arquivos da outra metade; quando precisar de algo da outra, use a API do contrato abaixo (está fechada) e leia o banco pelo Prisma.

---

## M1-A: Aprovação

### Fluxo
1. Card nasce em Ideia ou Em produção (`MarketingCardFactory`).
2. Editor sobe arquivos (ficam "soltos" no card: `cardId` preenchido, `versionId` nulo, só quem subiu e Admin veem) e fecha uma **versão** (V1, V2...) com os arquivos em ordem e uma nota. Versão pode não ter arquivo se o card tem legenda (post só de texto).
3. "Enviar para aprovação" = mover para `AWAITING_APPROVAL` (exige versão atual com conteúdo ou legenda). Avisa ADMIN+ que enxergam a marca.
4. Admin **Aprova** (grava `approvedVersionId = currentVersionId`) ou **Pede ajuste** (comentário obrigatório; cada linha vira item de checklist `ADJUSTMENT`). Avisa responsável e criador.
5. Versão nova em card com ajuste pedido (ou já aprovado/agendado) volta para `AWAITING_APPROVAL` e derruba a aprovação (`statusAfterNewVersion`). Avisa os Admins.
6. Aprovado → Agendado (exige data) → Publicado. Peça impressa segue a trilha da gráfica (a tela da Gráfica é da M2; aqui o board mostra a trilha quando o filtro é "Gráfica").

Toda regra de status vem de `core/marketing-status.ts`. Não reimplemente.

### API (`workflow-api/src/marketing/cards/`, prefixo `/marketing/g/:groupId`)

| Rota | Papel | Corpo / resposta |
|---|---|---|
| `GET /cards` | VIEWER | Filtros: `status`, `kind`, `track` (`digital`/`print`), `companyId`, `assigneeId`, `network`, `q`, `overdue=1`, `campaignId`, `archived=1`. Resumo: `id, companyId, kind, title, status, networks, dueAt, publishAt, assignee {id,name}, currentVersion {id,number}, cover {url, previewUrl, mimeType} \| null, commentsCount, openAdjustments, approvalValid, position, updatedAt` |
| `POST /cards` | EDITOR | `CreateCardInput` da fábrica |
| `GET /cards/:cardId` | VIEWER | Tudo do card + `versions[]` (com `assets[]` e URLs, `createdBy`), `stagedAssets[]` (só os seus, ou todos para Admin), `checklist[]`, `approvedBy`, `campaign`, `me: { canEdit, canApprove, canDelete, allowedMoves[] }` |
| `PATCH /cards/:cardId` | EDITOR | `title, briefing, networks, captions {REDE: texto}, hashtags, dueAt, publishAt, assigneeId, campaignId, printSpecs`. Marca não muda. Tipo só muda antes de Aprovado e sem trocar de trilha depois de aprovado |
| `POST /cards/:cardId/move` | EDITOR | `{ status, position? }`. `checkMove`; motivo da recusa em 400. Reabrir (ADMIN) limpa a aprovação. Publicado grava `publishedAt` |
| `POST /cards/:cardId/assets` | EDITOR | `{ name, mimeType, size, sha256 }` → ticket de upload (`files.requestUpload`, dono `{ cardId }`) |
| `DELETE /cards/:cardId/assets/:assetId` | EDITOR | Só arquivo solto (sem versão), de quem subiu ou Admin |
| `POST /cards/:cardId/versions` | EDITOR | `{ assetIds: string[] (ordem), note? }`. Arquivos READY, soltos, do card. Cria V(n+1), vira atual, aplica `statusAfterNewVersion` (finalizado: 409 com a frase) |
| `POST /cards/:cardId/approve` | ADMIN | `{ comment? }` → `checkReview`; comentário `APPROVED` |
| `POST /cards/:cardId/request-changes` | ADMIN | `{ body (obrigatório), items?: string[] }` → comentário `CHANGES_REQUESTED`, itens `ADJUSTMENT`, status `CHANGES_REQUESTED`, aprovação limpa |
| `GET /cards/:cardId/comments` | VIEWER | `?versionId=`. Com `author {id,name}` |
| `POST /cards/:cardId/comments` | EDITOR | `{ body, mentions[], versionId?, assetId?, anchorX?, anchorY? (0 a 1), anchorTime? (s) }`. Menção só de membro que vê a marca (aviso `MENTIONED`) |
| `PATCH /cards/:cardId/comments/:commentId` | autor | `{ body }` |
| `DELETE /cards/:cardId/comments/:commentId` | autor ou ADMIN | |
| `POST /cards/:cardId/comments/:commentId/resolve` | EDITOR | `{ resolved: boolean }` |
| `POST /cards/:cardId/checklist` | EDITOR | `{ text, kind? }` |
| `PATCH /cards/:cardId/checklist/:itemId` | EDITOR | `{ done?, text? }` (grava quem e quando marcou) |
| `DELETE /cards/:cardId/checklist/:itemId` | ADMIN ou quem criou | |
| `POST /cards/:cardId/archive` | EDITOR | `{ archived: boolean }` |
| `DELETE /cards/:cardId` | `canDelete(createdById)` | Apaga os arquivos do storage antes (`files.remove`) |

Avisos (`notify.kind`): `APPROVAL_REQUESTED`, `APPROVED`, `CHANGES_REQUESTED`, `NEW_VERSION`, `MENTIONED`, `CARD_ASSIGNED` (atribuir responsável no PATCH também avisa). Link sempre `/marketing/cards/<id>`.

### Front (`work-flow/src/features/marketing/approvals/`, `service/marketing/marketing-cards.ts`)

- **`views/MarketingApprovalsView.vue`:** toolbar (Board | Lista, Digital | Gráfica, filtros de status, tipo, rede, responsável, "Atrasados", busca, "Novo card"). Filtros na URL. **Board:** colunas de `statusesFor`, card compacto (capa pequena, marca, tipo, título, prazo em vermelho se vencido com `.mk-late`, avatar do responsável, contadores de comentário e ajustes), arrastar entre colunas chama `/move` e, se recusado, volta e mostra o motivo. No celular (<= 640px): uma coluna por vez com abas e "Mover para" segurando o card (siga o desenho do board de tarefas: `features/board/components/BoardColumnTabs.vue`, `TaskMoveSheet.vue`, `composables/useCardLongPress.ts`). **Lista:** tabela densa (`.mk-table`) ordenável por prazo e publicação.
- **`views/MarketingCardView.vue` (`/marketing/cards/:cardId`):** esquerda o visualizador da versão (imagem com pinos dos comentários, clicar na imagem cria comentário no ponto; vídeo com marcas na linha do tempo e "comentar neste minuto"; carrossel com miniaturas; PDF e outros abrem no `components/ui/FileViewer.vue`; prévia RGB quando `hasPreview`, com o aviso "Prévia aproximada em RGB; o original em CMYK segue intacto"). Abas V1, V2, V3 e **Comparar** (duas versões lado a lado). Direita: status, marca, tipo, redes, legenda por rede, hashtags, datas, responsável, checklist, comentários (clicar destaca o pino ou pula o vídeo), histórico. Barra de ação: Admin em Aguardando vê **Aprovar** e **Pedir ajuste** (diálogo com comentário obrigatório e linhas do checklist, já preenchidas com os comentários com ponto ainda abertos da versão); Editor vê **Enviar para aprovação** e **Subir nova versão** (diálogo: soltar arquivos, ordenar, nota, progresso por arquivo). **Celular:** mesma página, visualizador em cima na largura toda, barra de ação fixa embaixo (44px, soma `--shell-bottom-inset`), comentários abaixo; tocar na imagem pede confirmação antes de criar o pino.
- **`approvals/components/MarketingCardCreateDialog.vue`:** marca (se mais de uma), tipo, título, redes, prazo, publicação, responsável. Exportado para a M1-B poder usar no futuro (a M1-B NÃO depende dele agora).
- Pessoas: `PersonAvatar` com `id` e `name` (o freelancer não está no diretório de pessoas: as iniciais bastam).

### Critérios de aceite (M1-A)
- [ ] A1. Marcel (EDITOR) cria card, sobe 2 imagens, fecha a V1 e envia para aprovação; Letícia (ADMIN) recebe aviso no sino.
- [ ] A2. Letícia pede ajuste sem comentário: 400 com a frase. Com comentário e 2 linhas: card em Ajustes pedidos, 2 itens no checklist, Marcel avisado.
- [ ] A3. Marcel marca os itens, sobe a V2: card volta para Aguardando sozinho, Letícia avisada; V1 e V2 abrem lado a lado.
- [ ] A4. Comentário no ponto da imagem (x, y entre 0 e 1) e no segundo 7 de um vídeo; o pino aparece no lugar e o clique no comentário pula o vídeo.
- [ ] A5. Letícia aprova pelo celular (375px), na página do card, sem rolagem lateral.
- [ ] A6. Marcel tenta aprovar: 403. Arrastar para Aprovado: 400 com o motivo. Diretoria (VIEWER) tenta comentar, mover ou subir: 403; a tela não mostra os botões.
- [ ] A7. Freelancer não lista nem abre card da Emmitec (404) e não vê o board da empresa (moldura só da ala).
- [ ] A8. Prazo vencido aparece em vermelho no board e na lista.
- [ ] A9. Apagar card apaga os objetos no storage (o fake-storage não tem mais o arquivo).
- [ ] A10. Imagem CMYK (gere com `sharp(...).toColourspace('cmyk').jpeg()`) ganha prévia RGB e o download devolve o original com o mesmo sha256.

---

## M1-B: Calendário, Links e Painel

### API

**Calendário (`workflow-api/src/marketing/calendar/`):**

| Rota | Papel | O quê |
|---|---|---|
| `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&companyId=` | VIEWER | Cards com `publishAt` no intervalo (máximo 100 dias; fuso de exibição `America/Sao_Paulo`): `id, companyId, kind, title, status, publishAt, dueAt, networks, approvalValid`. Mais `undated`: quantos cards abertos estão sem data de publicação |
| `PATCH /calendar/cards/:cardId` | EDITOR | `{ publishAt }` (ISO). Publicado não muda de data (400). Registra `rescheduled` |
| `POST /calendar/cards` | EDITOR | `{ companyId, title, kind?, publishAt, networks? }` pela `MarketingCardFactory` |

**Links de trabalho (`workflow-api/src/marketing/links/`):**

| Rota | Papel | O quê |
|---|---|---|
| `GET /links?category=&companyId=&q=` | VIEWER | NUNCA devolve a senha: `hasSecret`, `username`, `isFavorite` (da pessoa), `createdBy` |
| `POST /links` | EDITOR | `{ title, url (só http/https), category, companyId?, username?, secret?, notes? }`. Senha cifrada com o `CryptoService` |
| `PATCH /links/:linkId` | EDITOR | `secret`: texto troca, `null` apaga, ausente mantém |
| `DELETE /links/:linkId` | `canDelete` | |
| `POST /links/:linkId/reveal` | `canRevealSecrets` (senão 403) | `{ secret }` e registro `revealed` ("revelou a senha de ...") |
| `POST /links/:linkId/favorite` | VIEWER | `{ favorite }` (é da pessoa) |

**Painel (`workflow-api/src/marketing/home/`):** `GET /home` (VIEWER): `awaitingApproval` (ADMIN+: tudo das marcas visíveis; os outros: os seus), `changesRequested` (do responsável), `overdue` (prazo vencido e ainda antes de Aprovado), `dueSoon` (próximos 3 dias), `week` (publicações de segunda a domingo da semana atual), `countsByStatus`, `recent` (20 do histórico).

**Aviso de prazo (cron em `home/` ou `calendar/`):** todo dia às 8h de Brasília. Prazo amanhã e ainda antes de Aprovado: avisa o responsável (`DEADLINE_TOMORROW`). Publicação amanhã sem estar Agendado: avisa responsável e Admins (`PUBLISH_TOMORROW`). Um aviso por card por dia (confira no `MarketingLog`, verbo `deadline_warned`). Sem contexto de requisição: monte um contexto de sistema (`userId: 'system'`).

### Front

- **`views/MarketingCalendarView.vue` + `features/marketing/calendar/`:** Mês (grade com o título no dia, ponto da marca, tipo, cor do status, "+N"), Semana (7 colunas pela hora) e Lista (agenda por dia). ← → Hoje e teclado. Arrastar um card para outro dia muda a data e mantém a hora (otimista, desfaz se a API recusar). Clicar no dia vazio abre criação rápida (título, marca se houver mais de uma, tipo, hora padrão 10:00). Clicar no item vai para `to`. Filtro por rede. Celular: mês em pontos e a agenda do dia embaixo (como o roadmap no celular, `features/roadmap/components/RoadmapMonthView.vue`). **Fontes:** `calendar/calendar-sources.ts` exporta `MARKETING_CALENDAR_SOURCES: MarketingCalendarSource[]` só com a fonte de cards (contrato em `features/marketing/marketing-calendar.ts`); campanhas (M2) e ativações (M3) entram na junção e PRECISAM aparecer sem mudar o resto: desenhe itens de vários dias (`end`) como faixa e trate `draggable: false`.
- **`views/MarketingLinksView.vue` + `features/marketing/links/`:** lista por categoria (categorias de `settings.linkCategories`), favoritos no topo, busca; copiar link e usuário; "Revelar" mostra a senha com botão copiar e esconde sozinha em 30 s; criar e editar em `AppDialog`; apagar com `ConfirmDialog`. VIEWER não vê Revelar quando não pode.
- **`views/MarketingHomeView.vue` + `features/marketing/home/`:** painel denso: Para aprovar (Admin), Ajustes pedidos para você, Atrasados, Esta semana (faixa de 7 dias), Atividade recente. Cada linha leva ao card. Estados vazios úteis (nada para aprovar = frase curta, sem ilustração grande).

### Critérios de aceite (M1-B)
- [ ] B1. Mês, Semana e Lista mostram os cards do seed na data certa (fuso de Brasília), com marca e status.
- [ ] B2. Arrastar um card para outro dia persiste (`publishAt` no banco, mesma hora) e Publicado não arrasta.
- [ ] B3. Clicar no dia vazio cria o card naquela data (aparece no calendário e no banco).
- [ ] B4. Freelancer só vê PetJourney no calendário e nos links; Diretoria vê e não cria.
- [ ] B5. A listagem de links nunca tem a senha (confira o JSON); revelar como Admin devolve a senha e registra no histórico; Diretoria (VIEWER) leva 403 no revelar.
- [ ] B6. Painel mostra Para aprovar para a Letícia e Ajustes pedidos para o Marcel (crie os estados pela API no E2E).
- [ ] B7. O aviso de prazo roda (chame o método do cron direto no teste) e não duplica no mesmo dia.
- [ ] B8. 375px sem rolagem lateral nas três telas.

---

## Ambiente de cada agente

| | Worktree | Banco | API | Vite |
|---|---|---|---|---|
| M1-A | `C:\TRABALHO\workflow\wt\m1` | `wf_m1a` | 3611 | 5181 |
| M1-B | `C:\TRABALHO\workflow\wt\m1` | `wf_m1b` | 3612 | 5182 |

Postgres embutido (55432) e fake-storage (54329) já estão no ar e são de todos: não suba outro, não pare.

```bash
cd C:/TRABALHO/workflow/wt/m1/work-flow/scripts/harness
bash marketing-db.sh wf_m1a ../../../workflow-api        # banco do zero + seed (repita quando quiser)
(cd ../../../workflow-api && npx nest build)             # depois de mexer na API
HARNESS_FRONT_URL=http://localhost:5181 bash api-run.sh ../../../workflow-api 3611 wf_m1a   # em segundo plano
(cd ../.. && VITE_API_URL=http://127.0.0.1:3611 VITE_CACHE_DIR=node_modules/.vite-m1a npx vite --port 5181 --strictPort)  # em segundo plano
```

O seed da ala sai em `seed-marketing-out.<banco>.json` (ids do grupo, pessoas e marcas). Para o E2E: `API=http://127.0.0.1:3611 WEB=http://localhost:5181 HARNESS_SEED=seed-marketing-out.wf_m1a.json`.

## Change Log

| Data | Versão | Mudança |
|---|---|---|
| 2026-11-06 | 0.1 | Spec da M1 com contrato de API e divisão em dois agentes |
| 2026-11-06 | 1.0 | M1-A (71 checagens) e M1-B (195) entregues e juntados. Diferenças: mandar para aprovação exige versão fechada; tipo do card não muda depois de aprovado; legenda, hashtags e redes mudadas depois de aprovado voltam o card para Aguardando (auditoria); a trilha da gráfica só anda pela tela Gráfica (revisão); link do grupo inteiro fica fora para quem é restrito a uma marca; aviso de prazo assinado como sistema |
