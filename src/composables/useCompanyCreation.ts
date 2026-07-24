import { ref } from 'vue'

/**
 * Controle global (singleton) do modal de criar empresa. Existe para desacoplar
 * o gatilho da UI: a sidebar (shell compartilhado, que NÃO pode importar de
 * features) e o estado "sem empresa" só chamam `openCreateCompany()`. O modal em
 * si (`CompanyCreateOverlay`) é montado uma vez no AppShell, que pode importar
 * de features.
 */
const isOpen = ref(false)

export function useCompanyCreation() {
  return {
    isOpen,
    openCreateCompany: () => {
      isOpen.value = true
    },
    closeCreateCompany: () => {
      isOpen.value = false
    },
  }
}
