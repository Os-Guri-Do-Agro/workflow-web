<script setup lang="ts">
/**
 * TaskPicker — seletor de tarefa do Meu tempo (spec time-selecao-de-tarefa-e-som).
 *
 * Substitui a lista plana do `ActivitySelect` por um menu que segue a mesma
 * organização do resto do produto: trimestre → mês → tarefa. Três decisões que
 * definem o comportamento:
 *
 * 1. **Concluída não aparece** por padrão (interruptor no rodapé, lembrado).
 *    Em empresa madura a maioria das tarefas está concluída e nunca mais recebe
 *    tempo; eram elas que enterravam a tarefa certa.
 * 2. **Busca é global**, não do nível atual: digitar procura em todos os
 *    trimestres e mostra o caminho de cada resultado.
 * 3. **Atalhos primeiro** (recentes e minhas), porque apontar tempo é
 *    repetitivo: no caso comum a tarefa certa está a um clique da abertura.
 *
 * Contrato:
 *   modelValue: string | null   (id da atividade; null = "Sem tarefa")
 *   companyId:  string | null   (empresa dona da lista; sem ela o menu não abre)
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  CircleDot,
  CircleCheck,
  CircleEllipsis,
  CornerDownRight,
  History,
  Search,
  Star,
  X,
} from 'lucide-vue-next'
import { useUiStore } from '@/stores/uiStores'
import {
  monthLabel,
  normalize,
  recentTaskIds,
  rememberTask,
  useTaskPicker,
  type FlatTask,
} from '@/composables/useTaskPicker'
import type { PickerStatus } from '@/service/activities/activity-service'

const props = withDefaults(
  defineProps<{
    modelValue: string | null
    companyId: string | null
    placeholder?: string
    label?: string
    density?: 'compact' | 'comfortable'
    disabled?: boolean
    /**
     * `hero` transforma o gatilho no TÍTULO da barra do timer: texto grande,
     * sem moldura de campo, ocupando a largura. Existe porque a tarefa passou a
     * ser o título da entrada (spec banco-de-horas) — manter o seletor pequeno
     * ao lado de um título repetido seria mostrar a mesma informação duas vezes.
     */
    variant?: 'field' | 'hero'
    /**
     * Nome já conhecido da tarefa selecionada, usado quando a árvore não a
     * contém (carregando, concluída, de outra empresa). Ver `triggerLabel`.
     */
    fallbackTitle?: string | null
  }>(),
  {
    placeholder: 'Sem tarefa',
    label: 'Tarefa',
    density: 'comfortable',
    disabled: false,
    variant: 'field',
    fallbackTitle: null,
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const ui = useUiStore()
const companyId = computed(() => props.companyId)
const picker = useTaskPicker(companyId)

const open = ref(false)
const query = ref('')
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

/**
 * O menu vai para o `body` por `Teleport`, posicionado em `fixed` — mesma
 * solução do `TagInput`, pelo mesmo motivo: os seletores vivem dentro de
 * cartões com `overflow: hidden` (a linha de edição de entrada em `.tv-group` é
 * um deles), e ali um menu `absolute` era recortado pela metade. Posicionar
 * contra a viewport tira o menu de qualquer contexto de recorte, ao custo de
 * reposicionar no scroll.
 */
const menuStyle = ref<Record<string, string>>({})

const MENU_HEIGHT = 420

function placeMenu(): void {
  const anchor = rootRef.value
  if (!anchor) return
  const rect = anchor.getBoundingClientRect()
  const vh = window.innerHeight
  const MARGEM = 12

  // O gatilho pode estar fora da tela (linha lá embaixo na lista de entradas, ou
  // scroll depois de abrir). Sem prender o cálculo à área visível, o menu era
  // ancorado num ponto invisível e saía inteiro pelo rodapé.
  const topo = Math.min(Math.max(rect.top, MARGEM), vh - MARGEM)
  const base = Math.min(Math.max(rect.bottom, MARGEM), vh - MARGEM)

  const abaixo = vh - base - 8
  const acima = topo - 8
  // Só abre para cima quando não cabe embaixo E cabe melhor em cima: campo no
  // rodapé abriria um menu de dois itens.
  const paraCima = abaixo < Math.min(MENU_HEIGHT, 260) && acima > abaixo
  const espaco = Math.max(160, paraCima ? acima : abaixo)

  const largura = Math.max(rect.width, 320)
  // Não deixa vazar pela direita em campo estreito colado na borda.
  const left = Math.min(Math.round(rect.left), window.innerWidth - largura - MARGEM)

  menuStyle.value = {
    left: `${Math.max(MARGEM, left)}px`,
    width: `${Math.round(largura)}px`,
    maxHeight: `${Math.round(Math.min(MENU_HEIGHT, espaco))}px`,
    ...(paraCima
      ? { bottom: `${Math.round(Math.max(MARGEM, vh - topo + 6))}px` }
      : { top: `${Math.round(Math.min(base + 6, vh - MARGEM))}px` }),
  }
}

// `capture: true`: o scroll costuma acontecer num container interno (a lista de
// entradas), e scroll não sobe por bubbling.
function watchViewport(ligar: boolean): void {
  const metodo = ligar ? 'addEventListener' : 'removeEventListener'
  window[metodo]('scroll', placeMenu, true)
  window[metodo]('resize', placeMenu)
}

/** Nível aberto: raiz (atalhos + trimestres) → trimestre → mês. */
const openQuarterId = ref<string | null>(null)
const openMonthId = ref<string | null>(null)
const activeIndex = ref(0)

const showDone = computed({
  get: () => ui.pickerShowDone,
  set: (v: boolean) => (ui.pickerShowDone = v),
})

// ─── Dados derivados ──────────────────────────────────────────────────────────

const visible = (task: FlatTask) => showDone.value || task.status !== 'DONE'

const selected = computed(() =>
  props.modelValue ? (picker.byId.value.get(props.modelValue) ?? null) : null,
)

const triggerLabel = computed(() => {
  if (!props.modelValue) return props.placeholder
  if (selected.value) return selected.value.title
  // A árvore do seletor pode não conter a tarefa: ela ainda está carregando, foi
  // concluída (ficam ocultas), ou pertence a outra empresa. Quando quem chama
  // sabe o nome — a própria entrada de tempo traz `activity.title` do servidor —
  // ele vale mais que qualquer aviso. Sem isso, o título do trabalho em
  // andamento aparecia como "Tarefa indisponível" na barra do timer.
  if (props.fallbackTitle) return props.fallbackTitle
  return picker.isLoading.value ? 'Carregando…' : 'Tarefa indisponível'
})

const triggerPath = computed(() =>
  selected.value ? `${selected.value.quarterLabel} · ${selected.value.monthName}` : '',
)

const openQuarter = computed(
  () => picker.tree.value?.quarters.find((q) => q.id === openQuarterId.value) ?? null,
)

const openMonth = computed(
  () => openQuarter.value?.months.find((m) => m.id === openMonthId.value) ?? null,
)

/** Contagem por trimestre respeitando o filtro de concluídas. */
function quarterCount(quarterId: string): number {
  return picker.flat.value.filter((t) => t.quarterId === quarterId && visible(t)).length
}

function monthCount(monthId: string): number {
  return picker.flat.value.filter((t) => t.monthId === monthId && visible(t)).length
}

const searching = computed(() => query.value.trim().length > 0)

/** Busca global: todas as palavras precisam aparecer no título ou no pai. */
const results = computed<FlatTask[]>(() => {
  const terms = normalize(query.value).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return picker.flat.value
    .filter(visible)
    .filter((task) => {
      const haystack = normalize(`${task.title} ${task.parentTitle ?? ''}`)
      return terms.every((term) => haystack.includes(term))
    })
    .slice(0, 60)
})

const recents = computed<FlatTask[]>(() =>
  recentTaskIds(props.companyId)
    .map((id) => picker.byId.value.get(id))
    .filter((t): t is FlatTask => !!t && visible(t)),
)

const mine = computed<FlatTask[]>(() =>
  picker.flat.value.filter((t) => t.isMine && t.status !== 'DONE').slice(0, 8),
)

const monthTasks = computed<FlatTask[]>(() =>
  picker.flat.value.filter((t) => t.monthId === openMonthId.value && visible(t)),
)

/**
 * Linhas navegáveis do nível atual, na ordem em que aparecem. É o que o teclado
 * percorre; cada uma sabe o que fazer no Enter.
 */
type Row = (
  | { kind: 'none' }
  | { kind: 'task'; task: FlatTask }
  | { kind: 'quarter'; id: string; label: string }
  | { kind: 'month'; id: string; label: string }
) & {
  /** Cabeçalho a desenhar ANTES desta linha (a primeira de cada grupo). */
  section?: 'recent' | 'mine' | 'quarters'
}

const rows = computed<Row[]>(() => {
  if (searching.value) return results.value.map((task) => ({ kind: 'task', task }))

  if (openMonthId.value) return monthTasks.value.map((task) => ({ kind: 'task', task }))

  if (openQuarterId.value) {
    return (openQuarter.value?.months ?? []).map((m) => ({
      kind: 'month',
      id: m.id,
      label: monthLabel(m.number, m.name),
    }))
  }

  // Raiz: atalhos primeiro (o caso comum é repetir a tarefa de ontem), depois a
  // estrutura completa. O cabeçalho viaja na primeira linha de cada grupo, para
  // o template não precisar recalcular posições.
  const mineWithoutRecents = mine.value.filter(
    (t) => !recents.value.some((r) => r.id === t.id),
  )
  const quarters = picker.tree.value?.quarters ?? []

  return [
    { kind: 'none' },
    ...recents.value.map((task, i) => ({
      kind: 'task' as const,
      task,
      ...(i === 0 ? { section: 'recent' as const } : {}),
    })),
    ...mineWithoutRecents.map((task, i) => ({
      kind: 'task' as const,
      task,
      ...(i === 0 ? { section: 'mine' as const } : {}),
    })),
    ...quarters.map((q, i) => ({
      kind: 'quarter' as const,
      id: q.id,
      label: q.label,
      ...(i === 0 ? { section: 'quarters' as const } : {}),
    })),
  ]
})

const emptyMessage = computed(() => {
  if (picker.isError.value) return 'Não foi possível carregar as tarefas'
  if (picker.isLoading.value) return 'Carregando tarefas…'
  if (searching.value) return `Nada encontrado para "${query.value.trim()}"`
  if (openMonthId.value) return 'Nenhuma tarefa aberta neste mês'
  return 'Nenhuma tarefa nesta empresa'
})

/**
 * Quantas tarefas o filtro de concluídas está escondendo AQUI (no mês aberto ou
 * na busca). É o que transforma um vazio mudo em uma saída: "só está vazio
 * porque tudo aqui já foi concluído".
 */
const hiddenDoneCount = computed(() => {
  if (showDone.value) return 0
  const terms = normalize(query.value).split(/\s+/).filter(Boolean)
  return picker.flat.value.filter((task) => {
    if (task.status !== 'DONE') return false
    if (terms.length) {
      const haystack = normalize(`${task.title} ${task.parentTitle ?? ''}`)
      return terms.every((term) => haystack.includes(term))
    }
    if (openMonthId.value) return task.monthId === openMonthId.value
    return false
  }).length
})

// ─── Ações ────────────────────────────────────────────────────────────────────

function toggle() {
  if (props.disabled) return
  if (open.value) close()
  else show()
}

function show() {
  open.value = true
  query.value = ''
  activeIndex.value = 0
  // Traz o gatilho para a área visível antes de medir: é o que um select nativo
  // faz, e evita abrir o menu preso a uma âncora fora da tela.
  triggerRef.value?.scrollIntoView({ block: 'nearest' })
  void nextTick(placeMenu)
  watchViewport(true)
  // Reabrir já no mês da tarefa escolhida: continuar de onde parou vale mais do
  // que voltar à raiz toda vez.
  openQuarterId.value = selected.value?.quarterId ?? null
  openMonthId.value = selected.value?.monthId ?? null
  // Tarefa criada agora em outra tela precisa aparecer aqui.
  picker.refresh()
  void nextTick(() => searchRef.value?.focus())
}

function close(focusTrigger = false) {
  open.value = false
  query.value = ''
  watchViewport(false)
  if (focusTrigger) void nextTick(() => triggerRef.value?.focus())
}

function choose(id: string | null) {
  emit('update:modelValue', id)
  rememberTask(props.companyId, id)
  close(true)
}

function enterQuarter(id: string) {
  openQuarterId.value = id
  openMonthId.value = null
  activeIndex.value = 0
}

function enterMonth(id: string) {
  openMonthId.value = id
  activeIndex.value = 0
}

/** Um nível para trás; na raiz, fecha. */
function back() {
  if (searching.value) {
    query.value = ''
    return
  }
  if (openMonthId.value) {
    openMonthId.value = null
  } else if (openQuarterId.value) {
    openQuarterId.value = null
  } else {
    close(true)
    return
  }
  activeIndex.value = 0
}

function activate(row: Row) {
  if (row.kind === 'none') return choose(null)
  if (row.kind === 'task') return choose(row.task.id)
  if (row.kind === 'quarter') return enterQuarter(row.id)
  return enterMonth(row.id)
}

// ─── Teclado ──────────────────────────────────────────────────────────────────

function move(delta: number) {
  const total = rows.value.length
  if (!total) return
  activeIndex.value = (activeIndex.value + delta + total) % total
  void nextTick(() => {
    listRef.value
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    const row = rows.value[activeIndex.value]
    if (row) activate(row)
    return
  }
  if (event.key === 'ArrowRight') {
    const row = rows.value[activeIndex.value]
    if (row && (row.kind === 'quarter' || row.kind === 'month')) {
      event.preventDefault()
      activate(row)
    }
    return
  }
  // Backspace só volta de nível quando não há texto para apagar.
  if (event.key === 'ArrowLeft' || (event.key === 'Backspace' && !query.value)) {
    if (openQuarterId.value || openMonthId.value || searching.value) {
      event.preventDefault()
      back()
    }
  }
}

// Busca reposiciona a seleção do teclado no primeiro resultado.
watch(query, () => (activeIndex.value = 0))

// Trocar de nível muda a altura do menu; sem recolocar, o modo "abre para cima"
// fica preso na altura de um instante anterior.
watch([rows, openQuarterId, openMonthId], () => {
  if (open.value) void nextTick(placeMenu)
})

// Trocar de empresa invalida o caminho aberto.
watch(
  () => props.companyId,
  () => {
    openQuarterId.value = null
    openMonthId.value = null
  },
)

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return
  const target = event.target as Node | null
  if (!target) return
  // O menu está teleportado: não basta olhar o root.
  if (rootRef.value?.contains(target) || menuRef.value?.contains(target)) return
  close()
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocumentPointerDown, true)
  else document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

// Desmontar com o menu aberto é rotina aqui (a linha de edição do /time some ao
// salvar): sem isto sobraria um listener global por ciclo.
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  watchViewport(false)
})

