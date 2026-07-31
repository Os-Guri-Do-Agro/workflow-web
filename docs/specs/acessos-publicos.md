# Spec: Acessos Públicos (hub de tokens de API) + fechamento do cadastro

**Status:** Concluído
**Autor:** Claude (p/ Nicolas)
**Criado em:** 2026-07-31
**Última atualização:** 2026-07-31
**Versão:** 1.0

---

## Visão Geral

Duas mudanças que fecham o workflow como ferramenta privada de integração:

1. **Remover o cadastro público.** O workflow não é um produto aberto; conta
   nova só nasce pela tela ADMIN de Usuários.
2. **Acessos Públicos**: página nova na seção Ferramentas que centraliza os
   tokens de API (os `wfqr_` que os integradores usam no QR e no OCR). Um
   ADMIN vê e cria tokens de TODAS as empresas onde é ADMIN, escolhe para
   qual ferramenta o token vale (QR, OCR ou ambas), e **só o criador de um
   token pode revogá-lo**.

## Motivação / Contexto de Negócio

O workflow é o centralizador privado das empresas do Nicolas (Sentia,
PetJourney, FitCertify...). Cadastro aberto é superfície de risco sem nenhum
ganho. Já a gestão de tokens hoje vive escondida num dialog dentro do QR,
por empresa ativa — com o OCR usando o mesmo token, falta o lugar único que
responda "quais acessos existem, de qual empresa, para qual ferramenta, e
quem criou". Revogação hoje é qualquer ADMIN da empresa; a regra de negócio
correta é dono revoga o que é seu.

---

## Research Findings

**Stack:** front Vue 3.5 + Vuetify 4 + vue-query; back NestJS 11 + Prisma.

**Cadastro hoje (as duas pontas):**
- Front: rota `/signup` ([router/index.ts:53](../../src/router/index.ts)),
  `SignupView.vue`, entrada em `PUBLIC_ROUTES` (linha ~102), botão "Criar
  conta gratuita" no `LoginView.vue` (linha ~147), `authService.signup()`.
- Back: `POST /user` é **público e sem guard** (`user.controller.ts` +
  comentário de segurança em `user.service.ts:23`). CRÍTICO: o mesmo
  endpoint é usado pela tela ADMIN de Usuários (`CompanyUsersView` →
  `CreateUserModal` → `userService.postUser`), que roda autenticada. Logo o
  endpoint **não pode ser removido**: ganha `JwtAuthGuard` e o fluxo admin
  continua idêntico.
- Google OAuth (`auth/google.*`) é só vínculo de calendário (JWT-guarded);
  não cria conta. Nenhum outro caminho público de criação de usuário.

**Tokens hoje:**
- `CompanyApiToken` (schema.prisma:909): `companyId`, `name`, `tokenHash`,
  `tokenPrefix`, `defaultFolderId` (QR), `createdById`, `lastUsedAt`,
  `revokedAt`. **Sem escopo**: o mesmo token autentica `/api/v1/qr` E
  `/api/v1/ocr`.
- Endpoints `/qr/api-tokens` (list/create/revoke) em
  `api-token.controller.ts`, service em `api-token.service.ts`; tudo
  per-company via header `x-company-id`, com `assertCompanyAdmin`.
  `revoke` hoje aceita **qualquer ADMIN da empresa**.
- Guard `ApiTokenGuard` (`auth/guards/api-token.guard.ts`) resolve o token
  cru via `resolveRawToken` (hash + revogação + lastUsedAt), usado pelos
  controllers públicos do QR e do OCR.
- UI: `QrApiTokensDialog.vue` (591 linhas) dentro do QrCodesView, opera na
  empresa ativa, com pasta padrão de QR. O interceptor do axios já respeita
  `x-company-id` explícito por request (comentário em `api.ts`) — operar
  numa empresa ≠ ativa já é suportado.

**Padrões a seguir:**
- Página de feature: `features/<nome>/<Nome>View.vue` + rota + entrada nos
  3 shells (NavList `section: 'Ferramentas'`, FocusShell, CanvasShell).
- Tokens de design, lucide, AppDialog/ConfirmDialog (zero v-dialog).
- Migration idempotente NÃO aplicada (padrão das entregas atuais; Nicolas
  aplica no deploy).

