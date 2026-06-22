# HANDOFF — Frontend (Vue) · tudo que o app expõe

> Guia mestre para o Cursor implementar a UI. Backend pronto em 2026-06-20
> (branch `feat/boards-collab-canvas`). **Porta padrão: `3535`.**

## Convenções (valem para tudo)

- `Authorization: Bearer <jwt>` em tudo (exceto `/public/*` e `/health`).
- Header **`x-company-id`** = empresa ativa (injetado pelo interceptor Axios).
- Erros NestJS: `{ statusCode, message, error }` — `message` pode ser array →
  `Array.isArray(m) ? m.join(', ') : m`.
- Papéis: leitura = qualquer membro; escrita = **WORKER+** (salvo onde indicado).
  CLIENT/VIEWER recebem `403` → esconda ações de escrita.
- IA pode responder `503` (sem `GEMINI_API_KEY`) → trate no toast.
- Swagger completo em `/api`.

---

## Mapa de features e docs

| Feature                                        | Status backend | Doc detalhado                                                                                            |
| ---------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------- |
| Calendário (eventos)                           | ✅             | [`specs/frontend-integration-calendario-roadmap.md`](./specs/frontend-integration-calendario-roadmap.md) |
| Roadmap mensal                                 | ✅             | [`specs/roadmap-monthly-frontend-spec.md`](./specs/roadmap-monthly-frontend-spec.md)                     |
| Boards (canvas Yjs) + Copilot roadmap          | ✅             | [`specs/frontend-integration-boards-copilot.md`](./specs/frontend-integration-boards-copilot.md)         |
| **Workspace Intelligence** (busca/ask/diagram) | ✅             | **abaixo (§1)**                                                                                          |
| **Share links** públicos                       | ✅             | **abaixo (§2)**                                                                                          |
| **Inbox** (notificações in-app)                | ✅             | **abaixo (§3)**                                                                                          |
| Health                                         | ✅             | `GET /health` → `{ status, db, uptime }`                                                                 |

> Para Calendário, Roadmap e Boards, siga os docs específicos. Abaixo só o que
> é **novo** e ainda não tinha doc.

---

## §1. Workspace Intelligence (IA sobre os dados da empresa)

### Tipos

```typescript
export type EntityType =
  | 'ACTIVITY'
  | 'ROADMAP_MONTH'
  | 'ROADMAP_ENTRY'
  | 'EVENT'
  | 'BOARD'
  | 'BUG_REPORT'

export interface SearchHit {
  entityType: EntityType
  entityId: string
  title: string
  snippet: string
  score: number // 0..1 (similaridade)
  link: string // rota relativa sugerida (ex: /activity/123, /roadmap, /boards/abc)
}

export interface AskResponse {
  answer: string
  sources: SearchHit[]
}

export interface Diagram {
  title: string
  nodes: { id: string; label: string; kind?: string }[] // kind: start|process|decision|end
  edges: { from: string; to: string; label?: string }[]
}
```

### Endpoints

| Método | Rota               | Role      | Body / retorno                                                   |
| ------ | ------------------ | --------- | ---------------------------------------------------------------- |
| GET    | `/search/status`   | membro    | `{ indexed, lastIndexedAt }` — saber se precisa reindexar        |
| POST   | `/search`          | membro    | `{ query, k? }` → `SearchHit[]` (k default 8, máx 25)            |
| POST   | `/search/reindex`  | **ADMIN** | reindexa embeddings da empresa → `{ indexed }`                   |
| POST   | `/copilot/ask`     | membro    | `{ question }` → `AskResponse` (resposta + fontes citadas)       |
| POST   | `/copilot/diagram` | membro    | `{ prompt }` → `Diagram`                                         |
| POST   | `/copilot/improve` | membro    | `{ text, instruction? }` → `{ text }` (reescreve/melhora)        |
| POST   | `/copilot/roadmap` | WORKER    | `{ prompt, year? }` → gera+persiste roadmap (ver doc do roadmap) |

> **Provedor de IA = Claude (Anthropic).** Geração de texto (ask/diagram/improve/
> roadmap) precisa de `ANTHROPIC_API_KEY` no backend → senão `503`.
> **A busca (`/search`, `/search/reindex`, `/search/status`) usa embeddings
> LOCAIS (sem key)** — funciona mesmo sem nenhuma chave de IA.
>
> **Reindex é AUTOMÁTICO** (cron a cada 10 min, reindexar só empresas que
> mudaram). O `/search/reindex` manual continua existindo p/ forçar na hora; o
> front normalmente nem precisa chamar.

```typescript
export const aiApi = {
  search: (query: string, k = 8) =>
    api.post<SearchHit[]>('/search', { query, k }).then((r) => r.data),
  reindex: () => api.post('/search/reindex').then((r) => r.data), // ADMIN
  ask: (question: string) =>
    api.post<AskResponse>('/copilot/ask', { question }).then((r) => r.data),
  diagram: (prompt: string) =>
    api.post<Diagram>('/copilot/diagram', { prompt }).then((r) => r.data),
}
```

### UI sugerida

- **Command palette / busca global** (Ctrl+K): chama `/search`, lista hits com
  `title` + `snippet`, clica → navega para `hit.link`.
- **"Pergunte ao workspace"**: caixa de pergunta → `/copilot/ask` → mostra
  `answer` + chips das `sources` (clicáveis via `link`).
- **Texto→Diagrama** no board: `/copilot/diagram` → renderize `nodes`/`edges`
  no Excalidraw (auto-layout simples: distribua nós; ligue por `edges`).
