import type { AttachmentKind } from '@/utils/file-kind'

/**
 * Identidade visual por família de arquivo.
 *
 * Um Drive em que todo card não-imagem é o mesmo retângulo cinza com um glifo
 * pequeno no meio não dá para varrer com os olhos: achar a planilha no meio de
 * trinta cartões iguais vira leitura de legenda, um por um. Cor e extensão
 * grandes fazem o reconhecimento acontecer antes da leitura.
 *
 * As cores saem dos tokens de status do design system (mesmas do resto do app,
 * já validadas em contraste nos dois temas). Nada de hex solto em componente.
 */
export interface FilePalette {
  /** Token de cor da família (borda do glifo, halo, extensão). */
  accent: string
  /** Fundo da capa: mistura suave do accent com a superfície. */
  wash: string
}

const PALETTES: Record<AttachmentKind, FilePalette> = {
  image: { accent: 'var(--info)', wash: 'color-mix(in srgb, var(--info) 12%, var(--surface-2))' },
  pdf: { accent: 'var(--err)', wash: 'color-mix(in srgb, var(--err) 12%, var(--surface-2))' },
  sheet: { accent: 'var(--success)', wash: 'color-mix(in srgb, var(--success) 12%, var(--surface-2))' },
  doc: { accent: 'var(--info)', wash: 'color-mix(in srgb, var(--info) 10%, var(--surface-2))' },
  markdown: { accent: 'var(--text-2)', wash: 'var(--surface-2)' },
  text: { accent: 'var(--text-2)', wash: 'var(--surface-2)' },
  code: { accent: 'var(--accent)', wash: 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' },
  archive: { accent: 'var(--warn)', wash: 'color-mix(in srgb, var(--warn) 12%, var(--surface-2))' },
  video: { accent: 'var(--accent)', wash: 'color-mix(in srgb, var(--accent) 14%, var(--surface-2))' },
  audio: { accent: 'var(--warn)', wash: 'color-mix(in srgb, var(--warn) 10%, var(--surface-2))' },
  other: { accent: 'var(--text-3)', wash: 'var(--surface-2)' },
}

export function paletteOf(kind: AttachmentKind): FilePalette {
  return PALETTES[kind]
}

/**
 * Rótulo curto para a capa tipográfica. Extensão é o que a pessoa reconhece
 * ("XLSX" diz mais que "Planilha" quando o card é pequeno); sem extensão, cai
 * no nome da família.
 */
export function coverLabelOf(filename: string, fallback: string): string {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(filename.trim())
  return match?.[1] ? match[1].toUpperCase() : fallback.toUpperCase()
}
