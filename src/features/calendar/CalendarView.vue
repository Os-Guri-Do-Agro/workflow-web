<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Flag,
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
import eventsService from '@/service/events/events-service'

const { success, error: showError } = useToast()

type EventType =
  | 'MEETING'
  | 'DEADLINE'
  | 'REMINDER'
  | 'SPRINT'
  | 'RETROSPECTIVE'
  | 'TASK'
  | 'PERSONAL'

type CalendarEvent = {
  id?: string
  title: string
  description?: string
  startDate: string
  endDate?: string | null
  type: EventType | string
  recurrence?: string
}

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

function buildMockEvents(baseDate = new Date()): CalendarEvent[] {
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const at = (day: number, time: string) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}T${time}:00`

  return [
    {
      id: 'mock-daily',
      title: 'Daily do time',
      description: 'Alinhamento rápido de prioridades e impedimentos.',
      startDate: at(18, '09:00'),
      endDate: at(18, '09:30'),
      type: 'MEETING',
    },
    {
      id: 'mock-qa',
      title: 'Entrega QA + RC',
      description: 'Pacote de testes para a release candidate.',
      startDate: at(18, '14:00'),
      endDate: at(18, '16:00'),
      type: 'DEADLINE',
    },
    {
      id: 'mock-review',
      title: 'Review do trimestre',
      description: 'Revisão dos objetivos e próximos passos.',
      startDate: at(26, '10:00'),
      endDate: at(26, '11:30'),
      type: 'RETROSPECTIVE',
    },
    {
      id: 'mock-sprint',
      title: 'Sprint de notificações',
      description: 'Implementação e validação das notificações reais.',
      startDate: at(21, '08:30'),
      endDate: at(21, '17:30'),
      type: 'SPRINT',
    },
    {
      id: 'mock-care',
      title: 'Cuidadores e veterinários',
      description: 'Marco para liberar permissões por perfil.',
      startDate: at(29, '13:30'),
      endDate: at(29, '15:00'),
      type: 'TASK',
    },
  ]
}

const currentDate = ref(new Date())
const selectedDate = ref(new Date())
const events = ref<CalendarEvent[]>([])
const loading = ref(false)
const usingMockData = ref(true)
const showEventModal = ref(false)
const selectedEvent = ref<CalendarEvent | null>(null)

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
const dataSourceLabel = computed(() => (usingMockData.value ? 'Exemplos locais' : 'Eventos da API'))

onMounted(fetchEvents)
watch(currentDate, fetchEvents)

function currentRange() {
  const first = daysInMonth.value[0] ?? currentDate.value
  const last = daysInMonth.value[daysInMonth.value.length - 1] ?? currentDate.value
  return {
    start: startOfDay(first).toISOString(),
    end: endOfDay(last).toISOString(),
  }
}

async function fetchEvents() {
  loading.value = true
  try {
    const response = await eventsService.getEvents(currentRange())
    const apiEvents = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : []
    if (!apiEvents.length) throw new Error('Eventos da API vazios ou indisponíveis')
    events.value = apiEvents
    usingMockData.value = false
  } catch {
    events.value = buildMockEvents(currentDate.value)
    usingMockData.value = true
    showError('API de calendário indisponível. Mostrando eventos de exemplo.')
  } finally {
    loading.value = false
  }
}

function previousMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
  selectedDate.value = new Date(currentDate.value)
}

function nextMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1)
  selectedDate.value = new Date(currentDate.value)
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
  return events.value
    .filter((event) => new Date(event.startDate).toDateString() === date.toDateString())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
}

function openEventModal(event?: CalendarEvent, date?: Date) {
  if (date && !event) {
    selectedEvent.value = { title: '', startDate: `${toDateInputValue(date)}T09:00`, type: 'MEETING' }
  } else {
    selectedEvent.value = event ?? null
  }
  showEventModal.value = true
}

function openSelectedDayEventModal() {
  openEventModal(undefined, selectedDate.value)
}

async function handleSave(eventData: CalendarEvent) {
  const payload = { ...eventData, endDate: eventData.endDate ?? undefined }

  if (usingMockData.value || payload.id?.startsWith('mock-') || payload.id?.startsWith('local-')) {
    applyLocalSave(payload)
    success(payload.id ? 'Evento atualizado localmente' : 'Evento criado localmente')
    return
  }

  try {
    if (payload.id) {
      await eventsService.updateEvent(payload.id, payload)
      success('Evento atualizado')
    } else {
      await eventsService.createEvent(payload)
      success('Evento criado')
    }
    await fetchEvents()
  } catch {
    applyLocalSave(payload)
    usingMockData.value = true
    showError('API não salvou o evento. Mantive a alteração localmente.')
  }
}

async function handleDelete(id: string) {
  if (usingMockData.value || id.startsWith('mock-') || id.startsWith('local-')) {
    events.value = events.value.filter((event) => event.id !== id)
    success('Evento excluído localmente')
    return
  }

  try {
    await eventsService.deleteEvent(id)
    await fetchEvents()
    success('Evento excluído')
  } catch {
    events.value = events.value.filter((event) => event.id !== id)
    usingMockData.value = true
    showError('API não removeu o evento. Removi apenas localmente.')
  }
}

function applyLocalSave(eventData: CalendarEvent) {
  const id = eventData.id ?? `local-${Date.now()}`
  const nextEvent = { ...eventData, id }
  const index = events.value.findIndex((event) => event.id === id)

  if (index >= 0) {
    events.value.splice(index, 1, nextEvent)
  } else {
    events.value.push(nextEvent)
  }
}

function eventMeta(type: string) {
  return EVENT_META[type as EventType] ?? EVENT_FALLBACK
}

function eventStyle(event: CalendarEvent) {
  return { '--ev-c': eventMeta(event.type).token }
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
</script>

<template>
  <div class="cal-page">
    <header class="page-header">
      <div class="header-main">
        <span class="eyebrow">
          <CalendarDays :size="11" />
          Agenda
          <span class="source-pill" :class="{ 'source-pill--mock': usingMockData }">
            <Loader2 v-if="loading" :size="11" class="spin" />
            {{ loading ? 'Sincronizando...' : dataSourceLabel }}
          </span>
        </span>
        <h1 class="page-title">Calendário</h1>
        <p class="page-sub">Eventos, prazos e atividades do dia em uma agenda clicável</p>
      </div>

      <div class="header-actions">
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
        <button class="nav-btn" aria-label="Mês anterior" @click="previousMonth">
          <ChevronLeft :size="15" />
        </button>
        <span class="month-label">{{ monthLabel }}</span>
        <button class="nav-btn" aria-label="Próximo mês" @click="nextMonth">
          <ChevronRight :size="15" />
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
      <section class="grid-wrap" aria-label="Calendário mensal">
        <div class="weekdays">
          <div v-for="day in weekDays" :key="day" class="weekday">{{ day }}</div>
        </div>

        <div v-if="loading" class="loading">
          <Loader2 :size="16" class="spin" />
          Carregando eventos...
        </div>

        <div v-else class="days-grid">
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
                :style="eventStyle(event)"
                @click.stop="openEventModal(event)"
              >
                <span class="ev-time">{{ formatTime(event.startDate) }}</span>
                <span class="ev-title">{{ event.title }}</span>
              </span>
              <span v-if="getDayEvents(date).length > 3" class="ev-more">
                +{{ getDayEvents(date).length - 3 }}
              </span>
            </span>
          </button>
        </div>
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
            <button
              v-for="event in selectedDayEvents"
              :key="event.id"
              class="side-item"
              @click="openEventModal(event)"
            >
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

    <EventModal v-model="showEventModal" :event="selectedEvent" @save="handleSave" @delete="handleDelete" />
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

.source-pill--mock {
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

.ev-more {
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
}

.loading {
  min-height: 420px;
  display: grid;
  place-items: center;
  color: var(--text-3);
  font-size: 13px;
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

.side-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px;
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
  .days-grid {
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
