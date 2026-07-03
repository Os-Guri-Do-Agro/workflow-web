import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT, SPECS_DIR, memoryDir, relId } from './paths.mjs'

const IGNORE_DIRS = new Set(['node_modules', 'dist', '.git', '.rag', '.model-cache'])

function walk(dir, predicate, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) walk(abs, predicate, out)
    } else if (predicate(abs, e.name)) {
      out.push(abs)
    }
  }
  return out
}

// --- Specs -------------------------------------------------------------------

export function listSpecFiles() {
  return walk(
    SPECS_DIR,
    (abs, name) =>
      name.endsWith('.md') && name !== 'README.md' && !name.startsWith('INDEX'),
  )
}

export function parseSpec(absPath) {
  const text = fs.readFileSync(absPath, 'utf8')
  const id = relId(absPath)

  const titleM = /^#\s+(.+)$/m.exec(text)
  let title = titleM ? titleM[1].trim() : path.basename(absPath, '.md')
  title = title.replace(/^Spec:\s*/i, '').replace(/^[ÉE]pico:\s*/i, '').trim()

  // header pode ser multi-linha (campo sozinho na linha) OU inline (`Status · Autor
  // · Versão` numa linha só). Captura até o fim da linha e corta no 1º ` · ` ou ` **`.
  const soPrimeiroCampo = (s) => s.trim().split(/\s+·\s+|\s+\*\*/)[0].trim()
  const statusM = /\*\*Status:\*\*\s*(.+)/.exec(text)
  let status = statusM ? soPrimeiroCampo(statusM[1]) : 'Desconhecido'
  if (status.includes('|')) status = 'Desconhecido' // ainda é o template, não preenchido

  const updM = /\*\*[ÚU]ltima atualiza[çc][ãa]o:\*\*\s*(.+)/.exec(text)
  const lastUpdated = updM ? soPrimeiroCampo(updM[1]) : null

  const sections = [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim())

  return {
    path: id,
    kind: 'spec',
    isEpic: id.includes('/epicos/'),
    title,
    status,
    lastUpdated,
    sections,
    text,
  }
}

// --- Memória -----------------------------------------------------------------

export function listMemoryFiles() {
  const dir = memoryDir()
  return walk(dir, (abs, name) => name.endsWith('.md') && name !== 'MEMORY.md')
}

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return {}
  const body = m[1]
  const pick = (re) => {
    const r = re.exec(body)
    return r ? r[1].trim().replace(/^["']|["']$/g, '') : null
  }
  return {
    name: pick(/^name:\s*(.+)$/m),
    description: pick(/^description:\s*(.+)$/m),
    type: pick(/^\s*type:\s*(.+)$/m),
  }
}

export function parseMemory(absPath) {
  const text = fs.readFileSync(absPath, 'utf8')
  const fm = parseFrontmatter(text)
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
  return {
    path: relId(absPath).split('/').slice(-1)[0], // só o nome do arquivo (memória é externa ao repo)
    abs: absPath,
    kind: 'memory',
    name: fm.name || path.basename(absPath, '.md'),
    description: fm.description || '',
    type: fm.type || 'reference',
    text: body,
  }
}

// --- READMEs / convenções (padrões) -----------------------------------------

export function listDocFiles() {
  const out = []
  for (const sub of ['src', 'docs', 'public']) {
    walk(path.join(REPO_ROOT, sub), (abs, name) => name === 'README.md', out)
  }
  const claude = path.join(REPO_ROOT, 'CLAUDE.md')
  if (fs.existsSync(claude)) out.push(claude)
  return out
}

export function parseDoc(absPath) {
  const text = fs.readFileSync(absPath, 'utf8')
  return { path: relId(absPath), kind: 'readme', text }
}
