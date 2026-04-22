import api from '../api'

const importService = {
  async importJiraXml(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/import/jira-xml', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
}

export default importService
