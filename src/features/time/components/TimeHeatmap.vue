<script setup lang="ts">
/**
 * TimeHeatmap — calendário de constância no estilo do gráfico de contribuições
 * do GitHub: uma coluna por semana, uma célula por dia, cor mais forte onde
 * houve mais tempo registrado.
 *
 * Por que isto e não mais um gráfico de barras: barra responde "quanto"; esta
 * grade responde "com que regularidade", que é a pergunta de quem quer criar o
 * hábito de apontar tempo. Sequência aparece sozinha, buraco também, e olhar
 * para a própria fileira preenchida é o que dá vontade de não quebrar a
 * corrente.
 *
 * A escala é relativa ao próprio período (o máximo do intervalo vira o topo),
 * porque comparar com um número fixo puniria quem trabalha meio período.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Segundos por dia, chaveado por "YYYY-MM-DD". */
    days: Map<string, number> | Record<string, number>
    /** Quantas semanas mostrar, contando para trás a partir de hoje. */
    weeks?: number
    /** Altura da célula; a largura acompanha. */
    cell?: number
    /** Some com os rótulos de mês e a legenda (uso compacto, em linha de lista). */
    bare?: boolean
  }>(),
  { weeks: 26, cell: 10, bare: false },
)

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const lookup = computed<Map<string, number>>(() =>
  props.days instanceof Map ? props.days : new Map(Object.entries(props.days)),
)

interface Cell {
  key: string
  date: Date
  sec: number
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

/**
 * Colunas de semanas terminando na semana atual. A grade começa sempre num
 * domingo, senão as linhas deixam de significar "dia da semana".
 */
const grid = computed<Cell[][]>(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const end = new Date(today)
  end.setDate(end.getDate() + (6 - end.getDay())) // sábado da semana atual
  const start = new Date(end)
  start.setDate(start.getDate() - (props.weeks * 7 - 1))

  // A escala sai do MÁXIMO DA JANELA, não do mapa inteiro: quem recebe 6 meses
  // de dados e desenha 13 semanas (a faixa do ranking) teria todas as células
  // achatadas por um pico de cinco meses atrás.
  const columns: Cell[][] = []
  const cursor = new Date(start)
  const visible: Array<{ key: string; date: Date; sec: number; future: boolean }> = []

  for (let w = 0; w < props.weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const key = dayKey(cursor)
      visible.push({
        key,
        date: new Date(cursor),
        sec: lookup.value.get(key) ?? 0,
        future: cursor.getTime() > today.getTime(),
      })
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const max = Math.max(1, ...visible.map((c) => c.sec))
  for (let w = 0; w < props.weeks; w++) {
    columns.push(
      visible.slice(w * 7, w * 7 + 7).map((c) => ({ ...c, level: levelFor(c.sec, max) })),
    )
  }
  return columns
})

/** Cinco degraus: vazio + quatro faixas do máximo do período. */
function levelFor(sec: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (sec <= 0) return 0
  const ratio = sec / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

/** Rótulo de mês na primeira semana em que ele aparece. */
const monthMarks = computed(() =>
  grid.value.map((column, index) => {
    const first = column[0]
    if (!first) return ''
    const previous = grid.value[index - 1]?.[0]
    if (index === 0 || (previous && previous.date.getMonth() !== first.date.getMonth())) {
      return MONTHS[first.date.getMonth()]
    }
    return ''
  }),
)

function human(sec: number): string {
  if (sec <= 0) return 'sem registro'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h && m) return `${h}h${String(m).padStart(2, '0')}`
  if (h) return `${h}h`
  return `${m} min`
}

function title(cell: Cell): string {
  const date = cell.date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  return `${date}: ${human(cell.sec)}`
}

/** Dias com registro DENTRO da janela desenhada (a legenda promete isso). */
const daysWithTime = computed(
  () => grid.value.flat().filter((cell) => cell.sec > 0).length,
)

/** Resumo textual: quem usa leitor de tela não perde a informação da grade. */
const summary = computed(
  () => `Constância: ${daysWithTime.value} dias com tempo registrado nas últimas ${props.weeks} semanas`,
)
</script>

<template>
  <div class="hm" :class="{ 'hm--bare': bare }" :style="{ '--hm-cell': `${cell}px` }">
    <div class="hm-body">
      <div v-if="!bare" class="hm-weekdays" aria-hidden="true">
        <span class="hm-weekday hm-weekday--spacer" />
        <span v-for="(wd, i) in WEEKDAYS" :key="i" class="hm-weekday">
          {{ i % 2 === 1 ? wd : '' }}
        </span>
      </div>

      <!-- Meses e grade no MESMO container rolável: separados, o rótulo saía do
           lugar assim que a grade rolava. -->
      <div class="hm-scroll">
        <div v-if="!bare" class="hm-months">
          <span v-for="(mark, i) in monthMarks" :key="i" class="hm-month">{{ mark }}</span>
        </div>

        <div class="hm-grid" role="img" :aria-label="summary">
          <div v-for="(column, wi) in grid" :key="wi" class="hm-col">
            <span
              v-for="cellData in column"
              :key="cellData.key"
              class="hm-cell"
              :class="[`hm-cell--l${cellData.level}`, { 'hm-cell--future': cellData.future }]"
              :title="cellData.future ? '' : title(cellData)"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="!bare" class="hm-legend">
      <span class="hm-legend-text">{{ daysWithTime }} dias com registro</span>
      <span class="hm-legend-scale">
        <span class="hm-legend-label">menos</span>
        <span v-for="l in [0, 1, 2, 3, 4]" :key="l" class="hm-cell" :class="`hm-cell--l${l}`" />
        <span class="hm-legend-label">mais</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.hm {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.hm-scroll {
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.hm-scroll::-webkit-scrollbar {
  display: none;
}

.hm-months {
  display: flex;
  gap: 2px;
  margin-bottom: 3px;
}

.hm-month {
  flex: none;
  width: var(--hm-cell);
  color: var(--text-4);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.hm-body {
  display: flex;
  gap: 5px;
}

.hm-weekdays {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 1px;
}

.hm-weekday--spacer {
  height: 12px;
}

.hm-weekday {
  height: var(--hm-cell);
  width: 13px;
  color: var(--text-4);
  font-size: 8.5px;
  line-height: var(--hm-cell);
}

.hm-grid {
  display: flex;
  gap: 2px;
}

.hm-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hm-cell {
  width: var(--hm-cell);
  height: var(--hm-cell);
  border-radius: 2px;
  background: var(--surface-2);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.hm-grid .hm-cell:hover {
  transform: scale(1.35);
}

/* Escala do acento: mesma cor do produto, quatro intensidades. */
.hm-cell--l0 {
  background: color-mix(in srgb, var(--text) 7%, transparent);
}
.hm-cell--l1 {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
}
.hm-cell--l2 {
  background: color-mix(in srgb, var(--accent) 50%, transparent);
}
.hm-cell--l3 {
  background: color-mix(in srgb, var(--accent) 74%, transparent);
}
.hm-cell--l4 {
  background: var(--accent);
}

.hm-cell--future {
  background: transparent;
  border: 1px dashed color-mix(in srgb, var(--text) 8%, transparent);
}

.hm-legend {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-left: 17px;
}

.hm-legend-text {
  color: var(--text-4);
  font-size: 10px;
  font-weight: 650;
}

.hm-legend-scale {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.hm-legend-label {
  color: var(--text-4);
  font-size: 9px;
}

.hm--bare .hm-grid {
  gap: 2px;
}

.hm--bare .hm-col {
  gap: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .hm-grid .hm-cell:hover {
    transform: none;
  }
}
</style>