// ─── Aparência ────────────────────────────────────────────────────────────────

const STATUS_META: Record<PickerStatus, { icon: unknown; token: string; label: string }> = {
  TODO: { icon: CircleDashed, token: 'var(--status-todo)', label: 'A fazer' },
  IN_PROGRESS: { icon: CircleDot, token: 'var(--status-prog)', label: 'Em andamento' },
  IN_TESTING: { icon: CircleEllipsis, token: 'var(--status-test)', label: 'Em teste' },
  DONE: { icon: CircleCheck, token: 'var(--status-done)', label: 'Concluída' },
}
</script>

<template>
  <div
    ref="rootRef"
    class="tp"
    :class="{ 'tp--compact': density === 'compact', 'tp--hero': variant === 'hero' }"
  >
    <button
      ref="triggerRef"
      type="button"
      class="tp-trigger"
      :class="{ 'tp-trigger--open': open, 'tp-trigger--empty': !modelValue }"
      :disabled="disabled || !companyId"
      :aria-label="label"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown.down.prevent="show()"
    >
      <span class="tp-trigger-text">
        <span class="tp-trigger-title">{{ triggerLabel }}</span>
        <span v-if="triggerPath" class="tp-trigger-path">{{ triggerPath }}</span>
      </span>
      <ChevronDown :size="15" class="tp-chevron" />
    </button>

    <Teleport to="body">
      <Transition name="tp-pop">
        <div
          v-if="open"
          ref="menuRef"
          class="tp-menu"
          :style="menuStyle"
          role="dialog"
          :aria-label="label"
          @keydown="onKeydown"
        >
        <!-- Busca: sempre no topo, sempre global -->
        <div class="tp-search">
          <Search :size="14" class="tp-search-icon" />
          <input
            ref="searchRef"
            v-model="query"
            class="tp-search-input"
            type="text"
            placeholder="Buscar em todas as tarefas…"
            :aria-label="'Buscar tarefa'"
          />
          <button
            v-if="query"
            class="tp-search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="query = ''"
          >
            <X :size="13" />
          </button>
        </div>

        <!-- Caminho: só fora da busca, e só quando entrou em algum nível -->
        <div v-if="!searching && (openQuarterId || openMonthId)" class="tp-crumbs">
          <button class="tp-crumb-back" type="button" @click="back">
            <ChevronLeft :size="14" />
          </button>
          <button class="tp-crumb" type="button" @click="((openQuarterId = null), (openMonthId = null))">
            Tudo
          </button>
          <template v-if="openQuarter">
            <ChevronRight :size="12" class="tp-crumb-sep" />
            <button class="tp-crumb" type="button" @click="openMonthId = null">
              {{ openQuarter.label }}
            </button>
          </template>
          <template v-if="openMonth">
            <ChevronRight :size="12" class="tp-crumb-sep" />
            <span class="tp-crumb tp-crumb--current">
              {{ monthLabel(openMonth.number, openMonth.name) }}
            </span>
          </template>
        </div>

        <div ref="listRef" class="tp-list" role="listbox" :aria-label="label">
          <div v-if="!rows.length" class="tp-empty">
            <p class="tp-empty-text">{{ emptyMessage }}</p>
            <button
              v-if="hiddenDoneCount"
              class="tp-empty-action"
              type="button"
              @click="showDone = true"
            >
              Mostrar {{ hiddenDoneCount }}
              {{ hiddenDoneCount === 1 ? 'concluída' : 'concluídas' }}
            </button>
          </div>

          <template v-for="(row, index) in rows" :key="index">
            <!-- "Sem tarefa" -->
            <button
              v-if="row.kind === 'none'"
              class="tp-row"
              type="button"
              role="option"
              :aria-selected="modelValue === null"
              :data-active="activeIndex === index"
              @mousemove="activeIndex = index"
              @click="choose(null)"
            >
              <span class="tp-row-icon"><CircleDashed :size="14" /></span>
              <span class="tp-row-main">
                <span class="tp-row-title">Sem tarefa</span>
              </span>
              <Check v-if="modelValue === null" :size="14" class="tp-row-check" />
            </button>

            <template v-else>
              <!-- Cabeçalho do grupo: viaja na primeira linha dele -->
              <p v-if="row.section === 'recent'" class="tp-section">
                <History :size="11" /> Recentes
              </p>
              <p v-else-if="row.section === 'mine'" class="tp-section">
                <Star :size="11" /> Minhas tarefas
              </p>
              <p v-else-if="row.section === 'quarters'" class="tp-section">Trimestres</p>

              <!-- Tarefa -->
              <button
                v-if="row.kind === 'task'"
                class="tp-row"
                type="button"
                role="option"
                :aria-selected="modelValue === row.task.id"
                :data-active="activeIndex === index"
                @mousemove="activeIndex = index"
                @click="choose(row.task.id)"
              >
                <span class="tp-row-icon" :style="{ color: STATUS_META[row.task.status].token }">
                  <component :is="STATUS_META[row.task.status].icon" :size="14" />
                </span>
                <span class="tp-row-main">
                  <span v-if="row.task.parentTitle" class="tp-row-parent">
                    <CornerDownRight :size="10" />
                    {{ row.task.parentTitle }}
                  </span>
                  <span class="tp-row-title">{{ row.task.title }}</span>
                  <span v-if="searching || row.task.isSubtask" class="tp-row-path">
                    {{ row.task.quarterLabel }} · {{ row.task.monthName }}
                  </span>
                </span>
                <Check v-if="modelValue === row.task.id" :size="14" class="tp-row-check" />
              </button>

              <!-- Trimestre / mês -->
              <button
                v-else-if="row.kind === 'quarter' || row.kind === 'month'"
                class="tp-row tp-row--group"
                type="button"
                role="option"
                :aria-selected="false"
                :data-active="activeIndex === index"
                @mousemove="activeIndex = index"
                @click="activate(row)"
              >
                <span class="tp-row-main">
                  <span class="tp-row-title">{{ row.label }}</span>
                </span>
                <span class="tp-row-count">
                  {{ row.kind === 'quarter' ? quarterCount(row.id) : monthCount(row.id) }}
                </span>
                <ChevronRight :size="14" class="tp-row-chevron" />
              </button>
            </template>
          </template>
        </div>

          <div class="tp-footer">
            <label class="tp-toggle">
              <input v-model="showDone" type="checkbox" class="tp-toggle-input" />
              <span class="tp-toggle-box"><Check :size="11" /></span>
              <span>Mostrar concluídas</span>
            </label>
            <span v-if="picker.isFetching.value" class="tp-footer-hint">atualizando…</span>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.tp {
  position: relative;
  width: 100%;
}

