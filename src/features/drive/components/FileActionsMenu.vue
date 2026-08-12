<script setup lang="ts">
/**
 * Menu de ações de um arquivo, em reka-ui (headless) conforme a regra do
 * design system: menus e popovers novos não usam `v-menu` do Vuetify.
 *
 * Existe porque cinco ícones de 26px empilhados num canto do card não são um
 * menu: são cinco alvos pequenos sem rótulo. Aqui cada ação tem nome, ícone e
 * alvo de 32px, e a destrutiva fica separada por divisor no fim.
 */
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import {
  Download,
  FolderInput,
  Info,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-vue-next'
import type { DriveFile } from '@/features/drive/types'

defineProps<{ file: DriveFile; canManage: boolean }>()

const emit = defineEmits<{
  details: []
  download: []
  share: []
  rename: []
  move: []
  remove: []
}>()
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child>
      <slot name="trigger" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="fam" :side-offset="6" align="end">
        <DropdownMenuItem class="fam-item" @select="emit('details')">
          <Info :size="15" />
          <span>Detalhes</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="fam-item" @select="emit('download')">
          <Download :size="15" />
          <span>Baixar</span>
        </DropdownMenuItem>

        <template v-if="canManage">
          <DropdownMenuItem class="fam-item" @select="emit('share')">
            <Share2 :size="15" />
            <span>Compartilhar por link</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="fam-sep" />
          <DropdownMenuItem class="fam-item" @select="emit('rename')">
            <Pencil :size="15" />
            <span>Renomear</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="fam-item" @select="emit('move')">
            <FolderInput :size="15" />
            <span>Mover para pasta</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="fam-sep" />
          <DropdownMenuItem
            class="fam-item fam-item--danger"
            @select="emit('remove')"
          >
            <Trash2 :size="15" />
            <span>Excluir</span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
.fam {
  min-width: 208px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  z-index: 3000;
}

.fam-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 12.5px;
  cursor: pointer;
  outline: none;
  user-select: none;
}

.fam-item[data-highlighted] {
  background: var(--surface-2);
  color: var(--text);
}

.fam-item--danger[data-highlighted] {
  background: color-mix(in srgb, var(--err) 12%, transparent);
  color: var(--err);
}

.fam-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}
</style>
