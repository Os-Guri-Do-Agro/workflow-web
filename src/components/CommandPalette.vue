<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import companiesServices from '@/service/companies/companies-services'
import { useActiveCompanyId } from '@/stores/authStores'
import { getInfoAuth } from '@/utils/authContent'

const router = useRouter()
const route = useRoute()
const theme = useTheme()
const activeCompanyStore = useActiveCompanyId()

const isOpen = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const companies = ref<any[]>([])

// ── Data ──
const loadCompanies = async () => {
  try {
    const response = await companiesServices.getCompany()
    const data = Array.isArray(response) ? response : response?.data || []
    companies.value = data.map((item: any) => ({
      id: item.company?.id || item.id,
      name: item.company?.name || item.name,
    }))
  } catch { /* silent */ }
}

// ── Commands ──
interface Command {
  id: string
  label: string
  hint?: string
  icon: string
  section: string
  action: () => void
}

const staticCommands = computed<Command[]>(() => [
  // Navigation
  { id: 'nav-dash', label: 'Dashboard', hint: 'Ir para o dashboard', icon: 'mdi-view-dashboard-outline', section: 'Navegação', action: () => go('/') },
  { id: 'nav-tickets', label: 'Tickets', hint: 'Gerenciar tickets', icon: 'mdi-ticket-outline', section: 'Navegação', action: () => go('/tickets') },
  { id: 'nav-vars', label: 'Variáveis', hint: 'Variáveis da empresa', icon: 'mdi-key-outline', section: 'Navegação', action: () => go('/variables') },
  { id: 'nav-users', label: 'Usuários / Empresas', hint: 'Gestão de acesso', icon: 'mdi-account-group-outline', section: 'Navegação', action: () => go('/company-users') },
  { id: 'nav-settings', label: 'Configurações', hint: 'Aparência e preferências', icon: 'mdi-cog-outline', section: 'Navegação', action: () => go('/settings') },
  // Actions
  { id: 'act-theme', label: theme.global.name.value === 'dark' ? 'Modo Claro' : 'Modo Escuro', hint: 'Alternar tema', icon: theme.global.name.value === 'dark' ? 'mdi-white-balance-sunny' : 'mdi-moon-waning-crescent', section: 'Ações', action: toggleTheme },
  { id: 'act-logout', label: 'Sair', hint: 'Encerrar sessão', icon: 'mdi-logout', section: 'Ações', action: logout },
])

const companyCommands = computed<Command[]>(() =>
  companies.value.map((c) => ({
    id: `company-${c.id}`,
    label: c.name,
    hint: 'Trocar empresa',
    icon: 'mdi-domain',
    section: 'Empresas',
    action: () => switchCompany(c.id),
  })),
)

const allCommands = computed(() => [...staticCommands.value, ...companyCommands.value])

const filtered = computed(() => {
  if (!query.value.trim()) return allCommands.value
  const q = query.value.toLowerCase()
  return allCommands.value.filter(
    (c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q) || c.section.toLowerCase().includes(q),
  )
})

const sections = computed(() => {
  const map = new Map<string, Command[]>()
  for (const cmd of filtered.value) {
    if (!map.has(cmd.section)) map.set(cmd.section, [])
    map.get(cmd.section)!.push(cmd)
  }
  return map
})

const flatList = computed(() => filtered.value)

// ── Actions ──
function go(path: string) {
  close()
  router.push(path)
}

function toggleTheme() {
  theme.global.name.value = theme.global.name.value === 'light' ? 'dark' : 'light'
  localStorage.setItem('theme', theme.global.name.value)
  close()
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
  if (cmd) cmd.action()
}

// ── Keyboard navigation inside palette ──
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

// ── Global shortcut (Ctrl/Cmd + K) ──
function globalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    if (isOpen.value) close()
    else open()
  }
}

onMounted(() => window.addEventListener('keydown', globalKeydown))
onUnmounted(() => window.removeEventListener('keydown', globalKeydown))

