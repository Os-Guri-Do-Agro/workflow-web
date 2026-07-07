<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import XpIcon from './XpIcon.vue'
import { useUiPreferences } from '@/composables/useUiPreferences'

/*
 * Ícones de área de trabalho do easter egg Windows XP.
 *
 * Ficam numa faixa de wallpaper à esquerda da janela de conteúdo (o .main no XP
 * ganha margem esquerda de 72px — ver xp.css) e ATRÁS da janela. Alguns são
 * decorativos (Meu Computador, Lixeira, Meus Documentos), outros são atalhos de
 * app que navegam com DUPLO clique, como no XP. Rótulo branco com sombra preta.
 */

const router = useRouter()
const { shell } = useUiPreferences()

interface DeskIcon {
  id: string
  label: string
  icon: string // nome do XpIcon
  to: string // TODOS navegam (duplo clique)
}

// Atalhos de área de trabalho — todos abrem uma tela real (duplo clique, como no
// XP). Nomes clássicos com destinos úteis.
const icons: DeskIcon[] = [
  { id: 'computer', label: 'Meu Computador', icon: 'my-computer', to: '/dashboard' },
  { id: 'docs', label: 'Meus Documentos', icon: 'documents', to: '/notes' },
  { id: 'board', label: 'Board', icon: 'board', to: '/board' },
  { id: 'calendar', label: 'Calendário', icon: 'calendar', to: '/calendar' },
  { id: 'qr', label: 'QR Codes', icon: 'qr', to: '/qr' },
  { id: 'time', label: 'Meu tempo', icon: 'clock', to: '/time' },
]

const selected = ref<string | null>(null)

function select(id: string): void {
  selected.value = id
}

function activate(item: DeskIcon): void {
  void router.push(item.to)
}

// A sidebar some no XP, então a faixa de wallpaper com os ícones fica na borda
// ESQUERDA da tela (~96px), logo abaixo do topbar (56px), em qualquer shell.
const laneStyle = computed(() => {
  const top = shell.value === 'focus' ? '58px' : '64px'
  return { left: '12px', top }
})
</script>

<template>
  <div class="xp-desktop" :style="laneStyle" role="presentation">
    <button
      v-for="item in icons"
      :key="item.id"
      class="xp-desk-icon"
      :class="{ 'xp-desk-icon--selected': selected === item.id }"
      type="button"
      :title="item.to ? `Abrir ${item.label}` : item.label"
      @click="select(item.id)"
      @dblclick="activate(item)"
    >
      <span class="xp-desk-glyph">
        <XpIcon :name="item.icon" :size="34" />
      </span>
      <span class="xp-desk-label">{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Coluna fixa na faixa de wallpaper à esquerda da janela; abaixo da janela no
   empilhamento (z-index baixo), acima do wallpaper (que fica em z-index -1). */
.xp-desktop {
  position: fixed;
  z-index: 2;
  width: 80px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: Tahoma, 'Segoe UI', Verdana, sans-serif;
}

.xp-desk-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  width: 100%;
  padding: 3px 2px;
  background: transparent;
  border: 1px dotted transparent;
  border-radius: 2px;
  cursor: pointer;
  font-family: inherit;
}

/* Selecionado: retângulo pontilhado + realce azul translúcido, como no XP. */
.xp-desk-icon--selected {
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(49, 106, 197, 0.45);
}

.xp-desk-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  color: #ffffff;
  filter: drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.55));
}

.xp-desk-label {
  font-size: 11px;
  line-height: 1.15;
  color: #ffffff;
  text-align: center;
  text-shadow:
    1px 1px 1px rgba(0, 0, 0, 0.85),
    0 0 2px rgba(0, 0, 0, 0.7);
  word-break: break-word;
}
</style>
