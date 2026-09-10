<script setup lang="ts">
/**
 * Card do MODELO (não da ocorrência): o que a pessoa escreveu uma vez.
 *
 * Mostra a regra em frase, quantas vezes ela cai no mês aberto e as próximas
 * datas. Sem a prévia, "toda semana · seg e qua" é uma promessa que só se
 * confirma esperando a semana virar — e ninguém confia numa tarefa que se cria
 * sozinha sem ver antes o que ela vai criar.
 *
 * A ação "mover para o próximo mês" mora aqui porque é a resposta direta ao
 * ritual atual: em vez de recopiar o quadro na virada, muda-se o prazo e o mês
 * vem junto.
 */
import { computed } from 'vue'
import {
  CalendarArrowDown,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Pause,
  Pencil,
  Play,
  Repeat,
  Trash2,
} from 'lucide-vue-next'
import TagChip from '@/components/ui/TagChip.vue'
import { avatarTone, initials as personInitials } from '@/utils/avatar'
import { prioritySpec, statusSpec } from '../../task-meta'
import type { RecurringTemplate } from '../recurrence-types'
import { dayLabel, describeRule, monthLabel, nextOccurrences, shiftMonthKey } from '../recurrence-engine'

const props = defineProps<{
  template: RecurringTemplate
  /** Quantas ocorrências este modelo gera no mês que está aberto na tela. */
  countInMonth: number
  /** Mês exibido, para o rótulo do botão de mover. */
  monthKey: string
}>()

const emit = defineEmits<{
  edit: [template: RecurringTemplate]
  remove: [template: RecurringTemplate]
  toggle: [template: RecurringTemplate]
  moveToNextMonth: [template: RecurringTemplate]
}>()

const FREQ_ICON = {
  once: CalendarDays,
  daily: CalendarClock,
  weekly: CalendarRange,
  monthly: Repeat,
} as const

const sentence = computed(() => describeRule(props.template.rule))
const status = computed(() => statusSpec(props.template.initialStatus))
const priority = computed(() => prioritySpec(props.template.priorityNumber))
const upcoming = computed(() => nextOccurrences(props.template.rule, 3))
const nextMonthLabel = computed(() => monthLabel(shiftMonthKey(props.monthKey, 1), { short: true }))
</script>

<template>
  <article class="tpl" :class="{ 'tpl--paused': !template.active }">
    <div class="tpl-main">
      <header class="tpl-head">
        <span class="freq-badge" :title="sentence">
          <component :is="FREQ_ICON[template.rule.frequency]" :size="12" />
          {{ sentence }}
        </span>
        <span v-if="!template.active" class="paused-badge">Pausada</span>
      </header>

      <h3 class="tpl-title">{{ template.title }}</h3>
      <p v-if="template.description" class="tpl-desc">{{ template.description }}</p>

      <div class="tpl-meta">
        <span class="meta-chip" :style="{ '--c': status.token } as Record<string, string>">
          <component :is="status.icon" :size="11" />
          Nasce em {{ status.label }}
        </span>
        <span class="meta-chip" :style="{ '--c': priority.token } as Record<string, string>">
          {{ priority.short }}
        </span>
        <span class="meta-chip meta-chip--plain">
          {{ countInMonth }}× neste mês
        </span>
        <span v-if="template.subtasks.length" class="meta-chip meta-chip--plain">
          {{ template.subtasks.length }} passo{{ template.subtasks.length > 1 ? 's' : '' }}
        </span>
      </div>

      <div v-if="template.tags.length" class="tpl-tags">
        <TagChip v-for="tag in template.tags" :key="tag.id" :tag="tag" size="sm" />
      </div>

      <div v-if="upcoming.length" class="tpl-next">
        <span class="next-caption">Próximas</span>
        <span v-for="date in upcoming" :key="date" class="next-pill">{{ dayLabel(date) }}</span>
      </div>
    </div>

    <div class="tpl-side">
      <div v-if="template.assignees.length" class="avatars">
        <span
          v-for="name in template.assignees"
          :key="name"
          class="avatar"
          :title="name"
          :style="{
            background: `color-mix(in srgb, ${avatarTone(name)} 20%, var(--surface-3))`,
            color: `color-mix(in srgb, ${avatarTone(name)} 64%, var(--text))`,
          }"
        >
          {{ personInitials(name) }}
        </span>
      </div>

      <div class="tpl-actions">
        <button
          type="button"
          class="icon-btn press"
          :title="`Mudar o prazo para ${nextMonthLabel} (a tarefa vai junto)`"
          :aria-label="`Mover para ${nextMonthLabel}`"
          @click="emit('moveToNextMonth', template)"
        >
          <CalendarArrowDown :size="14" />
        </button>
        <button
          type="button"
          class="icon-btn press"
          :title="template.active ? 'Pausar: para de gerar daqui pra frente' : 'Retomar'"
          :aria-label="template.active ? 'Pausar recorrência' : 'Retomar recorrência'"
          @click="emit('toggle', template)"
        >
          <component :is="template.active ? Pause : Play" :size="14" />
        </button>
        <button
          type="button"
          class="icon-btn press"
          title="Editar"
          aria-label="Editar modelo"
          @click="emit('edit', template)"
        >
          <Pencil :size="14" />
        </button>
        <button
          type="button"
          class="icon-btn icon-btn--danger press"
          title="Excluir modelo"
          aria-label="Excluir modelo"
          @click="emit('remove', template)"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.tpl {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 13px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.tpl:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.tpl--paused {
  opacity: 0.62;
}

.tpl-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.tpl-head {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.freq-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 650;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
  border-radius: 999px;
}

.paused-badge {
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
  background: var(--surface-2);
  border-radius: 999px;
}

.tpl-title {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.3;
  color: var(--text);
}

.tpl-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tpl-meta,
.tpl-tags,
.tpl-next {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, var(--surface-2));
  border-radius: 999px;
}

.meta-chip--plain {
  color: var(--text-3);
  background: var(--surface-2);
}

.next-caption {
  font-size: 10.5px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-4);
}

.next-pill {
  padding: 1px 7px;
  font-size: 10.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
}

/* ─── Lateral ─── */
.tpl-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 9px;
  flex-shrink: 0;
}

.avatars {
  display: flex;
}

.avatar {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  font-size: 9.5px;
  font-weight: 700;
  border-radius: 50%;
  border: 2px solid var(--surface);
  margin-left: -6px;
}

.avatar:first-child {
  margin-left: 0;
}

.tpl-actions {
  display: flex;
  gap: 3px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--motion-fast), background var(--motion-fast);
}

.icon-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}

.icon-btn--danger:hover {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
}

@media (max-width: 720px) {
  .tpl {
    flex-direction: column;
  }

  .tpl-side {
    align-items: flex-start;
    flex-direction: row;
    justify-content: space-between;
    width: 100%;
  }
}
</style>
