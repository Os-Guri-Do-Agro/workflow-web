export const meta = {
  name: 'spec-research',
  description:
    'Spec-Driven gated: research paralelo (RAG + código) → rascunho de spec → painel adversarial. Para ANTES de implementar; devolve rascunho + furos pra aprovação humana.',
  phases: [
    { title: 'Research', detail: 'fan-out por ângulo + consulta RAG (query.mjs)' },
    { title: 'Rascunho', detail: 'síntese da spec no template do projeto' },
    { title: 'Revisão', detail: '4 juízes adversariais tentam refutar a spec' },
  ],
}

// O harness entrega `args` como JSON string (não objeto) — normalizar sempre.
const A = typeof args === 'string' ? JSON.parse(args || '{}') : args || {}
const feature = A.feature || A.description || 'feature não especificada'
const extra = A.context || ''
const answers = A.answers || ''

const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['angle', 'findings'],
  properties: {
    angle: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    relatedSpecs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'why'],
        properties: { path: { type: 'string' }, why: { type: 'string' } },
      },
    },
    relatedMemories: { type: 'array', items: { type: 'string' } },
    anchorFiles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'why'],
        properties: { path: { type: 'string' }, why: { type: 'string' } },
      },
    },
    patterns: { type: 'array', items: { type: 'string' } },
    breakingChanges: { type: 'array', items: { type: 'string' } },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['level', 'risk', 'mitigation'],
        properties: {
          level: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
          risk: { type: 'string' },
          mitigation: { type: 'string' },
        },
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sizing', 'fileName', 'draftMarkdown'],
  properties: {
    sizing: { type: 'string', enum: ['mini', 'full', 'multi'] },
    fileName: { type: 'string' },
    draftMarkdown: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'verdict', 'problems'],
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['pronta', 'precisa-ajuste', 'reprovada'] },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'issue', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['alto', 'medio', 'baixo'] },
          where: { type: 'string' },
          issue: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

const RAG_HINT = `Antes de tudo, rode a busca RAG do projeto (NÃO pule):
  node scripts/spec-rag/query.mjs "${feature}" --k 8
Leia o JSON retornado (campos "semantic" e "lexical") e ABRA as specs/memórias mais relevantes com Read antes de concluir. Cite caminhos reais (arquivo:linha quando possível).`

// --- Fase 1: Research paralelo por ângulo -----------------------------------
phase('Research')
log(`Spec-Driven gated para: "${feature}"`)

const angles = [
  {
    key: 'specs-memorias',
    prompt: `Ângulo: SPECS E MEMÓRIAS RELACIONADAS.
${RAG_HINT}
Objetivo: achar o que JÁ existe e deve ser reusado/respeitado. Specs concluídas da mesma área, padrões registrados (READMEs/CLAUDE.md), decisões anteriores e memórias (preferências, pegadinhas, feedback do usuário). Liste duplicação a evitar e convenções a seguir.`,
  },
  {
    key: 'codigo-padroes',
    prompt: `Ângulo: CÓDIGO EXISTENTE E PADRÕES.
${RAG_HINT}
Depois, explore o código (Grep/Glob/Read) pra identificar: arquivos-âncora que serão criados/modificados, componentes/serviços reutilizáveis, e os padrões locais a seguir (estado, validação, nomenclatura, organização). Liste anchorFiles com o porquê.`,
  },
  {
    key: 'breaking-deps',
    prompt: `Ângulo: BREAKING CHANGES E CONSUMIDORES.
${RAG_HINT}
Pergunta central: "quem depende do que vou tocar?". Faça Grep dos imports/usos dos arquivos prováveis de mudança, componentes compartilhados, contratos. Liste breakingChanges concretas (ou diga explicitamente que não há).`,
  },
  {
    key: 'riscos-nfr',
    prompt: `Ângulo: RISCOS E SUPERFÍCIE NÃO-FUNCIONAL.
${RAG_HINT}
Classifique riscos (alto/medio/baixo) COM mitigação concreta pra cada alto/médio. Aponte só as áreas não-funcionais que a feature REALMENTE toca: segurança, privacidade/LGPD, performance, observabilidade, acessibilidade, i18n, compatibilidade.`,
  },
]

const research = await parallel(
  angles.map(
    (a) => () =>
      agent(
        `Você está fazendo a Fase 0 (research) de uma spec no projeto ACI Supply (Vue 3 + Vuetify 3 + TS, front-end de prototipagem, dados mockados).

FEATURE: ${feature}
${extra ? `CONTEXTO EXTRA: ${extra}\n` : ''}${answers ? `RESPOSTAS DO USUÁRIO: ${answers}\n` : ''}
${a.prompt}

Seja concreto e cite arquivos reais. Não invente. Não escreva a spec — só pesquise.`,
        { phase: 'Research', label: `research:${a.key}`, schema: RESEARCH_SCHEMA },
      ),
  ),
)

const cleanResearch = research.filter(Boolean)
log(`Research: ${cleanResearch.length}/${angles.length} ângulos concluídos.`)

// --- Fase 2: Rascunho da spec -----------------------------------------------
phase('Rascunho')

