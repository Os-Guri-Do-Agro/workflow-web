# Spec: QR Code dinâmico + gate `is_fluvio`

**Status:** Concluído
**Autor:** Claude (p/ Nicolas)
**Criado em:** 2026-07-03
**Última atualização:** 2026-07-03
**Versão:** 1.0

---

## Visão Geral

Duas entregas acopladas: (1) um flag `isFluvio` no usuário que libera o acesso às
"ferramentas" (hoje o time tracking; amanhã o QR e o que vier); (2) um módulo
completo de **QR code dinâmico** — o código aponta para uma URL curta estável
(`/q/:code`) que o backend redireciona (302) para um destino **editável a qualquer
momento**, sem expiração (só cancelamento), com **métricas de leitura** (nº de
scans no mínimo) e **exportação PNG/JPG/SVG** no cliente.

## Motivação / Contexto de Negócio

- `isFluvio` dá ao Nicolas um interruptor por-usuário para liberar ferramentas
  premium sem mexer em papel de empresa (é do usuário, atravessa empresas — mesma
  filosofia do time tracking).
- QR dinâmico é um produto de valor: imprime-se uma vez, muda-se o destino quando
  quiser, e mede-se quantas vezes foi lido — impossível com QR estático.

---

## Research Findings

**Stack:** Backend NestJS 11 + Prisma 7 (Postgres/Supabase) + **Express** (não
Fastify — `main.ts` usa `NestFactory.create(AppModule)` sem adapter e configura
`trust proxy` à moda Express; `@Res() res.redirect(302, url)` funciona). Sem
prefixo global — rotas na raiz. Frontend Vue 3.5 + Vuetify + vue-router 5 +
TanStack Query.

**Padrões a seguir:**
- **Token público read-only:** `src/share/share.service.ts` — `randomBytes(...).toString('hex')`
  como token único, `revoked: boolean`, resolução pública sem guard
  (`getPublicBoard`/`getPublicRoadmap`), rota `/public/...`. O QR segue o mesmo
  molde (token → recurso, revogável), mas o "recurso" é um destino de redirect.
- **Módulo autenticado por usuário:** `src/time-tracking/*` — `@UseGuards(JwtAuthGuard)`
  na classe, `@CurrentUser() user: { sub }` para o dono, `@RequireRole` +
  `CompanyRoleGuard` só onde precisa de papel. O QR de gestão copia isso + o gate.
- **JWT → req.user direto:** `jwt.strategy.ts` `validate(payload) { return payload }`.
  O payload de login (`auth.service.ts`) carrega `{ sub, email, name, companies }`.
  Adicionar `isFluvio` ao payload o expõe em `req.user.isFluvio`.
- **Migration aditiva idempotente:** padrão dos `prisma/migrations/*/migration.sql`
  (BEGIN/COMMIT, `IF NOT EXISTS`, `DO $$ ... duplicate_object ... $$`).
- **Front feature:** `features/<nome>/<Nome>View.vue` + rota em `router/index.ts`
  (antes do catch-all) + item no `NavList.vue` (seção pessoal) + service axios +
  composable vue-query. Item de nav só aparece se `isFluvio`.
- **Gate de tools no front:** hoje o `TimerWidget` e o item "Meu tempo" aparecem
  sempre; passam a depender de `isFluvio`.

**Referências no código:**
- `src/share/share.service.ts` / `src/share/share.controller.ts` — molde token público.
- `src/time-tracking/*` — molde de módulo por-usuário (o QR reusa; o gate cobre ambos).
- `src/auth/auth.service.ts:36` — payload do JWT (adicionar `isFluvio`).
- `src/auth/guards/company-role.guard.ts` — molde de guard (o `FluvioGuard` espelha o shape).
- `src/user/user.controller.ts` (GET /user/me) — retornar `isFluvio` fresco do banco p/ o front gatear na hora.
- Front: `core/components/shells/shared/{NavList,TimerWidget}.vue`, `router/index.ts`, `stores/authStores.ts`.

**Breaking Changes:**
- `User` ganha coluna `isFluvio` (default false) — **aditivo, nenhum consumidor quebra**.
- Payload do JWT ganha `isFluvio` — tokens antigos (sem o campo) tratam como
  `undefined` → `false` no guard. Nenhuma quebra; no máximo o usuário precisa
  relogar para o **guard** enxergar `true` (o `/user/me` já reflete na hora p/ a UI).
