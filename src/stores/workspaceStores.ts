import { defineStore } from 'pinia'
import type { CompanyRole } from '@prisma/client'
import dashboardService from '@/service/dashboard/dashboard-service'
import companiesServices from '@/service/companies/companies-services'

export interface CompanySummary {
  id: string
  name: string
  cnpj: string
  myRole: CompanyRole
  createdAt: string
}

export interface CompanyMetrics {
  total: number
  completed: number
  inProgress: number
  inTesting: number
  todo: number
  overdue: number
  progress: number
  myAssignments: number
}

export interface ActivityItem {
  id: string
  title: string
  status: string
  priority: number
  dueDate: string | null
  isMine: boolean
  responsibles: Array<{
    id: string
    name: string
    isMe: boolean
  }>
  quarter: string
  month: string
  companyId: string
  companyName: string
  myRole: CompanyRole
}

export interface WorkspaceCompany {
  company: CompanySummary
  metrics: CompanyMetrics
  upcomingEvents: Array<{
    id: string
    title: string
    startDate: string
    type: string
  }>
}

export interface WorkspaceData {
  summary: {
    totalCompanies: number
    totalPending: number
    totalInProgress: number
    totalCompleted: number
    totalOverdue: number
    totalMyAssignments: number
  }
  companies: WorkspaceCompany[]
  activities: ActivityItem[]
}

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    // Dados do workspace
    workspaceData: null as WorkspaceData | null,
    companies: [] as CompanySummary[],
    activeCompanyId: localStorage.getItem('activeCompany') as string | null,
    activeRole: null as CompanyRole | null,
    
    // Estados
    loading: false,
    error: null as string | null,
    
    // Filtros
    filterCompanyId: null as string | null,
    filterMyActivities: false,
    filterOverdue: false,
  }),

  getters: {
    activeCompany: (state) => {
      if (!state.activeCompanyId) return null
      return state.companies.find(c => c.id === state.activeCompanyId) || null
    },
    
    canEdit: (state) => {
      const editableRoles: CompanyRole[] = ['OWNER', 'ADMIN', 'WORKER']
      return state.activeRole ? editableRoles.includes(state.activeRole) : false
    },
    
    canManageUsers: (state) => {
      const manageRoles: CompanyRole[] = ['OWNER', 'ADMIN']
      return state.activeRole ? manageRoles.includes(state.activeRole) : false
    },
    
    isOwner: (state) => state.activeRole === 'OWNER',
    
    filteredActivities: (state) => {
      if (!state.workspaceData) return []
      
      let activities = state.workspaceData.activities
      
      if (state.filterCompanyId) {
        activities = activities.filter(a => a.companyId === state.filterCompanyId)
      }
      
      if (state.filterMyActivities) {
        activities = activities.filter(a => a.isMine)
      }
      
      if (state.filterOverdue) {
        const now = new Date().toISOString()
        activities = activities.filter(a => 
          a.dueDate && a.dueDate < now && a.status !== 'DONE'
        )
      }
      
      return activities
    },
    
    myAssignmentsCount: (state) => {
      return state.workspaceData?.summary.totalMyAssignments || 0
    },
    
    overdueCount: (state) => {
      return state.workspaceData?.summary.totalOverdue || 0
    },
  },

  actions: {
    async fetchWorkspace() {
      this.loading = true
      this.error = null
      
      try {
        const response = await dashboardService.getWorkspace()
        this.workspaceData = response
        
        // Extrair lista simplificada de empresas
        this.companies = response.companies.map((c: WorkspaceCompany) => c.company)
        
        // Se não tem empresa ativa, selecionar a primeira
        if (!this.activeCompanyId && this.companies.length > 0) {
          this.setActiveCompany(this.companies[0].id)
        }
        
        return response
      } catch (e: any) {
        this.error = e.message || 'Erro ao carregar workspace'
        throw e
      } finally {
        this.loading = false
      }
    },
    
    async fetchCompanies() {
      try {
        const response = await companiesServices.getCompany()
        const companiesList = Array.isArray(response) ? response : response?.data || []
        
        this.companies = companiesList.map((item: any) => ({
          id: item.company.id,
          name: item.company.name,
          cnpj: item.company.cnpj,
          myRole: item.role,
          createdAt: item.company.createdAt,
        }))
        
        return this.companies
      } catch (e) {
        console.error('Erro ao buscar empresas:', e)
        throw e
      }
    },
    
    setActiveCompany(companyId: string) {
      this.activeCompanyId = companyId
      localStorage.setItem('activeCompany', companyId)
      
      // Atualizar role ativa
      const company = this.companies.find(c => c.id === companyId)
      if (company) {
        this.activeRole = company.myRole
      }
    },
    
    switchCompany(companyId: string) {
      this.setActiveCompany(companyId)
      // Recarregar a página ou redirecionar
      window.location.href = '/'
    },
    
    setFilterCompanyId(companyId: string | null) {
      this.filterCompanyId = companyId
    },
    
    setFilterMyActivities(value: boolean) {
      this.filterMyActivities = value
    },
    
    setFilterOverdue(value: boolean) {
      this.filterOverdue = value
    },
    
    clearFilters() {
      this.filterCompanyId = null
      this.filterMyActivities = false
      this.filterOverdue = false
    },
    
    // Helpers de permissão
    hasPermission(requiredRole: CompanyRole): boolean {
      const hierarchy: Record<CompanyRole, number> = {
        'OWNER': 3,
        'ADMIN': 2,
        'WORKER': 1,
        'CLIENT': 0,
        'VIEWER': 0,
      }
      
      if (!this.activeRole) return false
      return hierarchy[this.activeRole] >= hierarchy[requiredRole]
    },
  },
})
