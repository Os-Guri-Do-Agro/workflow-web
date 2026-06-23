Frontend Spec — Workflow (completo, de um todo)

> **Spec única e self-contained** para o frontend (Vue) implementar TUDO que o
> backend passou a oferecer nesta jornada. Substitui/atualiza o handoff anterior.
> Backend: NestJS, branch `main`, **porta `3535`**. Cole este doc inteiro no Cursor.
>
> Features cobertas: Calendário, Roadmap mensal, **Boards (canvas Yjs realtime)**,
> **Workspace Intelligence (busca/IA)**, **Share links públicos**, **Inbox**,
> **Colaboração (comentários/menções/reações/feed/digest)**, Health.

---

## 0. Convenções globais (valem para TODAS as chamadas)

- **Base URL:** `${VITE_API_URL}` (ex.: `http://localhost:3535`).
- **Auth:** `Authorization: Bearer <jwt>` em tudo, exceto `GET /public/*` e `GET /health`.
- **Empresa ativa:** header **`x-company-id: <companyId>`** (interceptor Axios).
  - Obrigatório em: roadmap, boards, search, copilot, share (gestão), comments, feed.
  - Opcional em: events (presente = eventos da empresa; ausente = pessoais), inbox (filtra).
- **Papéis (CompanyRole):** `OWNER > ADMIN > WORKER > CLIENT > VIEWER`.
  - Leitura: qualquer membro. Escrita: **WORKER+** (salvo exceções marcadas).
  - Sem permissão → `403`: **esconda/disable** os controles de escrita.
- **Erros (padrão NestJS):** `{ statusCode, message, error }`. `message` pode ser
  array → exibir `Array.isArray(m) ? m.join(', ') : m`.
- **IA:** provedor = **Claude (Anthropic)**. Endpoints de IA respondem **`503`** se
  faltar a key no backend → trate no toast (a feature não-IA continua funcionando).
- **Swagger** (referência viva): `GET /api`.

### Setup base do Axios (sugestão)

```typescript
import axios from 'axios'
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL })
api.interceptors.request.use((cfg) => {
  const token = auth.getToken()
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  const companyId = company.activeId()
  if (companyId) cfg.headers['x-company-id'] = companyId
  return cfg
})
// cliente SEM auth, só para /public/*
export const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL })
```

### Libs novas no frontend

```bash
npm i yjs @hocuspocus/provider @excalidraw/excalidraw
```

---

## 1. Calendário — `/events` (escopo híbrido)

Mesmo endpoint serve eventos **da empresa** (com `x-company-id`) ou **pessoais**
(sem header). A tela `/calendar` deve enviar `x-company-id`.

```typescript
export type EventType =
  | 'MEETING'
  | 'DEADLINE'
  | 'REMINDER'
  | 'SPRINT'
  | 'RETROSPECTIVE'
  | 'TASK'
  | 'PERSONAL'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  startDate: string // ISO UTC
  endDate: string | null
  type: EventType
  recurrence: string | null // só armazenado (não expandido no backend)
  createdById: string
  companyId: string | null // null = pessoal
  activityId: string | null
  attendees: string[]
  googleEventId: string | null
  meetLink: string | null
  createdAt: string
  updatedAt: string
  activity?: { id: string; title: string } | null
}
export type CreateEventInput = {
  title: string
  startDate: string
  type: EventType
  description?: string
  endDate?: string | null
  recurrence?: string | null
  activityId?: string | null
  attendees?: string[]
}
export type UpdateEventInput = Partial<CreateEventInput>
```

| Método | Rota                        | Notas                                                |
| ------ | --------------------------- | ---------------------------------------------------- |
| GET    | `/events?start=ISO&end=ISO` | lista no intervalo (ordenado por `startDate`)        |
| GET    | `/events/upcoming?limit=N`  | próximos (default 5): só `{id,title,startDate,type}` |
| GET    | `/events/:id`               | um evento (com `activity`)                           |
| POST   | `/events`                   | cria → evento criado                                 |
| PATCH  | `/events/:id`               | atualiza parcial                                     |
| DELETE | `/events/:id`               | remove                                               |

> Eventos **pessoais** (sem `x-company-id`) tentam espelhar no Google Calendar do
> usuário (best-effort). Eventos de empresa não tocam o Google.

---

## 2. Roadmap Mensal — `/roadmap/monthly` (x-company-id obrigatório)

