/**
 * Teclado do board de tarefas (spec board-tarefas-redesign, D10), no padrão em
 * que Jira, Azure e Linear convergem:
 *
 *   C        criar inline na primeira coluna (o formulário completo é o botão)
 *   /        focar a busca da toolbar
 *   ?        ajuda com os atalhos
 *   J K ↓ ↑  próximo e anterior na ordem visível (coluna por coluna, de cima
 *            para baixo; agrupado, linha por linha). Com o painel aberto, trocam
 *            a tarefa do painel (a S3), pelo MESMO caminho de ordem
 *   ← →      coluna vizinha (na mesma linha, quando agrupado)
 *   Enter O  abrir no painel (o Enter é do próprio card, que já abria)
 *   E        renomear o card em foco no lugar
 *   Esc      tirar o foco do card (painel, criação e menus tratam o próprio Esc)
 *   O U      agrupado por pessoa: expandir e recolher todas as linhas (Azure);
 *            ali o card abre só com Enter
 *
 * Só C, / e ? valem fora da vista Board (a Lista cuida do próprio J/K/X/Enter).
 * Tudo é ignorado com foco em campo de texto (input, textarea, select,
 * contenteditable), com Ctrl/Cmd/Alt (Ctrl+C é copiar), durante composição de
 * acento e com menu ou diálogo na frente.
 *
 * O "foco visual" é o foco de verdade do DOM: o card recebe `focus()`, o leitor
 * de tela anuncia a chave e o título, e o contorno é o `:focus-visible` do card
 * (2px accent por dentro). A ordem sai do DOM, não dos dados, para ser sempre a
 * que a pessoa vê: coluna recolhida, linha recolhida e card filtrado não entram.
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { isOccurrenceId } from '../recurring/recurrence-types'
import { isPendingTaskId } from '../pending-task'

/** Card navegável: o `TaskCard` (tem `data-id`) dentro de uma coluna `[data-nav-col]`. */
const CARD_SELECTOR = '[data-nav-col] .card[data-id]'

/** Evento que o `TaskCard` escuta para entrar no modo de renomear (tecla E). */
export const TASK_CARD_RENAME_EVENT = 'task-card-rename'

export interface TaskKeyboardOptions {
  /** O Board (e não Lista, Agenda ou Histórico) é a vista da frente. */
  boardActive: () => boolean
  /** Raiz do board na tela (onde estão as colunas e os cards). */
  root: () => HTMLElement | null
  /** Tarefa aberta no painel (`?task=`), ou `null`. */
  openTaskId: () => string | null
  /** Agrupado por pessoa: `o`/`u` passam a expandir e recolher as linhas. */
  grouped: () => boolean
  /** Algo do próprio board na frente (confirmação, formulário, ajuda). */
  blocked: () => boolean
  onCreate: () => void
  onSearch: () => void
  onHelp: () => void
  /** Abrir no painel (empilha histórico). */
  onOpen: (id: string) => void
  /** Trocar a tarefa do painel aberto (sem empilhar histórico). */
  onSwitchPanel: (id: string) => void
  onExpandLanes: () => void
  onCollapseLanes: () => void
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

const isShown = (el: Element) => el.getClientRects().length > 0

const isVisibleOverlay = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].some(isShown)

/**
 * Há algo por cima do painel de detalhe (`.task-panel`)? O visualizador de
 * arquivo, o diálogo de destino do markdown, uma confirmação de exclusão, um
 * popover. Com isso na frente, J/K e as setas são de quem está na frente: trocar
 * a tarefa por baixo desmontava o painel e levava o diálogo junto.
 *
 * Duas pistas, qualquer uma basta: o foco está fora do painel (num elemento que
 * não é o `body`), ou há outro `[role=dialog]`/`[role=alertdialog]` à vista além
 * do próprio painel.
 */
export function isOverlayOverPanel(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (el?.closest && el !== document.body && el !== document.documentElement) {
    if (!el.closest('.task-panel')) return true
  }
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].some(
    (dialog) => !dialog.classList.contains('task-panel') && isShown(dialog),
  )
}

