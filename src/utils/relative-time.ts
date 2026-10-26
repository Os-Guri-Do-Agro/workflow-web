/**
 * "agora", "há 5 min", "há 2 h", "há 3 dias" e, depois de 30 dias, a data
 * (`26/10`). É o "quando" dos controles do board (sinal do teste, teste por
 * plataforma), curto para caber em tooltip e linha de propriedade.
 */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return ''
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const dias = Math.round(h / 24)
  if (dias < 30) return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
