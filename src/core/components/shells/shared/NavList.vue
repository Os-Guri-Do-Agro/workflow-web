<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  ChevronRight,
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
  Link2,
  BookOpen,
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
import { isNavHidden } from '@/config/nav-visibility'

const { density } = useUiPreferences()
// v-list aceita 'compact' | 'comfortable' | 'default'. Mapeamos direto.
const listDensity = computed(() => (density.value === 'comfortable' ? 'comfortable' : 'compact'))

export type NavSectionName = 'Trabalho' | 'Empresa' | 'Pessoal' | 'Ferramentas'

export type NavItem = {
  title: string
  icon: LucideIcon
  to?: string
  children?: NavItem[]
  role?: 'WORKER' | 'ADMIN'
  section?: NavSectionName
}

type NavSection = { name: NavSectionName; items: NavItem[] }

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

/**
 * TRABALHO é o dia a dia de execução: o que a pessoa abre várias vezes por dia.
 * Tarefas entra entre Board e Roadmap (ver `workItems`), porque só existe
 * depois que os trimestres carregam.
 */
const mainItems = computed<NavItem[]>(() => (<NavItem[]>[
  { title: 'Dashboard', icon: LayoutDashboard, to: '/dashboard', section: 'Trabalho' },
  { title: 'Board', icon: Columns3, to: '/board', section: 'Trabalho' },
  // Canvas: escondido via feature flag (CANVAS_ENABLED). Reativar = VITE_CANVAS_ENABLED=true.
  ...(CANVAS_ENABLED
    ? [{ title: 'Canvas', icon: Paintbrush, to: '/boards', section: 'Trabalho' } as NavItem]
    : []),
  { title: 'Roadmap', icon: Milestone, to: '/roadmap', section: 'Trabalho' },
]).filter((i) => !isNavHidden(i.to)))

/**
 * EMPRESA reúne os recursos e a administração da empresa: não é execução do
 * dia, é o que a empresa guarda (arquivos, erros relatados, segredos) e quem
 * faz parte dela. Morava tudo em "Trabalho", que tinha oito itens
 * misturando as duas coisas.
 */
const companyItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { title: 'Drive', icon: HardDrive, to: '/drive', section: 'Empresa' },
    { title: 'Bug reports', icon: Bug, to: '/bug-reports', role: 'WORKER', section: 'Empresa' },
    // Repos: oculto da sidebar por enquanto (acesso ainda via URL direta /repos)
    { title: 'Variáveis', icon: KeyRound, to: '/variables', section: 'Empresa' },
    { title: 'Usuários', icon: Users, to: '/company-users', role: 'ADMIN', section: 'Empresa' },
  ]
  return items.filter((i) => userMeetsRole(i.role) && !isNavHidden(i.to))
})

/**
 * Ferramentas de INTEGRAÇÃO: o que a empresa consome de fora do workflow, via
 * API com token (QR dinâmico, leitura de documentos). Seção própria, por
 * último, para não misturar com o dia a dia de gestão. O QR morava em
 * "Trabalho" e mudou para cá quando a seção nasceu.
 */
const toolsItems = computed<NavItem[]>(() => (<NavItem[]>[
  { title: 'QR Codes', icon: QrCode, to: '/qr', section: 'Ferramentas' },
  { title: 'Encurtador', icon: Link2, to: '/links', section: 'Ferramentas' },
  { title: 'OCR Digital', icon: ScanText, to: '/ocr', section: 'Ferramentas' },
  { title: 'Biblioteca', icon: BookOpen, to: '/recursos', section: 'Ferramentas' },
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
]).filter((i) => !isNavHidden(i.to)))

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

const personalItems = computed<NavItem[]>(() => (<NavItem[]>[
  { title: 'Meu tempo', icon: Timer, to: '/time', section: 'Pessoal' },
  { title: 'Notas', icon: StickyNote, to: '/notes', section: 'Pessoal' },
  { title: 'Calendário', icon: CalendarDays, to: '/calendar', section: 'Pessoal' },
]).filter((i) => !isNavHidden(i.to)))

const workItems = computed<NavItem[]>(() => {
  const items = [...mainItems.value]
  if (taskItem.value) {
    const idx = items.findIndex((i) => i.to === '/roadmap')
    items.splice(idx >= 0 ? idx : items.length, 0, taskItem.value)
  }
  return items.filter((i) => userMeetsRole(i.role))
})

/**
 * Ordem das seções: execução, pessoal, empresa e, por último, as ferramentas de
 * integração (Pessoal antes de Empresa a pedido do Nicolas, out/2026: é o que se
 * usa no dia a dia). Seção sem item para o papel da pessoa não desenha nem o rótulo.
 */
const sections = computed<NavSection[]>(() =>
  [
    { name: 'Trabalho' as const, items: workItems.value },
    { name: 'Pessoal' as const, items: personalItems.value },
    { name: 'Empresa' as const, items: companyItems.value },
    { name: 'Ferramentas' as const, items: toolsItems.value },
  ].filter((s) => s.items.length > 0),
)

// ── Seções recolhíveis ───────────────────────────────────────────────────────
//
// Clicar no nome da seção recolhe ou abre. É preferência de quem usa (fica no
// navegador). Na primeira vez, Empresa e Ferramentas nascem recolhidas: são as
// que se abrem de vez em quando, e o menu fica enxuto. Recolhida, a seção
// ainda mostra o item da tela aberta, para ninguém perder onde está.
const COLLAPSE_KEY = 'nav.collapsed'
const DEFAULT_COLLAPSED: NavSectionName[] = ['Empresa', 'Ferramentas']