**Breaking Changes:**
- Tokens existentes de CLIENTES EM PRODUÇÃO continuam funcionando: `scope`
  nasce **nullable e null = acesso total** (QR + OCR). O microserviço
  `/api/v1/qr` não muda de contrato.
- `POST /user` passa a exigir JWT: o signup público morre (intencional);
  a tela ADMIN de Usuários não sente.
- Revogação passa a ser criador-only: ADMINs deixam de conseguir revogar
  token alheio (intencional, pedido do Nicolas).

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | Escopo novo quebrar cliente em produção no microserviço QR | `scope` nullable; `null` = total; guard trata `null` como passe livre; teste de regressão congela o comportamento de token sem escopo nos dois guards |
| Médio | Criador-only: token fica sem ninguém que possa revogar pela UI se o criador sair da empresa **ou for rebaixado a WORKER** (o `assertCompanyAdmin` roda antes da regra do criador) | Regra dura mantida (pedido explícito do Nicolas). Válvula de escape DOCUMENTADA: `UPDATE "CompanyApiToken" SET "revokedAt" = now() WHERE id = '...'`. A listagem mostra o criador de cada token, então sempre dá para saber de quem é. Agravante conhecido: a API não tem endpoint de remover membro nem de trocar role, logo o offboarding já é feito no banco de qualquer jeito |
| Médio | Fechar `POST /user` quebrar o fluxo de criar usuário | O modal roda autenticado (o axios manda Bearer e `x-company-id` sempre). Guard exige ADMIN; o botão da tela ganhou o mesmo gate, então WORKER não vê ação que falharia. Exercitado contra a API local: sem token 401, WORKER 403 |
| Baixo | Duplicidade de gestão (dialog do QR × página nova) | Dialog do QR é REMOVIDO; o botão "Tokens de API" do QR navega para `/public-access`. A página nova absorve a pasta padrão de QR na criação |

---

## Requisitos Não-Funcionais

- **Segurança:** listagem/criação exigem JWT + role ADMIN na empresa do
  token; revogação exige ser o criador; valor cru do token continua
  aparecendo uma única vez (resposta da criação); rota nova NÃO entra em
  `PUBLIC_ROUTES`.
- **Observabilidade:** log em criação (`company`, `by`, `scope`) e
  revogação (`token`, `by`).

---

## Como funciona

### 1. Cadastro fechado

- Front: some a rota `/signup`, o arquivo `SignupView.vue`, a entrada em
  `PUBLIC_ROUTES`, o botão "Criar conta gratuita" do login e o
  `authService.signup()`.
- Back: `POST /user` ganha `@UseGuards(JwtAuthGuard, CompanyRoleGuard)` +
  `@RequireRole(ADMIN)`. Sem JWT → 401; autenticado sem ser ADMIN da empresa
  → 403. **Endurecido para ADMIN em 31/07 a pedido do Nicolas**, depois que a
  revisão mostrou que "qualquer autenticado" ainda era (a) sonda de e-mails (o
  409 "já cadastrado" versus 201 revela quem tem conta) e (b) bloqueio de
  endereço, já que não existe endpoint de apagar usuário.
- Front: `CreateUserModal` na tela de Usuários passa a exigir ADMIN
  (`isActiveCompanyAdmin()`), senão o WORKER veria o botão e levaria 403.
  O comentário de segurança do service é atualizado (a razão histórica de
  ignorar `companyId`/`role` do body permanece válida).

### 2. Token com escopo

```prisma
model CompanyApiToken {
  ...
  scope String?   // null = total (QR+OCR, tokens legados) | "qr" | "ocr"
}
```

- `ApiTokenGuard` passa a carregar `scope` no contexto.
- Superfície QR (`/api/v1/qr/*`, `/q/*` não — público de leitura) exige
  `scope ∈ {null, 'qr'}`; superfície OCR (`/api/v1/ocr/*`) exige
  `scope ∈ {null, 'ocr'}`. Escopo errado → 403 com mensagem clara.
- Criação aceita `scope?: 'qr' | 'ocr'` (ausente = total, igual legado).

### 3. Página Acessos Públicos (`/public-access`)

