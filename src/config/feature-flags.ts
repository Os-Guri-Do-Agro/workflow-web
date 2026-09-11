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

/**
 * ## TIMER_AUTO_STOP_ENABLED
 * Liga/desliga o CORTE automático do cronômetro por ociosidade.
 *
 * Desligada em 2026-08-27 a pedido: o time estava trabalhando e mesmo assim via
 * o tempo parar. Enquanto a causa do falso positivo não for encontrada, o custo
 * dos dois lados não se compara — timer esquecido rendendo hora a mais é um
 * ajuste manual em Meu tempo, timer cortado no meio do trabalho é hora
 * trabalhada que some, e some de quem estava usando a ferramenta direito.
 *
 * O que ela desliga: só o CORTE. O aviso "seu tempo continua correndo" fica de
 * pé, com o texto que não promete encerrar nada — ele é útil justamente para
 * quem esqueceu, e agora é a única defesa contra o timer esquecido.
 *
 * Nada foi deletado (mesmo tratamento do Canvas):
 * `VITE_TIMER_AUTO_STOP_ENABLED=true` devolve o comportamento inteiro. O par
 * desta chave no backend é `TIMER_AUTO_STOP_ENABLED`, que governa o corte do
 * servidor por timer esquecido — as duas precisam estar ligadas para o
 * encerramento automático voltar por completo.
 */
export const TIMER_AUTO_STOP_ENABLED =
  import.meta.env.VITE_TIMER_AUTO_STOP_ENABLED === 'true'

/**
 * ## RECURRING_API_ENABLED
 * Liga a integração das tarefas recorrentes com a API real.
 *
 * Desligada (padrão), a feature continua no estado LOCAL: regras em
 * `localStorage` por empresa, ocorrências derivadas no cliente, nenhuma
 * requisição de recorrência saindo. Ligada, as regras passam a vir de
 * `GET /company/:id/activity-recurrence` e do payload do board, e as escritas
 * vão para a API.
 *
 * A flag existe porque a troca mexe no quadro onde as pessoas trabalham: um
 * board que passa a mostrar tarefa de rotina errada não é um bug de tela, é
 * gente fazendo — ou deixando de fazer — trabalho. Com a flag, voltar ao
 * comportamento conhecido é uma variável de ambiente, não um revert com
 * deploy. Mesmo tratamento do Canvas e do corte por ociosidade: nada é
 * deletado dos dois lados.
 *
 * Depende do backend ter o commit que expõe `recurrences`, `monthNumber`,
 * `from` e `to` no payload do board (`GET /month/:monthId/board`). Sem ele, a
 * flag ligada mostra um board sem nenhuma rotina — não quebra, mas não serve.
 */
export const RECURRING_API_ENABLED =
  import.meta.env.VITE_RECURRING_API_ENABLED === 'true'
