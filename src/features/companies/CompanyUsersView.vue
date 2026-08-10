<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Building2,
  UserPlus,
  Users2,
  Search,
  Briefcase,
  Shield,
  Info,
} from 'lucide-vue-next'
import companieService from '@/service/companies/companies-services'
import { getApiErrorMessage } from '@/service/api'
import AddUserModal from './components/AddUserModal.vue'
import BulkAddUsersModal from './components/BulkAddUsersModal.vue'
import CreateCompanyModal from './components/CreateCompanyModal.vue'
import CreateUserModal from '@/components/CreateUserModal.vue'
import { isActiveCompanyAdmin } from '@/utils/authContent'
import { useToast } from '@/composables/useToast'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'

type Company = {
  id: string
  name: string
  cnpj: string
  usersCount: number
}

type UserCompany = {
  role: string
  joinedAt: string
  company: {
    id: string
    name: string
    cnpj: string
  }
}

type TabKey = 'user' | 'system'

const tab = ref<TabKey>('user')
const search = ref('')
const systemCompanies = ref<Company[]>([])
const userCompanies = ref<UserCompany[]>([])
const showAddUserModal = ref(false)
const showBulkAddModal = ref(false)
const showUserAddModal = ref(false)
const selectedCompany = ref<any>(null)
// Papel do usuário logado NA EMPRESA do card aberto. Um mesmo usuário é ADMIN
// numa empresa e WORKER noutra, então o gate não pode ser global.
const selectedCompanyRole = ref<'ADMIN' | 'WORKER'>('WORKER')
// Criar usuário é ADMIN-only no backend; sem este gate o WORKER via o botão
// e levava 403 ao enviar o formulário.
const isAdmin = ref(false)
const loadingUser = ref(true)
const loadingSystem = ref(true)
// Lista vazia por FALHA não é a mesma coisa que lista vazia por não ter vínculo:
// só a segunda libera a exceção de bootstrap de criar empresa.
const userCompaniesLoaded = ref(false)
const { success: showSuccess, error: showError } = useToast()

const roleMeta: Record<
  string,
  { label: string; token: string; icon: typeof Briefcase }
> = {
  ADMIN: { label: 'Admin', token: 'var(--warn)', icon: Shield },
  WORKER: { label: 'Membro', token: 'var(--info)', icon: Briefcase },
}

const tabs: { key: TabKey; label: string; icon: typeof Building2 }[] = [
  { key: 'user', label: 'Minhas empresas', icon: Building2 },
]

