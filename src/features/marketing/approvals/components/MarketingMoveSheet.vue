<script setup lang="ts">
/**
 * Folha "Mover para" do board da Aprovação no celular: abre ao segurar um card
 * e soltar sem mexer (o mesmo gesto e o mesmo desenho da `TaskMoveSheet` do
 * board de tarefas). Os status da trilha viram botões de 48px, o atual fica
 * marcado, e o motivo previsível de recusa aparece embaixo da opção (Aprovar e
 * Pedir ajuste são botões da página do card). Quem grava é o board, pelo mesmo
 * `/move` do arraste; a frase do servidor vale no fim.
 *
 * Dialog modal: Teleport para o body, foco dentro, Tab preso, Esc e o fundo
 * fecham e o foco volta para o card.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import type { MarketingRole } from '@/service/marketing/marketing-core'
import { CARD_STATUS_TONE, cardStatusLabel, statusesFor, toneStyle, type CardStatus } from '../../marketing-labels'
import { moveHint } from '../approvals-meta'

export interface MoveSheetCard {
  id: string
  title: string
  kind: string
  status: CardStatus
}

const props = defineProps<{
  card: MoveSheetCard | null
  role: MarketingRole | null
  returnFocus?: HTMLElement | null
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ select: [status: CardStatus] }>()

const sheetRef = ref<HTMLElement | null>(null)

const targets = computed(() => {
  const c = props.card
  if (!c) return []
  return statusesFor(c.kind).map((s) => ({
    value: s,
    label: cardStatusLabel(s, c.kind),
    tone: CARD_STATUS_TONE[s],
    current: s === c.status,
    blocked: moveHint(c.kind, c.status, s, props.role),
  }))
})

watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    sheetRef.value?.focus({ preventScroll: true })
  } else {
    props.returnFocus?.focus({ preventScroll: true })
  }
})

function close() {
  open.value = false
}

function pick(status: CardStatus) {
  close()
  emit('select', status)
}

function trapTab(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !sheetRef.value) return
  const focusables = [...sheetRef.value.querySelectorAll<HTMLElement>('button:not([disabled])')]
  if (!focusables.length) return
  const first = focusables[0]!
  const last = focusables[focusables.length - 1]!
  if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.value)) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="mk-sheet">
      <div v-if="open && card" class="mks-scrim" @click.self="close" @keydown.esc.stop.prevent="close" @keydown="trapTab">
        <section
          ref="sheetRef"
          class="mks"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mk-move-title"
          aria-describedby="mk-move-card"
          tabindex="-1"
        >
          <div class="mks__grip" aria-hidden="true" />
          <header class="mks__head">
            <div class="mks__head-text">
              <h2 id="mk-move-title" class="mks__title">Mover para</h2>
              <p id="mk-move-card" class="mks__card">{{ card.title }}</p>
            </div>
            <button type="button" class="mks__close" aria-label="Fechar" @click="close">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>
          <ul class="mks__list">
            <li v-for="t in targets" :key="t.value">
              <button
                type="button"
                class="mks__opt"
                :class="{ 'mks__opt--current': t.current, 'mks__opt--blocked': !!t.blocked }"
                :data-move-to="t.value"
                :disabled="t.current"
                :aria-current="t.current ? 'true' : undefined"
                :aria-describedby="t.blocked ? `mk-move-why-${t.value}` : undefined"
                @click="pick(t.value)"
              >
                <span class="mk-dot" :style="toneStyle(t.tone)" aria-hidden="true" />
                <span class="mks__opt-label">{{ t.label }}</span>
                <span v-if="t.current" class="mks__opt-note">Status atual</span>
              </button>
              <p v-if="t.blocked && !t.current" :id="`mk-move-why-${t.value}`" class="mks__why">{{ t.blocked }}</p>
            </li>
          </ul>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mks-scrim {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: flex-end;
  background: var(--scrim);
}

.mks {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  max-height: min(86dvh, 640px);
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  box-shadow: var(--shadow-overlay);
  padding: 0 8px calc(10px + env(safe-area-inset-bottom, 0px));
  outline: none;
}

.mks__grip {
  width: 36px;
  height: 4px;
  margin: 8px auto 2px;
  border-radius: 999px;
  background: var(--border-strong);
}

.mks__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0 8px 10px;
}

.mks__head-text {
  flex: 1;
  min-width: 0;
  padding-top: 6px;
}

.mks__title {
  margin: 0;
  font-size: 17px;
  line-height: 22px;
  font-weight: 700;
}

.mks__card {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mks__close {
  flex: none;
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

.mks__list {
  margin: 0;
  padding: 4px 0 0;
  list-style: none;
  border-top: 1px solid var(--border);
}

.mks__opt {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.mks__opt:active:not(:disabled) {
  background: var(--surface-2);
}

.mks__opt:focus-visible,
.mks__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mks__opt-label {
  flex: 1;
  min-width: 0;
}

.mks__opt--current,
.mks__opt--current:disabled {
  background: var(--accent-soft);
  color: var(--accent-ink);
  cursor: default;
}

.mks__opt-note {
  font-size: 12px;
  font-weight: 600;
}

.mks__opt--blocked {
  color: var(--text-2);
}

.mks__why {
  margin: -6px 0 4px;
  padding: 0 12px 0 32px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}

.mk-sheet-enter-active,
.mk-sheet-leave-active {
  transition: background-color var(--motion) var(--motion-ease);
}

.mk-sheet-enter-active .mks,
.mk-sheet-leave-active .mks {
  transition: transform var(--motion) cubic-bezier(0.22, 1, 0.36, 1);
}

.mk-sheet-enter-from,
.mk-sheet-leave-to {
  background-color: transparent;
}

.mk-sheet-enter-from .mks,
.mk-sheet-leave-to .mks {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .mk-sheet-enter-active,
  .mk-sheet-leave-active,
  .mk-sheet-enter-active .mks,
  .mk-sheet-leave-active .mks {
    transition: none;
  }
}
</style>
