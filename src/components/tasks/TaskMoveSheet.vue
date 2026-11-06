<script setup lang="ts">
/**
 * Folha "Mover para" do celular (spec v2-celular-roadmap-notas, D1 e D2): abre
 * quando a pessoa segura um card e solta sem mexer. As colunas viram botões de
 * 48px, a atual aparece marcada e não move.
 *
 * Não existe caminho novo de gravação: a folha só emite `select` com o status,
 * e quem usa chama exatamente o que o "Mover para" do menu "…" do card chama
 * (`onMenuMove` no board do mês e no agrupado, `updateTaskStatus` no `/board`).
 * A regra de Revisados (`reviewBlockReason`) vale ali, com a mesma mensagem. A
 * folha só ADIANTA o motivo embaixo da opção, calculado pela mesma função, para
 * ninguém descobrir a recusa depois de tocar.
 *
 * Dialog modal de verdade: Teleport para o body, foco entra na folha, Tab não
 * sai dela, Esc e o fundo fecham, e o foco volta para o card.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { ACTIVITY_STATUSES } from '@/features/tasks/task-meta'
import { reviewBlockReason } from '@/features/tasks/test-platforms'
import type { ActivityStatus, TestCheckView } from '@/features/tasks/activity-types'

export interface MoveSheetTask {
  id: string
  title?: string
  testChecks?: TestCheckView[] | null
}

const props = defineProps<{
  task: MoveSheetTask | null
  /** Coluna onde o card está agora. */
  status: ActivityStatus | null
  /** `PJ-K7Q2XM` (ausente no card de rotina). */
  taskKey?: string | null
  /** Quem recebe o foco quando a folha fecha (o card segurado). */
  returnFocus?: HTMLElement | null
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  select: [status: ActivityStatus]
}>()

const sheetRef = ref<HTMLElement | null>(null)

const targets = computed(() =>
  ACTIVITY_STATUSES.map((s) => ({
    ...s,
    current: s.value === props.status,
    // A mesma função que o board chama ao receber o `move`: aqui só adianta a frase.
    blocked: reviewBlockReason(props.task, props.status, s.value),
  })),
)

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

function pick(status: ActivityStatus) {
  close()
  emit('select', status)
}

/** Tab não sai da folha enquanto ela está aberta. */
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
    <Transition name="move-sheet">
      <div
        v-if="open && task"
        class="ms-scrim"
        @click.self="close"
        @keydown.esc.stop.prevent="close"
        @keydown="trapTab"
      >
        <section
          ref="sheetRef"
          class="ms"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-sheet-title"
          aria-describedby="move-sheet-task"
          tabindex="-1"
        >
          <div class="ms__grip" aria-hidden="true" />
          <header class="ms__head">
            <div class="ms__head-text">
              <h2 id="move-sheet-title" class="ms__title">Mover para</h2>
              <p id="move-sheet-task" class="ms__task">
                <span v-if="taskKey" class="ms__key">{{ taskKey }}</span>
                <span class="ms__task-title">{{ task.title || 'Sem título' }}</span>
              </p>
            </div>
            <button type="button" class="ms__close" aria-label="Fechar" @click="close">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>

          <ul class="ms__list">
            <li v-for="t in targets" :key="t.value">
              <button
                type="button"
                class="ms__opt"
                :class="{ 'ms__opt--current': t.current, 'ms__opt--blocked': !!t.blocked }"
                :data-move-to="t.value"
                :disabled="t.current"
                :aria-current="t.current ? 'true' : undefined"
                :aria-describedby="t.blocked ? `move-sheet-why-${t.value}` : undefined"
                @click="pick(t.value)"
              >
                <component :is="t.icon" :size="18" />
                <span class="ms__opt-label">{{ t.label }}</span>
                <span v-if="t.current" class="ms__opt-note">Coluna atual</span>
              </button>
              <p v-if="t.blocked" :id="`move-sheet-why-${t.value}`" class="ms__why">{{ t.blocked }}</p>
            </li>
          </ul>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ms-scrim {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: flex-end;
  background: var(--scrim);
}

.ms {
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

.ms__grip {
  width: 36px;
  height: 4px;
  margin: 8px auto 2px;
  border-radius: 999px;
  background: var(--border-strong);
}

.ms__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0 8px 10px;
}

.ms__head-text {
  flex: 1;
  min-width: 0;
  padding-top: 6px;
}

.ms__title {
  margin: 0;
  font-size: 17px;
  line-height: 22px;
  font-weight: 700;
  color: var(--text);
}

.ms__task {
  display: flex;
  gap: 8px;
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-2);
  min-width: 0;
}

.ms__key {
  flex: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}

.ms__task-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms__close {
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

.ms__close:active {
  background: var(--surface-2);
}

.ms__list {
  margin: 0;
  padding: 4px 0 0;
  list-style: none;
  border-top: 1px solid var(--border);
}

/* Alvo de 48px (D1): a folha é o caminho principal de mover no celular. */
.ms__opt {
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

.ms__opt > svg {
  flex: none;
}

.ms__opt:active:not(:disabled) {
  background: var(--surface-2);
}

.ms__opt:focus-visible,
.ms__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.ms__opt-label {
  flex: 1;
  min-width: 0;
}

/* A coluna de onde o card sai: marcada com o acento, sem ação. */
.ms__opt--current,
.ms__opt--current:disabled {
  background: var(--accent-soft);
  color: var(--accent-ink);
  cursor: default;
}

.ms__opt-note {
  font-size: 12px;
  font-weight: 600;
}

.ms__opt--blocked {
  color: var(--text-2);
}

.ms__why {
  margin: -6px 0 4px;
  padding: 0 12px 0 42px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}

.move-sheet-enter-active,
.move-sheet-leave-active {
  transition: background-color var(--motion) var(--motion-ease);
}

.move-sheet-enter-active .ms,
.move-sheet-leave-active .ms {
  transition: transform var(--motion) cubic-bezier(0.22, 1, 0.36, 1);
}

.move-sheet-enter-from,
.move-sheet-leave-to {
  background-color: transparent;
}

.move-sheet-enter-from .ms,
.move-sheet-leave-to .ms {
  transform: translateY(100%);
}

@media (prefers-reduced-motion: reduce) {
  .move-sheet-enter-active,
  .move-sheet-leave-active,
  .move-sheet-enter-active .ms,
  .move-sheet-leave-active .ms {
    transition: none;
  }
}
</style>