const formatCnpj = (cnpj: string): string => {
  const d = (cnpj || '').replace(/\D/g, '')
  if (d.length !== 14) return cnpj || '—'
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

const filteredSystem = computed(() => {
  if (!search.value.trim()) return systemCompanies.value
  const q = search.value.toLowerCase()
  return systemCompanies.value.filter(
    (c) => c.name.toLowerCase().includes(q) || c.cnpj.includes(q),
  )
})

/**
 * Criar empresa é ADMIN-only, com uma exceção de bootstrap no backend: quem não
 * tem NENHUM vínculo cria a primeira e vira ADMIN dela. WORKER que já pertence
 * a alguma empresa é barrado — antes o botão aparecia e devolvia 403.
 */
const canCreateCompany = computed(() => {
  if (loadingUser.value || !userCompaniesLoaded.value) return false
  if (!userCompanies.value.length) return true
  return userCompanies.value.some((u) => u.role === 'ADMIN')
})

const filteredUser = computed(() => {
  if (!search.value.trim()) return userCompanies.value
  const q = search.value.toLowerCase()
  return userCompanies.value.filter(
    (u) => u.company.name.toLowerCase().includes(q) || u.company.cnpj.includes(q),
  )
})

const fetchSystemCompanies = async () => {
  loadingSystem.value = true
  try {
    const data = await companieService.getCompanyAll()
    systemCompanies.value = data.map((company: any) => ({
      id: company.id,
      name: company.name,
      cnpj: company.cnpj,
      usersCount: 0,
    }))
  } catch (error) {
    showError(getApiErrorMessage(error, 'Erro ao carregar empresas do sistema'))
  } finally {
    loadingSystem.value = false
  }
}

const fetchUserCompanies = async () => {
  loadingUser.value = true
  try {
    const data = await companieService.getCompany()
    userCompanies.value = data
    userCompaniesLoaded.value = true
  } catch (error) {
    userCompaniesLoaded.value = false
    showError(getApiErrorMessage(error, 'Erro ao carregar empresas do usuário'))
  } finally {
    loadingUser.value = false
  }
}

/** Empresa nova entra na lista de vínculos: sem isso o card dela não aparece. */
const onCompanyCreated = () => {
  fetchSystemCompanies()
  fetchUserCompanies()
}

/**
 * Papel do usuário logado numa empresa específica, lido do vínculo real
 * (`GET /company`) em vez do papel na empresa ativa do localStorage — que é o
 * que `getInfoAuth`/`isActiveCompanyAdmin` respondem e não serve numa lista de
 * várias empresas. Sem vínculo, WORKER (o menos permissivo).
 */
const roleInCompany = (companyId: string): 'ADMIN' | 'WORKER' =>
  userCompanies.value.find((u) => u.company.id === companyId)?.role === 'ADMIN'
    ? 'ADMIN'
    : 'WORKER'

const openAddUser = (company: Company) => {
  selectedCompany.value = company
  selectedCompanyRole.value = roleInCompany(company.id)
  showAddUserModal.value = true
}

const openBulkAdd = (company: Company) => {
  selectedCompany.value = company
  selectedCompanyRole.value = roleInCompany(company.id)
  showBulkAddModal.value = true
}

const openUserAdd = (userCompany: UserCompany) => {
  selectedCompany.value = userCompany.company
  selectedCompanyRole.value = userCompany.role === 'ADMIN' ? 'ADMIN' : 'WORKER'
  showUserAddModal.value = true
}

const onModalMsg = (msg: string, color: string) => {
  if (color === 'success') showSuccess(msg)
  else showError(msg)
}

onMounted(() => {
  // Fetches independentes: o check de papel não pode segurar (nem quebrar) o
  // carregamento das listas — loadingUser/loadingSystem sempre resolvem.
  isActiveCompanyAdmin().then((can) => {
    isAdmin.value = can
  })
  fetchSystemCompanies()
  fetchUserCompanies()
})
</script>

<template>
  <div class="users-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-main">
        <span class="eyebrow">
          <Users2 :size="11" />
          Empresas
        </span>
        <h1 class="page-title">Usuários das empresas</h1>
        <p class="page-sub">Gerencie acesso e permissões dos times por empresa</p>
      </div>

      <div class="header-actions">
        <CreateUserModal v-if="isAdmin" />
        <CreateCompanyModal v-if="canCreateCompany" @created="onCompanyCreated" />
      </div>
    </header>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="segments" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="segment"
          :class="{ 'segment--active': tab === t.key }"
          role="tab"
          :aria-selected="tab === t.key"
          @click="tab = t.key"
        >
          <component :is="t.icon" :size="13" />
          <span>{{ t.label }}</span>
        </button>
      </div>

      <div class="search-wrap">
        <Search :size="14" class="search-icon" />
        <input
          v-model="search"
          type="text"
          placeholder="Buscar por nome ou CNPJ…"
          class="search-input"
        />
      </div>
    </div>

    <!-- My Companies -->
    <section v-if="tab === 'user'" class="grid-wrap">
      <div v-if="loadingUser" class="cards-grid">
        <Skeleton v-for="i in 6" :key="i" type="card" />
      </div>

      <EmptyState
        v-else-if="!filteredUser.length && !search"
        :icon="Building2"
        title="Você não pertence a nenhuma empresa"
        description="Peça para um admin te adicionar como membro."
      />

      <EmptyState
        v-else-if="!filteredUser.length"
        :icon="Search"
        title="Nenhuma empresa encontrada"
        description="Tente outro termo de busca."
      />

      <div v-else class="cards-grid">
        <article
          v-for="item in filteredUser"
          :key="item.company.id"
          class="company-card"
        >
          <header class="card-top">
            <span class="avatar">
              <img src="/brand/caneca-circulo.svg" alt="" class="avatar-logo" draggable="false" />
            </span>
            <div class="card-ident">
              <h3 class="card-name">{{ item.company.name }}</h3>
              <span class="card-cnpj">{{ formatCnpj(item.company.cnpj) }}</span>
            </div>
            <span
              class="role-chip"
              :style="{
                color: roleMeta[item.role]?.token || 'var(--text-3)',
                background: `color-mix(in srgb, ${roleMeta[item.role]?.token || 'var(--text-3)'} 14%, transparent)`,
              }"
            >
              <component :is="roleMeta[item.role]?.icon || Briefcase" :size="11" />
              {{ roleMeta[item.role]?.label || item.role }}
            </span>
          </header>

          <!-- Gerenciar membros é ADMIN-only no backend. Para quem é membro, o
               botão não fica desabilitado sem explicação: some e dá o motivo. -->
          <footer class="card-actions">
            <button
              v-if="item.role === 'ADMIN'"
              class="btn-primary press"
              @click="openUserAdd(item)"
            >
              <UserPlus :size="13" />
              Adicionar usuário
            </button>
            <p v-else class="card-note">
              <Info :size="12" />
              Só admins desta empresa podem adicionar pessoas.
            </p>
          </footer>
        </article>
      </div>
    </section>

    <!-- System Companies (hidden until re-enabled) -->
    <section v-else class="grid-wrap">
      <div v-if="loadingSystem" class="cards-grid">
        <Skeleton v-for="i in 6" :key="i" type="card" />
      </div>

      <EmptyState
        v-else-if="!filteredSystem.length && !search"
        :icon="Building2"
        title="Nenhuma empresa no sistema"
        description="Crie a primeira empresa para começar a gerenciar acessos."
      />

      <EmptyState
        v-else-if="!filteredSystem.length"
        :icon="Search"
        title="Nenhuma empresa encontrada"
        description="Tente outro termo de busca."
      />

      <div v-else class="cards-grid">
        <article
          v-for="company in filteredSystem"
          :key="company.id"
          class="company-card"
        >
          <header class="card-top">
            <span class="avatar">
              <img src="/brand/caneca-circulo.svg" alt="" class="avatar-logo" draggable="false" />
            </span>
            <div class="card-ident">
              <h3 class="card-name">{{ company.name }}</h3>
              <span class="card-cnpj">{{ formatCnpj(company.cnpj) }}</span>
            </div>
          </header>

          <footer class="card-actions card-actions--split">
            <template v-if="roleInCompany(company.id) === 'ADMIN'">
              <button class="btn-primary press" @click="openAddUser(company)">
                <UserPlus :size="13" />
                Adicionar
              </button>
              <button class="btn-secondary press" @click="openBulkAdd(company)">
                <Users2 :size="13" />
                Em lote
              </button>
            </template>
            <p v-else class="card-note">
              <Info :size="12" />
              Só admins desta empresa podem adicionar pessoas.
            </p>
          </footer>
        </article>
      </div>
    </section>

    <AddUserModal
      v-model="showAddUserModal"
      :company="selectedCompany"
      :viewer-role="selectedCompanyRole"
      @success="onModalMsg"
    />
    <AddUserModal
      v-model="showUserAddModal"
      :company="selectedCompany"
      :viewer-role="selectedCompanyRole"
      @success="onModalMsg"
    />
    <BulkAddUsersModal
      v-model="showBulkAddModal"
      :company="selectedCompany"
      :viewer-role="selectedCompanyRole"
      @success="onModalMsg"
    />
  </div>
