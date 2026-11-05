<script setup lang="ts">
/**
 * Folha "Mais" da moldura de celular (spec v2-mobile-e-home, M1): o menu
 * inteiro (as quatro seções do NavList, com a mesma regra de papel e de itens
 * ocultos) mais o que no desktop mora na topbar e não coube no topo do celular:
 * tema, configurações e criar empresa.
 *
 * É um dialog modal de verdade: foco entra no botão de fechar, Esc fecha, o
 * scrim fecha e o foco volta para quem abriu (o botão "Mais" da tab bar).
 */
import { computed, nextTick, ref, watch } from 'vue'
import { FolderPlus, Settings, Sparkles, X } from 'lucide-vue-next'
import { useAssistant } from '@/composables/useAssistant'
import NavList from './NavList.vue'
import ThemeToggle from './ThemeToggle.vue'
import { useCompanyCreation } from '@/composables/useCompanyCreation'
import { useWorkspaceStore } from '@/stores/workspaceStores'

const open = defineModel<boolean>('open', { required: true })

const workspace = useWorkspaceStore()
const { openCreateCompany } = useCompanyCreation()
const canCreateCompany = computed(() => workspace.isAdmin)

const closeRef = ref<HTMLButtonElement | null>(null)
let opener: HTMLElement | null = null

watch(open, async (isOpen) => {
  if (isOpen) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    closeRef.value?.focus()
  } else if (opener) {
    opener.focus()
    opener = null
  }
})

function close() {
  open.value = false
}

/** Tab não sai da folha enquanto ela está aberta (dialog modal). */
const sheetRef = ref<HTMLElement | null>(null)
function trapTab(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !sheetRef.value) return
  const focusables = [
    ...sheetRef.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'),
  ].filter((el) => el.offsetParent !== null)
  if (!focusables.length) return
  const first = focusables[0]!
  const last = focusables[focusables.length - 1]!
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

function createCompany() {
  close()
  openCreateCompany()
}

const assistant = useAssistant()
function openAssistant() {
  close()
  assistant.open()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="more-scrim" @click.self="close" @keydown.esc.stop="close" @keydown="trapTab">
        <section ref="sheetRef" class="more-sheet" role="dialog" aria-modal="true" aria-labelledby="more-sheet-title">
          <div class="more-grip" aria-hidden="true" />
          <header class="more-head">
            <h2 id="more-sheet-title" class="more-title">Menu</h2>
            <ThemeToggle />
            <button ref="closeRef" type="button" class="more-close" aria-label="Fechar menu" @click="close">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="more-body">
            <NavList />
          </div>
          <footer class="more-foot">
            <button type="button" class="more-action" @click="openAssistant">
              <Sparkles :size="18" aria-hidden="true" />
              <span>Assistente</span>
            </button>
            <RouterLink to="/settings" class="more-action">
              <Settings :size="18" aria-hidden="true" />
              <span>Configurações</span>
            </RouterLink>
            <button v-if="canCreateCompany" type="button" class="more-action" @click="createCompany">
              <FolderPlus :size="18" aria-hidden="true" />
              <span>Começar outro projeto</span>
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.more-scrim {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: var(--scrim);
  display: flex;
  align-items: flex-end;
}

.more-sheet {
  width: 100%;
  max-height: min(86dvh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  border-top: 1px solid var(--border);
  box-shadow: var(--shadow-overlay);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.more-grip {
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: var(--border-strong);
  margin: 8px auto 2px;
}

.more-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 8px 18px;
}

.more-title {
  flex: 1;
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
}

.more-close {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}

.more-close:hover,
.more-close:active {
  background: var(--surface-2);
  color: var(--text);
}

.more-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.more-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px 4px 10px;
  border-top: 1px solid var(--border);
}

/* Alvo de toque de 44px nos itens do menu, que no desktop são de 36px. */
.more-body :deep(.nav-item) {
  min-height: 44px;
}

.more-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--border);
}

.more-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.more-action:active {
  background: var(--surface-3);
}

.more-action:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: background-color var(--motion) var(--motion-ease);
}

.sheet-enter-active .more-sheet,
.sheet-leave-active .more-sheet {
  transition: transform var(--motion) cubic-bezier(0.22, 1, 0.36, 1);
}

.sheet-enter-from,
.sheet-leave-to {
  background-color: transparent;
}

.sheet-enter-from .more-sheet,
.sheet-leave-to .more-sheet {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active,
  .sheet-leave-active,
  .sheet-enter-active .more-sheet,
  .sheet-leave-active .more-sheet {
    transition: none;
  }
}
</style>
