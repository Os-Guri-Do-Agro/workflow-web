<script setup lang="ts">
/**
 * Barra de massa da vista Lista (spec board-tarefas-redesign, D11). Flutua no
 * rodapé da lista com a sombra de overlay, a única elevação do board.
 *
 * Só apresenta e pergunta: quem aplica, com otimismo e rollback por item, é a
 * `TaskListView`. Cada menu devolve UMA intenção (status, prioridade, pessoa,
 * mês) e a lista decide o que mandar para cada tarefa selecionada.
 *
 * Alvos de 44px (acessibilidade 50+): os botões têm 36px de desenho e um
 * `::after` que fecha 44px sem engordar a barra.
 */
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { Check, ChevronDown, Loader2, Minus, Trash2, X } from 'lucide-vue-next'
import { avatarTone, initials } from '@/utils/avatar'
import { ACTIVITY_PRIORITIES, ACTIVITY_STATUSES, type PriorityLevel } from '../task-meta'
import type { ActivityStatus } from '../activity-types'

export interface BulkPerson {
  id: string
  name: string
  /** Quantas das selecionadas já têm a pessoa: todas, algumas ou nenhuma. */
  state: 'all' | 'some' | 'none'
}

export interface BulkMonthGroup {
  key: string
  label: string
  months: Array<{ id: string; name: string }>
}

withDefaults(
  defineProps<{
    count: number
    /** Gravação em voo: os menus ficam travados até a anterior terminar. */
    busy?: boolean
    /** Status comum a todas as selecionadas (marca o item no menu), ou `null`. */
    commonStatus?: ActivityStatus | null
    commonPriority?: PriorityLevel | null
    people?: BulkPerson[]
    monthGroups?: BulkMonthGroup[]
  }>(),
  { busy: false, commonStatus: null, commonPriority: null, people: () => [], monthGroups: () => [] },
)

const emit = defineEmits<{
  status: [status: ActivityStatus]
  priority: [level: PriorityLevel]
  person: [person: BulkPerson]
  month: [month: { id: string; name: string }]
  delete: []
  clear: []
}>()

/** Do maior para o menor: é o que se procura primeiro (mesma ordem do painel). */
const priorityOptions = [...ACTIVITY_PRIORITIES].reverse()

const personModel = (state: BulkPerson['state']) =>
  state === 'all' ? true : state === 'some' ? 'indeterminate' : false
</script>

<template>
  <div class="bulk" role="toolbar" aria-label="Ações em massa" :aria-busy="busy">
    <span class="bulk__count" aria-live="polite">
      <Loader2 v-if="busy" :size="14" :stroke-width="2" class="bulk__spin" aria-hidden="true" />
      <b>{{ count }}</b> {{ count === 1 ? 'selecionada' : 'selecionadas' }}
    </span>

    <span class="bulk__sep" aria-hidden="true" />

    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button type="button" class="bulk__btn hit" :disabled="busy">
          Status
          <ChevronDown :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="dd-menu task-bulk-menu" side="top" :side-offset="8" align="start">
          <DropdownMenuRadioGroup :model-value="commonStatus ?? ''">
            <DropdownMenuRadioItem
              v-for="option in ACTIVITY_STATUSES"
              :key="option.value"
              :value="option.value"
              class="dd-item menu-row"
              @select="emit('status', option.value)"
            >
              <component :is="option.icon" :size="14" />
              <span class="menu-row__label">{{ option.label }}</span>
              <DropdownMenuItemIndicator class="menu-row__check">
                <Check :size="14" :stroke-width="2" />
              </DropdownMenuItemIndicator>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button type="button" class="bulk__btn hit" :disabled="busy">
          Responsável
          <ChevronDown :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          class="dd-menu task-bulk-menu task-bulk-menu--list"
          side="top"
          :side-offset="8"
          align="start"
        >
          <!-- Marcado = todas as selecionadas têm a pessoa (o clique tira de
               todas); traço = algumas têm (o clique põe nas que faltam). -->
          <DropdownMenuCheckboxItem
            v-for="person in people"
            :key="person.id"
            class="dd-item menu-row"
            :model-value="personModel(person.state)"
            @select="emit('person', person)"
          >
            <span class="avatar" :style="{ '--av': avatarTone(person.name) }" aria-hidden="true">
              {{ initials(person.name) }}
            </span>
            <span class="menu-row__label">{{ person.name }}</span>
            <span class="menu-row__check" aria-hidden="true">
              <Check v-if="person.state === 'all'" :size="14" :stroke-width="2" />
              <Minus v-else-if="person.state === 'some'" :size="14" :stroke-width="2" />
            </span>
          </DropdownMenuCheckboxItem>
          <p v-if="!people.length" class="menu-empty">Carregando pessoas…</p>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button type="button" class="bulk__btn hit" :disabled="busy">
          Prioridade
          <ChevronDown :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="dd-menu task-bulk-menu" side="top" :side-offset="8" align="start">
          <DropdownMenuRadioGroup :model-value="commonPriority === null ? '' : String(commonPriority)">
            <DropdownMenuRadioItem
              v-for="option in priorityOptions"
              :key="option.value"
              :value="String(option.value)"
              class="dd-item menu-row"
              @select="emit('priority', option.value)"
            >
              <component :is="option.icon" :size="14" />
              <span class="menu-row__label">{{ option.label }}</span>
              <DropdownMenuItemIndicator class="menu-row__check">
                <Check :size="14" :stroke-width="2" />
              </DropdownMenuItemIndicator>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button type="button" class="bulk__btn hit" :disabled="busy">
          Mês
          <ChevronDown :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          class="dd-menu task-bulk-menu task-bulk-menu--list"
          side="top"
          :side-offset="8"
          align="start"
        >
          <DropdownMenuGroup v-for="group in monthGroups" :key="group.key">
            <DropdownMenuLabel class="menu-label">{{ group.label }}</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="month in group.months"
              :key="month.id"
              class="dd-item menu-row"
              @select="emit('month', month)"
            >
              <span class="menu-row__label">{{ month.name }}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <p v-if="!monthGroups.length" class="menu-empty">Carregando meses…</p>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <button type="button" class="bulk__btn bulk__btn--danger hit" :disabled="busy" @click="emit('delete')">
      <Trash2 :size="14" :stroke-width="1.8" aria-hidden="true" />
      Excluir
    </button>

    <span class="bulk__sep" aria-hidden="true" />

    <button
      type="button"
      class="bulk__icon hit"
      aria-label="Limpar seleção"
      title="Limpar seleção (Esc)"
      aria-keyshortcuts="Escape"
      @click="emit('clear')"
    >
      <X :size="16" :stroke-width="1.8" />
    </button>
  </div>
