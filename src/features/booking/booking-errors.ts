import axios from 'axios'
import { getApiErrorMessage } from '@/service/api'

/**
 * Mensagem de erro para as páginas PÚBLICAS do agendamento.
 *
 * Quem está do outro lado é cliente externo, então nada em inglês nem nome de
 * exceção chega na tela. O caso que motivou isto: o limite por IP do servidor
 * responde 429 com "ThrottlerException: Too Many Requests", e o teste de ponta
 * a ponta mostrou exatamente esse texto para o convidado. O outro 429 (limite
 * de reuniões por e-mail) já vem em português e passa direto.
 */
export function bookingErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && error.response?.status === 429) {
    const message = getApiErrorMessage(error, '')
    if (!message || /throttler|too many requests/i.test(message)) {
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.'
    }
    return message
  }
  return getApiErrorMessage(error, fallback)
}