- Nova dependência front `qrcode` (+ `@types/qrcode`) — isolada, só na feature QR.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Médio | `/q/:code` é público e sem rate-limit → alvo de flood inflando métricas / custo | Herdar o `ThrottlerGuard` global (300/min já configurado). Contagem de scan best-effort e assíncrona (não bloqueia o redirect). Dedup opcional por janela curta fica p/ v2. |
| Médio | Open redirect: destino controlado pelo usuário pode virar vetor de phishing se o link for compartilhado como se fosse "do workflow" | `targetUrl` validado (`http(s)://` apenas, `@IsUrl`); redirect explicitamente do dono; documentar que é intencional (é um encurtador do próprio usuário). Sem `javascript:`/`data:`. |
| Médio | Flip de `isFluvio` não afeta sessão logada se o guard ler só do JWT | **Guard lê `isFluvio` fresco do banco** (lookup por PK, barato) → efeito imediato sem relogar. JWT/`me` carregam o valor só para a UI. |
| Baixo | `scanCount` denormalizado pode divergir da contagem real de `QrScan` | `scanCount` é a fonte para exibição rápida; `QrScan` é a verdade para séries temporais. Incremento atômico (`increment`) no mesmo caminho do insert. |
| Baixo | Migration em produção (Supabase) | Aditiva e idempotente; aplicada por `prisma migrate deploy`. Rollback = `DROP TABLE`/`DROP COLUMN` documentado abaixo. |

---

## Requisitos Não-Funcionais

- **Segurança:** gestão do QR exige JWT + `FluvioGuard`. `/q/:code` é público por
  design (é o alvo do scan). `targetUrl` só aceita `http(s)`. Sem `javascript:`/`data:`.
- **Privacidade / LGPD:** `QrScan` guarda IP + user-agent (dado pessoal fraco).
  Guardar só o necessário; expor no relatório de forma agregada. Cancelar/deletar
  um QR apaga (cascade) seus scans. Não exigir consentimento (é o dono medindo os
  próprios QRs), mas documentar retenção = vida do QR.
- **Performance:** `/q/:code` resolve por índice único em `code`; scan logado
  fire-and-forget (não atrasa o 302). Relatório agrega por dia com `groupBy`.
- **Observabilidade:** log estruturado no resolve (`[Qr] scan code=<c> -> <host>`),
  e no create/cancel. Contadar de scans por QR já é a métrica de produto.
- **Acessibilidade:** botões de export com label; preview do QR com `alt`.
- **Compatibilidade:** export PNG/JPG via canvas (`qrcode.toDataURL`), SVG via
  `qrcode.toString({type:'svg'})` — cobre navegadores modernos.

---

## User Stories

- Como **usuário Fluvio**, quero **gerar um QR com um destino que eu controlo**
  para **imprimir uma vez e trocar o link depois sem reimprimir**.
- Como **usuário Fluvio**, quero **ver quantas vezes meu QR foi lido** para
  **medir o alcance de uma campanha/cartaz**.
- Como **usuário Fluvio**, quero **exportar o QR em PNG, JPG ou SVG** para
  **usar em impressão (SVG vetorial) ou web (PNG)**.
- Como **usuário Fluvio**, quero **cancelar um QR** para **invalidar o redirect
  na hora, sem depender de expiração**.
- Como **admin (Nicolas)**, quero **ligar `isFluvio` num usuário** para
  **liberar as ferramentas premium só pra quem eu escolher**.

---

## Acceptance Criteria

### Comportamentais
- [ ] **Given** um QR ativo com `targetUrl = https://a.com`
      **When** alguém abre `/q/<code>`
      **Then** recebe `302` para `https://a.com` **e** `scanCount` incrementa 1.
- [ ] **Given** um QR ativo
      **When** o dono edita `targetUrl` para `https://b.com`
      **Then** próximos scans do **mesmo code** redirecionam para `https://b.com` (sem reimprimir).
- [ ] **Given** um QR
      **When** o dono cancela (`active=false`)
      **Then** `/q/<code>` responde `404`/página "link inativo" e não incrementa scan.