// expose for AppBar button
defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="isOpen" class="palette-overlay" @mousedown.self="close">
        <div class="palette-container">
          <!-- Search input -->
          <div class="palette-input-row">
            <v-icon size="18" class="palette-search-icon">mdi-magnify</v-icon>
            <input
              ref="inputRef"
              v-model="query"
              class="palette-input"
              placeholder="Buscar comandos, páginas, empresas..."
              @keydown="onKeydown"
            />
            <kbd class="palette-kbd">esc</kbd>
          </div>

          <!-- Results -->
          <div class="palette-results">
            <div v-if="flatList.length === 0" class="palette-empty">
              <v-icon size="28" style="opacity: 0.3">mdi-magnify</v-icon>
              <span>Nenhum resultado para "{{ query }}"</span>
            </div>

            <template v-for="[section, commands] in sections" :key="section">
              <div class="palette-section-label">{{ section }}</div>
              <button
                v-for="(cmd, idx) in commands"
                :key="cmd.id"
                class="cmd-item"
                :class="{ selected: flatList.indexOf(cmd) === selectedIndex }"
                @mouseenter="selectedIndex = flatList.indexOf(cmd)"
                @click="cmd.action()"
              >
                <v-icon size="16" class="cmd-icon">{{ cmd.icon }}</v-icon>
                <span class="cmd-label">{{ cmd.label }}</span>
                <span v-if="cmd.hint" class="cmd-hint">{{ cmd.hint }}</span>
              </button>
            </template>
          </div>

          <!-- Footer -->
          <div class="palette-footer">
            <span><kbd>↑↓</kbd> navegar</span>
            <span><kbd>↵</kbd> selecionar</span>
            <span><kbd>esc</kbd> fechar</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ─── Overlay ─── */
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
}

/* ─── Container ─── */
.palette-container {
  width: 560px;
  max-height: 480px;
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.12);
  border-radius: 14px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ─── Search ─── */
.palette-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.08);
}

.palette-search-icon {
  color: rgba(var(--v-theme-secondary), 0.35);
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  color: rgb(var(--v-theme-secondary));
  caret-color: rgb(var(--v-theme-secondary));
}

.palette-input::placeholder {
  color: rgba(var(--v-theme-secondary), 0.3);
}

.palette-kbd {
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.35);
  background: rgba(var(--v-theme-secondary), 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  font-family: inherit;
}

/* ─── Results ─── */
.palette-results {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.palette-section-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.35);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 10px 4px;
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
  transition: background 0.08s ease;
  text-align: left;
}

.cmd-item.selected {
  background: rgba(var(--v-theme-secondary), 0.08);
}

.cmd-icon {
  color: rgba(var(--v-theme-secondary), 0.45);
  flex-shrink: 0;
}

.cmd-item.selected .cmd-icon {
  color: rgba(var(--v-theme-secondary), 0.7);
}

.cmd-label {
  font-size: 13.5px;
  font-weight: 500;
  color: rgb(var(--v-theme-secondary));
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cmd-hint {
  font-size: 12px;
  color: rgba(var(--v-theme-secondary), 0.3);
  flex-shrink: 0;
}

/* ─── Empty ─── */
.palette-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px;
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.35);
}

/* ─── Footer ─── */
.palette-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-top: 1px solid rgba(var(--v-theme-secondary), 0.08);
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.3);
}

.palette-footer kbd {
  font-size: 10px;
  font-weight: 600;
  background: rgba(var(--v-theme-secondary), 0.07);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  font-family: inherit;
  margin-right: 3px;
}

/* ─── Transitions ─── */
.palette-enter-active {
  transition: opacity 0.15s ease;
}
.palette-enter-active .palette-container {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.palette-leave-active {
  transition: opacity 0.1s ease;
}
.palette-leave-active .palette-container {
  transition: transform 0.1s ease, opacity 0.1s ease;
}
.palette-enter-from {
  opacity: 0;
}
.palette-enter-from .palette-container {
  transform: scale(0.96) translateY(-8px);
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
