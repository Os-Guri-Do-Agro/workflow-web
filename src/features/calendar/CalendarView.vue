<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Link2,
  Loader2,
  Video,
  Flag,
  Bell,
  Zap,
  RotateCcw,
  CheckSquare,
  User as UserIcon,
  type LucideIcon,
} from 'lucide-vue-next'
import eventsService from '@/service/events/events-service'
import EventModal from '@/components/modals/EventModal.vue'
import { useToast } from '@/composables/useToast'

const { success, error: showError } = useToast()

type EventType =
  | 'MEETING'
  | 'DEADLINE'
  | 'REMINDER'
  | 'SPRINT'
  | 'RETROSPECTIVE'
  | 'TASK'
  | 'PERSONAL'

const EVENT_META: Record<EventType, { label: string; token: string; icon: LucideIcon }> = {
  MEETING: { label: 'Reunião', token: 'var(--info)', icon: Video },
  DEADLINE: { label: 'Prazo', token: 'var(--err)', icon: Flag },
  REMINDER: { label: 'Lembrete', token: 'var(--warn)', icon: Bell },
  SPRINT: { label: 'Sprint', token: 'var(--success)', icon: Zap },
  RETROSPECTIVE: { label: 'Retrospectiva', token: 'var(--status-test)', icon: RotateCcw },
  TASK: { label: 'Tarefa', token: 'var(--accent)', icon: CheckSquare },
  PERSONAL: { label: 'Pessoal', token: 'var(--status-todo)', icon: UserIcon },
}

const EVENT_FALLBACK = { label: '—', token: 'var(--text-3)', icon: CalendarDays }

function eventMeta(type: string) {
  return EVENT_META[type as EventType] ?? EVENT_FALLBACK
}

const currentDate = ref(new Date())
const events = ref<any[]>([])
const loading = ref(true)
const linking = ref(false)
const showEventModal = ref(false)
const selectedEvent = ref<any>(null)

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

const daysInMonth = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days: Date[] = []

  const firstDayOfWeek = firstDay.getDay()
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i))
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }

  const lastDayOfWeek = lastDay.getDay()
  for (let i = 1; i < 7 - lastDayOfWeek; i++) {
    days.push(new Date(year, month + 1, i))
  }

  return days
})

const monthLabel = computed(
  () => `${monthNames[currentDate.value.getMonth()]} ${currentDate.value.getFullYear()}`,
)

const upcomingEvents = computed(() => {
  const now = Date.now()
  return [...events.value]
    .filter((e) => new Date(e.startDate).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    )
    .slice(0, 6)
})

onMounted(async () => {
  await fetchEvents()
  loading.value = false
})

async function fetchEvents() {
  try {
    const response = await eventsService.getEvents()
    events.value = Array.isArray(response) ? response : []
  } catch {
    showError('Erro ao carregar eventos')
  }
}

function previousMonth() {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() - 1,
    1,
  )
}

function nextMonth() {
  currentDate.value = new Date(
    currentDate.value.getFullYear(),
    currentDate.value.getMonth() + 1,
    1,
  )
}

function goToToday() {
  currentDate.value = new Date()
}

async function linkGoogle() {
  linking.value = true
  try {
    const response: any = await eventsService.getGoogleAuthUrl()
    const url = response?.data?.url || response?.url
    if (url) {
      window.location.href = url
    } else {
      showError('URL de autorização não recebida')
    }
  } catch {
    showError('Erro ao iniciar a vinculação com o Google')
  } finally {
    linking.value = false
  }
}

