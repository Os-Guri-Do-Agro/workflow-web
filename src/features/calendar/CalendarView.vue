<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Flag,
  Link2,
  ListTodo,
  Loader2,
  Plus,
  RotateCcw,
  User as UserIcon,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-vue-next'
import EventModal from '@/components/modals/EventModal.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import eventsService, { type CreateEventInput, type EventType } from '@/service/events/events-service'

const { success, error: showError } = useToast()

type CalendarEvent = {
  id?: string
  title: string
  description?: string | null
  startDate: string
  endDate?: string | null
  type: EventType | string
  recurrence?: string | null
  meetLink?: string | null
  activityId?: string | null
  activity?: { id: string; title: string } | null
  // Ocorrência virtual gerada por recorrência (read-only; edita a série no evento base).
  isOccurrence?: boolean
  seriesId?: string
}

type ViewMode = 'month' | 'week'
const HOUR_HEIGHT = 44 // altura de 1h na week view (px)
const hours = Array.from({ length: 24 }, (_, h) => h)

const EVENT_META: Record<EventType, { label: string; token: string; icon: LucideIcon }> = {
  MEETING: { label: 'Reunião', token: 'var(--info)', icon: Video },
  DEADLINE: { label: 'Prazo', token: 'var(--err)', icon: Flag },
  REMINDER: { label: 'Lembrete', token: 'var(--warn)', icon: Bell },
  SPRINT: { label: 'Sprint', token: 'var(--success)', icon: Zap },
  RETROSPECTIVE: { label: 'Retrospectiva', token: 'var(--status-test)', icon: RotateCcw },
  TASK: { label: 'Tarefa', token: 'var(--accent)', icon: CheckSquare },
  PERSONAL: { label: 'Pessoal', token: 'var(--status-todo)', icon: UserIcon },
}

const EVENT_FALLBACK = { label: 'Evento', token: 'var(--text-3)', icon: CalendarDays }
const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const currentDate = ref(new Date())
const selectedDate = ref(new Date())
const events = ref<CalendarEvent[]>([])
const loading = ref(false)
const apiUnavailable = ref(false)
const showEventModal = ref(false)
const selectedEvent = ref<CalendarEvent | null>(null)
const viewMode = ref<ViewMode>('month')
const saving = ref(false)

// Relógio para o indicador "agora" (atualiza a cada minuto).
const now = ref(new Date())
let nowTimer: ReturnType<typeof setInterval> | undefined

const daysInMonth = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days: Date[] = []

  for (let i = firstDay.getDay() - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i))
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    days.push(new Date(year, month, day))
  }

  for (let day = 1; day < 7 - lastDay.getDay(); day++) {
    days.push(new Date(year, month + 1, day))
  }

  return days
})

const monthLabel = computed(() => `${monthNames[currentDate.value.getMonth()]} ${currentDate.value.getFullYear()}`)

// ─── Week view ───────────────────────────────────────────────────────────────
// Semana (dom-sáb) que contém a data selecionada.
const weekDates = computed(() => {
  const base = new Date(selectedDate.value)
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay())
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
})

const weekLabel = computed(() => {
  const days = weekDates.value
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return ''
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return `${fmt(first)} – ${fmt(last)}`
})

const periodLabel = computed(() => (viewMode.value === 'week' ? weekLabel.value : monthLabel.value))

// Dias visíveis conforme a view atual (dirige fetch e indexação).
const visibleDays = computed(() => (viewMode.value === 'week' ? weekDates.value : daysInMonth.value))

// ─── Indexação de eventos por dia (com recorrência) ──────────────────────────
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Avança a data conforme a frequência da recorrência.
function advanceByFreq(date: Date, freq: string): Date {
  const d = new Date(date)
  if (freq === 'DAILY') d.setDate(d.getDate() + 1)
  else if (freq === 'WEEKLY') d.setDate(d.getDate() + 7)
  else if (freq === 'MONTHLY') d.setMonth(d.getMonth() + 1)
  else if (freq === 'YEARLY') d.setFullYear(d.getFullYear() + 1)
  return d
}

/**
 * Gera ocorrências virtuais de um evento recorrente dentro da janela [winStart, winEnd].
 * Sem lib: interpreta 'FREQ=DAILY|WEEKLY|MONTHLY|YEARLY'. A ocorrência-base mantém o id real;
 * as demais recebem id sintético `${id}#${YYYY-MM-DD}` e flag isOccurrence (read-only).
 */
