<script setup lang="ts">
/**
 * Protótipo de tarefas recorrentes — `/recorrentes`.
 *
 * PROTÓTIPO com dados fictícios: nenhuma requisição sai desta tela. Ela existe
 * para fechar o DESENHO antes de existir contrato de backend, e responde a três
 * coisas que hoje são trabalho manual no board do mês:
 *
 * 1. **Fixas do mês** — as tarefas que ficam paradas em "Em teste" o mês
 *    inteiro e são recopiadas na virada. Aqui elas são um modelo com repetição
 *    mensal: reaparecem sozinhas, no status certo, sem ninguém copiar nada.
 * 2. **Status na criação** — tarefa que já nasce "Em andamento" não precisa ser
 *    criada e depois arrastada.
 * 3. **Mês derivado do prazo** — mudar a data leva a tarefa para o mês da data.
 *    Não existe seletor de mês para discordar dela.
 *
 * Três abas, uma pergunta cada: *quando cai?* (Agenda), *como fica no quadro?*
 * (Board), *o que está programado?* (Modelos). O board usa o `KanbanBoard` de
 * verdade de propósito — o valor da prova é a recorrente ser indistinguível de
 * uma tarefa comum depois de nascer.
 */
import { computed, ref } from 'vue'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FlaskConical,
  Info,
  Layers,
  Plus,
  Repeat,
} from 'lucide-vue-next'
import KanbanBoard, { type KanbanTask } from '@/components/tasks/KanbanBoard.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { dateOnlyToUtcNoonIso } from '@/utils/date'
import type { ActivityStatus } from '../activity-types'
import type { RecurringOccurrence, RecurringTemplate } from './recurrence-types'
import { monthKeyOf, monthLabel, shiftMonthKey, today } from './recurrence-engine'
import { useRecurringTasks } from './useRecurringTasks'
import RecurringAgenda from './components/RecurringAgenda.vue'
import RecurringTaskDialog from './components/RecurringTaskDialog.vue'
import RecurringTemplateCard from './components/RecurringTemplateCard.vue'

const { success: showSuccess, info: showInfo } = useToast()

const monthKey = ref(monthKeyOf(today()))

const {
  templates,
  monthOccurrences,
  monthlyFixed,
  scheduled,
  byStatus,
  createTemplate,
  updateTemplate,
  removeTemplate,
  toggleActive,
  moveToMonth,
  setOccurrenceStatus,
  skipOccurrence,
  restoreOccurrence,
  resetOccurrence,
  templateById,
  countInMonth,
  countRuleInMonth,
} = useRecurringTasks(monthKey)

// ── Navegação de mês ─────────────────────────────────────────────────────────

const monthTitle = computed(() => monthLabel(monthKey.value))
const isCurrentMonth = computed(() => monthKey.value === monthKeyOf(today()))

const stepMonth = (delta: number) => {
  monthKey.value = shiftMonthKey(monthKey.value, delta)
}

// ── Abas ─────────────────────────────────────────────────────────────────────

type Tab = 'agenda' | 'board' | 'templates'
const tab = ref<Tab>('agenda')

const TABS: { value: Tab; label: string; icon: typeof CalendarDays }[] = [
  { value: 'agenda', label: 'Agenda', icon: CalendarDays },
  { value: 'board', label: 'Board do mês', icon: Columns3 },
  { value: 'templates', label: 'Modelos', icon: Layers },
]

// ── Board: ocorrência no formato que o KanbanBoard já consome ─────────────────

/**
 * O card do board é a ocorrência, não o modelo.
 *
 * `id` carrega a data (`templateId|YYYY-MM-DD`), então arrastar afeta SÓ aquele
 * dia: mover a segunda-feira para "Concluído" não pode dar a semana inteira
 * como feita. `dueDate` vai ao meio-dia UTC pela mesma convenção do resto do
 * app (`utils/date.ts`), senão o card mostra o dia anterior em fuso negativo.
 */
