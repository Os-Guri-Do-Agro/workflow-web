/**
 * Estado e gravações do roadmap (spec docs/specs/2026/q4/q4-2/v2-celular-roadmap-notas.md).
 *
 * Duas fontes da API, carregadas juntas:
 * - `GET /roadmap/monthly?year=` → os 12 meses (objetivo, foco, fotos, agenda),
 *   as entregas reais (tarefas com prazo) e o "Em teste agora";
 * - `GET /company/:id/roadmap` → marcos e reviews (com a janela de teste) e os
 *   totais do ano (o "sem data" só existe lá).
 *
 * Erro de carga nunca apaga o que já está na tela: zerar faria a pessoa ler
 * "nada aqui" quando o dado existe e a API é que caiu.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import roadmapMonthlyService, {
  type RoadmapCategory,
  type RoadmapDelivery,
  type RoadmapEntry,
  type RoadmapInTesting,
  type RoadmapMonth,
} from '@/service/roadmap/roadmap-monthly-service'
import roadmapMilestonesService, {
  type CreateRoadmapMilestoneInput,
  type RoadmapMilestoneDto,
} from '@/service/roadmap/roadmap-milestones-service'
import quarterService from '@/service/quarters/quarters-service'
import exportService from '@/service/export/export-service'
import shareService from '@/service/share/share-service'
import aiService from '@/service/ai/ai-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useToast } from '@/composables/useToast'
import { monthKeyOf, parseDate } from '../roadmap-meta'

export interface RoadmapTotals {
  activities: number
  completed: number
  scheduled: number
  undated: number
  overdue: number
}

export interface EntryInput {
  date: string
  title: string
  description: string | null
  category: RoadmapCategory
}

export type MilestoneInput = Required<Pick<CreateRoadmapMilestoneInput, 'title' | 'date' | 'type'>> & {
  description: string | null
  testStart: string | null
}

const EMPTY_TOTALS: RoadmapTotals = { activities: 0, completed: 0, scheduled: 0, undated: 0, overdue: 0 }

export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message
  if (Array.isArray(message)) return message.join(', ')
  return typeof message === 'string' && message ? message : fallback
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function useRoadmap() {
  const workspace = useWorkspaceStore()
  const router = useRouter()
  const { success, error: showError, info } = useToast()

  const year = ref(new Date().getFullYear())
  const months = ref<RoadmapMonth[]>([])
  const inTesting = ref<RoadmapInTesting[]>([])
  const inTestingAvailable = ref(false)
  const milestones = ref<RoadmapMilestoneDto[]>([])
  const totals = ref<RoadmapTotals>({ ...EMPTY_TOTALS })
  const loading = ref(true)
  const loaded = ref(false)
  const loadError = ref('')
  const milestonesUnavailable = ref(false)

  const companyId = computed(() => workspace.activeCompanyId ?? localStorage.getItem('activeCompany'))
  // Sem papel resolvido ainda, a tela não bloqueia: o backend é quem nega.
  const canEdit = computed(() => (workspace.activeRole ? workspace.canEdit : true))

  async function loadMonths() {
    const response = await roadmapMonthlyService.getYear(year.value)
    months.value = response.months.map((month) => ({
      ...month,
      focusItems: [...month.focusItems].sort((a, b) => a.order - b.order),
      entries: [...month.entries],
      photos: [...month.photos],
      deliveries: [...(month.deliveries ?? [])],
    }))
    inTestingAvailable.value = Array.isArray(response.inTesting)
    inTesting.value = response.inTesting ?? []
  }

  async function loadMilestones() {
    const id = companyId.value
    if (!id) return
    try {
      const payload = (await quarterService.getCompanyRoadMap(id)) as Record<string, unknown>
      milestones.value = asArray<RoadmapMilestoneDto>(payload?.milestones)
        .filter((m) => m && typeof m.date === 'string')
        .map((m) => ({ ...m, testStart: m.testStart ?? null }))
      const t = (payload?.totals ?? {}) as Partial<RoadmapTotals>
      totals.value = { ...EMPTY_TOTALS, ...t }
      milestonesUnavailable.value = false
    } catch {
      milestonesUnavailable.value = true
    }
  }

  async function load() {
    loading.value = true
    try {
      await Promise.all([loadMonths(), loadMilestones()])
      loadError.value = ''
      loaded.value = true
    } catch (err) {
      loadError.value = apiErrorMessage(err, 'Não foi possível carregar o roadmap')
    } finally {
      loading.value = false
    }
  }

  /** Recarrega sem piscar a tela (depois de gravar algo que muda o derivado). */
  async function refresh() {
    try {
      await Promise.all([loadMonths(), loadMilestones()])
      loadError.value = ''
    } catch {
      /* o que está na tela continua valendo */
    }
  }

  watch(year, () => void load())
  watch(companyId, (now, before) => {
    if (now && now !== before) void load()
  })

  function monthByKey(key: string): RoadmapMonth | undefined {
    return months.value.find((m) => m.key === key)
  }

  async function ensureMonthId(key: string): Promise<string> {
    const local = monthByKey(key)
    if (local?.id) return local.id
    const { year: y, month0 } = parseDate(`${key}-01`)
    const ensured = await roadmapMonthlyService.ensureMonth({ key, year: y, month: month0 })
    if (!ensured.id) throw new Error('A API não devolveu o id do mês.')
    if (local) {
      local.id = ensured.id
      local.persisted = true
      local.title = ensured.title
    }
    return ensured.id
  }

  // ── Agenda ────────────────────────────────────────────────────────────────

  async function addEntry(input: EntryInput): Promise<boolean> {
    const key = input.date.slice(0, 7)
    try {
      const monthId = await ensureMonthId(key)
      const created = await roadmapMonthlyService.addEntry(monthId, {
        date: input.date,
        title: input.title,
        description: input.description,
        category: input.category,
        source: input.category === 'note' ? 'quick_note' : 'manual',
      })
      monthByKey(key)?.entries.push(created)
      success('Item adicionado ao roadmap')
      return true
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível salvar o item'))
      return false
    }
  }

  /** A API leva o item para o mês da data nova; aqui a lista local acompanha. */
  async function updateEntry(entry: RoadmapEntry, fromKey: string, input: EntryInput): Promise<boolean> {
    const from = monthByKey(fromKey)
    if (!from?.id) return false
    try {
      const updated = await roadmapMonthlyService.updateEntry(from.id, entry.id, {
        date: input.date,
        title: input.title,
        description: input.description,
        category: input.category,
      })
      from.entries = from.entries.filter((e) => e.id !== entry.id)
      const toKey = updated.date.slice(0, 7)
      const target = monthByKey(toKey)
      if (target) {
        target.entries.push(updated)
        if (!target.id && updated.monthId) {
          target.id = updated.monthId
          target.persisted = true
        }
      }
      success(toKey !== fromKey ? 'Item movido de mês' : 'Item atualizado')
      return true
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível atualizar o item'))
      return false
    }
  }

  async function removeEntry(monthKey: string, entryId: string): Promise<boolean> {
    const month = monthByKey(monthKey)
    if (!month?.id) return false
    try {
      await roadmapMonthlyService.removeEntry(month.id, entryId)
      month.entries = month.entries.filter((e) => e.id !== entryId)
      success('Item removido')
      return true
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível remover o item'))
      return false
    }
  }

  // ── Objetivo, foco e fotos do mês ────────────────────────────────────────

  async function updateMain(monthKey: string, main: string): Promise<boolean> {
    const month = monthByKey(monthKey)
    if (!month) return false
    const previous = month.main
    month.main = main
    try {
      const monthId = await ensureMonthId(monthKey)
      await roadmapMonthlyService.updateMonth(monthId, { main })
      return true
    } catch (err) {
      month.main = previous
      showError(apiErrorMessage(err, 'Não foi possível salvar o objetivo'))
      return false
    }
  }

  async function addFocus(monthKey: string, text: string): Promise<boolean> {
    const month = monthByKey(monthKey)
    if (!month) return false
    try {
      const monthId = await ensureMonthId(monthKey)
      const created = await roadmapMonthlyService.addFocus(monthId, { text, order: month.focusItems.length + 1 })
      month.focusItems.push({ id: created.id, text: created.text, order: created.order })
      return true
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível salvar o foco'))
      return false
    }
  }

  async function removeFocus(monthKey: string, focusId: string): Promise<void> {
    const month = monthByKey(monthKey)
    if (!month?.id) return
    try {
      await roadmapMonthlyService.removeFocus(month.id, focusId)
      month.focusItems = month.focusItems.filter((f) => f.id !== focusId)
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível remover o foco'))
    }
  }

  async function uploadPhotos(monthKey: string, files: File[]): Promise<void> {
    const valid = files.filter((f) => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024)
    if (valid.length < files.length) info(`${files.length - valid.length} arquivo(s) ignorado(s): use imagens de até 5 MB.`)
    if (!valid.length) return
    const month = monthByKey(monthKey)
    if (!month) return
    try {
      const monthId = await ensureMonthId(monthKey)
      const photos = await roadmapMonthlyService.uploadPhotos(monthId, valid)
      month.photos.push(...photos)
      success(valid.length === 1 ? 'Imagem adicionada' : 'Imagens adicionadas')
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível enviar a imagem'))
    }
  }

  async function removePhoto(monthKey: string, photoId: string): Promise<void> {
    const month = monthByKey(monthKey)
    if (!month?.id) return
    try {
      await roadmapMonthlyService.removePhoto(month.id, photoId)
      month.photos = month.photos.filter((p) => p.id !== photoId)
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível remover a imagem'))
    }
  }

  // ── Marcos ────────────────────────────────────────────────────────────────

  async function saveMilestone(input: MilestoneInput, id?: string): Promise<boolean> {
    const company = companyId.value
    if (!company) return false
    try {
      const body = {
        title: input.title,
        date: input.date,
        type: input.type,
        description: input.description ?? '',
        testStart: input.testStart,
      }
      const saved = id
        ? await roadmapMilestonesService.update(company, id, body)
        : await roadmapMilestonesService.create(company, body)
      const row = { ...saved, testStart: saved.testStart ?? null }
      milestones.value = [...milestones.value.filter((m) => m.id !== row.id), row].sort((a, b) =>
        a.date.localeCompare(b.date),
      )
      success(id ? 'Marco atualizado' : 'Marco adicionado')
      return true
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível salvar o marco'))
      return false
    }
  }

  async function removeMilestone(id: string): Promise<boolean> {
    const company = companyId.value
    if (!company) return false
    try {
      await roadmapMilestonesService.remove(company, id)
      milestones.value = milestones.value.filter((m) => m.id !== id)
      success('Marco removido')
      return true
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível remover o marco'))
      return false
    }
  }

  // ── Ferramentas ───────────────────────────────────────────────────────────

  async function share(): Promise<void> {
    try {
      const link = await shareService.shareRoadmap(year.value)
      await navigator.clipboard.writeText(`${window.location.origin}${link.path}`)
      success('Link público do roadmap copiado')
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível compartilhar o roadmap'))
    }
  }

  /** PDF do ano pelo servidor. `false` = caiu, quem chamou abre a impressão local. */
  async function downloadYearPdf(): Promise<boolean> {
    try {
      await exportService.downloadRoadmapPdf(year.value)
      success('Download do PDF iniciado')
      return true
    } catch (err) {
      showError(apiErrorMessage(err, 'O servidor não gerou o PDF. Abrindo a impressão local.'))
      return false
    }
  }

  async function generate(prompt: string): Promise<boolean> {
    try {
      await aiService.roadmap(prompt, year.value)
      await refresh()
      success('Roadmap gerado')
      return true
    } catch (err) {
      showError(apiErrorMessage(err, 'Não foi possível gerar o roadmap'))
      return false
    }
  }

  /** Abre a tarefa no painel do board do mês dela (`?task=`), com a empresa junto. */
  function openTask(task: Pick<RoadmapDelivery, 'monthId' | 'activityId'>) {
    const company = companyId.value
    void router.push({
      path: `/tasks/${task.monthId}`,
      query: { task: task.activityId, ...(company ? { company } : {}) },
    })
  }

  const currentMonthKey = computed(() => {
    const now = new Date()
    return monthKeyOf(now.getFullYear(), now.getMonth())
  })

  return {
    year,
    months,
    inTesting,
    inTestingAvailable,
    milestones,
    totals,
    loading,
    loaded,
    loadError,
    milestonesUnavailable,
    canEdit,
    currentMonthKey,
    load,
    refresh,
    monthByKey,
    addEntry,
    updateEntry,
    removeEntry,
    updateMain,
    addFocus,
    removeFocus,
    uploadPhotos,
    removePhoto,
    saveMilestone,
    removeMilestone,
    share,
    downloadYearPdf,
    generate,
    openTask,
  }
}

export type RoadmapStore = ReturnType<typeof useRoadmap>