.tp-trigger {
  width: 100%;
  min-height: 44px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.tp--compact .tp-trigger {
  min-height: 38px;
}

/*
 * Variante do título da barra do timer: o gatilho VIRA o campo principal.
 * Sem moldura e sem fundo, para ler como texto e não como select — mas continua
 * sendo um botão, então ganha realce no hover e no foco.
 */
.tp--hero .tp-trigger {
  min-height: 44px;
  padding: 6px 10px;
  border-color: transparent;
  background: transparent;
  font-size: 15px;
  font-weight: 650;
}

.tp--hero .tp-trigger:hover:not(:disabled),
.tp--hero .tp-trigger--open {
  border-color: var(--border);
  background: var(--surface-2);
}

.tp--hero .tp-trigger-title {
  font-size: 15px;
  font-weight: 650;
  color: var(--text);
}

.tp--hero .tp-trigger-path {
  font-size: 11.5px;
}

.tp-trigger:hover:not(:disabled),
.tp-trigger--open {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.tp-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tp-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tp-trigger--empty .tp-trigger-title {
  color: var(--text-3);
}

.tp-trigger-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tp-trigger-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tp-trigger-path {
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 600;
}

.tp-chevron {
  flex: none;
  color: var(--text-3);
}

.tp-menu {
  /* Teleportado para o `body`: `fixed` + posição calculada no JS (ver placeMenu). */
  position: fixed;
  z-index: 220;
  max-width: calc(100vw - 24px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  overflow: hidden;
}

.tp-search {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-bottom: 1px solid var(--border);
}

.tp-search-icon {
  flex: none;
  color: var(--text-4);
}

.tp-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
}

.tp-search-input::placeholder {
  color: var(--text-4);
}

.tp-search-clear {
  flex: none;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
}

.tp-search-clear:hover {
  background: var(--surface-2);
  color: var(--text-2);
}

.tp-crumbs {
  flex: none;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.tp-crumb-back {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.tp-crumb-back:hover {
  background: var(--surface-3);
  color: var(--text);
}

.tp-crumb {
  border: none;
  background: transparent;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.tp-crumb:hover {
  color: var(--text);
}

.tp-crumb--current {
  color: var(--text);
  cursor: default;
}

.tp-crumb-sep {
  color: var(--text-4);
}

.tp-list {
  /* `min-height: 0` é o que faz o `max-height` do menu valer: item flex não
     encolhe abaixo do próprio conteúdo por padrão, e sem isto a lista estourava
     o rodapé da tela em viewport baixa. */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 5px;
}

.tp-section {
  margin: 8px 8px 3px;
  color: var(--text-4);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tp-row {
  width: 100%;
  min-height: 38px;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.tp-row[data-active='true'] {
  background: var(--surface-2);
}

.tp-row:hover {
  background: var(--surface-2);
}

.tp-row-icon {
  flex: none;
  display: inline-flex;
  color: var(--text-4);
}

.tp-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tp-row-title {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tp-row-parent {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tp-row-path {
  color: var(--text-4);
  font-size: 10px;
}

.tp-row-check {
  flex: none;
  color: var(--accent);
}

.tp-row-count {
  flex: none;
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}

.tp-row--group[data-active='true'] .tp-row-count,
.tp-row--group:hover .tp-row-count {
  background: var(--surface-3);
}

.tp-row-chevron {
  flex: none;
  color: var(--text-4);
}

.tp-empty {
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}

.tp-empty-text {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}

.tp-empty-action {
  padding: 6px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 650;
  cursor: pointer;
}

.tp-empty-action:hover {
  background: var(--surface-3);
  color: var(--text);
}

.tp-footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 11px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

.tp-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
  user-select: none;
}

.tp-toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.tp-toggle-box {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--surface);
  color: transparent;
}

.tp-toggle-input:checked + .tp-toggle-box {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.tp-toggle-input:focus-visible + .tp-toggle-box {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tp-footer-hint {
  color: var(--text-4);
  font-size: 10px;
}

.tp-pop-enter-active,
.tp-pop-leave-active {
  transition:
    opacity var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.tp-pop-enter-from,
.tp-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.99);
}
</style>
