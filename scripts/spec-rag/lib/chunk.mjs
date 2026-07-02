// Quebra um markdown em chunks por heading (h1-h3), com janelas de tamanho
// limitado pra caber no contexto do modelo de embedding (all-MiniLM ~256 tokens).

export function chunkMarkdown(text, { maxChars = 1200 } = {}) {
  const lines = text.split(/\r?\n/)
  const sections = []
  let cur = { heading: '(início)', body: [] }
  for (const line of lines) {
    const m = /^#{1,3}\s+(.+)/.exec(line)
    if (m) {
      if (cur.body.join('\n').trim()) sections.push(cur)
      cur = { heading: m[1].trim(), body: [] }
    } else {
      cur.body.push(line)
    }
  }
  if (cur.body.join('\n').trim()) sections.push(cur)

  const chunks = []
  for (const s of sections) {
    const body = s.body.join('\n').trim()
    if (!body) continue
    const windows = splitByChars(body, maxChars)
    windows.forEach((w, i) => {
      chunks.push({
        heading: s.heading,
        text: `${s.heading}\n${w}`,
        preview: w.slice(0, 200).replace(/\s+/g, ' ').trim(),
        part: windows.length > 1 ? i + 1 : null,
      })
    })
  }
  return chunks
}

function splitByChars(text, maxChars) {
  if (text.length <= maxChars) return [text]
  const paras = text.split(/\n{2,}/)
  const out = []
  let buf = ''
  for (const p of paras) {
    if (buf && (buf.length + p.length + 2) > maxChars) {
      out.push(buf)
      buf = p
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
    }
    while (buf.length > maxChars) {
      out.push(buf.slice(0, maxChars))
      buf = buf.slice(maxChars)
    }
  }
  if (buf.trim()) out.push(buf)
  return out
}
