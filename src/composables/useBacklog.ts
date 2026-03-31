import { computed } from 'vue'
import type { Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import backlogService from '@/service/backlog/backlog-service'

export function useBacklog(companyId: Ref<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => ['backlog', companyId.value]),
    queryFn: () => backlogService.getBacklogByCompany(companyId.value!),
    enabled: computed(() => !!companyId.value),
  })
}
