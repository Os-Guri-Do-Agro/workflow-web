/**
 * Telas FORA do menu (pedido do Nicolas, out/2026: "ninguém usa calendário,
 * notas, bug reports e roadmap"). O objetivo é deixar a navegação enxuta.
 * Notas voltou ao menu um dia depois: tinha gente usando.
 *
 * Só some a ENTRADA: menu lateral dos três shells, menu iniciar e área de
 * trabalho do Modo XP e a busca rápida (Ctrl K). As ROTAS continuam valendo:
 * link antigo, notificação e favorito abrem normalmente, e nada foi apagado.
 *
 * Mesmo tratamento do Canvas (`feature-flags.ts`): voltar a mostrar é tirar a
 * rota desta lista, ou ligar `VITE_SHOW_ALL_NAV=true` para ver tudo de novo
 * sem mexer em código.
 */
const HIDDEN: readonly string[] = ['/roadmap', '/calendar', '/bug-reports']

export const HIDDEN_NAV_ROUTES: readonly string[] =
  import.meta.env.VITE_SHOW_ALL_NAV === 'true' ? [] : HIDDEN

/** A entrada de menu que leva a `to` deve sumir? */
export function isNavHidden(to: string | null | undefined): boolean {
  if (!to) return false
  return HIDDEN_NAV_ROUTES.some((route) => to === route || to.startsWith(`${route}/`))
}
