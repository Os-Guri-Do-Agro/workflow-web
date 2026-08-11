<script setup lang="ts">
import { computed } from 'vue'
import {
  LayoutDashboard,
  Columns3,
  ListTodo,
  KeyRound,
  StickyNote,
  CalendarDays,
  Timer,
  Users,
  BarChart3,
  CalendarRange,
  Bug,
  HardDrive,
  Milestone,
  Paintbrush,
  QrCode,
  ScanText,
  type LucideIcon,
  Plug,
} from 'lucide-vue-next'
import { useNavQuarters } from '@/composables/useNavQuarters'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useUiPreferences } from '@/composables/useUiPreferences'
import { useIsAdminAnywhere } from '@/composables/useIsAdminAnywhere'
import { CANVAS_ENABLED } from '@/config/feature-flags'

const { density } = useUiPreferences()
// v-list aceita 'compact' | 'comfortable' | 'default'. Mapeamos direto.
const listDensity = computed(() => (density.value === 'comfortable' ? 'comfortable' : 'compact'))

export type NavItem = {
  title: string
  icon: LucideIcon
  to?: string
  children?: NavItem[]
  role?: 'WORKER' | 'ADMIN'
  section?: 'Trabalho' | 'Pessoal' | 'Ferramentas'
}

const { quarters } = useNavQuarters()
const workspace = useWorkspaceStore()
const isAdminAnywhere = useIsAdminAnywhere()

const ROLE_RANK: Record<string, number> = {
  WORKER: 0,
  ADMIN: 1,
}

function userMeetsRole(required?: string): boolean {
  if (!required) return true
  const active = workspace.activeRole
  if (!active) return false
  return (ROLE_RANK[active] ?? -1) >= (ROLE_RANK[required] ?? -1)
}

const mainItems = computed<NavItem[]>(() => [
  { title: 'Dashboard', icon: LayoutDashboard, to: '/dashboard', section: 'Trabalho' },
  { title: 'Board', icon: Columns3, to: '/board', section: 'Trabalho' },
  // Canvas: escondido via feature flag (CANVAS_ENABLED). Reativar = VITE_CANVAS_ENABLED=true.
  ...(CANVAS_ENABLED
    ? [{ title: 'Canvas', icon: Paintbrush, to: '/boards', section: 'Trabalho' } as NavItem]
    : []),
  { title: 'Roadmap', icon: Milestone, to: '/roadmap', section: 'Trabalho' },
  { title: 'Drive', icon: HardDrive, to: '/drive', section: 'Trabalho' },
  { title: 'Bug reports', icon: Bug, to: '/bug-reports', role: 'WORKER', section: 'Trabalho' },
  // Repos: oculto da sidebar por enquanto (acesso ainda via URL direta /repos)
  { title: 'Variáveis', icon: KeyRound, to: '/variables', section: 'Trabalho' },
  { title: 'Usuários', icon: Users, to: '/company-users', role: 'ADMIN', section: 'Trabalho' },
])

/**
 * Ferramentas de INTEGRAÇÃO: o que a empresa consome de fora do workflow, via
 * API com token (QR dinâmico, leitura de documentos). Seção própria, por
 * último, para não misturar com o dia a dia de gestão. O QR morava em
 * "Trabalho" e mudou para cá quando a seção nasceu.
 */
const toolsItems = computed<NavItem[]>(() => [
  { title: 'QR Codes', icon: QrCode, to: '/qr', section: 'Ferramentas' },
  { title: 'OCR Digital', icon: ScanText, to: '/ocr', section: 'Ferramentas' },
  // Tokens das duas ferramentas acima. Só para quem é ADMIN de alguma empresa
  // (a página é agregada; não depende da empresa ativa).
  ...(isAdminAnywhere.value
    ? [
        {
          title: 'Acessos Públicos',
          icon: Plug,
          to: '/public-access',
          section: 'Ferramentas',
        } as NavItem,
      ]
    : []),
])

const taskItem = computed<NavItem | null>(() => {
  if (!quarters.value.length) return null
  return {
    title: 'Tarefas',
    icon: ListTodo,
    section: 'Trabalho',
    children: quarters.value.map((quarter) => ({
      title: `${quarter.label} • ${quarter.monthsLabel}`,
      icon: ListTodo,
      children: [
        {
          title: `Relatório ${quarter.label}`,
          icon: BarChart3,
          to: `/relatorio/${quarter.id}`,
        },
        ...quarter.months.map((month) => ({
          title: month.name,
          icon: CalendarRange,
          to: `/tasks/${month.id}`,
        })),
      ],
    })),
  }
})

const personalItems = computed<NavItem[]>(() => [
  { title: 'Meu tempo', icon: Timer, to: '/time', section: 'Pessoal' },
  { title: 'Notas', icon: StickyNote, to: '/notes', section: 'Pessoal' },
  { title: 'Calendário', icon: CalendarDays, to: '/calendar', section: 'Pessoal' },
])

const workItems = computed<NavItem[]>(() => {
  const items = [...mainItems.value]
  if (taskItem.value) {
    const idx = items.findIndex((i) => i.to === '/variables')
    items.splice(idx >= 0 ? idx : items.length, 0, taskItem.value)
  }
  return items.filter((i) => userMeetsRole(i.role))
})

defineExpose({ workItems, personalItems, toolsItems })
</script>

<template>
  <div class="nav-sections" :class="`nav-sections--${density}`">
    <div class="nav-section">
      <div class="nav-eyebrow">Trabalho</div>
      <v-list nav :density="listDensity" class="nav-list">
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
      <v-list nav :density="listDensity" class="nav-list">
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

    <!-- Integração via API (QR, OCR): seção própria, sempre por último. -->
    <div class="nav-section">
      <div class="nav-eyebrow">Ferramentas</div>
      <v-list nav :density="listDensity" class="nav-list">
        <v-list-item
          v-for="item in toolsItems"
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

/* Density real (acessibilidade 50+): "confortável" abre os itens e o respiro
   entre seções de forma visível; "compacta" adensa. */
.nav-sections--comfortable {
  gap: 18px;
}

.nav-sections--comfortable .nav-item {
  min-height: 42px !important;
}

.nav-sections--compact .nav-item {
  min-height: 32px !important;
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
