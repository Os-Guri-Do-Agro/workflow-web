import { usePostHog } from './usePostHog'

/**
 * Eventos de produto, tipados.
 *
 * ## Por que existe
 *
 * O PostHog está no projeto desde o começo e capturava exatamente uma coisa:
 * `$pageview`. Pageview responde "quais telas abriram" e não responde nenhuma
 * pergunta de produto: ninguém sabe se as pessoas escrevem descrição, se movem
 * tarefa pelo painel ou pelo arraste, nem qual empresa parou de usar.
 *
 * ## Por que tipado, e não `posthog.capture('algo', {...})` solto
 *
 * Nome de evento em string espalhada pelos componentes produz duas grafias do
 * mesmo evento na terceira semana (`task_created` e `taskCreated`), e a partir
 * daí o funil mente. A união abaixo é a lista fechada: adicionar evento é
 * adicionar um membro aqui, e o typecheck cobra as propriedades.
 *
 * ## Onde a descrição da tarefa aparece nisto
 *
 * `task_description_edited` carrega `was_legacy_plain` de propósito: é como se
 * mede a adoção do editor rico contra a base de descrições em texto plano que
 * existia antes, sem precisar de migration nem de query no banco.
 */

/** Superfície de onde a ação partiu. A mesma ação existe em três lugares. */
export type ActionSurface = 'panel' | 'board' | 'page' | 'form'

export type ProductEvent =
  | {
      name: 'task_created'
      props: {
        has_description: boolean
        has_assignees: boolean
        has_due_date: boolean
        priority: number
      }
    }
  | {
      name: 'task_description_edited'
      props: {
        /** Caracteres de TEXTO (markup não conta). */
        char_count: number
        used_formatting: boolean
        /** O valor que estava no servidor era texto plano legado? */
        was_legacy_plain: boolean
        surface: ActionSurface
      }
    }
  | {
      name: 'task_status_changed'
      props: { from: string; to: string; surface: ActionSurface }
    }
  | {
      name: 'task_assigned'
      props: { assignee_count: number; assigned_self: boolean }
    }
  | {
      name: 'subtask_toggled'
      props: { to_status: string; surface: ActionSurface }
    }

export function useAnalytics() {
  const { capture } = usePostHog()

  /**
   * Registra um evento de produto.
   *
   * Nunca lança e nunca bloqueia: analytics que derruba a tela é pior que
   * analytics ausente. Em localhost o PostHog não é inicializado e isto é no-op.
   */
  function track<E extends ProductEvent>(name: E['name'], props: E['props']): void {
    capture(name, props as Record<string, unknown>)
  }

  return { track }
}