</template>

<style scoped>
.bulk {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 4px 4px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  /* Tela estreita: a barra não quebra em duas linhas; rola de lado. */
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
}

.bulk__count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 6px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.bulk__count b {
  font-weight: 600;
  color: var(--text);
}

.bulk__sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--border);
  flex: none;
}

/* 36px de desenho, 44px de alvo: o ::after cresce 4px para cima e para baixo
   por dentro do respiro da barra, sem cobrir o vizinho. */
.hit {
  position: relative;
}

.hit::after {
  content: '';
  position: absolute;
  inset: -4px 0;
}

.bulk__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  min-width: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.bulk__btn svg {
  flex: none;
  color: var(--text-3);
}

.bulk__btn:hover:not(:disabled),
.bulk__btn[data-state='open'] {
  background: var(--surface-2);
}

.bulk__btn--danger:hover:not(:disabled) {
  color: var(--err);
}

.bulk__btn--danger:hover:not(:disabled) svg {
  color: var(--err);
}

.bulk__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.bulk__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.bulk__icon.hit::after {
  inset: -4px;
}

.bulk__icon:hover {
  background: var(--surface-2);
  color: var(--text);
}

.bulk__btn:focus-visible,
.bulk__icon:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.bulk__spin {
  color: var(--text-3);
  animation: bulk-spin 0.8s linear infinite;
}

@keyframes bulk-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bulk__spin {
    animation: none;
  }
}
</style>

<!-- Global: os menus são portalados para o <body> e o scoped não viaja junto.
     O skin vem de styles/menus.css; aqui só a largura e a anatomia da linha. -->
<style>
.task-bulk-menu {
  min-width: 200px;
}

.task-bulk-menu--list {
  max-height: min(360px, 60vh);
  overflow-y: auto;
}

.task-bulk-menu .menu-row {
  min-height: 32px;
  padding: 6px 10px;
  font-size: 13px;
}

.task-bulk-menu .menu-row__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-bulk-menu .menu-row__check {
  display: grid;
  place-items: center;
  width: 14px;
  color: var(--accent);
}

.task-bulk-menu .menu-label {
  padding: 6px 10px 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
}

.task-bulk-menu .menu-empty {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-3);
}

/* Iniciais de 10px no disco de 20px: a mesma exceção aceita no card. */
.task-bulk-menu .avatar {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--av);
  color: var(--surface);
  font-size: 10px;
  font-weight: 600;
  flex: none;
}
</style>
