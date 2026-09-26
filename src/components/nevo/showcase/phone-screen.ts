/**
 * Telas desenhadas em canvas 2D para a vitrine 3D: a "Sequência Diária" do
 * celular (réplica do mock do dono) e o card "Seu time" que sai da tela do
 * notebook no capítulo 4.
 *
 * Nada de three.js aqui: o canvas vira `CanvasTexture` na cena. Este arquivo só
 * sabe desenhar e dizer se o quadro mudou, para a cena subir a textura para a
 * GPU só quando precisa (subir 720x1560 a cada quadro custaria à toa).
 *
 * Cores: a tela do celular é ESCURA sempre, como no mock, e o notebook mostra o
 * print do dashboard no tema escuro. Por isso as cores saem da tabela do tema
 * escuro em `plugins/tokens.ts` (`themeTokens.dark`), e não do tema ativo: no
 * tema claro o celular continuaria escuro, como um aparelho de verdade. Hex é
 * tolerado dentro deste canvas desenhado (é pintura de mockup, não UI), mas nem
 * foi preciso: tudo vem dos tokens, com cor nomeada só como rede de segurança.
 */
import type { StreakMe, StreakMission, StreakTeam } from '@/service/streak/streak-service'
import {
  nevoSrc,
  nevoSize,
  WEEKDAY_SHORT,
  type NevoSpriteName,
} from '@/components/nevo/nevo-assets'
import { themeTokens } from '@/plugins/tokens'
import { avatarTone, initials } from '@/utils/avatar'

const DARK = themeTokens.dark

function tok(name: string, fallback: string): string {
  return DARK[name] ?? fallback
}

const P = {
  bg: tok('--bg', 'black'),
  surface: tok('--surface', 'black'),
  card: tok('--surface-2', 'dimgray'),
  cardHi: tok('--surface-3', 'gray'),
  border: tok('--border', 'gray'),
  borderStrong: tok('--border-strong', 'gray'),
  text: tok('--text', 'white'),
  text2: tok('--text-2', 'lightgray'),
  text3: tok('--text-3', 'darkgray'),
  green: tok('--success', 'seagreen'),
  flame: tok('--streak-flame', 'darkorange'),
  off: tok('--streak-off', 'gray'),
  rest: tok('--streak-rest', 'lightsteelblue'),
  perfect: tok('--streak-perfect', 'gold'),
  black: 'black',
}

/** Fonte do produto (Geist). Mesma pilha dos tokens, com fallback do sistema. */
const FONT = tok('--font-family', 'system-ui, sans-serif')

function font(weight: number, px: number): string {
  return `${weight} ${px}px ${FONT}`
}

// ─── Sprites (compartilhados entre as duas telas) ─────────────────────────────

const spriteCache = new Map<NevoSpriteName, HTMLImageElement>()
const spriteListeners = new Set<() => void>()

/** Imagem do sprite, carregando na primeira chamada. `null` até chegar. */
function sprite(name: NevoSpriteName): HTMLImageElement | null {
  let img = spriteCache.get(name)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.onload = () => spriteListeners.forEach((fn) => fn())
    img.src = nevoSrc(name)
    spriteCache.set(name, img)
  }
  return img.complete && img.naturalWidth > 0 ? img : null
}

/** Desenha o sprite pela ALTURA pedida, mantendo a proporção do manifesto. */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: NevoSpriteName,
  x: number,
  y: number,
  height: number,
): number {
  const [w, h] = nevoSize(name)
  const width = (height * w) / h
  const img = sprite(name)
  if (img) ctx.drawImage(img, x, y, width, height)
  return width
}

// ─── Primitivas de desenho ─────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.closePath()
}

function checkMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  color: string,
) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = s * 0.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - s * 0.42, cy + s * 0.02)
  ctx.lineTo(cx - s * 0.12, cy + s * 0.32)
  ctx.lineTo(cx + s * 0.44, cy - s * 0.3)
  ctx.stroke()
  ctx.restore()
}

