<script setup lang="ts">
/**
 * Card ÚNICO de tarefa (spec board-tarefas-redesign, D4, D6 e D7), usado pelo
 * board do mês (`KanbanBoard`) e pelo `/board`. A anatomia é a do protótipo
 * aprovado pelo dono, de cima para baixo:
 *
 * 1. título 14/20 500, até 2 linhas;
 * 2. tags como ponto + texto (máx. 2 + "+N"), sem caixa;
 * 3. dívida da rotina em texto ("N atrasadas", "+N no mês"), só em card gerado;
 * 4. meta 12px: chave · regra da rotina · prazo · `3/6` · anexos · documentos,
 *    e à direita a prioridade (só Alta e Urgente) e até 2 avatares.
 *
 * Sem capa, sem checklist expansível, sem anel e sem lixeira ocupando espaço:
 * excluir e mover moram no menu "…", que aparece por cima no hover sem
 * reservar largura (era a lixeira invisível que quebrava o título cedo).
 *
 * Cor só onde muda decisão: prazo vencido/perto, Alta/Urgente e o avatar.
 * Nada de borda colorida, sombra que cresce, card que sobe ou entrada animada.
 *
 * Teclado (S4): o foco do card é o foco de verdade do DOM, com contorno de 2px
 * accent por dentro. A tecla E chega como o evento `task-card-rename` (quem
 * dispara é o `useTaskKeyboard`) e abre o mesmo campo do duplo clique; Enter
 * grava, Esc desfaz e o foco volta para o card, para J/K continuarem dali.
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import {
  CalendarDays,
  FileText,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Repeat,
  Trash2,
} from 'lucide-vue-next'
import { tagColorVar, type TagLike } from '@/components/ui/tag-palette'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import { ACTIVITY_STATUSES, dueSignal, prioritySpec } from '@/features/tasks/task-meta'
import type { ActivityStatus } from '@/features/tasks/activity-types'
import { isOccurrenceId } from '@/features/tasks/recurring/recurrence-types'
import { TASK_CARD_RENAME_EVENT } from '@/features/tasks/composables/useTaskKeyboard'

/** `color` é CHAVE de paleta (`blue`), nunca hex; `null` = cor pelo slug. */
export interface TaskCardTag extends TagLike {
  color: string | null
}

// Shape do payload do board do mês (o mais rico). O `/board` adapta o dele para
// este formato; campos opcionais porque cada chamador manda o que a API dele tem.
export interface TaskCardTask {
  id: string
  title?: string
  priorityNumber?: number
  dueDate?: string | null
  responsibles?: Array<{ userId?: string; user: { id?: string; name: string } }>
  subtasks?: Array<{ id: string; title: string; status: string }>
  attachments?: Array<{ filename: string; url: string; mimeType?: string | null }>
  /** A API devolve a linha da pivot; o card quer a tag. */
  tags?: Array<{ tag: TaskCardTag }>
  /** Contadores, nunca o conteúdo: markdown de spec não trafega em board. */
  _count?: { docs?: number; attachments?: number }
  /** Rótulo da regra que gerou o card ("Toda semana · seg"). Só em card de rotina. */
  recurrence?: string
  /** Outras datas da mesma regra no mês, fora do quadro ("+N no mês"). */
  recurrenceHidden?: number
  /** Dessas, quantas já venceram sem ninguém tocar ("N atrasadas"). */
  recurrenceOverdue?: number
}

const props = withDefaults(
  defineProps<{
    task: TaskCardTask
    /** Coluna onde o card está: pinta o "concluído" e monta o "Mover para". */
    status: ActivityStatus
    /** `PJ-K7Q2XM`. `null` no card virtual de rotina, que não existe no banco. */
    taskKey?: string | null
    /** Sem menu, sem renomear e sem arrastar (quem não é da empresa). */
    readonly?: boolean
    renamable?: boolean
    deletable?: boolean
    /**
     * Contexto da chave (o `/board` passa a empresa). Vai no tooltip da chave e
     * no nome acessível do card, não em texto: por extenso ("PetJourney") ele
     * quebrava a linha de meta em quase todo card, e o prefixo da chave (PJ, SR)
     * já diz de qual empresa a tarefa é.
     */
    context?: string | null
    /** Com valor, as tags viram botões de filtro e estas ficam marcadas. */
    activeTags?: string[] | null
    /** O `/board` usa arraste HTML5: o card de origem vira o lugar vazio. */
    dragging?: boolean
    /**
     * Card otimista da criação inline: o POST ainda não voltou. Sem chave, sem
     * menu, sem arrastar e sem abrir (a tarefa ainda não existe no servidor).
     */
    pending?: boolean
    /**
     * Dono da linha no "Agrupar: Pessoa" (id ou nome): o avatar dele sai do
     * card, que a linha já diz de quem é. Os outros responsáveis continuam.
     */
    omitPerson?: string | null
  }>(),
  {
    taskKey: null,
    readonly: false,
    renamable: true,
    deletable: true,
    context: null,
    activeTags: null,
    dragging: false,
    pending: false,
    omitPerson: null,
  },
)

