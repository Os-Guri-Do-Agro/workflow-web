// Ajuda comum dos roteiros do harness para o AppSelect (reka-ui Select).
//
// O AppSelect não é um <select>: o gatilho é um botão role="combobox" e a lista
// abre num portal, com role="option". Então `page.selectOption(...)` não serve.
// Aqui ficam os gestos que os roteiros usam:
//
//   const { pickOption, pickByKeyboard, selectedText, optionTexts, combo } = require('./app-select.cjs')
//   await pickOption(page, '[data-field="kind"]', 'Carrossel')   // clica no gatilho e na opção
//   await pickByKeyboard(page, '[data-field="kind"]', 'Reels')    // seta + Enter
//   await selectedText(page, '[data-field="kind"]')               // texto mostrado no gatilho
//
// `scope` pode ser um seletor CSS, um Locator (o contêiner do campo OU o próprio
// botão combobox) ou um aria-label dado como { label: 'Tipo' }. A opção se
// escolhe pelo TEXTO visível (o AppSelect não expõe o valor no DOM).

/** Locator do botão combobox de um campo. */
function combo(page, scope) {
  let loc
  if (typeof scope === 'string') loc = page.locator(scope)
  else if (scope && typeof scope.locator === 'function') loc = scope
  else if (scope && scope.label) return page.getByRole('combobox', { name: scope.label, exact: true }).first()
  else throw new Error('app-select: escopo inválido')
  // Contêiner (wrapper) ou o próprio botão: o `:scope` casa quando já é o combobox.
  return loc.locator('button[role="combobox"]').or(loc.and(page.locator('button[role="combobox"]'))).first()
}

/** Abre a lista e espera as opções aparecerem. */
async function openSelect(page, scope) {
  const trigger = combo(page, scope)
  await trigger.waitFor({ state: 'visible', timeout: 10000 })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await page.locator('[role="listbox"]').first().waitFor({ state: 'visible', timeout: 5000 })
  return trigger
}

/** Fecha a lista (se estiver aberta) sem escolher nada. */
async function closeSelect(page) {
  if (await page.locator('[role="listbox"]').count()) {
    await page.keyboard.press('Escape')
    await page.locator('[role="listbox"]').first().waitFor({ state: 'detached', timeout: 6000 }).catch(() => {})
  }
}

/** Abre o campo e clica na opção de nome `label` (texto exato). */
async function pickOption(page, scope, label) {
  await openSelect(page, scope)
  await page.getByRole('option', { name: label, exact: true }).click()
  await page.locator('[role="listbox"]').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
}

/** Escolhe pelo teclado: foca o gatilho, abre com Enter e anda com as setas até a opção. */
async function pickByKeyboard(page, scope, label) {
  const trigger = combo(page, scope)
  await trigger.waitFor({ state: 'visible', timeout: 10000 })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.locator('[role="listbox"]').first().waitFor({ state: 'visible', timeout: 5000 })
  const names = await optionTexts(page)
  const target = names.indexOf(label)
  if (target < 0) throw new Error(`app-select: opção "${label}" não existe em [${names.join(' | ')}]`)
  // A lista abre com a opção marcada (ou a primeira) em destaque; espera o destaque aparecer.
  await page.waitForFunction(() => !!document.querySelector('[role="listbox"] [role="option"][data-highlighted]'), null, { timeout: 3000 }).catch(() => {})
  // Anda uma seta por vez e confere o destaque depois de cada uma. O reka move o
  // foco no quadro seguinte e, com a máquina carregada, uma seta pode se perder:
  // em vez de pausa fixa, espera o destaque mudar e reaperta se não mudou.
  const highlighted = () =>
    page.evaluate(() => {
      const opts = [...document.querySelectorAll('[role="listbox"] [role="option"]')]
      const i = opts.findIndex((o) => o.hasAttribute('data-highlighted'))
      return i < 0 ? 0 : i
    })
  let active = await highlighted()
  for (let tries = 0; active !== target && tries < names.length * 3; tries++) {
    const before = active
    await page.keyboard.press(target > active ? 'ArrowDown' : 'ArrowUp')
    await page
      .waitForFunction(
        (prev) => {
          const opts = [...document.querySelectorAll('[role="listbox"] [role="option"]')]
          return opts.findIndex((o) => o.hasAttribute('data-highlighted')) !== prev
        },
        before,
        { timeout: 1500 },
      )
      .catch(() => {})
    active = await highlighted()
  }
  if (active !== target) throw new Error(`app-select: não cheguei em "${label}" pelas setas (parou em ${active}, alvo ${target})`)
  await page.keyboard.press('Enter')
  await page.locator('[role="listbox"]').first().waitFor({ state: 'detached', timeout: 6000 }).catch(() => {})
}

/** Textos das opções da lista aberta. */
async function optionTexts(page) {
  return (await page.locator('[role="listbox"]').first().getByRole('option').allInnerTexts()).map((t) => t.trim())
}

/** Texto mostrado no gatilho (a opção escolhida ou o placeholder). */
async function selectedText(page, scope) {
  return (await combo(page, scope).innerText()).replace(/\s+/g, ' ').trim()
}

/** Abre, lê as opções e fecha. */
async function listOptions(page, scope) {
  await openSelect(page, scope)
  const names = await optionTexts(page)
  await closeSelect(page)
  return names
}

module.exports = { combo, openSelect, closeSelect, pickOption, pickByKeyboard, optionTexts, selectedText, listOptions }
