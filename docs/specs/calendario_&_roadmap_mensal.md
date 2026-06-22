# Integração Frontend — Calendário + Roadmap Mensal

> Doc único de implementação para o frontend. Descreve a API **como está
> implementada** no backend (NestJS) em 2026-06-20. Cobre as duas specs:
> `calendario-enhanced.md` e `roadmap-monthly-backend-contract.md`.
>
> Use este arquivo como contexto no Cursor para gerar os services/composables.

---

## 0. Convenções globais

**Base URL:** a mesma da API (ex.: `import.meta.env.VITE_API_URL`). Porta padrão do backend: `5555`.

**Autenticação:** toda rota exige `Authorization: Bearer <jwt>`.

**Header de empresa:** `x-company-id: <companyId>` — enviado pelo interceptor Axios.

| Recurso                          | `x-company-id`  | Efeito                                                                                                                     |
| -------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Calendário** (`/events`)       | opcional        | **Com** header → eventos compartilhados da empresa. **Sem** header → eventos pessoais do usuário (+ sync Google Calendar). |
| **Roadmap** (`/roadmap/monthly`) | **obrigatório** | Sempre escopado por empresa.                                                                                               |

**Permissões (roadmap):** leitura = qualquer membro da empresa; escrita (criar/editar/remover mês, foco, foto, entry) = **WORKER ou superior** (OWNER > ADMIN > WORKER). CLIENT/VIEWER recebem `403`.

**Formato de erro** (padrão NestJS):

```json
{ "statusCode": 400, "message": ["title must be a string"], "error": "Bad Request" }
```

- `400` — validação (o `message` pode ser uma lista de strings).
- `403` — sem acesso à empresa / role insuficiente.
- `404` — recurso não encontrado (ou não pertence à empresa).
- `409` — mês duplicado (mesma `key` na mesma empresa).

Para exibir no toast, prefira: `Array.isArray(message) ? message.join(', ') : message`.

---

## 1. Calendário — `/events`

Escopo **híbrido**: o mesmo endpoint serve eventos da empresa (com `x-company-id`)
ou pessoais (sem header). A tela `/calendar` deve enviar `x-company-id` para ver
os eventos da empresa ativa.

### Tipos

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
  endDate: string | null // ISO UTC ou null (evento sem término)
  type: EventType
  recurrence: string | null // apenas armazenado (não expandido no backend)
  createdById: string
  companyId: string | null // null = pessoal; setado = da empresa
  activityId: string | null
  attendees: string[]
  googleEventId: string | null
  meetLink: string | null
  createdAt: string
  updatedAt: string
  activity?: { id: string; title: string } | null
}

export interface CreateEventInput {
  title: string // obrigatório
  description?: string
  startDate: string // obrigatório, ISO
  endDate?: string | null
  type: EventType // obrigatório
  recurrence?: string | null
  activityId?: string | null
  attendees?: string[]
}

export type UpdateEventInput = Partial<CreateEventInput>
```

### Endpoints

| Método | Rota                        | Descrição                                                                           |
| ------ | --------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/events?start=ISO&end=ISO` | Lista eventos no intervalo (ordenado por `startDate` asc). `start`/`end` opcionais. |
| GET    | `/events/upcoming?limit=N`  | Próximos eventos (default `limit=5`). Retorna apenas `{id,title,startDate,type}`.   |
| GET    | `/events/:id`               | Um evento (com `activity`).                                                         |
| POST   | `/events`                   | Cria. Body = `CreateEventInput`. Retorna o evento criado.                           |
| PATCH  | `/events/:id`               | Atualiza parcial. Body = `UpdateEventInput`.                                        |
| DELETE | `/events/:id`               | Remove.                                                                             |

> **Observação Google:** ao criar/editar eventos **pessoais** (sem `x-company-id`),
> o backend tenta espelhar no Google Calendar do usuário (best-effort, nunca
> bloqueia a resposta). Eventos de empresa não tocam o Google.

### Exemplo de service (Axios)

```typescript
// O interceptor já injeta Authorization e x-company-id.
export const calendarApi = {
  list: (start?: string, end?: string) =>
    api.get<CalendarEvent[]>('/events', { params: { start, end } }).then((r) => r.data),

  upcoming: (limit = 5) =>
    api
      .get<
        Pick<CalendarEvent, 'id' | 'title' | 'startDate' | 'type'>[]
      >('/events/upcoming', { params: { limit } })
      .then((r) => r.data),

  create: (input: CreateEventInput) =>
    api.post<CalendarEvent>('/events', input).then((r) => r.data),

  update: (id: string, input: UpdateEventInput) =>
    api.patch<CalendarEvent>(`/events/${id}`, input).then((r) => r.data),

  remove: (id: string) => api.delete(`/events/${id}`).then((r) => r.data),
}
```