export function useTaskKeyboard(opts: TaskKeyboardOptions) {
  function cards(): HTMLElement[] {
    const root = opts.root()
    if (!root) return []
    return [...root.querySelectorAll<HTMLElement>(CARD_SELECTOR)].filter(isShown)
  }

  function cardById(id: string): HTMLElement | null {
    return cards().find((c) => c.dataset.id === id) ?? null
  }

  /** O card com o foco do DOM (ou dono do botão em foco, como o "…"). */
  function currentCard(): HTMLElement | null {
    const active = document.activeElement as HTMLElement | null
    const root = opts.root()
    if (!active || !root || !root.contains(active)) return null
    return active.closest<HTMLElement>(CARD_SELECTOR)
  }

  /**
   * Põe o foco no card e rola até ele. `data-kbd-focus` garante o contorno
   * mesmo onde o navegador não acende o `:focus-visible` num focus() por
   * script; sai no primeiro blur.
   */
  function focusCardEl(card: HTMLElement) {
    card.dataset.kbdFocus = ''
    card.addEventListener('blur', () => delete card.dataset.kbdFocus, { once: true })
    card.focus({ preventScroll: true })
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  /** Foco de volta num card (fechar o painel): sem forçar o contorno. */
  function focusCard(id: string) {
    const card = cardById(id)
    card?.focus({ preventScroll: false })
  }

  // ── J/K e setas verticais ────────────────────────────────────────────────
  function stepFocus(delta: 1 | -1) {
    const list = cards()
    if (!list.length) return
    const current = currentCard()
    const at = current ? list.indexOf(current) : -1
    // Sem card em foco, as duas direções começam do primeiro (como no protótipo).
    const next = at === -1 ? list[0] : list[Math.max(0, Math.min(list.length - 1, at + delta))]
    if (next && next !== current) focusCardEl(next)
  }

  /**
   * Com o painel aberto a ordem é a mesma, sem a rotina virtual (ela abre o
   * gerenciador, não o painel) e sem o card otimista (ainda não existe).
   */
  function stepPanel(delta: 1 | -1) {
    const current = opts.openTaskId()
    const order = cards()
      .map((c) => c.dataset.id ?? '')
      .filter((id) => id && !isOccurrenceId(id) && !isPendingTaskId(id))
    if (!current || !order.length) return
    const at = order.indexOf(current)
    const next = at === -1 ? order[delta > 0 ? 0 : order.length - 1] : order[at + delta]
    if (!next || next === current) return
    opts.onSwitchPanel(next)
    requestAnimationFrame(() =>
      cardById(next)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
    )
  }

  // ── ←/→: coluna vizinha ──────────────────────────────────────────────────
  function stepColumn(delta: 1 | -1) {
    const current = currentCard()
    if (!current) {
      const first = cards()[0]
      if (first) focusCardEl(first)
      return
    }
    const column = current.closest<HTMLElement>('[data-nav-col]')
    if (!column) return
    // Agrupado, a vizinha é a da MESMA linha; no board simples, o board todo.
    const scope = column.closest<HTMLElement>('[data-nav-group]') ?? opts.root()
    if (!scope) return
    const columns = [...scope.querySelectorAll<HTMLElement>('[data-nav-col]')].filter(isShown)
    const cardsIn = (col: HTMLElement) =>
      [...col.querySelectorAll<HTMLElement>('.card[data-id]')].filter(isShown)

    // Coluna vazia não prende a seta: pula até a próxima que tenha card.
    let i = columns.indexOf(column) + delta
    while (columns[i] && !cardsIn(columns[i]!).length) i += delta
    const target = columns[i]
    if (!target) return

    // Na vizinha, o card mais perto na altura de quem estava em foco.
    const from = current.getBoundingClientRect()
    const center = from.top + from.height / 2
    let best: HTMLElement | null = null
    let bestDistance = Infinity
    for (const card of cardsIn(target)) {
      const r = card.getBoundingClientRect()
      const distance = Math.abs(r.top + r.height / 2 - center)
      if (distance < bestDistance) {
        best = card
        bestDistance = distance
      }
    }
    if (best) focusCardEl(best)
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (isTypingTarget(event.target)) return
    // Menu aberto (status, prioridade, filtros, "…"): setas, Enter e Esc são dele.
    if (isVisibleOverlay('[role="menu"]')) return

    const key = event.key
    const lower = key.length === 1 ? key.toLowerCase() : key
    const next = lower === 'j' || key === 'ArrowDown'
    const prev = lower === 'k' || key === 'ArrowUp'

    // Painel aberto: só a troca de tarefa. Esc, Tab e o resto são do painel.
    if (opts.openTaskId()) {
      if (!opts.boardActive() || opts.blocked()) return
      if (isOverlayOverPanel(event.target)) return
      if (next || prev) {
        event.preventDefault()
        stepPanel(next ? 1 : -1)
      }
      return
    }

    // Criação, confirmação, rotinas, paleta: quem está na frente fica com o teclado.
    if (opts.blocked() || isVisibleOverlay('[role="dialog"], [role="alertdialog"]')) return

    // ── Valem em qualquer vista ──
    if (key === '?') {
      event.preventDefault()
      opts.onHelp()
      return
    }
    if (key === '/') {
      event.preventDefault()
      opts.onSearch()
      return
    }
    if (lower === 'c') {
      event.preventDefault()
      if (!event.repeat) opts.onCreate()
      return
    }

    if (!opts.boardActive()) return

    // Setas têm sentido nativo em muito controle (rolar, rádio, abas): só
    // navegam quando o foco está num card ou solto na página.
    const target = event.target as HTMLElement | null
    const onCardOrPage =
      !target || target === document.body || !!currentCard() || target === opts.root()
    const isArrow = key.startsWith('Arrow')
    if (isArrow && !onCardOrPage) return

    if (next || prev) {
      event.preventDefault()
      stepFocus(next ? 1 : -1)
      return
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault()
      stepColumn(key === 'ArrowRight' ? 1 : -1)
      return
    }

    if (opts.grouped() && (lower === 'o' || lower === 'u')) {
      event.preventDefault()
      if (lower === 'o') opts.onExpandLanes()
      else opts.onCollapseLanes()
      return
    }

    const current = currentCard()
    if (!current) return
    const id = current.dataset.id ?? ''

    if (lower === 'o') {
      event.preventDefault()
      opts.onOpen(id)
    } else if (lower === 'e') {
      // preventDefault: sem ele o próprio "e" cairia no campo que abre agora.
      event.preventDefault()
      current.dispatchEvent(new CustomEvent(TASK_CARD_RENAME_EVENT))
    } else if (key === 'Escape') {
      ;(document.activeElement as HTMLElement | null)?.blur()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

  return { focusCard }
}