function expandRecurrence(event: CalendarEvent, winStart: Date, winEnd: Date): CalendarEvent[] {
  const freq = event.recurrence?.match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/)?.[1]
  const base = new Date(event.startDate)
  if (!freq || Number.isNaN(base.getTime())) return [event]

  const durationMs = event.endDate ? Math.max(0, new Date(event.endDate).getTime() - base.getTime()) : 0
  const out: CalendarEvent[] = []
  let cursor = new Date(base)
  let iter = 0
  const MAX_ITER = 4000 // ~10 anos de recorrência diária: fast-forward seguro
  const MAX_PUSH = 366 // limite prudente de ocorrências por evento

  while (cursor.getTime() <= winEnd.getTime() && iter < MAX_ITER && out.length < MAX_PUSH) {
    const occStartMs = cursor.getTime()
    const occEndMs = occStartMs + durationMs
    if (occEndMs >= winStart.getTime()) {
      if (occStartMs === base.getTime()) {
        out.push(event)
      } else {
        out.push({
          ...event,
          id: `${event.id ?? 'ev'}#${dateKey(cursor)}`,
          startDate: new Date(occStartMs).toISOString(),
          endDate: durationMs ? new Date(occEndMs).toISOString() : null,
          isOccurrence: true,
          seriesId: event.id,
        })
      }
    }
    cursor = advanceByFreq(cursor, freq)
    iter++
  }

  return out.length ? out : [event]
}

// Map<YYYY-MM-DD, CalendarEvent[]> — indexa cada evento em TODOS os dias do seu intervalo,
// expandindo recorrências. Computado uma vez por render (evita varrer o array por célula).
const eventsByDay = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  const days = visibleDays.value
  if (!days.length) return map

  const winStart = startOfDay(days[0]!)
  const winEnd = endOfDay(days[days.length - 1]!)

  for (const raw of events.value) {
    for (const ev of expandRecurrence(raw, winStart, winEnd)) {
      const start = new Date(ev.startDate)
      if (Number.isNaN(start.getTime())) continue
      const endRaw = ev.endDate ? new Date(ev.endDate) : start
      const end = Number.isNaN(endRaw.getTime()) ? start : endRaw

      for (const d of days) {
        // Dia D cruza [start, end] se start <= fim-do-dia(D) e end >= início-do-dia(D).
        if (start.getTime() <= endOfDay(d).getTime() && end.getTime() >= startOfDay(d).getTime()) {
          const k = dateKey(d)
          const arr = map.get(k) ?? []
          arr.push(ev)
          map.set(k, arr)
        }
      }
    }
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
  }
  return map
})

const selectedDayEvents = computed(() => getDayEvents(selectedDate.value))
const selectedDayDeliverables = computed(() =>
  selectedDayEvents.value.filter((event) => event.type === 'DEADLINE' || event.type === 'TASK'),
)
const monthEvents = computed(() =>
  events.value.filter((event) => {
    const eventDate = new Date(event.startDate)
    return eventDate.getMonth() === currentDate.value.getMonth() && eventDate.getFullYear() === currentDate.value.getFullYear()
  }),
)
const upcomingEvents = computed(() => {
  const selectedTime = startOfDay(selectedDate.value).getTime()
  return [...events.value]
    .filter((event) => startOfDay(new Date(event.startDate)).getTime() >= selectedTime)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 6)
})
const dataSourceLabel = computed(() => (apiUnavailable.value ? 'API indisponível' : 'Eventos da API'))

// ─── Google Calendar (conectar/desconectar) ─────────────────────────────────
const route = useRoute()
const router = useRouter()
const googleConnected = ref(false)
const googleBusy = ref(false)

async function refreshGoogleStatus() {
  try {
    googleConnected.value = await eventsService.getGoogleStatus()
  } catch {
    googleConnected.value = false
  }
}

async function connectGoogle() {
  googleBusy.value = true
  try {
    window.location.href = await eventsService.getGoogleAuthUrl()
  } catch {
    showError('Não foi possível iniciar a conexão com o Google')
    googleBusy.value = false
  }
}

async function disconnectGoogle() {
  googleBusy.value = true
  try {
    await eventsService.disconnectGoogle()
    googleConnected.value = false
    success('Google Calendar desconectado')
  } catch {
    showError('Não foi possível desconectar o Google')
  } finally {
    googleBusy.value = false
  }
}

onMounted(async () => {
  nowTimer = setInterval(() => (now.value = new Date()), 60_000)
  await fetchEvents()
  await refreshGoogleStatus()
  // Retorno do OAuth (callback do backend redireciona com ?sync=success|error).
  if (route.query.sync === 'success') {
    success('Google Calendar conectado!')
    await refreshGoogleStatus()
    await fetchEvents()
    router.replace({ query: { ...route.query, sync: undefined } })
  } else if (route.query.sync === 'error') {
    showError('Falha ao conectar o Google Calendar')
    router.replace({ query: { ...route.query, sync: undefined } })
  }
})

onBeforeUnmount(() => {
  if (nowTimer) clearInterval(nowTimer)
})

