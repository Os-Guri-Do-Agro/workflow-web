---
description: Sincroniza o RAG das specs (INDEX + embeddings), o catálogo do README, e cruza specs↔memória reportando drift.
argument-hint: "[quick]   (quick = só INDEX, sem reembed/enriquecimento)"
allowed-tools: Bash(npm run spec:*), Bash(node scripts/spec-rag/*), Read, Edit, Write, Glob, Grep, Workflow
---

# /spec-sync — manutenção do conhecimento das specs

Mantém em dia a camada de RAG e o catálogo. Argumento: `$ARGUMENTS`.

Se o argumento for `quick`: rode **só** o passo 1 e o passo 4 (rápido, sem modelo/agentes). Caso contrário, rode o fluxo completo (1→5).

## 1. Reindexar (mecânico + embeddings)

```bash
npm run spec:rag
```

(`quick` → use `npm run spec:index` em vez disso.) Isso regenera `docs/specs/INDEX.json` (metadata, preservando campos enriquecidos) e `docs/specs/.rag/vectors.json` (embeddings).

## 2. Reenriquecer o INDEX (agentes, só no modo completo)

Decida o escopo: **só as specs sem `summary`** (incremental, default) ou **todas** (se o usuário pedir um refresh completo). Pegue os `path` correspondentes de `INDEX.json`.

**Poucas specs (1-3)** — faça você mesmo: leia cada arquivo e monte um array de objetos `{path, area, summary, keyDecisions, anchorFiles, related}`.

**Muitas specs** — use o saved workflow `spec-enrich` (paralelo):

```
Workflow  name: "spec-enrich"  args: { specs: ["docs/specs/a.md", ...] }
```

Quando concluir, **colha os registros** assim (NÃO confie num writer agent — o workflow apenas retorna):
1. Use `result.records` da notificação de conclusão, se vier completo.
2. Se vier truncado/vazio, leia o `journal.jsonl` do run (caminho impresso no launch) e pegue as linhas `type==="result"` com `result.path` (cada `result` é um registro).

Grave os registros em `docs/specs/.rag/enrichment.json` (array JSON) e funda:

```bash
npm run spec:merge
```

`spec:merge` é idempotente e preserva o que já estava enriquecido.

## 3. Atualizar o catálogo do README

Leia `docs/specs/INDEX.json` e reescreva a tabela "Specs neste momento" em [docs/specs/README.md](../../docs/specs/README.md) a partir dele (coluna Spec = link, Status = `status`, Descrição = `summary` quando houver, senão a descrição atual). Não invente status: use o do INDEX.

## 4. Cruzar specs ↔ memória + reportar drift

- Liste memórias (de `INDEX.json` campo `memories`) e specs. Aponte:
  - **Specs órfãs**: sem `area`/`summary` (não enriquecidas).
  - **Status divergente**: README diz X, INDEX diz Y.
  - **Memória relevante não citada**: memória cuja área casa com uma spec ativa mas não aparece em `related`/no corpo.
  - **Specs `Em Implementação` ou `In Review` há muito tempo** (pela `lastUpdated`), candidatas a fechar ou arquivar.

## 5. Resumo

Apresente um resumo curto: nº de specs/memórias indexadas, quantas enriquecidas, mudanças feitas no catálogo, e a lista de drift encontrada (com sugestão de ação para cada item). Não conserte o drift automaticamente — só reporte, salvo se for trivial (ex: status no README).
