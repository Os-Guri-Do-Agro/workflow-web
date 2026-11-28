import { ref } from 'vue'
import type { LibraryFolder } from '@/service/marketing/marketing-library'

/**
 * O que está sendo arrastado DENTRO do Acervo. Durante o `dragover` o
 * navegador não deixa ler o conteúdo do arrasto (só os tipos), então a pasta
 * e os itens arrastados ficam aqui para a árvore dizer, antes de soltar, se
 * aquele destino aceita (pasta não cai dentro dela mesma, nem em outro lugar).
 */
export const draggingFolder = ref<LibraryFolder | null>(null)
export const draggingItems = ref<string[]>([])

export function clearDrag() {
  draggingFolder.value = null
  draggingItems.value = []
}
