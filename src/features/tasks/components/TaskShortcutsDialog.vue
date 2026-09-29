<script setup lang="ts">
/**
 * Ajuda do teclado do board (tecla ?), spec board-tarefas-redesign D10. É a
 * documentação dos atalhos que o `useTaskKeyboard` implementa: mudou lá, muda
 * aqui. Casca do AppDialog (scrim sem blur, Esc fecha, foco volta).
 */
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'

const props = defineProps<{
  modelValue: boolean
  /** Agrupado por pessoa: O e U viram expandir e recolher as linhas. */
  grouped?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

interface Shortcut {
  keys: string[][]
  label: string
}

const sections = computed<{ title: string; items: Shortcut[] }[]>(() => [
  {
    title: 'No board',
    items: [
      { keys: [['C']], label: 'Criar tarefa em "A fazer", direto na coluna' },
      { keys: [['/']], label: 'Buscar por título ou chave' },
      { keys: [['J'], ['K']], label: 'Próxima e anterior, coluna por coluna' },
      { keys: [['↓'], ['↑']], label: 'O mesmo que J e K' },
      { keys: [['←'], ['→']], label: 'Coluna vizinha' },
      {
        keys: props.grouped ? [['Enter']] : [['Enter'], ['O']],
        label: 'Abrir no painel',
      },
      { keys: [['E']], label: 'Renomear a tarefa em foco' },
      { keys: [['Esc']], label: 'Tirar o foco ou cancelar a criação' },
      { keys: [['?']], label: 'Esta ajuda' },
    ],
  },
  {
    title: 'Agrupado por pessoa',
    items: [
      { keys: [['O']], label: 'Expandir todas as linhas' },
      { keys: [['U']], label: 'Recolher todas as linhas' },
    ],
  },
  {
    title: 'Com o painel aberto',
    items: [
      { keys: [['J'], ['K']], label: 'Trocar de tarefa (também ↓ e ↑)' },
      { keys: [['Esc']], label: 'Fechar o painel' },
    ],
  },
  {
    title: 'Na lista',
    items: [{ keys: [['X']], label: 'Selecionar a tarefa em foco' }],
  },
])

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Atalhos do teclado"
    size="md"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="keys">
      <header class="keys__head">
        <h2 class="keys__title">Atalhos do teclado</h2>
        <button type="button" class="keys__close" aria-label="Fechar" @click="close">
          <X :size="16" :stroke-width="1.8" />
        </button>
      </header>

      <p class="keys__note">
        Valem com o foco fora de campos de texto. O botão "Nova tarefa" abre o formulário completo.
      </p>

      <section v-for="section in sections" :key="section.title" class="keys__section">
        <h3 class="keys__section-title">{{ section.title }}</h3>
        <dl class="keys__list">
          <template v-for="item in section.items" :key="item.label">
            <dt class="keys__combo">
              <template v-for="(combo, i) in item.keys" :key="i">
                <span v-if="i > 0" class="keys__or">ou</span>
                <kbd v-for="k in combo" :key="k" class="keys__kbd">{{ k }}</kbd>
              </template>
            </dt>
            <dd class="keys__label">{{ item.label }}</dd>
          </template>
        </dl>
      </section>
    </div>
  </AppDialog>
</template>

<style scoped>
.keys {
  padding: 16px 20px 20px;
  overflow-y: auto;
}

.keys__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.keys__title {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
  font-weight: 600;
  color: var(--text);
}

.keys__close {
  position: relative;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

/* 44px de alvo no desenho de 32px. */
.keys__close::after {
  content: '';
  position: absolute;
  inset: -6px;
}

.keys__close:hover {
  background: var(--surface-2);
  color: var(--text);
}

.keys__close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.keys__note {
  margin: 2px 0 12px;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-3);
}

.keys__section + .keys__section {
  margin-top: 14px;
}

.keys__section-title {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  color: var(--text-2);
}

.keys__list {
  display: grid;
  grid-template-columns: 104px 1fr;
  gap: 6px 14px;
  margin: 0;
}

.keys__combo {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 24px;
}

.keys__kbd {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1;
}

.keys__or {
  font-size: 12px;
  color: var(--text-3);
}

.keys__label {
  margin: 0;
  align-self: center;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-2);
}
</style>
