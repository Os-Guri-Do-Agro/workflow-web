import api from '../api'

export type RoadmapMilestoneType = 'MILESTONE' | 'REVIEW'

export interface RoadmapMilestoneDto {
  id: string
  title: string
  description: string | null
  date: string
  type: RoadmapMilestoneType
  quarterId: string | null
}

export interface CreateRoadmapMilestoneInput {
  title: string
  /** YYYY-MM-DD. A API valida o formato. */
  date: string
  type?: RoadmapMilestoneType
  description?: string
  /** Ancora o marco a um trimestre. String vazia desancora no update. */
  quarterId?: string
}

export type UpdateRoadmapMilestoneInput = Partial<CreateRoadmapMilestoneInput>

const roadmapMilestonesService = {
  async create(companyId: string, input: CreateRoadmapMilestoneInput) {
    const response = await api.post<RoadmapMilestoneDto>(
      `/company/${companyId}/roadmap/milestones`,
      input,
    )
    return response.data
  },

  async update(companyId: string, milestoneId: string, input: UpdateRoadmapMilestoneInput) {
    const response = await api.patch<RoadmapMilestoneDto>(
      `/company/${companyId}/roadmap/milestones/${milestoneId}`,
      input,
    )
    return response.data
  },

  async remove(companyId: string, milestoneId: string) {
    const response = await api.delete<{ message: string }>(
      `/company/${companyId}/roadmap/milestones/${milestoneId}`,
    )
    return response.data
  },
}

export default roadmapMilestonesService
