// Carregador do modelo de embedding local (transformers.js).
// Roda 100% local, sem API/sem key. O modelo baixa 1x (~25MB) e fica em cache.
import { MODEL_CACHE } from './paths.mjs'

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
export const DIM = 384

let _extractorPromise = null

async function getExtractor() {
  if (!_extractorPromise) {
    _extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = MODEL_CACHE
      env.allowRemoteModels = true
      return pipeline('feature-extraction', MODEL_ID)
    })()
  }
  return _extractorPromise
}

export async function embed(text) {
  const extractor = await getExtractor()
  const out = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(out.data)
}

export async function embedMany(texts, onProgress) {
  const extractor = await getExtractor()
  const vectors = []
  for (let i = 0; i < texts.length; i++) {
    const out = await extractor(texts[i], { pooling: 'mean', normalize: true })
    vectors.push(Array.from(out.data))
    if (onProgress) onProgress(i + 1, texts.length)
  }
  return vectors
}

// vetores já vêm normalizados -> cosine == dot product
export function cosine(a, b) {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot
}