const emit = defineEmits<{
  open: []
  rename: [title: string]
  delete: []
  move: [status: ActivityStatus]
  /** "N atrasadas" e "+N no mês" levam à Agenda; quem chama decide. */
  'show-occurrences': []
  tag: [slug: string]
}>()

const MAX_TAGS = 2
const MAX_AVATARS = 2

const isDone = computed(() => props.status === 'DONE')
const isVirtual = computed(() => isOccurrenceId(props.task.id))
const title = computed(() => props.task.title ?? '')

const tags = computed(() => (props.task.tags ?? []).map((link) => link.tag))
const shownTags = computed(() => tags.value.slice(0, MAX_TAGS))
const extraTags = computed(() => tags.value.slice(MAX_TAGS))

const people = computed(() =>
  (props.task.responsibles ?? [])
    .filter(
      (r) =>
        !props.omitPerson ||
        ((r.userId ?? r.user.id) !== props.omitPerson && r.user.name !== props.omitPerson),
    )
    .map((r) => ({ id: r.userId ?? r.user.id ?? null, name: r.user.name })),
)
const shownPeople = computed(() => people.value.slice(0, MAX_AVATARS))
const extraPeople = computed(() => people.value.slice(MAX_AVATARS).map((p) => p.name))

const due = computed(() => dueSignal(props.task.dueDate, isDone.value))
const priority = computed(() => prioritySpec(props.task.priorityNumber))

const subtasks = computed(() => {
  const list = props.task.subtasks ?? []
  if (!list.length) return null
  return { done: list.filter((s) => s.status === 'DONE').length, total: list.length }
})

// `_count` é o que a API manda agora; o array carregado é a rede para payload antigo.
const attachmentCount = computed(
  () => props.task._count?.attachments ?? props.task.attachments?.length ?? 0,
)
const docCount = computed(() => props.task._count?.docs ?? 0)

const tagsInteractive = computed(() => props.activeTags !== null)

const ariaLabel = computed(() =>
  [props.context, props.taskKey, title.value].filter(Boolean).join(' '),
)

// ── Menu "…" ──
const menuOpen = ref(false)
const moveTargets = computed(() => ACTIVITY_STATUSES.filter((s) => s.value !== props.status))
const hasMenu = computed(() => !props.readonly && !props.pending)

// ── Título: duplo clique edita no lugar ──
const editing = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
const root = ref<HTMLElement | null>(null)
const canRename = computed(() => !props.readonly && props.renamable && !props.pending)

/**
 * Clique abre a tarefa; duplo clique NO TÍTULO edita. Os dois disputam o mesmo
 * gesto: o primeiro clique de um duplo clique abria o detalhe e a página saía
 * antes do segundo chegar, então renomear nunca acontecia. O clique no título
 * espera o intervalo de um duplo clique antes de abrir; no resto do card (e no
 * Enter do teclado) abre na hora.
 */
const DOUBLE_CLICK_MS = 220
let openTimer: ReturnType<typeof setTimeout> | null = null

function clearOpenTimer() {
  if (openTimer) clearTimeout(openTimer)
  openTimer = null
}

function onCardClick(e: MouseEvent) {
  if (editing.value || props.pending) return
  const onTitle = (e.target as HTMLElement | null)?.closest('.card__title')
  if (onTitle && canRename.value) {
    clearOpenTimer()
    if (e.detail > 1) return // segundo clique do duplo: quem responde é o dblclick
    openTimer = setTimeout(() => {
      openTimer = null
      emit('open')
    }, DOUBLE_CLICK_MS)
    return
  }
  emit('open')
}

