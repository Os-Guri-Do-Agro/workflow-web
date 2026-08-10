<script setup lang="ts">
/**
 * Visualizador de anexo em tela cheia.
 *
 * `Teleport to="body"` não é preferência: o conteúdo de rota renderiza dentro
 * do `main` do shell, que cria contexto de empilhamento próprio, então nenhum
 * `z-index` de dentro passa por cima do chrome. Teleportar é o que faz o viewer
 * funcionar igual nas três variantes de shell sem a feature conhecê-las (mesma
 * decisão do modo imersivo das notas).
 *
 * Imagem e PDF renderizam; o resto cai no cartão de download. PDF que o
 * navegador recusa embutir também cai, pelo fallback NATIVO do `<object>`: o
 * conteúdo filho aparece quando o tipo não pode ser renderizado. A alternativa
 * (medir a altura do elemento depois de um prazo) dá falso positivo e esconde
 * PDF que estava funcionando.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  X,
} from 'lucide-vue-next'
import {
  formatBytes,
  iconOf,
  isImage,
  kindOf,
  labelOf,
} from '@/features/tasks/attachment-kind'
import type { ActivityAttachment } from '@/features/tasks/activity-types'

const props = defineProps<{
  items: ActivityAttachment[]
  /** Índice inicial. Trocar reabre no arquivo escolhido. */
  startIndex: number
}>()

const emit = defineEmits<{ close: [] }>()

const index = ref(props.startIndex)
const dialogRef = ref<HTMLElement | null>(null)
/** Quem tinha o foco antes de abrir, para devolver ao fechar. */
const opener = ref<HTMLElement | null>(null)

const current = computed<ActivityAttachment | undefined>(() => props.items[index.value])
const kind = computed(() => (current.value ? kindOf(current.value) : 'other'))
const counter = computed(() => `${index.value + 1} de ${props.items.length}`)

watch(
  () => props.startIndex,
  (value) => {
    index.value = value
  },
)

