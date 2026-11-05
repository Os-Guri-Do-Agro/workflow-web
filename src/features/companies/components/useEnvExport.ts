import companyVariableService from '@/service/companies/variables/variables-services'
import { copyText } from '@/utils/clipboard'

export interface VariableField {
  key: string
  /** `null` = SECRET mascarado pela API (ainda não revelado). */
  value: string | null
  type: 'TEXT' | 'SECRET' | 'URL'
  masked?: boolean
  hint?: string | null
  /** Chave que o campo tinha ao carregar (o rascunho do drawer pode renomear). */
  originalKey?: string
}

export interface VariableLike {
  id?: string
  name: string
  description?: string
  fields: VariableField[]
}

const toEnvKey = (variableName: string, fieldKey: string): string => {
  const already = /^[A-Z0-9_]+$/.test(fieldKey)
  const normalized = already
    ? fieldKey
    : fieldKey
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[-\s]+/g, '_')
        .replace(/[^A-Za-z0-9_]/g, '')
        .toUpperCase()

  const prefix = variableName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase()

  if (normalized.startsWith(prefix + '_') || normalized === prefix) return normalized
  return `${prefix}_${normalized}`
}

const isMaskedSecret = (f: VariableField) => f.type === 'SECRET' && f.value == null

/**
 * Preenche os segredos mascarados pela revelação em lote da API, que registra
 * no Histórico de cada variável quem exportou. Sem segredo mascarado, nenhuma
 * requisição sai. Falha (rede, 403) sobe para quem chamou: exportar `.env` com
 * a senha em branco seria pior do que não exportar.
 */
async function withSecrets(variables: VariableLike[]): Promise<VariableLike[]> {
  const ids = variables
    .filter((v) => v.id && v.fields?.some(isMaskedSecret))
    .map((v) => v.id as string)
  if (!ids.length) return variables

  const revealed = await companyVariableService.revealVariables(ids)
  const byId = new Map(revealed.map((r) => [r.id, r]))

  return variables.map((v) => {
    const r = v.id ? byId.get(v.id) : undefined
    if (!r) return v
    // Chave repetida na mesma variável sai na ordem em que foi guardada.
    const queue = new Map<string, string[]>()
    for (const f of r.fields) queue.set(f.key, [...(queue.get(f.key) ?? []), f.value])
    return {
      ...v,
      fields: v.fields.map((f) =>
        isMaskedSecret(f)
          ? { ...f, value: queue.get(f.originalKey ?? f.key)?.shift() ?? null }
          : f,
      ),
    }
  })
}

export function useEnvExport() {
  const buildEnv = (variables: VariableLike[]): string => {
    const blocks: string[] = []
    for (const v of variables) {
      if (!v.fields?.length) continue
      const header = v.description ? `# ${v.name}: ${v.description}` : `# ${v.name}`
      const lines = v.fields
        .filter((f) => f.key?.trim())
        .map((f) => `${toEnvKey(v.name, f.key)}=${f.value ?? ''}`)
      if (lines.length) {
        blocks.push([header, ...lines].join('\n'))
      }
    }
    return blocks.join('\n\n') + (blocks.length ? '\n' : '')
  }

  /** Baixa o `.env`. Lança se a revelação dos segredos falhar. */
  const downloadEnv = async (variables: VariableLike[], filename = '.env'): Promise<void> => {
    const content = buildEnv(await withSecrets(variables))
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /** Copia o `.env`. Lança se a revelação ou a área de transferência falharem. */
  const copyEnv = async (variables: VariableLike[]): Promise<void> => {
    await copyText(withSecrets(variables).then(buildEnv))
  }

  return { buildEnv, downloadEnv, copyEnv, toEnvKey }
}
