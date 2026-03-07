import { ref } from 'vue'

export interface Report {
  id: string
  quarter: string
  content: string
  updatedAt: string
}

const reports = ref<Report[]>([
  {
    id: 'q1',
    quarter: 'Q1',
    content: '<h2>Relatório Q1 2024</h2><p>Adicione aqui o conteúdo do relatório do primeiro trimestre...</p>',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'q2',
    quarter: 'Q2',
    content: '<h2>Relatório Q2 2024</h2><p>Adicione aqui o conteúdo do relatório do segundo trimestre...</p>',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'q3',
    quarter: 'Q3',
    content: '<h2>Relatório Q3 2024</h2><p>Adicione aqui o conteúdo do relatório do terceiro trimestre...</p>',
    updatedAt: new Date().toISOString()
  },
  {
    id: 'q4',
    quarter: 'Q4',
    content: '<h2>Relatório Q4 2024</h2><p>Adicione aqui o conteúdo do relatório do quarto trimestre...</p>',
    updatedAt: new Date().toISOString()
  }
])

export function useReports() {
  const getReport = (quarter: string) => {
    return reports.value.find((r) => r.id === quarter)
  }

  const updateReport = (quarter: string, content: string) => {
    const report = reports.value.find((r) => r.id === quarter)
    if (report) {
      report.content = content
      report.updatedAt = new Date().toISOString()
    }
  }

  return {
    reports,
    getReport,
    updateReport
  }
}
