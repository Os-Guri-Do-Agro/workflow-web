import { createRouter, createWebHistory } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import BoardView from '@/features/board/BoardView.vue'
import DashboardView from '@/features/dashboard/DashboardView.vue'
import TasksView from '@/features/tasks/TasksView.vue'
import TaskDetailsView from '@/features/tasks/TaskDetailsView.vue'
import ReportView from '@/features/reports/ReportView.vue'
import SettingsView from '@/features/settings/SettingsView.vue'
import LoginView from '@/features/auth/LoginView.vue'
import DownloadView from '@/features/download/DownloadView.vue'
import ReportBugView from '@/features/bug-report/ReportBugView.vue'
import CompanyVariablesView from '@/features/companies/CompanyVariablesView.vue'
import CompanyUsersView from '@/features/companies/CompanyUsersView.vue'
import TicketsView from '@/features/tickets/TicketsView.vue'
import NotesView from '@/features/notes/NotesView.vue'
import NoteEditorView from '@/features/notes/NoteEditorView.vue'
import CalendarView from '@/features/calendar/CalendarView.vue'
import { usePostHog } from '@/composables/usePostHog'

NProgress.configure({ showSpinner: false, speed: 300 })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/download', name: 'download', component: DownloadView },
    {
      path: '/report/:companyId',
      alias: '/reports/:companyId',
      name: 'bug-report',
      component: ReportBugView,
    },
    { path: '/', name: 'home', component: DashboardView },
    { path: '/board', name: 'board', component: BoardView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/notes', name: 'notes', component: NotesView },
    { path: '/notes/:id', name: 'note-editor', component: NoteEditorView },
    { path: '/calendar', name: 'calendar', component: CalendarView },
    { path: '/tasks/:month', name: 'tasks', component: TasksView },
    { path: '/tasks/:month/:taskId', name: 'task-details', component: TaskDetailsView },
    { path: '/relatorio/:quarterId', name: 'report', component: ReportView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/variables', name: 'variables', component: CompanyVariablesView },
    { path: '/company-users', name: 'company-users', component: CompanyUsersView, meta: { requiredRole: 'ADMIN' } },
    { path: '/tickets', name: 'tickets', component: TicketsView },
  ],
})

const { posthog } = usePostHog()

router.beforeEach((to, from) => {
  if (to.path !== from.path) NProgress.start()
  const token = localStorage.getItem('token')
  if (
    !token &&
    to.name !== 'login' &&
    to.name !== 'download' &&
    to.name !== 'bug-report'
  ) {
    return { name: 'login' }
  }
})

router.afterEach(() => {
  NProgress.done()
  posthog.capture('$pageview')
})

export default router
