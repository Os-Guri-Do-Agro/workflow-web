/**
 * SHA-256 INCREMENTAL (FIPS 180-4), sem dependência.
 *
 * Existe porque o `crypto.subtle.digest` só aceita o arquivo inteiro numa
 * tacada: um vídeo de 300 MB vira 300 MB de ArrayBuffer na memória e trava a
 * tela enquanto calcula. Aqui o arquivo entra em fatias (`update`), dentro de
 * um Web Worker (`hash.worker.ts`), e a memória fica no tamanho da fatia.
 *
 * Conferido contra o `node:crypto` em `scripts/harness/sha256-check.mjs`
 * (vetores do NIST, todos os tamanhos nas bordas de bloco e do padding,
 * fatias de tamanho aleatório, 64 MB fatiado como o worker fatia) e, no
 * roteiro de envios, contra o sha256 do objeto que chegou ao storage.
 *
 * Desempenho: a compressão roda em trechos de 64 KB. Uma chamada só com 8 MB
 * fazia o V8 demorar ~150 MB para otimizar a função (80 MB/s até lá); em
 * trechos curtos ela otimiza logo e fica perto de 175 MB/s (300 MB em ~2 s,
 * fora da thread da tela).
 */

const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** Trecho por chamada da compressão (ver o comentário de desempenho acima). */
const SPAN = 64 * 1024

/**
 * Comprime os blocos inteiros de `d[off, end)` no estado `h`. `end - off` é
 * múltiplo de 64. Os oito registradores ficam em variáveis locais o laço todo.
 */
function compress(h: Int32Array, w: Int32Array, d: Uint8Array, off: number, end: number) {
  let h0 = h[0]!
  let h1 = h[1]!
  let h2 = h[2]!
  let h3 = h[3]!
  let h4 = h[4]!
  let h5 = h[5]!
  let h6 = h[6]!
  let h7 = h[7]!
  for (; off < end; off += 64) {
    for (let i = 0, j = off; i < 16; i++, j += 4) {
      w[i] = (d[j]! << 24) | (d[j + 1]! << 16) | (d[j + 2]! << 8) | d[j + 3]!
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!
      const y = w[i - 2]!
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0
    }
    let a = h0
    let b = h1
    let c = h2
    let dd = h3
    let e = h4
    let f = h5
    let g = h6
    let hh = h7
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))
      const t1 = (hh + S1 + (g ^ (e & (f ^ g))) + K[i]! + w[i]!) | 0
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))
      const t2 = (S0 + ((a & b) | (c & (a | b)))) | 0
      hh = g
      g = f
      f = e
      e = (dd + t1) | 0
      dd = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + dd) | 0
    h4 = (h4 + e) | 0
    h5 = (h5 + f) | 0
    h6 = (h6 + g) | 0
    h7 = (h7 + hh) | 0
  }
  h[0] = h0
  h[1] = h1
  h[2] = h2
  h[3] = h3
  h[4] = h4
  h[5] = h5
  h[6] = h6
  h[7] = h7
}

export class Sha256 {
  private readonly h = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  private readonly w = new Int32Array(64)
  private readonly buf = new Uint8Array(64)
  private bufLen = 0
  /** Bytes já recebidos (number é exato até 2^53, muito além de qualquer arquivo). */
  private total = 0
  private finished = false

  update(data: Uint8Array): this {
    if (this.finished) throw new Error('Sha256: update depois do digest')
    const len = data.length
    let pos = 0
    this.total += len
    if (this.bufLen > 0) {
      const take = Math.min(64 - this.bufLen, len)
      this.buf.set(data.subarray(0, take), this.bufLen)
      this.bufLen += take
      pos = take
      if (this.bufLen < 64) return this
      compress(this.h, this.w, this.buf, 0, 64)
      this.bufLen = 0
    }
    const full = pos + Math.floor((len - pos) / 64) * 64
    while (pos < full) {
      const end = Math.min(full, pos + SPAN)
      compress(this.h, this.w, data, pos, end)
      pos = end
    }
    if (pos < len) {
      this.buf.set(data.subarray(pos), 0)
      this.bufLen = len - pos
    }
    return this
  }

  digest(): Uint8Array {
    if (!this.finished) {
      this.finished = true
      const total = this.total
      const pad = new Uint8Array(this.bufLen < 56 ? 64 : 128)
      pad.set(this.buf.subarray(0, this.bufLen))
      pad[this.bufLen] = 0x80
      // tamanho em BITS, 64 bits big-endian: alto = total / 2^29, baixo = (total % 2^29) * 8
      const hi = Math.floor(total / 0x20000000)
      const lo = (total % 0x20000000) * 8
      const end = pad.length
      pad[end - 8] = hi >>> 24
      pad[end - 7] = hi >>> 16
      pad[end - 6] = hi >>> 8
      pad[end - 5] = hi
      pad[end - 4] = lo >>> 24
      pad[end - 3] = lo >>> 16
      pad[end - 2] = lo >>> 8
      pad[end - 1] = lo
      compress(this.h, this.w, pad, 0, end)
    }
    const out = new Uint8Array(32)
    for (let i = 0; i < 8; i++) {
      const v = this.h[i]!
      out[i * 4] = v >>> 24
      out[i * 4 + 1] = v >>> 16
      out[i * 4 + 2] = v >>> 8
      out[i * 4 + 3] = v
    }
    return out
  }

  hex(): string {
    let s = ''
    for (const b of this.digest()) s += b.toString(16).padStart(2, '0')
    return s
  }
}

/** Atalho para bytes que já estão na memória. */
export function sha256Hex(data: Uint8Array): string {
  return new Sha256().update(data).hex()
}
