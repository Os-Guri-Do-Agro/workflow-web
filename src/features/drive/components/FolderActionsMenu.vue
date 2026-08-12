<script setup lang="ts">
/**
 * Menu de ações de uma pasta. Mesma razão do `FileActionsMenu`: quatro ícones
 * de 12px enfileirados numa linha de sidebar não são um menu, são quatro alvos
 * pequenos sem rótulo, competindo com o nome da pasta pelo pouco espaço que a
 * coluna tem.
 */
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { FolderInput, FolderPlus, Pencil, Trash2 } from 'lucide-vue-next'

defineProps<{ folderName: string }>()

const emit = defineEmits<{
  create: []
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
      <DropdownMenuContent class="fom" :side-offset="4" align="end">
        <DropdownMenuItem class="fom-item" @select="emit('create')">
          <FolderPlus :size="15" />
          <span>Nova subpasta</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="fom-item" @select="emit('rename')">
          <Pencil :size="15" />
          <span>Renomear</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="fom-item" @select="emit('move')">
          <FolderInput :size="15" />
          <span>Mover</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="fom-sep" />
        <DropdownMenuItem
          class="fom-item fom-item--danger"
          @select="emit('remove')"
        >
          <Trash2 :size="15" />
          <span>Excluir pasta</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
.fom {
  min-width: 186px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  z-index: 3000;
}

.fom-item {
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

.fom-item[data-highlighted] {
  background: var(--surface-2);
  color: var(--text);
}

.fom-item--danger[data-highlighted] {
  background: color-mix(in srgb, var(--err) 12%, transparent);
  color: var(--err);
}

.fom-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border);
}
</style>