onBeforeUnmount(clearOpenTimer)

function onOpenKey() {
  if (!props.pending) emit('open')
}

async function startEditing(e?: Event) {
  if (!canRename.value) return
  e?.stopPropagation()
  clearOpenTimer()
  draft.value = title.value
  editing.value = true
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function commitEdit() {
  if (!editing.value) return
  const next = draft.value.trim()
  editing.value = false
  if (next && next !== title.value) emit('rename', next)
}

function cancelEdit() {
  editing.value = false
}

/** Enter e Esc no campo devolvem o foco ao card (o blur só grava). */
function refocusCard() {
  void nextTick(() => root.value?.focus({ preventScroll: true }))
}

function commitFromKey() {
  commitEdit()
  refocusCard()
}

function cancelFromKey() {
  cancelEdit()
  refocusCard()
}
</script>

<template>
  <article
    ref="root"
    class="card"
    :class="{
      'card--done': isDone,
      'card--readonly': readonly,
      'card--menu-open': menuOpen,
      'card--pending': pending,
      'no-drag': pending,
      'drag-ghost': dragging,
    }"
    :data-id="task.id"
    role="button"
    tabindex="0"
    :aria-label="ariaLabel"
    :aria-busy="pending || undefined"
    :aria-keyshortcuts="canRename ? 'E' : undefined"
    @click="onCardClick"
    @keydown.enter.self="onOpenKey"
    @keydown.space.self.prevent="onOpenKey"
    v-on="{ [TASK_CARD_RENAME_EVENT]: startEditing }"
  >
    <input
      v-if="editing"
      ref="input"
      v-model="draft"
      class="card__title-input no-drag"
      aria-label="Título da tarefa"
      @click.stop
      @keydown.enter.prevent="commitFromKey"
      @keydown.esc.stop.prevent="cancelFromKey"
      @blur="commitEdit"
    />
    <h3 v-else class="card__title" :title="title" @dblclick="startEditing">{{ title }}</h3>

    <!-- Tags: ponto na cor da tag + texto neutro. Sem caixa, sem tinta. -->
    <div v-if="tags.length" class="card__tags">
      <template v-if="tagsInteractive">
        <button
          v-for="tag in shownTags"
          :key="tag.id"
          type="button"
          class="tag tag--button no-drag"
          :class="{ 'tag--on': activeTags?.includes(tag.slug) }"
          :style="{ '--tc': tagColorVar(tag) }"
          :aria-pressed="!!activeTags?.includes(tag.slug)"
          :title="`Filtrar por ${tag.name}`"
          @click.stop="emit('tag', tag.slug)"
        >
          <span class="tag__dot" aria-hidden="true" />
          <span class="tag__name">{{ tag.name }}</span>
        </button>
      </template>
      <template v-else>
        <span v-for="tag in shownTags" :key="tag.id" class="tag" :style="{ '--tc': tagColorVar(tag) }">
          <span class="tag__dot" aria-hidden="true" />
          <span class="tag__name">{{ tag.name }}</span>
        </span>
      </template>
      <span v-if="extraTags.length" class="tag tag--more" :title="extraTags.map((t) => t.name).join(', ')">
        +{{ extraTags.length }}
      </span>
    </div>

    <!-- Dívida da rotina, em texto. "Atrasadas" vem antes: é a que muda o que
         a pessoa faz agora. As duas levam à Agenda, onde as datas estão. -->
    <div v-if="task.recurrenceOverdue || task.recurrenceHidden" class="card__rec">
      <button
        v-if="task.recurrenceOverdue"
        type="button"
        class="rec-link rec-link--late no-drag"
        :title="`${task.recurrenceOverdue} data(s) desta rotina já venceram sem ninguém encostar. Ver na Agenda.`"
        @click.stop="emit('show-occurrences')"
      >
        {{ task.recurrenceOverdue }} {{ task.recurrenceOverdue === 1 ? 'atrasada' : 'atrasadas' }}
      </button>
      <button
        v-if="task.recurrenceHidden"
        type="button"
        class="rec-link no-drag"
        :title="`Mais ${task.recurrenceHidden} data(s) desta rotina neste mês. Ver na Agenda.`"
        @click.stop="emit('show-occurrences')"
      >
        +{{ task.recurrenceHidden }} no mês
      </button>
    </div>

    <div class="card__meta">
      <span class="card__facts">
        <span
          v-if="taskKey"
          class="mi card__key"
          :title="context ? `${context} · ${taskKey}` : taskKey"
        >
          {{ taskKey }}
        </span>
        <span v-if="task.recurrence" class="mi mi--rule" :title="`Repete: ${task.recurrence}`">
          <Repeat :size="12" :stroke-width="1.6" aria-hidden="true" />
          <span class="mi__text">{{ task.recurrence }}</span>
        </span>
        <span
          v-if="due"
          class="mi"
          :class="due.tone ? `mi--${due.tone}` : null"
          :title="`Prazo: ${due.full}`"
        >
          <CalendarDays :size="12" :stroke-width="1.6" aria-hidden="true" />
          {{ due.label }}
        </span>
        <span
          v-if="subtasks"
          class="mi"
          :title="`${subtasks.done} de ${subtasks.total} subtarefas concluídas`"
        >
          <ListChecks :size="12" :stroke-width="1.6" aria-hidden="true" />
          {{ subtasks.done }}/{{ subtasks.total }}
        </span>
        <span v-if="attachmentCount" class="mi" :title="`${attachmentCount} arquivo(s)`">
          <Paperclip :size="12" :stroke-width="1.6" aria-hidden="true" />
          {{ attachmentCount }}
        </span>
        <span v-if="docCount" class="mi" :title="`${docCount} documento(s)`">
          <FileText :size="12" :stroke-width="1.6" aria-hidden="true" />
          {{ docCount }}
        </span>
      </span>

      <span class="card__side">
        <span
          v-if="priority.signal"
          class="card__prio"
          role="img"
          :aria-label="`Prioridade ${priority.label}`"
          :title="`Prioridade ${priority.label}`"
        >
          <component :is="priority.icon" :size="14" />
        </span>
        <span v-if="people.length" class="avatars">
          <PersonAvatar
            v-for="(person, i) in shownPeople"
            :id="person.id"
            :key="`${i}-${person.id ?? person.name}`"
            class="avatar"
            :name="person.name"
            :size="20"
            ring
            :title="person.name"
          />
          <span v-if="extraPeople.length" class="avatar avatar--more" :title="extraPeople.join(', ')">
            +{{ extraPeople.length }}
          </span>
        </span>
      </span>
    </div>

    <DropdownMenuRoot v-if="hasMenu" v-model:open="menuOpen">
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="card__more no-drag"
          :aria-label="`Mais ações de ${taskKey ?? title}`"
          @click.stop
          @keydown.enter.stop
          @keydown.space.stop
        >
          <MoreHorizontal :size="14" :stroke-width="2" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="dd-menu task-card-menu" :side-offset="4" align="end">
          <DropdownMenuItem
            v-for="target in moveTargets"
            :key="target.value"
            class="dd-item"
            @select="emit('move', target.value)"
          >
            <component :is="target.icon" :size="14" />
            <span>Mover para {{ target.label }}</span>
          </DropdownMenuItem>
          <template v-if="deletable">
            <DropdownMenuSeparator class="dd-sep" />
            <DropdownMenuItem class="dd-item dd-item--danger" @select="emit('delete')">
              <Trash2 :size="14" :stroke-width="1.6" />
              <span>{{ isVirtual ? 'Dispensar esta data' : 'Excluir tarefa' }}</span>
            </DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </article>