function isToday(date: Date): boolean {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

function isCurrentMonth(date: Date): boolean {
  return date.getMonth() === currentDate.value.getMonth()
}

function getDayEvents(date: Date): any[] {
  return events.value.filter((event) => {
    const eventDate = new Date(event.startDate)
    return eventDate.toDateString() === date.toDateString()
  })
}

function openEventModal(event?: any, date?: Date) {
  if (date && !event) {
    const iso = `${date.toISOString().slice(0, 10)}T09:00`
    selectedEvent.value = { startDate: iso }
  } else {
    selectedEvent.value = event || null
  }
  showEventModal.value = true
}

async function handleSave(eventData: any) {
  try {
    if (eventData.id) {
      await eventsService.updateEvent(eventData.id, eventData)
      success('Evento atualizado')
    } else {
      await eventsService.createEvent(eventData)
      success('Evento criado')
    }
    await fetchEvents()
  } catch {
    showError('Erro ao salvar evento')
  }
}

async function handleDelete(id: string) {
  try {
    await eventsService.deleteEvent(id)
    await fetchEvents()
    success('Evento excluído')
  } catch {
    showError('Erro ao excluir evento')
  }
}

function formatShort(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="cal-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-main">
        <span class="eyebrow">
          <CalendarDays :size="11" />
          Agenda
        </span>
        <h1 class="page-title">Calendário</h1>
        <p class="page-sub">Eventos, prazos e integração com o Google Agenda</p>
      </div>

      <div class="header-actions">
        <button class="btn-ghost press" :disabled="linking" @click="linkGoogle">
          <Loader2 v-if="linking" :size="13" class="spin" />
          <Link2 v-else :size="13" />
          Vincular Google
        </button>
        <button class="btn-ghost press" @click="goToToday">
          Hoje
        </button>
        <button class="btn-primary press" @click="openEventModal()">
          <Plus :size="13" />
          Novo evento
        </button>
      </div>
    </header>

    <!-- Toolbar -->
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
        <span class="meta-item">
          <span class="meta-dot" style="background: var(--info)" />
          Reunião
        </span>
        <span class="meta-item">
          <span class="meta-dot" style="background: var(--err)" />
          Prazo
        </span>
        <span class="meta-item">
          <span class="meta-dot" style="background: var(--warn)" />
          Lembrete
        </span>
        <span class="meta-item">
          <span class="meta-dot" style="background: var(--success)" />
          Sprint
        </span>
      </div>
    </div>

    <!-- Layout -->
    <div class="layout">
      <!-- Calendar grid -->
      <section class="grid-wrap">
        <div class="weekdays">
          <div v-for="d in weekDays" :key="d" class="weekday">{{ d }}</div>
        </div>

        <div v-if="loading" class="loading">
          <Loader2 :size="16" class="spin" />
          Carregando eventos…
        </div>

        <div v-else class="days-grid">
          <div
            v-for="date in daysInMonth"
            :key="date.toISOString()"
            class="day"
            :class="{
              'day--today': isToday(date),
              'day--other': !isCurrentMonth(date),
            }"
            @click="openEventModal(undefined, date)"
          >
            <span class="day-num">{{ date.getDate() }}</span>

            <div class="day-events">
              <div
                v-for="event in getDayEvents(date).slice(0, 3)"
                :key="event.id"
                class="ev-pill"
                :style="{
                  '--ev-c': eventMeta(event.type).token,
                }"
                @click.stop="openEventModal(event)"
              >
                <span class="ev-dot" />
                <span class="ev-title">{{ event.title }}</span>
              </div>
              <div v-if="getDayEvents(date).length > 3" class="ev-more">
                +{{ getDayEvents(date).length - 3 }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Upcoming events sidebar -->
      <aside class="sidebar">
        <div class="side-head">
          <span class="eyebrow">
            <CalendarDays :size="11" />
            Próximos
          </span>
          <h3 class="side-title">Agenda da semana</h3>
        </div>

        <div v-if="!upcomingEvents.length" class="side-empty">
          Nenhum evento programado.
        </div>

        <div v-else class="side-list">
          <button
            v-for="event in upcomingEvents"
            :key="event.id"
            class="side-item"
            @click="openEventModal(event)"
          >
            <span
              class="side-icon"
              :style="{
                color: eventMeta(event.type).token,
                background: `color-mix(in srgb, ${eventMeta(event.type).token} 14%, transparent)`,
              }"
            >
              <component :is="eventMeta(event.type).icon" :size="13" />
            </span>
            <div class="side-info">
              <span class="side-item-title">{{ event.title }}</span>
              <span class="side-item-meta">
                {{ formatShort(event.startDate) }} · {{ formatTime(event.startDate) }}
              </span>
            </div>
            <span
              class="side-badge"
              :style="{
                color: eventMeta(event.type).token,
                background: `color-mix(in srgb, ${eventMeta(event.type).token} 12%, transparent)`,
              }"
            >
              {{ eventMeta(event.type).label }}
            </span>
          </button>
        </div>
      </aside>
    </div>

    <EventModal
      v-model="showEventModal"
      :event="selectedEvent"
      @save="handleSave"
      @delete="handleDelete"
    />
  </div>
</template>

<style scoped>
.cal-page {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text);
  min-height: 100%;
}

/* ---- Header ---- */
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
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-3);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--text);
  margin: 0;
}

.page-sub {
  font-size: 12.5px;
  color: var(--text-3);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-primary,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease);
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-ghost {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

.btn-ghost:disabled,
.btn-primary:disabled {
  opacity: 0.6;
  cursor: progress;
}

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  flex-wrap: wrap;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.nav-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.month-label {
  min-width: 170px;
  text-align: center;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.toolbar-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-3);
  font-weight: 500;
}

.meta-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

/* ---- Layout ---- */
.layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

@media (max-width: 1100px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

/* ---- Calendar grid ---- */
.grid-wrap {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  min-height: 0;
}

.weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.weekday {
  padding: 8px 10px;
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 60px;
  color: var(--text-3);
  font-size: 13px;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(110px, 1fr);
  flex: 1;
}

.day {
  position: relative;
  padding: 8px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: background var(--motion-fast) var(--motion-ease);
  min-height: 0;
  overflow: hidden;
}

.day:hover {
  background: var(--surface-2);
}

.day:nth-child(7n) {
  border-right: none;
}

.day--other {
  background: color-mix(in srgb, var(--surface-2) 55%, transparent);
}

.day--other .day-num {
  color: var(--text-4);
}

.day--today {
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}

.day-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-2);
  align-self: flex-start;
  padding: 0 4px;
}

.day--today .day-num {
  background: var(--accent);
  color: var(--accent-fg);
  font-weight: 700;
}

.day-events {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
}

.ev-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--ev-c);
  background: color-mix(in srgb, var(--ev-c) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--ev-c) 20%, transparent);
  cursor: pointer;
  overflow: hidden;
  transition: background var(--motion-fast) var(--motion-ease);
}

.ev-pill:hover {
  background: color-mix(in srgb, var(--ev-c) 22%, transparent);
}

.ev-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ev-c);
  flex-shrink: 0;
}

.ev-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.ev-more {
  font-size: 10.5px;
  color: var(--text-3);
  padding: 1px 6px;
  font-weight: 500;
}

/* ---- Sidebar ---- */
.sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-height: 0;
}

.side-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 4px;
}

.side-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.005em;
}

.side-empty {
  padding: 24px 8px;
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
  background: var(--surface-2);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
}

.side-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
}

.side-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.side-item:hover {
  background: var(--surface-2);
  border-color: var(--border);
}

.side-icon {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.side-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.side-item-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-item-meta {
  font-size: 10.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.side-badge {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

/* ---- Animations ---- */
.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 1.8s;
  }
  .day,
  .ev-pill,
  .side-item,
  .nav-btn,
  .btn-primary,
  .btn-ghost {
    transition-duration: 1ms;
  }
}
</style>