```typescript
export type RoadmapCategory = 'milestone' | 'meeting' | 'delivery' | 'recording' | 'note' | 'risk'
export interface RoadmapFocus {
  id: string
  text: string
  order: number
}
export interface RoadmapPhoto {
  id: string
  url: string
  fileName: string
  contentType: string
  size: number
}
export interface RoadmapEntry {
  id: string
  date: string
  title: string
  description: string | null
  category: RoadmapCategory
  source: string
}
export interface RoadmapMonth {
  id: string | null // null = mês NÃO persistido (vazio)
  key: string // "YYYY-MM"
  year: number
  month: number // month zero-based 0–11
  title: string
  main: string
  order: number
  persisted: boolean
  focusItems: RoadmapFocus[]
  photos: RoadmapPhoto[]
  entries: RoadmapEntry[]
}
export interface RoadmapYearResponse {
  year: number
  months: RoadmapMonth[]
} // SEMPRE 12
```

| Método       | Rota                                | Role   | Notas                                                                            |
| ------------ | ----------------------------------- | ------ | -------------------------------------------------------------------------------- |
| GET          | `/roadmap/monthly?year=2026`        | membro | **sempre 12 meses** (vazios com `id:null`, `persisted:false`)                    |
| POST         | `/roadmap/monthly`                  | WORKER | **get-or-create idempotente** `{key,year,month,title?,main?,order?}`; não dá 409 |
| PATCH        | `/roadmap/monthly/:monthId`         | WORKER | `{title?,main?,order?}`                                                          |
| DELETE       | `/roadmap/monthly/:monthId`         | WORKER | cascata                                                                          |
| POST         | `/roadmap/monthly/:monthId/focus`   | WORKER | `{text,order?}`                                                                  |
| PATCH/DELETE | `.../focus/:focusId`                | WORKER |                                                                                  |
| POST         | `/roadmap/monthly/:monthId/photos`  | WORKER | multipart campo **`files`** (img, máx 5 MB)                                      |
| DELETE       | `.../photos/:photoId`               | WORKER |                                                                                  |
| POST         | `/roadmap/monthly/:monthId/entries` | WORKER | `{date(YYYY-MM-DD),title,description?,category,source?}`                         |
| PATCH/DELETE | `.../entries/:entryId`              | WORKER |                                                                                  |

> **Não existe "criar mês" manual.** O GET já traz os 12. Ao adicionar conteúdo
> num mês `id:null`, faça **ensure-then-write**: chame `POST /roadmap/monthly`
> (idempotente) p/ obter o `id` real, depois adicione foco/entry/foto.
> "Anotação rápida" = entry com `category:"note"`, `source:"quick_note"`.

---

## 3. Boards — canvas colaborativo (Yjs realtime)

REST cuida só dos **metadados**; o **conteúdo do canvas** trafega via WebSocket Yjs.

```typescript
export interface BoardMeta {
  id: string
  companyId: string
  title: string
  createdById: string
  thumbnailUrl: string | null
  createdAt: string
  updatedAt: string
}
```

| Método | Rota                    | Role   | Notas                                                    |
| ------ | ----------------------- | ------ | -------------------------------------------------------- |
| GET    | `/boards`               | membro | lista (sem conteúdo Yjs)                                 |
| POST   | `/boards`               | WORKER | `{title?}`                                               |
| GET    | `/boards/:id`           | membro | metadados                                                |
| GET    | `/boards/:id/snapshot`  | membro | `{id,title,ydocStateBase64}` p/ preview read-only sem WS |
| PATCH  | `/boards/:id`           | WORKER | `{title?,thumbnailUrl?}`                                 |
| POST   | `/boards/:id/duplicate` | WORKER | copia o canvas                                           |
| DELETE | `/boards/:id`           | WORKER |                                                          |
| POST   | `/boards/:id/thumbnail` | WORKER | multipart campo `file`                                   |

### Realtime (multiplayer) — `@hocuspocus/provider`

```typescript
import * as Y from 'yjs'
import { HocuspocusProvider } from '@hocuspocus/provider'

function connectBoard(boardId: string, jwt: string) {
  const ydoc = new Y.Doc()
  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws'
  const provider = new HocuspocusProvider({
    url: `${wsProto}://${location.host}/collab`, // mesmo host/porta do HTTP
    name: boardId, // documento Yjs = id do board
    token: jwt, // MESMO JWT do Bearer; backend valida empresa+membership
    document: ydoc,
  })
  provider.on('authenticationFailed', ({ reason }) => {
    /* sem acesso/expirado */
  })
  return { ydoc, provider }
}
```

- **Cursores/presença:** `provider.awareness` (setLocalStateField('user', {...}) +
  observar `change`).
- **Excalidraw (recomendado):** use um shared type Yjs (`ydoc.getArray('elements')`,
  `getMap('files')`) como fonte da verdade; no `onChange` escreve no Yjs, no
  observador do Yjs chama `updateScene`. O backend é **agnóstico de lib** (só
  sincroniza o `Y.Doc`), então tldraw também funciona.
- **Persistência automática** no backend (debounce) — reabrir o board recarrega o estado.
- **Estados:** `provider.on('status'|'synced'|'authenticationFailed', ...)`; reconexão é automática.
- **Read-only público:** use `/public/board/:token` (§6) + `Y.applyUpdate(ydoc, bytes)` do base64.

---

## 4. Workspace Intelligence (busca + IA)

```typescript
export type SearchEntityType =
  | 'ACTIVITY'
  | 'ROADMAP_MONTH'
  | 'ROADMAP_ENTRY'
  | 'EVENT'
  | 'BOARD'
  | 'BUG_REPORT'