</template>

<style scoped>
/* Superfície: no escuro, card na --surface com fio de 1px e sem sombra; no
   claro, branco com a sombra `raised` do Atlassian. Os dois vêm do mesmo token
   (--shadow-raised), então o card não muda de tamanho entre os temas. */
.card {
  position: relative;
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-raised);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--motion-ease);
}

/* Hover só sobe um degrau de fundo. Nada de levantar ou crescer sombra. */
.card:hover {
  background: var(--surface-2);
}

/* Foco por dentro, para não sumir atrás do vizinho nem do poço. O
   `data-kbd-focus` é o foco que o J/K/setas põem por script: nem todo
   navegador acende o :focus-visible quando o foco vem de um focus(). */
.card:focus-visible,
.card[data-kbd-focus]:focus {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Otimista: ainda sem resposta do servidor. Só esmaece, sem animação. */
.card--pending {
  opacity: 0.64;
  cursor: progress;
}

.card--pending:hover {
  background: var(--surface);
}

.card--readonly {
  cursor: default;
}

/* ── Título ── */
.card__title {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* Título sem espaço ("aaaa…") não tem onde quebrar e empurraria o card. */
  overflow-wrap: anywhere;
}

.card--done .card__title {
  color: var(--text-2);
}

.card__title-input {
  width: calc(100% + 8px);
  margin: -2px -4px;
  padding: 1px 3px;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius-xs);
  outline: none;
  min-width: 0;
}

