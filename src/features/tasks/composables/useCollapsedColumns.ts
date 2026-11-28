/**
 * Colunas recolhidas do board (spec board-tarefas-redesign, D5: "Concluído pode
 * ser recolhido"). É preferência de quem olha, não dado do mês: vale para o
 * board do mês e para o `/board`, em todas as empresas, e sobrevive ao F5.
 *
 * Vai pelo `safeStorage`: navegador com armazenamento bloqueado continua
 * recolhendo e expandindo, só não lembra depois de recarregar.
 */
import { ref } from 'vue'
import { safeStorage } from '@/utils/safe-storage'
import type { ActivityStatus } from '../activity-types'

/** `v1`: formato de UI, descartável. */
const STORAGE_KEY = 'workflow:board:collapsed-columns:v1'

/** Só "Concluído" recolhe por enquanto: é a coluna que cresce sem parar. */
export const COLLAPSIBLE_STATUSES: readonly ActivityStatus[] = ['DONE']

function read(): ActivityStatus[] {
  const raw = safeStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is ActivityStatus => COLLAPSIBLE_STATUSES.includes(s))
  } catch {
    // Registro corrompido vale como "nada recolhido"; a próxima escrita conserta.
    return []
  }
}

// Estado de módulo: os dois boards (e duas instâncias do mesmo) enxergam a
// mesma escolha sem precisar reler o storage.
const collapsed = ref<ActivityStatus[]>(read())

export function useCollapsedColumns() {
  const isCollapsed = (status: ActivityStatus) => collapsed.value.includes(status)

  const canCollapse = (status: ActivityStatus) => COLLAPSIBLE_STATUSES.includes(status)

  const toggle = (status: ActivityStatus) => {
    if (!canCollapse(status)) return
    collapsed.value = isCollapsed(status)
      ? collapsed.value.filter((s) => s !== status)
      : [...collapsed.value, status]
    if (collapsed.value.length) safeStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed.value))
    else safeStorage.removeItem(STORAGE_KEY)
  }

  return { isCollapsed, canCollapse, toggle }
}
