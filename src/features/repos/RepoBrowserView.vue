<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  GitBranch,
  Folder,
  FileText,
  Loader2,
  Copy,
  Check,
  Code2,
  GitPullRequest,
  ChevronRight,
  X,
  Plus,
  ExternalLink,
} from 'lucide-vue-next'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github-dark.css'
import repositoryService from '@/service/repository/repository-service'
import { useToast } from '@/composables/useToast'

// Mapa extensão -> linguagem hljs
const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  vue: 'xml', html: 'xml', xml: 'xml', svg: 'xml',
  py: 'python',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  scala: 'scala',
  md: 'markdown', mdx: 'markdown',
  json: 'json',
  yml: 'yaml', yaml: 'yaml',
  toml: 'ini', ini: 'ini',
  sql: 'sql',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  ps1: 'powershell',
  dockerfile: 'dockerfile',
  prisma: 'javascript',
  css: 'css', scss: 'scss', less: 'less',
  graphql: 'graphql', gql: 'graphql',
  env: 'bash',
}

const route = useRoute()
const router = useRouter()
const { success: toastSuccess, error: toastError } = useToast()

const repoId = computed(() => String(route.params.id ?? ''))

const repo = ref<any | null>(null)
const branches = ref<any[]>([])
const tree = ref<any[]>([])
const fileContent = ref<any | null>(null)
const pulls = ref<any[]>([])
const cloneInfo = ref<any | null>(null)

const loading = ref(true)
const treeLoading = ref(false)
const fileLoading = ref(false)
const pullsLoading = ref(false)

const currentBranch = ref<string>('')
const currentPath = ref<string>('')
const pathStack = ref<string[]>([]) // segmentos do breadcrumb

const tab = ref<'files' | 'pulls' | 'clone'>('files')

const showNewPr = ref(false)
const prDraft = ref({ title: '', body: '', head: '', base: '' })
const creatingPr = ref(false)

const breadcrumb = computed(() => {
  const segs = currentPath.value ? currentPath.value.split('/') : []
  return segs.map((seg, i) => ({
    name: seg,
    path: segs.slice(0, i + 1).join('/'),
  }))
})

const fileLanguage = computed(() => {
  if (!fileContent.value) return ''
  const ext = fileContent.value.path.split('.').pop()?.toLowerCase() || ''
  return ext
})

const fileHljsLang = computed(() => {
  const ext = fileLanguage.value
  if (LANG_MAP[ext]) return LANG_MAP[ext]
  if (hljs.getLanguage(ext)) return ext
  return ''
})

const highlightedContent = computed(() => {
  if (!fileContent.value || fileContent.value.tooLarge || !fileContent.value.content) {
    return ''
  }
  const code = String(fileContent.value.content)
  const lang = fileHljsLang.value
  try {
    if (lang) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    }
    return hljs.highlightAuto(code).value
  } catch {
    // Fallback: escape e devolve plaintext
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
})

const lineCount = computed(() => {
  if (!fileContent.value?.content) return 0
  return String(fileContent.value.content).split('\n').length
})

// ─── Loaders ─────────────────────────────────────────────────────────────

const loadRepo = async () => {
  try {
    const list = await repositoryService.list()
    const arr = Array.isArray(list) ? list : list?.data || []
    repo.value = arr.find((r: any) => r.id === repoId.value) || null
    if (!repo.value) {
      toastError('Repositório não encontrado ou sem acesso')
      router.push('/repos')
      return
    }
    currentBranch.value = repo.value.defaultBranch
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao carregar repositório')
  }
}

const loadBranches = async () => {
  try {
    branches.value = await repositoryService.listBranches(repoId.value)
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro nas branches')
  }
}

const loadTree = async () => {
  treeLoading.value = true
  try {
    tree.value = await repositoryService.listTree(
      repoId.value,
      currentBranch.value,
      currentPath.value,
    )
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro nos arquivos')
    tree.value = []
  } finally {
    treeLoading.value = false
  }
}

const loadFile = async (path: string) => {
  fileLoading.value = true
  fileContent.value = null
  try {
    fileContent.value = await repositoryService.getFile(
      repoId.value,
      path,
      currentBranch.value,
    )
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao carregar arquivo')
  } finally {
    fileLoading.value = false
  }
}

const loadPulls = async () => {
  pullsLoading.value = true
  try {
    pulls.value = await repositoryService.listPulls(repoId.value, 'open')
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro nas pull requests')
  } finally {
    pullsLoading.value = false
  }
}