Seção Ferramentas, terceira entrada (QR Codes, OCR Digital, **Acessos
Públicos**). Visível para qualquer usuário que seja ADMIN de ≥1 empresa
(WORKER puro não vê a entrada; a rota redireciona para `/` se não-ADMIN em
todas).

- **Listagem** agregada: tokens de todas as empresas onde o usuário é
  ADMIN. Colunas: nome, prefixo (`wfqr_ab12…`), empresa, escopo (QR / OCR /
  Total), criador, último uso, estado (ativo/revogado). Filtro por empresa
  e por estado.
- **Criação**: escolhe empresa (só onde é ADMIN) → escopo (QR / OCR /
  ambas) → nome; se escopo inclui QR, select opcional de pasta padrão
  (pastas da empresa escolhida). O valor cru aparece UMA vez com copiar.
- **Revogação**: botão só habilitado nos tokens em que
  `createdById == eu`; tooltip explica nos demais ("só quem criou revoga").
  Confirmação via ConfirmDialog.
- **QR Codes**: `QrApiTokensDialog.vue` é removido; o botão "Tokens de
  API" vira link para `/public-access`.

### 4. Endpoints novos/alterados

```
GET    /public-access/tokens          → tokens agregados das empresas onde sou ADMIN
POST   /qr/api-tokens                 → ganha scope? no body (reuso, x-company-id)
DELETE /qr/api-tokens/:id             → passa a exigir createdById == user
```

O `GET` novo vive num controller próprio (`public-access.controller.ts`)
reusando o `ApiTokenService` do QrModule (já exportado). Os endpoints
`/qr/api-tokens` existentes permanecem (o create é reusado pela página).

---

## User Stories

- Como **ADMIN de várias empresas**, quero ver num só lugar todos os
  acessos de API que cada empresa expôs, para auditar sem trocar de
  empresa ativa.
- Como **ADMIN**, quero criar um token só de OCR para a Sentia sem que
  esse token consiga criar QR codes.
- Como **criador de um token**, quero que só eu possa revogá-lo.
- Como **dono do workflow**, quero que ninguém de fora crie conta.

---

## Acceptance Criteria

### Comportamentais

- [x] **Given** visitante sem conta **When** acessa `/signup` **Then**
      redireciona para login (rota não existe) e não há botão de cadastro
      no login.
- [x] **Given** request `POST /user` sem JWT **Then** 401. **Given** WORKER
      autenticado **Then** 403 e nenhum usuário criado. **Given** ADMIN da
      empresa criando pela tela Usuários **Then** funciona como hoje.
- [x] **Given** token legado (scope null) **When** chama `/api/v1/qr` e
      `/api/v1/ocr` **Then** ambos respondem como hoje (regressão).
- [x] **Given** token criado com escopo `ocr` **When** chama `/api/v1/qr`
      **Then** 403; `/api/v1/ocr` → 200. (E o espelho para escopo `qr`.)
- [x] **Given** usuário ADMIN nas empresas A e B e WORKER na C **When**
      abre `/public-access` **Then** vê tokens de A e B; C não aparece nem
      no filtro nem na criação.
- [x] **Given** token criado por outro ADMIN **When** tento revogar
      **Then** 403 no back e botão desabilitado no front com explicação.
- [x] **Given** WORKER em todas as empresas **When** navega para
      `/public-access` **Then** redirect para `/` e a entrada não aparece
      no drawer.

### Observáveis

- [x] Migration `add scope` nullable, idempotente, NÃO aplicada (Nicolas
      aplica no deploy).
- [x] Valor cru do token aparece apenas na resposta do POST de criação.
- [x] `QrApiTokensDialog.vue` deletado; botão do QR navega para a página.

---

## Estratégia de Testes

### Unitários (workflow-api)
- [x] `ApiTokenService.revoke` — criador revoga; outro ADMIN → 403; já
      revogado → mensagem idempotente.
- [x] `ApiTokenService.create` — com escopo grava `scope`; sem escopo grava
      null.
- [x] `listAllForUser` — só empresas onde é ADMIN; WORKER não vaza.
- [x] Guards de escopo — matriz {null, qr, ocr} × {superfície QR, OCR}.
- [x] `POST /user` — sem JWT 401, token forjado 401, WORKER 403, sem empresa
      no request 403, ADMIN 201, e `companyId`/`role` do body ignorados
      (6 testes, guards reais em `user-create-guard.spec.ts`).

