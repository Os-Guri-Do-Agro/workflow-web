# Ala Marketing M2: UTMs e QR, Gráfica, Ideias e Campanhas

**Status:** Implementado no harness (sem commit). Junção e auditoria em 06/11/2026; o e-mail das notificações segue como follow-up (SendGrid).
**Épico:** [ala-marketing.md](../../../../epicos/ala-marketing.md) · **Fundação:** [00-fundacao.md](./00-fundacao.md) (leia as "Regras para quem implementa uma fase")
**Criado em:** 2026-11-06

## Objetivo

Saber de onde vem cada clique e cada leitura de QR, levar a peça impressa até a gráfica com o original intacto, guardar ideias e trends, e planejar campanhas com orçamento, período e resultado.

## Divisão

- **M2-A, Rastreio e Gráfica:** gerador de UTM sobre o encurtador, QR ligado à UTM, métricas; tela da Gráfica (peças impressas, especificação, checklist pré-gráfica, trilha da gráfica, baixar o original).
- **M2-B, Estratégia:** Ideias e trends (mural, curtir, "Transformar em post") e Campanhas (orçamento, período, público, artes e UTMs ligadas, resultados, aprendizados, aprovação).

Mesmo worktree, arquivos separados. A M1 (aprovação, página do card, calendário) está sendo feita em OUTRO worktree ao mesmo tempo: aqui as views dela são provisórias. Link para card é `/marketing/cards/<id>` (rota `marketing-card`), que funciona depois da junção.

Fora desta fase: e-mail das notificações (o SendGrid ainda não está configurado em produção; fica como follow-up) e orçamentos (a M3-B faz o `QuotesPanel`; a Gráfica deixa o lugar).

---

## M2-A: UTMs e QR

### Regras
- UTM da ala é um `ShortLink` (base sem UTM + colunas `utm*`, cliques contados no redirect `/l/<code>`) com um `MarketingUtm` ao lado (marca, onde será usado, campanha, card, parceiro, ativação).
- **Listas fixas:** `utm_source` e `utm_medium` precisam estar em `settings.utmSources` / `settings.utmMediums` (ADMIN+ amplia nas Configurações). `utm_campaign`, `utm_content` e `utm_term` são livres. Tudo passa por `normalizeUtmValue` (minúsculo, sem acento, espaço vira hífen) e a tela mostra o valor normalizado antes de salvar.
- **Duplicada:** mesma URL base + mesmas 5 UTMs no grupo devolve 409 com `{ message, existingId }`; o front oferece "abrir a existente" ou "criar mesmo assim" (`force: true`).
- **QR:** um `QrCode` cujo destino é o link curto. Trocar o destino da UTM depois não invalida o QR impresso. Leitura conta no QR e o clique conta no link.
- O freelancer não é membro de empresa: NÃO use `ShortLinkService.create` (ele exige ser membro da empresa). Crie as linhas pelo Prisma reaproveitando o que o módulo `short-link` exporta (geração de código, validação de URL, montagem de `shortUrl`/`finalUrl`); leia `workflow-api/src/short-link/` e `workflow-api/src/qr/` antes. Se precisar de uma função que lá é privada, copie para a sua pasta com um comentário dizendo de onde veio, sem mexer no módulo original.
- Listagem do encurtador da empresa (`/links`) continua vendo esses links (eles têm `companyId` da marca); isso é desejado.

### API (`workflow-api/src/marketing/utm/`, prefixo `/marketing/g/:groupId`)

| Rota | Papel | O quê |
|---|---|---|
| `GET /utm?companyId&campaignId&source&medium&q` | VIEWER | `id, companyId, placement, campaign {id,name}, cardId, partnerId, activationId, shortLink {id, code, shortUrl, targetUrl, finalUrl, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, clickCount, active}, qr {id, code, scanCount, active, style} \| null, createdBy, createdAt` |
| `POST /utm` | EDITOR | `{ companyId, targetUrl, utmSource, utmMedium, utmCampaign, utmContent?, utmTerm?, placement, campaignId?, cardId?, partnerId?, activationId?, label?, force? }` |
| `PATCH /utm/:utmId` | EDITOR | Destino, UTMs, onde será usado, vínculos |
| `POST /utm/:utmId/active` | EDITOR | `{ active }` no link e no QR (desativar é o caminho seguro para peça impressa) |
| `POST /utm/:utmId/qr` | EDITOR | `{ style? }` cria o QR (ou devolve o que já existe) |
| `GET /utm/:utmId/metrics` | VIEWER | Cliques e leituras por dia (últimos 90), totais, principais origens (referer) |
| `GET /utm/options` | VIEWER | Para os selects: campanhas, cards, parceiros e ativações das marcas visíveis (id, nome, marca) e as listas fixas |
| `DELETE /utm/:utmId` | ADMIN | Apaga link, QR e vínculo (a tela avisa que QR impresso para de funcionar) |

