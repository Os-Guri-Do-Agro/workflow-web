<script setup lang="ts">
/**
 * Menu de propriedades da nota (emoji, cor, capa) e ações destrutivas.
 *
 * Substitui os três popovers soltos do editor antigo, que não fechavam com Esc,
 * não fechavam ao clicar fora e não devolviam o foco. Aqui é um popover só,
 * com navegação interna, `role="menu"` e foco gerenciado.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  ChevronLeft, ImagePlus, Loader2, MoreHorizontal, Palette, Smile, Sparkles, Trash2, X,
} from 'lucide-vue-next'
import { NOTE_COLORS, NOTE_EMOJIS } from '../note-palette'

const props = defineProps<{
  emoji: string
  noteColor: string
  coverImage: string
  canDelete: boolean
  improving: boolean
}>()

const emit = defineEmits<{
  'update:emoji': [string]
  'update:noteColor': [string]
  'update:coverImage': [string]
  improve: []
  remove: []
}>()

const EMOJIS = NOTE_EMOJIS
const COLORS = NOTE_COLORS

const open = ref(false)
const view = ref<'root' | 'emoji' | 'color' | 'cover'>('root')
const coverDraft = ref('')
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const coverInput = ref<HTMLInputElement | null>(null)

const hasMeta = computed(() => !!props.emoji || !!props.noteColor || !!props.coverImage)

function toggle() {
  if (open.value) close()
  else show()
}

function show() {
  open.value = true
  view.value = 'root'
}

function close(focusTrigger = true) {
  open.value = false
  view.value = 'root'
  if (focusTrigger) trigger.value?.focus()
}

function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close(false)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    close()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})

async function openCover() {
  coverDraft.value = props.coverImage
  view.value = 'cover'
  await nextTick()
  coverInput.value?.focus()
}

function applyCover() {
  emit('update:coverImage', coverDraft.value.trim())
  close()
}
</script>

<template>
  <div ref="root" class="meta">
    <button
      ref="trigger"
      type="button"
      class="meta__trigger"
      :class="{ 'meta__trigger--on': hasMeta }"
      aria-label="Propriedades da nota"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <MoreHorizontal :size="17" />
    </button>

    <div v-if="open" class="meta__panel" role="menu">
      <template v-if="view === 'root'">
        <button type="button" class="meta__row" role="menuitem" @click="view = 'emoji'">
          <span class="meta__row-icon"><Smile :size="15" /></span>
          <span>Emoji</span>
          <span class="meta__row-value">{{ emoji || 'Nenhum' }}</span>
        </button>

        <button type="button" class="meta__row" role="menuitem" @click="view = 'color'">
          <span class="meta__row-icon"><Palette :size="15" /></span>
          <span>Cor</span>
          <span v-if="noteColor" class="meta__dot" :style="{ backgroundColor: noteColor }" />
          <span v-else class="meta__row-value">Nenhuma</span>
        </button>

        <button type="button" class="meta__row" role="menuitem" @click="openCover">
          <span class="meta__row-icon"><ImagePlus :size="15" /></span>
          <span>Capa</span>
          <span class="meta__row-value">{{ coverImage ? 'Definida' : 'Nenhuma' }}</span>
        </button>

        <span class="meta__sep" />

        <button
          type="button" class="meta__row" role="menuitem" :disabled="improving"
          @click="emit('improve'); close(false)"
        >
          <span class="meta__row-icon">
            <component :is="improving ? Loader2 : Sparkles" :size="15" :class="{ spin: improving }" />
          </span>
          <span>Melhorar com IA</span>
        </button>

        <button
          v-if="canDelete"
          type="button" class="meta__row meta__row--danger" role="menuitem"
          @click="emit('remove'); close(false)"
        >
          <span class="meta__row-icon"><Trash2 :size="15" /></span>
          <span>Excluir nota</span>
        </button>
      </template>

      <template v-else-if="view === 'emoji'">
        <div class="meta__head">
          <button type="button" class="meta__back" aria-label="Voltar" @click="view = 'root'">
            <ChevronLeft :size="15" />
          </button>
          <span>Emoji</span>
        </div>
        <div class="meta__grid">
          <button
            v-for="option in EMOJIS"
            :key="option"
            type="button"
            class="meta__emoji"
            :class="{ 'meta__emoji--on': emoji === option }"
            :aria-label="`Usar emoji ${option}`"
            @click="emit('update:emoji', option); close()"
          >
            {{ option }}
          </button>
        </div>
        <button type="button" class="meta__clear" @click="emit('update:emoji', ''); close()">
          <X :size="13" /> Remover emoji
        </button>
      </template>

      <template v-else-if="view === 'color'">
        <div class="meta__head">
          <button type="button" class="meta__back" aria-label="Voltar" @click="view = 'root'">
            <ChevronLeft :size="15" />
          </button>
          <span>Cor da nota</span>
        </div>
        <div class="meta__colors">
          <button
            v-for="option in COLORS"
            :key="option"
            type="button"
            class="meta__color"
            :class="{ 'meta__color--on': noteColor === option }"
            :style="{ backgroundColor: option }"
            :aria-label="`Usar cor ${option}`"
            @click="emit('update:noteColor', option); close()"
          />
        </div>
        <button type="button" class="meta__clear" @click="emit('update:noteColor', ''); close()">
          <X :size="13" /> Limpar cor
        </button>
      </template>

      <template v-else>
        <div class="meta__head">
          <button type="button" class="meta__back" aria-label="Voltar" @click="view = 'root'">
            <ChevronLeft :size="15" />
          </button>
          <span>Imagem de capa</span>
        </div>
        <input
          ref="coverInput"
          v-model="coverDraft"
          type="url"
          class="meta__input"
          placeholder="https://..."
          aria-label="URL da imagem de capa"
          @keydown.enter.prevent="applyCover"
        />
        <div class="meta__actions">
          <button type="button" class="meta__btn meta__btn--primary" @click="applyCover">
            Aplicar
          </button>
          <button
            v-if="coverImage"
            type="button" class="meta__btn"
            @click="emit('update:coverImage', ''); close()"
          >
            Remover
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.meta {
  position: relative;
}

.meta__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.meta__trigger:hover {
  background: var(--surface-2);
  color: var(--text);
}

.meta__trigger--on {
  border-color: var(--border);
}

.meta__trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.meta__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  width: 268px;
  padding: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
}

.meta__row {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.meta__row:hover:not(:disabled) {
  background: var(--surface-3);
}

.meta__row:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.meta__row--danger {
  color: var(--err);
}

.meta__row-icon {
  display: inline-flex;
  color: var(--text-3);
}

.meta__row--danger .meta__row-icon {
  color: var(--err);
}

.meta__row-value {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
}

.meta__dot {
  width: 14px;
  height: 14px;
  margin-left: auto;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
}

.meta__sep {
  display: block;
  height: 1px;
  margin: 5px 4px;
  background: var(--border);
}

.meta__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 8px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}

.meta__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  cursor: pointer;
}

.meta__back:hover {
  background: var(--surface-3);
}

.meta__grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
}

.meta__emoji {
  aspect-ratio: 1;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.meta__emoji:hover {
  background: var(--surface-3);
}

.meta__emoji--on {
  border-color: var(--accent);
}

.meta__colors {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 5px;
}

.meta__color {
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}

.meta__color--on {
  border-color: var(--text);
}

.meta__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  margin-top: 6px;
  padding: 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.meta__clear:hover {
  background: var(--surface-3);
  color: var(--text);
}

.meta__input {
  width: 100%;
  padding: 7px 9px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
}

.meta__input:focus {
  outline: none;
  border-color: var(--accent);
}

.meta__actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.meta__btn {
  flex: 1;
  padding: 6px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.meta__btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.meta__btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
  font-weight: 600;
}

.meta__btn--primary:hover {
  background: var(--accent);
  filter: brightness(1.08);
  color: var(--accent-fg);
}

.spin {
  animation: meta-spin 1s linear infinite;
}

@keyframes meta-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 2.4s;
  }
}
</style>
