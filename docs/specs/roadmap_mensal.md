# Spec Frontend — Roadmap Mensal (`/roadmap` → "Calendários mensais")

**Status:** Pronto para implementar · **Backend:** 100% implementado (2026-06-20)
**API completa:** [`calendario_&_roadmap_mensal.md`](./calendario_&_roadmap_mensal.md)

> Mini-spec focado em **como montar a tela**. O contrato de endpoints/tipos está
> no doc de integração; aqui é o comportamento, os estados e os fluxos.

---

## 1. Modelo mental

O roadmap mensal é uma **grade de 12 meses de um ano**. Cada mês tem:

- **foco principal** (`main`) — uma frase;
- **focos/prioridades** (`focusItems[]`) — bullets;
- **imagens** (`photos[]`) — galeria do foco;
- **agenda** (`entries[]`) — marcações por dia, com categoria;
- **anotações rápidas** — atalho que cria uma `entry` com `category: "note"`.

**Princípio:** o mês **existe sozinho no tempo** — o usuário nunca "cria mês".
O backend devolve os 12 meses prontos; meses sem conteúdo vêm com `id: null`.

---

## 2. Carregamento da tela

```typescript
// Authorization e x-company-id são injetados pelo interceptor.
const { year, months } = await roadmapApi.getYear(2026)
// months.length === 12, em ordem cronológica (month 0 → 11)
```

- `GET /roadmap/monthly?year=YYYY` → **sempre 12 meses**.
- Sem `?year`, o backend usa o ano atual.
- Cada item é um `RoadmapMonth`. Para a UI, normalize um flag local
  `persisted = Boolean(month.id)` porque o tipo do contrato persistido tem
  `id: string`, mas a listagem pode sintetizar meses vazios com `id: null`.
- Campos-chave: `id`, `key`, `year`, `month`, `title`, `main`, `focusItems`,
  `photos`, `entries`.
- Estado mínimo da tela:

```typescript
const selectedYear = ref(new Date().getFullYear())
const months = ref<UiRoadmapMonth[]>([])
const isLoadingYear = ref(false)
const loadError = ref<string | null>(null)

async function loadYear(year = selectedYear.value) {
  isLoadingYear.value = true
  loadError.value = null

  try {
    const response = await roadmapApi.getYear(year)
    selectedYear.value = response.year
    months.value = response.months.map(toUiRoadmapMonth)
  } catch (error) {
    loadError.value = getApiErrorMessage(error)
  } finally {
    isLoadingYear.value = false
  }
}
```

Estado da tela:

- **loading inicial:** skeleton/grid shimmer dos 12 cards.
- **erro de carregamento:** bloco com mensagem + botão "Tentar novamente".
- **sucesso vazio:** ainda mostra 12 cards; vazio é estado do mês, não da tela.

### Seletor de ano

Mantenha um `<select>`/setas de ano. Trocar o ano = `loadYear(novoAno)`.

---

## 3. Estados de cada card de mês

| Estado           | Como detectar                                  | UI                                                                          |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| **Vazio**        | `month.persisted === false` (ou `id === null`) | Card "fantasma": título do mês, placeholder "Sem itens", CTA "Adicionar".   |
| **Com conteúdo** | `month.persisted === true`                     | Renderiza foco principal, até 4 focos, até 2 imagens (`+N`), até 8 entries. |
| **Salvando**     | `saving[month.key]` ou `saving[itemId]`        | Spinner/disabled só na ação/item afetado.                                   |
| **Erro**         | `catch` da request                             | Toast com a mensagem da API e mantém estado local anterior.                 |

> Limites **visuais** do card: 4 focos, 2 imagens, 8 entries. O **modal de
> detalhes** e o **PDF** mostram tudo, sem limite.

Use estados de escrita por chave para evitar travar a tela inteira:

```typescript
const saving = reactive<Record<string, boolean>>({})

async function withSaving<T>(key: string, action: () => Promise<T>): Promise<T> {
  saving[key] = true

  try {
    return await action()
  } finally {
    saving[key] = false
  }
}
```

---

## 4. O padrão essencial: `ensureMonthId()`

Qualquer escrita num mês (`focus`, `photos`, `entries`) usa o **id real** do mês.
Se o mês veio do `GET` com `id: null`, primeiro garanta a linha:

