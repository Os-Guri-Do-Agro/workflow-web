# Spec: O Nevo não acusa ociosidade sem uma fonte que enxergue o computador

**Status:** Concluído
**Autor:** Nicolas (via Claude)
**Criado em:** 2026-09-22
**Concluído em:** 2026-09-22
**Versão:** 1.0
**Depende de:** [`timer-confiavel.md`](../q3-2/timer-confiavel.md) (Concluída)

---

## O relato

> "7 minutos rodando no cronômetro mexendo em outras abas mas ele fica nessa.
> ainda por ai ainda por ai, puts que raiva"

O cronômetro estava certo. O que estava errado era o app acusar quem trabalhava.

## O que acontecia

O aviso de ociosidade subia por ausência de eventos **na aba do Nevo**
(`pointermove`, `keydown`, `wheel`, `touchstart`). Trabalhar em outra aba não
produz nenhum desses eventos, então, passado o limiar (5, 10 ou 15 min conforme
a preferência), o app:

1. subia o card "Você ainda está por aí?";
2. punha o título da aba a piscar **"Ainda por aí?" a cada 1,2 s**
   (`useTimerDocumentTitle.ts`);
3. acendia o favicon e a pílula âmbar do widget.

Com a aba em segundo plano, o título piscando era a única coisa visível. O app
interrogava exatamente quem estava trabalhando, e insistia.

## A causa

A regra certa **já estava escrita no código**, em `cortaAutomatico`
(`useTimerIdleGuard.ts`), com a justificativa por extenso:

> `protectionLevel === 'full'`: mesmo com a chave ligada, cortar exige uma fonte
> que enxergue o computador inteiro. Sem ela, "sem eventos na aba" só quer dizer
> que o Nevo está minimizado.

Ela estava aplicada na **conclusão** mais grave (cortar o tempo) e não na
**premissa** (afirmar que a pessoa parou). O aviso continuava usando um sinal que
o próprio código classificava como insuficiente.

## Decisões

### D1 — Fonte não confiável não avisa

`evaluate()` só entra em `warning` com `protectionLevel === 'full'`, ou seja com
`IdleDetector` (permissão do navegador) ou com a extensão. Fonte `tab` não
sustenta nenhuma afirmação sobre a pessoa.

Isso desliga as três superfícies de uma vez, porque todas leem `idlePhase`: card,
título piscando e favicon.

### D2 — A rede de segurança não se perde, e fica melhor

O que continua protegendo quem esquece o timer aberto:

| Situação | Quem cobre | Quando |
|---|---|---|
| Navegador morreu, reboot, máquina dormiu | servidor: `staleSince` + `GET /time/abandoned` | pergunta **quando a pessoa volta**, não no meio do trabalho |
| Timer rodando há muito tempo | `FORGOTTEN_SEC` (8 h) no widget | por **duração**, que o app mede sem palpite |
| Entrada absurda | `AUTO_STOP_SEC` (12 h) e `MAX_ENTRY_SEC` (24 h) no servidor | idem |

Nenhuma delas depende de adivinhar atividade.

### D3 — Quem promete o corte é `cortaAutomatico`, não `protectionLevel`

Defeito encontrado ao aplicar D1: o card e o widget escolhiam o texto por
`protection`, mas o corte depende **também** da chave geral
`TIMER_AUTO_STOP_ENABLED`, desligada desde 27/08/2026. Com proteção completa, o
card dizia "eu paro o tempo no último momento em que você estava ativo" ao lado
de uma contagem regressiva parada em **00:00** (`secondsToCut` devolve 0 sem
corte). Agora as três superfícies leem a mesma fonte, exposta como
`useTimerIdleGuard().cuts`.

### D4 — A tela de Proteção passa a descrever o comportamento real

O texto do modo limitado dizia "ele avisa quando você some" — o que deixou de ser
verdade — e o do modo completo prometia corte automático, que a chave desligada
não entrega. Os dois foram reescritos.

## Sobre "alguma lib npm que resolva isso 100%"

Não existe, e a razão não é falta de biblioteca:

- A API que faz a captação real é a **Idle Detection API**
  (`navigator.IdleDetector`): ela enxerga teclado/mouse no sistema inteiro e a
  tela bloqueada. É **só Chromium e exige permissão**; Mozilla e Apple recusaram
  implementar por fingerprinting.
- Fora dela, um site não sabe o que você faz em outra aba ou em outro programa.
  É uma garantia da plataforma, não uma lacuna de mercado. Qualquer pacote npm
  que prometa isso ou embrulha essa API, ou mede `mousemove` na própria aba —
  exatamente o sinal que causou este problema.

O projeto **já implementa as duas fontes confiáveis** (`useIdleDetection.ts` para
a permissão, `useExtensionBridge.ts` + `extension/background.js` com
`chrome.idle` para a extensão). O que faltava não era captação: era o app
respeitar o próprio diagnóstico quando não tem nenhuma delas.

## Arquivos Impactados

| Arquivo | Mudança |
|---|---|
| `src/composables/useTimerIdleGuard.ts` | o gate em `evaluate()`; expõe `cuts` |
| `src/components/onboarding/IdleAlert.vue` | texto e contagem por `cuts` |
| `src/core/components/shells/shared/TimerWidget.vue` | idem, na pílula e no eco |
| `src/features/settings/ProtectionView.vue` | copy dos dois estados |

## Verificação

- [x] `npm run type-check`, `eslint` e `npm run build` limpos.
- [ ] **Não exercitado no navegador.** O caminho para validar em um minuto:
      Configurações › Proteção › Diagnóstico de ociosidade → "simular ausência"
      (`IdleDiagnostics.vue`, `simulateAbsence()`). Sem permissão concedida, o
      aviso não deve subir; concedendo a permissão, ele volta a subir.

## Efeito para quem usa

- Sem permissão nem extensão (o caso do relato): **o app fica quieto**. O
  cronômetro continua correndo e contando pelo `startedAt` do servidor.
- Com permissão ou extensão: o aviso funciona como antes, só que agora é
  verdade — ele vem de quem realmente viu o computador parado.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-09-22 | 1.0 | Criada já concluída, a partir de um relato de uso real | Nicolas (via Claude) |
