import QRCode from 'qrcode'

/**
 * Geração e exportação de QR code no cliente a partir de um texto (sempre o
 * `redirectUrl` que o backend devolve — nunca uma URL montada no front).
 *
 * PNG/JPG saem de canvas/dataURL; SVG sai de string vetorial (ideal p/ impressão).
 */

/** Dispara o download de uma dataURL/objectURL com o nome dado. */
function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** PNG de alta resolução (1024px) via dataURL. */
export async function downloadPng(text: string, filename: string): Promise<void> {
  try {
    const dataUrl = await QRCode.toDataURL(text, { width: 1024, margin: 2 })
    triggerDownload(dataUrl, filename)
  } catch {
    throw new Error('Não foi possível exportar o QR em PNG')
  }
}

/**
 * JPG com fundo branco (JPEG não tem alfa; sem o fundo o QR sairia com quadrados
 * pretos sobre preto). Renderiza num canvas e serializa em image/jpeg.
 */
export async function downloadJpg(text: string, filename: string): Promise<void> {
  try {
    const canvas = document.createElement('canvas')
    await QRCode.toCanvas(canvas, text, { width: 1024, margin: 2 })

    // Compõe sobre fundo branco explícito.
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('canvas 2d indisponível')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, 0, 0)

    const dataUrl = out.toDataURL('image/jpeg', 0.95)
    triggerDownload(dataUrl, filename)
  } catch {
    throw new Error('Não foi possível exportar o QR em JPG')
  }
}

/** SVG vetorial (escala sem perda). */
export async function downloadSvg(text: string, filename: string): Promise<void> {
  try {
    const svg = await QRCode.toString(text, { type: 'svg', margin: 2 })
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, filename)
    URL.revokeObjectURL(url)
  } catch {
    throw new Error('Não foi possível exportar o QR em SVG')
  }
}

/** SVG string para preview inline reativo (v-html num container). */
export async function toSvgString(text: string): Promise<string> {
  try {
    return await QRCode.toString(text, { type: 'svg', margin: 2 })
  } catch {
    throw new Error('Não foi possível gerar o QR')
  }
}

/** DataURL PNG para usar direto num <img>. */
export async function toDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, { width: 512, margin: 2 })
  } catch {
    throw new Error('Não foi possível gerar o QR')
  }
}
