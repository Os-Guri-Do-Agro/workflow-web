import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// scripts/spec-rag/lib -> scripts/spec-rag -> scripts -> repo
export const REPO_ROOT = path.resolve(HERE, '../../..')

export const SPECS_DIR = path.join(REPO_ROOT, 'docs', 'specs')
export const RAG_DIR = path.join(SPECS_DIR, '.rag')
export const INDEX_PATH = path.join(SPECS_DIR, 'INDEX.json')
export const VECTORS_PATH = path.join(RAG_DIR, 'vectors.json')
// Cache do modelo FORA do repo (global, compartilhado entre projetos): o modelo
// baixa 1x na máquina e nunca polui o working tree de nenhum repo.
export const MODEL_CACHE = path.join(os.homedir(), '.cache', 'spec-rag-models')

// A memória vive fora do repo, em ~/.claude/projects/<slug>/memory.
// O slug é o cwd com `:`, `\` e `/` trocados por `-` (mesma regra do harness).
export function memoryDir() {
  const slug = REPO_ROOT.replace(/[:\\/]/g, '-')
  return path.join(os.homedir(), '.claude', 'projects', slug, 'memory')
}

// id estável e cross-platform (sempre forward-slash, relativo ao repo)
export function relId(absPath) {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/')
}