function step(delta: number): void {
  if (props.items.length < 2) return
  // Circula: chegar no fim e apertar seta volta ao começo, sem beco sem saída.
  index.value = (index.value + delta + props.items.length) % props.items.length
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    emit('close')
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
    return
  }
  if (event.key !== 'Tab') return

  // Armadilha de foco: sem isso o Tab passeia pela página atrás do overlay.
  const focusables = dialogRef.value?.querySelectorAll<HTMLElement>(
    'button, [href], input, [tabindex]:not([tabindex="-1"])',
  )
  if (!focusables?.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  opener.value = document.activeElement as HTMLElement | null
  document.addEventListener('keydown', onKeydown)
  // Trava o scroll do fundo: rolar a página atrás de um overlay de tela cheia
  // é o tipo de coisa que faz o usuário achar que fechou sem ter fechado.
  document.body.style.overflow = 'hidden'
  void Promise.resolve().then(() => dialogRef.value?.focus())
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
  opener.value?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div class="viewer-root" role="presentation">
      <div class="viewer__scrim" @click="emit('close')" />

      <div
        ref="dialogRef"
        class="viewer"
        role="dialog"
        aria-modal="true"
        :aria-label="current ? `Visualizando ${current.filename}` : 'Visualizador'"
        tabindex="-1"
      >
        <header class="viewer__bar">
          <div class="viewer__id">
            <component :is="current ? iconOf(current) : undefined" :size="16" />
            <span class="viewer__name">{{ current?.filename }}</span>
            <span class="viewer__meta">
              {{ current ? labelOf(current) : '' }}
              <template v-if="current && formatBytes(current.size)">
                · {{ formatBytes(current.size) }}
              </template>
              <template v-if="current?.uploadedBy">
                · {{ current.uploadedBy.name }}
              </template>
            </span>
          </div>

          <div class="viewer__actions">
            <span v-if="items.length > 1" class="viewer__counter">{{ counter }}</span>
            <a
              v-if="current"
              class="viewer__btn"
              :href="current.url"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir em nova aba"
              title="Abrir em nova aba"
            >
              <ExternalLink :size="15" />
            </a>
            <a
              v-if="current"
              class="viewer__btn"
              :href="current.url"
              :download="current.filename"
              aria-label="Baixar arquivo"
              title="Baixar"
            >
              <Download :size="15" />
            </a>
            <button
              type="button"
              class="viewer__btn press"
              aria-label="Fechar visualizador"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </div>
        </header>

        <div class="viewer__stage">
          <button
            v-if="items.length > 1"
            type="button"
            class="viewer__nav viewer__nav--prev press"
            aria-label="Arquivo anterior"
            @click="step(-1)"
          >
            <ChevronLeft :size="20" />
          </button>

          <img
            v-if="current && isImage(current)"
            :src="current.url"
            :alt="current.filename"
            class="viewer__image"
          />

          <object
            v-else-if="current && kind === 'pdf'"
            class="viewer__pdf"
            :data="current.url"
            type="application/pdf"
          >
            <!-- Fallback nativo do <object>: aparece quando o navegador recusa
                 embutir o PDF, sem depender do nosso prazo de 3s. -->
            <div class="viewer__fallback">
              <component :is="iconOf(current)" :size="34" />
              <p class="viewer__fallback-name">{{ current.filename }}</p>
              <p class="viewer__fallback-hint">
                Este arquivo não abre aqui dentro. Baixe para visualizar.
              </p>
              <a class="viewer__download" :href="current.url" :download="current.filename">
                <Download :size="15" />
                Baixar
              </a>
            </div>
          </object>

          <div v-else-if="current" class="viewer__fallback">
            <component :is="iconOf(current)" :size="34" />
            <p class="viewer__fallback-name">{{ current.filename }}</p>
            <p class="viewer__fallback-hint">
              {{ labelOf(current) }}
              <template v-if="formatBytes(current.size)">
                · {{ formatBytes(current.size) }}
              </template>
            </p>
            <a class="viewer__download" :href="current.url" :download="current.filename">
              <Download :size="15" />
              Baixar
            </a>
          </div>

          <button
            v-if="items.length > 1"
            type="button"
            class="viewer__nav viewer__nav--next press"
            aria-label="Próximo arquivo"
            @click="step(1)"
          >
            <ChevronRight :size="20" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.viewer-root {
  position: fixed;
  inset: 0;
  /* Acima do painel de tarefa (2400), que é o overlay mais alto do app. */
  z-index: 2600;
}

.viewer__scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim, rgb(0 0 0 / 0.72));
  backdrop-filter: blur(4px);
}

.viewer {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  outline: none;
}

.viewer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--surface) 86%, transparent);
  border-bottom: 1px solid var(--border);
  backdrop-filter: blur(14px);
}

.viewer__id {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text);
}

.viewer__name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.viewer__meta {
  color: var(--text-3);
  font-size: 11.5px;
  white-space: nowrap;
}

.viewer__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.viewer__counter {
  color: var(--text-3);
  font-size: 11.5px;
  margin-right: 4px;
}

.viewer__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
}

.viewer__btn:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.viewer__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.viewer__stage {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 0;
}

.viewer__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius);
}

.viewer__pdf {
  width: min(1000px, 100%);
  height: 100%;
  border: none;
  border-radius: var(--radius);
  background: var(--surface);
}

.viewer__fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  color: var(--text-3);
  text-align: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.viewer__fallback-name {
  color: var(--text);
  font-size: 13.5px;
  font-weight: 600;
  margin: 0;
  word-break: break-all;
}

.viewer__fallback-hint {
  margin: 0;
  font-size: 12px;
}

.viewer__download {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.viewer__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text-2);
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.viewer__nav:hover {
  color: var(--text);
}

.viewer__nav:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.viewer__nav--prev {
  left: 12px;
}

.viewer__nav--next {
  right: 12px;
}
</style>
