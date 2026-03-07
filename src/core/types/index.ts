export interface Company {
  id: string
  name: string
}

export type TaskStatus = 'todo' | 'in-progress' | 'testing' | 'done'

export interface SubTask {
  id: string
  title: string
  description: string
  assignees: string[]
  dueDate?: string
  attachments: string[]
  completed: boolean
}

export interface StatusHistory {
  id: string
  activityId: string
  activityTitle: string
  companyId: string
  fromStatus: TaskStatus | null
  toStatus: TaskStatus
  changedBy: string
  changedAt: string
}

export interface Activity {
  id: string
  title: string
  description: string
  assignees: string[]
  dueDate?: string
  attachments: string[]
  status: TaskStatus
  companyId: string
  tasks: SubTask[]
  createdAt: string
  month: string
}