const draft = await agent(
  `Sintetize uma SPEC do projeto ACI Supply a partir do research abaixo.

FEATURE: ${feature}
${extra ? `CONTEXTO: ${extra}\n` : ''}${answers ? `RESPOSTAS DO USUÁRIO: ${answers}\n` : ''}
RESEARCH (JSON dos 4 ângulos):
${JSON.stringify(cleanResearch)}

Regras:
- Dimensione (sizing): "mini" (<300 linhas/1 dia), "full" (1-5 dias, 3+ arquivos), "multi" (épico).
- Proponha fileName em kebab-case descritivo (ex: "cancelamento-assinatura.md"); para épico, "epicos/<nome>.md".
- O draftMarkdown DEVE seguir o template spec-driven do projeto, nesta ordem de seções:
  # Spec: <Nome>
  **Status:** In Review · **Autor:** <usuário> · **Criado em:** <data de hoje> · **Versão:** 0.1
  ## Visão Geral
  ## Motivação / Contexto
  ## Research Findings (Stack, Padrões a seguir, Referências no código com arquivo:linha, Breaking Changes)
  ## Riscos e Mitigações (tabela Nível|Risco|Mitigação)
  ## Requisitos Não-Funcionais (só o relevante)
  ## User Stories
  ## Acceptance Criteria (Given/When/Then ou checklist observável — NADA vago)
  ## Estratégia de Testes
  ## Arquivos Impactados (tabela Arquivo|Ação|Descrição)
  ## Tasks Técnicas (T1, T2... com (depende de: TX) explícito)
  ## Considerações de Arquitetura (Decisão/Motivo/Alternativa rejeitada)
  ## Plano de Rollout / Rollback (se aplicável)
  ## Definition of Done (inclui: CHANGELOG.md atualizado, README das pastas tocadas, spec Concluído)
  ## Perguntas em Aberto
  ## Change Log (tabela)
- Respeite o CLAUDE.md do projeto: nada de travessão "—" em texto visível de UI; use componentes Vuetify nativos; classes "ga-N" (não "gap-N").
- Toda decisão técnica cita o código que a fundamenta. Acceptance criteria são testáveis.

Para mini-spec, draftMarkdown pode ser o bloco curto (Problema/Solução/Arquivos/Critérios/Riscos) em vez do template cheio.`,
  { phase: 'Rascunho', label: 'sintese', schema: DRAFT_SCHEMA },
)

if (!draft) {
  log('Rascunho falhou. Abortando antes da revisão.')
  return { ok: false, stage: 'rascunho', research: cleanResearch }
}
log(`Rascunho pronto (sizing=${draft.sizing}, arquivo=${draft.fileName}).`)

// --- Fase 3: Painel adversarial ---------------------------------------------
phase('Revisão')

const lenses = [
  'AC VAGO / NÃO VERIFICÁVEL — procure critérios não testáveis ("funcionar bem", "ser rápido", "boa UX"), AC sem teste correspondente, e métricas sem número.',
  'BREAKING CHANGE / CONSUMIDOR OMITIDO — quem depende do que a spec toca e não aparece? Componente compartilhado, contrato, import. Verifique no código.',
  'RISCO SEM MITIGAÇÃO / NÃO-FUNCIONAL FALTANDO — risco alto/médio sem mitigação concreta; segurança/LGPD/perf/a11y/observabilidade que a feature toca mas a spec ignora.',
  'TASK GENÉRICA / DEPENDÊNCIA IMPLÍCITA / DoD FRÁGIL — tasks tipo "fazer a tela", ordem implícita sem (depende de: TX), DoD decorativo que não fecha os AC.',
]

const review = await parallel(
  lenses.map(
    (lens) => () =>
      agent(
        `Você é um revisor ADVERSARIAL de uma spec do ACI Supply. Sua missão é REFUTAR — achar o que está fraco, não elogiar. Na dúvida, aponte.

LENTE: ${lens}

SPEC (markdown):
${draft.draftMarkdown}

Pode (e deve) abrir o código com Grep/Glob/Read pra confirmar suspeitas (ex: consumidores de um arquivo). Para cada problema dê: severity (alto/medio/baixo), where (seção/AC/task), issue (o furo), fix (correção concreta). Se a spec passar limpa nesta lente, verdict "pronta" com problems vazio. Não invente problema onde não há.`,
        { phase: 'Revisão', label: `juiz:${lens.split(' ')[0].toLowerCase()}`, schema: VERDICT_SCHEMA },
      ),
  ),
)

const cleanReview = review.filter(Boolean)
const allProblems = cleanReview.flatMap((r) => r.problems || [])
const highs = allProblems.filter((p) => p.severity === 'alto').length
log(`Revisão: ${cleanReview.length} lentes, ${allProblems.length} problemas (${highs} altos).`)

return {
  ok: true,
  feature,
  sizing: draft.sizing,
  fileName: draft.fileName,
  draftMarkdown: draft.draftMarkdown,
  assumptions: draft.assumptions || [],
  openQuestions: draft.openQuestions || [],
  research: cleanResearch,
  review: cleanReview,
  summary: {
    problems: allProblems.length,
    high: highs,
    verdicts: cleanReview.map((r) => r.verdict),
  },
}
