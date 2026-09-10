<script setup lang="ts">
/**
 * Gestão das recorrências do mês aberto.
 *
 * Vive num diálogo em cima de `/tasks/:month`, e não numa tela própria, porque
 * recorrência não é uma feature vizinha das tarefas: é uma propriedade delas.
 * Uma entrada separada na navegação criaria dois lugares para procurar a mesma
 * tarefa — o board mostraria os cards, a outra tela mostraria as regras, e
 * ninguém saberia qual das duas é "a" lista.
 *
 * O que ele responde: *o que está programado, e o que isso vai gerar?* Criar e
 * editar continua sendo o formulário de tarefa de sempre.
 */
import { Layers, Repeat, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { RecurringTemplate } from '../recurrence-types'
import { monthLabel } from '../recurrence-engine'
import RecurringTemplateCard from './RecurringTemplateCard.vue'

const props = defineProps<{
  modelValue: boolean
  templates: RecurringTemplate[]
  /** Mês exibido no board, `'YYYY-MM'`. */
  monthKey: string
  /** Quantas ocorrências cada modelo gera no mês exibido. */
  countInMonth: (id: string) => number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  edit: [template: RecurringTemplate]
  remove: [template: RecurringTemplate]
  toggle: [template: RecurringTemplate]
  moveToNextMonth: [template: RecurringTemplate]
}>()

const close = () => emit('update:modelValue', false)

/** Só as que repetem: avulsa não é "recorrência" e só faria volume aqui. */
const recurring = () => props.templates.filter((t) => t.rule.frequency !== 'once')
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    size="xl"
    label="Tarefas recorrentes"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="head">
      <div class="head-main">
        <span class="head-icon">
          <Repeat :size="17" />
        </span>
        <div>
          <h2 class="head-title">Tarefas recorrentes</h2>
          <p class="head-sub">
            O que se repete sozinho · contagem referente a
            <strong>{{ monthLabel(monthKey) }}</strong>
          </p>
        </div>
      </div>
      <button class="close-btn press" aria-label="Fechar" @click="close">
        <X :size="16" />
      </button>
    </header>

    <div class="body">
      <EmptyState
        v-if="!recurring().length"
        :icon="Layers"
        title="Nenhuma tarefa recorrente"
        description="Ao criar uma atividade, escolha uma repetição no campo Repetição para ela reaparecer sozinha."
      />

      <RecurringTemplateCard
        v-for="template in recurring()"
        :key="template.id"
        :template="template"
        :month-key="monthKey"
        :count-in-month="countInMonth(template.id)"
        @edit="emit('edit', $event)"
        @remove="emit('remove', $event)"
        @toggle="emit('toggle', $event)"
        @move-to-next-month="emit('moveToNextMonth', $event)"
      />
    </div>
  </AppDialog>
</template>

<style scoped>
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 11px;
}

.head-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  color: var(--accent);
}

.head-title {
  margin: 0;
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
}

.head-sub {
  margin: 1px 0 0;
  font-size: 12px;
  color: var(--text-3);
}

.head-sub strong {
  color: var(--text-2);
  font-weight: 650;
  text-transform: capitalize;
}

.close-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--text-3);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color var(--motion-fast), background var(--motion-fast);
}

.close-btn:hover {
  color: var(--text);
  background: var(--surface-2);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px 18px;
  overflow-y: auto;
}
</style>
