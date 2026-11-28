<script setup lang="ts">
/**
 * "Meu dia" (spec v2-mobile-e-home, H1): o primeiro bloco da home. Responde a
 * pergunta de quem abre o app de manhã, inclusive pelo celular: o que é meu e
 * o que vence agora. Lista densa no padrão "Atribuído a mim" do Jira: ícone de
 * status, título, empresa, prioridade só quando muda decisão e prazo com tom.
 *
 * Cada linha abre a tarefa no painel sobre o `/board` (`?task=&company=`), que
 * funciona para tarefa de qualquer empresa sem trocar a empresa ativa.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { ArrowRight, CalendarClock, Camera, KanbanSquare, Pause, Play, Timer } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import LottiePlayer from '@/components/ui/LottiePlayer.vue'
import { useWorkspaceDashboard } from '@/composables/useWorkspaceDashboard'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useTaskTimer } from '@/composables/useTaskTimer'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import activityService from '@/service/activities/activity-service'
import { dueDatePatchValue } from '@/utils/date'
import { formatTimer } from '@/utils/duration'
import { dueSignal, prioritySpec, statusSpec } from '@/features/tasks/task-meta'
import { taskKey } from '@/features/tasks/task-key'
import {
  buildMyDay,
  myDayTaskLink,
  nextStepOf,
  postponeOptions,
  type MyDayGroupKey,
  type PostponeOption,
  type WorkspaceActivityLite,
} from '../my-day'

const { data, isLoading, isError, refetch } = useWorkspaceDashboard(ref(true))
const { me } = useCurrentUser()
const queryClient = useQueryClient()
const router = useRouter()
const { success, error: showError } = useToast()
const timer = useTaskTimer()

// ─── Ações na própria linha (spec v2-uteis, U2) ──────────────────────────────
// Avançar, adiar e ligar o timer sem abrir a tarefa. Cada chamada vai com a
// empresa da tarefa: a lista mistura empresas, e o interceptor mandaria a ativa.
const pending = ref<Set<string>>(new Set())
function markPending(id: string, on: boolean) {
  const next = new Set(pending.value)
  if (on) next.add(id)
  else next.delete(id)
  pending.value = next
}

const keyOf = (item: WorkspaceActivityLite) => taskKey({ id: item.id }, item.companyName) ?? item.title

async function refreshLists() {
  await queryClient.invalidateQueries({ queryKey: ['dashboard', 'workspace'] })
}

async function advance(item: WorkspaceActivityLite) {
  const step = nextStepOf(item.status)
  if (!step || pending.value.has(item.id)) return
  markPending(item.id, true)
  try {
    await activityService.patchActivityStatus(item.id, step.status, item.companyId)
    success(`${keyOf(item)} ${step.done}`)
    await refreshLists()
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não deu para mudar o status'))
  } finally {
    markPending(item.id, false)
  }
}

async function postpone(item: WorkspaceActivityLite, option: PostponeOption) {
  if (pending.value.has(item.id)) return
  markPending(item.id, true)
  try {
    await activityService.patchActivity(item.id, { dueDate: dueDatePatchValue(option.date) }, item.companyId)
    success(`${keyOf(item)} adiada para ${option.label.toLowerCase()}`)
    await refreshLists()
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não deu para adiar'))
  } finally {
    markPending(item.id, false)
  }
}

const postponeList = computed(() => postponeOptions())

const activities = computed<WorkspaceActivityLite[]>(
  () => ((data.value as { activities?: WorkspaceActivityLite[] } | undefined)?.activities ?? []),
)
const summary = computed(() => buildMyDay(activities.value))

/** A pessoa nunca recebeu tarefa nenhuma (nem concluída): é o dia 1 dela. */
const isNewcomer = computed(() => !activities.value.some((a) => a.isMine))

const summaryText = computed(() => {
  const { open, late, today } = summary.value
  if (open === 0) return ''
  const parts = [`${open} ${open === 1 ? 'tarefa aberta' : 'tarefas abertas'}`]
  if (late) parts.push(`${late} ${late === 1 ? 'atrasada' : 'atrasadas'}`)
  if (today) parts.push(`${today} para hoje`)
  return parts.join(', ')
})