---

## 2. Roadmap Mensal — `/roadmap/monthly`

`x-company-id` **obrigatório** em todas as rotas. A tela `/roadmap` (visão
"Calendários mensais") carrega tudo de uma vez via `GET /roadmap/monthly?year=`.

### Tipos

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
  date: string // YYYY-MM-DD
  title: string
  description: string | null
  category: RoadmapCategory
  source: string // "manual" | "quick_note"
}

export interface RoadmapMonth {
  id: string | null // null = mês ainda NÃO persistido (sem conteúdo)
  key: string // "YYYY-MM"
  year: number
  month: number // zero-based (0–11)
  title: string // default derivado ("Maio 2026") se não persistido
  main: string // "" se não persistido
  order: number
  persisted: boolean // false = sintetizado pelo backend (vazio)
  focusItems: RoadmapFocus[]
  photos: RoadmapPhoto[]
  entries: RoadmapEntry[]
}

export interface RoadmapYearResponse {
  year: number
  months: RoadmapMonth[] // SEMPRE 12, em ordem cronológica (month 0→11)
}
```

> **`month` é zero-based (0–11)** — bate direto com `new Date().getMonth()`.
> Maio = `4`. Não precisa converter.

### Endpoints

#### Meses

| Método | Rota                         | Role   | Body / retorno                                                                                                                                                                                                                                 |
| ------ | ---------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/roadmap/monthly?year=2026` | membro | → `RoadmapYearResponse`. `year` default = ano atual. Retorna **sempre os 12 meses** em ordem cronológica; os sem conteúdo vêm com `id: null` e `persisted: false`.                                                                             |
| POST   | `/roadmap/monthly`           | WORKER | **Get-or-create idempotente** (garante o mês). Body `{ key, year, month, title?, main?, order? }` → `RoadmapMonth`. Se já existe, retorna o existente (não sobrescreve). `title`/`main` opcionais (default: "Maio 2026" / ""). **Não dá 409.** |
| PATCH  | `/roadmap/monthly/:monthId`  | WORKER | Body `{ title?, main?, order? }` → `RoadmapMonth`. (Edita o mês já existente.)                                                                                                                                                                 |
| DELETE | `/roadmap/monthly/:monthId`  | WORKER | → `{ message }`. Apaga focos/fotos/entries em cascata (e remove imagens do storage).                                                                                                                                                           |

> **⚠️ Não existe "cadastrar mês" como passo manual.** O `GET` já devolve os 12
> meses prontos para renderizar (os vazios com `id: null`). Ao adicionar o
> primeiro item num mês `id: null`, faça o padrão **ensure-then-write**:
>
> ```typescript
> // mês veio do GET com id: null → garante a linha e pega o id real
> const ensured = month.id ?? (await roadmapApi.ensureMonth(month)).id
> await roadmapApi.addEntry(ensured, { date: '2026-08-12', title: 'Kickoff', category: 'meeting' })
> ```
>
> Pode chamar `ensureMonth` quantas vezes quiser — é seguro/idempotente. Veja o
> spec dedicado: [`roadmap-monthly-frontend-spec.md`](./roadmap-monthly-frontend-spec.md).

#### Focos

| Método | Rota                                       | Role   | Body / retorno                                       |
| ------ | ------------------------------------------ | ------ | ---------------------------------------------------- |
| POST   | `/roadmap/monthly/:monthId/focus`          | WORKER | `{ text, order? }` → `{ id, monthId, text, order }`. |
| PATCH  | `/roadmap/monthly/:monthId/focus/:focusId` | WORKER | `{ text?, order? }` → idem.                          |
| DELETE | `/roadmap/monthly/:monthId/focus/:focusId` | WORKER | → `{ message }`.                                     |

#### Imagens

| Método | Rota                                        | Role   | Detalhe                                                                                                         |
| ------ | ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| POST   | `/roadmap/monthly/:monthId/photos`          | WORKER | **`multipart/form-data`**, campo **`files`** (1+ imagens). Só `image/*`, máx **5 MB** cada. → `RoadmapPhoto[]`. |
| DELETE | `/roadmap/monthly/:monthId/photos/:photoId` | WORKER | → `{ message }`.                                                                                                |

#### Agenda (entries) — inclui "Anotações rápidas"

| Método | Rota                                         | Role   | Body / retorno                                                       |
| ------ | -------------------------------------------- | ------ | -------------------------------------------------------------------- |
| POST   | `/roadmap/monthly/:monthId/entries`          | WORKER | `{ date, title, description?, category, source? }` → `RoadmapEntry`. |
| PATCH  | `/roadmap/monthly/:monthId/entries/:entryId` | WORKER | `{ date?, title?, description?, category? }` → `RoadmapEntry`.       |
| DELETE | `/roadmap/monthly/:monthId/entries/:entryId` | WORKER | → `{ message }`.                                                     |

