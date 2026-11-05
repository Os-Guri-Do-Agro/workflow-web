// Passada "não IA" nos rótulos (spec v2-mobile-e-home, T1).
//
// Rótulo em CAIXA ALTA com espaçamento largo acima de título/seção ("ATIVIDADE",
// "DOCUMENTOS", "TRABALHO") era o tique visual mais forte de tela gerada por IA.
// Este script tira a caixa alta e o espaçamento desses rótulos e garante 12px
// (em minúscula, o 10-11px que funcionava em caixa alta cansa a leitura).
//
// Só mexe em blocos de CSS (dentro de <style> nos .vue e nos .css) e só nos
// blocos mais internos (as declarações). Mantém a caixa alta onde ela é dado,
// não enfeite: dias da semana do calendário, código 404, hex de cor, badges de
// status/etiqueta e layouts de impressão.
//
// Uso: node scripts/de-caps.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const DRY = process.argv.includes('--dry')

const KEEP = [
  /\.weekday\b/,
  /\.week-dow\b/,
  /\.grid-head-cell\b/,
  /\.cell-today\b/,
  /\.nf-code\b/,
  /\.qed-color-hex\b/,
  /badge/,
  /\.status-pill\b/,
  /\.project-status\b/,
  /\.tv-tag--auto\b/,
  /\.pull-draft\b/,
  /\.month-entry-tag\b/,
  /\.bar-overdue\b/,
  /\.timeline-today-flag\b/,
  /print-/,
  /::first-letter/,
  /kbd/,
]

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|css)$/.test(name)) out.push(p)
  }
  return out
}

function fixBlock(selector, body) {
  if (!/text-transform:\s*uppercase\s*;?/.test(body)) return null
  const sel = selector.trim()
  if (KEEP.some((re) => re.test(sel))) return null
  let next = body.replace(/\n?[ \t]*text-transform:\s*uppercase\s*;?/g, '')
  // Espaçamento positivo era compensação da caixa alta; negativo fica.
  next = next.replace(/\n?[ \t]*letter-spacing:\s*(0?\.\d+|\d+(\.\d+)?)(em|px)\s*;?/g, (m, n) =>
    Number(n) > 0 ? '' : m,
  )
  next = next.replace(/font-size:\s*(\d+(\.\d+)?)px/g, (m, n) => (Number(n) < 12 ? 'font-size: 12px' : m))
  return next === body ? null : next
}

function processCss(css, file, log) {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (match, selector, body) => {
    const fixed = fixBlock(selector, body)
    if (fixed === null) return match
    log.push(`${path.relative(ROOT, file)}: ${selector.trim().split('\n').pop()}`)
    return `${selector}{${fixed}}`
  })
}

const log = []
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8')
  let out
  if (file.endsWith('.css')) {
    out = processCss(src, file, log)
  } else {
    out = src.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (m, open, css, close) => open + processCss(css, file, log) + close)
  }
  if (out !== src && !DRY) writeFileSync(file, out)
}
console.log(log.join('\n'))
console.log(`\n${log.length} blocos ${DRY ? 'seriam alterados' : 'alterados'}`)
