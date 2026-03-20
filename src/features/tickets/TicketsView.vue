<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import ticketService from '@/service/tickets/ticket-service'

type Ticket = {
  id: string
  title: string
  description: string
  status: string
  createdAt: string
  createdBy: {
    id: string
    name: string
  }
}

const tickets = ref<Ticket[]>([])
const loading = ref(false)
const dialog = ref(false)
const deleteDialog = ref(false)
const detailsDialog = ref(false)
const editMode = ref(false)
const selectedTicket = ref<Ticket | null>(null)
const snackbar = ref(false)
const snackbarMessage = ref('')
const snackbarColor = ref('error')
const activeFilter = ref<string>('ALL')

const form = ref({
  title: '',
  description: '',
  status: 'TODO',
})

const statusMap: Record<string, { color: string; label: string; icon: string }> = {
  TODO:        { color: '#6B7280', label: 'A Fazer',      icon: 'mdi-circle-outline' },
  IN_PROGRESS: { color: '#F59E0B', label: 'Em Progresso', icon: 'mdi-circle-slice-4' },
  IN_TESTING:  { color: '#8B5CF6', label: 'Em Teste',     icon: 'mdi-circle-slice-6' },
  DONE:        { color: '#10B981', label: 'Concluído',    icon: 'mdi-check-circle' },
}

const statusOptions = Object.entries(statusMap).map(([value, s]) => ({ value, label: s.label }))

const filterOptions = [
  { value: 'ALL', label: 'Todos' },
  ...statusOptions,
]

const filteredTickets = computed(() => {
  if (activeFilter.value === 'ALL') return tickets.value
  return tickets.value.filter((t) => t.status === activeFilter.value)
})

const statusCounts = computed(() => {
  const counts: Record<string, number> = { ALL: tickets.value.length }
  for (const key of Object.keys(statusMap)) {
    counts[key] = tickets.value.filter((t) => t.status === key).length
  }
  return counts
})

const getUserInitials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

const getUserColor = (name: string) => {
  const colors = ['#1976D2', '#388E3C', '#D32F2F', '#7B1FA2', '#F57C00', '#0097A7']
  const index = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length
  return colors[index]
}

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

const loadTickets = async () => {
  loading.value = true
  try {
    const response = await ticketService.getTickets()
    tickets.value = response.data || response
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao carregar tickets', 'error')
  } finally {
    loading.value = false
  }
}

const openCreateDialog = () => {
  editMode.value = false
  form.value = { title: '', description: '', status: 'TODO' }
  dialog.value = true
}

const openDetailsDialog = (ticket: Ticket) => {
  selectedTicket.value = ticket
  detailsDialog.value = true
}

const openEditDialog = (ticket: Ticket) => {
  editMode.value = true
  selectedTicket.value = ticket
  form.value = { title: ticket.title, description: ticket.description, status: ticket.status }
  detailsDialog.value = false
  dialog.value = true
}

const openDeleteDialog = (ticket: Ticket) => {
  selectedTicket.value = ticket
  detailsDialog.value = false
  deleteDialog.value = true
}

const saveTicket = async () => {
  loading.value = true
  try {
    if (editMode.value && selectedTicket.value) {
      await ticketService.patchTicket(selectedTicket.value.id, form.value)
      showSnackbar('Ticket atualizado com sucesso', 'success')
    } else {
      await ticketService.postTicket(form.value)
      showSnackbar('Ticket criado com sucesso', 'success')
    }
    dialog.value = false
    await loadTickets()
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao salvar ticket', 'error')
  } finally {
    loading.value = false
  }
}

const deleteTicket = async () => {
  if (!selectedTicket.value) return
  loading.value = true
  try {
    await ticketService.deletTicket(selectedTicket.value.id)
    deleteDialog.value = false
    await loadTickets()
    showSnackbar('Ticket excluído', 'success')
  } catch (error: any) {
    showSnackbar(error.response?.data?.message || 'Erro ao excluir ticket', 'error')
  } finally {
    loading.value = false
  }
}

const showSnackbar = (msg: string, color: string) => {
  snackbarMessage.value = msg
  snackbarColor.value = color
  snackbar.value = true
}

onMounted(loadTickets)
</script>

