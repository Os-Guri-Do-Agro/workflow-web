<script setup lang="ts">
/**
 * Roadmap (spec docs/specs/2026/q4/q4-2/v2-celular-roadmap-notas.md).
 *
 * Duas visões: **Mês** (um mês por vez, calendário com os itens e painel de
 * agenda, em teste, foco, imagens e comentários) e **Ano** (linha do tempo com
 * objetivos, marcos com a janela de teste e entregas). Substitui os cartões de
 * mês lado a lado com "Meses passados" e a timeline de lanes por trimestre.
 *
 * Esta tela só orquestra: dados e gravações em `useRoadmap`, regras de data e
 * de tipo em `roadmap-meta.ts`, e cada visão no seu componente.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileDown,
  Flag,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Sparkles,
  X,
} from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { safeStorage } from '@/utils/safe-storage'
import { todayDateOnly } from '@/utils/date'
import type { RoadmapEntry } from '@/service/roadmap/roadmap-monthly-service'
import type { RoadmapMilestoneDto } from '@/service/roadmap/roadmap-milestones-service'
import { useRoadmap, type EntryInput, type MilestoneInput } from './composables/useRoadmap'
import { MONTH_NAMES, daysBetween, formatDayMonth, monthKeyOf, parseDate, relativeDays } from './roadmap-meta'
import { testBands } from './roadmap-items'
import RoadmapMonthView from './components/RoadmapMonthView.vue'
import RoadmapYearView from './components/RoadmapYearView.vue'
import RoadmapItemDialog, { type ItemDialogTarget } from './components/RoadmapItemDialog.vue'
import RoadmapPrint from './components/RoadmapPrint.vue'

const rm = useRoadmap()
const workspace = useWorkspaceStore()
const today = todayDateOnly()

// ── Visão e mês na tela ────────────────────────────────────────────────────
type View = 'month' | 'year'
const VIEW_KEY = 'roadmap.view'
const view = ref<View>(safeStorage.getItem(VIEW_KEY) === 'year' ? 'year' : 'month')
watch(view, (v) => safeStorage.setItem(VIEW_KEY, v))

const monthKey = ref(today.slice(0, 7))
const shown = computed(() => parseDate(`${monthKey.value}-01`))
const monthTitle = computed(() => MONTH_NAMES[shown.value.month0]!)

function shiftMonth(delta: number) {
  const total = shown.value.year * 12 + shown.value.month0 + delta
  const y = Math.floor(total / 12)
  monthKey.value = monthKeyOf(y, total - y * 12)
}
function goToday() {
  monthKey.value = today.slice(0, 7)
  rm.year.value = Number(today.slice(0, 4))
}
// O mês na tela manda no ano carregado (a API devolve um ano por vez).
watch(monthKey, (key) => {
  const y = Number(key.slice(0, 4))
  if (y !== rm.year.value) rm.year.value = y
})
function shiftYear(delta: number) {
  rm.year.value += delta
  monthKey.value = monthKeyOf(rm.year.value, shown.value.month0)
}
function openMonth(key: string) {
  monthKey.value = key
  view.value = 'month'
}

// ── Próximo marco (contagem) ───────────────────────────────────────────────
const nextMilestone = computed(() => {
  const next = rm.milestones.value.find((m) => m.date >= today && m.type === 'MILESTONE') ?? rm.milestones.value.find((m) => m.date >= today)
  if (!next) return null
  const band = testBands([next])[0]
  const inTest = band ? band.start <= today && band.end >= today : false
  return { m: next, diff: daysBetween(today, next.date), inTest }
})

// ── Dialog de item e marco ─────────────────────────────────────────────────
const dialogOpen = ref(false)
const dialogTarget = ref<ItemDialogTarget | null>(null)

function defaultAddDate(): string {
  // No mês corrente, hoje; em outro mês, o dia 1 dele.
  return monthKey.value === today.slice(0, 7) ? today : `${monthKey.value}-01`
}
function openAdd(date?: string, tab: 'entry' | 'milestone' = view.value === 'year' ? 'milestone' : 'entry') {
  dialogTarget.value = { kind: 'new', date: date ?? defaultAddDate(), tab }
  dialogOpen.value = true
}
function openEntry(entry: RoadmapEntry, key: string) {
  dialogTarget.value = { kind: 'entry', entry, monthKey: key }
  dialogOpen.value = true
}
function openMilestone(milestone: RoadmapMilestoneDto) {
  dialogTarget.value = { kind: 'milestone', milestone }
  dialogOpen.value = true
}

async function onSaveEntry(input: EntryInput, done: (ok: boolean) => void) {
  const target = dialogTarget.value
  const ok =
    target?.kind === 'entry' ? await rm.updateEntry(target.entry, target.monthKey, input) : await rm.addEntry(input)
  done(ok)
  // Leva a pessoa ao mês do item: ela acabou de marcar algo ali.
  if (ok && view.value === 'month') monthKey.value = input.date.slice(0, 7)
}
async function onSaveMilestone(input: MilestoneInput, done: (ok: boolean) => void) {
  const target = dialogTarget.value
  done(await rm.saveMilestone(input, target?.kind === 'milestone' ? target.milestone.id : undefined))
}
async function onRemove(done: (ok: boolean) => void) {
  const target = dialogTarget.value
  if (target?.kind === 'entry') done(await rm.removeEntry(target.monthKey, target.entry.id))
  else if (target?.kind === 'milestone') done(await rm.removeMilestone(target.milestone.id))
  else done(false)
}

// ── Exportar, compartilhar, gerar ──────────────────────────────────────────
const printing = ref(false)
const printKeys = ref<string[]>([])
const printMonths = computed(() => printKeys.value.map((k) => rm.monthByKey(k)).filter((m) => m !== undefined))
const companyName = computed(() => workspace.activeCompany?.name ?? 'Nevo')

function printLocal(keys: string[]) {
  printKeys.value = keys
  printing.value = true
  document.body.classList.add('roadmap-printing')
  const cleanup = () => {
    printing.value = false
    document.body.classList.remove('roadmap-printing')
  }
  window.addEventListener('afterprint', cleanup, { once: true })
  requestAnimationFrame(() => {
    window.print()
    window.setTimeout(cleanup, 1000)
  })
}
function exportMonth() {
  printLocal([monthKey.value])
}
async function exportYear() {
  if (await rm.downloadYearPdf()) return
  const withContent = rm.months.value
    .filter((m) => m.main || m.entries.length || m.focusItems.length || (m.deliveries ?? []).length)
    .map((m) => m.key)
  printLocal(withContent.length ? withContent : [monthKey.value])
}

const aiOpen = ref(false)
const aiPrompt = ref('')
const aiBusy = ref(false)
async function runAi() {
  const prompt = aiPrompt.value.trim()
  if (!prompt) return
  aiBusy.value = true
  const ok = await rm.generate(prompt)
  aiBusy.value = false
  if (ok) {
    aiPrompt.value = ''
    aiOpen.value = false
  }
}
const helpOpen = ref(false)

// ── Teclado: ← → trocam o mês, T volta para hoje, N adiciona ───────────────
function onKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
  const el = event.target as HTMLElement | null
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
  if (document.querySelector('[role="dialog"][aria-modal="true"], [role="menu"]')) return
  if (view.value === 'month' && event.key === 'ArrowLeft') shiftMonth(-1)
  else if (view.value === 'month' && event.key === 'ArrowRight') shiftMonth(1)
  else if (event.key === 't' || event.key === 'T') goToday()
  else if ((event.key === 'n' || event.key === 'N') && rm.canEdit.value) openAdd()
  else return
  event.preventDefault()
}

onMounted(() => {
  void rm.load()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.classList.remove('roadmap-printing')
})
</script>

<template>
  <section class="rv">
    <header class="rv-bar">
      <div class="rv-seg" role="tablist" aria-label="Visão do roadmap">
        <button
          type="button"
          role="tab"
          :aria-selected="view === 'month'"
          class="rv-seg-btn"
          :class="{ 'rv-seg-btn--on': view === 'month' }"
          @click="view = 'month'"
        >
          Mês
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="view === 'year'"
          class="rv-seg-btn"
          :class="{ 'rv-seg-btn--on': view === 'year' }"
          @click="view = 'year'"
        >
          Ano
        </button>
      </div>

      <div class="rv-nav">
        <button
          type="button"
          class="rv-icon"
          :aria-label="view === 'month' ? 'Mês anterior' : 'Ano anterior'"
          :title="view === 'month' ? 'Mês anterior (←)' : 'Ano anterior'"
          @click="view === 'month' ? shiftMonth(-1) : shiftYear(-1)"
        >
          <ChevronLeft :size="17" />
        </button>
        <h1 class="rv-title" aria-live="polite">
          <template v-if="view === 'month'">{{ monthTitle }} <span>{{ shown.year }}</span></template>
          <template v-else>{{ rm.year.value }}</template>
        </h1>
        <button
          type="button"
          class="rv-icon"
          :aria-label="view === 'month' ? 'Próximo mês' : 'Próximo ano'"
          :title="view === 'month' ? 'Próximo mês (→)' : 'Próximo ano'"
          @click="view === 'month' ? shiftMonth(1) : shiftYear(1)"
        >
          <ChevronRight :size="17" />
        </button>
        <button
          v-if="view === 'month' ? monthKey !== today.slice(0, 7) : rm.year.value !== Number(today.slice(0, 4))"
          type="button"
          class="rv-btn rv-btn--ghost"
          title="Voltar para hoje (T)"
          @click="goToday"
        >
          Hoje
        </button>
      </div>

      <button
        v-if="nextMilestone"
        type="button"
        class="rv-next"
        :class="{ 'rv-next--test': nextMilestone.inTest }"
        :title="`${nextMilestone.m.title} em ${formatDayMonth(nextMilestone.m.date)}`"
        :aria-label="`Próximo marco: ${nextMilestone.m.title}, ${formatDayMonth(nextMilestone.m.date)}, ${relativeDays(nextMilestone.diff)}`"
        @click="openMilestone(nextMilestone.m)"
      >
        <CalendarCheck v-if="nextMilestone.m.type === 'REVIEW'" :size="14" aria-hidden="true" />
        <Flag v-else :size="14" aria-hidden="true" />
        <span class="rv-next-title">{{ nextMilestone.m.title }}</span>
        <span class="rv-next-when">
          {{ nextMilestone.inTest ? 'em teste, sai ' : '' }}{{ relativeDays(nextMilestone.diff) }}
        </span>
      </button>

      <span class="rv-spacer" />

      <div class="rv-actions">
        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <button type="button" class="rv-btn" aria-label="Exportar">
              <FileDown :size="15" aria-hidden="true" />
              <span class="rv-hide-sm">Exportar</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent class="dd-menu rv-menu" :side-offset="4" align="end">
              <DropdownMenuItem class="dd-item" @select="exportMonth">
                <FileDown :size="14" />
                <span>PDF de {{ monthTitle.toLowerCase() }}</span>
              </DropdownMenuItem>
              <DropdownMenuItem class="dd-item" @select="exportYear">
                <FileDown :size="14" />
                <span>PDF do ano de {{ rm.year.value }}</span>
              </DropdownMenuItem>
              <template v-if="rm.canEdit.value">
                <DropdownMenuSeparator class="dd-sep" />
                <DropdownMenuItem class="dd-item" @select="rm.share">
                  <Link2 :size="14" />
                  <span>Copiar link público (só leitura)</span>
                </DropdownMenuItem>
              </template>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>

        <DropdownMenuRoot>
          <DropdownMenuTrigger as-child>
            <button type="button" class="rv-icon rv-icon--box" aria-label="Mais opções do roadmap">
              <MoreHorizontal :size="16" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent class="dd-menu rv-menu" :side-offset="4" align="end">
              <DropdownMenuItem v-if="rm.canEdit.value" class="dd-item" @select="openAdd(undefined, 'milestone')">
                <Flag :size="14" />
                <span>Novo marco</span>
              </DropdownMenuItem>
              <DropdownMenuItem v-if="rm.canEdit.value" class="dd-item" @select="aiOpen = true">
                <Sparkles :size="14" />
                <span>Gerar com IA</span>
              </DropdownMenuItem>
              <DropdownMenuItem class="dd-item" @select="helpOpen = true">
                <CircleHelp :size="14" />
                <span>Como funciona</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      </div>

      <button
        v-if="rm.canEdit.value"
        type="button"
        class="rv-btn rv-btn--primary rv-add"
        title="Adicionar (N)"
        aria-label="Adicionar ao roadmap"
        @click="openAdd()"
      >
        <Plus :size="15" aria-hidden="true" />
        <span class="rv-hide-sm">Adicionar</span>
      </button>
    </header>

    <div v-if="rm.loadError.value" class="rv-error" role="alert">
      <span>{{ rm.loadError.value }}<template v-if="rm.loaded.value">. O que está na tela é a última carga.</template></span>
      <button type="button" class="rv-btn" @click="rm.load()">Tentar de novo</button>
    </div>

    <div v-if="rm.loading.value && !rm.loaded.value" class="rv-skeleton" aria-label="Carregando o roadmap">
      <Skeleton type="text" height="22px" />
      <Skeleton type="block" height="520px" />
    </div>

    <template v-else-if="rm.loaded.value">
      <RoadmapMonthView
        v-if="view === 'month'"
        :rm="rm"
        :month-key="monthKey"
        @add="(date) => openAdd(date, 'entry')"
        @open-entry="openEntry"
        @open-milestone="openMilestone"
      />
      <RoadmapYearView
        v-else
        :rm="rm"
        @open-milestone="openMilestone"
        @open-month="openMonth"
        @add-milestone="openAdd(undefined, 'milestone')"
      />
    </template>

    <RoadmapItemDialog
      v-model="dialogOpen"
      :target="dialogTarget"
      :can-edit="rm.canEdit.value"
      @save-entry="onSaveEntry"
      @save-milestone="onSaveMilestone"
      @remove="onRemove"
    />

    <AppDialog v-model="aiOpen" label="Gerar com IA" size="md" :loading="aiBusy">
      <form class="rv-dlg" @submit.prevent="runAi">
        <header class="rv-dlg-head">
          <h2>Gerar com IA</h2>
          <button type="button" class="rv-icon rv-icon--box" aria-label="Fechar" :disabled="aiBusy" @click="aiOpen = false">
            <X :size="16" />
          </button>
        </header>
        <p class="rv-dlg-text">
          Descreva objetivos, entregas e datas de {{ rm.year.value }}. O texto vira meses com objetivo, foco e agenda,
          que você ajusta depois.
        </p>
        <textarea
          v-model="aiPrompt"
          class="rv-textarea"
          rows="5"
          placeholder="Ex.: lançar a versão 1.5 no fim de novembro, com duas semanas de teste em iOS e Android antes"
          :disabled="aiBusy"
        />
        <footer class="rv-dlg-foot">
          <button type="button" class="rv-btn" :disabled="aiBusy" @click="aiOpen = false">Cancelar</button>
          <button type="submit" class="rv-btn rv-btn--primary" :disabled="aiBusy || !aiPrompt.trim()">
            <Loader2 v-if="aiBusy" :size="14" class="rv-spin" aria-hidden="true" />
            {{ aiBusy ? 'Gerando…' : 'Gerar' }}
          </button>
        </footer>
      </form>
    </AppDialog>

    <AppDialog v-model="helpOpen" label="Como funciona o roadmap" size="md">
      <div class="rv-dlg">
        <header class="rv-dlg-head">
          <h2>Como funciona o roadmap</h2>
          <button type="button" class="rv-icon rv-icon--box" aria-label="Fechar" @click="helpOpen = false">
            <X :size="16" />
          </button>
        </header>
        <ul class="rv-help">
          <li><strong>Mês</strong>: o calendário mostra os itens da agenda, as tarefas com prazo e os marcos. Clique num dia para ver tudo dele; o + do dia adiciona ali.</li>
          <li><strong>Ano</strong>: a linha do tempo junta o objetivo de cada mês, os marcos e as entregas. Q1 a Q4 dão zoom; clicar num mês abre a visão Mês.</li>
          <li><strong>Teste</strong>: um marco pode ter uma rodada de teste antes (a faixa listrada). Itens do tipo Teste marcam um dia de teste avulso. "Em teste agora" lista as tarefas em Em teste com Web, iOS e Android.</li>
          <li><strong>Tarefas</strong> entram sozinhas quando têm prazo no board; clicar abre a tarefa.</li>
          <li>Atalhos: ← e → trocam o mês, T volta para hoje, N adiciona.</li>
        </ul>
      </div>
    </AppDialog>

    <RoadmapPrint :active="printing" :months="printMonths" :milestones="rm.milestones.value" :company-name="companyName" />
  </section>
</template>

<style scoped>
.rv {
  display: grid;
  gap: 14px;
  min-height: 100%;
  padding: 20px 24px 32px;
  color: var(--text);
  align-content: start;
}
.rv-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
}
.rv-seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}
.rv-seg-btn {
  min-width: 56px;
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.rv-seg-btn--on {
  background: var(--surface);
  color: var(--accent-ink);
  box-shadow: var(--shadow-sm);
}
.rv-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.rv-title {
  min-width: 150px;
  margin: 0 4px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-align: center;
  white-space: nowrap;
}
.rv-title span {
  color: var(--text-3);
  font-weight: 600;
}
.rv-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}
.rv-icon:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}
.rv-icon--box {
  border: 1px solid var(--border);
  background: var(--surface);
}
.rv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}
.rv-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
}
.rv-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.rv-btn--ghost {
  border-color: transparent;
  background: transparent;
  color: var(--accent-ink);
}
.rv-btn--ghost:hover:not(:disabled) {
  border-color: transparent;
  background: var(--accent-soft);
}
.rv-btn--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-fg);
}
.rv-btn--primary:hover:not(:disabled) {
  border-color: var(--accent);
  filter: brightness(1.05);
}
.rv-next {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 360px;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}
.rv-next--test {
  border-color: color-mix(in srgb, var(--task-status-test) 40%, var(--border));
  background: color-mix(in srgb, var(--task-status-test) 12%, var(--surface));
  color: var(--text);
}
.rv-next-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rv-next-when {
  flex: none;
  color: var(--text-2);
  font-weight: 600;
}
.rv-spacer {
  flex: 1 1 auto;
}
.rv-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.rv-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--err) 35%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--err) 8%, var(--surface));
  color: var(--text);
  font-size: 13px;
}
.rv-skeleton {
  display: grid;
  gap: 12px;
}
.rv-dlg {
  display: grid;
  gap: 12px;
  padding: 14px 16px 16px;
}
.rv-dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.rv-dlg-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.rv-dlg-text {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
}
.rv-textarea {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  line-height: 1.45;
  resize: vertical;
}
.rv-textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.rv-dlg-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.rv-help {
  display: grid;
  gap: 10px;
  margin: 0;
  padding-left: 18px;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
}
.rv-help strong {
  color: var(--text);
}
.rv-spin {
  animation: rv-spin 0.9s linear infinite;
}
@keyframes rv-spin {
  to {
    transform: rotate(360deg);
  }
}
:global(.rv-menu) {
  min-width: 230px;
}

@media (max-width: 900px) {
  .rv {
    padding: 14px 14px 28px;
  }
}
@media (max-width: 640px) {
  .rv {
    padding: 12px 12px 24px;
    gap: 12px;
  }
  .rv-bar {
    gap: 8px;
  }
  /* Grade de duas linhas: navegação + adicionar; visão, próximo marco e menus.
     Com flex-wrap a navegação encolhia até sumir com o título. */
  .rv-bar {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'nav nav add'
      'seg next actions';
  }
  .rv-nav {
    grid-area: nav;
    min-width: 0;
  }
  .rv-title {
    min-width: 0;
    flex: 1 1 auto;
    font-size: 18px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rv-add {
    grid-area: add;
    width: 44px;
    min-height: 40px;
    padding: 0;
  }
  .rv-seg {
    grid-area: seg;
  }
  .rv-next {
    grid-area: next;
    max-width: none;
    min-height: 36px;
  }
  .rv-actions {
    grid-area: actions;
  }
  .rv-spacer {
    display: none;
  }
  .rv-hide-sm {
    display: none;
  }
  .rv-icon {
    width: 40px;
    height: 40px;
  }
  .rv-btn {
    min-height: 40px;
  }
}
@media (max-width: 400px) {
  /* Tela estreita: o chip mostra só quando ("em 23 dias"); o nome está no
     title e no aria-label, e o toque abre o marco. */
  .rv-next-title {
    display: none;
  }
  .rv-next {
    justify-content: center;
  }
  .rv-title {
    font-size: 16px;
  }
}
</style>
