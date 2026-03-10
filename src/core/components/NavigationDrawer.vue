<script setup lang="ts">
import router from '@/router'
import { ref, computed, onMounted } from 'vue'
import companiesServices from '@/service/companies/companies-services'
import quartersService from '@/service/quarters/quarters-service'

type MenuItem = {
  title: string
  icon?: string
  to?: string
  children?: MenuItem[]
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
  localStorage.setItem('activeCompany', company.id)
  showCompanyModal.value = false
  router.push('/dashboard')
  findQuaters()
}

const menuItems = computed(() => {
  const items: MenuItem[] = [{ title: 'Dashboard', icon: 'mdi-view-dashboard', to: '/' }]

  if (quaters.value?.length > 0) {
    const quarterIcons = [
      'mdi-numeric-1-box',
      'mdi-numeric-2-box',
      'mdi-numeric-3-box',
      'mdi-numeric-4-box',
    ]

    items.push({
      title: 'Tarefas',
      icon: 'mdi-calendar-month',
      children: quaters.value.map((quarter, index) => ({
        title: `${quarter.label} • ${quarter.months?.map((m: any) => m.name.slice(0, 3)).join('-') || ''}`,
        icon: quarterIcons[index] || 'mdi-numeric',
        children: [
          {
            title: `Relatório ${quarter.label}`,
            icon: 'mdi-chart-box',
            to: `/relatorio/${quarter.label.toLowerCase()}`,
          },
          ...(quarter.months?.map((month: any) => ({
            title: month.name,
            icon: 'mdi-calendar',
            to: `/tasks/${month.id}`,
          })) || []),
        ],
      })),
    })
  }

  return items
})

const logout = () => {
  localStorage.clear()
  router.push('/')
}

const footerItems = [
  { title: 'Configurações', icon: 'mdi-cog-outline', to: '/settings' },
  { title: 'Sair', icon: 'mdi-logout', action: logout },
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
    width="250"
    permanent
    color="primary"
    border="secondary-lighten-4"
  >
    <v-sheet color="transparent" class="pa-2 d-flex justify-space-between align-center">
      <div class="d-flex align-center ga-2 pa-1">
        <v-icon size="24" color="secondary">mdi-alpha-w-box</v-icon>
        <span class="text-body-2 font-weight-bold text-secondary">{{ activeCompany?.name }}</span>
      </div>
      <v-btn
        icon="mdi-swap-horizontal"
        size="small"
        variant="text"
        icon-size="32"
        @click="showCompanyModal = true"
      ></v-btn>
    </v-sheet>

    <v-list nav density="compact" class="px-1">
      <template v-for="item in menuItems" :key="item.title">
        <v-list-item
          v-if="!item.children"
          :to="item.to"
          :value="item.title"
          rounded="lg"
          class="mb-1"
          color="secondary"
        >
          <template #prepend>
            <v-icon size="18">{{ item.icon }}</v-icon>
          </template>
          <v-list-item-title class="text-caption font-weight-medium">{{
            item.title
          }}</v-list-item-title>
        </v-list-item>

        <v-list-group v-else :value="item.title">
          <template #activator="{ props }">
            <v-list-item v-bind="props" rounded="lg" class="mb-1" color="secondary">
              <template #prepend>
                <v-icon size="18">{{ item.icon }}</v-icon>
              </template>
              <v-list-item-title class="text-caption font-weight-medium">{{
                item.title
              }}</v-list-item-title>
            </v-list-item>
          </template>

          <template v-for="subItem in item.children" :key="subItem.title">
            <v-list-item
              v-if="!subItem.children"
              :to="subItem.to"
              :value="subItem.title"
              class="pl-8 mb-1"
              rounded="lg"
              color="secondary"
            >
              <template #prepend>
                <v-icon size="16">{{ subItem.icon }}</v-icon>
              </template>
              <v-list-item-title class="text-caption">{{ subItem.title }}</v-list-item-title>
            </v-list-item>

            <v-list-group v-else :value="subItem.title" no-action>
              <template #activator="{ props }">
                <v-list-item v-bind="props" class="pl-6 mb-1" rounded="lg">
                  <template #prepend>
                    <v-icon size="18">{{ subItem.icon }}</v-icon>
                  </template>
                  <v-list-item-title class="text-caption font-weight-medium">{{
                    subItem.title
                  }}</v-list-item-title>
                </v-list-item>
              </template>

              <v-list-item
                v-for="child in subItem.children"
                :key="child.title"
                :to="child.to"
                :value="child.title"
                class="pl-14 mb-1"
                rounded="lg"
                color="secondary"
              >
                <template #prepend>
                  <v-icon size="14">{{ child.icon }}</v-icon>
                </template>
                <v-list-item-title class="text-caption">{{ child.title }}</v-list-item-title>
              </v-list-item>
            </v-list-group>
          </template>
        </v-list-group>
      </template>
    </v-list>

    <template #append>
      <v-divider class="mb-2" />
      <v-list nav density="compact" class="px-1">
        <v-list-item
          v-for="item in footerItems"
          :key="item.title"
          :to="item.to"
          :value="item.title"
          rounded="lg"
          class="mb-1"
          color="primary-lighten"
          @click="item.action?.()"
        >
          <template #prepend>
            <v-icon size="18">{{ item.icon }}</v-icon>
          </template>
          <v-list-item-title class="text-caption font-weight-medium">{{
            item.title
          }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </template>
  </v-navigation-drawer>

  <v-dialog v-model="showCompanyModal" max-width="480" transition="dialog-bottom-transition">
    <v-card rounded="lg" elevation="8">
      <v-card-title class="d-flex align-center justify-space-between pa-5 bg-primary">
        <div class="d-flex align-center ga-3">
          <v-icon color="secondary" size="28">mdi-office-building</v-icon>
          <span class="text-h6 font-weight-bold text-secondary">Trocar Empresa</span>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="showCompanyModal = false"
          color="secondary"
        ></v-btn>
      </v-card-title>

      <v-card-text class="pa-0">
        <v-list class="py-2" bg-color="transparent">
          <v-list-item
            v-for="(company, index) in companies"
            :key="company.id"
            @click="switchCompany(company)"
            :active="company.active"
            class="mx-3 mb-2 company-item"
            rounded="lg"
            :class="{ 'active-company': company.active }"
          >
            <template #prepend>
              <v-avatar :color="company.active ? 'secondary' : 'grey-lighten-2'" size="40">
                <v-icon :color="company.active ? 'primary' : 'grey'" size="20">mdi-domain</v-icon>
              </v-avatar>
            </template>

            <v-list-item-title class="font-weight-medium mb-1">{{
              company.name
            }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption"
              >CNPJ: {{ company.cnpj }}</v-list-item-subtitle
            >

            <template #append>
              <v-icon v-if="company.active" color="success" size="24">mdi-check-circle</v-icon>
            </template>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.v-list-item--active {
  background: rgb(var(--v-theme-secondary)) !important;
  color: rgb(var(--v-theme-primary)) !important;
}

.v-list-item--active :deep(.v-icon) {
  color: rgb(var(--v-theme-primary)) !important;
}

.company-item {
  border: 2px solid transparent;
  transition: all 0.2s ease;
  cursor: pointer;
}

.company-item:hover {
  border-color: rgb(var(--v-theme-secondary));
  background-color: rgba(var(--v-theme-secondary), 0.05);
}

.active-company {
  border-color: rgb(var(--v-theme-secondary));
  background-color: rgba(var(--v-theme-secondary), 0.1);
}
</style>
