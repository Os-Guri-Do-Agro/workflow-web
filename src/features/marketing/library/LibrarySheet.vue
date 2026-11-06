<script setup lang="ts">
/**
 * Folha de baixo do Acervo no celular (pastas e detalhes do arquivo), no
 * desenho da folha "Mover para" do board: Teleport para o body, fundo escuro,
 * Esc e o fundo fecham, o foco entra, fica PRESO dentro da folha (Tab e
 * Shift+Tab dão a volta) e volta para quem abriu.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{ title: string; tall?: boolean }>()
const open = defineModel<boolean>('open', { required: true })

const sheet = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null

watch(open, async (isOpen) => {
  if (isOpen) {
    opener = document.activeElement as HTMLElement | null
    await nextTick()
    sheet.value?.focus({ preventScroll: true })
  } else {
    opener?.focus?.({ preventScroll: true })
    opener = null
  }
})

function close() {
  open.value = false
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, video[controls], [tabindex]:not([tabindex="-1"])'

/** Tab no último volta ao primeiro (e Shift+Tab no primeiro vai ao último). */
function trapTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !sheet.value) return
  const list = Array.from(sheet.value.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
  if (!list.length) {
    event.preventDefault()
    sheet.value.focus()
    return
  }
  const first = list[0]!
  const last = list[list.length - 1]!
  const active = document.activeElement as HTMLElement | null
  const inside = !!active && sheet.value.contains(active)
  if (event.shiftKey && (active === first || active === sheet.value || !inside)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !inside)) {
    event.preventDefault()
    first.focus()
  }
}

/** Foco que escapa (clique fora, script) volta para a folha enquanto ela está aberta. */
function onFocusIn(event: FocusEvent) {
  const target = event.target as Node | null
  if (!open.value || !sheet.value || !target) return
  if (sheet.value.contains(target)) return
  // Menus e diálogos abertos A PARTIR da folha (teleportados) são dela.
  if ((target as HTMLElement).closest?.('[role="menu"], [role="dialog"], [role="listbox"]')) return
  sheet.value.focus({ preventScroll: true })
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('focusin', onFocusIn)
  else document.removeEventListener('focusin', onFocusIn)
}, { immediate: true })
onBeforeUnmount(() => document.removeEventListener('focusin', onFocusIn))
</script>

<template>
  <Teleport to="body">
    <Transition name="lsh">
      <div v-if="open" class="lsh-scrim" @click.self="close" @keydown.esc.stop.prevent="close" @keydown.tab="trapTab">
        <section
          ref="sheet"
          class="lsh"
          :class="{ 'lsh--tall': props.tall }"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
        >
          <div class="lsh__grip" aria-hidden="true" />
          <header class="lsh__head">
            <h2 class="lsh__title">{{ title }}</h2>
            <button type="button" class="lsh__close" aria-label="Fechar" @click="close">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <div class="lsh__body">
            <slot />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.lsh-scrim {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: flex-end;
  background: var(--scrim);
}

.lsh {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: min(80dvh, 640px);
  margin: 0 auto;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  border-top: 1px solid var(--border);
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  outline: none;
  overflow: hidden;
}

.lsh--tall {
  max-height: 92dvh;
}

.lsh__grip {
  width: 36px;
  height: 4px;
  margin: 8px auto 2px;
  border-radius: 999px;
  background: var(--border-strong);
}

.lsh__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 6px 6px 16px;
}

.lsh__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.lsh__close {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}

.lsh__body {
  min-height: 0;
  padding: 0 8px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.lsh-enter-active,
.lsh-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.lsh-enter-active .lsh,
.lsh-leave-active .lsh {
  transition: transform var(--motion) var(--motion-ease);
}

.lsh-enter-from,
.lsh-leave-to {
  opacity: 0;
}

.lsh-enter-from .lsh,
.lsh-leave-to .lsh {
  transform: translateY(24px);
}

@media (prefers-reduced-motion: reduce) {
  .lsh-enter-active,
  .lsh-leave-active,
  .lsh-enter-active .lsh,
  .lsh-leave-active .lsh {
    transition-duration: 1ms;
  }
}
</style>