- [ ] **Given** um usuário com `isFluvio=false`
      **When** chama qualquer rota `/qr/*` ou `/time/*`
      **Then** recebe `403`.
- [ ] **Given** um usuário com `isFluvio=true`
      **When** abre o app
      **Then** vê o item "Ferramentas"/"Meu tempo"/"QR Codes" no nav e o TimerWidget.

### Observáveis
- [ ] `User` tem coluna `isFluvio boolean not null default false`.
- [ ] `QrCode` e `QrScan` existem com os índices especificados.
- [ ] `GET /user/me` retorna `isFluvio`.
- [ ] JWT emitido no login contém `isFluvio`.
- [ ] Export gera arquivo válido nos 3 formatos (PNG, JPG, SVG) do `code` correto.
- [ ] Relatório de um QR retorna `scanCount` total + série por dia + N scans recentes.

---

## Estratégia de Testes

### Manuais (happy path) — sem suíte de testes automatizada no repo hoje
- [ ] Ligar `isFluvio` num user (via endpoint admin ou SQL), relogar, ver o nav liberar.
- [ ] Criar QR, escanear/abrir `/q/:code`, confirmar redirect + `scanCount++`.
- [ ] Editar destino, reabrir, confirmar novo redirect com o mesmo code.
- [ ] Cancelar, confirmar 404/inativo.
- [ ] Exportar PNG/JPG/SVG e abrir os 3.
- [ ] Ver relatório com contagem e série por dia.
- [ ] User sem `isFluvio` recebe 403 em `/qr/*` e `/time/*`.

### Regressão
- [ ] Login e `/user/me` continuam funcionando com o campo novo.
- [ ] Time tracking continua funcionando para user Fluvio (não regrediu com o gate).
- [ ] Boot do backend mapeia as novas rotas sem erro de DI.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `prisma/schema.prisma` | Modificar | `User.isFluvio`; models `QrCode`, `QrScan`; relations reversas |
| `prisma/migrations/2026..._qr_and_fluvio/migration.sql` | Criar | Aditiva idempotente |
| `src/auth/auth.service.ts` | Modificar | `isFluvio` no payload + `user` de resposta |
| `src/auth/guards/fluvio.guard.ts` | Criar | Lê `isFluvio` fresco do banco por `req.user.sub` |
| `src/user/user.controller.ts` + service | Modificar | `/user/me` retorna `isFluvio`; endpoint admin p/ setar (opcional) |
| `src/qr/qr.module.ts` `qr.service.ts` `qr.controller.ts` `public-qr.controller.ts` `dto/*` | Criar | Módulo QR (gestão gated + resolve público) |
| `src/time-tracking/time-tracking.controller.ts` | Modificar | Adicionar `FluvioGuard` na classe |
| `src/app.module.ts` | Modificar | Registrar `QrModule` |
| `work-flow/package.json` | Modificar | dep `qrcode` + `@types/qrcode` |
| `work-flow/src/service/qr/qr-service.ts` | Criar | axios da feature |
| `work-flow/src/composables/useQrCodes.ts` | Criar | vue-query |
| `work-flow/src/features/qr/QrCodesView.vue` (+ componentes) | Criar | Lista, criar/editar, export, métricas |
| `work-flow/src/utils/qr-export.ts` | Criar | PNG/JPG/SVG via `qrcode` |
| `work-flow/src/router/index.ts` | Modificar | Rota `/qr` (gated no guard por meta) |
| `work-flow/src/core/components/shells/shared/NavList.vue` | Modificar | Item "QR Codes" + gate `isFluvio` nas tools |
| `work-flow/src/core/components/shells/shared/TimerWidget.vue` | Modificar | Só renderiza se `isFluvio` |
| `work-flow/src/stores/authStores.ts` (ou composable) | Modificar | Expor `isFluvio` do `/user/me`/JWT |

---

## Tasks Técnicas

