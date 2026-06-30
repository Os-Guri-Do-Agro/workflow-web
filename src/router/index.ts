import { createRouter, createWebHistory } from 'vue-router'
import { jwtDecode } from 'jwt-decode'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { clearSession } from '@/service/api'
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
import PublicBoardView from '@/features/public/PublicBoardView.vue'
import PublicRoadmapView from '@/features/public/PublicRoadmapView.vue'
import { usePostHog } from '@/composables/usePostHog'
import { CANVAS_ENABLED } from '@/config/feature-flags'

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
    { path: '/public/board/:token', name: 'public-board', component: PublicBoardView },
    { path: '/public/roadmap/:token', name: 'public-roadmap', component: PublicRoadmapView },
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
    { path: '/bug-reports', name: 'bug-reports-list', component: BugReportsListView, meta: { requiredRole: 'WORKER' } },
    { path: '/bug-reports/:id', name: 'bug-report-detail', component: BugReportDetailView, meta: { requiredRole: 'WORKER' } },
    { path: '/repos', name: 'repos-list', component: ReposListView },
    { path: '/repos/:id', name: 'repo-browser', component: RepoBrowserView },
    // Rota inexistente (ex.: /tickets removido) → volta pro início.
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

const { capturePageview } = usePostHog()

const PUBLIC_ROUTES = new Set([
  'login',
  'signup',
  'download',
  'bug-report',
  'report-status',
  'public-board',
  'public-roadmap',
])


const ROLE_RANK: Record<string, number> = {
  VIEWER: 0,
  CLIENT: 1,
  WORKER: 2,
  ADMIN: 3,
  OWNER: 4,
}

/**
 * Rotas dos boards de desenho (Canvas). Escondidas via feature flag
 * `CANVAS_ENABLED` (ver `src/config/feature-flags.ts`). Quando a flag está off,
 * o guard redireciona essas rotas para a home — sem deletar nada. Repare que
 * `/board` (Kanban) NÃO está aqui: é outra feature e fica sempre acessível.
 */
const CANVAS_ROUTE_NAMES = new Set(['boards', 'board-canvas', 'public-board'])

/** JWT expirado (ou malformado) conta como "sem token". */
function isTokenExpired(token: string): boolean {
  try {
    const { exp } = jwtDecode<{ exp?: number }>(token)
    return !exp || exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

/** Papel do usuário na empresa ativa, lido do JWT. */
function activeCompanyRole(token: string): string | null {
  try {
    const decoded = jwtDecode<{ companies?: { companyId: string; role: string }[] }>(token)
    const companyId = localStorage.getItem('activeCompany')
    return decoded.companies?.find((c) => c.companyId === companyId)?.role ?? null
  } catch {
    return null
  }
}

router.beforeEach((to, from) => {
  if (to.path !== from.path) NProgress.start()

  // Canvas escondido (feature flag off): qualquer rota de board de desenho
  // volta pra home. Reativar = VITE_CANVAS_ENABLED=true.
  if (!CANVAS_ENABLED && CANVAS_ROUTE_NAMES.has(to.name as string)) {
    return { name: 'home' }
  }

  let token = localStorage.getItem('token')
  // Token presente mas expirado: limpa proativamente (o guard antigo só via
  // "existe ou não", deixando token vencido passar e nunca deslogar).
  if (token && isTokenExpired(token)) {
    clearSession()
    token = null
  }

  if (!token && !PUBLIC_ROUTES.has(to.name as string)) {
    return { name: 'login' }
  }

  // Aplica meta.requiredRole (antes não era lido por guard nenhum) — esconde
  // bug-reports/empresa de quem não tem papel suficiente na empresa ativa.
  const required = to.meta.requiredRole as string | undefined
  if (required && token) {
    const role = activeCompanyRole(token)
    if (!role || (ROLE_RANK[role] ?? -1) < (ROLE_RANK[required] ?? 99)) {
      return { name: 'home' }
    }
  }
})

router.afterEach(() => {
  NProgress.done()
  capturePageview()
})

export default router
