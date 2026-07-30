/**
 * Sonda de travamento. LIGADA POR PADRÃO, para todo mundo.
 *
 * ## Por que ligada, e não atrás de uma flag
 *
 * Travamento não avisa antes de acontecer. Uma sonda que exige lembrar de abrir
 * a tela com um parâmetro na URL só captura o travamento que a pessoa conseguiu
 * reproduzir de propósito, e o relato real é sempre "estava trabalhando e
 * travou". Ligada por padrão, o dado do incidente já está gravado quando alguém
 * pensa em olhar.
 *
 * ## Por que isso é barato o bastante para ficar ligado
 *
 * Nada aqui roda por quadro nem por tecla. Os dois observadores acordam apenas
 * quando o browser JÁ decidiu que algo passou do limite:
 *
 * - `event` com `durationThreshold`: o filtro é do próprio browser, então
 *   interação rápida (o caso normal) não chega a virar callback.
 * - `longtask`: só existe entrada acima de 50ms por definição da API.
 *
 * O retrato da tela (`querySelectorAll`) é a parte cara, e por isso só é tirado
 * quando uma amostra já passou do limite — ou seja, num momento em que o quadro
 * já estava perdido de qualquer jeito.
 *
 * ## Como pedir o relatório
 *
 * No console da aba que travou:
 *
 *     copy(window.__perf.dump())
 *
 * Isso põe no clipboard um JSON com TODAS as amostras, os erros de JS do
 * período e o contexto do ambiente.
 *
 * ## Como desligar
 *
 * `?perf=0` na URL (fica valendo para a aba), ou
 * `localStorage.setItem('perf.probe', 'off')`.
 *
 * ## Quando remover
 *
 * Isto é instrumento de investigação, não é feature. Quando a causa do
 * travamento estiver fechada, some com o arquivo e com a chamada no `main.ts`.
 */

interface SlowInteraction {
  tipo: 'interacao'
  /** `click`, `pointerup`, `keydown`… */
  evento: string
  /** Duração total: do input até o quadro seguinte ser pintado. */
  ms: number
  /** Tempo parado na fila antes de o handler começar. Culpa é de outra coisa. */
  esperaMs: number
  /** Tempo dentro do handler. Culpa é do código que responde a este evento. */
  handlerMs: number
  /** Tempo depois do handler até pintar (render, layout, paint). */
  renderMs: number
  alvo: string
  rota: string
  tela: EstadoTela
  em: string
}

interface LongTask {
  tipo: 'tarefa-longa'
  ms: number
  origem: string
  rota: string
  em: string
}

interface ErroJs {
  tipo: 'erro'
  mensagem: string
  origem: string
  rota: string
  em: string
}

interface EstadoTela {
  nosDom: number
  nosSvg: number
  editores: number
  cardsQr: number
}

type Amostra = SlowInteraction | LongTask | ErroJs

/** Caminho curto até o elemento, colável no `$$()` do DevTools. */
function caminho(el: Element | null): string {
  if (!el) return '(sem alvo)'
  const partes: string[] = []
  let atual: Element | null = el
  for (let i = 0; i < 4 && atual && atual !== document.body; i++) {
    let parte = atual.tagName.toLowerCase()
    if (atual.id) parte += `#${atual.id}`
    else {
      const classes = Array.from(atual.classList).slice(0, 2)
      if (classes.length) parte += `.${classes.join('.')}`
    }
    partes.unshift(parte)
    atual = atual.parentElement
  }
  return partes.join(' > ')
}

function estadoDaTela(): EstadoTela {
  return {
    nosDom: document.querySelectorAll('*').length,
    nosSvg: document.querySelectorAll('svg *').length,
    editores: document.querySelectorAll('.ProseMirror').length,
    cardsQr: document.querySelectorAll('.qc').length,
  }
}

const MAX_AMOSTRAS = 300
/** Acima disto a pessoa percebe o engasgo. */
const LIMITE_INTERACAO_MS = 200
/** Acima disto o quadro já foi perdido. */
const LIMITE_TAREFA_MS = 120

