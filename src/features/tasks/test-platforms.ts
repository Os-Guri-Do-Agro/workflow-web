/**
 * Teste por plataforma (spec docs/specs/2026/q4/q4-1/teste-por-plataforma.md).
 *
 * Fonte única das três plataformas (ordem, nome, ícone) e da regra que segura
 * a tarefa em "Em teste" até Web, iOS e Android estarem marcados. A API aplica
 * a mesma regra (409); aqui ela existe para o card voltar NA HORA, sem request,
 * com a mesma frase que a API devolveria.
 *
 * Ícones de `@mdi/js` (SVG por constante, só estes três entram no bundle): o
 * Lucide não tem logo de marca, e o `simple-icons` não tem navegador genérico.
 * Não confundir com o `@mdi/font` legado: nada de classe `mdi-*` aqui.
 */
import { mdiAndroid, mdiApple, mdiWeb } from '@mdi/js'
import type { TestCheckView, TestPlatform } from './activity-types'

export interface TestPlatformSpec {
  value: TestPlatform
  label: string
  /** Nome acessível por extenso ("Web (navegador)"). */
  spoken: string
  /** `d` do SVG 24x24. */
  icon: string
}

export const TEST_PLATFORMS: readonly TestPlatformSpec[] = [
  { value: 'WEB', label: 'Web', spoken: 'Web (navegador)', icon: mdiWeb },
  { value: 'IOS', label: 'iOS', spoken: 'iOS (Apple)', icon: mdiApple },
  { value: 'ANDROID', label: 'Android', spoken: 'Android', icon: mdiAndroid },
]

/** Plataformas ainda sem check, na ordem da tela. */
export function missingPlatforms(checks: readonly TestCheckView[] | null | undefined): TestPlatform[] {
  const done = new Set((checks ?? []).map((c) => c.platform))
  return TEST_PLATFORMS.map((p) => p.value).filter((p) => !done.has(p))
}

/** "Android", "iOS e Android", "Web, iOS e Android". */
export function platformNames(list: readonly TestPlatform[]): string {
  const nomes = list.map((p) => TEST_PLATFORMS.find((s) => s.value === p)?.label ?? p)
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : (nomes[0] ?? '')
}

/** A mesma frase do 409 da API (`missingTestChecksMessage`). */
export function missingChecksMessage(missing: readonly TestPlatform[]): string {
  return `Marque o teste em ${platformNames(missing)} antes de mover para Revisados`
}

/**
 * Motivo para recusar JÁ NO CLIENTE a ida para Revisados, ou `null` para
 * deixar seguir. Só decide o caso que o cliente conhece: card saindo de "Em
 * teste" com o checklist carregado. Vindo de outra coluna, ou com o recurso
 * indisponível (`testChecks` nulo), quem decide é a API.
 */
export function reviewBlockReason(
  task: { testChecks?: TestCheckView[] | null } | null | undefined,
  from: string | null | undefined,
  to: string,
): string | null {
  if (to !== 'REVIEWED' || from !== 'IN_TESTING') return null
  if (!Array.isArray(task?.testChecks)) return null
  const missing = missingPlatforms(task.testChecks)
  return missing.length ? missingChecksMessage(missing) : null
}

/**
 * Os checks depois de a tarefa ir para `to`, como o servidor faz: voltar para
 * A fazer ou Em andamento é retrabalho e apaga; o resto mantém.
 */
export function checksAfterMove(
  checks: TestCheckView[] | null | undefined,
  to: string,
): TestCheckView[] | null | undefined {
  if ((to === 'TODO' || to === 'IN_PROGRESS') && Array.isArray(checks)) return []
  return checks
}