const loadCloneInfo = async () => {
  try {
    cloneInfo.value = await repositoryService.getCloneInfo(repoId.value)
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro nas URLs de clone')
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────

const enterDir = (path: string) => {
  currentPath.value = path
  fileContent.value = null
  loadTree()
}

const enterFile = (path: string) => {
  loadFile(path)
}

const goBreadcrumb = (path: string) => {
  currentPath.value = path
  fileContent.value = null
  loadTree()
}

const goRoot = () => {
  currentPath.value = ''
  fileContent.value = null
  loadTree()
}

const goUp = () => {
  if (!currentPath.value) return
  const segs = currentPath.value.split('/')
  segs.pop()
  currentPath.value = segs.join('/')
  fileContent.value = null
  loadTree()
}

const switchBranch = (name: string) => {
  currentBranch.value = name
  currentPath.value = ''
  fileContent.value = null
  loadTree()
}

// ─── Clone copy ──────────────────────────────────────────────────────────

const copied = ref<string | null>(null)
const copy = async (text: string, key: string) => {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    setTimeout(() => (copied.value = null), 1500)
  } catch {
    toastError('Falha ao copiar')
  }
}

// ─── New PR ──────────────────────────────────────────────────────────────

const openNewPr = () => {
  prDraft.value = {
    title: '',
    body: '',
    head: currentBranch.value !== repo.value?.defaultBranch ? currentBranch.value : '',
    base: repo.value?.defaultBranch || 'main',
  }
  showNewPr.value = true
}

const submitNewPr = async () => {
  if (!prDraft.value.title.trim() || !prDraft.value.head.trim()) {
    toastError('Preencha título e branch de origem')
    return
  }
  creatingPr.value = true
  try {
    const res = await repositoryService.createPull(repoId.value, {
      title: prDraft.value.title.trim(),
      body: prDraft.value.body.trim() || undefined,
      head: prDraft.value.head.trim(),
      base: prDraft.value.base.trim() || undefined,
    })
    toastSuccess(`PR #${res.number} criado`)
    showNewPr.value = false
    await loadPulls()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao criar PR')
  } finally {
    creatingPr.value = false
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────

onMounted(async () => {
  loading.value = true
  await loadRepo()
  if (repo.value) {
    await Promise.all([loadBranches(), loadTree(), loadCloneInfo()])
  }
  loading.value = false
})

watch(tab, (t) => {
  if (t === 'pulls' && pulls.value.length === 0 && !pullsLoading.value) {
    loadPulls()
  }
})
</script>

<template>
  <div class="page">
    <header class="head">
      <button class="back" @click="router.push('/repos')">
        <ArrowLeft :size="14" />
        <span>Repositórios</span>
      </button>
      <div v-if="repo" class="head-info">
        <GitBranch :size="14" class="head-icon" />
        <span class="head-name">{{ repo.owner }}/{{ repo.name }}</span>
      </div>
    </header>

    <div v-if="loading" class="state">
      <Loader2 :size="22" class="spin" />
    </div>

    <template v-else-if="repo">
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="branch-select">
          <GitBranch :size="13" />
          <select v-model="currentBranch" @change="switchBranch(currentBranch)">
            <option v-for="b in branches" :key="b.name" :value="b.name">
              {{ b.name }}{{ b.isDefault ? ' (default)' : '' }}
            </option>
          </select>
        </div>

        <div class="tabs">
          <button class="tab" :class="{ 'tab--active': tab === 'files' }" @click="tab = 'files'">
            <Code2 :size="13" /><span>Files</span>
          </button>
          <button class="tab" :class="{ 'tab--active': tab === 'pulls' }" @click="tab = 'pulls'">
            <GitPullRequest :size="13" /><span>Pull Requests</span>
          </button>
          <button class="tab" :class="{ 'tab--active': tab === 'clone' }" @click="tab = 'clone'">
            <Copy :size="13" /><span>Clone</span>
          </button>
        </div>

        <button v-if="tab === 'pulls'" class="btn-primary" @click="openNewPr">
          <Plus :size="13" /><span>Novo PR</span>
        </button>
      </div>

      <!-- ── Files tab ─────────────────────────────────────── -->
      <div v-if="tab === 'files'" class="files-grid">
        <!-- Tree side -->
        <aside class="tree-side">
          <div class="breadcrumb">
            <button class="bc-item" @click="goRoot">/</button>
            <template v-for="(b, i) in breadcrumb" :key="i">
              <ChevronRight :size="11" class="bc-sep" />
              <button class="bc-item" @click="goBreadcrumb(b.path)">{{ b.name }}</button>
            </template>
          </div>

          <div v-if="treeLoading" class="tree-loading">
            <Loader2 :size="14" class="spin" />
          </div>

          <ul v-else class="tree">
            <li v-if="currentPath" class="tree-item tree-up" @click="goUp">
              <span class="tree-icon"><Folder :size="13" /></span>
              <span>..</span>
            </li>
            <li
              v-for="item in tree"
              :key="item.path"
              class="tree-item"
              :class="{ 'tree-active': fileContent?.path === item.path }"
              @click="item.type === 'dir' ? enterDir(item.path) : enterFile(item.path)"
            >
              <span class="tree-icon">
                <Folder v-if="item.type === 'dir'" :size="13" />
                <FileText v-else :size="13" />
              </span>
              <span class="tree-name">{{ item.name }}</span>
            </li>
          </ul>
        </aside>

        <!-- Content side -->
        <main class="content-side">
          <div v-if="fileLoading" class="content-state">
            <Loader2 :size="20" class="spin" />
          </div>

          <div v-else-if="!fileContent" class="content-state">
            <Code2 :size="24" />
            <p>Selecione um arquivo na árvore para ver o conteúdo</p>
          </div>

          <div v-else class="content-file">
            <div class="content-head">
              <span class="content-path">{{ fileContent.path }}</span>
              <span class="content-size">
                {{ lineCount }} linhas
                · {{ (fileContent.size / 1024).toFixed(1) }} KB
                <span v-if="fileHljsLang">· {{ fileHljsLang }}</span>
              </span>
            </div>
            <div v-if="fileContent.tooLarge" class="content-too-large">
              Arquivo muito grande pra exibir aqui (&gt; 1MB).
            </div>
            <div v-else class="content-scroll">
              <div class="code-grid">
                <div class="line-numbers">
                  <span v-for="n in lineCount" :key="n">{{ n }}</span>
                </div>
                <pre class="code-pre"><code class="hljs" v-html="highlightedContent"></code></pre>
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- ── PRs tab ─────────────────────────────────────── -->
      <div v-else-if="tab === 'pulls'" class="pulls-list">
        <div v-if="pullsLoading" class="state">
          <Loader2 :size="18" class="spin" />
        </div>
        <div v-else-if="!pulls.length" class="state">
          <p>Nenhum PR aberto.</p>
        </div>
        <ul v-else class="pulls-ul">
          <li v-for="p in pulls" :key="p.number" class="pull-card">
            <div class="pull-icon"><GitPullRequest :size="14" /></div>
            <div class="pull-body">
              <div class="pull-title">
                <span class="pull-num">#{{ p.number }}</span>
                <span>{{ p.title }}</span>
                <span v-if="p.draft" class="pull-draft">draft</span>
              </div>
              <div class="pull-meta">
                <span>{{ p.author }}</span>
                <span class="sep">·</span>
                <span class="branch">{{ p.head }} → {{ p.base }}</span>
              </div>
            </div>
            <a :href="p.url" target="_blank" rel="noopener" class="pull-link">
              <ExternalLink :size="13" />
            </a>
          </li>
        </ul>
      </div>

      <!-- ── Clone tab ─────────────────────────────────────── -->
      <div v-else class="clone-pane">
        <div class="clone-row">
          <label>HTTPS</label>
          <code>{{ cloneInfo?.https }}</code>
          <button class="btn-copy" @click="copy(cloneInfo.https, 'https')">
            <Check v-if="copied === 'https'" :size="13" />
            <Copy v-else :size="13" />
          </button>
        </div>
        <div class="clone-row">
          <label>SSH</label>
          <code>{{ cloneInfo?.ssh }}</code>
          <button class="btn-copy" @click="copy(cloneInfo.ssh, 'ssh')">
            <Check v-if="copied === 'ssh'" :size="13" />
            <Copy v-else :size="13" />
          </button>
        </div>
        <div class="clone-row">
          <label>GitHub CLI</label>
          <code>{{ cloneInfo?.gh }}</code>
          <button class="btn-copy" @click="copy(cloneInfo.gh, 'gh')">
            <Check v-if="copied === 'gh'" :size="13" />
            <Copy v-else :size="13" />
          </button>
        </div>
        <p class="clone-hint">
          Para clonar repos privados, autentique seu git localmente
          (<code>gh auth login</code> ou chave SSH).
        </p>
      </div>
    </template>

    <!-- New PR modal -->
    <div v-if="showNewPr" class="modal-bd" @click.self="showNewPr = false">
      <div class="modal">
        <div class="modal-h">
          <h3>Novo Pull Request</h3>
          <button class="modal-x" @click="showNewPr = false"><X :size="14" /></button>
        </div>
        <div class="modal-body">
          <div class="ff">
            <label>Título</label>
            <input v-model="prDraft.title" class="fi" placeholder="ex: Fix login flow" />
          </div>
          <div class="ff-row">
            <div class="ff">
              <label>Branch origem (head)</label>
              <input v-model="prDraft.head" class="fi" placeholder="feature/x" />
            </div>
            <div class="ff">
              <label>Branch destino (base)</label>
              <input v-model="prDraft.base" class="fi" :placeholder="repo?.defaultBranch" />
            </div>
          </div>
          <div class="ff">
            <label>Descrição (opcional)</label>
            <textarea v-model="prDraft.body" class="fi" rows="5" placeholder="O que esse PR faz, como testar…"></textarea>
          </div>
        </div>
        <div class="modal-f">
          <button class="btn-cancel" @click="showNewPr = false">Cancelar</button>
          <button class="btn-primary" :disabled="creatingPr" @click="submitNewPr">
            <Loader2 v-if="creatingPr" :size="13" class="spin" />
            <span>{{ creatingPr ? 'Criando…' : 'Criar PR' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 28px;
  max-width: 1280px;
  margin: 0 auto;
  width: 100%;
}
.head {
  display: flex;
  align-items: center;
  gap: 16px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.back:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.head-info {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.head-icon {
  color: var(--accent);
}
.head-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-weight: 600;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.branch-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
}
.branch-select select {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  padding: 2px;
  outline: none;
  cursor: pointer;
}
.tabs {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: var(--text-3);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  border-right: 1px solid var(--border);
}
.tab:last-child {
  border-right: none;
}
.tab:hover {
  color: var(--text);
}
.tab--active {
  background: var(--surface-2);
  color: var(--text);
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  margin-left: auto;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--text-3);
}
.spin {
  animation: spin 0.85s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Files tab ────────────────────────────────────────── */
.files-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 14px;
  align-items: start;
}
@media (max-width: 900px) {
  .files-grid {
    grid-template-columns: 1fr;
  }
}
.tree-side {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 220px);
}
.breadcrumb {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-3);
}
.bc-item {
  background: transparent;
  border: none;
  color: var(--text-2);
  font: inherit;
  cursor: pointer;
  padding: 0 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.bc-item:hover {
  color: var(--accent);
}
.bc-sep {
  opacity: 0.4;
}
.tree-loading {
  padding: 16px;
  color: var(--text-3);
  display: flex;
  justify-content: center;
}
.tree {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  flex: 1;
}
.tree-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  cursor: pointer;
  color: var(--text-2);
}
.tree-item:hover {
  background: var(--surface-2);
  color: var(--text);
}
.tree-up {
  color: var(--text-4);
  font-style: italic;
}
.tree-active {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--text);
}
.tree-icon {
  color: var(--text-3);
  display: inline-flex;
}
.tree-active .tree-icon {
  color: var(--accent);
}
.tree-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content-side {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-height: 300px;
  max-height: calc(100vh - 220px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.content-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 13px;
  padding: 32px;
  text-align: center;
}
.content-file {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.content-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.content-path {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  font-weight: 600;
}
.content-size {
  font-size: 11px;
  color: var(--text-3);
}
.content-too-large {
  padding: 24px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}
.content-scroll {
  flex: 1;
  overflow: auto;
  background: #0d1117; /* mesmo bg do tema github-dark */
}
.code-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  min-height: 100%;
}
.line-numbers {
  display: flex;
  flex-direction: column;
  padding: 12px 12px 12px 16px;
  background: #0d1117;
  border-right: 1px solid #21262d;
  color: #6e7681;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  text-align: right;
  user-select: none;
  position: sticky;
  left: 0;
}
.line-numbers span {
  display: block;
}
.code-pre {
  margin: 0;
  padding: 12px 16px;
  background: #0d1117;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre;
  overflow-x: auto;
}
.code-pre :deep(code.hljs) {
  background: transparent;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

/* ── Pulls ───────────────────────────────────────────── */
.pulls-ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pull-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.pull-icon {
  color: #10b981;
}
.pull-body {
  flex: 1;
  min-width: 0;
}
.pull-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  font-weight: 600;
}
.pull-num {
  color: var(--text-3);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.pull-draft {
  font-size: 10.5px;
  color: var(--text-3);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 999px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.pull-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 2px;
}
.sep {
  opacity: 0.5;
}
.branch {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--text-2);
}
.pull-link {
  color: var(--text-3);
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.pull-link:hover {
  color: var(--accent);
  border-color: var(--accent);
}

/* ── Clone tab ──────────────────────────────────────── */
.clone-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.clone-row {
  display: grid;
  grid-template-columns: 100px 1fr auto;
  align-items: center;
  gap: 10px;
}
.clone-row label {
  font-size: 11.5px;
  color: var(--text-3);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.clone-row code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12.5px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  white-space: nowrap;
}
.btn-copy {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
  cursor: pointer;
}
.btn-copy:hover {
  color: var(--text);
}
.clone-hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
}
.clone-hint code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 4px;
}

/* ── Modal ──────────────────────────────────────────── */
.modal-bd {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, black 60%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.modal {
  width: 100%;
  max-width: 560px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
}
.modal-h {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-h h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.modal-x {
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.modal-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.ff {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ff label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}
.fi {
  width: 100%;
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  outline: none;
  resize: vertical;
}
.fi:focus {
  border-color: var(--accent);
}
.ff-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.modal-f {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn-cancel {
  padding: 8px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
</style>