export function startPerfProbe(): void {
  try {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return

    // Ligada por padrão. `?perf=0` desliga e a escolha vale para a aba.
    const query = new URLSearchParams(window.location.search).get('perf')
    if (query === '0') localStorage.setItem('perf.probe', 'off')
    if (query === '1') localStorage.removeItem('perf.probe')
    if (localStorage.getItem('perf.probe') === 'off') return

    const amostras: Amostra[] = []
    const inicio = new Date().toISOString()
    const guardar = (a: Amostra) => {
      amostras.push(a)
      if (amostras.length > MAX_AMOSTRAS) amostras.shift()
    }
    const agora = () => new Date().toISOString().slice(11, 23)

    // ─── Interações lentas ────────────────────────────────────────────────────
    try {
      new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries()) {
          const e = entrada as PerformanceEventTiming
          if (e.duration < LIMITE_INTERACAO_MS) continue
          const espera = Math.round(e.processingStart - e.startTime)
          const handler = Math.round(e.processingEnd - e.processingStart)
          const amostra: SlowInteraction = {
            tipo: 'interacao',
            evento: e.name,
            ms: Math.round(e.duration),
            esperaMs: espera,
            handlerMs: handler,
            renderMs: Math.max(0, Math.round(e.duration) - espera - handler),
            alvo: caminho(e.target as Element | null),
            rota: window.location.pathname,
            tela: estadoDaTela(),
            em: agora(),
          }
          guardar(amostra)
          console.warn(
            `[perf] ${amostra.evento} ${amostra.ms}ms ` +
              `(fila ${amostra.esperaMs} + handler ${amostra.handlerMs} + render ${amostra.renderMs}) ` +
              `→ ${amostra.alvo}`,
          )
        }
      }).observe({
        type: 'event',
        buffered: true,
        // Filtro feito pelo browser: interação rápida nem vira callback.
        durationThreshold: LIMITE_INTERACAO_MS,
      } as PerformanceObserverInit)
    } catch {
      // Sem Event Timing (Safari antigo): o resto continua valendo.
    }

    // ─── Tarefas longas ───────────────────────────────────────────────────────
    try {
      new PerformanceObserver((lista) => {
        for (const entrada of lista.getEntries()) {
          if (entrada.duration < LIMITE_TAREFA_MS) continue
          const attr = (
            entrada as PerformanceEntry & {
              attribution?: Array<{ containerType?: string; containerName?: string; name?: string }>
            }
          ).attribution?.[0]
          guardar({
            tipo: 'tarefa-longa',
            ms: Math.round(entrada.duration),
            origem: attr?.containerType
              ? `${attr.containerType}${attr.containerName ? ` (${attr.containerName})` : ''}`
              : (attr?.name ?? 'desconhecida'),
            rota: window.location.pathname,
            em: agora(),
          })
        }
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // Firefox/Safari não implementam `longtask`.
    }

    // ─── Erros de JS ──────────────────────────────────────────────────────────
    // Entram no mesmo relatório porque erro e travamento costumam ser o mesmo
    // incidente visto de dois ângulos, e separar isso em duas coletas dá
    // trabalho a quem está relatando o problema.
    window.addEventListener('error', (e) => {
      guardar({
        tipo: 'erro',
        mensagem: String(e.message).slice(0, 300),
        origem: `${e.filename ?? '?'}:${e.lineno ?? 0}`,
        rota: window.location.pathname,
        em: agora(),
      })
    })
    window.addEventListener('unhandledrejection', (e) => {
      guardar({
        tipo: 'erro',
        mensagem: `promise rejeitada: ${String(e.reason).slice(0, 300)}`,
        origem: '(promise)',
        rota: window.location.pathname,
        em: agora(),
      })
    })

    const api = {
      /**
       * Relatório completo, pronto para colar. TUDO que a sonda viu, não uma
       * amostra: quem está lendo do outro lado precisa do bruto.
       */
      dump: () => {
        const interacoes = amostras.filter((a): a is SlowInteraction => a.tipo === 'interacao')
        const duracoes = interacoes.map((i) => i.ms).sort((a, b) => a - b)
        return JSON.stringify(
          {
            gerado: new Date().toISOString(),
            sondaLigadaEm: inicio,
            url: window.location.href,
            userAgent: navigator.userAgent,
            memoriaMb:
              (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
                ? Math.round(
                    (performance as Performance & { memory: { usedJSHeapSize: number } }).memory
                      .usedJSHeapSize / 1048576,
                  )
                : null,
            telaAgora: estadoDaTela(),
            resumo: {
              interacoesLentas: interacoes.length,
              piorMs: duracoes.length ? duracoes[duracoes.length - 1] : 0,
              medianaMs: duracoes.length ? duracoes[Math.floor(duracoes.length / 2)] : 0,
              tarefasLongas: amostras.filter((a) => a.tipo === 'tarefa-longa').length,
              erros: amostras.filter((a) => a.tipo === 'erro').length,
            },
            amostras,
          },
          null,
          2,
        )
      },
      /** Olhada rápida sem sair da tela. */
      tabela: () => console.table(amostras.map((a) => ({ ...a }))),
      limpar: () => amostras.splice(0, amostras.length),
      amostras,
    }

    ;(window as unknown as { __perf: typeof api }).__perf = api
  } catch {
    // Sonda é diagnóstico: se ela falhar, quem não pode cair é o app.
  }
}
