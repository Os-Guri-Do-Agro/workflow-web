/**
 * Detector de atividade do Nevo (service worker da extensão, MV3).
 *
 * Por que a extensão existe: `IdleDetector` (a API web) resolve o mesmo
 * problema, mas exige uma permissão que muita gente nunca vê, o Chrome silencia
 * em várias máquinas, e ela morre junto com a aba. `chrome.idle` não pede
 * permissão nenhuma ao usuário, enxerga o sistema operacional inteiro (mouse,
 * teclado, tela bloqueada) e continua funcionando com o Nevo fechado.
 *
 * O que ele faz, e só isso: mantém `lastActivityAt` — o instante em que a
 * pessoa foi vista ativa pela última vez. Não observa qual site, qual janela,
 * qual programa. O sinal é binário: ativo ou não.
 *
 * O tempo NÃO é enviado para servidor nenhum daqui. Quem fala com a API é o
 * app, que lê este valor pela ponte do content script — assim a extensão nunca
 * precisa guardar credencial de ninguém.
 */

/** Mínimo aceito pelo Chrome. Medimos os limiares do produto no app. */
const DETECTION_INTERVAL_SEC = 60

/** Estado persistido: sobrevive ao service worker ser descarregado (MV3). */
const KEY = 'nevo.activity'

async function readState() {
  const stored = await chrome.storage.local.get(KEY)
  return stored[KEY] ?? { lastActivityAt: Date.now(), state: 'active', locked: false }
}

async function writeState(next) {
  await chrome.storage.local.set({ [KEY]: next })
}

/**
 * Marca atividade AGORA. Chamado quando o sistema volta de idle/locked: é a
 * transição que prova presença.
 */
async function markActive() {
  await writeState({ lastActivityAt: Date.now(), state: 'active', locked: false })
}

/**
 * O sistema entrou em idle (ou a tela travou). A API só informa a transição,
 * não o instante exato — o melhor que se sabe é "parado há pelo menos o
 * intervalo de detecção", então recuamos essa janela. Arredondar a favor da
 * pessoa custa até um minuto de tempo contado; arredondar contra apagaria
 * trabalho real.
 */
async function markIdle(locked) {
  const state = await readState()
  const inferred = Date.now() - DETECTION_INTERVAL_SEC * 1000
  await writeState({
    lastActivityAt: Math.min(state.lastActivityAt, locked ? Date.now() : inferred),
    state: locked ? 'locked' : 'idle',
    locked,
  })
}

chrome.idle.setDetectionInterval(DETECTION_INTERVAL_SEC)

chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') void markActive()
  else void markIdle(state === 'locked')
})

// O service worker do MV3 é descarregado a qualquer momento. O alarme o acorda
// periodicamente para reconciliar o estado — sem isso, uma volta de idle
// poderia passar despercebida enquanto ele estava dormindo.
chrome.alarms.create('nevo-idle-poll', { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'nevo-idle-poll') return
  const state = await chrome.idle.queryState(DETECTION_INTERVAL_SEC)
  if (state === 'active') await markActive()
  else await markIdle(state === 'locked')
})

/** Ponte com o app: o content script pede o estado, nunca o contrário. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'nevo-activity-request') return false
  void readState().then((state) =>
    sendResponse({
      type: 'nevo-activity',
      lastActivityAt: state.lastActivityAt,
      state: state.state,
      version: chrome.runtime.getManifest().version,
    }),
  )
  // true = a resposta é assíncrona (exigência da API de mensagens).
  return true
})
