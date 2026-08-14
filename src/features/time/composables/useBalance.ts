import { computed, ref, type MaybeRef, unref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import timeService from '@/service/time/time-service'

/**
 * Banco de horas (spec banco-de-horas).
 *
 * Quem calcula é o servidor: a jornada é versionada, feriado zera meta e o
 * mesmo número aparece para a pessoa e para quem administra. Duas contas
 * paralelas (uma no cliente, outra no servidor) divergiriam no primeiro fuso.
 */

/** Chave civil YYYY-MM-DD no fuso LOCAL. Nunca `toISOString`, que é UTC. */
export function localDay(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/** Semana corrente, de SEGUNDA a domingo (a semana de trabalho brasileira). */
export function currentWeek(base = new Date()): { from: string; to: string } {
  const d = new Date(base)
  // getDay(): 0 = domingo. Domingo pertence à semana que começou na segunda
  // anterior, e não à seguinte — daí o 6 em vez de 0.
  const desdeSegunda = d.getDay() === 0 ? 6 : d.getDay() - 1
  const segunda = new Date(d)
  segunda.setDate(d.getDate() - desdeSegunda)
  const domingo = new Date(segunda)
  domingo.setDate(segunda.getDate() + 6)
  return { from: localDay(segunda), to: localDay(domingo) }
}

/** Mês civil corrente. */
export function currentMonth(base = new Date()): { from: string; to: string } {
  const inicio = new Date(base.getFullYear(), base.getMonth(), 1)
  const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  return { from: localDay(inicio), to: localDay(fim) }
}

export type BalanceRange = { from: string; to: string }

/**
 * Data civil de hoje, reativa.
 *
 * O produto fica aberto a noite inteira em muita máquina, e "hoje" é o que
 * decide qual dia ainda pode ser trabalhado. Congelado no carregamento da
 * página, ele faria a virada do dia (e a do mês) passar despercebida, com a
 * tela seguindo no período anterior sem ninguém entender por quê.
 */
const hojeRef = ref(localDay(new Date()))
if (typeof window !== 'undefined') {
  // Um minuto é barato e detecta a virada rápido o suficiente para quem estava
  // com a tela aberta às 23h59.
  window.setInterval(() => {
    const atual = localDay(new Date())
    if (atual !== hojeRef.value) hojeRef.value = atual
  }, 60_000)
}

/** Data civil de hoje que muda sozinha na virada do dia. */
export function useToday() {
  return hojeRef
}

export function useBalance(range: MaybeRef<BalanceRange>, enabled?: MaybeRef<boolean>) {
  const chave = computed(() => unref(range))

  return useQuery({
    queryKey: computed(() => ['time', 'balance', chave.value.from, chave.value.to]),
    queryFn: () => timeService.balance(chave.value.from, chave.value.to),
    enabled: computed(() => (enabled === undefined ? true : unref(enabled))),
    // Curto de propósito: parar o cronômetro precisa mexer o saldo na hora, e o
    // `invalidateAll` do time tracking já derruba esta chave junto.
    staleTime: 30_000,
  })
}

export function useCompanyBalance(range: MaybeRef<BalanceRange>, companyId: MaybeRef<string | null>) {
  const chave = computed(() => unref(range))
  const empresa = computed(() => unref(companyId))

  return useQuery({
    queryKey: computed(() => [
      'time',
      'company-balance',
      empresa.value,
      chave.value.from,
      chave.value.to,
    ]),
    queryFn: () => timeService.companyBalance(chave.value.from, chave.value.to, empresa.value ?? undefined),
    enabled: computed(() => !!empresa.value),
    staleTime: 60_000,
    // 403 é resposta legítima (não-ADMIN), não falha de rede: repetir só gera
    // ruído no console e três requisições inúteis.
    retry: false,
  })
}
