// Gera/atualiza docs/specs/INDEX.json — APENAS metadata mecânica (rápido, sem
// modelo). Preserva campos enriquecidos (area, summary, keyDecisions,
// anchorFiles, related) que vêm do /spec-sync ou do workflow. Usado pelo hook Stop.
import fs from 'node:fs'
import { INDEX_PATH, SPECS_DIR } from './lib/paths.mjs'
import { listSpecFiles, parseSpec, listMemoryFiles, parseMemory } from './lib/sources.mjs'
import { MODEL_ID } from './lib/model.mjs'

const ENRICHED_KEYS = ['area', 'summary', 'keyDecisions', 'anchorFiles', 'related']

function loadExisting() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'))
  } catch {
    return null
  }
}

function main() {
  if (!fs.existsSync(SPECS_DIR)) {
    console.error(`[spec-rag] docs/specs não encontrado em ${SPECS_DIR}`)
    process.exit(0)
  }

  const prev = loadExisting()
  const prevByPath = new Map((prev?.specs || []).map((s) => [s.path, s]))

  const specs = listSpecFiles()
    .map(parseSpec)
    .map(({ text: _text, ...meta }) => {
      const old = prevByPath.get(meta.path)
      const enriched = {}
      if (old) for (const k of ENRICHED_KEYS) if (old[k] != null) enriched[k] = old[k]
      return { ...meta, ...enriched }
    })
    .sort((a, b) => a.path.localeCompare(b.path))

  const memories = listMemoryFiles()
    .map(parseMemory)
    .map(({ text: _text, abs: _abs, ...meta }) => meta)
    .sort((a, b) => a.name.localeCompare(b.name))

  const index = {
    generatedAt: new Date().toISOString(),
    model: MODEL_ID,
    counts: {
      specs: specs.length,
      epics: specs.filter((s) => s.isEpic).length,
      memories: memories.length,
      enriched: specs.filter((s) => s.summary).length,
    },
    statusByName: tally(specs.map((s) => s.status)),
    specs,
    memories,
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n')
  console.log(
    `[spec-rag] INDEX.json: ${specs.length} specs (${index.counts.epics} épicos, ` +
      `${index.counts.enriched} enriquecidas), ${memories.length} memórias.`,
  )
}

function tally(arr) {
  const out = {}
  for (const v of arr) out[v] = (out[v] || 0) + 1
  return out
}

main()
