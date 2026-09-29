<script setup lang="ts">
/**
 * Coluna do board (spec board-tarefas-redesign, D5 e D6), a mesma no board do
 * mês e no `/board`: poço neutro de 280px (`--surface-sunken`, raio 8px) com
 * cabeçalho de 36px (ícone de status, nome e contagem). "+" e "…" aparecem no
 * hover. A cor do status mora SÓ no ícone de 14px: sem quadrado tintado, sem
 * régua em gradiente, sem "well" colorido e sem máscara de fade.
 *
 * O conteúdo (lista arrastável ou não) vem pelo slot; a coluna não sabe como o
 * board arrasta. Recolhida, vira uma faixa de 44px com o nome na vertical.
 *
 * Menu "…" (S4): "Criar tarefa aqui", "Recolher coluna" (só Concluído) e
 * "Ordenar por prioridade", que só reordena a TELA e some ao recarregar: a
 * ordem manual gravada no mês não muda. Ordenada, a coluna mostra o ícone no
 * cabeçalho para ninguém confundir com a ordem de verdade.
 */
import { computed } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { ArrowDownWideNarrow, ChevronsLeft, ListRestart, MoreHorizontal, Plus } from 'lucide-vue-next'
import { statusSpec } from '@/features/tasks/task-meta'
import type { ActivityStatus } from '@/features/tasks/activity-types'

const props = withDefaults(
  defineProps<{
    status: ActivityStatus
    count: number
    /** Mostra o "+" (e "Criar tarefa aqui" no menu). */
    canCreate?: boolean
    collapsible?: boolean
    collapsed?: boolean
    /** Arraste passando por cima: o poço sobe um degrau neutro. */
    over?: boolean
    /** Oferece "Ordenar por prioridade" no "…" (só visual, sem gravar). */
    sortable?: boolean
    /** A coluna está ordenada por prioridade agora. */
    sorted?: boolean
  }>(),
  {
    canCreate: false,
    collapsible: false,
    collapsed: false,
    over: false,
    sortable: false,
    sorted: false,
  },
)

const emit = defineEmits<{
  create: []
  'toggle-collapse': []
  'toggle-sort': []
}>()

const spec = computed(() => statusSpec(props.status))
const countLabel = computed(() => `${props.count} ${props.count === 1 ? 'tarefa' : 'tarefas'}`)
</script>

<template>
  <section
    class="lane"
    :class="{ 'lane--collapsed': collapsed, 'lane--over': over }"
    :aria-label="`${spec.label}, ${countLabel}`"
  >
    <button
      v-if="collapsed"
      type="button"
      class="lane__rail"
      :aria-label="`Expandir ${spec.label}, ${countLabel}`"
      :aria-expanded="false"
      :title="`Expandir ${spec.label}`"
      @click="emit('toggle-collapse')"
    >
      <component :is="spec.icon" :size="14" />
      <span class="lane__count">{{ count }}</span>
      <span class="lane__rail-title">{{ spec.label }}</span>
    </button>

    <template v-else>
      <header class="lane__head">
        <component :is="spec.icon" :size="14" />
        <h2 class="lane__title">{{ spec.label }}</h2>
        <span class="lane__count">{{ count }}</span>
        <span
          v-if="sorted"
          class="lane__sorted"
          role="img"
          aria-label="Ordenada por prioridade, só nesta tela"
          title="Ordenada por prioridade, só nesta tela"
        >
          <ArrowDownWideNarrow :size="14" :stroke-width="1.8" />
        </span>

        <span v-if="canCreate || collapsible || sortable" class="lane__actions">
          <button
            v-if="canCreate"
            type="button"
            class="lane__btn"
            :aria-label="`Criar tarefa em ${spec.label}`"
            :title="`Criar tarefa em ${spec.label}`"
            @click="emit('create')"
          >
            <Plus :size="14" :stroke-width="1.8" />
          </button>
          <!-- "…" com as ações da coluna: criar aqui, recolher (só Concluído
               recolhe) e ordenar por prioridade (só na tela). -->
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <button type="button" class="lane__btn" :aria-label="`Mais ações de ${spec.label}`">
                <MoreHorizontal :size="14" :stroke-width="2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent class="dd-menu task-lane-menu" :side-offset="4" align="end">
                <DropdownMenuItem v-if="canCreate" class="dd-item" @select="emit('create')">
                  <Plus :size="14" :stroke-width="1.8" />
                  <span>Criar tarefa aqui</span>
                </DropdownMenuItem>
                <DropdownMenuItem v-if="sortable" class="dd-item" @select="emit('toggle-sort')">
                  <ListRestart v-if="sorted" :size="14" :stroke-width="1.8" />
                  <ArrowDownWideNarrow v-else :size="14" :stroke-width="1.8" />
                  <span>{{ sorted ? 'Voltar à ordem manual' : 'Ordenar por prioridade' }}</span>
                </DropdownMenuItem>
                <DropdownMenuItem v-if="collapsible" class="dd-item" @select="emit('toggle-collapse')">
                  <ChevronsLeft :size="14" :stroke-width="1.8" />
                  <span>Recolher coluna</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>
        </span>
      </header>

      <slot />
    </template>
  </section>
