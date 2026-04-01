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
    width="220"
    permanent
    color="primary"
    border="none"
    class="drawer-custom"
  >
    <!-- Win2000 titlebar inside drawer -->
    <div class="win-drawer-titlebar">
      <img src="/icone.png" class="win-drawer-icon" alt="" />
      <span>Forge 2000</span>
    </div>

    <!-- Company selector -->
    <div class="px-2 pt-2 pb-1">
      <button class="company-btn" @click="showCompanyModal = true">
        <v-sheet width="22" height="22" rounded="none" class="bg-transparent">
          <v-img src="/icone.png" />
        </v-sheet>
        <div class="company-info">
          <span class="company-label">Empresa</span>
          <span class="company-name">{{ activeCompany?.name || 'Selecione' }}</span>
        </div>
        <ChevronsUpDown :size="12" class="company-chevron" />
      </button>
    </div>

    <div class="divider mx-2 mb-1" />

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
        <v-btn icon="mdi-close" variant="text" size="x-small" color="secondary" @click="showCompanyModal = false" />
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
            <v-icon size="16" :style="{ opacity: company.active ? 1 : 0.45 }">mdi-domain</v-icon>
          </div>
          <div class="company-option-info">
            <span class="company-option-name">{{ company.name }}</span>
            <span class="company-option-cnpj">{{ company.cnpj }}</span>
          </div>
          <v-icon v-if="company.active" size="14" color="success">mdi-check-circle</v-icon>
        </button>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* ── Win2000 drawer chrome ── */
.drawer-custom {
  border-right: 2px solid #404040 !important;
  background: #D4D0C8 !important;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif !important;
  font-size: 11px !important;
}
.win-drawer-titlebar {
  background: linear-gradient(to right, #000080, #1084D0);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: bold;
  padding: 3px 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  user-select: none;
}
.win-drawer-icon {
  width: 14px;
  height: 14px;
  image-rendering: pixelated;
}

.divider {
  height: 1px;
  background: #808080;
  box-shadow: 0 1px 0 #FFFFFF;
}

/* ── Company button ── */
.company-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
  padding: 4px 7px;
  cursor: pointer;
  text-align: left;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif;
}
.company-btn:hover {
  background: #C8C4BC;
}

.company-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.company-label {
  font-size: 9px;
  font-weight: bold;
  color: #555;
  line-height: 1.2;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.company-name {
  font-size: 11px;
  font-weight: bold;
  color: #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.company-chevron {
  color: #555 !important;
  flex-shrink: 0;
}

/* ── Section divider ── */
.section-divider {
  display: flex;
  align-items: center;
  gap: 5px;
}
.section-label {
  font-size: 9px;
  font-weight: bold;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #808080;
  box-shadow: 0 1px 0 #FFFFFF;
}

/* ── Nav items ── */
.nav-item {
  min-height: 24px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border-radius: 0 !important;
}
.nav-item--sub {
  padding-left: 24px !important;
}
.nav-item--deep {
  padding-left: 40px !important;
}
.nav-icon {
  color: #000 !important;
  margin-right: 2px;
}
.nav-label {
  font-size: 11px !important;
  font-weight: normal !important;
  color: #000 !important;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif !important;
}
.v-list-item--active .nav-icon {
  color: #FFFFFF !important;
}
.v-list-item--active .nav-label {
  color: #FFFFFF !important;
  font-weight: bold !important;
}
.v-list-item--active {
  background: #000080 !important;
  border-radius: 0 !important;
}

/* ── Logout button ── */
.logout-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
  padding: 4px 10px;
  cursor: pointer;
  color: #000;
  font-size: 11px;
  font-weight: bold;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif;
}
.logout-btn:hover {
  background: #800000;
  color: #FFFFFF;
  border-top-color: #FF6060;
  border-left-color: #FF6060;
}

/* ── Company dialog ── */
.company-dialog {
  border-top: 2px solid #FFFFFF !important;
  border-left: 2px solid #FFFFFF !important;
  border-right: 2px solid #404040 !important;
  border-bottom: 2px solid #404040 !important;
  background: #D4D0C8 !important;
  box-shadow: 2px 2px 0 #808080 !important;
  border-radius: 0 !important;
}
.company-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  padding: 5px 8px;
  cursor: pointer;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif;
  font-size: 11px;
  text-align: left;
  margin-bottom: 2px;
}
.company-option:hover {
  background: #000080;
  color: #FFFFFF;
}
.company-option--active {
  background: #C8C4BC !important;
  border: 1px solid #808080 !important;
}
.company-option-icon {
  width: 24px;
  height: 24px;
  background: #E8E4DC;
  border-top: 1px solid #FFFFFF;
  border-left: 1px solid #FFFFFF;
  border-right: 1px solid #808080;
  border-bottom: 1px solid #808080;
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
  font-size: 11px;
  font-weight: bold;
  color: #000;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.company-option-cnpj {
  font-size: 10px;
  color: #555;
}
</style>
