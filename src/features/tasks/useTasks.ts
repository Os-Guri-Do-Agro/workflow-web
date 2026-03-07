import { ref } from 'vue'
import type { Activity, Company, StatusHistory } from '@/core/types'

const companies = ref<Company[]>([
  { id: '1', name: 'Empresa A' },
  { id: '2', name: 'Empresa B' },
  { id: '3', name: 'Empresa C' }
])

const statusHistory = ref<StatusHistory[]>([
  {
    id: '1',
    activityId: '1',
    activityTitle: 'Implementar Dashboard',
    companyId: '1',
    fromStatus: null,
    toStatus: 'todo',
    changedBy: 'Sistema',
    changedAt: '2024-01-20T10:00:00Z'
  },
  {
    id: '2',
    activityId: '2',
    activityTitle: 'Revisar Documentação',
    companyId: '2',
    fromStatus: 'todo',
    toStatus: 'in-progress',
    changedBy: 'Pedro Costa',
    changedAt: '2024-01-22T08:30:00Z'
  },
  {
    id: '3',
    activityId: '4',
    activityTitle: 'Deploy Produção',
    companyId: '3',
    fromStatus: 'testing',
    toStatus: 'done',
    changedBy: 'Roberto Alves',
    changedAt: '2024-01-30T15:20:00Z'
  }
])

const activities = ref<Activity[]>([
  {
    id: '1',
    title: 'Implementar Dashboard',
    description: 'Criar dashboard com métricas principais',
    assignees: ['João Silva', 'Maria Santos'],
    dueDate: '2024-02-15',
    attachments: ['design.pdf'],
    status: 'todo',
    companyId: '1',
    month: 'janeiro',
    tasks: [
      {
        id: '1-1',
        title: 'Criar layout',
        description: 'Definir estrutura visual',
        assignees: ['João Silva'],
        dueDate: '2024-02-10',
        attachments: [],
        completed: false
      },
      {
        id: '1-2',
        title: 'Integrar API',
        description: 'Conectar com backend',
        assignees: ['Maria Santos'],
        dueDate: '2024-02-12',
        attachments: [],
        completed: false
      }
    ],
    createdAt: '2024-01-20T10:00:00Z'
  },
  {
    id: '2',
    title: 'Revisar Documentação',
    description: 'Atualizar docs do projeto',
    assignees: ['Pedro Costa'],
    dueDate: '2024-02-08',
    attachments: [],
    status: 'in-progress',
    companyId: '2',
    month: 'janeiro',
    tasks: [],
    createdAt: '2024-01-21T14:30:00Z'
  },
  {
    id: '3',
    title: 'Testes de Integração',
    description: 'Validar fluxos principais',
    assignees: ['Ana Lima', 'Carlos Souza'],
    dueDate: '2024-02-20',
    attachments: ['test-plan.xlsx'],
    status: 'testing',
    companyId: '1',
    month: 'fevereiro',
    tasks: [
      {
        id: '3-1',
        title: 'Testar login',
        description: 'Validar autenticação',
        assignees: ['Ana Lima'],
        dueDate: '2024-02-18',
        attachments: [],
        completed: true
      }
    ],
    createdAt: '2024-01-22T09:15:00Z'
  },
  {
    id: '4',
    title: 'Deploy Produção',
    description: 'Publicar versão 2.0',
    assignees: ['Roberto Alves'],
    dueDate: '2024-01-30',
    attachments: ['release-notes.pdf'],
    status: 'done',
    companyId: '3',
    month: 'janeiro',
    tasks: [],
    createdAt: '2024-01-15T16:45:00Z'
  }
])

export function useTasks() {
  const addActivity = (activity: Omit<Activity, 'id' | 'createdAt'>) => {
    const newActivity: Activity = {
      ...activity,
      id: (Date.now() + Math.random()).toString(),
      createdAt: new Date().toISOString()
    }
    activities.value.push(newActivity)
  }

  const updateActivityStatus = (id: string, status: Activity['status']) => {
    const activity = activities.value.find(a => a.id === id)
    if (activity) {
      const oldStatus = activity.status
      activity.status = status
      
      statusHistory.value.push({
        id: Date.now().toString(),
        activityId: activity.id,
        activityTitle: activity.title,
        companyId: activity.companyId,
        fromStatus: oldStatus,
        toStatus: status,
        changedBy: activity.assignees[0] || 'Sistema',
        changedAt: new Date().toISOString()
      })
    }
  }

  const toggleSubTaskCompleted = (activityId: string, taskId: string) => {
    const activity = activities.value.find(a => a.id === activityId)
    if (activity) {
      const task = activity.tasks.find(t => t.id === taskId)
      if (task) task.completed = !task.completed
    }
  }

  return {
    activities,
    companies,
    statusHistory,
    addActivity,
    updateActivityStatus,
    toggleSubTaskCompleted
  }
}
