// Retrieval híbrido: busca semântica (embeddings) + busca exata (INDEX.json).
// Uso:  node scripts/spec-rag/query.mjs "texto da busca" [--k 6] [--kind spec|memory|readme]
// Saída: JSON em stdout, pensado pra ser consumido pelo Claude na Fase 0.
import fs from 'node:fs'
import { INDEX_PATH, VECTORS_PATH } from './lib/paths.mjs'
import { embed, cosine } from './lib/model.mjs'

function parseArgs(argv) {
  const args = { k: 6, kind: null, terms: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--k') args.k = Number(argv[++i]) || 6
    else if (a === '--kind') args.kind = argv[++i]
    else args.terms.push(a)
  }
  args.query = args.terms.join(' ').trim()
  return args
}

function loadJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function lexicalHits(index, query, limit = 6) {
  if (!index?.specs) return []
  const tokens = [...new Set(query.toLowerCase().match(/[\p{L}\d]{3,}/gu) || [])]
  if (!tokens.length) return []
  const scored = index.specs.map((s) => {
    const hay = [
      s.title,
      s.area,
      s.path,
      (s.keyDecisions || []).join(' '),
      (s.sections || []).join(' '),
      s.summary,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0)
    return { score, spec: s }
  })
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({
      path: x.spec.path,
      title: x.spec.title,
      status: x.spec.status,
      area: x.spec.area || null,
      matches: x.score,
    }))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.query) {
    console.error('uso: node scripts/spec-rag/query.mjs "texto" [--k N] [--kind spec|memory|readme]')
    process.exit(1)
  }

  const index = loadJson(INDEX_PATH)
  const store = loadJson(VECTORS_PATH)

  const result = { query: args.query, semantic: [], lexical: lexicalHits(index, args.query) }

  if (store?.chunks?.length) {
    const qv = await embed(args.query)
    let chunks = store.chunks
    if (args.kind) chunks = chunks.filter((c) => c.kind === args.kind)
    result.semantic = chunks
      .map((c) => ({ c, score: cosine(qv, c.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, args.k)
      .map(({ c, score }) => ({
        source: c.source,
        kind: c.kind,
        heading: c.heading,
        score: Number(score.toFixed(4)),
        preview: c.preview,
      }))
  } else {
    result.note = 'vectors.json ausente — rode `npm run spec:embed` (ou /spec-sync). Só busca exata disponível.'
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
}

main()