<template>
  <div class="tickets-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1 class="page-title">Tickets</h1>
        <p class="page-subtitle">Gerencie solicitações e suporte</p>
      </div>
      <v-btn
        variant="flat"
        size="default"
        prepend-icon="mdi-plus"
        class="new-btn"
        @click="openCreateDialog"
      >
        Novo Ticket
      </v-btn>
    </div>

    <!-- Filter bar -->
    <div class="filter-bar">
      <button
        v-for="f in filterOptions"
        :key="f.value"
        class="filter-chip"
        :class="{ active: activeFilter === f.value }"
        @click="activeFilter = f.value"
      >
        <span
          v-if="f.value !== 'ALL'"
          class="filter-dot"
          :style="{ backgroundColor: statusMap[f.value]?.color }"
        />
        {{ f.label }}
        <span class="filter-count">{{ statusCounts[f.value] }}</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-row">
      <div v-for="i in 4" :key="i" class="ticket-skeleton" />
    </div>

    <!-- Empty state -->
    <div v-else-if="filteredTickets.length === 0" class="empty-state">
      <v-icon size="52" color="grey-darken-1">mdi-ticket-outline</v-icon>
      <p class="empty-title">Nenhum ticket encontrado</p>
      <p class="empty-sub">
        {{ activeFilter === 'ALL' ? 'Crie seu primeiro ticket clicando em Novo Ticket' : 'Nenhum ticket com este status' }}
      </p>
    </div>

    <!-- Grid -->
    <div v-else class="tickets-grid">
      <div
        v-for="ticket in filteredTickets"
        :key="ticket.id"
        class="ticket-card"
        @click="openDetailsDialog(ticket)"
      >
        <!-- status accent top bar -->
        <div
          class="ticket-accent"
          :style="{ backgroundColor: statusMap[ticket.status]?.color }"
        />

        <div class="ticket-body">
          <!-- status badge -->
          <div class="ticket-top">
            <div
              class="status-pill"
              :style="{
                color: statusMap[ticket.status]?.color,
                backgroundColor: (statusMap[ticket.status]?.color ?? '#6B7280') + '18',
              }"
            >
              <v-icon size="11">{{ statusMap[ticket.status]?.icon }}</v-icon>
              {{ statusMap[ticket.status]?.label }}
            </div>
          </div>

          <!-- title -->
          <p class="ticket-title">{{ ticket.title }}</p>

          <!-- description -->
          <p v-if="ticket.description" class="ticket-desc">{{ ticket.description }}</p>

          <!-- footer -->
          <div class="ticket-footer">
            <div class="ticket-author">
              <div
                class="author-avatar"
                :style="{ backgroundColor: getUserColor(ticket.createdBy.name) }"
              >
                {{ getUserInitials(ticket.createdBy.name) }}
              </div>
              <span class="author-name">{{ ticket.createdBy.name }}</span>
            </div>
            <span class="ticket-date">{{ formatDate(ticket.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Details dialog ─── -->
    <v-dialog v-model="detailsDialog" max-width="560" :scrim-opacity="0.6">
      <v-card v-if="selectedTicket" class="dialog-card" rounded="xl">
        <div class="dialog-header">
          <div class="d-flex align-center ga-3">
            <div
              class="dialog-status-dot"
              :style="{ backgroundColor: statusMap[selectedTicket.status]?.color }"
            />
            <span class="dialog-title-text">{{ selectedTicket.title }}</span>
          </div>
          <v-btn icon size="small" variant="text" @click="detailsDialog = false">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>

        <div class="dialog-body">
          <div
            class="status-pill mb-4"
            style="width: fit-content"
            :style="{
              color: statusMap[selectedTicket.status]?.color,
              backgroundColor: (statusMap[selectedTicket.status]?.color ?? '#6B7280') + '18',
            }"
          >
            <v-icon size="11">{{ statusMap[selectedTicket.status]?.icon }}</v-icon>
            {{ statusMap[selectedTicket.status]?.label }}
          </div>

          <p v-if="selectedTicket.description" class="dialog-desc">{{ selectedTicket.description }}</p>

          <div class="dialog-meta">
            <div class="d-flex align-center ga-2">
              <div
                class="author-avatar"
                :style="{ backgroundColor: getUserColor(selectedTicket.createdBy.name) }"
              >
                {{ getUserInitials(selectedTicket.createdBy.name) }}
              </div>
              <span style="font-size: 13px; color: rgba(var(--v-theme-secondary), 0.6)">
                {{ selectedTicket.createdBy.name }}
              </span>
            </div>
            <span style="font-size: 12px; color: rgba(var(--v-theme-secondary), 0.35)">
              {{ formatDate(selectedTicket.createdAt) }}
            </span>
          </div>
        </div>

        <div class="dialog-actions">
          <v-btn
            size="small"
            variant="text"
            color="error"
            prepend-icon="mdi-delete-outline"
            @click="openDeleteDialog(selectedTicket)"
          >
            Excluir
          </v-btn>
          <v-spacer />
          <v-btn
            size="small"
            variant="flat"
            class="edit-btn"
            prepend-icon="mdi-pencil-outline"
            @click="openEditDialog(selectedTicket)"
          >
            Editar
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- ─── Create / Edit dialog ─── -->
    <v-dialog v-model="dialog" max-width="520" :scrim-opacity="0.6">
      <v-card class="dialog-card" rounded="xl">
        <div class="dialog-header">
          <span class="dialog-title-text">{{ editMode ? 'Editar Ticket' : 'Novo Ticket' }}</span>
          <v-btn icon size="small" variant="text" @click="dialog = false">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
        <div class="dialog-body">
          <v-text-field
            v-model="form.title"
            label="Título"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            class="mb-3"
          />
          <v-textarea
            v-model="form.description"
            label="Descrição"
            variant="outlined"
            density="comfortable"
            rounded="lg"
            rows="4"
            class="mb-3"
          />
          <v-select
            v-model="form.status"
            :items="statusOptions"
            item-title="label"
            item-value="value"
            label="Status"
            variant="outlined"
            density="comfortable"
            rounded="lg"
          />
        </div>
        <div class="dialog-actions">
          <v-btn variant="text" size="small" @click="dialog = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn variant="flat" size="small" class="edit-btn" :loading="loading" @click="saveTicket">
            Salvar
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- ─── Delete confirm dialog ─── -->
    <v-dialog v-model="deleteDialog" max-width="400" :scrim-opacity="0.6">
      <v-card class="dialog-card" rounded="xl">
        <div class="dialog-header">
          <span class="dialog-title-text">Confirmar exclusão</span>
          <v-btn icon size="small" variant="text" @click="deleteDialog = false">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
        <div class="dialog-body">
          <p style="font-size: 14px; color: rgba(var(--v-theme-secondary), 0.65)">
            Tem certeza que deseja excluir
            <strong style="color: rgb(var(--v-theme-secondary))">"{{ selectedTicket?.title }}"</strong>?
            Esta ação não pode ser desfeita.
          </p>
        </div>
        <div class="dialog-actions">
          <v-btn variant="text" size="small" @click="deleteDialog = false">Cancelar</v-btn>
          <v-spacer />
          <v-btn variant="flat" size="small" color="error" :loading="loading" @click="deleteTicket">
            Excluir
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000" location="top right" rounded="lg">
      {{ snackbarMessage }}
    </v-snackbar>
  </div>
</template>

<style scoped>
/* ─── Page layout ─── */
.tickets-page {
  padding: 24px;
  max-width: 100%;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  margin: 0 0 3px;
  letter-spacing: -0.02em;
}

.page-subtitle {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.45);
  margin: 0;
}

.new-btn {
  background: rgb(var(--v-theme-secondary)) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
  font-size: 13px;
  border-radius: 10px !important;
}

/* ─── Filter bar ─── */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(var(--v-theme-secondary), 0.5);
  background: rgba(var(--v-theme-secondary), 0.06);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.filter-chip:hover {
  color: rgba(var(--v-theme-secondary), 0.8);
  background: rgba(var(--v-theme-secondary), 0.09);
}

.filter-chip.active {
  color: rgb(var(--v-theme-secondary));
  background: rgba(var(--v-theme-secondary), 0.1);
  border-color: rgba(var(--v-theme-secondary), 0.15);
}

.filter-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-count {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.35);
  margin-left: 1px;
}

