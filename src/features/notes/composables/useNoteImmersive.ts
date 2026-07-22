import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Modo imersivo: a nota ocupa a tela inteira e o resto do app some.
 *
 * Usa a Fullscreen API quando o navegador permite e degrada para "tela cheia
 * dentro da janela" quando não permite (a chamada exige gesto do usuário e
 * falha em iframe sem `allow="fullscreen"`). Nos dois casos o estado visual é o
 * mesmo, então a falha do fullscreen não deixa a UI inconsistente.
 *
 * A preferência não é persistida de propósito: não existe como restaurar
 * fullscreen no carregamento da página sem um gesto, e voltar só o layout
 * deixaria o usuário num modo que ele não pediu.
 */
export function useNoteImmersive() {
  const immersive = ref(false)

  /**
   * Marca o documento e neutraliza o app por baixo. O `inert` importa de
   * verdade: a nota é teleportada para o body, então sem ele o Tab continua
   * passeando pela sidebar e pela topbar invisíveis, e o leitor de tela anuncia
   * uma interface que não está mais na frente do usuário.
   */
  function applyChrome(active: boolean) {
    const root = document.documentElement
    const app = document.getElementById('app')
    if (active) {
      root.dataset.immersive = 'true'
      app?.setAttribute('inert', '')
    } else {
      delete root.dataset.immersive
      app?.removeAttribute('inert')
    }
  }

  async function enter() {
    immersive.value = true
    applyChrome(true)
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }

  async function exit() {
    immersive.value = false
    applyChrome(false)
    if (document.fullscreenElement) {
      await document.exitFullscreen?.().catch(() => {})
    }
  }

  const toggleImmersive = () => (immersive.value ? exit() : enter())

  /** Esc sai do modo mesmo quando o fullscreen do navegador não chegou a abrir. */
  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && immersive.value) {
      event.preventDefault()
      void exit()
    }
  }

  /** O usuário pode sair pelo próprio navegador (F11, Esc): acompanha. */
  function onFullscreenChange() {
    if (!document.fullscreenElement && immersive.value) {
      immersive.value = false
      applyChrome(false)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
    document.addEventListener('fullscreenchange', onFullscreenChange)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    // Sair da nota pelo botão voltar não pode deixar o app inerte para sempre.
    applyChrome(false)
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})
  })

  return { immersive, toggleImmersive }
}
