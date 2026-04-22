<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  LayoutDashboard,
  Ticket,
  KeyRound,
  Users,
  Settings,
  Sun,
  Moon,
  LogOut,
  Building2,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Clock,
  type LucideIcon,
} from 'lucide-vue-next'
import companiesServices from '@/service/companies/companies-services'
import { useActiveCompanyId } from '@/stores/authStores'
import { getInfoAuth } from '@/utils/authContent'
import { useUiPreferences } from '@/composables/useUiPreferences'

const router = useRouter()
const activeCompanyStore = useActiveCompanyId()
const { theme, toggleTheme } = useUiPreferences()

const isOpen = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const companies = ref<{ id: string; name: string }[]>([])
const recentIds = ref<string[]>(loadRecents())

const RECENTS_KEY = 'cmdk.recents'
function loadRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]')
  } catch {
    return []
  }
}
function saveRecents() {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recentIds.value.slice(0, 6)))
}

const loadCompanies = async () => {
  try {
    const response = await companiesServices.getCompany()
    const data = Array.isArray(response) ? response : response?.data || []
    companies.value = data.map((item: any) => ({
      id: item.company?.id || item.id,
      name: item.company?.name || item.name,
    }))
  } catch {
    /* silent */
  }
}

interface Command {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  section: string
  action: () => void
  keywords?: string
}

const staticCommands = computed<Command[]>(() => [
  { id: 'nav-dash', label: 'Dashboard', hint: 'Visão geral', icon: LayoutDashboard, section: 'Navegação', keywords: 'home inicio painel', action: () => go('/') },
  { id: 'nav-tickets', label: 'Tickets', hint: 'Gerenciar tickets', icon: Ticket, section: 'Navegação', keywords: 'suporte', action: () => go('/tickets') },
  { id: 'nav-vars', label: 'Variáveis', hint: 'Credenciais e URLs', icon: KeyRound, section: 'Navegação', keywords: 'senhas secrets env aws', action: () => go('/variables') },
  { id: 'nav-users', label: 'Usuários / Empresas', hint: 'Gestão de acesso', icon: Users, section: 'Navegação', keywords: 'pessoas time membros', action: () => go('/company-users') },
  { id: 'nav-settings', label: 'Configurações', hint: 'Aparência e preferências', icon: Settings, section: 'Navegação', keywords: 'tema shell accent ajustes', action: () => go('/settings') },
  {
    id: 'act-theme',
    label: theme.value === 'dark' ? 'Modo Claro' : 'Modo Escuro',
    hint: 'Alternar tema',
    icon: theme.value === 'dark' ? Sun : Moon,
    section: 'Ações',
    keywords: 'dark light dia noite',
    action: () => {
      toggleTheme()
      close()
    },
  },
  { id: 'act-logout', label: 'Sair', hint: 'Encerrar sessão', icon: LogOut, section: 'Ações', keywords: 'logout exit', action: logout },
])

const companyCommands = computed<Command[]>(() =>
  companies.value.map((c) => ({
    id: `company-${c.id}`,
    label: c.name,
    hint: 'Trocar empresa',
    icon: Building2,
    section: 'Empresas',
    action: () => switchCompany(c.id),
  })),
)

const allCommands = computed(() => [...staticCommands.value, ...companyCommands.value])

// Fuzzy subsequence match with score (lower = better)
function fuzzyScore(text: string, q: string): number | null {
  const t = text.toLowerCase()
  const query = q.toLowerCase()
  if (!query) return 0
  let ti = 0
  let prev = -1
  let score = 0
  for (const ch of query) {
    const idx = t.indexOf(ch, ti)
    if (idx === -1) return null
    if (prev !== -1) score += idx - prev - 1
    prev = idx
    ti = idx + 1
  }
  // prefix bonus
  if (t.startsWith(query)) score -= 20
  // exact contains bonus
  if (t.includes(query)) score -= 5
  return score
}

const filtered = computed(() => {
  const q = query.value.trim()
  if (!q) return allCommands.value
  const scored: { cmd: Command; score: number }[] = []
  for (const cmd of allCommands.value) {
    const target = `${cmd.label} ${cmd.hint || ''} ${cmd.keywords || ''} ${cmd.section}`
    const s = fuzzyScore(target, q)
    if (s !== null) scored.push({ cmd, score: s })
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.cmd)
})

const groups = computed(() => {
  const q = query.value.trim()
  const groupsMap = new Map<string, Command[]>()
  if (!q && recentIds.value.length) {
    const recents = recentIds.value
      .map((id) => allCommands.value.find((c) => c.id === id))
      .filter((x): x is Command => !!x)
    if (recents.length) groupsMap.set('Recentes', recents)
  }
  for (const cmd of filtered.value) {
    if (!groupsMap.has(cmd.section)) groupsMap.set(cmd.section, [])
    groupsMap.get(cmd.section)!.push(cmd)
  }
  return groupsMap
})

const flatList = computed(() => {
  const list: Command[] = []
  for (const arr of groups.value.values()) list.push(...arr)
  return list
})

function trackRecent(id: string) {
  recentIds.value = [id, ...recentIds.value.filter((x) => x !== id)].slice(0, 6)
  saveRecents()
}

function go(path: string) {
  close()
  router.push(path)
}

function logout() {
  close()
  localStorage.clear()
  router.push('/login')
}

function switchCompany(id: string) {
  activeCompanyStore.setCompanyId(id)
  localStorage.setItem('activeCompany', id)
  getInfoAuth()
  close()
  router.push('/')
}

function open() {
  isOpen.value = true
  query.value = ''
  selectedIndex.value = 0
  loadCompanies()
  nextTick(() => inputRef.value?.focus())
}