> **Anotação rápida** = um entry com `category: "note"` e `source: "quick_note"`.
> Fluxo: usuário escolhe mês → data → texto → `POST .../entries` com esse payload.

### Mapeamento p/ a tela atual

O componente atual usa `MonthlyPlan` com `bullets: string[]`. Ao integrar:

- `focusItems[].text` → `bullets`
- `entries` → agenda (mantenha o limite visual de 8 no card; modal/PDF mostram todos)
- `photos` → galeria do foco (card mostra 2 + indicador `+N`)
- `id` do mês → operações de CRUD

### Exemplo de service (Axios)

```typescript
export const roadmapApi = {
  getYear: (year: number) =>
    api.get<RoadmapYearResponse>('/roadmap/monthly', { params: { year } }).then((r) => r.data),

  // Get-or-create idempotente. title/main opcionais. Use antes de adicionar
  // conteúdo a um mês que ainda não existe no banco.
  ensureMonth: (input: {
    key: string
    year: number
    month: number
    title?: string
    main?: string
    order?: number
  }) => api.post<RoadmapMonth>('/roadmap/monthly', input).then((r) => r.data),

  updateMonth: (monthId: string, input: { title?: string; main?: string; order?: number }) =>
    api.patch<RoadmapMonth>(`/roadmap/monthly/${monthId}`, input).then((r) => r.data),

  removeMonth: (monthId: string) => api.delete(`/roadmap/monthly/${monthId}`).then((r) => r.data),

  addFocus: (monthId: string, input: { text: string; order?: number }) =>
    api
      .post<RoadmapFocus & { monthId: string }>(`/roadmap/monthly/${monthId}/focus`, input)
      .then((r) => r.data),

  updateFocus: (monthId: string, focusId: string, input: { text?: string; order?: number }) =>
    api.patch(`/roadmap/monthly/${monthId}/focus/${focusId}`, input).then((r) => r.data),

  removeFocus: (monthId: string, focusId: string) =>
    api.delete(`/roadmap/monthly/${monthId}/focus/${focusId}`).then((r) => r.data),

  uploadPhotos: (monthId: string, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    return api
      .post<RoadmapPhoto[]>(`/roadmap/monthly/${monthId}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  removePhoto: (monthId: string, photoId: string) =>
    api.delete(`/roadmap/monthly/${monthId}/photos/${photoId}`).then((r) => r.data),

  addEntry: (
    monthId: string,
    input: {
      date: string
      title: string
      description?: string
      category: RoadmapCategory
      source?: string
    },
  ) =>
    api
      .post<RoadmapEntry & { monthId: string }>(`/roadmap/monthly/${monthId}/entries`, input)
      .then((r) => r.data),

  addQuickNote: (monthId: string, date: string, title: string, description?: string) =>
    roadmapApi.addEntry(monthId, {
      date,
      title,
      description,
      category: 'note',
      source: 'quick_note',
    }),

  updateEntry: (
    monthId: string,
    entryId: string,
    input: {
      date?: string
      title?: string
      description?: string
      category?: RoadmapCategory
    },
  ) => api.patch(`/roadmap/monthly/${monthId}/entries/${entryId}`, input).then((r) => r.data),

  removeEntry: (monthId: string, entryId: string) =>
    api.delete(`/roadmap/monthly/${monthId}/entries/${entryId}`).then((r) => r.data),
}
```

---

## 3. Checklist de integração (frontend)

**Calendário**

- [ ] Tela `/calendar` envia `x-company-id` → consome `GET /events?start&end`.
- [ ] Criar/editar/excluir via `POST`/`PATCH`/`DELETE /events/:id` (remover o fallback mock quando a API responde).
- [ ] Próximos eventos: usar `GET /events/upcoming?limit=N` (ou calcular local).
- [ ] Tipos `TASK` e `PERSONAL` já reconhecidos pelo enum.

**Roadmap**

- [ ] `/roadmap` carrega `GET /roadmap/monthly?year=` no mount (com `x-company-id`).
- [ ] `bullets` ← `focusItems[].text`; CRUD de foco persiste no backend.
- [ ] Upload de imagens via `multipart` campo `files`; respeitar 5 MB / só imagem.
- [ ] "Anotações rápidas" → `addQuickNote` (entry `note` + `source: quick_note`).
- [ ] Esconder ações de escrita para usuários CLIENT/VIEWER (recebem `403`).
- [ ] PDF (`window.print()`) usa os dados completos vindos da API (sem limite de 8/4).

> O roadmap **anual** legado continua em `GET /company/:companyId/roadmap` —
> endpoint separado, não confundir com `/roadmap/monthly`.