export interface SearchHit {
  entityType: SearchEntityType
  entityId: string
  title: string
  snippet: string
  score: number
  link: string // link relativo sugerido
}
export interface AskResponse {
  answer: string
  sources: SearchHit[]
}
export interface Diagram {
  title: string
  nodes: { id: string; label: string; kind?: string }[] // start|process|decision|end
  edges: { from: string; to: string; label?: string }[]
}
```

| Método | Rota               | Role   | Body / retorno                                                         |
| ------ | ------------------ | ------ | ---------------------------------------------------------------------- |
| GET    | `/search/status`   | membro | `{ indexed, lastIndexedAt }`                                           |
| POST   | `/search`          | membro | `{ query, k? }` → `SearchHit[]` (keyless, embeddings locais)           |
| POST   | `/search/reindex`  | ADMIN  | força reindex → `{ indexed }` (normalmente nem precisa)                |
| POST   | `/copilot/ask`     | membro | `{ question }` → `AskResponse` (RAG + fontes)                          |
| POST   | `/copilot/diagram` | membro | `{ prompt }` → `Diagram`                                               |
| POST   | `/copilot/improve` | membro | `{ text, instruction? }` → `{ text }`                                  |
| POST   | `/copilot/roadmap` | WORKER | `{ prompt, year? }` → gera+persiste roadmap (retorno = §2 + `summary`) |

> Busca usa **embeddings locais (sem key)** e **reindex é automático** (cron 10
> min). IA de texto (ask/diagram/improve/roadmap) usa **Claude** → `503` sem key.

### UX sugerida

- **Command palette (Ctrl+K)** → `/search` → resultados com `title`+`snippet`,
  clicar navega para `hit.link`.
- **"Pergunte ao workspace"** → `/copilot/ask` → `answer` + chips de `sources`.
- **Texto→Diagrama** no board → `/copilot/diagram` → renderizar `nodes`/`edges`.
- **Botão "melhorar texto"** em editores → `/copilot/improve`.

---

## 5. Inbox — notificações in-app

```typescript
export interface AppNotification {
  id: string
  type: string // ACTIVITY_STATUS | COMMENT_MENTION | ...
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: string
}
```

| Método | Rota                  | Retorno                      |
| ------ | --------------------- | ---------------------------- |
| GET    | `/inbox?unread=true`  | `AppNotification[]` (até 50) |
| GET    | `/inbox/unread-count` | `{ count }`                  |
| PATCH  | `/inbox/:id/read`     | `{ message }`                |
| POST   | `/inbox/read-all`     | `{ updated }`                |
| DELETE | `/inbox/:id`          | `{ message }` (dispensar)    |

UX: sininho no header com badge (`unread-count`, poll ~30s); dropdown lista
`/inbox`; clicar marca lida + navega p/ `link`.

---

## 6. Share links públicos (read-only)

| Método | Rota                     | Role         | Retorno                                                                  |
| ------ | ------------------------ | ------------ | ------------------------------------------------------------------------ |
| GET    | `/share`                 | membro       | links ativos `{token,resourceType,resourceId,path,createdAt}[]`          |
| POST   | `/share/board/:boardId`  | WORKER       | `{token, path, ...}` (`path` = `/public/board/<token>`)                  |
| POST   | `/share/roadmap/:year`   | WORKER       | idem (`/public/roadmap/<token>`)                                         |
| DELETE | `/share/:token`          | WORKER       | revoga                                                                   |
| GET    | `/public/board/:token`   | **sem auth** | `{ board:{id,title,thumbnailUrl,updatedAt}, ydocStateBase64, readOnly }` |
| GET    | `/public/roadmap/:token` | **sem auth** | `{ year, months, readOnly }`                                             |

UX: botão "Compartilhar" → cria link → copia `origin + path`. Página pública
(`publicApi`, sem auth): board → decodifica `ydocStateBase64` (base64→Uint8Array)
e `Y.applyUpdate` p/ render read-only (sem provider/WS); roadmap → render leitura.

---

## 7. Colaboração — comentários, menções, reações, feed, digest

```typescript
export type CommentEntityType = 'ACTIVITY' | 'BOARD' | 'BUG_REPORT' | 'ROADMAP_MONTH'
export interface Comment {
  id: string
  companyId: string
  entityType: CommentEntityType
  entityId: string
  authorId: string
  body: string
  mentions: string[]
  createdAt: string
  updatedAt: string
  reactions: { id: string; userId: string; emoji: string }[]
}
export interface FeedEvent {
  id: string
  actorId: string
  verb: 'created' | 'updated' | 'status_changed' | 'commented' | 'shared'
  entityType: string
  entityId: string
  summary: string
  createdAt: string
}
```

| Método | Rota                              | Quem      | Body                                                    |
| ------ | --------------------------------- | --------- | ------------------------------------------------------- |
| GET    | `/comments?entityType=&entityId=` | membro    | → `Comment[]`                                           |
| POST   | `/comments`                       | membro    | `{ entityType, entityId, body, mentions? }`             |
| PATCH  | `/comments/:id`                   | **autor** | `{ body }`                                              |
| DELETE | `/comments/:id`                   | **autor** | —                                                       |
| POST   | `/comments/:id/reactions`         | membro    | `{ emoji }`                                             |
| DELETE | `/comments/:id/reactions/:emoji`  | membro    | —                                                       |
| GET    | `/feed?take=50`                   | membro    | `FeedEvent[]`                                           |
| POST   | `/copilot/digest`                 | membro    | `{ days? }` → `{ summary, events }` (resumo IA do feed) |

- **@menção:** `mentions: [userId]` → cada mencionado recebe notificação no Inbox
  (`type: COMMENT_MENTION`, com `link`).
- **Reações:** agrupe por `emoji` (ex.: 👍 3); toggle = POST/DELETE.
- **Feed:** alimentado sozinho (criar board, mudar status, comentar) → timeline no dashboard.
- **Digest:** on-demand ("resumo da semana") → `summary` (markdown) + `events` (contagem).

---

## 8. Health

`GET /health` (sem auth) → `{ status, db, uptime, timestamp }`. Use em monitor/status page.

---

## 9. Catálogo rápido de endpoints (resumo)

```
Eventos:   GET/POST /events · GET /events/upcoming · GET/PATCH/DELETE /events/:id
Roadmap:   GET/POST /roadmap/monthly · PATCH/DELETE /roadmap/monthly/:id
           POST/PATCH/DELETE .../:id/focus|entries · POST/DELETE .../:id/photos
