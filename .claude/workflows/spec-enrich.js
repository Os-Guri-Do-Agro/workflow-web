export const meta = {
  name: 'spec-enrich',
  description:
    'Enriquece specs em paralelo (1 agente/spec): area, summary, keyDecisions, anchorFiles, related. RETORNA os registros (sem writer agent — o orquestrador grava enrichment.json e roda spec:merge).',
  phases: [{ title: 'Extrair', detail: '1 agente por spec (paralelo)' }],
}

// `args` chega como JSON string — normalizar. Espera { specs: string[] }.
const A = typeof args === 'string' ? JSON.parse(args || '{}') : args || {}
const specs = A.specs || []

const ENRICH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'area', 'summary'],
  properties: {
    path: { type: 'string' },
    area: { type: 'string' },
    summary: { type: 'string' },
    keyDecisions: { type: 'array', items: { type: 'string' } },
    anchorFiles: { type: 'array', items: { type: 'string' } },
    related: { type: 'array', items: { type: 'string' } },
  },
}

phase('Extrair')
log(`Enriquecendo ${specs.length} specs...`)

const records = await parallel(
  specs.map(
    (p) => () =>
      agent(
        `Leia o arquivo de spec "${p}" do projeto ACI Supply e extraia metadata estruturada.

Retorne:
- path: "${p}" (exatamente)
- area: rótulo curto da área funcional (ex: "gestao-linha", "pedidos", "agenda", "carteira-fornecedor", "grupos-aplicacao", "analistas", "services/infra", "ui-padroes"). Uma palavra/kebab.
- summary: UMA frase do que a spec entrega.
- keyDecisions: decisões de arquitetura/produto registradas (curtas, máx ~6). Vazio se não houver.
- anchorFiles: caminhos reais de arquivos do repo que a spec cria/centra (máx ~8). Só os que aparecem na spec.
- related: caminhos de OUTRAS specs relacionadas (ex: "docs/specs/x.md"), se a spec citar ou for da mesma área. Vazio se nenhuma.

Não invente. Baseie-se só no conteúdo do arquivo.`,
        { phase: 'Extrair', label: p.replace('docs/specs/', ''), model: 'sonnet', schema: ENRICH_SCHEMA },
      ),
  ),
)

const clean = records.filter(Boolean)
log(`Extraídas ${clean.length}/${specs.length}.`)

return { ok: true, count: clean.length, records: clean }