function close() {
  isOpen.value = false
  query.value = ''
}

function runSelected() {
  const cmd = flatList.value[selectedIndex.value]
  if (cmd) {
    trackRecent(cmd.id)
    cmd.action()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, flatList.value.length - 1)
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runSelected()
  } else if (e.key === 'Escape') {
    close()
  }
}

function scrollToSelected() {
  nextTick(() => {
    const el = document.querySelector('.cmd-item.selected')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

watch(query, () => {
  selectedIndex.value = 0
})

function globalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (isOpen.value) close()
    else open()
  }
}

onMounted(() => window.addEventListener('keydown', globalKeydown))
onUnmounted(() => window.removeEventListener('keydown', globalKeydown))

// Highlight fuzzy match as segmented array (rendered via v-for in template)
type HlSeg = { text: string; match: boolean }

function highlightSegments(text: string, q: string): HlSeg[] {
  if (!q) return [{ text, match: false }]
  const low = text.toLowerCase()
  const query = q.toLowerCase()
  const segs: HlSeg[] = []
  let ti = 0
  for (const ch of query) {
    const idx = low.indexOf(ch, ti)
    if (idx === -1) {
      if (ti < text.length) segs.push({ text: text.slice(ti), match: false })
      return segs
    }
    if (idx > ti) segs.push({ text: text.slice(ti, idx), match: false })
    segs.push({ text: text[idx] || '', match: true })
    ti = idx + 1
  }
  if (ti < text.length) segs.push({ text: text.slice(ti), match: false })
  return segs
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="isOpen" class="palette-overlay" @mousedown.self="close">
        <div class="palette-container">
          <div class="palette-input-row">
            <Search :size="16" class="palette-search-icon" />
            <input
              ref="inputRef"
              v-model="query"
              class="palette-input"
              placeholder="Buscar comandos, páginas, empresas…"
              @keydown="onKeydown"
            />
            <kbd class="palette-kbd">esc</kbd>
          </div>

          <div class="palette-results">
            <div v-if="flatList.length === 0" class="palette-empty">
              <Search :size="22" class="empty-icon" />
              <span>Nenhum resultado para "{{ query }}"</span>
            </div>

            <template v-for="[section, commands] in groups" :key="section">
              <div class="palette-section-label">
                <Clock v-if="section === 'Recentes'" :size="10" class="section-icon" />
                {{ section }}
              </div>
              <button
                v-for="cmd in commands"
                :key="cmd.id"
                class="cmd-item"
                :class="{ selected: flatList.indexOf(cmd) === selectedIndex }"
                @mouseenter="selectedIndex = flatList.indexOf(cmd)"
                @click="() => { trackRecent(cmd.id); cmd.action() }"
              >
                <component :is="cmd.icon" :size="15" class="cmd-icon" />
                <span class="cmd-label">
                  <span
                    v-for="(seg, si) in highlightSegments(cmd.label, query)"
                    :key="si"
                    :class="{ 'cmd-match': seg.match }"
                  >{{ seg.text }}</span>
                </span>
                <span v-if="cmd.hint" class="cmd-hint">{{ cmd.hint }}</span>
                <CornerDownLeft
                  v-if="flatList.indexOf(cmd) === selectedIndex"
                  :size="12"
                  class="cmd-enter-icon"
                />
              </button>
            </template>
          </div>

          <div class="palette-footer">
            <span class="footer-item"><ArrowUp :size="10" /><ArrowDown :size="10" />navegar</span>
            <span class="footer-item"><CornerDownLeft :size="10" />selecionar</span>
            <span class="footer-item"><kbd>esc</kbd>fechar</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: color-mix(in srgb, #000 50%, transparent);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 13vh;
}

.palette-container {
  width: 600px;
  max-width: calc(100% - 32px);
  max-height: 520px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.palette-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--border);
}

.palette-search-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--text);
  caret-color: var(--accent);
  font-family: inherit;
}

.palette-input::placeholder {
  color: var(--text-4);
}

.palette-kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.palette-results {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.palette-section-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 10px 10px 4px;
}

.section-icon {
  color: var(--text-4);
}

.cmd-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
  text-align: left;
  font-family: inherit;
  position: relative;
}

.cmd-item.selected {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
}

.cmd-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.cmd-item.selected .cmd-icon {
  color: var(--accent);
}

.cmd-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cmd-label :deep(.cmd-match) {
  color: var(--accent);
  background: transparent;
  font-weight: 700;
}

.cmd-hint {
  font-size: 11.5px;
  color: var(--text-4);
  flex-shrink: 0;
}

.cmd-enter-icon {
  color: var(--text-3);
  opacity: 0.85;
  flex-shrink: 0;
}

.palette-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 44px 20px;
  font-size: 12.5px;
  color: var(--text-3);
}

.empty-icon {
  color: var(--text-4);
}

.palette-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-3);
  background: color-mix(in srgb, var(--surface-2) 70%, transparent);
}

.footer-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.footer-item kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--border);
}

.palette-enter-active {
  transition: opacity var(--motion) var(--motion-ease);
}

.palette-enter-active .palette-container {
  transition:
    transform var(--motion) var(--motion-ease),
    opacity var(--motion) var(--motion-ease);
}

.palette-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.palette-leave-active .palette-container {
  transition:
    transform var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
}

.palette-enter-from {
  opacity: 0;
}

.palette-enter-from .palette-container {
  transform: scale(0.95) translateY(-12px);
  opacity: 0;
}

.palette-leave-to {
  opacity: 0;
}

.palette-leave-to .palette-container {
  transform: scale(0.98);
  opacity: 0;
}
</style>
