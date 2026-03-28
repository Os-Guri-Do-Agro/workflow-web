<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import eventsService from '@/service/events/events-service'
import EventModal from '@/components/modals/EventModal.vue'

const currentDate = ref(new Date())
const events = ref<any[]>([])
const loading = ref(true)
const showEventModal = ref(false)
const selectedEvent = ref<any>(null)

const daysInMonth = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days: Date[] = []
  
  // Preenche com dias do mês anterior para completar a semana
  const firstDayOfWeek = firstDay.getDay()
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i))
  }
  
  // Dias do mês atual
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i))
  }
  
  // Preenche com dias do próximo mês para completar a última semana
  const lastDayOfWeek = lastDay.getDay()
  for (let i = 1; i < 7 - lastDayOfWeek; i++) {
    days.push(new Date(year, month + 1, i))
  }
  
  return days
})

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

onMounted(async () => {
  await fetchEvents()
  loading.value = false
})

async function fetchEvents() {
  try {
    const response = await eventsService.getEvents()
    events.value = response
  } catch (e) {
    console.error('Erro ao buscar eventos:', e)
  }
}

function previousMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1)
}

function nextMonth() {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1)
}

function isToday(date: Date): boolean {
  const today = new Date()
  return date.toDateString() === today.toDateString()
}

function isCurrentMonth(date: Date): boolean {
  return date.getMonth() === currentDate.value.getMonth()
}

function getDayEvents(date: Date): any[] {
  return events.value.filter(event => {
    const eventDate = new Date(event.startDate)
    return eventDate.toDateString() === date.toDateString()
  })
}

function getEventColor(type: string): string {
  const colors: Record<string, string> = {
    'MEETING': '#3B82F6',
    'DEADLINE': '#EF4444',
    'REMINDER': '#F59E0B',
    'SPRINT': '#10B981',
    'RETROSPECTIVE': '#8B5CF6',
  }
  return colors[type] || '#6B7280'
}

function openEventModal(event?: any, date?: Date) {
  if (date && !event) {
    const iso = date.toISOString().slice(0, 10) + 'T09:00'
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
    } else {
      await eventsService.createEvent(eventData)
    }
    await fetchEvents()
  } catch (e) {
    console.error('Erro ao salvar evento:', e)
  }
}