```typescript
/** Devolve um monthId real, criando a linha do mês se necessário. */
async function ensureMonthId(month: RoadmapMonth): Promise<string> {
  if (month.id) return month.id

  try {
    const created = await roadmapApi.createMonth({
      key: month.key,
      year: month.year,
      month: month.month,
      title: month.title,
      main: month.main ?? '',
      order: month.order,
    })

    Object.assign(month, created, { persisted: true })
    return created.id
  } catch (error) {
    // Protege contra clique duplo ou outra aba criando o mesmo mês entre o GET e o POST.
    if (!isConflictError(error)) throw error

    const { months } = await roadmapApi.getYear(month.year)
    const persistedMonth = months.find((item) => item.key === month.key)
    if (!persistedMonth?.id) throw error

    Object.assign(month, persistedMonth, { persisted: true })
    return persistedMonth.id
  }
}
```

Regra de ouro: **nenhum write filho chama endpoint com `month.id === null`**.
Depois do `ensureMonthId()`, atualize o objeto local para as próximas escritas
não recriarem a linha.

---

## 5. Fluxos de escrita (todos exigem role **WORKER+**)

Fluxo-base:

```typescript
async function writeMonth<T>(month: UiRoadmapMonth, action: (monthId: string) => Promise<T>) {
  return withSaving(month.key, async () => {
    const monthId = await ensureMonthId(month)
    return action(monthId)
  })
}

function replaceById<T extends { id: string }>(items: T[], updated: T) {
  const index = items.findIndex((item) => item.id === updated.id)
  if (index >= 0) items.splice(index, 1, updated)
}
```

### 5.1 Adicionar foco

```typescript
const focus = await writeMonth(month, (monthId) => roadmapApi.addFocus(monthId, { text }))
month.focusItems.push(focus)
```

Editar:

```typescript
const updated = await writeMonth(month, (monthId) =>
  roadmapApi.updateFocus(monthId, focus.id, { text }),
)
replaceById(month.focusItems, updated)
```

Remover:

```typescript
await writeMonth(month, (monthId) => roadmapApi.removeFocus(monthId, focus.id))
month.focusItems = month.focusItems.filter((item) => item.id !== focus.id)
```

### 5.2 Editar foco principal do mês (`main`) / título

```typescript
const updated = await writeMonth(month, (monthId) =>
  roadmapApi.updateMonth(monthId, { main, title }),
)
Object.assign(month, updated, { persisted: true })
```

### 5.3 Anotação rápida

```typescript
const entry = await writeMonth(month, (monthId) =>
  roadmapApi.addQuickNote(monthId, date /* YYYY-MM-DD */, title, description),
)
month.entries.push(entry)
```

Equivale a criar uma entry com `category: "note"` e `source: "quick_note"`.

### 5.4 Item de agenda comum

```typescript
const entry = await writeMonth(month, (monthId) =>
  roadmapApi.addEntry(monthId, { date, title, description, category }),
)
month.entries.push(entry)
```

`category ∈ { milestone, meeting, delivery, recording, note, risk }`.

Editar:

```typescript
const updated = await writeMonth(month, (monthId) =>
  roadmapApi.updateEntry(monthId, entry.id, { date, title, description, category }),
)
replaceById(month.entries, updated)
```

Remover:

```typescript
await writeMonth(month, (monthId) => roadmapApi.removeEntry(monthId, entry.id))
month.entries = month.entries.filter((item) => item.id !== entry.id)
```

### 5.5 Imagens do foco

```typescript
const validFiles = files.filter((file) => file.type.startsWith('image/') && file.size <= 5 * 1024 * 1024)
const photos = await writeMonth(month, (monthId) => roadmapApi.uploadPhotos(monthId, validFiles))
month.photos.push(...photos)
```

Regras: só `image/*`, **máx 5 MB** por arquivo (valide no input antes de enviar
pra feedback rápido). Upload é `multipart/form-data`, campo `files`.

Remover:

```typescript
await writeMonth(month, (monthId) => roadmapApi.removePhoto(monthId, photo.id))
month.photos = month.photos.filter((item) => item.id !== photo.id)
```

### 5.6 Remover o mês inteiro