</template>

<style scoped>
.users-page {
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

/* ---- Toolbar ---- */
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  flex-wrap: wrap;
}

.segments {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.segment {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.segment:hover {
  color: var(--text-2);
}

.segment--active {
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 360px;
  margin-left: auto;
}

.search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-3);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 7px 10px 7px 32px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.search-input::placeholder {
  color: var(--text-4);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

/* ---- Grid ---- */
.grid-wrap {
  flex: 1;
  min-height: 0;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

/* ---- Company card ---- */
.company-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.company-card:hover {
  border-color: var(--border-strong);
}

.card-top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
}

.avatar {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.avatar-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 50%;
}

.card-ident {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.005em;
}

.card-cnpj {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  flex-shrink: 0;
  align-self: flex-start;
}

/* ---- Actions ---- */
.card-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.card-actions--split > * {
  flex: 1;
}

/* Motivo no lugar do botão: nada de ação desabilitada sem explicação. */
.card-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 0;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-3);
}

.card-note svg {
  flex-shrink: 0;
}

.btn-primary,
.btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
  flex: 1;
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  .page-header,
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .search-wrap {
    max-width: 100%;
    margin-left: 0;
  }
  .card-top {
    grid-template-columns: auto 1fr;
  }
  .role-chip {
    grid-column: 2;
    justify-self: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .company-card,
  .segment,
  .search-input,
  .btn-primary,
  .btn-secondary {
    transition-duration: 1ms;
  }
}
</style>
