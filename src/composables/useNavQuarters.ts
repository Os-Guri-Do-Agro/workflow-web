import { computed, ref, watch } from 'vue'
import { useActiveCompanyId } from '@/stores/authStores'
import { useCompanyQuarters } from '@/composables/useCompanyQuarters'

export type NavQuarter = {
  id: string
  label: string
  monthsLabel: string
  months: { id: string; name: string }[]
}

/** Mês cru vindo de `GET /company/:id/quarters`. */
interface RawMonth {
  id: string
  name: string
}

/** Quarter cru vindo de `GET /company/:id/quarters`. `months` pode vir ausente. */
interface RawQuarter {
  id: string
  label: string
  months?: RawMonth[]
}

/** Resposta de `useCompanyQuarters`: array direto ou envelopado em `{ data }`. */
type QuartersResponse = RawQuarter[] | { data?: RawQuarter[] } | null | undefined

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
    const raw = data.value as QuartersResponse
    const list: RawQuarter[] = Array.isArray(raw) ? raw : (raw?.data ?? [])
    return list.map((q) => ({
      id: q.id,
      label: q.label,
      monthsLabel: q.months?.map((m) => m.name.slice(0, 3)).join('-') ?? '',
      months: (q.months ?? []).map((m) => ({ id: m.id, name: m.name })),
    }))
  })

  const firstMonth = computed(() => quarters.value[0]?.months[0] ?? null)

  return { quarters, firstMonth, loading: isLoading }
}