```typescript
if (!month.id) return

await withSaving(month.key, () => roadmapApi.removeMonth(month.id))
Object.assign(month, {
  id: null,
  persisted: false,
  main: '',
  focusItems: [],
  photos: [],
  entries: [],
})
```

`removeMonth(monthId)` apaga focos/imagens/entries em cascata. Preserve `key`,
`year`, `month`, `title` e `order` para o card continuar no grid de 12 meses.

---

## 6. Erros e permissões

- Formato: `{ statusCode, message, error }`. `message` pode ser **array**.
  Toast: `Array.isArray(message) ? message.join(', ') : message`.
- `403` → usuário não é **WORKER+** na empresa: **esconda/disable** os controles
  de escrita para CLIENT/VIEWER (leitura é liberada a qualquer membro).
- `404` → mês/recurso não existe nessa empresa (ex.: id obsoleto após remoção).
- `400` → validação (ex.: `date` fora de `YYYY-MM-DD`, categoria inválida).
- `409` → corrida ao criar mês já existente; `ensureMonthId()` deve recarregar o
  ano e reaproveitar o mês persistido.

```typescript
function getApiErrorMessage(error: unknown) {
  const message = getAxiosErrorPayload(error)?.message
  if (Array.isArray(message)) return message.join(', ')
  return message || 'Não foi possível salvar as alterações.'
}
```

Permissões:

- Usuário sem WORKER+: não renderizar botões de adicionar/editar/remover/upload.
- Se a role mudar ou o backend responder `403`, manter dados em leitura e mostrar toast.
- Não esconda a seção inteira: CLIENT/VIEWER ainda podem consultar roadmap e PDF.

---

## 7. Calendário visual + PDF

- **Dias marcados:** agrupe `entries` por `date` (`YYYY-MM-DD`). Dia com >1 item
  mostra contador.
- **Categorias:** use cor/ícone por `category`; mantenha label textual para
  acessibilidade (`aria-label` ou texto visível no detalhe).
- **Clique no dia:** abre lista das entries daquele dia; criar entry já pré-preenche
  `date` com o dia selecionado.
- **PDF (`window.print()`):** usa os dados completos já vindos da API — sem o
  limite visual de 8 entries / 4 focos do card. Para "PDF de um mês", filtre o
  mês; para "PDF do ano", itere os 12.
- **Print CSS:** esconder controles de escrita, botões, inputs e estados de erro;
  expandir focos, imagens e agenda completos.

---

## 8. Checklist de implementação

- [ ] `getYear(year)` no mount; renderizar os 12 cards a partir de `months`.
- [ ] Normalizar `persisted = Boolean(id)` e manter `id: null` apenas para mês vazio.
- [ ] Card vazio (`persisted=false`) com CTA de adicionar.
- [ ] `ensureMonthId()` antes de toda escrita; atualizar `id`/`persisted` local.
- [ ] Estados `loading`, `loadError` e `saving` por mês/item.
- [ ] CRUD de foco, foco principal (`updateMonth`), entries e anotação rápida.
- [ ] Upload de imagens (multipart `files`, validação 5 MB / imagem) + remoção.
- [ ] Esconder ações de escrita p/ CLIENT/VIEWER; tratar `403/404/400/409` no toast.
- [ ] Dias marcados por agrupamento de `entries.date`; detalhe por dia.
- [ ] PDF por mês e por ano com dados completos e CSS de impressão.
- [ ] Remover o fallback mock antigo quando a API responde.

---

## 9. Decisões e não-objetivos

- **Decisão:** mês auto-existe (12 sintetizados no `GET`, `ensure` no 1º write) —
  evita "cadastrar mês" manual a cada empresa nova. `month` é **zero-based (0–11)**.
- **Decisão:** salvamento é pessimista no estado local — só atualiza arrays depois
  do retorno da API, evitando IDs temporários em entidades filhas.
- **Decisão:** `entries` são independentes de `/events` (calendário de eventos).
  Não há espelhamento automático entre as duas telas.
- **Não-objetivo:** drag-and-drop/reordenação visual de focos, fotos ou entries.
- **Fora de escopo agora:** geração de PDF no backend (continua no front via
  `print()`); convites/notificações de participantes; integração Google no
  roadmap (isso é só do calendário de eventos).
- **Não confundir:** roadmap **anual** legado fica em
  `GET /company/:companyId/roadmap` — endpoint separado.
