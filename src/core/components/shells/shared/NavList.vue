<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  LayoutDashboard,
  Columns3,
  ListTodo,
  Ticket,
  KeyRound,
  StickyNote,
  CalendarDays,
  Users,
  BarChart3,
  CalendarRange,
  type LucideIcon,
} from 'lucide-vue-next'
import quartersService from '@/service/quarters/quarters-service'

export type NavItem = {
  title: string
  icon: LucideIcon
  to?: string
  children?: NavItem[]
  role?: string
  section?: 'Trabalho' | 'Pessoal'
}

const quarters = ref<any[]>([])

const loadQuarters = async () => {
  const companyId = localStorage.getItem('activeCompany')
  if (!companyId) return
  try {
    const response = await quartersService.getCompanyQuarters(companyId)
    quarters.value = response.data || response
  } catch (e) {
    console.error('Error fetching quarters:', e)
  }
}

onMounted(() => {
  if (localStorage.getItem('token')) loadQuarters()
})

const mainItems = computed<NavItem[]>(() => [
  { title: 'Dashboard', icon: LayoutDashboard, to: '/dashboard', section: 'Trabalho' },
  { title: 'Board', icon: Columns3, to: '/board', section: 'Trabalho' },
  { title: 'Tickets', icon: Ticket, to: '/tickets', section: 'Trabalho' },
  { title: 'Variáveis', icon: KeyRound, to: '/variables', section: 'Trabalho' },
  { title: 'Usuários', icon: Users, to: '/company-users', role: 'ADMIN', section: 'Trabalho' },
])

const taskItem = computed<NavItem | null>(() => {
  if (!quarters.value?.length) return null
  return {
    title: 'Tarefas',
    icon: ListTodo,
    section: 'Trabalho',
    children: quarters.value.map((quarter) => ({
      title: `${quarter.label} • ${quarter.months?.map((m: any) => m.name.slice(0, 3)).join('-') || ''}`,
      icon: ListTodo,
      children: [
        {
          title: `Relatório ${quarter.label}`,
          icon: BarChart3,
          to: `/relatorio/${quarter.id}`,
        },
        ...(quarter.months?.map((month: any) => ({
          title: month.name,
          icon: CalendarRange,
          to: `/tasks/${month.id}`,
        })) || []),
      ],
    })),
  }
})

const personalItems = computed<NavItem[]>(() => [
  { title: 'Notas', icon: StickyNote, to: '/notes', section: 'Pessoal' },
  { title: 'Calendário', icon: CalendarDays, to: '/calendar', section: 'Pessoal' },
])

const workItems = computed<NavItem[]>(() => {
  const items = [...mainItems.value]
  if (taskItem.value) {
    const idx = items.findIndex((i) => i.to === '/variables')
    items.splice(idx >= 0 ? idx : items.length, 0, taskItem.value)
  }
  return items
})

defineExpose({ workItems, personalItems })
</script>

<template>
  <div class="nav-sections">
    <div class="nav-section">
      <div class="nav-eyebrow">Trabalho</div>
      <v-list nav density="compact" class="nav-list">
        <template v-for="item in workItems" :key="item.title">
          <v-list-item
            v-if="!item.children"
            :to="item.to"
            :value="item.title"
            rounded="lg"
            class="nav-item"
            color="secondary"
          >
            <template #prepend>
              <component :is="item.icon" :size="15" class="nav-icon" />
            </template>
            <v-list-item-title class="nav-label">{{ item.title }}</v-list-item-title>
          </v-list-item>

          <v-list-group v-else :value="item.title">
            <template #activator="{ props }">
              <v-list-item v-bind="props" rounded="lg" class="nav-item" color="secondary">
                <template #prepend>
                  <component :is="item.icon" :size="15" class="nav-icon" />
                </template>
                <v-list-item-title class="nav-label">{{ item.title }}</v-list-item-title>
              </v-list-item>
            </template>

            <template v-for="subItem in item.children" :key="subItem.title">
              <v-list-item
                v-if="!subItem.children"
                :to="subItem.to"
                :value="subItem.title"
                class="nav-item nav-item--sub"
                rounded="lg"
                color="secondary"
              >
                <template #prepend>
                  <component :is="subItem.icon" :size="14" class="nav-icon" />
                </template>
                <v-list-item-title class="nav-label">{{ subItem.title }}</v-list-item-title>
              </v-list-item>

              <v-list-group v-else :value="subItem.title" no-action>
                <template #activator="{ props }">
                  <v-list-item v-bind="props" class="nav-item nav-item--sub" rounded="lg">
                    <template #prepend>
                      <component :is="subItem.icon" :size="14" class="nav-icon" />
                    </template>
                    <v-list-item-title class="nav-label">{{ subItem.title }}</v-list-item-title>
                  </v-list-item>
                </template>

                <v-list-item
                  v-for="child in subItem.children"
                  :key="child.title"
                  :to="child.to"
                  :value="child.title"
                  class="nav-item nav-item--deep"
                  rounded="lg"
                  color="secondary"
                >
                  <template #prepend>
                    <component :is="child.icon" :size="13" class="nav-icon" />
                  </template>
                  <v-list-item-title class="nav-label">{{ child.title }}</v-list-item-title>
                </v-list-item>
              </v-list-group>
            </template>
          </v-list-group>
        </template>
      </v-list>
    </div>

    <div class="nav-section">
      <div class="nav-eyebrow">Pessoal</div>
      <v-list nav density="compact" class="nav-list">
        <v-list-item
          v-for="item in personalItems"
          :key="item.title"
          :to="item.to"
          :value="item.title"
          rounded="lg"
          class="nav-item"
          color="secondary"
        >
          <template #prepend>
            <component :is="item.icon" :size="15" class="nav-icon" />
          </template>
          <v-list-item-title class="nav-label">{{ item.title }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </div>
  </div>
</template>

<style scoped>
.nav-sections {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 8px;
}

.nav-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-4);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 6px 8px 4px;
}

.nav-list {
  background: transparent !important;
  padding: 0 !important;
}

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
  color: var(--text-3);
  margin-right: 2px;
  flex-shrink: 0;
}

.nav-label {
  font-size: 12.5px !important;
  font-weight: 500 !important;
  color: var(--text-2) !important;
}

.v-list-item--active .nav-icon {
  color: var(--text);
}

.v-list-item--active .nav-label {
  color: var(--text) !important;
  font-weight: 600 !important;
}

.v-list-item--active {
  background: var(--surface-2) !important;
}
</style>
