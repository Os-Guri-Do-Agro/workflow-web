import { computed, ref, watch } from 'vue'
import { useActiveCompanyId } from '@/stores/authStores'
import { useCompanyQuarters } from '@/composables/useCompanyQuarters'

export type NavQuarter = {
  id: string
  label: string
  monthsLabel: string
  months: { id: string; name: string }[]
}

export function useNavQuarters() {
  const store = useActiveCompanyId()
  const companyId = ref<string | null>(
    store.companyId ?? localStorage.getItem('activeCompany'),
  )

  watch(
    () => store.companyId,
    (v) => {
      if (v) companyId.value = v
    },
  )

  const { data, isLoading } = useCompanyQuarters(companyId)

  const quarters = computed<NavQuarter[]>(() => {
    const raw = data.value as any
    const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
    return list.map((q) => ({
      id: q.id,
      label: q.label,
      monthsLabel: q.months?.map((m: any) => m.name.slice(0, 3)).join('-') ?? '',
      months: (q.months ?? []).map((m: any) => ({ id: m.id, name: m.name })),
    }))
  })

  const firstMonth = computed(() => quarters.value[0]?.months[0] ?? null)

  return { quarters, firstMonth, loading: isLoading }
}
