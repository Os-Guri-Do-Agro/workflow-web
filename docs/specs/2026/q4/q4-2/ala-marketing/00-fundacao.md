# Ala Marketing: fundação (grupo, papéis, acesso, arquivos)

**Status:** Implementado no harness (sem commit). Base das fases M1, M2 e M3.
**Épico:** [ala-marketing.md](../../../../epicos/ala-marketing.md)
**Criado em:** 2026-11-06
**Autor:** Nicolas (via spec-driven; implementação da fundação pelo orquestrador)
**Repos:** `workflow-api` e `work-flow`

## Decisões do Nicolas (06/11/2026)

- **Visualizador vê o financeiro.** Padrão `viewerSeesFinance: true`; o Dono pode desligar.
- **Freelancer entra só com papel na ala.** Conta sem empresa nenhuma, com papel no grupo. Não vê board, tarefas nem empresa.
- **Limite de arquivo: o máximo que o storage aceita.** `MARKETING_MAX_FILE_BYTES`, padrão igual ao do Drive (teto medido do projeto Supabase, 50 MB hoje); sobe por env quando o plano subir. Upload direto do navegador para o storage.
- **A ala é de um GRUPO de empresas** (as do Fluvio: PetJourney, EMMI, Marketing, nicolas...). As empresas ligadas viram MARCAS de uma ala só. Quem decide o que entra é o **Dono** (cargo maior), aplicado ao usuário `cmmpb9fb9001519l69b8xnjnc` (Nicolas Castela, ADMIN das 9 empresas em produção, conferido só com leitura em 06/11).

## Modelo

| Tabela | Para quê |
|---|---|
| `CompanyGroup` | O grupo. `marketingEnabled` liga a ala; `settings` (Json) guarda as configurações |
| `CompanyGroupCompany` | Empresa ligada = marca. `companyId` é único (uma empresa, um grupo). `color` é chave da paleta de tags |
| `CompanyGroupMember` | Papel na ala: `OWNER` (Dono), `ADMIN`, `EDITOR`, `VIEWER`. `brandIds` vazio = todas as marcas |
| `MarketingCard`, `MarketingCardVersion`, `MarketingAsset`, `MarketingComment`, `MarketingChecklistItem` | M1 (aprovação) |
| `MarketingLink`, `MarketingLinkFavorite`, `MarketingLog` | M1 (links) e histórico de tudo |
| `MarketingUtm`, `MarketingIdea`, `MarketingIdeaLike`, `MarketingCampaign` | M2 |
| `MarketingExpense`, `MarketingRecurringExpense`, `MarketingBudget`, `MarketingActivation`, `MarketingPartner`, `MarketingPartnerContact`, `MarketingQuote` | M3 |

Migration única e só aditiva: `20261106120000_ala_marketing` (22 tabelas, nenhuma alteração em tabela existente). Status, tipos e papéis são texto validado no código. Data sem hora é `'YYYY-MM-DD'`, mês `'YYYY-MM'`. Dinheiro em centavos.

## Papéis

| | VIEWER | EDITOR | ADMIN | OWNER (Dono) |
|---|---|---|---|---|
| Ver (nas marcas que enxerga) | sim | sim | sim | sim |
| Financeiro | se `viewerSeesFinance` | sim | sim | sim |
| Criar, editar, subir arquivo, comentar, lançar gasto | | sim | sim | sim |
| Apagar | | o que criou (ou tudo com `editorCanDelete`) | tudo | tudo |
| Aprovar e pedir ajuste | | | sim | sim |
| Revelar senha de link | | se `editorRevealsSecrets` | sim | sim |
| Convidar e mudar EDITOR/VIEWER, listas de trabalho | | | sim | sim |
| Ligar/desligar a ala, ligar empresas, promover a ADMIN/OWNER, chaves severas | | | | sim |

Chaves de `settings` (fonte: `workflow-api/src/marketing/core/marketing-settings.ts`): `viewerSeesFinance`, `editorRevealsSecrets`, `campaignNeedsApproval`, `editorCanDelete` (só o Dono muda) e as listas `expenseCategories`, `utmSources`, `utmMediums`, `linkCategories` (ADMIN+).

