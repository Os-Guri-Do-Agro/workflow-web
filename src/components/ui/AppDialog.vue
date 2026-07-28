<script setup lang="ts">
/**
 * AppDialog — a casca de overlay do design system (Teleport + tokens). É o
 * substituto do `v-dialog` legado: scrim tokenizado (`--scrim`), Esc fecha,
 * foco entra no painel ao abrir e volta pra onde estava ao fechar, tamanhos
 * padronizados (sm 400 / md 520 / lg 640 / xl 900).
 *
 * O conteúdo é 100% slot: cada dialog monta seu header/corpo/footer (padrão dos
 * overlays já migrados: ícone à esquerda, X à direita, footer com ghost +
 * primary). Para confirmação simples use o `ConfirmDialog`, que já embrulha
 * esta casca com o layout pronto.
 */
import { nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    /** Rótulo acessível (aria-label) do dialog. */
    label: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /** Trava TODO fechamento (Esc/scrim) enquanto uma ação roda. */
    loading?: boolean
    /** Não fecha no clique do scrim (forms com muito estado digitado). */
    persistent?: boolean
  }>(),
  {
    size: 'md',
    loading: false,
    persistent: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const panel = ref<HTMLElement | null>(null)
let lastFocus: HTMLElement | null = null

function close() {
  if (props.loading) return
  emit('update:modelValue', false)
}

function onScrim() {
  if (props.persistent) return
  close()
}

// Foco: ao abrir, entra no primeiro campo focável do painel (ou no painel, que
// tem tabindex=-1 — é o que faz o Esc funcionar sem clique prévio); ao fechar,
// devolve pra quem abriu.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      lastFocus = document.activeElement as HTMLElement | null
      void nextTick(() => {
        const target = panel.value?.querySelector<HTMLElement>(
          '[autofocus], input:not([type=hidden]):not([disabled]), textarea, select, button:not([disabled])',
        )
        ;(target ?? panel.value)?.focus()
      })
    } else {
      lastFocus?.focus?.()
      lastFocus = null
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="dlg">
      <div
        v-if="modelValue"
        class="dlg-overlay"
        @mousedown.self="onScrim"
        @keydown.esc.stop="close"
      >
        <section
          ref="panel"
          class="dlg"
          :class="`dlg--${size}`"
          role="dialog"
          aria-modal="true"
          :aria-label="label"
          tabindex="-1"
        >
          <slot />
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dlg-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--scrim);
  backdrop-filter: blur(10px);
}

.dlg {
  width: min(var(--dlg-w), 100%);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
  outline: none;
}

.dlg--sm {
  --dlg-w: 400px;
}
.dlg--md {
  --dlg-w: 520px;
}
.dlg--lg {
  --dlg-w: 640px;
}
.dlg--xl {
  --dlg-w: 900px;
}

/* Entrada com um assentar sutil (sem mola exagerada: overlay não é brinquedo). */
.dlg-enter-active {
  transition: opacity var(--motion) var(--motion-ease);
}
.dlg-enter-active .dlg {
  transition:
    transform var(--motion) var(--motion-ease),
    opacity var(--motion) var(--motion-ease);
}
.dlg-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}
.dlg-enter-from,
.dlg-leave-to {
  opacity: 0;
}
.dlg-enter-from .dlg {
  transform: translateY(8px) scale(0.985);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .dlg-enter-active,
  .dlg-leave-active,
  .dlg-enter-active .dlg {
    transition-duration: 1ms;
  }
}
</style>
