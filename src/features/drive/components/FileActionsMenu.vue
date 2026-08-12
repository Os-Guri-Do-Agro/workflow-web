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
      <DropdownMenuContent class="dd-menu fam" :side-offset="6" align="end">
        <DropdownMenuItem class="dd-item" @select="emit('details')">
          <Info :size="15" />
          <span>Detalhes</span>
        </DropdownMenuItem>
        <DropdownMenuItem class="dd-item" @select="emit('download')">
          <Download :size="15" />
          <span>Baixar</span>
        </DropdownMenuItem>

        <template v-if="canManage">
          <DropdownMenuItem class="dd-item" @select="emit('share')">
            <Share2 :size="15" />
            <span>Compartilhar por link</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="dd-sep" />
          <DropdownMenuItem class="dd-item" @select="emit('rename')">
            <Pencil :size="15" />
            <span>Renomear</span>
          </DropdownMenuItem>
          <DropdownMenuItem class="dd-item" @select="emit('move')">
            <FolderInput :size="15" />
            <span>Mover para pasta</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator class="dd-sep" />
          <DropdownMenuItem
            class="dd-item dd-item--danger"
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

<!--
  Bloco GLOBAL, não scoped: o portal teleporta o conteúdo pro <body> e o
  data-v-* do scoped não viaja com ele. O skin do menu vem de
  styles/menus.css (.dd-menu/.dd-item); aqui só a largura própria.
-->
<style>
.fam {
  min-width: 208px;
}
</style>
