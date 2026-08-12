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
      <DropdownMenuContent class="dd-menu fom" :side-offset="4" align="end">
        <DropdownMenuItem class="dd-item" @select="emit('create')">
          <FolderPlus :size="15" />
          <span>Nova subpasta</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="dd-item" @select="emit('rename')">
          <Pencil :size="15" />
          <span>Renomear</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="dd-item" @select="emit('move')">
          <FolderInput :size="15" />
          <span>Mover</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator class="dd-sep" />
        <DropdownMenuItem
          class="dd-item dd-item--danger"
          @select="emit('remove')"
        >
          <Trash2 :size="15" />
          <span>Excluir pasta</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<!--
  Bloco GLOBAL, não scoped: o portal teleporta o conteúdo pro <body> e o
  data-v-* do scoped não viaja com ele. O skin do menu vem de
  styles/menus.css (.dd-menu/.dd-item); aqui só a largura própria.
-->
<style>
.fom {
  min-width: 186px;
}
</style>
