import { createRouter, createWebHistory } from 'vue-router'
import { jwtDecode } from 'jwt-decode'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { clearSession } from '@/service/api'
import { usePostHog } from '@/composables/usePostHog'
import { CANVAS_ENABLED } from '@/config/feature-flags'

NProgress.configure({ showSpinner: false, speed: 300 })

// ─── Restauração de scroll ──────────────────────────────────────────────────
// O conteúdo NÃO rola no body: cada shell tem seu próprio container com
// overflow-y (`.main` no Command/Canvas, `.main-scroll` no Focus). Por isso o
// `savedPosition` do vue-router sozinho não restaura nada — ele mexe na janela,
// que está sempre em zero. Guardamos a posição do container por rota e a
// devolvemos na volta.
const SCROLL_MEMORY_MS = 30 * 60 * 1000
const scrollMemory = new Map<string, { top: number; at: number }>()

function scrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-scroll-container], .main-scroll, main.main')
}

/**
 * O container é do shell e sobrevive à troca de rota: a view nova entra com o
 * scroll da anterior. Como o conteúdo chega por fetch, tentamos restaurar por
 * alguns frames até a página ter altura suficiente.
 */
function restoreScroll(top: number) {
  const deadline = Date.now() + 800
  const tick = () => {
    const el = scrollContainer()
    if (!el) return
    el.scrollTop = top
    // Alvo ainda inalcançável (conteúdo menor do que era): espera renderizar.
    if (el.scrollTop < top && Date.now() < deadline) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, _from, savedPosition) {
    const remembered = scrollMemory.get(to.fullPath)
    const isFresh = !!remembered && Date.now() - remembered.at < SCROLL_MEMORY_MS
    const top = savedPosition?.top ?? (isFresh ? remembered!.top : 0)
    restoreScroll(top)
    // Devolvido pro vue-router só por completude: a janela em si não rola.
    return { top: savedPosition?.top ?? 0, left: 0 }
  },
  routes: [
    { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue') },
    { path: '/signup', name: 'signup', component: () => import('@/features/auth/SignupView.vue') },
    { path: '/download', name: 'download', component: () => import('@/features/download/DownloadView.vue') },
    {
      path: '/report/:companyId',
      alias: '/reports/:companyId',
      name: 'bug-report',
      component: () => import('@/features/bug-report/ReportBugView.vue'),
    },
    { path: '/r/:id', name: 'report-status', component: () => import('@/features/bug-report/ReportStatusView.vue') },
    { path: '/public/board/:token', name: 'public-board', component: () => import('@/features/public/PublicBoardView.vue') },
    { path: '/public/roadmap/:token', name: 'public-roadmap', component: () => import('@/features/public/PublicRoadmapView.vue') },
    { path: '/public/note/:token', name: 'public-note', component: () => import('@/features/public/PublicNoteView.vue') },
    { path: '/', name: 'home', component: () => import('@/features/dashboard/DashboardView.vue') },
    { path: '/board', name: 'board', component: () => import('@/features/board/BoardView.vue') },
    { path: '/boards', name: 'boards', component: () => import('@/features/boards/BoardsListView.vue') },
    { path: '/boards/:id', name: 'board-canvas', component: () => import('@/features/boards/BoardCanvasView.vue') },
    { path: '/dashboard', name: 'dashboard', component: () => import('@/features/dashboard/DashboardView.vue') },
    { path: '/notes', name: 'notes', component: () => import('@/features/notes/NotesView.vue') },
    { path: '/notes/:id', name: 'note-editor', component: () => import('@/features/notes/NoteEditorView.vue') },
    { path: '/calendar', name: 'calendar', component: () => import('@/features/calendar/CalendarView.vue') },
    { path: '/time', name: 'time', component: () => import('@/features/time/TimeTrackingView.vue') },
    // Acesso por membership (login basta). Escopo por empresa é via x-company-id.
    { path: '/qr', name: 'qr', component: () => import('@/features/qr/QrCodesView.vue') },
    // Ferramenta em desenvolvimento: a página apresenta o produto (spec: docs/specs/ocr-digital.md).
    { path: '/ocr', name: 'ocr', component: () => import('@/features/ocr/OcrDigitalView.vue') },
    { path: '/roadmap', name: 'roadmap', component: () => import('@/features/roadmap/RoadmapView.vue') },
    { path: '/tasks/:month', name: 'tasks', component: () => import('@/features/tasks/TasksView.vue') },
    { path: '/tasks/:month/:taskId', name: 'task-details', component: () => import('@/features/tasks/TaskDetailsView.vue') },
    { path: '/relatorio/:quarterId', name: 'report', component: () => import('@/features/reports/ReportView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/features/settings/SettingsView.vue') },
    { path: '/variables', name: 'variables', component: () => import('@/features/companies/CompanyVariablesView.vue') },
    { path: '/company-users', name: 'company-users', component: () => import('@/features/companies/CompanyUsersView.vue'), meta: { requiredRole: 'ADMIN' } },
    { path: '/bug-reports', name: 'bug-reports-list', component: () => import('@/features/bug-report/BugReportsListView.vue'), meta: { requiredRole: 'WORKER' } },
    { path: '/bug-reports/:id', name: 'bug-report-detail', component: () => import('@/features/bug-report/BugReportDetailView.vue'), meta: { requiredRole: 'WORKER' } },
    { path: '/repos', name: 'repos-list', component: () => import('@/features/repos/ReposListView.vue') },
    { path: '/repos/:id', name: 'repo-browser', component: () => import('@/features/repos/RepoBrowserView.vue') },
    // Links antigos de notificações: `/activity/:id` resolve empresa+mês+task
    // via backend e redireciona; `/bugs/:id` era o path antigo de bug reports.
    { path: '/activity/:id', name: 'activity-resolver', component: () => import('@/features/tasks/ActivityResolverView.vue') },
    { path: '/bugs/:id', redirect: (to) => `/bug-reports/${to.params.id}` },
    // Rota inexistente (ex.: /tickets removido) → 404 amigável.
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/features/errors/NotFoundView.vue') },
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
  'public-note',
])


const ROLE_RANK: Record<string, number> = {
  WORKER: 0,
  ADMIN: 1,
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

/**
 * Papel do usuário na empresa ativa, lido do JWT. Se ainda não há empresa
 * ativa persistida (ex.: deep link logo após o login, antes de qualquer view
 * popular o workspace), usa a primeira empresa do JWT como fallback e já
 * persiste — sem isso o deep link pós-login caía na home por "sem papel".
 */
function activeCompanyRole(token: string): string | null {
  try {
    const decoded = jwtDecode<{ companies?: { companyId: string; role: string }[] }>(token)
    const companies = decoded.companies ?? []
    let companyId = localStorage.getItem('activeCompany')
    if (!companyId && companies.length > 0) {
      companyId = companies[0]!.companyId
      localStorage.setItem('activeCompany', companyId)
    }
    return companies.find((c) => c.companyId === companyId)?.role ?? null
  } catch {
    return null
  }
}

router.beforeEach((to, from) => {
  if (to.path !== from.path) NProgress.start()

  // Guarda onde a rota que está saindo parou, para a volta cair no mesmo ponto.
  if (from.fullPath && to.fullPath !== from.fullPath) {
    const el = scrollContainer()
    if (el) scrollMemory.set(from.fullPath, { top: el.scrollTop, at: Date.now() })
  }

  // Canvas escondido (feature flag off): qualquer rota de board de desenho
  // volta pra home. Reativar = VITE_CANVAS_ENABLED=true.
  if (!CANVAS_ENABLED && CANVAS_ROUTE_NAMES.has(to.name as string)) {
    // `reason` vira toast no AppShell — redirect silencioso confundia o usuário.
    return { name: 'home', query: { reason: 'canvas-off' } }
  }

  let token = localStorage.getItem('token')
  // Token presente mas expirado: limpa proativamente (o guard antigo só via
  // "existe ou não", deixando token vencido passar e nunca deslogar).
  if (token && isTokenExpired(token)) {
    clearSession()
    token = null
  }

  if (!token && !PUBLIC_ROUTES.has(to.name as string)) {
    // Preserva o destino: quem abre um link compartilhado deslogado cai no
    // login e, depois de autenticar, segue para onde queria ir (não pra home).
    if (to.fullPath && to.fullPath !== '/') {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    return { name: 'login' }
  }

  // Aplica meta.requiredRole (antes não era lido por guard nenhum) — esconde
  // bug-reports/empresa de quem não tem papel suficiente na empresa ativa.
  const required = to.meta.requiredRole as string | undefined
  if (required && token) {
    const role = activeCompanyRole(token)
    if (!role || (ROLE_RANK[role] ?? -1) < (ROLE_RANK[required] ?? 99)) {
      // `reason` vira toast no AppShell — redirect silencioso confundia o usuário.
      return { name: 'home', query: { reason: 'no-access' } }
    }
  }
})

router.afterEach(() => {
  NProgress.done()
  capturePageview()
})

export default router