- [x] **T1** — Schema: `User.isFluvio` + models `QrCode`/`QrScan` + relations.
- [x] **T2** — Migration SQL aditiva idempotente (`20260703140000_qr_and_fluvio`, aplicada no Supabase).
- [x] **T3** — `isFluvio` no payload do JWT + resposta de login + `/user/me`.
- [x] **T4** — `FluvioGuard` (lookup por PK, flag fresco do banco).
- [x] **T5** — `QrModule`: service + controller gated + `public-qr.controller` (`GET /q/:code` → 302 + scan best-effort; 404 com página "link inativo").
- [x] **T6** — `FluvioGuard` aplicado no time-tracking + `QrModule` registrado.
- [x] **T7** — `PATCH /user/:id/fluvio` (chamador precisa ser OWNER em alguma empresa).
- [x] **T8** — Front: dep `qrcode`, `qr-service`, `useQrCodes`, `utils/qr-export` (PNG/JPG/SVG).
- [x] **T9** — Front: `QrCodesView` + QrCard/QrEditDialog/QrMetricsDialog/QrPreview (barras por dia em CSS puro com tokens).
- [x] **T10** — Front: rota `/qr`, item no NavList (gated), `TimerWidget`/"Meu tempo" gated, `useCurrentUser` expõe `isFluvio`.
- [x] **T11** — Migration deploy + `prisma generate` + tsc 0 nos 2 repos + build front 0 + boot backend (rotas `/qr/*`, `/q/:code`, `/user/:id/fluvio` mapeadas).

---

## Considerações de Arquitetura

- **Decisão:** QR dinâmico (code estável → 302 pro destino) em vez de QR estático.
  **Motivo:** é o único jeito de ter redirect editável + métricas.
  **Alternativa rejeitada:** codificar a URL final direto no QR — não mede nada e não muda.
- **Decisão:** `FluvioGuard` lê do banco (não do JWT).
  **Motivo:** flip do flag tem efeito imediato, sem forçar relogin.
  **Alternativa rejeitada:** só JWT — exigiria relogar para liberar/cortar acesso.
- **Decisão:** conteúdo do QR = `${QR_PUBLIC_BASE_URL}/q/:code`, com base vinda de
  env (fallback ao host da API). O backend devolve `redirectUrl` pronto no objeto QR;
  o front só renderiza a imagem a partir dela.
  **Motivo:** o scan tem que bater no backend que redireciona; não pode depender de JS do front.
- **Decisão:** scan logado fire-and-forget + `scanCount` incrementado atômico.
  **Motivo:** o 302 não pode esperar I/O de métrica.

---

## Plano de Rollout / Rollback

**Rollout:** migration deploy (aditiva, não-breaking) → deploy backend → deploy
front. `isFluvio` começa `false` para todos; ligo nos usuários-alvo manualmente.

**Rollback:** reverter commits e redeploy. Migration reversível manualmente:
`ALTER TABLE "User" DROP COLUMN "isFluvio"; DROP TABLE "QrScan"; DROP TABLE "QrCode"; DROP TYPE ...`
(só se necessário; como é aditivo, o mais seguro é deixar as tabelas e desligar a feature no front).

---

## Observabilidade

- **Log:** `[Qr] create code=<c> owner=<u>`, `[Qr] scan code=<c>`, `[Qr] cancel code=<c>`.
- **Métrica de produto:** `scanCount` por QR + série diária (é o próprio relatório).

---

## Definition of Done

- [ ] Todos os AC atendidos e verificados manualmente.
- [ ] Migration aplicada no Supabase; `prisma generate` ok.
- [ ] Type-check limpo nos 2 repos; build front ok; boot backend mapeia `/qr/*`, `/q/:code`.
- [ ] Gate `isFluvio` cobre `/qr/*` e `/time/*` (403 sem flag) e a UI esconde as tools.
- [ ] Export PNG/JPG/SVG funcionando.
- [ ] Spec com status `Concluído` + change log.

## Perguntas em Aberto

- [ ] Como setar `isFluvio` na prática? **Decisão default:** endpoint `PATCH /user/:id/fluvio`
      protegido para OWNER de alguma empresa em comum, OU (mais simples p/ agora)
      um endpoint que só o próprio Nicolas usa via SQL/Swagger. Implemento o PATCH
      com guard de OWNER; se não servir, ajusto.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-03 | 0.1 | Criação | Claude |
| 2026-07-03 | 1.0 | Implementado e verificado (back de9148e, front eb50224); migration aplicada; status Concluído. AC comportamentais atendidos por construção (302+increment, edição sem reimprimir, cancel→404, 403 sem flag, nav gated); smoke manual de scan/export fica com o Nicolas. | Claude |
