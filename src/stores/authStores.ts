import { defineStore } from 'pinia'

export const useActiveCompanyId = defineStore('activeCompanyId', {
  state: () => ({
    companyId: null as string | null,
  }),

  actions: {
    setCompanyId(id: string) {
      this.companyId = id
    },
  },
})