const toKanbanTask = (occurrence: RecurringOccurrence): KanbanTask => ({
  id: occurrence.id,
  title: occurrence.title,
  priorityNumber: occurrence.priorityNumber,
  dueDate: dateOnlyToUtcNoonIso(occurrence.date),
  responsibles: occurrence.assignees.map((name) => ({ user: { name } })),
  tags: occurrence.tags.map((tag) => ({ tag })),
  subtasks: occurrence.subtasks.map((sub, i) => ({
    id: `${occurrence.id}#${i}`,
    title: sub.title,
    status: 'TODO',
  })),
})

const boardColumns = computed(() => ({
  TODO: byStatus.value.TODO.map(toKanbanTask),
  IN_PROGRESS: byStatus.value.IN_PROGRESS.map(toKanbanTask),
  IN_TESTING: byStatus.value.IN_TESTING.map(toKanbanTask),
  DONE: byStatus.value.DONE.map(toKanbanTask),
}))

const handleMove = (payload: { taskId: string; status: string }) => {
  setOccurrenceStatus(payload.taskId, payload.status as ActivityStatus)
}

/** Renomear no board muda o MODELO: o título é dele, não de uma data. */
const handleRename = (taskId: string, title: string) => {
  const [templateId] = taskId.split('|')
  if (!templateId) return
  updateTemplate(templateId, { title })
  showInfo('Título alterado no modelo — vale para todas as repetições')
}

const handleDeleteFromBoard = (task: KanbanTask) => {
  skipOccurrence(task.id)
  showInfo('Dispensada só neste dia. A repetição continua valendo.')
}

// ── Pulso do mês ─────────────────────────────────────────────────────────────

const pulse = computed(() => [
  { key: 'TODO', label: 'A fazer', token: 'var(--status-todo)', count: byStatus.value.TODO.length },
  { key: 'IN_PROGRESS', label: 'Em andamento', token: 'var(--status-prog)', count: byStatus.value.IN_PROGRESS.length },
  { key: 'IN_TESTING', label: 'Em teste', token: 'var(--status-test)', count: byStatus.value.IN_TESTING.length },
  { key: 'DONE', label: 'Concluído', token: 'var(--status-done)', count: byStatus.value.DONE.length },
])

const total = computed(() => monthOccurrences.value.length)

// ── Criação / edição ─────────────────────────────────────────────────────────

const dialog = ref(false)
const editing = ref<RecurringTemplate | null>(null)

const openCreate = () => {
  editing.value = null
  dialog.value = true
}

const openEdit = (template: RecurringTemplate) => {
  editing.value = template
  dialog.value = true
}

/** Clicar numa ocorrência abre o MODELO dela: é lá que a regra mora. */
const openFromOccurrence = (occurrence: RecurringOccurrence) => {
  const template = templateById(occurrence.templateId)
  if (template) openEdit(template)
}

const handleSave = (draft: Omit<RecurringTemplate, 'id' | 'createdAt'>) => {
  if (editing.value) {
    updateTemplate(editing.value.id, draft)
    showSuccess('Modelo atualizado')
  } else {
    createTemplate(draft)
    showSuccess('Tarefa criada')
  }
  // A tarefa nova pode cair em outro mês, porque o prazo manda. Se NADA dela
  // aparece no mês aberto, vai para o mês do prazo: deixar a pessoa olhando uma
  // tela onde nada mudou parece que o salvamento falhou.
  if (countRuleInMonth(draft.rule) === 0) monthKey.value = monthKeyOf(draft.rule.startDate)
  editing.value = null
}

/** Muda o prazo do modelo para o mês seguinte — o mês vem junto, sem recopiar. */
const handleMoveToNextMonth = (template: RecurringTemplate) => {
  const target = shiftMonthKey(monthKey.value, 1)
  const landed = moveToMonth(template.id, target)
  if (landed) showSuccess(`Prazo movido — a tarefa foi para ${monthLabel(landed)}`)
}

