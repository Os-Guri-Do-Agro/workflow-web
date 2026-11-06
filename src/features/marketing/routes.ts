import type { RouteRecordRaw } from 'vue-router'

/**
 * Rotas da ala Marketing (filhas do MarketingLayout). Cada fase substitui a
 * view provisória do SEU arquivo; não renomeie caminho nem nome de rota (o
 * menu, o breadcrumb e os avisos do sino apontam para eles).
 *
 * Dono de cada linha: M1 = Painel, Aprovações, Card, Calendário, Links;
 * M2 = Ideias, Campanhas, UTMs e QR, Gráfica; M3 = Ativações, Parceiros,
 * Financeiro; Fundação = Configurações.
 */
export const marketingRoutes: RouteRecordRaw[] = [
  {
    path: '/marketing',
    component: () => import('./MarketingLayout.vue'),
    children: [
      { path: '', name: 'marketing', component: () => import('./views/MarketingHomeView.vue') },
      { path: 'aprovacoes', name: 'marketing-approvals', component: () => import('./views/MarketingApprovalsView.vue') },
      // Card aberto em página própria: é o link dos avisos e a tela de aprovar no celular.
      { path: 'cards/:cardId', name: 'marketing-card', component: () => import('./views/MarketingCardView.vue') },
      { path: 'calendario', name: 'marketing-calendar', component: () => import('./views/MarketingCalendarView.vue') },
      { path: 'links', name: 'marketing-links', component: () => import('./views/MarketingLinksView.vue') },
      { path: 'ideias', name: 'marketing-ideas', component: () => import('./views/MarketingIdeasView.vue') },
      { path: 'campanhas', name: 'marketing-campaigns', component: () => import('./views/MarketingCampaignsView.vue') },
      { path: 'utm', name: 'marketing-utm', component: () => import('./views/MarketingUtmView.vue') },
      { path: 'grafica', name: 'marketing-print', component: () => import('./views/MarketingPrintView.vue') },
      { path: 'ativacoes', name: 'marketing-activations', component: () => import('./views/MarketingActivationsView.vue') },
      { path: 'parceiros', name: 'marketing-partners', component: () => import('./views/MarketingPartnersView.vue') },
      { path: 'financeiro', name: 'marketing-finance', component: () => import('./views/MarketingFinanceView.vue') },
      { path: 'configuracoes', name: 'marketing-settings', component: () => import('./views/MarketingSettingsView.vue') },
    ],
  },
]
