import api from '../api'

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const exportService = {
  async downloadRoadmapPdf(year: number) {
    const response = await api.get<Blob>('/export/roadmap.pdf', {
      params: { year },
      responseType: 'blob',
    })
    downloadBlob(response.data, `roadmap-${year}.pdf`)
  },
}

export default exportService
