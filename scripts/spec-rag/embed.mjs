// Gera docs/specs/.rag/vectors.json — embeddings de specs + memórias + READMEs.
// Mais pesado (carrega o modelo). Rodado pelo /spec-sync, não pelo hook.
import fs from 'node:fs'
import path from 'node:path'
import { RAG_DIR, VECTORS_PATH } from './lib/paths.mjs'
import { chunkMarkdown } from './lib/chunk.mjs'
import { embedMany, MODEL_ID, DIM } from './lib/model.mjs'
import {
  listSpecFiles,
  parseSpec,
  listMemoryFiles,
  parseMemory,
  listDocFiles,
  parseDoc,
} from './lib/sources.mjs'

function collectChunks() {
  const records = []

  for (const abs of listSpecFiles()) {
    const s = parseSpec(abs)
    for (const c of chunkMarkdown(s.text)) {
      records.push({
        source: s.path,
        kind: 'spec',
        status: s.status,
        heading: c.heading,
        preview: c.preview,
        text: c.text,
      })
    }
  }

  for (const abs of listMemoryFiles()) {
    const m = parseMemory(abs)
    const text = `${m.name} — ${m.description}\n${m.text}`
    records.push({
      source: `memory/${m.path}`,
      kind: 'memory',
      memType: m.type,
      heading: m.name,
      preview: m.description.slice(0, 200),
      text: text.slice(0, 1600),
    })
  }

  for (const abs of listDocFiles()) {
    const d = parseDoc(abs)
    for (const c of chunkMarkdown(d.text)) {
      records.push({
        source: d.path,
        kind: 'readme',
        heading: c.heading,
        preview: c.preview,
        text: c.text,
      })
    }
  }

  return records
}

async function main() {
  const records = collectChunks()
  if (!records.length) {
    console.error('[spec-rag] nada pra indexar.')
    process.exit(0)
  }
  console.log(`[spec-rag] embeddando ${records.length} chunks (modelo baixa na 1ª vez)...`)

  const vectors = await embedMany(
    records.map((r) => r.text),
    (done, total) => {
      if (done % 25 === 0 || done === total) process.stdout.write(`\r  ${done}/${total}`)
    },
  )
  process.stdout.write('\n')

  fs.mkdirSync(RAG_DIR, { recursive: true })
  const store = {
    generatedAt: new Date().toISOString(),
    model: MODEL_ID,
    dim: DIM,
    chunks: records.map((r, i) => {
      const { text: _text, ...meta } = r
      return { id: `${r.source}#${i}`, ...meta, vector: vectors[i] }
    }),
  }
  fs.writeFileSync(VECTORS_PATH, JSON.stringify(store))
  console.log(`[spec-rag] vectors.json: ${store.chunks.length} chunks -> ${path.relative(process.cwd(), VECTORS_PATH)}`)
}

main()