## API da fundação

| Rota | Papel | O quê |
|---|---|---|
| `GET /marketing/me` | logado | Grupos, papel, marcas visíveis, `settings`, `permissions`. Sem a migration: `available: false` |
| `GET /marketing/g/:groupId` | VIEWER (funciona com a ala desligada) | Detalhe do grupo e empresas |
| `GET /marketing/g/:groupId/members` | VIEWER | Equipe (e-mail só para ADMIN+) |
| `GET /marketing/g/:groupId/log?entityType&entityId&take` | VIEWER | Histórico de um item ou feed da ala |
| `POST /marketing/g/:groupId/assets/:assetId/confirm` | EDITOR | Fecha o upload direto (confere no storage, mede, gera prévia RGB de CMYK/TIFF/HEIC) |
| `GET /marketing/g/:groupId/assets/:assetId/download` | VIEWER | URL que baixa o original com o nome e o sha256 |

**Escritas (Dono e Admin), feitas pelo orquestrador em paralelo às fases:**

| Rota | Papel | O quê |
|---|---|---|
| `GET /marketing/companies/available` | logado | Empresas que a pessoa administra e que não têm grupo (para criar um) |
| `POST /marketing/groups` | ADMIN das empresas | `{ name, companyIds }`; quem cria vira Dono |
| `PATCH /marketing/g/:groupId` | OWNER (funciona desligada) | `{ name?, marketingEnabled? }` |
| `PATCH /marketing/g/:groupId/settings` | ADMIN (chaves severas só OWNER) | `{ settings: {...} }` |
| `GET /marketing/g/:groupId/companies/available` | OWNER | Empresas livres que o Dono administra |
| `POST /marketing/g/:groupId/companies` | OWNER e ADMIN da empresa | `{ companyId, color? }` (empresa em outro grupo: 409) |
| `PATCH /marketing/g/:groupId/companies/:companyId` | OWNER | `{ marketingEnabled?, color? }` |
| `DELETE /marketing/g/:groupId/companies/:companyId` | OWNER | Tira do grupo (o conteúdo fica; o grupo nunca fica sem empresa) |
| `POST /marketing/g/:groupId/members` | ADMIN (Admin e Dono só o OWNER concede) | `{ email, name?, role, brandIds?, title? }`; cria a conta se não existir; conta sem empresa recebe o link de primeiro acesso |
| `PATCH /marketing/g/:groupId/members/:userId` | ADMIN (Admin só mexe em Editor e Visualizador) | `{ role?, brandIds?, title? }`; o último Dono não se rebaixa |
| `DELETE /marketing/g/:groupId/members/:userId` | ADMIN ou a própria pessoa | O último Dono não sai |
| `POST /marketing/g/:groupId/members/:userId/access-link` | ADMIN | Só para conta sem empresa e se quem gera é Admin+ de todos os grupos da pessoa |

Tela: `views/MarketingSettingsView.vue` (+ `settings/`): Configurações do Dono (nome, as quatro chaves severas, ligar e desligar a ala), Empresas do grupo, Equipe (convidar com link de primeiro acesso, editar papel e marcas, tirar) e Listas de trabalho. Quem administra empresa e ainda não tem ala vê "Criar grupo de empresas" no `/marketing`.

**Produção:** `workflow-api/scripts/marketing-prod-setup.mjs` cria o "Grupo Fluvio" com PetJourney, EMMI, Marketing e nicolas e dá o papel de Dono ao `cmmpb9fb9001519l69b8xnjnc`. Simula por padrão, grava com `--apply`, é idempotente; ensaiado num banco local com os mesmos ids. Roda depois da migration e só com o ok do Nicolas.

## Peças para as fases usarem