Boards:    GET/POST /boards · GET/PATCH/DELETE /boards/:id
           GET /boards/:id/snapshot · POST /boards/:id/duplicate · POST /boards/:id/thumbnail
           WS  /collab  (HocuspocusProvider name=boardId token=jwt)
Search/IA: GET /search/status · POST /search · POST /search/reindex(ADMIN)
           POST /copilot/ask|diagram|improve|digest · POST /copilot/roadmap(WORKER)
Share:     GET /share · POST /share/board/:id · POST /share/roadmap/:year · DELETE /share/:token
Público:   GET /public/board/:token · GET /public/roadmap/:token   (sem auth)
Inbox:     GET /inbox · GET /inbox/unread-count · PATCH /inbox/:id/read · POST /inbox/read-all · DELETE /inbox/:id
Colab:     GET/POST /comments · PATCH/DELETE /comments/:id · POST/DELETE /comments/:id/reactions[/:emoji]
           GET /feed
Health:    GET /health
```

---

## 10. Checklist macro de telas

- [ ] **Calendário** consumindo `/events` (remover mock) + tipos TASK/PERSONAL.
- [ ] **Roadmap mensal**: grade 12 meses do GET + ensure-then-write + upload de fotos + Copilot.
- [ ] **Boards**: lista (cards c/ thumbnail) + canvas Excalidraw via `@hocuspocus/provider` + cursores + duplicar + compartilhar.
- [ ] **Busca global (Ctrl+K)** + **Pergunte ao workspace** + **texto→diagrama** + **melhorar texto**.
- [ ] **Compartilhar** board/roadmap + páginas públicas read-only (`/public/*`).
- [x] **Inbox** (sininho + dropdown + dispensar).
- [ ] **Colaboração**: comentários com @menção + reações em atividade/board; **timeline (feed)** no dashboard; botão **"resumo da semana" (digest)**.
- [ ] Esconder ações WORKER+/ADMIN para CLIENT/VIEWER; tratar `403`/`503` em toasts.

---

## 11. Notas finais p/ o Cursor

- Tudo company-scoped via `x-company-id` (menos eventos pessoais e `/public/*`).
- IDs de usuário (`authorId`, `actorId`, `mentions`, `createdById`) vêm crus — o
  front resolve nome/avatar (use a lista de membros da empresa que já existe).
- `link` nos resultados de busca/notificações é uma **sugestão de rota relativa**;
  ajuste ao roteamento real do app se diferir.
- IA = Claude no backend; se algum endpoint de IA der `503`, é a key — degrade a UI.