// Refetch quando a janela visível muda (troca de mês/semana ou de view).
const rangeKey = computed(() => {
  const d = visibleDays.value
  if (!d.length) return ''
  return `${dateKey(d[0]!)}_${dateKey(d[d.length - 1]!)}`
})
watch(rangeKey, fetchEvents)

function currentRange() {
  const days = visibleDays.value
  const first = days[0] ?? currentDate.value
  const last = days[days.length - 1] ?? currentDate.value
  return {
    start: startOfDay(first).toISOString(),
    end: endOfDay(last).toISOString(),
  }
}

// Erro de rede ou 5xx → API realmente indisponível. 4xx (validação) NÃO derruba a tela.
function isServerOrNetworkError(err: unknown): boolean {
  const status = (err as any)?.response?.status
  return !(err as any)?.response || (typeof status === 'number' && status >= 500)
}

async function fetchEvents() {
  loading.value = true
  try {
    const apiEvents = await eventsService.getEvents(currentRange())
    events.value = apiEvents as CalendarEvent[]
    apiUnavailable.value = false
  } catch (err) {
    // Só zera a grade/marca indisponível em falha de rede/servidor.
    if (isServerOrNetworkError(err)) {
      events.value = []
      apiUnavailable.value = true
    }
    showError(getApiErrorMessage(err, 'API de calendário indisponível'))
  } finally {
    loading.value = false
  }
}

// Navegação sensível à view: mês avança 1 mês, semana avança 7 dias.
function prev() {
  if (viewMode.value === 'week') shiftWeek(-7)
  else {
    currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
    selectedDate.value = new Date(currentDate.value)
  }
}

function next() {
  if (viewMode.value === 'week') shiftWeek(7)
  else {
    currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1)
    selectedDate.value = new Date(currentDate.value)
  }
}

function shiftWeek(deltaDays: number) {
  const d = new Date(selectedDate.value)
  d.setDate(d.getDate() + deltaDays)
  selectedDate.value = d
  currentDate.value = new Date(d.getFullYear(), d.getMonth(), 1)
}

function setView(mode: ViewMode) {
  viewMode.value = mode
}

