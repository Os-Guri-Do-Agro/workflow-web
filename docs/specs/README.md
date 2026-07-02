# Specs — work-flow (frontend)

As especificações do produto vivem aqui. Cada spec é um markdown com escopo,
decisões e critérios de aceite; o código referencia as specs e vice-versa.

Este diretório é indexado pela camada **Spec-RAG** (`scripts/spec-rag/`):

- `npm run spec:rag` — reindexa e gera embeddings (`INDEX.json` + `.rag/vectors.json`)
- `npm run spec:query -- "termo"` — busca híbrida (semântica + lexical) nas specs
- `/spec-sync` — sincroniza índice + enriquecimento via workflow

A skill global `spec-driven` opera em modo completo neste repo: research é
retrieval-first (consulta o RAG antes de varrer o código).