// ── Exclusão ─────────────────────────────────────────────────────────────────

const confirmDelete = ref(false)
const toDelete = ref<RecurringTemplate | null>(null)

const deleteMessage = computed(
  () =>
    `"${toDelete.value?.title ?? ''}" para de gerar tarefas, e as alterações feitas nas datas dele neste protótipo são descartadas.`,
)

const askDelete = (template: RecurringTemplate) => {
  toDelete.value = template
  confirmDelete.value = true
}

const doDelete = () => {
  if (!toDelete.value) return
  removeTemplate(toDelete.value.id)
  confirmDelete.value = false
  toDelete.value = null
  showSuccess('Modelo excluído')
}
</script>

<template>
  <div class="rec-page">
    <!-- Header -->
    <header class="rec-header">
      <div class="rec-heading">
        <p class="rec-eyebrow">
          <FlaskConical :size="11" />
          Protótipo · dados fictícios
        </p>
        <h1 class="rec-title">{{ monthTitle }}</h1>
        <div class="rec-meta">
          <span class="rec-sub">
            {{ total }} {{ total === 1 ? 'ocorrência' : 'ocorrências' }} ·
            {{ templates.length }} {{ templates.length === 1 ? 'modelo' : 'modelos' }}
          </span>
          <template v-if="total > 0">
            <div
              class="pulse"
              role="img"
              :aria-label="pulse.map((s) => `${s.count} ${s.label}`).join(', ')"
            >
              <span
                v-for="seg in pulse"
                v-show="seg.count > 0"
                :key="seg.key"
                class="pulse__seg"
                :style="{ flexGrow: seg.count, background: seg.token }"
                :title="`${seg.count} ${seg.label}`"
              />
            </div>
          </template>
        </div>
      </div>

      <div class="header-actions">
        <div class="month-nav">
          <button class="nav-btn press" aria-label="Mês anterior" @click="stepMonth(-1)">
            <ChevronLeft :size="15" />
          </button>
          <button
            class="nav-today press"
            :disabled="isCurrentMonth"
            @click="monthKey = monthKeyOf(today())"
          >
            Hoje
          </button>
          <button class="nav-btn press" aria-label="Próximo mês" @click="stepMonth(1)">
            <ChevronRight :size="15" />
          </button>
        </div>

        <div class="view-toggle">
          <button
            v-for="item in TABS"
            :key="item.value"
            class="view-btn"
            :class="{ active: tab === item.value }"
            @click="tab = item.value"
          >
            <component :is="item.icon" :size="14" />
            {{ item.label }}
          </button>
        </div>

        <button class="new-btn press" @click="openCreate">
          <Plus :size="15" />
          Nova tarefa
        </button>
      </div>
    </header>

    <!-- Explicação do protótipo: o que ele está provando -->
    <div class="proto-note">
      <Info :size="14" class="proto-icon" />
      <p>
        As tarefas abaixo <strong>não foram criadas à mão</strong>: elas saem das regras de
        repetição. Navegue para o mês que vem — as fixas e as semanais já estão lá, no status em
        que nascem. Nada aqui é gravado no servidor.
      </p>
    </div>

    <div class="rec-body">
      <!-- Agenda -->
      <RecurringAgenda
        v-if="tab === 'agenda'"
        :month-key="monthKey"
        :scheduled="scheduled"
        :fixed="monthlyFixed"
        @open="openFromOccurrence"
        @skip="skipOccurrence($event.id)"
        @restore="restoreOccurrence($event.id)"
        @reset="resetOccurrence($event.id)"
      />

      <!-- Board -->
      <div v-else-if="tab === 'board'" class="board-wrap">
        <EmptyState
          v-if="total === 0"
          :icon="Repeat"
          title="Nenhuma ocorrência neste mês"
          description="Nenhuma regra cai neste mês. Crie uma tarefa ou navegue para outro mês."
        >
          <template #action>
            <button class="new-btn press" @click="openCreate">
              <Plus :size="15" />
              Nova tarefa
            </button>
          </template>
        </EmptyState>
        <KanbanBoard
          v-else
          :tasks="boardColumns"
          @move-task="handleMove"
          @rename-task="handleRename"
          @delete-task="handleDeleteFromBoard"
          @open-details="
            (task) => {
              const occurrence = monthOccurrences.find((o) => o.id === task.id)
              if (occurrence) openFromOccurrence(occurrence)
            }
          "
        />
      </div>

      <!-- Modelos -->
      <div v-else class="tpl-list">
        <EmptyState
          v-if="!templates.length"
          :icon="Layers"
          title="Nenhum modelo ainda"
          description="Um modelo guarda o texto da tarefa e a regra de repetição."
        >
          <template #action>
            <button class="new-btn press" @click="openCreate">
              <Plus :size="15" />
              Nova tarefa
            </button>
          </template>
        </EmptyState>

        <RecurringTemplateCard
          v-for="template in templates"
          :key="template.id"
          :template="template"
          :month-key="monthKey"
          :count-in-month="countInMonth(template.id)"
          @edit="openEdit"
          @remove="askDelete"
          @toggle="toggleActive($event.id)"
          @move-to-next-month="handleMoveToNextMonth"
        />
      </div>
    </div>

    <RecurringTaskDialog v-model="dialog" :editing="editing" @save="handleSave" />

    <ConfirmDialog
      v-model="confirmDelete"
      title="Excluir modelo?"
      :message="deleteMessage"
      confirm-label="Excluir"
      danger
      @confirm="doDelete"
    />
  </div>