function goToToday() {
  const today = new Date()
  currentDate.value = today
  selectedDate.value = today
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function isToday(date: Date): boolean {
  return date.toDateString() === new Date().toDateString()
}

function isSelectedDate(date: Date): boolean {
  return date.toDateString() === selectedDate.value.toDateString()
}

function isCurrentMonth(date: Date): boolean {
  return date.getMonth() === currentDate.value.getMonth()
}

function selectDate(date: Date) {
  selectedDate.value = date
  if (date.getMonth() !== currentDate.value.getMonth()) {
    currentDate.value = new Date(date.getFullYear(), date.getMonth(), 1)
  }
}

function getDayEvents(date: Date): CalendarEvent[] {
  return eventsByDay.value.get(dateKey(date)) ?? []
}

// Evento é continuação (começou em dia anterior) na célula do mês.
function isContinuation(event: CalendarEvent, date: Date): boolean {
  return startOfDay(new Date(event.startDate)).getTime() < startOfDay(date).getTime()
}

function openEventModal(event?: CalendarEvent, date?: Date) {
  if (date && !event) {
    selectedEvent.value = { title: '', startDate: `${toDateInputValue(date)}T09:00`, type: 'MEETING' }
  } else if (event?.isOccurrence) {
    // Ocorrência virtual: abre a série (evento base) para edição.
    selectedEvent.value = events.value.find((e) => e.id === event.seriesId) ?? event
  } else {
    selectedEvent.value = event ?? null
  }
  showEventModal.value = true
}

function openSelectedDayEventModal() {
  openEventModal(undefined, selectedDate.value)
}

async function handleSave(eventData: CalendarEvent) {
  const payload: CreateEventInput & { id?: string } = {
    id: eventData.id,
    title: eventData.title,
    description: eventData.description ?? null,
    startDate: eventData.startDate,
    endDate: eventData.endDate ?? null,
    type: (EVENT_META[eventData.type as EventType] ? eventData.type : 'MEETING') as EventType,
    recurrence: eventData.recurrence ?? null,
  }

  saving.value = true
  try {
    if (payload.id) {
      await eventsService.updateEvent(payload.id, payload)
      success('Evento atualizado')
    } else {
      await eventsService.createEvent(payload)
      success('Evento criado')
    }
    await fetchEvents()
    // Só fecha o modal no sucesso (mantém o form preenchido em caso de erro).
    showEventModal.value = false
  } catch (err) {
    if (isServerOrNetworkError(err)) apiUnavailable.value = true
    showError(getApiErrorMessage(err, 'Não foi possível salvar o evento'))
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await eventsService.deleteEvent(id)
    await fetchEvents()
    success('Evento excluído')
  } catch (err) {
    if (isServerOrNetworkError(err)) apiUnavailable.value = true
    showError(getApiErrorMessage(err, 'Não foi possível remover o evento'))
  }
}

function eventMeta(type: string) {
  return EVENT_META[type as EventType] ?? EVENT_FALLBACK
}

/**
 * Estilo por TIPO de evento, com identidade estável.
 *
 * Devolvia um objeto novo a cada chamada, e é chamado do template por evento por
 * célula: identidade nova obriga o Vue a repatchar o `style` toda vez. Os tipos
 * são poucos e fixos, então um objeto por tipo basta.
 */
const estiloPorTipo = new Map<string, Record<string, string>>()

function eventStyle(event: CalendarEvent) {
  const pronto = estiloPorTipo.get(event.type)
  if (pronto) return pronto
  const estilo = { '--ev-c': eventMeta(event.type).token }
  estiloPorTipo.set(event.type, estilo)
  return estilo
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function formatLong(date: Date): string {
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatTimeRange(event: CalendarEvent): string {
  const start = formatTime(event.startDate)
  if (!event.endDate) return start
  return `${start} - ${formatTime(event.endDate)}`
}

// ─── Week view: posicionamento por hora ──────────────────────────────────────
// Evento "de dia inteiro/multi-dia" quando cruza a fronteira de dias (barra no topo).
function isAllDayLike(event: CalendarEvent): boolean {
  const start = new Date(event.startDate)
  if (Number.isNaN(start.getTime())) return false
  if (!event.endDate) return false
  const end = new Date(event.endDate)
  if (Number.isNaN(end.getTime())) return false
  return startOfDay(start).getTime() !== startOfDay(end).getTime()
}

// Eventos com hora (não all-day) que começam no dia informado.
/**
 * Memória por dia, atada aos eventos.
 *
 * `timedEventsForDay` e `barEventsForDay` são chamadas DO TEMPLATE, uma vez por
 * célula do mês (~35) e a cada re-render. Cada chamada filtrava a lista do dia
 * alocando um `Date` por evento. O resultado só muda quando `eventsByDay` muda,
 * então o `computed` serve de invalidação automática: quando os eventos mudam,
 * o objeto de cache é recriado vazio e tudo recalcula uma vez só.
 */
const cachePorDia = computed(() => {
  void eventsByDay.value
  return {
    timed: new Map<string, CalendarEvent[]>(),
    barras: new Map<string, CalendarEvent[]>(),
  }
})

function timedEventsForDay(date: Date): CalendarEvent[] {
  const chave = dateKey(date)
  const cache = cachePorDia.value.timed
  const pronto = cache.get(chave)
  if (pronto) return pronto
  const inicioDoDia = startOfDay(date).getTime()
  const lista = getDayEvents(date).filter(
    (ev) => !isAllDayLike(ev) && startOfDay(new Date(ev.startDate)).getTime() === inicioDoDia,
  )
  cache.set(chave, lista)
  return lista
}

// Eventos-barra (all-day/multi-dia) que cruzam o dia informado.
function barEventsForDay(date: Date): CalendarEvent[] {
  const chave = dateKey(date)
  const cache = cachePorDia.value.barras
  const pronto = cache.get(chave)
  if (pronto) return pronto
  const lista = getDayEvents(date).filter((ev) => isAllDayLike(ev))
  cache.set(chave, lista)
  return lista
}

function eventPosition(event: CalendarEvent): { top: string; height: string } {
  const start = new Date(event.startDate)
  const startHours = start.getHours() + start.getMinutes() / 60
  let durationH = 1
  if (event.endDate) {
    const end = new Date(event.endDate)
    if (!Number.isNaN(end.getTime())) durationH = Math.max(0.5, (end.getTime() - start.getTime()) / 3_600_000)
  }
  return {
    top: `${startHours * HOUR_HEIGHT}px`,
    height: `${Math.max(HOUR_HEIGHT * 0.5, durationH * HOUR_HEIGHT)}px`,
  }
}

// Posição da linha "agora" (px a partir do topo). null se hoje não está na semana.
const nowIndicatorTop = computed(() => {
  const n = now.value
  return `${(n.getHours() + n.getMinutes() / 60) * HOUR_HEIGHT}px`
})

function isTodayColumn(date: Date): boolean {
  return isToday(date)
}
</script>

<template>
  <div class="cal-page">
    <header class="page-header">
      <div class="header-main">
        <span class="eyebrow">
          <CalendarDays :size="11" />
          Agenda
          <span class="source-pill" :class="{ 'source-pill--error': apiUnavailable }">
            <Loader2 v-if="loading" :size="11" class="spin" />
            {{ loading ? 'Sincronizando...' : dataSourceLabel }}
          </span>
        </span>
        <h1 class="page-title">Calendário</h1>
        <p class="page-sub">Eventos, prazos e atividades do dia em uma agenda clicável</p>
      </div>

      <div class="header-actions">
        <button
          class="btn-ghost press"
          :class="{ 'btn-ghost--ok': googleConnected }"
          :disabled="googleBusy"
          :title="googleConnected ? 'Clique para desconectar o Google Calendar' : 'Sincronizar com o Google Calendar'"
          @click="googleConnected ? disconnectGoogle() : connectGoogle()"
        >
          <Loader2 v-if="googleBusy" :size="13" class="spin" />
          <Link2 v-else :size="13" />
          {{ googleConnected ? 'Google conectado' : 'Conectar Google' }}
        </button>
        <button class="btn-ghost press" @click="goToToday">Hoje</button>
        <button class="btn-primary press" @click="openSelectedDayEventModal">
          <Plus :size="13" />
          Novo evento
        </button>
      </div>
    </header>

    <section class="summary-grid" aria-label="Resumo do calendário">
      <article class="summary-card">
        <CalendarDays :size="17" />
        <span>Eventos no mês</span>
        <strong>{{ monthEvents.length }}</strong>
      </article>
      <article class="summary-card">
        <Clock3 :size="17" />
        <span>Agenda do dia</span>
        <strong>{{ selectedDayEvents.length }}</strong>
      </article>
      <article class="summary-card">
        <ListTodo :size="17" />
        <span>Entregas</span>
        <strong>{{ selectedDayDeliverables.length }}</strong>
      </article>
      <article class="summary-card">
        <CircleDot :size="17" />
        <span>Próximos</span>
        <strong>{{ upcomingEvents.length }}</strong>
      </article>
    </section>

    <div class="toolbar">
      <div class="month-nav">
        <button class="nav-btn" :aria-label="viewMode === 'week' ? 'Semana anterior' : 'Mês anterior'" @click="prev">
          <ChevronLeft :size="15" />
        </button>
        <span class="month-label">{{ periodLabel }}</span>
        <button class="nav-btn" :aria-label="viewMode === 'week' ? 'Próxima semana' : 'Próximo mês'" @click="next">
          <ChevronRight :size="15" />
        </button>
      </div>

      <div class="view-toggle" role="tablist" aria-label="Modo de visualização">
        <button
          class="view-btn"
          :class="{ 'view-btn--active': viewMode === 'month' }"
          role="tab"
          :aria-selected="viewMode === 'month'"
          @click="setView('month')"
        >
          Mês
        </button>
        <button
          class="view-btn"
          :class="{ 'view-btn--active': viewMode === 'week' }"
          role="tab"
          :aria-selected="viewMode === 'week'"
          @click="setView('week')"
        >
          Semana
        </button>
      </div>

      <div class="toolbar-meta">
        <span v-for="(meta, type) in EVENT_META" :key="type" class="meta-item">
          <span class="meta-dot" :style="{ background: meta.token }" />
          {{ meta.label }}
        </span>
      </div>
    </div>

    <div class="layout">
      <section class="grid-wrap" :aria-label="viewMode === 'week' ? 'Calendário semanal' : 'Calendário mensal'">
        <!-- Overlay de loading sutil: a grade permanece montada (não pisca a cada troca). -->
        <div v-if="loading" class="grid-loading" aria-live="polite">
          <Loader2 :size="14" class="spin" />
          Sincronizando…
        </div>

        <!-- ─── MÊS ─── -->
        <template v-if="viewMode === 'month'">
          <div class="weekdays">
            <div v-for="day in weekDays" :key="day" class="weekday">{{ day }}</div>
          </div>

          <div class="days-grid">
            <button
              v-for="date in daysInMonth"
              :key="date.toISOString()"
              class="day"
              :class="{
                'day--today': isToday(date),
                'day--other': !isCurrentMonth(date),
                'day--selected': isSelectedDate(date),
              }"
              @click="selectDate(date)"
              @dblclick="openEventModal(undefined, date)"
            >
              <span class="day-head">
                <span class="day-num">{{ date.getDate() }}</span>
                <span v-if="getDayEvents(date).length" class="day-count">{{ getDayEvents(date).length }}</span>
              </span>

              <span class="day-events">
                <span
                  v-for="event in getDayEvents(date).slice(0, 3)"
                  :key="event.id"
                  class="ev-pill"
                  :class="{ 'ev-pill--cont': isContinuation(event, date) }"
                  :style="eventStyle(event)"
                  :title="event.title"
                  @click.stop="openEventModal(event)"
                >
                  <ArrowRight v-if="isContinuation(event, date)" :size="11" class="ev-cont-icon" />
                  <span v-else class="ev-time">{{ formatTime(event.startDate) }}</span>
                  <span class="ev-title">{{ event.title }}</span>
                </span>
                <span v-if="getDayEvents(date).length > 3" class="ev-more">
                  +{{ getDayEvents(date).length - 3 }}
                </span>
              </span>
            </button>
          </div>
        </template>

        <!-- ─── SEMANA (time-grid) ─── -->
        <template v-else>
          <div class="week-head">
            <div class="week-gutter-head" />
            <button
              v-for="date in weekDates"
              :key="date.toISOString()"
              class="week-day-head"
              :class="{ 'week-day-head--today': isToday(date), 'week-day-head--selected': isSelectedDate(date) }"
              @click="selectDate(date)"
              @dblclick="openEventModal(undefined, date)"
            >
              <span class="week-dow">{{ weekDays[date.getDay()] }}</span>
              <span class="week-dnum">{{ date.getDate() }}</span>
            </button>
          </div>

          <!-- Barra de eventos all-day / multi-dia -->
          <div v-if="weekDates.some((d) => barEventsForDay(d).length)" class="week-allday">
            <div class="week-gutter-head week-allday-label">Dia todo</div>
            <div
              v-for="date in weekDates"
              :key="date.toISOString()"
              class="week-allday-col"
            >
              <span
                v-for="event in barEventsForDay(date)"
                :key="event.id"
                class="allday-pill"
                :style="eventStyle(event)"
                :title="event.title"
                @click="openEventModal(event)"
              >
                {{ event.title }}
              </span>
            </div>
          </div>

          <div class="week-grid-scroll">
            <div class="week-grid" :style="{ height: `${HOUR_HEIGHT * 24}px` }">
              <!-- Coluna de horas -->
              <div class="week-gutter">
                <div v-for="h in hours" :key="h" class="hour-cell" :style="{ height: `${HOUR_HEIGHT}px` }">
                  <span class="hour-label">{{ String(h).padStart(2, '0') }}:00</span>
                </div>
              </div>

              <!-- Colunas de dias -->
              <div
                v-for="date in weekDates"
                :key="date.toISOString()"
                class="week-col"
                :class="{ 'week-col--today': isToday(date) }"
                @dblclick="openEventModal(undefined, date)"
              >
                <div v-for="h in hours" :key="h" class="week-slot" :style="{ height: `${HOUR_HEIGHT}px` }" />

                <!-- Linha "agora" -->
                <div
                  v-if="isTodayColumn(date)"
                  class="now-line"
                  :style="{ top: nowIndicatorTop }"
                  aria-hidden="true"
                >
                  <span class="now-dot" />
                </div>

                <!-- Eventos posicionados -->
                <button
                  v-for="event in timedEventsForDay(date)"
                  :key="event.id"
                  class="week-event"
                  :style="{ ...eventStyle(event), ...eventPosition(event) }"
                  :title="event.title"
                  @click.stop="openEventModal(event)"
                >
                  <span class="week-event-time">{{ formatTimeRange(event) }}</span>
                  <span class="week-event-title">{{ event.title }}</span>
                </button>
              </div>
            </div>
          </div>
        </template>
      </section>

      <aside class="sidebar">
        <div class="side-head">
          <span class="eyebrow">
            <Clock3 :size="11" />
            {{ formatLong(selectedDate) }}
          </span>
          <h3 class="side-title">Agenda do dia</h3>
        </div>

        <section class="agenda-section">
          <div class="section-head">
            <span>Eventos</span>
            <button class="side-new" @click="openSelectedDayEventModal">
              <Plus :size="12" />
              Adicionar
            </button>
          </div>

          <div v-if="!selectedDayEvents.length" class="side-empty">
            Nenhum evento neste dia.
          </div>

          <div v-else class="side-list">
            <div v-for="event in selectedDayEvents" :key="event.id" class="side-card">
              <button class="side-item" @click="openEventModal(event)">
                <span class="side-icon" :style="eventStyle(event)">
                  <component :is="eventMeta(event.type).icon" :size="13" />
                </span>
                <span class="side-info">
                  <span class="side-item-title">{{ event.title }}</span>
                  <span class="side-item-meta">{{ formatTimeRange(event) }}</span>
                </span>
                <span class="side-badge" :style="eventStyle(event)">
                  {{ eventMeta(event.type).label }}
                </span>
              </button>

              <!-- Ações: Meet + atividade vinculada -->
              <div v-if="event.meetLink || event.activity" class="side-actions">
                <a
                  v-if="event.meetLink"
                  class="side-meet"
                  :href="event.meetLink"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Video :size="12" />
                  Entrar no Meet
                </a>
                <span v-if="event.activity" class="side-activity" :title="event.activity.title">
                  <Link2 :size="11" />
                  {{ event.activity.title }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section class="agenda-section">
          <div class="section-head">
            <span>Entregas e prazos</span>
          </div>

          <div v-if="!selectedDayDeliverables.length" class="side-empty compact">
            Sem entregas marcadas.
          </div>

          <div v-else class="deliverable-list">
            <button
              v-for="event in selectedDayDeliverables"
              :key="event.id"
              class="deliverable-item"
              @click="openEventModal(event)"
            >
              <Flag :size="12" />
              <span>{{ event.title }}</span>
              <small>{{ formatTimeRange(event) }}</small>
            </button>
          </div>
        </section>

        <section class="agenda-section">
          <div class="section-head">
            <span>Próximos eventos</span>
          </div>

          <div class="compact-list">
            <button
              v-for="event in upcomingEvents"
              :key="event.id"
              class="compact-item"
              @click="openEventModal(event)"
            >
              <span>{{ formatShort(event.startDate) }}</span>
              <strong>{{ event.title }}</strong>
              <small>{{ formatTimeRange(event) }}</small>
            </button>
          </div>
        </section>
      </aside>
    </div>

    <EventModal
      v-model="showEventModal"
      :event="selectedEvent"
      :saving="saving"
      @save="handleSave"
      @delete="handleDelete"
    />
  </div>
</template>

<style scoped>
.cal-page {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  color: var(--text);
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.header-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-title {
  margin: 0;
  color: var(--text);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.035em;
}

.page-sub {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.source-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--success) 22%, transparent);
  font-size: 10px;
}

.source-pill--error {
  color: var(--warn);
  background: color-mix(in srgb, var(--warn) 12%, transparent);
  border-color: color-mix(in srgb, var(--warn) 22%, transparent);
}

.header-actions,
.month-nav,
.toolbar-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-ghost,
.nav-btn,
.side-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary,
.btn-ghost {
  height: 34px;
  padding: 0 12px;
}

.btn-ghost--ok {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 40%, var(--border)) !important;
  background: color-mix(in srgb, var(--success) 10%, var(--surface)) !important;
}

.btn-ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  color: var(--accent-fg);
  background: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, var(--text));
}