async function handleDelete(id: string) {
  try {
    await eventsService.deleteEvent(id)
    await fetchEvents()
  } catch (e) {
    console.error('Erro ao deletar evento:', e)
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="calendar-page">
    <div class="calendar-header">
      <div class="header-left">
        <h1 class="calendar-title">Calendário</h1>
        <p class="calendar-sub">Eventos e prazos do time</p>
      </div>
      <div class="header-actions">
        <button class="create-btn" @click="openEventModal()">
          <v-icon size="16">mdi-plus</v-icon>
          Novo Evento
        </button>
      </div>
    </div>

    <div class="calendar-toolbar">
      <div class="month-nav">
        <button class="nav-btn" @click="previousMonth">
          <v-icon size="18">mdi-chevron-left</v-icon>
        </button>
        <span class="month-title">
          {{ monthNames[currentDate.getMonth()] }} {{ currentDate.getFullYear() }}
        </span>
        <button class="nav-btn" @click="nextMonth">
          <v-icon size="18">mdi-chevron-right</v-icon>
        </button>
      </div>
    </div>

    <div class="calendar-grid">
      <div class="week-header">
        <div v-for="day in weekDays" :key="day" class="week-day">
          {{ day }}
        </div>
      </div>

      <div v-if="loading" class="calendar-loading">
        Carregando...
      </div>

      <div v-else class="days-grid">
        <div
          v-for="date in daysInMonth"
          :key="date.toISOString()"
          class="day-cell"
          :class="{
            'day-cell--today': isToday(date),
            'day-cell--other-month': !isCurrentMonth(date),
          }"
          @click="openEventModal(undefined, date)"
        >
          <span class="day-number">{{ date.getDate() }}</span>
          <div class="day-events">
            <div
              v-for="event in getDayEvents(date).slice(0, 3)"
              :key="event.id"
              class="event-chip"
              :style="{ backgroundColor: getEventColor(event.type) + '20', color: getEventColor(event.type) }"
              @click.stop="openEventModal(event)"
            >
              {{ event.title }}
            </div>
            <div v-if="getDayEvents(date).length > 3" class="more-events">
              +{{ getDayEvents(date).length - 3 }} mais
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Upcoming Events -->
    <div class="upcoming-section">
      <h3 class="section-title">Próximos Eventos</h3>
      <div v-if="events.length === 0" class="upcoming-empty">
        Nenhum evento programado
      </div>
      <div v-else class="upcoming-list">
        <div
          v-for="event in events.slice(0, 5)"
          :key="event.id"
          class="upcoming-item"
          @click="openEventModal(event)"
        >
          <div
            class="event-dot"
            :style="{ backgroundColor: getEventColor(event.type) }"
          />
          <div class="upcoming-info">
            <span class="upcoming-title">{{ event.title }}</span>
            <span class="upcoming-date">{{ formatDate(event.startDate) }}</span>
          </div>
          <span
            class="event-type-badge"
            :style="{ backgroundColor: getEventColor(event.type) + '20', color: getEventColor(event.type) }"
          >
            {{ event.type }}
          </span>
        </div>
      </div>
    </div>
  </div>

  <EventModal
    v-model="showEventModal"
    :event="selectedEvent"
    @save="handleSave"
    @delete="handleDelete"
  />
</template>

<style scoped>
.calendar-page {
  padding: 24px;
  height: 100%;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.calendar-title {
  font-size: 22px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  margin: 0 0 3px;
}

.calendar-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.4);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgb(var(--v-theme-secondary));
  color: rgb(var(--v-theme-primary));
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: rgba(var(--v-theme-secondary), 0.05);
  color: rgba(var(--v-theme-secondary), 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-btn:hover {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

.month-title {
  font-size: 16px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  min-width: 180px;
  text-align: center;
}

.calendar-grid {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 20px;
}

.week-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.08);
}

.week-day {
  padding: 10px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.5);
  text-transform: uppercase;
}

.calendar-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, 1fr);
  min-height: 400px;
}

.day-cell {
  border-right: 1px solid rgba(var(--v-theme-secondary), 0.05);
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.05);
  padding: 8px;
  min-height: 100px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.day-cell:hover {
  background: rgba(var(--v-theme-secondary), 0.02);
}

.day-cell:nth-child(7n) {
  border-right: none;
}

.day-cell--today {
  background: rgba(59, 130, 246, 0.05);
}

.day-cell--today .day-number {
  background: #3B82F6;
  color: white;
}

.day-cell--other-month {
  background: rgba(var(--v-theme-secondary), 0.02);
}

.day-cell--other-month .day-number {
  color: rgba(var(--v-theme-secondary), 0.3);
}

.day-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-secondary), 0.7);
  margin-bottom: 4px;
}

.day-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-chip {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.event-chip:hover {
  opacity: 0.8;
}

.more-events {
  font-size: 10px;
  color: rgba(var(--v-theme-secondary), 0.4);
  padding: 2px 6px;
}

.upcoming-section {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-radius: 12px;
  padding: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  margin: 0 0 12px;
}

.upcoming-empty {
  text-align: center;
  padding: 20px;
  color: rgba(var(--v-theme-secondary), 0.4);
  font-size: 13px;
}

.upcoming-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upcoming-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.upcoming-item:hover {
  background: rgba(var(--v-theme-secondary), 0.04);
}

.event-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.upcoming-info {
  flex: 1;
  min-width: 0;
}

.upcoming-title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: rgb(var(--v-theme-secondary));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upcoming-date {
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.5);
}

.event-type-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 4px;
  text-transform: uppercase;
}
</style>