/** Corta o texto com reticências para caber na largura. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}...`).width > max) t = t.slice(0, -1)
  return `${t.trimEnd()}...`
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Curva de "pop" (passa um pouco de 1 e volta), para o check nascer com mola. */
function pop(p: number): number {
  const t = clamp01(p)
  const c = 2.2
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

// ─── Dados de exemplo (quando a API ainda não respondeu ou falhou) ────────────

type WeekCell = 'secured' | 'perfect' | 'rest' | 'missed' | 'today' | 'future'

interface PhoneData {
  demo: boolean
  current: number
  week: WeekCell[]
  todaySecured: boolean
  missions: Pick<StreakMission, 'key' | 'label' | 'hint' | 'current' | 'target' | 'done'>[]
}

const DEMO_MISSIONS: PhoneData['missions'] = [
  {
    key: 'focus',
    label: 'Foque por 30 minutos',
    hint: 'Use o cronômetro em qualquer tarefa',
    current: 0,
    target: 30,
    done: false,
  },
  {
    key: 'task',
    label: 'Conclua 1 tarefa',
    hint: 'Mova uma tarefa para Concluído',
    current: 0,
    target: 1,
    done: false,
  },
  {
    key: 'collab',
    label: 'Movimente o time',
    hint: 'Comente ou atualize uma tarefa',
    current: 0,
    target: 1,
    done: false,
  },
]

/** Exemplo do mock: 12 dias, seg a sáb garantidos, domingo (hoje) pendente. */
function demoPhone(): PhoneData {
  return {
    demo: true,
    current: 12,
    week: ['secured', 'secured', 'secured', 'secured', 'secured', 'secured', 'today'],
    todaySecured: false,
    missions: DEMO_MISSIONS,
  }
}

function phoneDataFrom(s: StreakMe | null | undefined): PhoneData {
  if (!s) return demoPhone()
  const todayIdx = s.week.findIndex((d) => d.isToday)
  const week: WeekCell[] = s.week.slice(0, 7).map((d, i) => {
    if (d.isToday) return 'today'
    if (todayIdx !== -1 && i > todayIdx) return 'future'
    if (d.perfect) return 'perfect'
    if (d.secured) return 'secured'
    if (d.rest) return 'rest'
    return 'missed'
  })
  while (week.length < 7) week.push('future')
  return {
    demo: false,
    current: Math.max(0, s.current),
    week,
    todaySecured: s.securedToday,
    missions: s.missions.length === 3 ? s.missions : DEMO_MISSIONS,
  }
}

// ─── Tela do celular ───────────────────────────────────────────────────────────

export const PHONE_W = 720
export const PHONE_H = 1560

export interface PhoneFrame {
  /** 0..1 da contagem do número. */
  count: number
  /** 0..3 missões marcadas (fração = pop do check). */
  missions: number
  /** 0..1 chama de hoje acendendo. */
  todayLit: number
}

export interface PhoneScreen {
  canvas: HTMLCanvasElement
  setData(streak: StreakMe | null | undefined): void
  /** Redesenha se o quadro mudou. Devolve `true` quando desenhou. */
  drawFrame(f: PhoneFrame): boolean
  dispose(): void
}

const MISSION_ICON: Record<StreakMission['key'], NevoSpriteName> = {
  focus: 'ui-xicara',
  task: 'ui-alvo',
  collab: 'ui-estrela',
}

export function createPhoneScreen(onDirty: () => void): PhoneScreen {
  const canvas = document.createElement('canvas')
  canvas.width = PHONE_W
  canvas.height = PHONE_H
  const ctx = canvas.getContext('2d')!
  let data = phoneDataFrom(null)
  let dataVersion = 0
  let assetVersion = 0
  let lastKey = ''
  let lastFrame: PhoneFrame = { count: 1, missions: 0, todayLit: 0 }
  let disposed = false

  const bump = () => {
    if (disposed) return
    assetVersion++
    onDirty()
  }
  spriteListeners.add(bump)
  // A Geist pode chegar depois do primeiro desenho: redesenha quando carregar.
  void document.fonts?.ready.then(bump)

  function draw(f: PhoneFrame) {
    const shown = Math.round(clamp01(f.count) * data.current)
    ctx.clearRect(0, 0, PHONE_W, PHONE_H)
    ctx.fillStyle = P.bg
    ctx.fillRect(0, 0, PHONE_W, PHONE_H)
    ctx.textBaseline = 'middle'

    // Barra de status + ilha
    ctx.fillStyle = P.text
    ctx.font = font(650, 30)
    ctx.textAlign = 'left'
    ctx.fillText('9:41', 72, 62)
    ctx.fillStyle = P.black
    roundRect(ctx, PHONE_W / 2 - 104, 26, 208, 62, 31)
    ctx.fill()
    ctx.fillStyle = P.text
    for (let i = 0; i < 4; i++) {
      const h = 10 + i * 6
      roundRect(ctx, 540 + i * 13, 74 - h, 9, h, 2)
      ctx.fill()
    }
    ctx.strokeStyle = P.text
    ctx.lineWidth = 3
    roundRect(ctx, 606, 50, 48, 24, 7)
    ctx.stroke()
    roundRect(ctx, 610, 54, 34, 16, 4)
    ctx.fill()

    // Cabeçalho
    ctx.strokeStyle = P.text
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(82, 190)
    ctx.lineTo(50, 190)
    ctx.moveTo(66, 174)
    ctx.lineTo(50, 190)
    ctx.lineTo(66, 206)
    ctx.stroke()
    ctx.fillStyle = P.text
    ctx.font = font(700, 38)
    ctx.textAlign = 'center'
    ctx.fillText('Sequência Diária', PHONE_W / 2, 190)
    if (data.demo) {
      ctx.font = font(600, 22)
      const w = ctx.measureText('Exemplo').width + 28
      ctx.fillStyle = P.cardHi
      roundRect(ctx, PHONE_W - 36 - w, 172, w, 38, 19)
      ctx.fill()
      ctx.fillStyle = P.text2
      ctx.fillText('Exemplo', PHONE_W - 36 - w / 2, 192)
    }

    // Card da sequência
    ctx.fillStyle = P.card
    roundRect(ctx, 36, 262, 648, 300, 40)
    ctx.fill()
    ctx.strokeStyle = P.border
    ctx.lineWidth = 2
    ctx.stroke()
    drawSprite(ctx, 'fogo-normal', 58, 296, 150)
    const digits = String(shown).length
    ctx.fillStyle = P.text
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = font(800, digits >= 3 ? 112 : 150)
    ctx.fillText(String(shown), 190, 432)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = P.text2
    ctx.font = font(500, 30)
    ctx.fillText(data.current === 1 ? 'dia consecutivo' : 'dias consecutivos', 196, 474)
    drawSprite(ctx, 'idle', 432, 232, 272)
    const lit = clamp01(f.todayLit)
    ctx.fillStyle = P.text
    ctx.font = font(600, 32)
    const message =
      lit >= 1
        ? 'Dia garantido! Continue assim.'
        : !data.demo && data.current === 0
          ? 'Comece sua sequência hoje!'
          : 'Você está indo muito bem!'
    ctx.fillText(message, 70, 530)

    // Semana
    ctx.fillStyle = P.card
    roundRect(ctx, 36, 590, 648, 176, 36)
    ctx.fill()
    ctx.strokeStyle = P.border
    ctx.lineWidth = 2
    ctx.stroke()
    const slot = 648 / 7
    data.week.forEach((cell, i) => {
      const cx = 36 + slot * (i + 0.5)
      const cy = 652
      const r = 32
      if (cell === 'today') {
        // Hoje: anel laranja sempre (como no mock). A chama apagada some
        // enquanto a acesa nasce com mola, sem troca seca de imagem.
        const on = data.todaySecured ? 1 : lit
        ctx.save()
        ctx.strokeStyle = P.flame
        ctx.lineWidth = 5
        circle(ctx, cx, cy, r)
        ctx.stroke()
        if (on < 1) {
          ctx.globalAlpha = 0.35 * (1 - on)
          drawSprite(ctx, 'fogo-normal', cx - 20, cy - 25, 50)
          ctx.globalAlpha = 1
        }
        if (on > 0) {
          const s = on >= 1 ? 1 : pop(on)
          ctx.translate(cx, cy)
          ctx.scale(s, s)
          drawSprite(ctx, 'fogo-normal', -20, -25, 50)
        }
        ctx.restore()
      } else if (cell === 'secured' || cell === 'perfect') {
        ctx.fillStyle = cell === 'perfect' ? P.perfect : P.green
        circle(ctx, cx, cy, r)
        ctx.fill()
        checkMark(ctx, cx, cy, 30, P.bg)
      } else if (cell === 'rest') {
        ctx.strokeStyle = P.rest
        ctx.lineWidth = 3
        circle(ctx, cx, cy, r - 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx - 10, cy)
        ctx.lineTo(cx + 10, cy)
        ctx.stroke()
      } else if (cell === 'missed') {
        ctx.strokeStyle = P.off
        ctx.lineWidth = 3
        circle(ctx, cx, cy, r - 2)
        ctx.stroke()
      } else {
        ctx.fillStyle = P.cardHi
        circle(ctx, cx, cy, r - 2)
        ctx.fill()
      }
      ctx.fillStyle = cell === 'today' ? P.text : P.text2
      ctx.font = font(cell === 'today' ? 700 : 500, 26)
      ctx.textAlign = 'center'
      ctx.fillText(WEEKDAY_SHORT[i] ?? '', cx, 724)
    })

    // Sua jornada
    ctx.textAlign = 'left'
    ctx.fillStyle = P.text
    ctx.font = font(700, 36)
    ctx.fillText('Sua jornada', 44, 824)
    data.missions.forEach((m, i) => {
      const y = 864 + i * 146
      const p = clamp01(f.missions - i)
      const done = m.done || p >= 1
      const popping = !m.done && p > 0 && p < 1
      ctx.fillStyle = P.card
      roundRect(ctx, 36, y, 648, 128, 30)
      ctx.fill()
      ctx.strokeStyle = P.border
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = P.cardHi
      circle(ctx, 104, y + 64, 42)
      ctx.fill()
      drawSprite(ctx, MISSION_ICON[m.key], 72, y + 32, 64)
      ctx.fillStyle = P.text
      ctx.font = font(600, 30)
      ctx.fillText(fit(ctx, m.label, 400), 164, y + 46)
      const showDone = m.done || p >= 0.5
      ctx.font = font(showDone ? 600 : 500, 25)
      ctx.fillStyle = showDone ? P.green : P.text3
      ctx.fillText(showDone ? 'Concluído!' : fit(ctx, missionProgress(m), 400), 164, y + 88)
      const cx = 628
      const cy = y + 64
      if (done || popping) {
        ctx.save()
        ctx.translate(cx, cy)
        const s = popping ? pop(p) : 1
        ctx.scale(s, s)
        ctx.fillStyle = P.green
        circle(ctx, 0, 0, 26)
        ctx.fill()
        checkMark(ctx, 0, 0, 26, P.bg)
        ctx.restore()
      } else {
        ctx.strokeStyle = P.off
        ctx.lineWidth = 3
        circle(ctx, cx, cy, 24)
        ctx.stroke()
      }
    })

    // Botão
    ctx.fillStyle = P.green
    roundRect(ctx, 36, 1318, 648, 104, 32)
    ctx.fill()
    ctx.fillStyle = P.bg
    ctx.font = font(700, 34)
    ctx.textAlign = 'center'
    ctx.fillText('Continuar', PHONE_W / 2, 1370)

    // Navegação inferior
    ctx.fillStyle = P.border
    ctx.fillRect(0, 1452, PHONE_W, 2)
    const nav: { label: string; x: number; active?: boolean }[] = [
      { label: 'Início', x: 90 },
      { label: 'Board', x: 270 },
      { label: 'Sequência', x: 450, active: true },
      { label: 'Perfil', x: 630 },
    ]
    ctx.lineWidth = 4
    for (const item of nav) {
      const color = item.active ? P.green : P.text3
      ctx.strokeStyle = color
      ctx.fillStyle = color
      const ix = item.x
      const iy = 1494
      if (item.label === 'Início') {
        ctx.beginPath()
        ctx.moveTo(ix - 18, iy - 2)
        ctx.lineTo(ix, iy - 18)
        ctx.lineTo(ix + 18, iy - 2)
        ctx.moveTo(ix - 13, iy - 6)
        ctx.lineTo(ix - 13, iy + 16)
        ctx.lineTo(ix + 13, iy + 16)
        ctx.lineTo(ix + 13, iy - 6)
        ctx.stroke()
      } else if (item.label === 'Board') {
        for (let c = 0; c < 3; c++) {
          roundRect(ctx, ix - 18 + c * 13, iy - 16, 10, c === 1 ? 24 : 32, 3)
          ctx.stroke()
        }
      } else if (item.label === 'Sequência') {
        drawSprite(ctx, 'fogo-normal', ix - 15, iy - 20, 38)
      } else {
        circle(ctx, ix, iy - 8, 9)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(ix, iy + 20, 17, Math.PI * 1.1, Math.PI * 1.9)
        ctx.stroke()
      }
      ctx.font = font(item.active ? 700 : 500, 24)
      ctx.fillStyle = color
      ctx.fillText(item.label, ix, 1536)
    }
  }

  return {
    canvas,
    setData(streak) {
      data = phoneDataFrom(streak)
      dataVersion++
      onDirty()
    },
    drawFrame(f) {
      lastFrame = f
      const shown = Math.round(clamp01(f.count) * data.current)
      // Quantiza o que anima para só redesenhar quando o pixel muda de fato.
      const mq = Math.round(f.missions * 12)
      const lq = Math.round(clamp01(f.todayLit) * 10)
      const key = `${shown}|${mq}|${lq}|${dataVersion}|${assetVersion}`
      if (key === lastKey) return false
      lastKey = key
      draw(lastFrame)
      return true
    },
    dispose() {
      disposed = true
      spriteListeners.delete(bump)
    },
  }
}

function missionProgress(m: PhoneData['missions'][number]): string {
  if (m.current <= 0) return m.hint
  if (m.key === 'focus') return `${m.current} de ${m.target} min`
  if (m.key === 'task')
    return `${m.current} de ${m.target} ${m.target === 1 ? 'tarefa' : 'tarefas'}`
  return m.hint
}

// ─── Card "Seu time" (sai da tela do notebook) ───────────────────────────────

export const TEAM_W = 960
export const TEAM_H = 640

interface TeamRow {
  /** Nome exibido ("Você" para a própria pessoa). */
  name: string
  /** Nome real, para iniciais e tom do avatar (os mesmos do resto do app). */
  person: string
  isMe: boolean
  current: number
  securedToday: boolean
  rest: boolean
  points: number
}

interface TeamData {
  demo: boolean
  rows: TeamRow[]
  securedToday: number
  total: number
  teamStreak: number
}

function teamDataFrom(
  team: StreakTeam | null | undefined,
  me: StreakMe | null | undefined,
): TeamData {
  if (team && team.members.length > 1) {
    return {
      demo: false,
      rows: team.members.slice(0, 4).map((m) => ({
        name: m.isMe ? 'Você' : m.user.name,
        person: m.user.name,
        isMe: m.isMe,
        current: m.current,
        securedToday: m.securedToday,
        rest: m.todayIsRest,
        points: m.points.week,
      })),
      securedToday: team.summary.securedToday,
      total: team.summary.total,
      teamStreak: team.summary.teamStreak,
    }
  }
  // Exemplo com nomes fictícios e o selo "Exemplo" no card: sem time real
  // (empresa de uma pessoa só, API fora) a vitrine ainda conta a história.
  return {
    demo: true,
    rows: [
      {
        name: 'Ana Souza',
        person: 'Ana Souza',
        isMe: false,
        current: 21,
        securedToday: true,
        rest: false,
        points: 186,
      },
      {
        name: 'Bruno Lima',
        person: 'Bruno Lima',
        isMe: false,
        current: 14,
        securedToday: true,
        rest: false,
        points: 142,
      },
      {
        name: 'Você',
        person: 'Você',
        isMe: true,
        current: me?.current ?? 12,
        securedToday: me?.securedToday ?? false,
        rest: false,
        points: me?.points.week ?? 120,
      },
      {
        name: 'Carla Dias',
        person: 'Carla Dias',
        isMe: false,
        current: 8,
        securedToday: true,
        rest: false,
        points: 96,
      },
    ],
    securedToday: 3,
    total: 4,
    teamStreak: 0,
  }
}

/** Cor de pessoa do tema escuro, com o mesmo hash do resto do app. */
function personColor(name: string): string {
  const n = /--avatar-(\d)/.exec(avatarTone(name))?.[1] ?? '1'
  return tok(`--avatar-${n}`, 'slategray')
}

export interface TeamCard {
  canvas: HTMLCanvasElement
  setData(team: StreakTeam | null | undefined, me: StreakMe | null | undefined): void
  dispose(): void
}

export function createTeamCard(onDirty: () => void): TeamCard {
  const canvas = document.createElement('canvas')
  canvas.width = TEAM_W
  canvas.height = TEAM_H
  const ctx = canvas.getContext('2d')!
  let data = teamDataFrom(null, null)
  let disposed = false

  function draw() {
    ctx.clearRect(0, 0, TEAM_W, TEAM_H)
    ctx.textBaseline = 'middle'
    ctx.fillStyle = P.surface
    roundRect(ctx, 3, 3, TEAM_W - 6, TEAM_H - 6, 44)
    ctx.fill()
    ctx.strokeStyle = P.borderStrong
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = P.text
    ctx.font = font(700, 44)
    ctx.fillText('Seu time', 48, 76)
    ctx.fillStyle = P.text3
    ctx.font = font(500, 27)
    const sub =
      data.teamStreak > 0
        ? `Sequência do time: ${data.teamStreak} ${data.teamStreak === 1 ? 'dia' : 'dias'}`
        : `${data.securedToday} de ${data.total} garantiram o dia hoje`
    ctx.fillText(fit(ctx, sub, 640), 48, 122)
    if (data.demo) {
      ctx.font = font(600, 24)
      const w = ctx.measureText('Exemplo').width + 32
      ctx.fillStyle = P.cardHi
      roundRect(ctx, TEAM_W - 48 - w, 54, w, 44, 22)
      ctx.fill()
      ctx.fillStyle = P.text2
      ctx.textAlign = 'center'
      ctx.fillText('Exemplo', TEAM_W - 48 - w / 2, 77)
      ctx.textAlign = 'left'
    }

    data.rows.forEach((row, i) => {
      const y = 158 + i * 116
      if (i > 0) {
        ctx.fillStyle = P.border
        ctx.fillRect(48, y, TEAM_W - 96, 2)
      }
      const cy = y + 58
      const tone = personColor(row.person)
      ctx.save()
      ctx.globalAlpha = 0.2
      ctx.fillStyle = tone
      circle(ctx, 90, cy, 36)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = tone
      ctx.font = font(700, 27)
      ctx.textAlign = 'center'
      ctx.fillText(initials(row.person), 90, cy + 1)

      ctx.textAlign = 'left'
      ctx.fillStyle = P.text
      ctx.font = font(650, 31)
      ctx.fillText(fit(ctx, row.name, 420), 148, cy - 18)
      ctx.font = font(500, 24)
      ctx.fillStyle = row.securedToday ? P.green : row.rest ? P.rest : P.text3
      ctx.fillText(
        row.securedToday ? 'Garantiu hoje' : row.rest ? 'Dia de descanso' : 'Ainda não garantiu',
        148,
        cy + 22,
      )

      ctx.save()
      if (!row.securedToday) ctx.globalAlpha = 0.4
      drawSprite(ctx, 'fogo-normal', 690, cy - 30, 56)
      ctx.restore()
      ctx.fillStyle = P.text
      ctx.font = font(800, 42)
      ctx.fillText(String(row.current), 744, cy - 4)
      ctx.textAlign = 'right'
      ctx.fillStyle = P.text3
      ctx.font = font(500, 23)
      ctx.fillText(`${row.points} pts`, TEAM_W - 48, cy + 26)
    })
  }

  const redraw = () => {
    if (disposed) return
    draw()
    onDirty()
  }
  spriteListeners.add(redraw)
  void document.fonts?.ready.then(redraw)
  draw()

  return {
    canvas,
    setData(team, me) {
      data = teamDataFrom(team, me)
      redraw()
    },
    dispose() {
      disposed = true
      spriteListeners.delete(redraw)
    },
  }
}