.btn-ghost,
.nav-btn,
.side-new {
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.summary-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.summary-card svg {
  color: var(--accent);
}

.summary-card span {
  color: var(--text-3);
  font-size: 12px;
}

.summary-card strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.nav-btn {
  width: 30px;
  height: 30px;
}

.month-label {
  min-width: 170px;
  text-align: center;
  color: var(--text);
  font-weight: 800;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
}

.meta-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: start;
}

.grid-wrap,
.sidebar {
  overflow: hidden;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.grid-wrap {
  position: relative;
}

/* Overlay de loading sutil (não substitui a grade) */
.grid-loading {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  color: var(--text-2);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--border);
  backdrop-filter: blur(6px);
  font-size: 11px;
  font-weight: 700;
}

/* View toggle Mês/Semana */
.view-toggle {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.view-btn {
  height: 28px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.view-btn:hover {
  color: var(--text);
}

.view-btn--active {
  color: var(--accent-fg);
  background: var(--accent);
}

.weekdays,
.days-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.weekday {
  min-height: 38px;
  display: grid;
  place-items: center;
  color: var(--text-4);
  background: var(--surface-2);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  font-size: 10.5px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.weekday:nth-child(7n) {
  border-right: none;
}

.day {
  min-height: 132px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 9px;
  border: none;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.day:nth-child(7n) {
  border-right: none;
}

.day:hover {
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.day--other {
  color: var(--text-4);
  background: color-mix(in srgb, var(--surface-2) 42%, transparent);
}

.day--today .day-num,
.day--selected .day-num {
  color: var(--accent-fg);
  background: var(--accent);
}

.day--selected {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 58%, transparent);
}

.day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.day-num {
  width: 25px;
  height: 25px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
}

.day-count {
  min-width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 10px;
  font-weight: 900;
}

.day-events {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ev-pill {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  min-height: 23px;
  padding: 0 7px;
  border-radius: var(--radius-sm);
  color: var(--text);
  background: color-mix(in srgb, var(--ev-c) 18%, transparent);
  border-left: 3px solid var(--ev-c);
  font-size: 11px;
  font-weight: 700;
}

.ev-time {
  color: var(--ev-c);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.ev-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ev-pill--cont {
  opacity: 0.92;
}

.ev-cont-icon {
  color: var(--ev-c);
}

.ev-more {
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
}

/* ─── Week view ─────────────────────────────────────────────────────────── */
.week-head {
  display: grid;
  grid-template-columns: 56px repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
}

.week-gutter-head {
  border-right: 1px solid var(--border);
  background: var(--surface-2);
}

.week-day-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border: none;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  cursor: pointer;
}

.week-day-head:last-child {
  border-right: none;
}

.week-dow {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-4);
}

.week-dnum {
  width: 26px;
  height: 26px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 900;
}

.week-day-head--today .week-dnum {
  color: var(--accent-fg);
  background: var(--accent);
}

.week-day-head--selected {
  box-shadow: inset 0 -2px 0 0 var(--accent);
}

/* Barra all-day */
.week-allday {
  display: grid;
  grid-template-columns: 56px repeat(7, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
  max-height: 92px;
  overflow-y: auto;
}

.week-allday-label {
  display: grid;
  place-items: center;
  font-size: 9.5px;
  font-weight: 800;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.week-allday-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px;
  border-right: 1px solid var(--border);
}

.week-allday-col:last-child {
  border-right: none;
}

.allday-pill {
  overflow: hidden;
  padding: 3px 7px;
  border-radius: var(--radius-sm);
  color: var(--text);
  background: color-mix(in srgb, var(--ev-c) 20%, transparent);
  border-left: 3px solid var(--ev-c);
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

/* Time-grid */
.week-grid-scroll {
  max-height: 560px;
  overflow-y: auto;
}

.week-grid {
  position: relative;
  display: grid;
  grid-template-columns: 56px repeat(7, minmax(0, 1fr));
}

.week-gutter {
  border-right: 1px solid var(--border);
}

.hour-cell {
  position: relative;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}

.hour-label {
  position: absolute;
  top: -7px;
  right: 6px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.week-col {
  position: relative;
  border-right: 1px solid var(--border);
}

.week-col:last-child {
  border-right: none;
}

.week-col--today {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.week-slot {
  border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
}

.now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  z-index: 3;
}

.now-dot {
  position: absolute;
  left: -1px;
  top: -3px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
}

.week-event {
  position: absolute;
  left: 3px;
  right: 3px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  color: var(--text);
  background: color-mix(in srgb, var(--ev-c) 22%, var(--surface));
  border-left: 3px solid var(--ev-c);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.week-event-time {
  color: var(--ev-c);
  font-size: 9.5px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.week-event-title {
  overflow: hidden;
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spin {
  animation: spin 0.8s linear infinite;
}

.sidebar {
  padding: 16px;
}

.side-head {
  margin-bottom: 14px;
}

.side-title {
  margin: 6px 0 0;
  color: var(--text);
  font-size: 18px;
  letter-spacing: -0.03em;
}

.agenda-section + .agenda-section {
  margin-top: 18px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 9px;
  color: var(--text-2);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.side-new {
  height: 28px;
  padding: 0 8px;
  color: var(--text-2);
  font-size: 11px;
}

.side-empty {
  padding: 18px;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  font-size: 12.5px;
  text-align: center;
}

.side-empty.compact {
  padding: 12px;
}

.side-list,
.deliverable-list,
.compact-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.side-item,
.deliverable-item,
.compact-item {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.side-card {
  display: flex;
  flex-direction: column;
}

.side-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
}

.side-card:has(.side-actions) .side-item {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.side-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-top: none;
  border-radius: 0 0 var(--radius) var(--radius);
  background: color-mix(in srgb, var(--surface-2) 60%, transparent);
}

.side-meet {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  color: var(--info);
  background: color-mix(in srgb, var(--info) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--info) 30%, transparent);
  font-size: 11px;
  font-weight: 800;
  text-decoration: none;
}

.side-meet:hover {
  background: color-mix(in srgb, var(--info) 22%, transparent);
}

.side-activity {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  overflow: hidden;
  padding: 5px 9px;
  border-radius: var(--radius-sm);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.side-icon {
  width: 30px;
  height: 30px;
  display: inline-grid;
  place-items: center;
  border-radius: var(--radius-sm);
  color: var(--ev-c);
  background: color-mix(in srgb, var(--ev-c) 14%, transparent);
}

.side-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.side-item-title,
.compact-item strong {
  overflow: hidden;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-item-meta,
.compact-item small,
.deliverable-item small {
  color: var(--text-4);
  font-size: 11px;
  font-weight: 700;
}

.side-badge {
  padding: 4px 7px;
  border-radius: 999px;
  color: var(--ev-c);
  background: color-mix(in srgb, var(--ev-c) 12%, transparent);
  font-size: 10.5px;
  font-weight: 800;
}

.deliverable-item,
.compact-item {
  display: grid;
  gap: 7px;
  padding: 9px;
}

.deliverable-item {
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
}

.deliverable-item svg {
  color: var(--err);
}

.compact-item {
  grid-template-columns: 50px minmax(0, 1fr) auto;
  align-items: center;
}

.compact-item > span {
  color: var(--accent);
  font-size: 11px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1040px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .cal-page {
    padding: 16px;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .grid-wrap {
    overflow-x: auto;
  }

  .weekdays,
  .days-grid,
  .week-head,
  .week-allday,
  .week-grid {
    min-width: 760px;
  }

  .day {
    min-height: 120px;
  }

  .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
