/**
 * Empacota a extensão do Nevo para distribuição.
 *
 * Existe porque a instalação não pode custar seis passos por funcionário. Este
 * script produz, de uma vez, tudo que torna a instalação um clique (ou zero):
 *
 *   dist-extension/nevo-extension-<versao>.zip   → sobe na Chrome Web Store
 *   dist-extension/nevo-extension/               → pasta descompactada (teste)
 *   dist-extension/politica-chrome.reg           → instala sozinho, Chrome
 *   dist-extension/politica-edge.reg             → instala sozinho, Edge
 *   dist-extension/politica-mdm.json             → mesma regra p/ MDM/Intune
 *
 * O domínio do Nevo é injetado aqui, a partir de `--origin` ou de
 * `VITE_APP_ORIGIN`. O manifesto versionado no repositório guarda um marcador,
 * e nunca um curinga de plataforma: `https://*.vercel.app/*` injetaria o
 * content script em TODO site hospedado lá.
 *
 * Uso:
 *   node extension/build.mjs --origin https://nevo.suaempresa.com
 *   node extension/build.mjs --origin https://... --id <id-da-loja>
 *
 * Sem dependência externa: o ZIP é escrito à mão (deflate do `node:zlib`), para
 * empacotar não depender de instalar nada.
 */
import { deflateRawSync } from 'node:zlib'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const OUT = join(ROOT, 'dist-extension')

/** Arquivos que compõem a extensão. Nada de build.mjs ou README dentro do zip. */
const FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'popup.js',
  'icon128.png',
]

// ─── Argumentos ──────────────────────────────────────────────────────────────

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

/** Lê uma variável do `.env` sem depender de dotenv. */
function fromEnvFile(key) {
  try {
    const raw = readFileSync(join(ROOT, '.env'), 'utf8')
    const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`))
    return line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  } catch {
    return undefined
  }
}

const origin = arg('origin') ?? process.env.VITE_APP_ORIGIN ?? fromEnvFile('VITE_APP_ORIGIN')
const storeId = arg('id') ?? process.env.NEVO_EXTENSION_ID ?? fromEnvFile('VITE_EXTENSION_ID')

if (!origin) {
  console.error(
    [
      'Falta o domínio do Nevo.',
      '',
      '  node extension/build.mjs --origin https://nevo.suaempresa.com',
      '',
      'Ou defina VITE_APP_ORIGIN no .env. Ele decide em quais páginas a extensão',
      'pode falar com o app, e por isso não tem padrão: um curinga aqui daria',
      'acesso a sites que não são seus.',
    ].join('\n'),
  )
  process.exit(1)
}

let host
try {
  const url = new URL(origin)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('use https (ou localhost)')
  }
  host = `${url.protocol}//${url.host}/*`
} catch (e) {
  console.error(`Domínio inválido (${origin}): ${e.message}`)
  process.exit(1)
}

// ─── Manifesto com o domínio real ────────────────────────────────────────────

const manifest = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'))
const matches = [host]
// Localhost entra junto para o time de produto conseguir testar sem reempacotar.
if (!host.includes('localhost')) matches.push('http://localhost/*')

manifest.host_permissions = matches
manifest.content_scripts[0].matches = matches

const version = arg('version') ?? manifest.version

// ─── Saída ───────────────────────────────────────────────────────────────────

rmSync(OUT, { recursive: true, force: true })
const pasta = join(OUT, 'nevo-extension')
mkdirSync(pasta, { recursive: true })

for (const file of FILES) {
  if (file === 'manifest.json') continue
  cpSync(join(HERE, file), join(pasta, file))
}
writeFileSync(join(pasta, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

// ─── ZIP (deflate, sem dependência) ──────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function listar(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? listar(full) : [full]
  })
}

