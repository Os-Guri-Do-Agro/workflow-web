/** Estado atual do detector, para a pessoa conferir que está funcionando. */
chrome.runtime.sendMessage({ type: 'nevo-activity-request' }, (response) => {
  const el = document.getElementById('state')
  if (chrome.runtime.lastError || !response) {
    el.textContent = 'Não consegui falar com o detector.'
    return
  }
  const minutos = Math.round((Date.now() - response.lastActivityAt) / 60000)
  const rotulo =
    response.state === 'active'
      ? 'Ativo agora'
      : response.state === 'locked'
        ? 'Tela bloqueada'
        : 'Parado'
  el.textContent =
    minutos <= 1 ? `${rotulo} · atividade agora mesmo` : `${rotulo} · há ${minutos} min`
})