/* ── Tags: ponto + texto ── */
.card__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  min-width: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-2);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
}

.tag__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tc);
  flex: none;
}

.tag__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag--more {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.tag--button {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: var(--radius-xs);
}

.tag--button:hover .tag__name {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.tag--button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.tag--on .tag__name {
  color: var(--text);
  font-weight: 600;
}

/* ── Rotina: dívida em texto ── */
.card__rec {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}

.rec-link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  border-radius: var(--radius-xs);
}

.rec-link:hover {
  color: var(--text-2);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Laranja, não vermelho: o vermelho é do prazo vencido DESTE card, e dois
   vermelhos apagariam a diferença entre "venceu" e "outras ficaram para trás". */
.rec-link--late,
.rec-link--late:hover {
  color: var(--due-soon);
}

.rec-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* ── Meta ── */
.card__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}

/* Os fatos cedem quebrando linha; as pessoas à direita nunca encolhem. */
.card__facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.mi {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mi svg {
  flex: none;
}

.card__key {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0;
}

.mi--rule {
  min-width: 0;
  max-width: 100%;
}

.mi__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mi--late {
  color: var(--due-late);
}

.mi--soon {
  color: var(--due-soon);
}

.card__side {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.card__prio {
  display: inline-flex;
}

/* ── Avatares: PersonAvatar de 20px (foto ou iniciais no tom), sem anel colorido ── */
/* O disco de 20px sobra 2px para cima e para baixo da linha de 16px, sobre o
   padding do card: sem isso a linha de meta cresceria 4px em todo card.
   As iniciais de 10px são a ÚNICA letra abaixo de 12px do card, de propósito:
   duas iniciais num disco de 20px. O nome inteiro está no title. Aumentar o
   disco para 24px custaria 8px de altura em todo card. */
.avatars {
  display: flex;
  align-items: center;
  margin-block: -2px;
  /* O aro na cor do card separa os discos sobrepostos sem cor extra. */
  --pa-ring-color: var(--surface);
}

.card:hover .avatars {
  --pa-ring-color: var(--surface-2);
}

.avatar + .avatar {
  margin-left: -4px;
}

.avatar--more {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  box-shadow: 0 0 0 1.5px var(--pa-ring-color);
  font-size: 10px;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  user-select: none;
}

/* ── "…": por cima do canto, sem reservar espaço no título ── */
.card__more {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
}

.card:hover .card__more,
.card:focus-within .card__more,
.card--menu-open .card__more {
  opacity: 1;
  pointer-events: auto;
}

.card__more:hover {
  color: var(--text);
  background: var(--surface-2);
}

.card__more:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

/* Tela de toque não tem hover: o "…" fica sempre à vista. */
@media (hover: none) {
  .card__more {
    opacity: 1;
    pointer-events: auto;
  }
}

/* ── Arraste (classes do Sortable no board do mês; `dragging` no /board) ──
   O card escolhido ganha só a sombra de overlay: nada de girar ou crescer.
   O lugar de soltar é um slot vazio na altura do card, tracejado. */
.card.drag-chosen {
  box-shadow: var(--shadow-overlay);
  cursor: grabbing;
}

.card.drag-ghost {
  background: transparent;
  box-shadow: none;
  outline: 1px dashed var(--border-strong);
  outline-offset: -1px;
}

.card.drag-ghost > * {
  visibility: hidden;
}
</style>

<!-- Global: o menu é portalado para o <body> e o scoped não viaja junto. O
     skin vem de styles/menus.css; aqui só a largura. -->
<style>
.task-card-menu {
  min-width: 210px;
}
</style>
