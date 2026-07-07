<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import userService from '@/service/user/user-service'
import companieService from '@/service/companies/companies-services'
import AppSelect from '@/components/ui/AppSelect.vue'
import { ShieldUser } from 'lucide-vue-next'

type Company = {
  id: string
  name: string
  cnpj: string
  usersCount: number
}

type User = {
  id: string
  name: string
  email: string
}

const props = defineProps<{
  modelValue: boolean
  company: Company | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'success': [message: string, color: string]
}>()

const search = ref('')
const users = ref<User[]>([])
const selectedRole = ref<'ADMIN' | 'WORKER'>('WORKER')
const selectedUsers = ref<User[]>([])
const loading = ref(false)
const saving = ref(false)

const headers = [
  { title: 'Nome', key: 'name' },
  { title: 'E-mail', key: 'email' },
]

const fetchUsers = async () => {
  loading.value = true
  try {
    users.value = await userService.getAllUsers()
  } catch (error) {
    console.error('Erro ao carregar usuários:', error)
  } finally {
    loading.value = false
  }
}

const close = () => {
  setTimeout(() => {
    emit('update:modelValue', false)
    selectedUsers.value = []
  }, 100)
}

const save = async () => {
  saving.value = true
  try {
    if (!props.company?.id) {
      console.error('ID da empresa não encontrado')
      return
    }

    if (selectedUsers.value.length === 0) {
      return
    }

    const firstUser = selectedUsers.value[0]
    const payload = {
      userId: typeof firstUser === 'string' ? firstUser : firstUser?.id || '',
      role: selectedRole.value,
    }

    const res = await companieService.postCompanyAdmin(props.company.id, payload)
    emit('success', res?.message || 'Usuário adicionado com sucesso!', 'success')
    setTimeout(() => {
      close()
    }, 1500)
  } catch (error: any) {
    emit('success', error.response?.data?.message || 'Erro ao adicionar usuário.', 'error')
    console.error('Erro ao adicionar usuário:', error)
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (!val) {
      selectedUsers.value = []
    }
  },
)

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="800"
    persistent
  >
    <v-card rounded="lg">
      <v-card-title
        class="d-flex align-center justify-space-between pa-5"
        style="background: var(--surface); color: var(--text)"
      >
        <div class="d-flex align-center ga-3">
          <v-icon size="28" style="color: var(--text)">mdi-account-plus</v-icon>
          <span class="text-h6 font-weight-bold">Adicionar Usuário</span>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" @click="close" style="color: var(--text)" />
      </v-card-title>

      <v-card-text class="pa-6">
        <div v-if="company" class="mb-4 pa-3 rounded" style="background: var(--surface-3)">
          <div class="text-caption" style="color: var(--text-2)">Empresa</div>
          <div class="text-body-2 font-weight-bold" style="color: var(--text)">{{ company.name }}</div>
        </div>

        <div class="role-field mb-4">
          <span class="role-label">
            <ShieldUser :size="15" />
            Função
          </span>
          <AppSelect
            :model-value="selectedRole"
            :items="[
              { label: 'Trabalhador', value: 'WORKER' },
              { label: 'Admin', value: 'ADMIN' },
            ]"
            label="Função"
            @update:model-value="selectedRole = ($event as 'ADMIN' | 'WORKER')"
          />
        </div>

        <v-text-field
          v-model="search"
          label="Buscar usuários"
          variant="outlined"
          density="comfortable"
          prepend-inner-icon="mdi-magnify"
          clearable
          class="mb-4"
        />

        <v-data-table
          v-model="selectedUsers"
          :headers="headers"
          :items="users"
          :search="search"
          :loading="loading"
          item-value="id"
          show-select
          select-strategy="single"
          density="comfortable"
          class="elevation-1"
        >
          <template #item.name="{ item }">
            <div class="d-flex align-center ga-2 py-2">
              <v-avatar size="32" color="primary">
                <span class="text-caption">{{ item.name.charAt(0) }}</span>
              </v-avatar>
              <span>{{ item.name }}</span>
            </div>
          </template>

          <template #bottom>
            <div class="pa-3 text-center text-caption text-medium-emphasis">
              {{ selectedUsers.length }} usuário(s) selecionado(s)
            </div>
          </template>
        </v-data-table>
      </v-card-text>

      <v-card-actions class="pa-5 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="close">Cancelar</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          @click="save"
          :disabled="selectedUsers.length === 0"
        >
          Adicionar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Campo "Função" com label visível (ícone lucide + texto), tokenizado. */
.role-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.role-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}
</style>