function readCollapsed(): NavSectionName[] {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY)
    if (raw === null) return [...DEFAULT_COLLAPSED]
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as NavSectionName[]) : [...DEFAULT_COLLAPSED]
  } catch {
    return [...DEFAULT_COLLAPSED]
  }
}

const collapsed = ref<NavSectionName[]>(readCollapsed())
const isCollapsed = (name: NavSectionName) => collapsed.value.includes(name)

function toggleSection(name: NavSectionName) {
  collapsed.value = isCollapsed(name)
    ? collapsed.value.filter((n) => n !== name)
    : [...collapsed.value, name]
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed.value))
  } catch {
    // Sem storage: vale enquanto a página estiver aberta.
  }
}

const route = useRoute()

/** O item (ou um filho dele) é a tela aberta. */
function isCurrent(item: NavItem): boolean {
  if (item.to && (route.path === item.to || route.path.startsWith(`${item.to}/`))) return true
  return item.children?.some(isCurrent) ?? false
}

/** O que a seção desenha: tudo, ou só a tela aberta quando recolhida. */
function visibleItems(section: NavSection): NavItem[] {
  return isCollapsed(section.name) ? section.items.filter(isCurrent) : section.items
}

defineExpose({ workItems, companyItems, personalItems, toolsItems })
</script>

<template>
  <div class="nav-sections" :class="`nav-sections--${density}`">
    <!-- A ordem vem de `sections` (Ferramentas sempre por último). O rótulo
         "Empresa" não leva o nome da empresa ativa: o seletor do topo já mostra
         qual é, e o Drive abre no escopo Pessoal, então o nome prometeria um
         filtro que a tela não aplica. -->
    <div
      v-for="section in sections"
      :key="section.name"
      class="nav-section"
      :class="{ 'nav-section--collapsed': isCollapsed(section.name) }"
    >
      <!-- O nome da seção é o botão de recolher: alvo grande e sem ícone a
           mais competindo com os itens. -->
      <button
        :id="`nav-eyebrow-${section.name}`"
        type="button"
        class="nav-eyebrow"
        :aria-expanded="!isCollapsed(section.name)"
        :aria-controls="`nav-list-${section.name}`"
        :title="isCollapsed(section.name) ? `Mostrar ${section.name}` : `Recolher ${section.name}`"
        @click="toggleSection(section.name)"
      >
        <span class="nav-eyebrow__label">{{ section.name }}</span>
        <span v-if="isCollapsed(section.name)" class="nav-eyebrow__count">
          {{ section.items.length }}
        </span>
        <ChevronRight
          :size="13"
          class="nav-eyebrow__chev"
          :class="{ 'nav-eyebrow__chev--open': !isCollapsed(section.name) }"
          aria-hidden="true"
        />
      </button>
      <v-list
        v-if="visibleItems(section).length"
        :id="`nav-list-${section.name}`"
        nav
        :density="listDensity"
        class="nav-list"
        :aria-labelledby="`nav-eyebrow-${section.name}`"
      >
        <template v-for="item in visibleItems(section)" :key="item.title">
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

/* 44px: alvo de toque mínimo do modo pensado para quem precisa de mais área. */
.nav-sections--comfortable .nav-item {
  min-height: 44px !important;
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
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-4);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  cursor: pointer;
}

.nav-sections--comfortable .nav-eyebrow {
  min-height: 36px;
}

.nav-eyebrow:hover {
  color: var(--text-2);
  background: var(--surface-2);
}

.nav-eyebrow:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.nav-eyebrow__label {
  flex: 1;
  min-width: 0;
}

/* Recolhida: quantos itens tem lá dentro, sem precisar abrir. */
.nav-eyebrow__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* Aberta, a seta só aparece quando a mão chega (hover, foco): o menu fica
   quieto. Recolhida, fica sempre à vista, junto da contagem. */
.nav-eyebrow__chev {
  flex: none;
  color: var(--text-4);
  opacity: 0;
  transition:
    transform var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
}

.nav-eyebrow:hover .nav-eyebrow__chev,
.nav-eyebrow:focus-visible .nav-eyebrow__chev,
.nav-section--collapsed .nav-eyebrow__chev {
  opacity: 1;
}

@media (hover: none) {
  .nav-eyebrow__chev {
    opacity: 1;
  }
}

.nav-eyebrow__chev--open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .nav-eyebrow__chev {
    transition: none;
  }
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

/* Tela aberta na cor escolhida em Configurações: fundo tingido e ícone e texto
   no tom legível do acento (misturado ao texto, nunca o acento puro, que no
   tema claro lê como neon). */
.v-list-item--active .nav-icon {
  color: var(--accent-ink);
}

.v-list-item--active .nav-label {
  color: var(--accent-ink) !important;
  font-weight: 600 !important;
}

.v-list-item--active {
  background: var(--accent-soft) !important;
}

/* O overlay do Vuetify (cor "secondary") escurecia o tom por cima e deixava o
   fundo cinza-esverdeado. O tom é só o nosso. */
.v-list-item--active :deep(.v-list-item__overlay) {
  opacity: 0 !important;
}
</style>
