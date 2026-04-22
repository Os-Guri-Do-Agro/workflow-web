<script setup lang="ts">
import router from '@/router'
import { ref, computed, onMounted } from 'vue'
import companiesServices from '@/service/companies/companies-services'
import quartersService from '@/service/quarters/quarters-service'
import { getInfoAuth } from '@/utils/authContent'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import {
  LayoutDashboard,
  Columns3,
  ListTodo,
  Ticket,
  Settings2,
  StickyNote,
  CalendarDays,
  Users,
  ChevronsUpDown,
  LogOut,
  BarChart3,
  CalendarRange,
  X,
  Building2,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-vue-next'

const lucideIcons: Record<string, LucideIcon> = {
  'l-dashboard': LayoutDashboard,
  'l-board': Columns3,
  'l-tasks': ListTodo,
  'l-ticket': Ticket,
  'l-variables': Settings2,
  'l-notes': StickyNote,
  'l-calendar': CalendarDays,
  'l-users': Users,
  'l-report': BarChart3,
  'l-month': CalendarRange,
}

type MenuItem = {
  title: string
  icon?: string
  to?: string
  children?: MenuItem[]
  role?: string
}

type Company = {
  id: string
  name: string
  cnpj: string
  active?: boolean
}

type CompanyResponse = {
  role: string
  joinedAt: string
  company: Company
}

const companies = ref<any[]>([])
const quaters = ref<any[]>([])
const workspace = useWorkspaceStore()

const findCompanies = async () => {
  try {
    const response = await companiesServices.getCompany()
    const savedCompanyId = localStorage.getItem('activeCompany')

    if (Array.isArray(response)) {
      companies.value = response.map((item: CompanyResponse, index: number) => ({
        ...item.company,
        active: savedCompanyId ? item.company.id === savedCompanyId : index === 0,
      }))
    } else if (response?.data && Array.isArray(response.data)) {
      companies.value = response.data.map((item: CompanyResponse, index: number) => ({
        ...item.company,
        active: savedCompanyId ? item.company.id === savedCompanyId : index === 0,
      }))
    }

    if (!savedCompanyId && companies.value.length > 0) {
      workspace.setActiveCompany(companies.value[0].id)
      localStorage.setItem('activeCompany', companies.value[0].id)
    }
  } catch (e) {
    console.error(e)
  }
}

const findQuaters = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return

  try {
    const response = await quartersService.getCompanyQuarters(companyId)
    quaters.value = response.data || response
  } catch (e) {
    console.error('Error fetching quarters:', e)
  }
}

onMounted(async () => {
  if (!localStorage.getItem('token')) return
  await findCompanies()
  await findQuaters()
})

const showCompanyModal = ref(false)

const activeCompany = computed(() => companies.value.find((c) => c.active))

const switchCompany = (company: Company) => {
  companies.value.forEach((c) => (c.active = c.id === company.id))
  workspace.setActiveCompany(company.id)
  localStorage.setItem('activeCompany', company.id)
  getInfoAuth()
  showCompanyModal.value = false

  setTimeout(() => {
    router.push('/')
  })
  findQuaters()
}

const mainItems = computed<MenuItem[]>(() => [
  { title: 'Dashboard', icon: 'l-dashboard', to: '/dashboard' },
  { title: 'Board', icon: 'l-board', to: '/board' },
  { title: 'Tickets', icon: 'l-ticket', to: '/tickets' },
  { title: 'Variáveis', icon: 'l-variables', to: '/variables' },
  { title: 'Usuários', icon: 'l-users', to: '/company-users', role: 'ADMIN' },
])

const personalItems = computed<MenuItem[]>(() => [
  { title: 'Notas', icon: 'l-notes', to: '/notes' },
  { title: 'Calendário', icon: 'l-calendar', to: '/calendar' },
])

const taskItems = computed<MenuItem[]>(() => {
  if (!quaters.value?.length) return []

  return [{
    title: 'Tarefas',
    icon: 'l-tasks',
    children: quaters.value.map((quarter) => ({
      title: `${quarter.label} • ${quarter.months?.map((m: any) => m.name.slice(0, 3)).join('-') || ''}`,
      icon: 'l-tasks',
      children: [
        {
          title: `Relatório ${quarter.label}`,
          icon: 'l-report',
          to: `/relatorio/${quarter.id}`,
        },
        ...(quarter.months?.map((month: any) => ({
          title: month.name,
          icon: 'l-month',
          to: `/tasks/${month.id}`,
        })) || []),
      ],
    })),
  }]
})

const menuItems = computed(() => [...mainItems.value, ...taskItems.value])