### Front (`features/marketing/utm/`, `service/marketing/marketing-utm.ts`, `views/MarketingUtmView.vue`)
- Gerador: URL de destino, marca, source e medium (selects das listas), campanha (texto normalizado ou escolher campanha cadastrada, que preenche o `utm_campaign` com o nome normalizado), content, term, onde será usado, vínculos. Prévia AO VIVO da URL final e do valor normalizado de cada campo. Copiar link curto e URL final.
- Lista densa (`.mk-table`): onde será usado, source/medium/campaign, cliques, leituras, campanha, ativo. Filtros na URL.
- Painel do item: métricas (gráfico de cliques e leituras por dia com `vue-echarts` e o tema `plugins/echarts-theme.ts`, nunca as cores padrão do ECharts), QR com download PNG e SVG (reaproveite o desenho de QR que já existe em `features/qr/`), editar destino com o aviso "o QR impresso continua valendo".

### Critérios de aceite (M2-A, UTM)
- [ ] U1. "Dia dos Pets 2026" vira `dia-dos-pets-2026`; source fora da lista dá 400.
- [ ] U2. Criar a mesma UTM duas vezes dá 409 com o id da existente; `force` cria.
- [ ] U3. Abrir `/l/<code>` conta clique; abrir `/q/<code>` do QR conta leitura e chega na URL final com as UTMs.
- [ ] U4. Trocar o destino mantém o mesmo QR e o mesmo link curto.
- [ ] U5. Freelancer (sem empresa) cria UTM da PetJourney e não vê as da Emmitec; Diretoria vê e não cria.

---

## M2-A: Gráfica (peça impressa)

Peça impressa é o card com `kind = PRINT`. A aprovação é a da M1 (outro worktree); aqui é a trilha DEPOIS: especificação, pré-gráfica, envio, prova e entrega, e o original.

### API (`workflow-api/src/marketing/print/`)

| Rota | Papel | O quê |
|---|---|---|
| `GET /print/cards?status&companyId` | VIEWER | Cards PRINT com `printSpecs`, progresso do pré-gráfica, `approvalValid`, arquivos da versão atual (`name, size, mimeType, colorSpace, hasPreview, sha256, url, previewUrl`), quantos orçamentos (`MarketingQuote` com o `cardId`, só contagem) |
| `POST /print/cards` | EDITOR | `{ companyId, title, printSpecs? }` pela fábrica, `kind: PRINT`, status Em produção |
| `PATCH /print/cards/:cardId/specs` | EDITOR | `{ format, paper, finish, quantity, bleedMm, colors, printer, notes }` |
| `POST /print/cards/:cardId/prepress` | EDITOR | Cria o checklist pré-gráfica padrão se não houver (itens `PREPRESS`): sangria de 3 mm, cores em CMYK, imagens em 300 dpi, fontes em curva ou embutidas, margem de segurança de 5 mm, PDF/X ou o formato pedido pela gráfica, texto revisado e telefone, URL e QR testados |
| `PATCH /print/cards/:cardId/prepress/:itemId` | EDITOR | `{ done }` só em item `PREPRESS` |
| `POST /print/cards/:cardId/status` | EDITOR | `{ status, force? }` só na trilha da gráfica, via `checkMove`. Enviar para a gráfica com item pré-gráfica aberto dá 400 "Faltam N itens..."; ADMIN pode `force`. Registra e avisa |

Baixar o original: rota da fundação `GET /assets/:assetId/download` (devolve o sha256 para conferir).

