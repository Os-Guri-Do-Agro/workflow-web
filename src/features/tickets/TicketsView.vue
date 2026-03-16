<script setup lang="ts">
import { ref, onMounted } from 'vue'
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

const form = ref({
  title: '',
  description: '',
  status: 'TODO',
})

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    TODO: 'orange',
    IN_PROGRESS: 'blue',
    IN_TESTING: 'purple',
    DONE: 'green',
  }
  return colors[status] || 'grey'
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    TODO: 'A Fazer',
    IN_PROGRESS: 'Em Progresso',
    IN_TESTING: 'Em Teste',
    DONE: 'Concluído',
  }
  return labels[status] || status
}

const statusOptions = [
  { value: 'TODO', label: 'A Fazer' },
  { value: 'IN_PROGRESS', label: 'Em Progresso' },
  { value: 'IN_TESTING', label: 'Em Teste' },
  { value: 'DONE', label: 'Concluído' },
]

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const loadTickets = async () => {
  loading.value = true
  try {
    const response = await ticketService.getTickets()
    tickets.value = response.data || response
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao carregar tickets'
    snackbarColor.value = 'error'
    snackbar.value = true
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
      snackbarMessage.value = 'Ticket atualizado com sucesso'
    } else {
      await ticketService.postTicket(form.value)
      snackbarMessage.value = 'Ticket criado com sucesso'
    }
    snackbarColor.value = 'success'
    snackbar.value = true
    dialog.value = false
    await loadTickets()
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao salvar ticket'
    snackbarColor.value = 'error'
    snackbar.value = true
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
    snackbarMessage.value = 'Ticket excluído com sucesso'
    snackbarColor.value = 'success'
    snackbar.value = true
  } catch (error: any) {
    snackbarMessage.value = error.response?.data?.message || 'Erro ao excluir ticket'
    snackbarColor.value = 'error'
    snackbar.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTickets()
})
</script>

