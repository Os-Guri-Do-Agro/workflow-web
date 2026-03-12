import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/features/dashboard/DashboardView.vue'
import TasksView from '@/features/tasks/TasksView.vue'
import TaskDetailsView from '@/features/tasks/TaskDetailsView.vue'
import ReportView from '@/features/reports/ReportView.vue'
import SettingsView from '@/features/settings/SettingsView.vue'
import LoginView from '@/features/auth/LoginView.vue'
import CompanyVariablesView from '@/features/companies/CompanyVariablesView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/tasks/:month',
      name: 'tasks',
      component: TasksView,
    },
    {
      path: '/tasks/:month/:taskId',
      name: 'task-details',
      component: TaskDetailsView,
    },
    {
      path: '/relatorio/:quarter',
      name: 'report',
      component: ReportView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/variables',
      name: 'variables',
      component: CompanyVariablesView,
    },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (!token && to.name !== 'login') return { name: 'login' }
})

export default router