/* ─── Grid ─── */
.tickets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

/* ─── Ticket card ─── */
.ticket-card {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}

.ticket-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2);
  border-color: rgba(var(--v-theme-secondary), 0.13);
}

.ticket-accent {
  height: 3px;
  width: 100%;
  opacity: 0.6;
}

.ticket-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ticket-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  letter-spacing: 0.01em;
}

.ticket-title {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ticket-desc {
  font-size: 12.5px;
  color: rgba(var(--v-theme-secondary), 0.45);
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ticket-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.06);
}

.ticket-author {
  display: flex;
  align-items: center;
  gap: 7px;
}

.author-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.author-name {
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.5);
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-date {
  font-size: 11.5px;
  color: rgba(var(--v-theme-secondary), 0.3);
}

/* ─── Loading skeleton ─── */
.loading-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.ticket-skeleton {
  height: 160px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-secondary), 0.04) 0%,
    rgba(var(--v-theme-secondary), 0.08) 50%,
    rgba(var(--v-theme-secondary), 0.04) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ─── Empty state ─── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  gap: 8px;
}

.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.5);
  margin: 0;
}

.empty-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.3);
  margin: 0;
  text-align: center;
}

/* ─── Dialogs ─── */
.dialog-card {
  background: rgb(var(--v-theme-primary)) !important;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1) !important;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.07);
  gap: 12px;
}

.dialog-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dialog-title-text {
  font-size: 15px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  line-height: 1.3;
}

.dialog-body {
  padding: 18px;
}

.dialog-desc {
  font-size: 14px;
  color: rgba(var(--v-theme-secondary), 0.6);
  line-height: 1.6;
  margin: 0 0 16px;
}

.dialog-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.07);
}

.dialog-actions {
  display: flex;
  align-items: center;
  padding: 12px 18px 18px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.07);
  gap: 8px;
}

.edit-btn {
  background: rgb(var(--v-theme-secondary)) !important;
  color: rgb(var(--v-theme-primary)) !important;
  font-weight: 600;
  font-size: 12.5px;
  border-radius: 8px !important;
}
</style>
