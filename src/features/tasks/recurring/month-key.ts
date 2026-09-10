/**
 * Traduz o mês do board (`/tasks/:month`, um uuid) para `'YYYY-MM'`.
 *
 * É a costura entre o protótipo de recorrência e o board real, e ela existe por
 * uma lacuna do contrato atual: `GET /company/:id/quarters` devolve o mês como
 * `{ id, name }` — sem intervalo de datas e sem ano. O motor de recorrência,
 * por outro lado, só sabe trabalhar com calendário de verdade.
 *
 * **Some quando o backend existir.** A §8 do contrato
 * (`docs/specs/tarefas-recorrentes-backend-contract.md`) pede que a resolução
 * data ↔ mês seja do servidor, justamente porque adivinhar ano no cliente é o
 * tipo de heurística que acerta 11 meses por ano e erra na virada.
 *
 * Ordem de preferência, da mais confiável para a menos:
 *
 * 1. `year` + `number` vindos da API, quando vierem (o payload do roadmap e o
 *    do picker já têm `number`);
 * 2. o ano das atividades REAIS que já estão no board — se as tarefas de
 *    "Setembro" vencem em 2026, o mês é setembro/2026, e não há o que adivinhar;
 * 3. o nome do mês em pt-BR + o ano em que ele cai mais perto de hoje.
 */
import { monthKeyOf, today } from './recurrence-engine'

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** Sem acento, sem caixa, sem espaço: "Março " casa com "marco". */
function normalize(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** Número do mês (1-12) a partir do nome em pt-BR. `null` se não reconhecer. */
export function monthNumberFromName(name: string | undefined | null): number | null {
  if (!name) return null
  const key = normalize(name)
  // `startsWith` e não igualdade: alguns meses chegam como "Setembro 2026".
  const index = MONTH_NAMES.findIndex((m) => key.startsWith(m))
  return index === -1 ? null : index + 1
}

export interface BoardMonthInfo {
  name?: string | null
  number?: number | null
  year?: number | null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function resolveBoardMonthKey(
  month: BoardMonthInfo | null | undefined,
  /** `dueDate` das atividades reais já carregadas no board (ISO ou date-only). */
  sampleDueDates: readonly (string | null | undefined)[] = [],
): string {
  const number = month?.number ?? monthNumberFromName(month?.name)

  // 1. A API mandou tudo.
  if (month?.year && number) return `${month.year}-${pad(number)}`

  // 2. O ano vem das tarefas que já estão na tela. Conta as ocorrências em vez
  //    de pegar a primeira: uma tarefa com prazo remarcado para outro mês não
  //    pode decidir o ano do board sozinha.
  const votes = new Map<string, number>()
  for (const iso of sampleDueDates) {
    if (typeof iso !== 'string' || iso.length < 7) continue
    const key = monthKeyOf(iso)
    if (number && Number(key.slice(5, 7)) !== number) continue
    votes.set(key, (votes.get(key) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [key, count] of votes) {
    if (count > bestCount) {
      best = key
      bestCount = count
    }
  }
  if (best) return best

  // 3. Nome do mês + o ano em que ele cai mais perto de hoje. Sem tarefa
  //    nenhuma no board não há evidência melhor, e escolher o ano corrente
  //    cegamente erra justamente em dezembro/janeiro.
  const now = today()
  if (!number) return monthKeyOf(now)
  const thisYear = Number(now.slice(0, 4))
  const currentMonth = Number(now.slice(5, 7))
  const distance = number - currentMonth
  const year = distance > 6 ? thisYear - 1 : distance < -6 ? thisYear + 1 : thisYear
  return `${year}-${pad(number)}`
}
