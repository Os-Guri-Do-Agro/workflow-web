<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Monitor, FolderClosed, Trash2, LayoutDashboard, Columns3, StickyNote } from 'lucide-vue-next'
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

type Icon = typeof Monitor
interface DeskIcon {
  id: string
  label: string
  icon: Icon
  to?: string // sem `to` = decorativo
}

const icons: DeskIcon[] = [
  { id: 'computer', label: 'Meu Computador', icon: Monitor },
  { id: 'docs', label: 'Meus Documentos', icon: FolderClosed },
  { id: 'trash', label: 'Lixeira', icon: Trash2 },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
  { id: 'board', label: 'Board', icon: Columns3, to: '/board' },
  { id: 'notes', label: 'Notas', icon: StickyNote, to: '/notes' },
]

const selected = ref<string | null>(null)

function select(id: string): void {
  selected.value = id
}

function activate(item: DeskIcon): void {
  if (item.to) void router.push(item.to)
}

// Posição da faixa por shell: encaixa nos 72px de wallpaper à esquerda da janela.
// (larguras dos painéis são fixas nos shells, então constantes bastam.)
const laneStyle = computed(() => {
  if (shell.value === 'focus') return { left: '300px', top: '58px' }
  if (shell.value === 'canvas') return { left: '6px', top: '66px' }
  return { left: '252px', top: '66px' } // command (padrão)
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
        <component :is="item.icon" :size="26" :stroke-width="1.75" />
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
  z-index: 1;
  width: 64px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