</template>

<style scoped>
.rec-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 18px 20px 20px;
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
}

/* ─── Header ─── */
.rec-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.rec-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-4);
}

.rec-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.025em;
  color: var(--text);
  text-transform: capitalize;
}

.rec-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 7px;
  min-height: 16px;
}

.rec-sub {
  font-size: 12.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.pulse {
  display: flex;
  gap: 2px;
  width: 160px;
  height: 5px;
  border-radius: 999px;
  overflow: hidden;
}

.pulse__seg {
  flex-basis: 0;
  min-width: 3px;
  border-radius: 999px;
  transition: flex-grow 420ms var(--motion-ease);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* ─── Navegação de mês ─── */
.month-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 9px;
}

.nav-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  color: var(--text-3);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: color var(--motion-fast), background var(--motion-fast);
}

.nav-btn:hover {
  color: var(--text);
  background: var(--surface);
}

.nav-today {
  height: 26px;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: color var(--motion-fast), background var(--motion-fast);
}

.nav-today:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface);
}

.nav-today:disabled {
  opacity: 0.4;
  cursor: default;
}

/* ─── Abas ─── */
.view-toggle {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 9px;
}

.view-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.view-btn:hover {
  color: var(--text-2);
}

.view-btn.active {
  color: var(--text);
  font-weight: 600;
  background: var(--surface);
  box-shadow: var(--shadow-sm), inset 0 0 0 1px var(--border);
}

/* ─── Botão principal ─── */
.new-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--accent-fg);
  background: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 78%, black);
  border-radius: 9px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: filter var(--motion-fast);
}

.new-btn:hover {
  filter: brightness(1.06);
}

/* ─── Nota do protótipo ─── */
.proto-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 12px;
  margin-bottom: 12px;
  background: color-mix(in srgb, var(--info) 8%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--info) 24%, var(--border));
  border-radius: var(--radius);
  flex-shrink: 0;
}

.proto-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--info);
}

.proto-note p {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
}

.proto-note strong {
  font-weight: 650;
  color: var(--text);
}

/* ─── Corpo ─── */
.rec-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.board-wrap {
  height: 100%;
  min-height: 0;
}

.tpl-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-bottom: 8px;
}
</style>
