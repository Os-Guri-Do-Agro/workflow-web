import QRCodeStyling from 'qr-code-styling'
import type {
  Options,
  DotType,
  CornerSquareType,
  CornerDotType,
} from 'qr-code-styling'
import type { QrStyle } from '@/service/qr/qr-service'

/**
 * Render e exportação de QR code no cliente usando `qr-code-styling`, honrando o
 * `style` que o usuário personaliza (cor dos módulos, cor de fundo, formato dos
 * pontos/cantos e logo central). Único caminho de render da feature.
 *
 * O TEXTO renderizado é sempre o `redirectUrl` que o backend devolve — nunca uma
 * URL montada no front. Cores são literais escolhidas pelo usuário; o fundo é
 * branco por padrão (QR precisa de fundo claro/opaco pra escanear).
 */

const DEFAULT_DARK = '#000000'
const DEFAULT_LIGHT = '#ffffff'

// ─── Mapeamentos do nosso vocabulário → tipos da lib (1.9.2) ───────────────────
function mapDot(style?: QrStyle['dotStyle']): DotType {
  switch (style) {
    case 'rounded':
      return 'rounded'
    case 'dots':
      return 'dots'
    case 'classy':
      return 'classy'
    default:
      return 'square'
  }
}

function mapCornerSquare(style?: QrStyle['cornerStyle']): CornerSquareType {
  switch (style) {
    case 'rounded':
      return 'extra-rounded'
    case 'dot':
      return 'dot'
    default:
      return 'square'
  }
}

function mapCornerDot(style?: QrStyle['cornerStyle']): CornerDotType {
  switch (style) {
    // 'rounded' não tem equivalente de ponto arredondado nos olhos → usa 'dot'.
    case 'dot':
    case 'rounded':
      return 'dot'
    default:
      return 'square'
  }
}

/** Cor de fundo translúcida (ou "transparent") quebra o JPEG (sem alfa). */
function isTranslucent(color?: string): boolean {
  if (!color) return false
  const c = color.trim().toLowerCase()
  if (c === 'transparent') return true
  if (/^#([0-9a-f]{4}|[0-9a-f]{8})$/i.test(c)) return true // #RGBA / #RRGGBBAA
  if (c.startsWith('rgba') || c.startsWith('hsla')) return true
  return false
}

/**
 * Monta as options do QRCodeStyling a partir do texto + estilo do usuário.
 * `errorCorrectionLevel` sobe pra 'H' quando há logo (mais redundância pra
 * compensar a área coberta).
 */
export function buildQrOptions(
  text: string,
  style: QrStyle | null | undefined,
  size: number,
): Options {
  return {
    width: size,
    height: size,
    type: 'svg',
    data: text,
    margin: 8,
    qrOptions: {
      errorCorrectionLevel: style?.logoUrl ? 'H' : 'M',
    },
    dotsOptions: {
      color: style?.colorDark ?? DEFAULT_DARK,
      type: mapDot(style?.dotStyle),
    },
    backgroundOptions: {
      color: style?.colorLight ?? DEFAULT_LIGHT,
    },
    cornersSquareOptions: {
      color: style?.colorDark ?? DEFAULT_DARK,
      type: mapCornerSquare(style?.cornerStyle),
    },
    cornersDotOptions: {
      color: style?.colorDark ?? DEFAULT_DARK,
      type: mapCornerDot(style?.cornerStyle),
    },
    image: style?.logoUrl || undefined,
    imageOptions: {
      crossOrigin: 'anonymous',
      margin: 6,
      imageSize: 0.28,
      hideBackgroundDots: true,
    },
  }
}

/**
 * Cria uma instância de QRCodeStyling, limpa o container e desenha nele.
 * Retorna a instância pra reuso via `.update(buildQrOptions(...))` (sem flicker).
 */
export function renderInto(
  el: HTMLElement,
  text: string,
  style: QrStyle | null | undefined,
  size: number,
): QRCodeStyling {
  const qr = new QRCodeStyling(buildQrOptions(text, style, size))
  el.innerHTML = ''
  qr.append(el)
  return qr
}

/** Dispara o download de um Blob com o nome dado. */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoga no próximo tick pra garantir que o clique já foi processado.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Exporta o QR em alta resolução (1024px) honrando o `style`. PNG/JPEG saem de
 * canvas; SVG sai vetorial. Para JPEG (sem alfa) força fundo branco quando a cor
 * de fundo escolhida for translúcida.
 */
export async function exportQr(
  text: string,
  style: QrStyle | null | undefined,
  format: 'png' | 'jpeg' | 'svg',
  filename: string,
): Promise<void> {
  try {
    const options = buildQrOptions(text, style, 1024)
    options.type = format === 'svg' ? 'svg' : 'canvas'

    // JPEG não tem transparência: fundo tem que ser opaco pra não sair "preto no preto".
    if (format === 'jpeg' && isTranslucent(style?.colorLight)) {
      options.backgroundOptions = { ...options.backgroundOptions, color: DEFAULT_LIGHT }
    }

    const qr = new QRCodeStyling(options)
    const data = (await qr.getRawData(format)) as Blob | null
    if (!data) throw new Error('sem dados')
    triggerBlobDownload(data, filename)
  } catch {
    const label = format === 'jpeg' ? 'JPG' : format.toUpperCase()
    throw new Error(`Não foi possível exportar o QR em ${label}`)
  }
}
