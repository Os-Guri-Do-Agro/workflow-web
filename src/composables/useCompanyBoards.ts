import { computed } from 'vue'
import type { Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import quartersService from '@/service/quarters/quarters-service'

export function useCompanyBoards(monthId: Ref<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => ['boards', monthId.value]),
    queryFn: () => quartersService.getCompanyBoards(monthId.value!),
    enabled: computed(() => !!monthId.value),
  })
}
