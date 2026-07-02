// Funde docs/specs/.rag/enrichment.json (produzido pelo workflow spec-enrich /
// spec-research) nos campos enriquecidos do INDEX.json. Idempotente.
import fs from 'node:fs'
import path from 'node:path'
import { INDEX_PATH, RAG_DIR } from './lib/paths.mjs'

const ENRICH_PATH = path.join(RAG_DIR, 'enrichment.json')
const ENRICHED_KEYS = ['area', 'summary', 'keyDecisions', 'anchorFiles', 'related']

function main() {
  if (!fs.existsSync(ENRICH_PATH)) {
    console.error(`[spec-rag] enrichment.json não encontrado (${ENRICH_PATH}). Rode o workflow de enriquecimento antes.`)
    process.exit(0)
  }
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'))
  const enrich = JSON.parse(fs.readFileSync(ENRICH_PATH, 'utf8'))
  const byPath = new Map(enrich.map((e) => [e.path, e]))

  let n = 0
  for (const s of index.specs) {
    const e = byPath.get(s.path)
    if (!e) continue
    for (const k of ENRICHED_KEYS) if (e[k] != null) s[k] = e[k]
    n++
  }
  index.counts.enriched = index.specs.filter((s) => s.summary).length
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')
  console.log(`[spec-rag] merge: ${n} specs enriquecidas no INDEX (${index.counts.enriched} com summary).`)
}

main()