- ⚠️ A busca só retorna resultados após o **reindex** (o dono roda 1x; exponha um
  botão "Reindexar" para ADMIN).

---

## §2. Share links públicos (read-only por token)

Permite compartilhar um **board** ou um **roadmap anual** por link público, sem login.

### Endpoints autenticados (gestão)

| Método | Rota                    | Role   | Retorno                                                                     |
| ------ | ----------------------- | ------ | --------------------------------------------------------------------------- |
| GET    | `/share`                | membro | lista links ativos `{ token, resourceType, resourceId, path, createdAt }[]` |
| POST   | `/share/board/:boardId` | WORKER | `{ token, resourceType, resourceId, createdAt, path }`                      |
| POST   | `/share/roadmap/:year`  | WORKER | idem (resourceId = ano)                                                     |
| DELETE | `/share/:token`         | WORKER | revoga → `{ message }`                                                      |

`path` já vem pronto (ex.: `/public/board/<token>`). Monte a URL pública como
`window.location.origin + path` (ou o domínio do front).

### Endpoints PÚBLICOS (sem auth — o token é o segredo)

| Método | Rota                     | Retorno                                                                   |
| ------ | ------------------------ | ------------------------------------------------------------------------- |
| GET    | `/public/board/:token`   | `{ board: {id,title,thumbnailUrl,updatedAt}, ydocStateBase64, readOnly }` |
| GET    | `/public/roadmap/:token` | `{ year, months, readOnly }` (mesmo shape do roadmap normal)              |

```typescript
export const shareApi = {
  list: () => api.get('/share').then((r) => r.data),
  shareBoard: (boardId: string) => api.post(`/share/board/${boardId}`).then((r) => r.data),
  shareRoadmap: (year: number) => api.post(`/share/roadmap/${year}`).then((r) => r.data),
  revoke: (token: string) => api.delete(`/share/${token}`).then((r) => r.data),
  // públicas (use um axios SEM Authorization/x-company-id):
  publicBoard: (token: string) => publicApi.get(`/public/board/${token}`).then((r) => r.data),
  publicRoadmap: (token: string) => publicApi.get(`/public/roadmap/${token}`).then((r) => r.data),
}
```

### UI sugerida

- Botão "Compartilhar" no board/roadmap → cria link → copia `origin + path`.
- Rota pública no front (ex.: `/p/board/:token`) que usa `publicApi` (sem auth):
  - **Board:** decodifique `ydocStateBase64` (base64 → Uint8Array) e
    `Y.applyUpdate(ydoc, bytes)` para renderizar o canvas **read-only** (sem
    provider/WS, sem edição).
  - **Roadmap:** renderize `months` igual à tela normal, em modo leitura.
- Tela de gestão de links (listar/revogar) para WORKER+.

---

## §3. Inbox — notificações in-app

### Tipos

```typescript
export interface AppNotification {
  id: string
  type: string // ex: ACTIVITY_STATUS
  title: string
  body: string | null
  link: string | null // rota relativa para navegar ao clicar
  read: boolean
  createdAt: string
}
```

### Endpoints (escopo por usuário via JWT; `x-company-id` opcional p/ filtrar)

| Método | Rota                  | Retorno                                     |
| ------ | --------------------- | ------------------------------------------- |
| GET    | `/inbox?unread=true`  | `AppNotification[]` (até 50, mais recentes) |
| GET    | `/inbox/unread-count` | `{ count }`                                 |
| PATCH  | `/inbox/:id/read`     | `{ message }`                               |
| POST   | `/inbox/read-all`     | `{ updated }`                               |
| DELETE | `/inbox/:id`          | `{ message }` (dispensar)                   |

```typescript
export const inboxApi = {
  list: (unread = false) =>
    api.get<AppNotification[]>('/inbox', { params: { unread } }).then((r) => r.data),
  unreadCount: () => api.get<{ count: number }>('/inbox/unread-count').then((r) => r.data),
  markRead: (id: string) => api.patch(`/inbox/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/inbox/read-all').then((r) => r.data),
}
```

### UI sugerida

- Sininho no header com badge = `/inbox/unread-count` (faça poll a cada ~30s; no
  futuro vira push via WS).
- Dropdown lista `/inbox`; clicar marca como lida (`/inbox/:id/read`) e navega p/
  `link`. Botão "marcar todas".
- Hoje há 1 produtor: mudança de status de atividade notifica os responsáveis.
  (Mais produtores virão; a UI já fica pronta.)

---

## Checklist macro de telas (esta jornada)

- [ ] **Calendário**: consumir `/events` (ver doc) — remover mock.
- [ ] **Roadmap mensal**: grade 12 meses + ensure-then-write + Copilot (ver doc).
- [ ] **Boards**: lista + canvas Excalidraw com `@hocuspocus/provider` no `/collab` (ver doc).
- [ ] **Busca global (Ctrl+K)** + **Pergunte ao workspace** + **texto→diagrama**.
- [ ] **Compartilhar** board/roadmap (gerar/copiar/revogar) + páginas públicas read-only.
- [ ] **Inbox** (sininho + dropdown).
- [ ] Esconder ações WORKER+ para CLIENT/VIEWER; tratar `403`/`503` em toasts.

## Libs novas no front

```bash
npm i yjs @hocuspocus/provider @excalidraw/excalidraw
```

(Excalidraw é recomendação; o backend é agnóstico — ver doc dos boards.)