### Front (`features/marketing/print/`, `views/MarketingPrintView.vue`)
- Lista das peças com a trilha (Em produção, Aguardando, Aprovado para impressão, Enviado, Prova recebida, Entregue) e filtros.
- Painel da peça: prévia (usa `previewUrl` quando o original é CMYK, com o aviso "Prévia aproximada em RGB; o original em CMYK segue intacto"), originais com tamanho, selo CMYK, sha256 curto e "Baixar original"; especificação; checklist pré-gráfica; botões da trilha; link "Abrir aprovação" para `/marketing/cards/<id>`; e uma seção "Orçamentos" com o comentário `<!-- QuotesPanel (M3-B) entra aqui na junção -->` e a contagem.

### Critérios de aceite (M2-A, Gráfica)
- [ ] G1. Peça aprovada (deixe o card aprovado direto no banco no E2E) com pré-gráfica aberto não vai para a gráfica (400); com tudo marcado vai; prova recebida e entregue gravam e registram.
- [ ] G2. Arquivo CMYK mostra a prévia RGB e o download devolve o mesmo sha256. O upload de versão é da M1 (outro worktree), então o seu E2E monta o estado sozinho: grava o original e a prévia no fake-storage (upload autenticado no bucket `drive-files`) e as linhas `MarketingCardVersion` e `MarketingAsset` (READY, com `sha256`, `colorSpace: 'cmyk'`, `previewPath`) direto no banco.
- [ ] G3. Diretoria vê a lista e não muda status (403).

---

## M2-B: Ideias e trends

### API (`workflow-api/src/marketing/ideas/`)

| Rota | Papel | O quê |
|---|---|---|
| `GET /ideas?status&kind&companyId&tag&q&sort=likes\|recent` | VIEWER | Com `likesCount`, `likedByMe`, `createdBy`, `convertedCardId` |
| `POST /ideas` | EDITOR | `{ title, description?, referenceUrl? (http/https), network?, kind (IDEA\|TREND\|REFERENCE), tags[], companyId? }` |
| `PATCH /ideas/:ideaId` | EDITOR (autor ou ADMIN) | |
| `POST /ideas/:ideaId/like` | VIEWER | `{ liked }` (curtir é da pessoa; a Diretoria curte) |
| `POST /ideas/:ideaId/convert` | EDITOR | `{ companyId?, kind?, title? }` → `MarketingCardFactory.create` com `ideaId`; ideia vira `CONVERTED` com `convertedCardId`. Ideia sem marca exige `companyId`. Converter duas vezes dá 409 com o card existente |
| `POST /ideas/:ideaId/archive` | EDITOR | `{ archived }` |
| `DELETE /ideas/:ideaId` | `canDelete` | |

### Front (`features/marketing/ideas/`, `views/MarketingIdeasView.vue`)
Mural em grade densa (não masonry com cards gigantes): título, tipo, rede, marca, tags, link de referência com domínio, curtidas; ordenar por curtidas ou recentes; filtros; criar rápido no topo; "Transformar em post" leva para `/marketing/cards/<id>`.

## M2-B: Campanhas

### Regras
- Status: `DRAFT → AWAITING_APPROVAL → APPROVED → ACTIVE ⇄ PAUSED → ENDED`, `CANCELED` de qualquer um (ADMIN), reabrir para `DRAFT` (ADMIN). Com `settings.campaignNeedsApproval = false`, `DRAFT → ACTIVE` direto. Aprovar é só ADMIN. Função pura `checkCampaignMove` com teste.
- Período `startDate`/`endDate` em `'YYYY-MM-DD'`, início <= fim. Orçamento total e/ou por dia, em centavos. Sem valor por dia, a tela mostra o orçamento dividido pelos dias.
- **Gasto vem do financeiro** (M3, outro worktree): some `MarketingExpense.amountCents` com o `campaignId` (pagos e previstos separados). Aqui é só leitura; não crie lançamento.
- Cliques e leituras somam os `MarketingUtm` da campanha.

### API (`workflow-api/src/marketing/campaigns/`)