function zip(dir) {
  const locais = []
  const central = []
  let offset = 0

  for (const full of listar(dir).sort()) {
    const nome = Buffer.from(relative(dir, full).split('\\').join('/'))
    const conteudo = readFileSync(full)
    const comprimido = deflateRawSync(conteudo)
    const crc = crc32(conteudo)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // versão mínima
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(8, 8) // deflate
    // Data fixa: empacotar duas vezes o mesmo código deve dar o mesmo arquivo.
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0x21, 12) // 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(conteudo.length, 22)
    local.writeUInt16LE(nome.length, 26)
    local.writeUInt16LE(0, 28)
    locais.push(local, nome, comprimido)

    const dir_ = Buffer.alloc(46)
    dir_.writeUInt32LE(0x02014b50, 0)
    dir_.writeUInt16LE(20, 4)
    dir_.writeUInt16LE(20, 6)
    dir_.writeUInt16LE(0, 8)
    dir_.writeUInt16LE(8, 10)
    dir_.writeUInt16LE(0, 12)
    dir_.writeUInt16LE(0x21, 14)
    dir_.writeUInt32LE(crc, 16)
    dir_.writeUInt32LE(comprimido.length, 20)
    dir_.writeUInt32LE(conteudo.length, 24)
    dir_.writeUInt16LE(nome.length, 28)
    dir_.writeUInt32LE(offset, 42)
    central.push(dir_, nome)

    offset += local.length + nome.length + comprimido.length
  }

  const centralBuf = Buffer.concat(central)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(central.length / 2, 8)
  fim.writeUInt16LE(central.length / 2, 10)
  fim.writeUInt32LE(centralBuf.length, 12)
  fim.writeUInt32LE(offset, 16)

  return Buffer.concat([...locais, centralBuf, fim])
}

const zipPath = join(OUT, `nevo-extension-${version}.zip`)
writeFileSync(zipPath, zip(pasta))

// ─── Políticas: instalação sem que o funcionário faça nada ───────────────────

const LOJA = 'https://clients2.google.com/service/update2/crx'

function reg(raiz) {
  return [
    'Windows Registry Editor Version 5.00',
    '',
    `; Instala a extensão do Nevo automaticamente em toda máquina gerenciada.`,
    `; O funcionário não faz nada: na próxima abertura do navegador ela já está lá,`,
    `; e não pode ser removida por engano.`,
    '',
    `[${raiz}\\ExtensionInstallForcelist]`,
    `"1"="${storeId ?? '<ID-DA-EXTENSAO-NA-LOJA>'};${LOJA}"`,
    '',
  ].join('\r\n')
}

writeFileSync(
  join(OUT, 'politica-chrome.reg'),
  reg('HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome'),
)
writeFileSync(
  join(OUT, 'politica-edge.reg'),
  reg('HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Edge'),
)
writeFileSync(
  join(OUT, 'politica-mdm.json'),
  `${JSON.stringify(
    { ExtensionInstallForcelist: [`${storeId ?? '<ID-DA-EXTENSAO-NA-LOJA>'};${LOJA}`] },
    null,
    2,
  )}\n`,
)

// ─── Relatório ───────────────────────────────────────────────────────────────

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

console.log(
  [
    '',
    `Extensão do Nevo ${version} empacotada para ${origin}`,
    '',
    `  ${relative(ROOT, zipPath)}  (${kb(statSync(zipPath).size)})  → Chrome Web Store`,
    `  ${relative(ROOT, pasta)}/  → "Carregar sem compactação" (teste local)`,
    `  ${relative(ROOT, join(OUT, 'politica-chrome.reg'))}  → instalação automática, Chrome`,
    `  ${relative(ROOT, join(OUT, 'politica-edge.reg'))}    → instalação automática, Edge`,
    `  ${relative(ROOT, join(OUT, 'politica-mdm.json'))}    → mesma regra via MDM/Intune`,
    '',
    storeId
      ? `Id da loja: ${storeId} (já embutido nas políticas)`
      : 'Sem --id: as políticas saem com um marcador no lugar do id da loja.',
    '',
  ].join('\n'),
)