**API (`workflow-api/src/marketing/core/`):**
- `MarketingAccessGuard` + `@RequireMarketingRole('EDITOR')` + `@MktCtx() ctx: MarketingContext`. Toda rota de fase é `/marketing/g/:groupId/...` com `@UseGuards(JwtAuthGuard, MarketingAccessGuard)`.
- `MarketingAccessService`: `brandWhere(ctx)`, `brandOrGroupWhere(ctx)`, `assertBrand`, `assertOptionalBrand`, `assertRole`, `canDelete`/`assertCanDelete`, `canSeeFinance`/`assertFinance`, `canRevealSecrets`, `memberIds`, `memberIdsForBrand`, `people(ids)`.
- `MarketingLogService.record(ctx, { companyId, verb, entityType, entityId, summary, notify? })`: histórico + aviso no sino (`MARKETING_<kind>`, aparece com qualquer empresa ativa) + socket `marketing:changed` para todo o grupo.
- `MarketingFilesService`: `requestUpload(ctx, { companyId, owner, name, mimeType, size, sha256 })` (a fase valida o dono antes), `urls(assets)`, `remove(assets)`, `toDto(asset)`, `maxBytes`.
- `MarketingCardFactory.create(ctx, input)`: criar card (M1 e o "Transformar em post" da M2).
- `marketing-status.ts`: `checkMove`, `checkReview`, `statusAfterNewVersion`, `statusesFor`, listas de tipo/rede/status.
- `marketing-validation.ts`: `isYmd`, `assertYmd`, `assertYm`, `assertCents`, `assertText`, `optionalText`, `optionalDate`, `normalizeUtmValue`, `normalizePhone`, `pickFrom`.
- `marketing-errors.ts`: `rethrowMarketingSchema` (503 em PT-BR sem a migration).

**Front (`work-flow/src/`):**
- `service/marketing/marketing-core.ts`: tipos, `mkt(groupId, '/rota')`, ticket, confirm e abort do upload. Desde a R1 o envio em si é da fila global `features/marketing/uploads/upload-queue.ts` (o `uploadMarketingFile` antigo saiu).
- `features/marketing/composables/useMarketing.ts`: `useMarketing()` (grupo ativo, papel, `can()`, marcas, `brandFilter` em `?marca=`, `permissions`, `settings`), `useMarketingMembers`, `marketingKeys`. Chave de query SEMPRE `['marketing', groupId, '<área>', ...]`: o socket invalida o grupo inteiro.
- `features/marketing/marketing-labels.ts`: rótulos de tipo, rede e status, `cardStatusLabel`, `CARD_STATUS_TONE`, `statusesFor`, `brandTone`, `toneStyle`, `formatCents`, `parseMoneyToCents`, `formatBytes`.
- `features/marketing/marketing.css`: utilitários `mk-` (botão, campo, chip com `data-tone`, painel, tabela densa), importado pelo layout.
- `features/marketing/marketing-calendar.ts`: o contrato `MarketingCalendarItem`/`MarketingCalendarSource` (M1 desenha, M2 e M3 fornecem fontes).
- `features/marketing/MarketingLayout.vue`, `marketing-nav.ts`, `routes.ts` e as views provisórias em `views/`.
- `core/components/shells/MarketingOnlyShell.vue`: moldura de quem só tem a ala; o `AppShell` escolhe e manda qualquer rota fora de `/marketing` e `/settings` para `/marketing`.

**Harness (`work-flow/scripts/harness/`):** `fake-storage.mjs` (storage compatível com o Supabase, porta 54329), `seed-marketing.mjs`, `marketing-db.sh <banco> [dir-api]`, `api-run.sh <dir-api> <porta> <banco>`, `marketing-shot.cjs` (moldura de ponta a ponta), `HARNESS_DB` em todos os scripts de banco, `VITE_CACHE_DIR` no `vite.config.ts`.

Pessoas do seed (senha `nevo1234`): `nicolas` OWNER, `leticia` ADMIN, `marcel` EDITOR, `freela` EDITOR só da PetJourney e sem empresa, `diretoria` VIEWER sem empresa. `luis` e `ana` ficam fora da ala (`luis` é WORKER da Emmitec, que é marca do grupo). A Sentia não está no grupo.

## Regras para quem implementa uma fase (valem para os 6 agentes)

