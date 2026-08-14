# Spec: Cronômetro confiável (nunca cortar tempo trabalhado)

**Status:** Em Implementação (P1, P2 e P3 entregues; falta aplicar migration e empacotar a extensão)
**Autor:** Nicolas (com Claude)
**Criado em:** 2026-08-13
**Última atualização:** 2026-08-13
**Versão:** 2.0

> Sucessora operacional de [timer-ociosidade.md](./timer-ociosidade.md), que
> entregou o aviso e o corte. Esta trata do que aquela errou.

---

## Visão Geral

> Fazer o cronômetro parar **apenas** quando a pessoa realmente parou, com a
> política de corte amarrada à qualidade do sinal disponível, e não à ausência
> de eventos numa aba.

## O que quebrou, e por quê

Gente do time relatou que **o cronômetro parava só de minimizar o navegador**.

A causa não foi um bug isolado; foi uma decisão errada de política, tomada na
spec anterior e documentada lá como risco Alto:

1. `useIdleDetection` classifica a fonte do sinal em `detectionSource`
   (`system` quando a `IdleDetector` está ativa, `tab` quando só há eventos de
   DOM).
2. **O guard nunca lia esse valor.** `cut('auto')` executava igual nos dois
   modos.
3. Em modo `tab`, "não vejo eventos" e "a pessoa saiu do computador" são o
   MESMO sinal. Minimizar o Nevo para trabalhar no VS Code produzia corte.

E havia um agravante que impedia a saída natural do problema: **a permissão que
resolve tudo quase nunca era pedida**. `nextStep` exigia resolver a notificação
antes de oferecer a detecção, e o Chrome com "silenciar solicitações de
notificação" (padrão em muita máquina) resolve para negado sem exibir nada.
Nesse caminho, a detecção jamais chegava a ser oferecida, e o convite discreto
no canto sumia para sempre depois de um "agora não".

---

## Princípio que passa a valer

**A política de corte é função da confiança do sinal, nunca do silêncio.**

| Fonte | Enxerga | Corta sozinho? |
|---|---|---|
| `system` (`IdleDetector`) | O computador inteiro, mesmo com o Nevo minimizado | Sim |
| `extension` (planejada) | O mesmo, e ainda com a aba fechada | Sim |
| `tab` (eventos de DOM) | Só a própria aba | **Nunca** |

Em modo `tab` o produto continua avisando — favicon, título, notificação e card
do Nevo —, com o texto ajustado para não prometer o que não vai fazer, e com
"Parar agora" à mão. O erro que o produto aceita cometer é **hora inflada de
quem ignora o aviso**, jamais **tempo trabalhado apagado**.

---

## Fases

### P1 — Parar de cortar indevido (CONCLUÍDA)

- [x] `TRUSTED_SOURCES` + `protectionLevel` (`full` | `limited`) em `idle-state.ts`.
- [x] `cut('auto')` recusa executar fora do modo `full`.
- [x] Notificação e card com texto próprio do modo limitado; contagem regressiva
      não aparece onde não há corte.
- [x] Permissões **independentes**, com a detecção primeiro (ela muda o
      comportamento; a notificação muda só o alcance).
- [x] `IdleProtectionDialog`: diálogo que interrompe ao iniciar o cronômetro
      enquanto a proteção estiver limitada, com o estado de cada permissão, o
      que muda em cada caso e instrução do cadeado quando bloqueada. Adia 24h no
      "agora não" — não some para sempre como o card antigo.
- [x] Selo de "proteção limitada" no widget, levando ao diálogo.

**Verificado** (Edge headless, API interceptada, `?idleDebug=1`):

| Cenário | Resultado |
|---|---|
| **Sem** permissão de detecção, 65s parado | Aviso aparece com "não vou parar sozinho"; **0 chamadas de stop** |
| Com permissão, "Parar agora" | Corta 35s antes do clique (no último momento ativo) |
| Com permissão, "Continuar contando" | Nenhum corte nos 20s seguintes |

### P2 — Contagem reconstruível (CONCLUÍDA)