const LIMIT = 5
const expanded = ref<Set<MyDayGroupKey>>(new Set())
function visible(key: MyDayGroupKey, items: WorkspaceActivityLite[]) {
  return expanded.value.has(key) ? items : items.slice(0, LIMIT)
}
function expand(key: MyDayGroupKey) {
  expanded.value = new Set([...expanded.value, key])
}

const firstSteps = computed(() => [
  {
    key: 'photo',
    icon: Camera,
    title: 'Coloque sua foto',
    hint: 'O time te reconhece no board e nos comentários.',
    to: '/settings#perfil',
    done: !!me.value?.avatarUrl,
  },
  {
    key: 'board',
    icon: KanbanSquare,
    title: 'Conheça o board',
    hint: 'Todas as tarefas das suas empresas num quadro só.',
    to: '/board',
    done: false,
  },
  {
    key: 'timer',
    icon: Timer,
    title: 'Ligue o cronômetro',
    hint: 'Trinta minutos de foco já garantem o seu dia na sequência.',
    to: '/time',
    done: false,
  },
])
</script>

<template>
  <section class="myday" aria-labelledby="myday-title">
    <header class="myday-head">
      <div class="myday-heading">
        <h2 id="myday-title" class="myday-title">Suas tarefas</h2>
        <p v-if="summaryText" class="myday-sum">{{ summaryText }}</p>
      </div>
      <RouterLink to="/board" class="myday-link">
        <span>Abrir o board</span>
        <ArrowRight :size="14" aria-hidden="true" />
      </RouterLink>
    </header>

    <div v-if="isLoading" class="myday-skel" aria-busy="true" aria-label="Carregando suas tarefas">
      <Skeleton v-for="n in 5" :key="n" type="row" height="20px" />
    </div>

    <div v-else-if="isError" class="myday-error" role="alert">
      <p>Não deu para carregar suas tarefas.</p>
      <button type="button" class="myday-retry" @click="refetch()">Tentar de novo</button>
    </div>

    <div v-else-if="isNewcomer" class="myday-first">
      <p class="myday-first-lead">Ainda não tem tarefa sua por aqui. Três passos para começar:</p>
      <ol class="steps">
        <li v-for="step in firstSteps" :key="step.key">
          <RouterLink :to="step.to" class="step" :class="{ 'step--done': step.done }">
            <span class="step-icon"><component :is="step.icon" :size="18" aria-hidden="true" /></span>
            <span class="step-copy">
              <span class="step-title">{{ step.title }}</span>
              <span class="step-hint">{{ step.hint }}</span>
            </span>
            <span v-if="step.done" class="step-done">Feito</span>
            <ArrowRight v-else :size="16" class="step-go" aria-hidden="true" />
          </RouterLink>
        </li>
      </ol>
    </div>

    <div v-else-if="summary.open === 0" class="myday-clear">
      <LottiePlayer src="/lottie/nevo-tudo-em-dia.json" :size="120" label="" />
      <div>
        <p class="myday-clear-title">Tudo em dia</p>
        <p class="myday-clear-desc">Nenhuma tarefa aberta com você. Quando alguém te designar, ela aparece aqui.</p>
      </div>
    </div>

    <div v-else class="groups">
      <section v-for="group in summary.groups" :key="group.key" class="group" :aria-labelledby="`myday-g-${group.key}`">
        <h3 :id="`myday-g-${group.key}`" class="group-title" :class="`group-title--${group.key}`">
          {{ group.label }}
          <span class="group-count">{{ group.items.length }}</span>
        </h3>
        <ul class="rows">
          <li
            v-for="item in visible(group.key, group.items)"
            :key="item.id"
            class="row-wrap"
            :class="{ 'row-wrap--live': timer.isRunningFor(item.id), 'row-wrap--busy': pending.has(item.id) }"
          >
            <RouterLink :to="myDayTaskLink(item)" class="row">
              <component :is="statusSpec(item.status).icon" class="row-status" :aria-label="statusSpec(item.status).label" />
              <span class="row-title">{{ item.title }}</span>
            </RouterLink>
            <!-- A meta fica fora do link para dividir a linha com as ações no
                 celular (botão dentro de <a> é HTML inválido). O clique nela abre
                 a tarefa como o resto da linha; no teclado o alvo é o link. -->
            <span class="row-meta" @click="router.push(myDayTaskLink(item))">
              <span v-if="item.companyName" class="row-company">{{ item.companyName }}</span>
              <component
                :is="prioritySpec(item.priority).icon"
                v-if="prioritySpec(item.priority).signal"
                class="row-prio"
                :aria-label="`Prioridade ${prioritySpec(item.priority).label}`"
              />
              <span
                v-if="dueSignal(item.dueDate)"
                class="row-due"
                :class="dueSignal(item.dueDate)?.tone ? `row-due--${dueSignal(item.dueDate)?.tone}` : ''"
                :title="dueSignal(item.dueDate)?.full"
              >
                {{ dueSignal(item.dueDate)?.label }}
              </span>
            </span>
            <div class="row-actions" role="group" :aria-label="`Ações de ${item.title}`">
              <button
                type="button"
                class="act act--timer"
                :class="{ 'act--on': timer.isRunningFor(item.id) }"
                :disabled="timer.busy.value"
                :aria-label="timer.isRunningFor(item.id) ? `Parar o timer de ${item.title}` : `Ligar o timer em ${item.title}`"
                :title="timer.isRunningFor(item.id) ? 'Parar o timer' : 'Ligar o timer nesta tarefa'"
                @click="timer.toggleFor({ id: item.id, title: item.title, companyId: item.companyId })"
              >
                <Pause v-if="timer.isRunningFor(item.id)" :size="14" aria-hidden="true" />
                <Play v-else :size="14" aria-hidden="true" />
                <span v-if="timer.isRunningFor(item.id)" class="act-clock">{{ formatTimer(timer.elapsedSec.value) }}</span>
              </button>
              <button
                v-if="nextStepOf(item.status)"
                type="button"
                class="act act--step"
                :disabled="pending.has(item.id)"
                :aria-label="nextStepOf(item.status)?.label"
                @click="advance(item)"
              >
                <span class="act-label">{{ nextStepOf(item.status)?.label }}</span>
                <span class="act-label-short" aria-hidden="true">{{ nextStepOf(item.status)?.short }}</span>
              </button>
              <DropdownMenuRoot>
                <DropdownMenuTrigger as-child>
                  <button
                    type="button"
                    class="act act--icon"
                    :disabled="pending.has(item.id)"
                    :aria-label="`Adiar ${item.title}`"
                    title="Adiar"
                  >
                    <CalendarClock :size="14" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuContent class="dd-menu" :side-offset="4" align="end">
                    <DropdownMenuItem
                      v-for="opt in postponeList"
                      :key="opt.key"
                      class="dd-item"
                      @select="postpone(item, opt)"
                    >
                      {{ opt.label }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuPortal>
              </DropdownMenuRoot>
            </div>
          </li>
        </ul>
        <button
          v-if="group.items.length > LIMIT && !expanded.has(group.key)"
          type="button"
          class="group-more"
          @click="expand(group.key)"
        >
          Mostrar mais {{ group.items.length - LIMIT }}
        </button>
      </section>
    </div>
  </section>
</template>

<style scoped>
.myday {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 16px 18px 12px;
  min-width: 0;
}

.myday-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.myday-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.25;
}

