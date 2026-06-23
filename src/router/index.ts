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
import SignupView from '@/features/auth/SignupView.vue'
import DownloadView from '@/features/download/DownloadView.vue'
import ReportBugView from '@/features/bug-report/ReportBugView.vue'
import ReportStatusView from '@/features/bug-report/ReportStatusView.vue'
import BugReportsListView from '@/features/bug-report/BugReportsListView.vue'
import BugReportDetailView from '@/features/bug-report/BugReportDetailView.vue'
import ReposListView from '@/features/repos/ReposListView.vue'
import RepoBrowserView from '@/features/repos/RepoBrowserView.vue'
import CompanyVariablesView from '@/features/companies/CompanyVariablesView.vue'
import CompanyUsersView from '@/features/companies/CompanyUsersView.vue'
import NotesView from '@/features/notes/NotesView.vue'
import NoteEditorView from '@/features/notes/NoteEditorView.vue'
import CalendarView from '@/features/calendar/CalendarView.vue'
import RoadmapView from '@/features/roadmap/RoadmapView.vue'
import BoardsListView from '@/features/boards/BoardsListView.vue'
import BoardCanvasView from '@/features/boards/BoardCanvasView.vue'
import { usePostHog } from '@/composables/usePostHog'

NProgress.configure({ showSpinner: false, speed: 300 })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/signup', name: 'signup', component: SignupView },
    { path: '/download', name: 'download', component: DownloadView },
    {
      path: '/report/:companyId',
      alias: '/reports/:companyId',
      name: 'bug-report',
      component: ReportBugView,
    },
    { path: '/r/:id', name: 'report-status', component: ReportStatusView },
    { path: '/', name: 'home', component: DashboardView },
    { path: '/board', name: 'board', component: BoardView },
    { path: '/boards', name: 'boards', component: BoardsListView },
    { path: '/boards/:id', name: 'board-canvas', component: BoardCanvasView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView },
    { path: '/notes', name: 'notes', component: NotesView },
    { path: '/notes/:id', name: 'note-editor', component: NoteEditorView },
    { path: '/calendar', name: 'calendar', component: CalendarView },
    { path: '/roadmap', name: 'roadmap', component: RoadmapView },
    { path: '/tasks/:month', name: 'tasks', component: TasksView },
    { path: '/tasks/:month/:taskId', name: 'task-details', component: TaskDetailsView },
    { path: '/relatorio/:quarterId', name: 'report', component: ReportView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/variables', name: 'variables', component: CompanyVariablesView },
    { path: '/company-users', name: 'company-users', component: CompanyUsersView, meta: { requiredRole: 'ADMIN' } },
    { path: '/bug-reports', name: 'bug-reports-list', component: BugReportsListView },
    { path: '/bug-reports/:id', name: 'bug-report-detail', component: BugReportDetailView },
    { path: '/repos', name: 'repos-list', component: ReposListView },
    { path: '/repos/:id', name: 'repo-browser', component: RepoBrowserView },
  ],
})

const { capturePageview } = usePostHog()

router.beforeEach((to, from) => {
  if (to.path !== from.path) NProgress.start()
  const token = localStorage.getItem('token')
  if (
    !token &&
    to.name !== 'login' &&
    to.name !== 'signup' &&
    to.name !== 'download' &&
    to.name !== 'bug-report' &&
    to.name !== 'report-status'
  ) {
    return { name: 'login' }
  }
})

router.afterEach(() => {
  NProgress.done()
  capturePageview()
})

export default router