A entrada aberta deixou de ser caixa-preta entre start e stop.

- [x] Schema: `lastActivityAt`, `lastSeenAt`, `closeReason` + migration à mão
      (`20260813120000_timer_heartbeat`, aditiva e idempotente). **Não aplicada.**
- [x] `POST /time/heartbeat`: o cliente diz ATÉ QUANDO viu atividade e recebe de
      volta a maior atividade conhecida entre todos os dispositivos. Nunca
      retrocede, nunca aceita futuro nem instante anterior ao início.
- [x] **Arbitragem no `stop`**: corte retroativo anterior à atividade que o
      servidor conhece é recusado com 409 — uma máquina não apaga o tempo que
      outra está produzindo.
- [x] `GET /time/abandoned` + `POST /time/entries/:id/resolve`: cliente sumido
      não vira decisão automática, vira pergunta com quatro saídas (última
      atividade / até agora / horário à mão / descartar).
- [x] Esquecido de 12h passou a fechar na **última atividade conhecida** em vez
      de 12h cheias.
- [x] Cliente: `useTimerHeartbeat` (batimento, adoção da verdade remota,
      detecção de suspensão por salto de relógio) e `AbandonedTimerDialog`.
- [x] **Sinal local × remoto separados** (`lastActivityAt` × `remoteActivityAt`,
      decisão por `effectiveActivityAt`).

Este último item saiu de uma falha real na verificação: com um campo só, a
correção para trás da extensão ("esta máquina está parada") apagava a atividade
remota ("a outra máquina está ativa") e o timer era cortado enquanto a pessoa
trabalhava no outro computador. As duas afirmações eram verdadeiras; faltava
hierarquia.

### P3 — Extensão do Nevo (CONCLUÍDA)

Extensão MV3 em `extension/`, com `chrome.idle`: enxerga o sistema **sem prompt
de permissão web** e sobrevive à aba fechada. Vira a fonte `extension`, de maior
confiança que `tab`, e destrava o corte automático sem depender da permissão que
ninguém via.

- [x] `manifest.json` (permissions: `idle`, `storage`, `alarms`), `background.js`
      (detecção + alarme de reconciliação, porque o service worker do MV3 é
      descarregado), `content.js` (ponte por `postMessage`, sem exigir id fixo
      nem `externally_connectable`), popup de diagnóstico.
- [x] `useExtensionBridge` no app: adota a fonte, e rebaixa de volta para `tab`
      se a extensão sumir no meio da sessão.
- [x] Privacidade: trafega só o instante da última atividade. Nada de URL,
      janela, conteúdo ou credencial — quem fala com a API é o app.

**Pendente:** empacotar/distribuir (carregar sem compactação já funciona) e
trocar `host_permissions` pelo domínio definitivo.

### Verificação (P2/P3)

| Cenário | Resultado |
|---|---|
| Heartbeat com timer rodando | Sai com `lastActivityAt` + `source` |
| Outro dispositivo ativo | App adota a atividade remota e **não corta** |
| Extensão presente, pessoa parada | Vira fonte `extension` e o corte **acontece** |
| Extensão presente + outro dispositivo ativo | **Não corta** (o remoto é piso) |
| Entrada abandonada | Diálogo abre com o que está em jogo; "última atividade" chega como `{"action":"activity"}` |
| Detecção bloqueada no navegador | Diálogo interrompe explicando o cadeado |

34 testes no backend (15 novos de heartbeat, arbitragem e reconciliação).

---

## Fora do escopo

- Rastrear o que a pessoa faz (janela ativa, app em uso, teclas). O sinal é
  binário: ativo ou não.
- Expor ociosidade na visão de equipe ou em qualquer payload de realtime.
- App desktop.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-13 | 2.0 | P2 (heartbeat, arbitragem, reconciliação, sleep) e P3 (extensão MV3) implementadas e verificadas; sinal local separado do remoto | Nicolas + Claude |
| 2026-08-13 | 1.0 | Criação + P1 implementada e verificada | Nicolas + Claude |