.myday-sum {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-3);
}

.myday-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 0 8px;
  border-radius: var(--radius-sm);
  color: var(--accent-ink);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.myday-link:hover {
  background: var(--accent-soft);
}

.myday-link:focus-visible,
.row:focus-visible,
.step:focus-visible,
.group-more:focus-visible,
.myday-retry:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.myday-skel {
  display: grid;
  gap: 12px;
  padding: 6px 0 10px;
}

.myday-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  font-size: 13px;
  color: var(--text-2);
}

.myday-error p {
  margin: 0;
}

.myday-retry,
.group-more {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  min-height: 32px;
  padding: 0 12px;
  cursor: pointer;
}

.group-more {
  margin: 2px 0 6px 30px;
  border-color: transparent;
  background: transparent;
  color: var(--accent-ink);
  padding: 0 6px;
}

.group-more:hover {
  background: var(--accent-soft);
}

.groups {
  display: grid;
  gap: 8px;
}

.group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 2px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-2);
}

.group-title--late {
  color: var(--due-late);
}

.group-count {
  font-weight: 600;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

/*
 * Linha = link da tarefa (status + título) + meta + ações. O link se estica
 * sobre a linha inteira (::after), então clicar em qualquer vão abre a tarefa;
 * meta e ações ficam por cima dele. O fundo de hover é da linha inteira.
 */
.row-wrap {
  position: relative;
  display: flex;
  align-items: center;
  column-gap: 8px;
  margin: 0 -8px;
  padding-right: 6px;
  border-radius: var(--radius-sm);
}

.row::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.row-meta,
.row-actions {
  position: relative;
  z-index: 1;
  flex: none;
}

.row-meta {
  cursor: pointer;
}

.row-wrap:hover,
.row-wrap:focus-within {
  background: var(--surface-2);
}

.row-wrap--live {
  background: var(--accent-soft);
}

.row-wrap--busy {
  opacity: 0.6;
}

.row {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
  min-height: 40px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}

/* Ações: somem até o hover/foco no desktop (densidade); com timer rodando
   ficam à vista; em tela de toque, sempre. */
.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.row-wrap:hover .row-actions,
.row-wrap:focus-within .row-actions,
.row-wrap--live .row-actions {
  opacity: 1;
}

@media (hover: none) {
  .row-actions {
    opacity: 1;
  }
}

.act {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.act:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.act:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.act:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.act--icon,
.act--timer:not(.act--on) {
  width: 30px;
  padding: 0;
  justify-content: center;
}

.act--on {
  background: var(--accent);
  border-color: transparent;
  color: var(--accent-fg);
}

.act-clock {
  font-variant-numeric: tabular-nums;
}

.act-label-short {
  display: none;
}

.row-status {
  width: 16px;
  height: 16px;
}

.row-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.row-company {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-prio {
  width: 14px;
  height: 14px;
}

.row-due {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.row-due--late {
  color: var(--due-late);
}

.row-due--soon {
  color: var(--due-soon);
}

.myday-first-lead {
  margin: 0 0 10px;
  font-size: 13.5px;
  color: var(--text-2);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.step {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  text-decoration: none;
}

.step:hover {
  border-color: var(--border-strong);
  background: var(--surface-2);
}

.step-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.step-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.step-title {
  font-size: 14px;
  font-weight: 600;
}

.step-hint {
  font-size: 12.5px;
  color: var(--text-3);
}

.step-done {
  font-size: 12px;
  font-weight: 600;
  color: var(--success);
}

.step--done .step-title {
  color: var(--text-3);
}

.step-go {
  color: var(--text-3);
}

.myday-clear {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 0 10px;
}

.myday-clear-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.myday-clear-desc {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-3);
  max-width: 46ch;
}

/*
 * Celular: título em cima (até duas linhas), empresa e prazo embaixo. Numa
 * linha só o título virava "Tela de cadastr..." e a empresa sumia.
 */
@media (max-width: 640px) {
  .myday {
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    padding: 14px 16px 10px;
  }

  /* Título ocupa a linha de cima; embaixo, empresa e prazo à esquerda
     (alinhados com o título) e as ações à direita, na MESMA fileira. Quando as
     duas coisas não cabem juntas, o flex-wrap joga as ações para baixo sozinho.
     Uma fileira só de botões por tarefa deixava a lista três vezes mais alta. */
  .row-wrap {
    flex-wrap: wrap;
    padding: 0 6px 6px 0;
  }

  .row {
    flex-basis: 100%;
    min-height: 0;
    padding: 8px 8px 2px;
  }

  .row-status {
    align-self: start;
    margin-top: 2px;
  }

  .row-title {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .row-meta {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 36px;
    padding-left: 36px;
  }

  .row-actions {
    margin-left: auto;
  }

  .act-label {
    display: none;
  }

  .act-label-short {
    display: inline;
  }

  .act {
    min-height: 36px;
  }

  .act--icon,
  .act--timer:not(.act--on) {
    width: 36px;
  }

  .group-more {
    margin-left: 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .row-actions {
    transition: none;
  }
}
</style>