<template>
  <v-container fluid :class="$vuetify.display.mobile ? 'pa-3' : 'pa-6'" style="overflow-x: auto;">
    <div class="d-flex align-center justify-space-between mb-4 flex-wrap ga-2">
      <div>
        <h1 :class="$vuetify.display.mobile ? 'text-h5' : 'text-h4'" class="font-weight-bold mb-1">Tickets</h1>
        <p class="text-body-2 text-medium-emphasis">Gerencie tickets de suporte e solicitações</p>
      </div>
      <v-btn 
        color="primary" 
        size="default"
        prepend-icon="mdi-plus"
        @click="openCreateDialog"
      >
        Novo Ticket
      </v-btn>
    </div>

    <v-progress-linear v-if="loading" indeterminate></v-progress-linear>

    <v-row v-else-if="tickets.length > 0">
      <v-col v-for="ticket in tickets" :key="ticket.id" cols="12" sm="6" md="4" lg="3" xl="2">
        <v-card rounded="lg" elevation="2" hover class="cursor-pointer h-100 d-flex flex-column" @click="openDetailsDialog(ticket)">
          <v-card-title class="bg-primary pa-3">
            <div class="d-flex align-center justify-space-between mb-1">
              <v-icon color="secondary" size="20">mdi-ticket</v-icon>
              <v-chip
                :color="getStatusColor(ticket.status)"
                size="x-small"
                variant="flat"
              >
                {{ getStatusLabel(ticket.status) }}
              </v-chip>
            </div>
            <div class="text-body-2 font-weight-bold text-secondary text-truncate-2">
              {{ ticket.title }}
            </div>
          </v-card-title>

          <v-card-text class="pa-3 flex-grow-1 d-flex flex-column">
            <p class="text-caption mb-3 text-truncate-2">{{ ticket.description }}</p>

            <v-spacer></v-spacer>

            <v-divider class="mb-2" />

            <div class="d-flex flex-column ga-1 text-caption text-medium-emphasis">
              <div class="d-flex align-center ga-1">
                <v-icon size="14">mdi-account</v-icon>
                <span class="text-truncate">{{ ticket.createdBy.name }}</span>
              </div>
              <div class="d-flex align-center ga-1">
                <v-icon size="14">mdi-calendar</v-icon>
                <span>{{ formatDate(ticket.createdAt) }}</span>
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row v-else>
      <v-col cols="12">
        <v-card rounded="lg" elevation="2" class="text-center pa-12">
          <v-icon size="80" color="grey-lighten-1">mdi-ticket-outline</v-icon>
          <h3 class="text-h6 mt-4 text-medium-emphasis">Nenhum ticket encontrado</h3>
          <p class="text-body-2 text-medium-emphasis mt-2">Crie seu primeiro ticket clicando no botão acima</p>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="detailsDialog" :max-width="$vuetify.display.mobile ? '100%' : '700'" :fullscreen="$vuetify.display.mobile">
      <v-card rounded="lg" v-if="selectedTicket">
        <v-card-title class="d-flex align-center justify-space-between pa-4 bg-primary">
          <div class="d-flex align-center ga-3">
            <v-icon color="secondary" size="28">mdi-ticket</v-icon>
            <span class="text-h6 font-weight-bold text-secondary">Detalhes do Ticket</span>
          </div>
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            color="secondary"
            @click="detailsDialog = false"
          ></v-btn>
        </v-card-title>
        <v-card-text class="pa-4">
          <div class="mb-4">
            <div class="d-flex align-center justify-space-between mb-3 flex-wrap ga-2">
              <h3 class="text-h6 font-weight-bold">{{ selectedTicket.title }}</h3>
              <v-chip
                :color="getStatusColor(selectedTicket.status)"
                size="default"
                variant="flat"
              >
                {{ getStatusLabel(selectedTicket.status) }}
              </v-chip>
            </div>
            <p class="text-body-1">{{ selectedTicket.description }}</p>
          </div>
          <v-divider class="my-4"></v-divider>
          <div class="d-flex align-center justify-space-between text-body-2 flex-wrap ga-3">
            <div class="d-flex align-center ga-2">
              <v-icon size="20" color="secondary">mdi-account</v-icon>
              <span>Criado por: <strong>{{ selectedTicket.createdBy.name }}</strong></span>
            </div>
            <div class="d-flex align-center ga-2">
              <v-icon size="20" color="secondary">mdi-calendar</v-icon>
              <span>{{ formatDate(selectedTicket.createdAt) }}</span>
            </div>
          </div>
        </v-card-text>
        <v-card-actions class="px-4 pb-4 flex-wrap ga-2">
          <v-spacer></v-spacer>
          <v-btn
            color="error"
            variant="outlined"
            prepend-icon="mdi-delete"
            @click="openDeleteDialog(selectedTicket)"
          >
            Excluir
          </v-btn>
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-pencil"
            @click="openEditDialog(selectedTicket)"
          >
            Editar
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialog" :max-width="$vuetify.display.mobile ? '100%' : '600'" :fullscreen="$vuetify.display.mobile">
      <v-card rounded="lg">
        <v-card-title class="pa-4 bg-primary">
          <span class="text-h6 font-weight-bold text-secondary">
            {{ editMode ? 'Editar Ticket' : 'Novo Ticket' }}
          </span>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-text-field
            v-model="form.title"
            label="Título"
            variant="outlined"
            density="comfortable"
            class="mb-3"
          ></v-text-field>
          <v-textarea
            v-model="form.description"
            label="Descrição"
            variant="outlined"
            density="comfortable"
            rows="4"
            class="mb-3"
          ></v-textarea>
          <v-select
            v-model="form.status"
            :items="statusOptions"
            item-title="label"
            item-value="value"
            label="Status"
            variant="outlined"
            density="comfortable"
          ></v-select>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer></v-spacer>
          <v-btn variant="outlined" @click="dialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" @click="saveTicket" :loading="loading">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteDialog" :max-width="$vuetify.display.mobile ? '100%' : '400'" :fullscreen="$vuetify.display.mobile">
      <v-card rounded="lg">
        <v-card-title class="pa-4 bg-error">
          <span class="text-h6 font-weight-bold text-white">Confirmar Exclusão</span>
        </v-card-title>
        <v-card-text class="pa-4">
          <p class="text-body-1">
            Tem certeza que deseja excluir o ticket <strong>"{{ selectedTicket?.title }}"</strong>?
          </p>
        </v-card-text>
        <v-card-actions class="px-4 pb-4">
          <v-spacer></v-spacer>
          <v-btn variant="outlined" @click="deleteDialog = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" @click="deleteTicket" :loading="loading">Excluir</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="3000">
      {{ snackbarMessage }}
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}

.text-truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-truncate-4 {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
