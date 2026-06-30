/**
 * Feature flags do app.
 *
 * Lidas de variáveis de ambiente do Vite (`import.meta.env.VITE_*`).
 * Padrão de cada flag é `false` (a feature só liga quando a env vier `"true"`).
 *
 * ## CANVAS_ENABLED
 * Liga/desliga o Canvas (boards de desenho colaborativo Yjs/Hocuspocus).
 * Quando `false` (padrão), o Canvas é escondido de forma reversível em todas as
 * camadas (rotas, nav, palette, shells, settings, onboarding) — **sem deletar
 * nenhum arquivo**. O Kanban (`/board`) é uma feature separada e permanece
 * sempre visível, independentemente desta flag.
 *
 * Para reativar tudo: `VITE_CANVAS_ENABLED=true` no `.env`. Ver
 * `docs/CANVAS_DEACTIVATION.md` para o checklist completo.
 */
export const CANVAS_ENABLED = import.meta.env.VITE_CANVAS_ENABLED === 'true'
