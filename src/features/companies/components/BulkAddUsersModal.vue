<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import userService from '@/service/user/user-service'
import companieService from '@/service/companies/companies-services'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { Loader2, Search, ShieldUser, Users, X } from 'lucide-vue-next'

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

/** Mesmo contrato do AddUserModal: papel do viewer NA EMPRESA ALVO. */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    company: Company | null
    viewerRole?: 'ADMIN' | 'WORKER'
  }>(),
  { viewerRole: 'WORKER' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: [message: string, color: string]
}>()

const search = ref('')
const users = ref<User[]>([])
const selectedRole = ref<'ADMIN' | 'WORKER'>('WORKER')
const saving = ref(false)

const canAssignRole = computed(() => props.viewerRole === 'ADMIN')

const roleItems = [
  { label: 'Trabalhador', value: 'WORKER' },
  { label: 'Admin', value: 'ADMIN' },
]

const headers = [
  { title: 'Nome', key: 'name' },
  { title: 'E-mail', key: 'email' },
]

const selectedUsers = ref<User[]>([])

const fetchUsers = async () => {
  try {
    users.value = await userService.getAllUsers()
  } catch (error) {
    console.error('Erro ao carregar usuários:', error)
  }
}

const close = () => {
  setTimeout(() => {
    emit('update:modelValue', false)
    selectedUsers.value = []
  }, 100)
}

const save = async () => {
  if (saving.value) return
  saving.value = true
  try {
    if (!props.company?.id) {
      console.error('ID da empresa não encontrado')
      return
    }

    const payload = {
      userIds: selectedUsers.value.map((u: any) => (typeof u === 'string' ? u : u.id)),
      role: canAssignRole.value ? selectedRole.value : 'WORKER',
    }

    const res = await companieService.postCompanyMemberLote(props.company.id, payload)
    const message = res?.message || res?.data?.message || 'Usuários adicionados com sucesso!'
    emit('success', message, 'success')
    setTimeout(() => {
      close()
    }, 100)
  } catch (error: any) {
    emit('success', error.response?.data?.message || 'Erro ao adicionar usuários.', 'error')
    console.error('Erro ao adicionar usuários em lote:', error)
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (val) => {
    if (!val) {
      selectedUsers.value = []
      return
    }
    // Ver AddUserModal: instância reaproveitada entre empresas. Em lote o
    // vazamento de "Admin" promoveria um grupo inteiro de uma vez.
    selectedRole.value = 'WORKER'
  },
)

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Adicionar Usuários em Lote"
    size="xl"
    :loading="saving"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="um-head">
      <div class="um-head-left">
        <span class="um-icon">
          <Users :size="18" />
        </span>
        <div class="um-titles">
          <h2 class="um-title">Adicionar Usuários em Lote</h2>
          <p class="um-subtitle">Selecione várias pessoas e adicione todas de uma vez com a mesma função.</p>
        </div>
      </div>
      <button class="um-close" type="button" aria-label="Fechar" :disabled="saving" @click="close">
        <X :size="16" />
      </button>
    </header>

    <div class="um-body">
      <div v-if="company" class="um-company">
        <span class="um-company-label">Empresa</span>
        <span class="um-company-name">{{ company.name }}</span>
      </div>

      <div class="role-field">
        <span class="role-label">
          <ShieldUser :size="15" />
          Função
        </span>
        <AppSelect
          v-if="canAssignRole"
          :model-value="selectedRole"
          :items="roleItems"
          label="Função"
          @update:model-value="selectedRole = ($event as 'ADMIN' | 'WORKER')"
        />
        <div v-else class="role-fixed">
          <span class="role-fixed-value">Trabalhador</span>
          <span class="role-fixed-hint">Só admins da empresa definem a função.</span>
        </div>
      </div>

      <div class="um-search">
        <Search :size="15" class="um-search-icon" />
        <input
          v-model="search"
          class="um-search-input"
          type="text"
          placeholder="Buscar usuários"
          aria-label="Buscar usuários"
          autocomplete="off"
        />
        <button
          v-if="search"
          class="um-search-clear"
          type="button"
          aria-label="Limpar busca"
          @click="search = ''"
        >
          <X :size="14" />
        </button>
      </div>

      <!-- Tabela ainda Vuetify (trocar é outro épico); a moldura tokenizada
           integra ela ao padrão do overlay. -->
      <div class="um-table">
        <v-data-table
          v-model="selectedUsers"
          :headers="headers"
          :items="users"
          :search="search"
          item-value="id"
          show-select
          density="comfortable"
        >
          <template #item.name="{ item }">
            <div class="um-user">
              <span class="um-avatar">{{ item.name.charAt(0) }}</span>
              <span>{{ item.name }}</span>
            </div>
          </template>

          <template #bottom>
            <div class="um-count">
              {{ selectedUsers.length }} usuário(s) selecionado(s)
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <footer class="um-foot">
      <button class="um-btn um-btn--ghost press" type="button" :disabled="saving" @click="close">
        Cancelar
      </button>
      <button
        class="um-btn um-btn--primary press"
        type="button"
        :disabled="selectedUsers.length === 0 || saving"
        @click="save"
      >
        <Loader2 v-if="saving" :size="14" class="um-spin" />
        Adicionar ({{ selectedUsers.length }})
      </button>
    </footer>
  </AppDialog>
</template>

<style scoped>
.um-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.um-head-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.um-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
  flex-shrink: 0;
}

.um-title {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  letter-spacing: -0.01em;
  color: var(--text);
}

.um-subtitle {
  margin: 2px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.45;
}

.um-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
  transition: color var(--motion-fast) var(--motion-ease), border-color var(--motion-fast) var(--motion-ease);
}

.um-close:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.um-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.um-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
}

.um-company {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.um-company-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
}

.um-company-name {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
}

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

/* Função fixa (viewer sem permissão de escolher). */
.role-fixed {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.role-fixed-value {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--text);
}

.role-fixed-hint {
  font-size: 11.5px;
  color: var(--text-3);
}

/* Busca no padrão do design system (ícone + input transparente). */
.um-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  transition: border-color var(--motion-fast) var(--motion-ease), box-shadow var(--motion-fast) var(--motion-ease);
}

.um-search:focus-within {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border-strong));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.um-search-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.um-search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.um-search-input::placeholder {
  color: var(--text-4);
}

.um-search-clear {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
}

.um-search-clear:hover {
  color: var(--text);
}

/* Moldura tokenizada em volta da v-data-table pra ela não parecer solta. */
.um-table {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.um-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.um-avatar {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
}

.um-count {
  padding: 10px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-3);
  border-top: 1px solid var(--border);
}

.um-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.um-btn {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius);
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.um-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.um-btn--ghost {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
}

.um-btn--ghost:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.um-btn--primary {
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  background: var(--accent);
  color: var(--accent-fg);
}

.um-spin {
  animation: um-spin 0.8s linear infinite;
}

@keyframes um-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .um-spin {
    animation: none;
  }
}
</style>
