// Confere o SHA-256 incremental da ala (src/features/marketing/uploads/sha256.ts)
// contra o node:crypto: vetores do NIST, todos os tamanhos de 0 a 300 bytes
// (bordas de bloco de 64 e do padding de 56), fatias de tamanho aleatório e um
// arquivo de 64 MB fatiado como o worker fatia. Mede a vazão.
//
// Uso: node scripts/harness/sha256-check.mjs   (do work-flow; usa o esbuild do front)
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONT = path.resolve(HERE, '../..')
const require = createRequire(path.join(FRONT, 'package.json'))
const esbuild = require('esbuild')

const src = path.join(FRONT, 'src/features/marketing/uploads/sha256.ts')
const out = path.join(os.tmpdir(), `nevo-sha256-${process.pid}.mjs`)
fs.writeFileSync(out, esbuild.transformSync(fs.readFileSync(src, 'utf8'), { loader: 'ts', format: 'esm', target: 'es2020' }).code)
const { Sha256, sha256Hex } = await import(pathToFileURL(out).href)
fs.rmSync(out, { force: true })

let falhas = 0
let total = 0
const ok = (cond, msg) => {
  total++
  if (!cond) {
    falhas++
    console.log(`FALHA ${msg}`)
  }
}
const ref = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const enc = (s) => new TextEncoder().encode(s)

// 1. vetores do NIST (FIPS 180-2, apêndice B)
const vetores = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ['a'.repeat(1_000_000), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'],
]
for (const [msg, hex] of vetores) ok(sha256Hex(enc(msg)) === hex, `NIST: "${msg.slice(0, 20)}" (${msg.length} bytes)`)

// 2. todo tamanho de 0 a 300 bytes, numa tacada e byte a byte
for (let n = 0; n <= 300; n++) {
  const b = crypto.randomBytes(n)
  const esperado = ref(b)
  ok(sha256Hex(b) === esperado, `tamanho ${n} numa tacada`)
  const h = new Sha256()
  for (let i = 0; i < n; i++) h.update(b.subarray(i, i + 1))
  ok(h.hex() === esperado, `tamanho ${n} byte a byte`)
}

// 3. fatias aleatórias (inclui fatia vazia e fatia maior que o bloco)
for (let rodada = 0; rodada < 200; rodada++) {
  const n = Math.floor(Math.random() * 20_000)
  const b = crypto.randomBytes(n)
  const h = new Sha256()
  let pos = 0
  while (pos < n) {
    const fatia = Math.floor(Math.random() * 300)
    h.update(b.subarray(pos, pos + fatia))
    pos += fatia
  }
  ok(h.hex() === ref(b), `fatias aleatórias de ${n} bytes`)
}

// 4. arquivo de 64 MB em fatias de 8 MB (o que o worker faz) e vazão
{
  const n = 64 * 1024 * 1024 + 12345
  const b = crypto.randomBytes(n)
  const t0 = performance.now()
  const h = new Sha256()
  for (let pos = 0; pos < n; pos += 8 * 1024 * 1024) h.update(b.subarray(pos, pos + 8 * 1024 * 1024))
  const hex = h.hex()
  const ms = performance.now() - t0
  ok(hex === ref(b), '64 MB em fatias de 8 MB')
  console.log(`vazão: ${((n / 1048576) / (ms / 1000)).toFixed(0)} MB/s (${ms.toFixed(0)} ms para 64 MB)`)
}

// 5. digest é idempotente e update depois do digest é recusado
{
  const h = new Sha256().update(enc('abc'))
  ok(h.hex() === h.hex(), 'digest repetido devolve o mesmo valor')
  let recusou = false
  try {
    h.update(enc('x'))
  } catch {
    recusou = true
  }
  ok(recusou, 'update depois do digest é recusado')
}

console.log(falhas === 0 ? `TUDO OK (${total} checagens)` : `${falhas} FALHA(S) de ${total}`)
process.exit(falhas ? 1 : 0)