1. **Leia antes:** o épico, esta spec, a spec da sua fase inteira, `work-flow/src/CLAUDE.md` (design system: só tokens, sem hex, `lucide-vue-next`, `AppDialog`/`ConfirmDialog` e nunca `v-dialog`, `PersonAvatar` para pessoa, 375px sem rolagem lateral, 44px de toque no celular, sem rótulo em caixa alta espaçada). O Nicolas acha as telas "com cara de IA" ruins: queremos denso e útil, estilo Jira/Azure, sem gradiente, brilho, card gigante nem emoji decorativo.
2. **Texto visível em PT-BR e sem o caractere em-dash** (proibido em qualquer produto do Nicolas). Use vírgula, dois-pontos ou parênteses.
3. **Schema congelado.** Não edite `prisma/schema.prisma`, não rode `prisma generate`, `migrate` nem `db push` (o client gerado é compartilhado entre as fases). Falta um campo: contorne e registre no relatório.
4. **Segurança:** toda consulta escopada por `groupId` e marca (`brandWhere`/`brandOrGroupWhere`). Busca por id é `findFirst({ where: { id, ...this.access.brandWhere(ctx) } })`, e não achar dá 404 (mesma resposta para "não existe" e "não é seu"). Papel conferido no servidor em toda escrita. Nunca leia `companyId` do header.
5. **DTO:** todo campo com decorator do `class-validator`. O `ValidationPipe` global usa `whitelist: true` e APAGA em silêncio campo sem decorator.
6. **Toda escrita chama `MarketingLogService.record`** com `summary` em PT-BR ("aprovou a V2 de ..."). Aviso só para quem precisa agir (nunca para quem fez).
7. **Arquivos:** só `MarketingFilesService` (nada de multer, nada de URL pública). Valide o dono (card, ativação, lançamento, orçamento) antes do `requestUpload`. Listagem devolve `url`/`previewUrl` via `files.urls`. Apagar chama `files.remove`.
8. **Só os seus arquivos.** API em `workflow-api/src/marketing/<sua-área>/`; front em `work-flow/src/features/marketing/<sua-área>/`, `work-flow/src/service/marketing/marketing-<área>.ts` e as views da sua fase em `features/marketing/views/`. Arquivos compartilhados em que você pode ACRESCENTAR (sem reescrever o resto): `workflow-api/src/marketing/marketing.module.ts` (uma linha de import do seu módulo, no bloco da sua fase). Não mexa em `core/`, `group/`, `MarketingLayout.vue`, `marketing-nav.ts`, `routes.ts`, `marketing-labels.ts`, `marketing.css` (precisou: diga no relatório). Bug na fundação: corrija o mínimo e explique no relatório.
9. **Testes:** spec de unidade (jest) para regra de negócio pura e para as regras de acesso do seu serviço; roteiro de ponta a ponta `scripts/harness/marketing-<área>-e2e.cjs` que exercita API E tela (Playwright, Edge, 1440 e 375), confere papel por papel (VIEWER não escreve, freelancer não vê outra marca, quem é de fora leva 403), zero 401/5xx, e guarda capturas em `scripts/harness/prints/marketing-<área>/`.
10. **Gates antes de entregar:** API `npx tsc --noEmit` limpo, `npm test` passando (o comando é `npm test`, não `npx jest`), `npx nest build` ok; front `npx vue-tsc --build --force` limpo (o `--noEmit` não checa nada aqui); seu E2E todo OK. Olhe as capturas antes de dizer que ficou bom.
11. **Nunca:** commit, push, `git add`, `git stash`, tocar a produção, carregar o `.env` da API, parar processo que você não subiu, usar porta de outro agente.

## Change Log

| Data | Versão | Mudança |
|---|---|---|
| 2026-11-06 | 1.0 | Fundação implementada e verificada no harness: 15 testes de unidade, 15 checagens de API e 17 de tela (Dono, freelancer, de fora, 1440 e 375) |
| 2026-11-06 | 1.1 | Escritas do Dono e do Admin, tela Configurações e "Criar grupo"; `marketing-settings-e2e.cjs` com 28 regras pela API e 22 checagens de tela, tudo OK; script de produção ensaiado |