</template>

<style scoped>
.lane {
  position: relative;
  /*
   * 280px é a base, não o teto. As colunas CRESCEM até 360px quando sobra
   * largura: com a medida travada, um monitor de 1870px deixava 443px de vazio
   * à direita do board e a tela parecia mal distribuída.
   *
   * O número da spec continua valendo onde ela o definiu. Em 1440px, descontada
   * a sidebar e o respiro, sobram exatamente 1144px, que é o que as quatro
   * colunas de 280 mais os três vãos ocupam: não há folga para crescer ali, e a
   * medida se mantém. Só acima disso a coluna se estica.
   */
  flex: 1 1 280px;
  min-width: 280px;
  max-width: 360px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface-sunken);
  border-radius: var(--radius-md);
  transition: background-color var(--motion-fast) var(--motion-ease);
}

/* Destino do arraste: um degrau neutro acima do poço, nunca tinta de status. */
.lane--over {
  background: color-mix(in srgb, var(--surface-sunken), var(--text) 5%);
}

.lane__head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 6px 0 10px;
  flex: none;
}

.lane__head > svg {
  flex: none;
}

.lane__title {
  margin: 0;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lane__count {
  font-size: 13px;
  line-height: 20px;
  font-weight: 400;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.lane__sorted {
  display: inline-flex;
  color: var(--text-3);
}

.lane__actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.lane:hover .lane__actions,
.lane__actions:focus-within,
.lane__actions:has([data-state='open']) {
  opacity: 1;
}

@media (hover: none) {
  .lane__actions {
    opacity: 1;
  }
}

.lane__btn {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.lane__btn:hover,
.lane__btn[data-state='open'] {
  background: var(--surface-3);
  color: var(--text);
}

.lane__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* ── Recolhida: faixa de 44px, clicável inteira ── */
.lane--collapsed {
  /* Colapsada não cresce: é uma lombada, não uma coluna. */
  flex: 0 0 44px;
  min-width: 0;
  max-width: 44px;
}

.lane__rail {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 11px 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.lane__rail:hover {
  background: color-mix(in srgb, var(--surface-sunken), var(--text) 4%);
}

.lane__rail:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.lane__rail-title {
  writing-mode: vertical-rl;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
  white-space: nowrap;
}

/* Largura por CONTAINER, não por viewport: o mesmo board vive ao lado de uma
   sidebar de 248px (Command) ou de 296px (Focus). Quatro colunas de 280px mais
   os três vãos de 8px pedem 1144px; abaixo disso a coluna cai para 244px, que
   é o que cabe num notebook de 1280. Os boards declaram o container. */
@container task-board (max-width: 1143px) {
  .lane:not(.lane--collapsed) {
    flex-basis: 244px;
    width: 244px;
  }
}

/* Celular: uma coluna por tela, em fita com snap. */
@container task-board (max-width: 640px) {
  .lane:not(.lane--collapsed) {
    flex-basis: min(84cqw, 320px);
    width: min(84cqw, 320px);
    scroll-snap-align: start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lane,
  .lane__actions {
    transition: none;
  }
}
</style>

<style>
.task-lane-menu {
  min-width: 190px;
}
</style>
