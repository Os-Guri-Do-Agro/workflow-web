import { defineStore } from 'pinia'
import { resetCompanyScopedState } from '@/service/realtime/session-reset'

export const useActiveCompanyId = defineStore('activeCompanyId', {
  state: () => ({
    companyId: null as string | null,
  }),

  actions: {
    setCompanyId(id: string) {
      const previous = this.companyId
      this.companyId = id

      // Troca de empresa é o funil único (switcher, command palette e store de
      // workspace passam por aqui): o cache do Vue Query é da empresa anterior e
      // precisa sair, senão inbox, board e métricas ficam mostrando a outra
      // empresa até o refetch chegar. Na primeira seleção não há o que descartar.
      if (previous && previous !== id) resetCompanyScopedState()
    },
  },
})