### Regressão
- [x] Suítes de QR inteiras verdes (guard e service mudaram).
- [x] `listForCompanyApi` congelado (contrato do microserviço, teste já
      existe).

### Manuais (happy path)
- [x] Tela nova nos 3 shells; criar token OCR p/ empresa B com empresa A
      ativa; copiar valor; revogar o próprio; ver botão travado no alheio.
- [x] Login sem botão de cadastro; `/signup` → login.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `workflow-api/prisma/schema.prisma` + migration nova | Modificar | `scope String?` no CompanyApiToken |
| `workflow-api/src/qr/api-token.service.ts` | Modificar | scope no create/shape; revoke criador-only; `listAllForUser` |
| `workflow-api/src/auth/guards/api-token.guard.ts` | Modificar | scope no contexto + helper de exigência |
| `workflow-api/src/qr/qr-api.controller.ts` / `ocr/ocr-api.controller.ts` | Modificar | exigir escopo compatível |
| `workflow-api/src/public-access/public-access.controller.ts` (+module) | Criar | GET agregado |
| `workflow-api/src/user/user.controller.ts` | Modificar | JwtAuthGuard no POST |
| `work-flow/src/features/public-access/PublicAccessView.vue` | Criar | página nova |
| `work-flow/src/service/public-access/…` + composable | Criar | client + vue-query |
| `work-flow/src/router/index.ts` | Modificar | rota nova; remover `/signup` |
| `work-flow/src/features/auth/LoginView.vue` | Modificar | remover CTA de cadastro |
| `work-flow/src/features/auth/SignupView.vue` | Deletar | — |
| `work-flow/src/service/auth/auth-service.ts` | Modificar | remover `signup()` |
| `work-flow/src/features/qr/QrCodesView.vue` | Modificar | botão → link p/ página |
| `work-flow/src/features/qr/components/QrApiTokensDialog.vue` | Deletar | absorvido pela página |
| shells (`NavList`, `FocusShell`, `CanvasShell`) | Modificar | entrada Ferramentas (condicionada a ser ADMIN de ≥1 empresa) |
| `work-flow/src/CLAUDE.md` | Modificar | tabela de features |

---

## Tasks Técnicas

- [x] **T1** — Schema + migration `scope` nullable (idempotente, não aplicar)
- [x] **T2** — `ApiTokenService`: scope no create/shape, revoke criador-only,
      `listAllForUser(userId)` *(depende de T1)*
- [x] **T3** — Guard + superfícies QR/OCR exigindo escopo compatível
      *(depende de T2)*
- [x] **T4** — `PublicAccessModule` com GET agregado *(depende de T2)*
- [x] **T5** — `POST /user` com JwtAuthGuard + front do cadastro removido
- [x] **T6** — Página `/public-access` (lista, filtros, criação, revogação,
      one-time secret) + rota + shells *(depende de T4)*
- [x] **T7** — QR: remover dialog, botão vira link *(depende de T6)*
- [x] **T8** — Testes da Estratégia + regressão QR
- [x] **T9** — Gates: tsc/vue-tsc, boot smoke, verificação visual CDP,
      /code-review, spec Concluído + /spec-sync

---

## Considerações de Arquitetura

- **Decisão:** escopo como coluna nullable com null = total.
  **Motivo:** retrocompat absoluta com tokens de clientes em produção sem
  migração de dados.
  **Alternativa rejeitada:** tabela nova de escopos (N:N) — flexível demais
  para 2 ferramentas; e backfill obrigatório = risco em produção.
- **Decisão:** reusar `ApiTokenService`/endpoints do QR em vez de mover
  para módulo neutro.
  **Motivo:** clientes já dependem do prefixo `wfqr_` e o guard é
  compartilhado; mover renomearia superfície estável à toa. O controller
  novo agrega, não duplica.
- **Decisão:** dialog do QR morre.
  **Motivo:** "um lugar de listagem" (pedido); duas UIs de gestão = estado
  divergente e 591 linhas duplicadas.

## Plano de Rollout