| Rota | Papel | O quê |
|---|---|---|
| `GET /campaigns?status&companyId&q` | VIEWER | Com `spentPaidCents`, `spentPlannedCents`, `cardsCount`, `utmsCount`, `clicks`, `scans` |
| `GET /campaigns/:campaignId` | VIEWER | Detalhe + cards ligados (resumo), UTMs (com cliques), lançamentos (só leitura), ritmo: gasto x esperado até hoje |
| `POST /campaigns` | EDITOR | `{ companyId, name, objective?, startDate?, endDate?, budgetCents?, dailyBudgetCents?, audience?, channels[] }` |
| `PATCH /campaigns/:campaignId` | EDITOR | Campos acima, `learnings` |
| `PATCH /campaigns/:campaignId/results` | EDITOR | `{ impressions, reach, clicks, leads, signups, sales, notes }` (números inteiros >= 0) |
| `POST /campaigns/:campaignId/status` | EDITOR (aprovar e cancelar: ADMIN) | `{ status }` via `checkCampaignMove`; enviar avisa os Admins, aprovar avisa quem criou |
| `POST /campaigns/:campaignId/cards` | EDITOR | `{ cardId }` liga card da mesma marca (grava `MarketingCard.campaignId`) |
| `DELETE /campaigns/:campaignId/cards/:cardId` | EDITOR | desliga |
| `GET /campaigns/calendar?from&to&companyId` | VIEWER | Campanhas que cruzam o intervalo (para o calendário) |
| `DELETE /campaigns/:campaignId` | `canDelete`; fora de Rascunho/Cancelada só ADMIN | |

### Front (`features/marketing/campaigns/`, `views/MarketingCampaignsView.vue`)
- Lista densa: nome, marca, status, período, orçamento, gasto (barra fina), cliques. Painel lateral pela URL `?campanha=<id>` com abas Resumo, Artes, UTMs, Resultados, Aprendizados; botões de status conforme o papel; criar e editar em `AppDialog`.
- **Fonte do calendário:** `features/marketing/campaigns/campaigns-calendar-source.ts` exporta `campaignsCalendarSource: MarketingCalendarSource` (contrato em `features/marketing/marketing-calendar.ts`): uma faixa por campanha (`allDay`, `end`), `draggable: false`, `to: { name: 'marketing-campaigns', query: { campanha: id } }`. O registro no calendário é feito na junção.

### Critérios de aceite (M2-B)
- [ ] I1. Diretoria curte ideia e não cria; "Transformar em post" cria o card (no banco, com `ideaId`) e a ideia vira convertida; converter de novo dá 409.
- [ ] C1. Editor envia campanha para aprovação; Editor tentando aprovar leva 403; Admin aprova; com `campaignNeedsApproval` desligado no banco, Rascunho vai direto para Ativa.
- [ ] C2. Gasto da campanha soma os lançamentos com o `campaignId` (crie dois no banco no E2E, um pago e um previsto).
- [ ] C3. Card da Emmitec não se liga a campanha da PetJourney (400); freelancer não vê campanha da Emmitec.
- [ ] C4. A fonte do calendário devolve a campanha que cruza o mês.

---

## Ambiente de cada agente

| | Worktree | Banco | API | Vite |
|---|---|---|---|---|
| M2-A | `C:\TRABALHO\workflow\wt\m2` | `wf_m2a` | 3621 | 5183 |
| M2-B | `C:\TRABALHO\workflow\wt\m2` | `wf_m2b` | 3622 | 5184 |

Mesmos comandos da M1 (seção "Ambiente" de [m1-aprovacao-calendario.md](./m1-aprovacao-calendario.md)), trocando banco, porta e `VITE_CACHE_DIR` (`node_modules/.vite-m2a` / `-m2b`). Postgres (55432) e fake-storage (54329) já estão no ar e são de todos.

## Change Log

| Data | Versão | Mudança |
|---|---|---|
| 2026-11-06 | 0.1 | Spec da M2 com contrato de API e divisão em dois agentes; e-mail das notificações vira follow-up (SendGrid não configurado) |
| 2026-11-06 | 1.0 | M2-A (UTM 89 e Gráfica 78 checagens) e M2-B (129) entregues e juntados; `QuotesPanel` da M3 ligado na Gráfica e a fonte de campanhas no calendário. Auditoria: orçamento da campanha escondido de quem não vê o financeiro; orçamento e período de campanha enviada ou aprovada só o Admin muda; link curto e QR de UTM só mudam pela ala |