function getLucideIcon(name: string) {
  return lucideIcons[name]
}

const logout = () => {
  localStorage.clear()
  router.push('/login')
}

const footerItems = [
  { title: 'Sair', action: logout },
]

defineProps<{
  modelValue: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    width="260"
    permanent
    color="primary"
    border="none"
    class="drawer-custom"
  >
    <!-- Company selector -->
    <div class="px-3 pt-3 pb-2">
      <button class="company-btn" @click="showCompanyModal = true">
        <v-sheet width="28" height="28" rounded="md" class="bg-transparent">
          <v-img src="/icone.png" />
        </v-sheet>
        <div class="company-info">
          <span class="company-label">Empresa</span>
          <span class="company-name">{{ activeCompany?.name || 'Selecione' }}</span>
        </div>
        <ChevronsUpDown :size="14" class="company-chevron" />
      </button>
    </div>

    <div class="divider mx-3 mb-2" />

    <!-- Navigation -->
    <v-list nav density="compact" class="px-2">
      <template v-for="item in menuItems" :key="item.title">
        <v-list-item
          v-if="!item.children"
          :to="item.to"
          :value="item.title"
          rounded="lg"
          class="nav-item mb-0"
          color="secondary"
        >
          <template #prepend>
            <component :is="getLucideIcon(item.icon!)" :size="16" class="nav-icon" />
          </template>
          <v-list-item-title class="nav-label">{{ item.title }}</v-list-item-title>
        </v-list-item>

        <v-list-group v-else :value="item.title">
          <template #activator="{ props }">
            <v-list-item v-bind="props" rounded="lg" class="nav-item mb-0" color="secondary">
              <template #prepend>
                <component :is="getLucideIcon(item.icon!)" :size="16" class="nav-icon" />
              </template>
              <v-list-item-title class="nav-label">{{ item.title }}</v-list-item-title>
            </v-list-item>
          </template>

          <template v-for="subItem in item.children" :key="subItem.title">
            <v-list-item
              v-if="!subItem.children"
              :to="subItem.to"
              :value="subItem.title"
              class="nav-item nav-item--sub mb-0"
              rounded="lg"
              color="secondary"
            >
              <template #prepend>
                <component :is="getLucideIcon(subItem.icon!)" :size="14" class="nav-icon" />
              </template>
              <v-list-item-title class="nav-label">{{ subItem.title }}</v-list-item-title>
            </v-list-item>

            <v-list-group v-else :value="subItem.title" no-action>
              <template #activator="{ props }">
                <v-list-item v-bind="props" class="nav-item nav-item--sub mb-0" rounded="lg">
                  <template #prepend>
                    <component :is="getLucideIcon(subItem.icon!)" :size="14" class="nav-icon" />
                  </template>
                  <v-list-item-title class="nav-label">{{ subItem.title }}</v-list-item-title>
                </v-list-item>
              </template>

              <v-list-item
                v-for="child in subItem.children"
                :key="child.title"
                :to="child.to"
                :value="child.title"
                class="nav-item nav-item--deep mb-0"
                rounded="lg"
                color="secondary"
              >
                <template #prepend>
                  <component :is="getLucideIcon(child.icon!)" :size="13" class="nav-icon" />
                </template>
                <v-list-item-title class="nav-label">{{ child.title }}</v-list-item-title>
              </v-list-item>
            </v-list-group>
          </template>
        </v-list-group>
      </template>
    </v-list>

    <!-- Pessoal section -->
    <div class="section-divider mx-3 mt-3 mb-1">
      <span class="section-label">Pessoal</span>
    </div>
    <v-list nav density="compact" class="px-2 pt-0">
      <v-list-item
        v-for="item in personalItems"
        :key="item.title"
        :to="item.to"
        :value="item.title"
        rounded="lg"
        class="nav-item mb-0"
        color="secondary"
      >
        <template #prepend>
          <component :is="getLucideIcon(item.icon!)" :size="16" class="nav-icon" />
        </template>
        <v-list-item-title class="nav-label">{{ item.title }}</v-list-item-title>
      </v-list-item>
    </v-list>

    <!-- Footer -->
    <template #append>
      <div class="divider mx-3 mb-2" />
      <div class="px-2 pb-3">
        <button
          v-for="item in footerItems"
          :key="item.title"
          class="logout-btn"
          @click="item.action?.()"
        >
          <LogOut :size="16" />
          <span>{{ item.title }}</span>
        </button>
      </div>
    </template>
  </v-navigation-drawer>

  <!-- Company Switch Dialog -->
  <v-dialog v-model="showCompanyModal" max-width="440" transition="dialog-bottom-transition">
    <v-card rounded="xl" elevation="8" color="primary" class="company-dialog">
      <div class="d-flex align-center justify-space-between pa-4 pb-3">
        <span class="text-body-2 font-weight-bold" style="color: rgba(var(--v-theme-secondary), 0.7)">
          Trocar Empresa
        </span>
        <v-btn variant="text" size="x-small" color="secondary" @click="showCompanyModal = false">
          <X :size="16" />
        </v-btn>
      </div>

      <div class="divider mx-4 mb-2" />

      <div class="pa-3 pt-2">
        <button
          v-for="company in companies"
          :key="company.id"
          class="company-option"
          :class="{ 'company-option--active': company.active }"
          @click="switchCompany(company)"
        >
          <div class="company-option-icon">
            <Building2 :size="15" :style="{ opacity: company.active ? 1 : 0.45 }" />
          </div>
          <div class="company-option-info">
            <span class="company-option-name">{{ company.name }}</span>
            <span class="company-option-cnpj">{{ company.cnpj }}</span>
          </div>
          <CheckCircle2 v-if="company.active" :size="14" class="check-icon" />
        </button>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.drawer-custom {
  border-right: 1px solid rgba(var(--v-theme-secondary), 0.08) !important;
}

.divider {
  height: 1px;
  background: rgba(var(--v-theme-secondary), 0.08);
}

/* ─── Company button ─── */
.company-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  background: rgba(var(--v-theme-secondary), 0.05);
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 8px;
  padding: 7px 10px;
  cursor: default;
  transition: background 0.12s ease, border-color 0.12s ease;
  text-align: left;
  cursor: pointer;
}

