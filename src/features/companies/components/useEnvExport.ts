export interface VariableField {
  key: string
  value: string
  type: 'TEXT' | 'SECRET' | 'URL'
}

export interface VariableLike {
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

export function useEnvExport() {
  const buildEnv = (variables: VariableLike[]): string => {
    const blocks: string[] = []
    for (const v of variables) {
      if (!v.fields?.length) continue
      const header = v.description ? `# ${v.name} — ${v.description}` : `# ${v.name}`
      const lines = v.fields
        .filter((f) => f.key?.trim())
        .map((f) => `${toEnvKey(v.name, f.key)}=${f.value ?? ''}`)
      if (lines.length) {
        blocks.push([header, ...lines].join('\n'))
      }
    }
    return blocks.join('\n\n') + (blocks.length ? '\n' : '')
  }

  const downloadEnv = (variables: VariableLike[], filename = '.env') => {
    const content = buildEnv(variables)
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

  const copyEnv = async (variables: VariableLike[]): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(buildEnv(variables))
      return true
    } catch {
      return false
    }
  }

  return { buildEnv, downloadEnv, copyEnv, toEnvKey }
}