**Ordem obrigatória (achado da revisão):** `start:prod` NÃO roda
`prisma migrate deploy`, e o código novo faz `select: { scope: true }` em TODA
autenticação por token. Subir o container antes do `ALTER TABLE` derruba 100%
de `/api/v1/qr` e `/api/v1/ocr` com P2022 (coluna inexistente).

- [ ] 1. Aplicar `20260731120000_api_token_scope` no banco de produção
  (coluna nullable, sem reescrita de tabela no PG 11+).
- [ ] 2. Deploy da API.
- [ ] 3. Deploy do front (a página depende do GET novo).
- [ ] 4. OPCIONAL, decisão do Nicolas: restringir tokens antigos a `scope='qr'`
  com `prisma/opcional/backfill-scope-qr.sql`. Sem isso, todo token anterior ao
  OCR também acessa `/api/v1/ocr/read` (custo de modelo por documento + acervo +
  webhook). Não é acesso cross-empresa; é least-privilege. Conferir antes se
  algum token antigo já está sendo usado no OCR.

## Plano de Rollback

- Front/API: revert do commit. Migration: coluna nullable pode FICAR no
  banco sem efeito (guard antigo a ignora) — não precisa de down-migration.

## Definition of Done

- [x] Todos os AC verificados (cada um: Atendido / Não atendido + motivo)
- [x] Testes da Estratégia passando + regressão QR verde (18 testes novos; 107
      na suíte da API)
- [x] `npx tsc --noEmit` e `vue-tsc --noEmit` limpos
- [x] Revisão adversarial em 3 frentes (segurança, regressão, front/a11y) com
      os achados de correção resolvidos. **`/code-review` propriamente dito não
      foi rodado**: é comando do Nicolas (billed), não dá para eu disparar
- [x] Fluxo exercitado: `POST /user` sem JWT → 401 na API local; página
      navegada no browser (lista, criação, WORKER redirecionado, clique do
      atalho do QR)
- [x] Spec `Concluído` + Change Log
- [ ] `/spec-sync` (sugerido ao Nicolas)

## Perguntas em Aberto

- [x] Dialog do QR morre, botão vira link — **decidido (Nicolas, 2026-07-31)**
- [x] Escopo por ferramenta QR/OCR/ambas, null = total — **decidido (Nicolas, 2026-07-31)**
- [x] Revogação criador-only regra dura; edge do criador que saiu fica
      documentado (revogação via banco) — **decidido (Nicolas, 2026-07-31)**

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-31 | 1.1 | `POST /user` endurecido de "qualquer autenticado" para **ADMIN da empresa** (decisão do Nicolas após o alerta da revisão de segurança): guard + `RequireRole(ADMIN)`, gate equivalente no botão da tela de Usuários (`isActiveCompanyAdmin`), 6 testes com guards reais. Verificado na API local: 401 sem token, 403 para WORKER, nada gravado | Claude |
| 2026-07-31 | 1.0 | Implementação completa + revisão adversarial em 3 frentes. Corrigidos: unhandled rejection na revogação, estado de erro da listagem (falha de rede lia-se como "não administra nenhuma empresa"), `aria-label`→`label` nos AppSelect (a prop errada era descartada, selects sem nome acessível), `<label>`→`<div>` nos selects (não rotulava e sequestrava o clique do hint), `aria-pressed` no filtro, `role="status"` no token revelado, botão de revogar com `aria-disabled` + toast explicativo (o `disabled` escondia o motivo), `useIsAdminAnywhere` derivando do store reativo, `reason=admin-only` no redirect, query de pastas sob demanda, select explícito sem `tokenHash` no banco + teto de 500, teste do guard de `POST /user`, docs do repo sem cadastro público. Pendências declaradas ao Nicolas: ordem migration→API no deploy, backfill opcional de escopo, `POST /user` aceita qualquer JWT (não só ADMIN) | Claude |
| 2026-07-31 | 0.2 | 3 decisões confirmadas pelo Nicolas (dialog morre; escopo QR/OCR/ambas; regra dura na revogação). Status → Em Implementação | Claude |
| 2026-07-31 | 0.1 | Criação, após research (cadastro público nas duas pontas, token sem escopo, revogação por qualquer ADMIN) | Claude |
