/**
 * Aviso de "a aba voltou".
 *
 * Existe por causa dos cronômetros: o browser congela `setInterval` de aba
 * oculta (a partir de ~5 minutos ele roda no máximo 1 vez por minuto), e o
 * timer do work-flow roda justamente enquanto a pessoa trabalha em OUTRA aba.
 * O resultado era voltar depois de um tempo e ver o cronômetro parado num valor
 * velho até o próximo tique. Quem desenha tempo real precisa recalcular no
 * instante em que a aba reaparece, não esperar o tique.
 */
export function onTabVisible(callback: () => void): () => void {
  const onVisibility = () => {
    if (!document.hidden) callback()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', callback)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', callback)
  }
}