.company-btn--clickable {
  cursor: pointer;
}

.company-btn--clickable:hover {
  background: rgba(var(--v-theme-secondary), 0.08);
  border-color: rgba(var(--v-theme-secondary), 0.18);
}

.company-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.company-label {
  font-size: 10px;
  font-weight: 500;
  color: rgba(var(--v-theme-secondary), 0.35);
  line-height: 1.2;
  letter-spacing: 0.03em;
}

.company-name {
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.company-chevron {
  color: rgba(var(--v-theme-secondary), 0.55) !important;
  flex-shrink: 0;
}

.company-btn--clickable:hover .company-chevron {
  color: rgba(var(--v-theme-secondary), 0.8) !important;
}

/* ─── Section divider ─── */
.section-divider {
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}

.section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(var(--v-theme-secondary), 0.06);
}

/* ─── Nav items ─── */
.nav-item {
  min-height: 32px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.nav-item--sub {
  padding-left: 28px !important;
}

.nav-item--deep {
  padding-left: 44px !important;
}

.nav-icon {
  color: rgba(var(--v-theme-secondary), 0.45) !important;
  margin-right: 2px;
}

.nav-label {
  font-size: 12.5px !important;
  font-weight: 500 !important;
  color: rgba(var(--v-theme-secondary), 0.65) !important;
}

.v-list-item--active .nav-icon {
  color: rgb(var(--v-theme-secondary)) !important;
}

.v-list-item--active .nav-label {
  color: rgb(var(--v-theme-secondary)) !important;
  font-weight: 600 !important;
}

.v-list-item--active {
  background: rgba(var(--v-theme-secondary), 0.08) !important;
}

/* ─── Logout button ─── */
.logout-btn {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 7px 10px;
  cursor: pointer;
  transition: background 0.12s ease;
  color: rgba(var(--v-theme-secondary), 0.4);
  font-size: 12.5px;
  font-weight: 500;
  font-family: inherit;
}

.logout-btn:hover {
  background: rgba(var(--v-theme-error), 0.08);
  color: rgb(var(--v-theme-error));
}

.logout-btn:hover :deep(.v-icon) {
  color: rgb(var(--v-theme-error)) !important;
}

/* ─── Company dialog ─── */
.company-dialog {
  border: 1px solid rgba(var(--v-theme-secondary), 0.1) !important;
}

.company-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
  text-align: left;
  font-family: inherit;
  margin-bottom: 4px;
}

.company-option:hover {
  background: rgba(var(--v-theme-secondary), 0.06);
  border-color: rgba(var(--v-theme-secondary), 0.12);
}

.company-option--active {
  background: rgba(var(--v-theme-secondary), 0.08) !important;
  border-color: rgba(var(--v-theme-secondary), 0.18) !important;
}

.company-option-icon {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: rgba(var(--v-theme-secondary), 0.07);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.company-option-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.company-option-name {
  font-size: 13px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.company-option-cnpj {
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.check-icon {
  color: var(--success);
  flex-shrink: 0;
}
</style>
