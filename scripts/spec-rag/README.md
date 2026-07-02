# `scripts/spec-rag/`

Camada de **RAG (retrieval) sobre as specs, memórias e READMEs** do projeto. Alimenta a Fase 0 da skill `spec-driven` v2: antes de pesquisar o código com grep, o fluxo consulta o que já existe (specs relacionadas, decisões registradas, memórias, padrões).

Roda **100% local, sem API e sem chave** — usa o modelo de embedding `Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers` (transformers.js). O modelo baixa uma vez (~25MB) e fica em cache **fora do repo**, em `~/.cache/spec-rag-models` (compartilhado entre projetos; configurável em `lib/paths.mjs` → `MODEL_CACHE`). Nada de cache pesado dentro do working tree.

## O que tem aqui

| Arquivo | O que faz |
|---|---|
| `build-index.mjs` | Gera/atualiza `docs/specs/INDEX.json` — **só metadata mecânica** (título, status, seções, última atualização, memórias). Rápido, não carrega modelo. **Preserva** campos enriquecidos. Usado pelo hook Stop. |
| `embed.mjs` | Gera `docs/specs/.rag/vectors.json` — embeddings de cada chunk de spec/memória/README. Carrega o modelo. Rodado pelo `/spec-sync`. |
| `query.mjs` | Busca híbrida: semântica (embeddings) + exata (INDEX). Imprime JSON em stdout. |
| `lib/paths.mjs` | Caminhos do repo + descoberta da pasta de memória (`~/.claude/projects/<slug>/memory`). |
| `lib/sources.mjs` | Coleta e faz parse de specs, memórias e READMEs. |
| `lib/chunk.mjs` | Quebra markdown em chunks por heading, com janelas de tamanho limitado. |
| `lib/model.mjs` | Carregador do modelo + `embed`/`embedMany`/`cosine`. |

## Comandos

```bash
npm run spec:index                 # só INDEX.json (rápido, sem modelo)
npm run spec:embed                 # só vectors.json (carrega modelo)
npm run spec:rag                   # ambos (sync completo de dados)
npm run spec:query -- "texto"      # busca; flags: --k N, --kind spec|memory|readme
```

## Dois níveis de dado

- **`INDEX.json`** (commitado): metadata estruturada + campos **enriquecidos** (`area`, `summary`, `keyDecisions`, `anchorFiles`, `related`) que vêm do `/spec-sync` ou do workflow `spec-research`. O `build-index.mjs` regenera a parte mecânica e **mantém** os enriquecidos.
- **`.rag/vectors.json`** (gitignored): os embeddings. Regenerável a qualquer momento.

## Quando mexer aqui

- Mudou a estrutura das specs (nova seção padrão, novo header de status) → ajustar o parse em `lib/sources.mjs`.
- Quer indexar outra fonte (ex: `CHANGELOG.md`, `docs/` extra) → `listDocFiles()` em `lib/sources.mjs`.
- Trocar o modelo de embedding → `lib/model.mjs` (`MODEL_ID` + `DIM`).

Manutenção do dado: `/spec-sync` (completo) ou o hook Stop (só INDEX). Ver [docs/specs/README.md](../../docs/specs/README.md).
