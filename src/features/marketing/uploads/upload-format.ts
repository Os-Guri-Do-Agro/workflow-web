/** Textos da bandeja e dos diálogos: tamanho, velocidade, tempo e estado de cada arquivo. */
import { formatBytes } from '../marketing-labels'
import type { UploadItem } from './upload-queue'

export { formatBytes }

export function formatSpeed(bps: number | null): string {
  if (!bps || bps < 1) return ''
  return `${formatBytes(Math.round(bps))}/s`
}

/** "8 s", "3 min", "1 h 12 min" */
export function formatEta(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return ''
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h} h ${rest} min` : `${h} h`
}

/** 0 a 100: o hash conta 10% e os bytes 90% (a barra não para enquanto calcula). */
export function itemPercent(item: UploadItem): number {
  if (item.status === 'done') return 100
  if (!item.size) return 0
  const hash = item.sha256 ? 1 : item.hashed / item.size
  return Math.min(99, Math.floor(hash * 10 + (item.sent / item.size) * 90))
}

/** Linha de estado em pt-BR, curta, para a bandeja. */
export function itemStatusText(item: UploadItem): string {
  switch (item.status) {
    case 'queued':
      return item.prompt ? item.prompt.message : 'Na fila'
    case 'hashing':
      return item.size ? `Conferindo o arquivo ${Math.floor((item.hashed / item.size) * 100)}%` : 'Conferindo o arquivo'
    case 'uploading': {
      if (item.notice) return item.notice
      if (!item.sent && !item.speedBps) return 'Preparando o envio'
      const parts = [`${formatBytes(item.sent)} de ${formatBytes(item.size)}`]
      const speed = formatSpeed(item.speedBps)
      if (speed) parts.push(speed)
      const eta = formatEta(item.etaSec)
      if (eta) parts.push(`falta ${eta}`)
      return parts.join(' · ')
    }
    case 'confirming':
      return item.notice ?? 'Finalizando'
    case 'done':
      return 'Enviado'
    case 'error':
      return item.error ?? 'Não deu para enviar.'
    case 'canceled':
      return item.notice && item.notice !== 'Envio cancelado.' ? item.notice : 'Cancelado'
  }
}
