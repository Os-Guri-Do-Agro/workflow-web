<script setup lang="ts">
/**
 * Barra superior do editor: voltar, estado do salvamento, contadores, fixar,
 * modo imersivo e o slot de ações (menu de propriedades).
 *
 * O título não vive aqui - ele é o primeiro elemento do papel, como em Bear e
 * Craft. Esta barra existe só para o que é meta.
 */
import { ArrowLeft, Eye, Maximize2, Minimize2, Pin, Users } from 'lucide-vue-next'
import SaveStatus from '@/components/ui/SaveStatus.vue'
import type { SaveState } from '@/components/ui/save-state'

defineProps<{
  saveState: SaveState
  savedAt: number | null
  saveMessage: string
  isPinned: boolean
  pinning: boolean
  immersive: boolean
  isNew: boolean
  wordCount: number
  charCount: number
  /** Dono da nota vê o botão Compartilhar. */
  canShare: boolean
  /** Convidado só-leitura vê o selo em vez do status de save. */
  readOnly: boolean
}>()

const emit = defineEmits<{
  back: []
  retry: []
  togglePin: []
  toggleImmersive: []
  share: []
}>()
</script>

<template>
  <header class="note-header">
    <button type="button" class="note-header__icon" aria-label="Voltar para as notas" @click="emit('back')">
      <ArrowLeft :size="18" />
    </button>

    <span v-if="readOnly" class="note-header__readonly">
      <Eye :size="13" />
      Você tem acesso apenas para ver
    </span>
    <SaveStatus
      v-else
      :state="saveState"
      :saved-at="savedAt"
      :message="saveMessage"
      @retry="emit('retry')"
    />

    <div class="note-header__right">
      <button
        v-if="canShare"
        type="button"
        class="note-header__share"
        aria-label="Compartilhar nota"
        title="Compartilhar"
        @click="emit('share')"
      >
        <Users :size="15" />
        Compartilhar
      </button>

      <span class="note-header__count">
        {{ wordCount }} {{ wordCount === 1 ? 'palavra' : 'palavras' }}
        <span class="note-header__count-sep">·</span>
        {{ charCount }}
      </span>

      <button
        v-if="!isNew"
        type="button"
        class="note-header__icon"
        :class="{ 'note-header__icon--on': isPinned }"
        :disabled="pinning"
        :aria-pressed="isPinned"
        :aria-label="isPinned ? 'Desafixar nota' : 'Fixar nota'"
        :title="isPinned ? 'Desafixar nota' : 'Fixar nota'"
        @click="emit('togglePin')"
      >
        <Pin :size="17" />
      </button>

      <button
        type="button"
        class="note-header__icon"
        :aria-pressed="immersive"
        :aria-label="immersive ? 'Sair do modo imersivo' : 'Modo imersivo'"
        :title="immersive ? 'Sair do modo imersivo (Esc)' : 'Modo imersivo'"
        @click="emit('toggleImmersive')"
      >
        <component :is="immersive ? Minimize2 : Maximize2" :size="17" />
      </button>

      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.note-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
}

/*
 * No imersivo a barra inteira (header + toolbar) desbota em vez de sumir.
 * Escondê-la por completo tirava o alvo do hover; fantasma visível é melhor que
 * fantasma inalcançável. A regra fica no container em NoteEditorView.
 */

.note-header__right {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.note-header__readonly {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 600;
}

.note-header__share {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  margin-right: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.note-header__share:hover {
  background: var(--surface-3);
}

.note-header__share:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.note-header__count {
  margin-right: 6px;
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.note-header__count-sep {
  margin: 0 3px;
}

.note-header__icon {
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
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.note-header__icon:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.note-header__icon:active:not(:disabled) {
  transform: scale(0.94);
}

.note-header__icon:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.note-header__icon--on {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
}

.note-header__icon:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .note-header__count {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .note-header,
  .note-header__icon {
    transition-duration: 1ms;
  }
  .note-header__icon:active:not(:disabled) {
    transform: none;
  }
}
</style>
