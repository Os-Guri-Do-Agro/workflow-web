/** Frase do erro da API (o 400/403 da ala já vem em PT-BR, pronto para a tela). */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return typeof message === 'string' && message ? message : fallback
}

/** Status HTTP do erro do axios (ou null). */
export function apiErrorStatus(err: unknown): number | null {
  const status = (err as { response?: { status?: unknown } })?.response?.status
  return typeof status === 'number' ? status : null
}
