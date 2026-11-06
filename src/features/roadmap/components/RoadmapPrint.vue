<script setup lang="ts">
/**
 * Relatório do roadmap para imprimir ou salvar em PDF (um mês ou o ano). Vai
 * por `Teleport` para o `<body>` e, enquanto imprime, a página inteira some e
 * só ele fica: funciona igual em qualquer moldura (computador ou celular), sem
 * conhecer as classes de cada shell.
 */
import { computed } from 'vue'
import { statusSpec } from '@/features/tasks/task-meta'
import type { RoadmapMonth } from '@/service/roadmap/roadmap-monthly-service'
import type { RoadmapMilestoneDto } from '@/service/roadmap/roadmap-milestones-service'
import { MONTH_NAMES, formatDayMonth, formatRange } from '../roadmap-meta'
import { buildItems, testBands } from '../roadmap-items'

const props = defineProps<{
  active: boolean
  months: RoadmapMonth[]
  milestones: RoadmapMilestoneDto[]
  companyName: string
}>()

const pages = computed(() =>
  props.months.map((month) => {
    const items = buildItems([month], props.milestones.filter((m) => m.date.startsWith(month.key)))
    const first = `${month.key}-01`
    const last = `${month.key}-31`
    const bands = testBands(props.milestones).filter((b) => b.start <= last && b.end >= first)
    const deliveries = month.deliveries ?? []
    return {
      month,
      name: `${MONTH_NAMES[month.month]} ${month.year}`,
      items,
      bands,
      done: deliveries.filter((d) => d.status === 'DONE').length,
      total: deliveries.length,
    }
  }),
)

function kindLabel(item: ReturnType<typeof buildItems>[number]): string {
  if (item.kind === 'entry') return item.cat.label
  if (item.kind === 'milestone') return item.milestone.type === 'REVIEW' ? 'Review' : 'Marco'
  return `Tarefa · ${statusSpec(item.delivery.status).label}${item.delivery.overdue ? ' · atrasada' : ''}`
}
</script>

<template>
  <Teleport to="body">
    <div v-if="active" class="roadmap-print-root">
      <article v-for="page in pages" :key="page.month.key" class="rp-page">
        <header class="rp-head">
          <div>
            <p class="rp-company">{{ companyName }} · Roadmap</p>
            <h1>{{ page.name }}</h1>
            <p v-if="page.month.main" class="rp-goal">{{ page.month.main }}</p>
          </div>
          <dl class="rp-kpis">
            <div><dt>Itens</dt><dd>{{ page.items.length }}</dd></div>
            <div><dt>Tarefas</dt><dd>{{ page.done }}/{{ page.total }}</dd></div>
          </dl>
        </header>

        <section v-if="page.month.focusItems.length" class="rp-block">
          <h2>Foco do mês</h2>
          <ul>
            <li v-for="f in page.month.focusItems" :key="f.id">{{ f.text }}</li>
          </ul>
        </section>

        <section v-if="page.bands.length" class="rp-block">
          <h2>Janelas de teste</h2>
          <ul>
            <li v-for="b in page.bands" :key="b.id">{{ b.title }}: {{ formatRange(b.start, b.end) }}</li>
          </ul>
        </section>

        <section class="rp-block">
          <h2>Agenda</h2>
          <table v-if="page.items.length" class="rp-table">
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Item</th></tr>
            </thead>
            <tbody>
              <tr v-for="item in page.items" :key="item.key">
                <td>{{ formatDayMonth(item.date) }}</td>
                <td>{{ kindLabel(item) }}</td>
                <td>
                  {{ item.title }}
                  <small v-if="item.kind === 'entry' && item.entry.description">{{ item.entry.description }}</small>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="rp-muted">Nada marcado neste mês.</p>
        </section>
      </article>
    </div>
  </Teleport>
</template>

<style>
/* Global de propósito: precisa esconder o resto da página na impressão. */
.roadmap-print-root {
  display: none;
}
@media print {
  @page {
    size: A4 portrait;
    margin: 12mm;
  }
  body.roadmap-printing > *:not(.roadmap-print-root) {
    display: none !important;
  }
  body.roadmap-printing {
    background: #fff !important;
  }
  body.roadmap-printing .roadmap-print-root {
    display: block;
    color: #111827;
    font-family: var(--font-family);
    font-size: 10.5pt;
  }
  .rp-page {
    break-after: page;
  }
  .rp-page:last-child {
    break-after: auto;
  }
  .rp-head {
    display: flex;
    justify-content: space-between;
    gap: 10mm;
    padding-bottom: 4mm;
    margin-bottom: 5mm;
    border-bottom: 1px solid #d1d5db;
  }
  .rp-company {
    margin: 0 0 1mm;
    color: #6b7280;
    font-size: 9pt;
    font-weight: 600;
  }
  .rp-head h1 {
    margin: 0;
    font-size: 22pt;
    line-height: 1.1;
  }
  .rp-goal {
    margin: 2mm 0 0;
    max-width: 120mm;
    color: #374151;
  }
  .rp-kpis {
    display: flex;
    gap: 3mm;
    margin: 0;
  }
  .rp-kpis div {
    min-width: 20mm;
    padding: 2mm 3mm;
    border: 1px solid #d1d5db;
    border-radius: 2mm;
    text-align: center;
  }
  .rp-kpis dt {
    color: #6b7280;
    font-size: 8.5pt;
  }
  .rp-kpis dd {
    margin: 0;
    font-size: 15pt;
    font-weight: 700;
  }
  .rp-block {
    margin-bottom: 5mm;
    break-inside: avoid;
  }
  .rp-block h2 {
    margin: 0 0 2mm;
    font-size: 11pt;
  }
  .rp-block ul {
    margin: 0;
    padding-left: 5mm;
  }
  .rp-table {
    width: 100%;
    border-collapse: collapse;
  }
  .rp-table th,
  .rp-table td {
    padding: 1.6mm 2mm;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
    vertical-align: top;
  }
  .rp-table th {
    color: #6b7280;
    font-size: 8.5pt;
    font-weight: 600;
  }
  .rp-table td:first-child {
    width: 16mm;
    white-space: nowrap;
  }
  .rp-table td:nth-child(2) {
    width: 42mm;
    color: #374151;
  }
  .rp-table small {
    display: block;
    color: #6b7280;
  }
  .rp-muted {
    color: #6b7280;
  }
}
</style>
