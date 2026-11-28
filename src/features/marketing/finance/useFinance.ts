import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { hasSession } from '@/composables/useSession'
import {
  getFinanceOptions,
  getFinanceSummary,
  getFinanceYear,
  listBudgets,
  listExpenses,
  listRecurring,
  type ExpenseFilter,
} from '@/service/marketing/marketing-finance'

/**
 * Queries do financeiro. Chave SEMPRE `['marketing', groupId, 'finance', ...]`:
 * o socket `marketing:changed` invalida o grupo inteiro e a tela acompanha o
 * que a outra pessoa lançou.
 */
export const financeKeys = {
  all: (g: string) => ['marketing', g, 'finance'] as const,
  expenses: (g: string, f: ExpenseFilter) => ['marketing', g, 'finance', 'expenses', f] as const,
  summary: (g: string, month: string, brand: string | null) =>
    ['marketing', g, 'finance', 'summary', month, brand ?? 'all'] as const,
  year: (g: string, year: number, brand: string | null) =>
    ['marketing', g, 'finance', 'year', year, brand ?? 'all'] as const,
  budgets: (g: string, year: number, brand: string | null) =>
    ['marketing', g, 'finance', 'budgets', year, brand ?? 'all'] as const,
  recurring: (g: string, month: string) => ['marketing', g, 'finance', 'recurring', month] as const,
  options: (g: string) => ['marketing', g, 'finance', 'options'] as const,
}

/** 403 do financeiro (Dono tirou o Visualizador): a tela troca pelo aviso. */
export function isForbidden(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403
}

const noRetryOn403 = (count: number, error: unknown) => !isForbidden(error) && count < 2

type Getter<T> = MaybeRefOrGetter<T>

export function useFinanceSummary(groupId: Getter<string>, month: Getter<string>, brand: Getter<string | null>, enabled: Getter<boolean>) {
  return useQuery({
    queryKey: computed(() => financeKeys.summary(toValue(groupId), toValue(month), toValue(brand))),
    queryFn: () => getFinanceSummary(toValue(groupId), toValue(month), toValue(brand)),
    enabled: computed(() => hasSession.value && toValue(enabled)),
    placeholderData: keepPreviousData,
    retry: noRetryOn403,
    staleTime: 15_000,
  })
}

export function useFinanceExpenses(groupId: Getter<string>, filter: Getter<ExpenseFilter>, enabled: Getter<boolean>) {
  return useQuery({
    queryKey: computed(() => financeKeys.expenses(toValue(groupId), toValue(filter))),
    queryFn: () => listExpenses(toValue(groupId), toValue(filter)),
    enabled: computed(() => hasSession.value && toValue(enabled)),
    placeholderData: keepPreviousData,
    retry: noRetryOn403,
    staleTime: 15_000,
  })
}

export function useFinanceYear(groupId: Getter<string>, year: Getter<number>, brand: Getter<string | null>, enabled: Getter<boolean>) {
  return useQuery({
    queryKey: computed(() => financeKeys.year(toValue(groupId), toValue(year), toValue(brand))),
    queryFn: () => getFinanceYear(toValue(groupId), toValue(year), toValue(brand)),
    enabled: computed(() => hasSession.value && toValue(enabled)),
    placeholderData: keepPreviousData,
    retry: noRetryOn403,
    staleTime: 30_000,
  })
}

export function useFinanceBudgets(groupId: Getter<string>, year: Getter<number>, brand: Getter<string | null>, enabled: Getter<boolean>) {
  return useQuery({
    queryKey: computed(() => financeKeys.budgets(toValue(groupId), toValue(year), toValue(brand))),
    queryFn: () => listBudgets(toValue(groupId), toValue(year), toValue(brand)),
    enabled: computed(() => hasSession.value && toValue(enabled)),
    retry: noRetryOn403,
    staleTime: 30_000,
  })
}

export function useFinanceRecurring(groupId: Getter<string>, month: Getter<string>, enabled: Getter<boolean>) {
  return useQuery({
    queryKey: computed(() => financeKeys.recurring(toValue(groupId), toValue(month))),
    queryFn: () => listRecurring(toValue(groupId), toValue(month)),
    enabled: computed(() => hasSession.value && toValue(enabled)),
    placeholderData: keepPreviousData,
    retry: noRetryOn403,
    staleTime: 15_000,
  })
}

export function useFinanceOptions(groupId: Getter<string>, enabled: Getter<boolean>) {
  return useQuery({
    queryKey: computed(() => financeKeys.options(toValue(groupId))),
    queryFn: () => getFinanceOptions(toValue(groupId)),
    enabled: computed(() => hasSession.value && toValue(enabled)),
    retry: noRetryOn403,
    staleTime: 5 * 60_000,
  })
}

/** Depois de qualquer escrita: tudo do financeiro do grupo (e o painel da ala). */
export function useFinanceInvalidate(groupId: Getter<string>) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: financeKeys.all(toValue(groupId)) })
}
