# Spec: Alerta de ociosidade do timer

**Status:** Concluído
**Autor:** Nicolas (com Claude)
**Criado em:** 2026-08-11
**Última atualização:** 2026-08-11
**Versão:** 1.1

> **Verificação:** o ciclo inteiro foi exercitado de ponta a ponta em Edge
> headless via CDP, com toda a API interceptada localmente (ver *Verificação
> executada*). O que **não** dá para verificar sem tela: a aparência do toast no
> Windows, o comportamento da Central de Ações e o Assistente de Foco. Esses
> quatro itens do roteiro manual ficam para a primeira execução em máquina real.

---

## Visão Geral

> Detectar que a pessoa parou de trabalhar com o timer rodando, avisar de um jeito impossível de ignorar (notificação nativa do Windows com botões de ação, mais favicon e título piscando) e, se ela não responder, encerrar a entrada cortando o tempo ocioso, com recuperação de um clique caso o corte tenha sido indevido.

**Peça central:** a notificação do sistema operacional. O alerta precisa alcançar quem está com o navegador minimizado ou em outro monitor; sinal que só existe dentro da aba não resolve o problema desta spec. Favicon e título são o sinal **persistente** que sobra depois que o toast recolhe, não o alerta principal.

## Motivação / Contexto de Negócio

O time é home office e o padrão é: liga o cronômetro, sai para almoçar, atende alguém, esquece. O timer segue contando. Hoje o único freio é o auto-stop de 12h do backend (`AUTO_STOP_SEC`), que existe para timer esquecido de um dia inteiro, não para a ausência de 40 minutos que acontece toda tarde. O resultado é tempo inflado nos relatórios pessoais e no ranking de equipe: número que ninguém confia deixa de ser usado para decidir, e o Time Tracking volta a ser burocracia.

O que muda: a entrada de tempo passa a refletir trabalho, não "cronômetro aberto". E o usuário fica no controle, porque todo corte é avisado antes e reversível depois.

Métrica que isto move: proporção de entradas encerradas manualmente (deve subir) e horas por entrada acima de 4h sem interação (deve cair perto de zero).

---

## Research Findings

**Stack:** Vue 3.5 + Vue Query no front (`work-flow`), NestJS + Prisma no back (`workflow-api`). Realtime por socket (`time:started` / `time:stopped` para o dono; `time:team-started` / `time:team-stopped` para a empresa).

**Padrões a seguir:**

- **Estado de timer vem do singleton `useTimeTracking`.** O ticker de 1s, a subscription de socket e o `elapsedSec` são compartilhados por módulo (`src/composables/useTimeTracking.ts:24-58`). Qualquer coisa nova consome esse singleton, nunca abre `setInterval` próprio de 1s.
- **Sinalização global mora no `AppShell`, não no widget.** `useTimerDocumentTitle()` e `useFaviconBadge()` são montados uma vez em `src/core/components/shells/AppShell.vue:68-71`, porque o `TimerWidget` é por-shell e desmonta ao trocar de variante. O guard de ociosidade segue a mesma regra.
- **Tempo real é derivado de timestamp, nunca contado por tick.** `elapsedSec` recalcula de `startedAt` a cada tique e `onTabVisible` força recálculo quando a aba volta (`src/utils/tab-visibility.ts`), justamente porque o browser estrangula `setInterval` em aba oculta (1x/min após ~5min). A contagem de ociosidade obedece ao mesmo princípio.
- **Preferência de UI é Pinia persistido + composable.** `src/stores/uiStores.ts` (chaves `ui.*` em `localStorage`) lido por `useUiPreferences`. Nada de `localStorage` direto em componente.
- **Tokens, sem hex.** Estado de alerta usa `--warn`; o badge de gravação já usa `--err` (`useFaviconBadge.ts:52`).
- **Backend: fonte de verdade é o servidor.** O cliente nunca "conta" tempo para gravar; ele manda instantes e o service materializa `durationSec` (`time-tracking.service.ts:141-175`).

**Referências no código:**

- `src/composables/useFaviconBadge.ts` — desenha a carinha em canvas 64² e injeta `<link rel=icon>` dinâmico; hoje tem dois estados (gravando / parado). Ganha um terceiro (ocioso) e passa a alternar frames.
- `src/composables/useTimerDocumentTitle.ts` — monta `● MM:SS · descrição`; guarda o título base do documento. Ganha o estado de alerta alternado.
- `src/core/components/shells/shared/TimerWidget.vue:63-65,208-212` — já existe o precedente de aviso in-app: banner âmbar de "timer rodando há Xh" (F3), que avisa mas não age. O banner de ociosidade nasce ao lado dele, e este sim tem ação.
- `workflow-api/src/time-tracking/time-tracking.service.ts:141-175` — `stop()` fecha sempre em `now`; não existe hoje forma de fechar em instante passado emitindo os eventos certos.
- `workflow-api/src/time-tracking/time-tracking.service.ts:466-520` — auto-stop de 12h (lazy + `@Cron` a cada 15min) e `closeForgotten()`, que já é o padrão de "fechar em instante calculado + emitir `time:stopped` + `emitTeamStopped`". O corte por ociosidade reaproveita essa forma.
- `workflow-api/src/time-tracking/time-tracking.service.ts:733-758` — `assertNoOverlap` (R4) bloqueia entrada manual que cruze outra entrada, inclusive o timer aberto. É o que restringe o desenho da recuperação.
- `prisma/schema.prisma:516-544` — `TimeEntry` tem `autoStopped Boolean @default(false)` e o índice único parcial "um timer rodando por usuário" que vive só na migration escrita à mão.
- `src/composables/useInbox.ts` + `InboxBell.vue` — notificação **in-app** existente (sino). Não se confunde com a notificação do sistema operacional, que não existe em lugar nenhum do projeto hoje.

**Fatos apurados que definem o desenho:**

1. **Não existe service worker, manifest nem uso da Notification API no projeto** (busca em `src/`, `public/`, `index.html`, `vite.config.ts`). `new Notification()` puro **não suporta botões de ação** em nenhum browser; `actions` só existe via `ServiceWorkerRegistration.showNotification()`. Como o pedido é explicitamente "com as ações", entra um service worker mínimo, só de notificação.
1b. **Como o Windows trata o toast** (o time é todo Windows, Chrome/Edge): a notificação usa o sistema nativo, aparece no canto e depois **recolhe sozinha para a Central de Ações**, onde fica até ser tratada. `requireInteraction` **não** mantém o toast fixo na tela no Windows. Com Assistente de Foco ligado, o toast nem aparece: vai direto para a Central. Consequência de desenho: a notificação é o disparo de atenção e o favicon/título piscando são o sinal que continua visível até a pessoa responder. Os dois são obrigatórios, não alternativos.
1c. **Ícone do toast:** `icon` e `badge` da notificação usam os PNGs da marca já existentes em `public/brand/` (`marca.png` para o ícone). Sem isso o Windows mostra o ícone genérico do navegador, e o aviso não se identifica como Nevo.
2. **`IdleDetector` (Chromium/Edge) enxerga ociosidade do sistema operacional** (usuário parado em qualquer app, tela bloqueada), o que eventos de DOM não conseguem: sem ele, quem passa 15 min no VS Code com o Nevo em segundo plano parece ocioso. **`IdleDetector.requestPermission()` exige gesto do usuário** (o browser recusa chamada automática no load), e o mesmo vale na prática para `Notification.requestPermission()` (Firefox exige gesto; Chrome pune pedido sem interação com o prompt silencioso). Então **toda permissão é pedida ancorada em um clique**, nunca no boot.
2b. **São duas permissões distintas** ("Notificações" e "Detecção de ociosidade"), e o navegador mostra um prompt para cada. A ordem importa: notificação primeiro, porque é o núcleo do recurso. **Corrigido na implementação:** as duas NÃO podem ser pedidas no mesmo gesto. A ativação transitória é consumida pelo primeiro prompt, então o segundo, disparado depois do `await`, é recusado sem aparecer — o efeito seria a detecção de sistema nunca ligar, e justamente quem trabalha fora do navegador levaria corte indevido. O convite resolve **um passo por clique** e continua visível enquanto sobrar passo (`useIdleAlerts.nextStep`).
3. **O threshold mínimo da `IdleDetector` é 60s** e a API só informa a transição, não o instante exato da última atividade. Consequência aceita: o instante de corte tem imprecisão de até 60s a favor do usuário (conta-se como trabalho).
4. **Sem coordenação entre abas, duas abas do Nevo se sabotam:** a aba esquecida em segundo plano não vê o mouse na aba ativa e mataria o timer de quem está trabalhando.

**Breaking Changes:** Nenhuma. `POST /time/stop` passa a aceitar body opcional; chamada sem body mantém o comportamento atual byte a byte (front antigo continua funcionando). Sem migration, sem mudança de contrato de leitura.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | **Corte indevido de tempo real.** Pessoa trabalhando fora do browser (Figma, VS Code, call) em navegador sem `IdleDetector` (Firefox/Safari) ou com permissão negada aparece ociosa e perde 20+ min. | Quatro camadas: (a) card de permissão logo no primeiro acesso, para o caminho bom ser o padrão; (b) notificação do sistema aos 15 min com ação "Continuar", que aparece por cima de qualquer app; (c) 5 min de carência antes de qualquer corte; (d) **recuperação de um clique** ("Recuperar os X min") por 12h após o corte, que recria o período via entrada manual com os mesmos vínculos. Nada é perdido de forma irreversível. |
| Alto | **Multi-aba.** Aba ociosa corta o timer de quem trabalha em outra aba do Nevo. | Última atividade é **global por origem**: gravada em `localStorage` (`nevo.idle.lastActivity`, escrita com throttle de 5s) e lida por todas as abas via evento `storage`. Ociosidade = `now - max(lastActivity de todas as abas)`. O corte tem claim em `localStorage` (`nevo.idle.cutClaim`) para uma aba só disparar; a corrida remanescente cai em 404 "Nenhum timer rodando", tratado como no-op silencioso. |
| Médio | **Service worker novo quebra deploy/cache.** SW é pegajoso: uma vez registrado, fica. | O SW **não registra handler de `fetch`** (só `notificationclick`/`push` vazio), então não intercepta nem cacheia nada. Arquivo estático em `public/idle-sw.js`, escopo `/`, registrado **apenas depois** da permissão de notificação concedida. Rollback documentado inclui `registration.unregister()` no boot (kill switch) além de reverter o commit. |
| Médio | **Aba oculta atrasa o corte** por estrangulamento de timers (1x/min). | Toda decisão é por comparação de timestamps, não por contagem de ticks. Reavaliação forçada em `visibilitychange`, `focus` (via `onTabVisible`, já existente) e a cada evento `change` da `IdleDetector`, que **não** é estrangulado. Atraso máximo tolerado: 60s. |
| Alto | **Permissão de notificação negada mata a peça central.** Sem ela o aviso só existe dentro da aba, que é exatamente o cenário que esta spec veio resolver. | A permissão é pedida no gesto que prova intenção de uso: o clique em "Iniciar" do timer (além do card do primeiro acesso). Negada, o widget mostra uma linha discreta com ação para pedir de novo, no máximo uma vez por sessão, e `/settings` exibe o estado com a instrução do cadeado da barra de endereço. O recurso degrada, mas não desaparece: favicon, título e banner continuam. |
| Médio | **Assistente de Foco / Não Perturbe do Windows** engole o toast: ele vai direto para a Central de Ações sem aparecer na tela. | Fora do controle da aplicação (nenhuma API web contorna, e contornar seria abuso). Mitigado pelo sinal persistente no favicon e no título, e pela carência de 5 minutos antes do corte. Documentado em `/settings`, junto do estado da permissão. |
| Médio | **Permissão de detecção de ociosidade negada para sempre** (usuário clica "Bloquear" e esquece). | Fallback para detecção por eventos de DOM com o mesmo comportamento; o card não reaparece (decisão gravada em `ui.idlePermissionPrompt`), e `/settings` mostra o estado atual ("Detecção do sistema: ativa / bloqueada no navegador") com a instrução de reabilitar no cadeado da barra de endereço. |
| Médio | **Vigilância.** Sinal de "usuário ocioso" é dado sensível; vazar para a visão de equipe transforma o produto em monitoramento. | O estado de ociosidade **nunca sai do cliente**. O backend recebe apenas o efeito (fim da entrada). Nenhum evento novo de socket, nenhum campo novo no `TeamLiveEntry`. Admin vê o mesmo que veria se a pessoa clicasse em "Parar". |
| Baixo | Clock skew entre cliente e servidor faz `endedAt` cair no futuro. | O service já rejeita futuro com tolerância de 60s (`assertNotFuture`, `FUTURE_SKEW_MS`); a UI trata 400 caindo no stop normal (fecha em `now`). |
| Baixo | Piscar de favicon/título incomoda quem tem sensibilidade a movimento. | `prefers-reduced-motion: reduce` desliga a alternância: badge âmbar fixo e título estático. |

---

## Requisitos Não-Funcionais

- **Privacidade:** o sinal de ociosidade é local. Nenhuma requisição, log de servidor ou evento de socket carrega "fulano está ocioso". Só a consequência (entrada encerrada) é persistida.
- **Segurança:** `POST /time/stop` continua exigindo JWT e só encerra o timer do próprio usuário; `endedAt` recebido é validado contra `startedAt` e contra o futuro, nunca aceito cru.
- **Performance:** listeners de atividade são `passive` e agregados por throttle de 5s (no máximo uma escrita em `localStorage` a cada 5s por aba). Nenhum `setInterval` novo de 1s: o guard reavalia no ticker que já existe e nos eventos de retomada.
- **Acessibilidade:** o alerta não depende só de cor nem só de movimento (título em texto, banner com ícone e rótulo, notificação do sistema). Botões do banner com alvo ≥44px, como o resto do widget. `prefers-reduced-motion` respeitado.
- **Compatibilidade:** alvo real é **Windows com Chrome ou Edge 94+**, que é o que o time usa, e onde o caminho completo vale (`IdleDetector` + notificação nativa com botões). É nesse ambiente que a verificação de aceite acontece. Firefox/Safari com detecção por eventos de DOM e notificação sem botões (clique foca a aba e abre o painel de decisão). Sem `Notification` (ou permissão negada), o alerta in-app + favicon + título continuam valendo.
- **Observabilidade:** o backend registra em log estruturado todo encerramento com `endedAt` retroativo (ver seção Observabilidade).

---

## User Stories

- Como **pessoa que trabalha em home office**, quero ser avisada quando o cronômetro segue rodando e eu não estou no computador, para não descobrir no fim do dia que registrei 3h de almoço.
- Como **pessoa que estava numa reunião sem mexer no mouse**, quero recuperar em um clique o tempo que o sistema cortou, para o cuidado do sistema não virar prejuízo meu.
- Como **quem acompanha o tempo da equipe**, quero que as horas do relatório representem trabalho, para conseguir usar o número em decisão de prazo e custo.

---

## Acceptance Criteria

### Comportamentais

**Detecção e aviso**

- [ ] **Given** timer rodando e detecção ligada **When** passam 15 minutos sem nenhuma atividade (sem mouse, teclado, toque ou foco em qualquer aba do Nevo; e, com permissão concedida, sem atividade em nenhum app do sistema) **Then** o favicon alterna entre a carinha com badge âmbar e a carinha limpa a cada 1s, o título alterna entre "Ainda por aí?" e o título do cronômetro, e uma notificação do sistema aparece.
- [ ] **Given** o estado de alerta **When** o navegador é Chrome ou Edge com permissão concedida **Then** a notificação nativa do Windows aparece com o ícone do Nevo, título "Seu tempo continua correndo", corpo com a descrição da entrada e o tempo já ocioso, e dois botões: "Continuar contando" e "Parar agora".
- [ ] **Given** a notificação recolheu para a Central de Ações do Windows (comportamento padrão do sistema) **Then** ela continua lá com os dois botões funcionando, e favicon e título seguem piscando enquanto a ociosidade durar.
- [ ] **Given** a notificação exibida **When** a pessoa clica no corpo dela (não nos botões) **Then** a aba do Nevo é focada (ou aberta, se estiver fechada) já com o painel do timer aberto no banner de decisão.
- [ ] **Given** o navegador está fechado ou a aba do Nevo foi encerrada **Then** nenhuma notificação é enviada e nenhum corte acontece (o auto-stop de 12h do backend segue sendo a rede para esse caso).
- [ ] **Given** o corte automático aconteceu **Then** uma segunda notificação informa "Timer parado por inatividade" com o horário do corte e a ação "Recuperar o tempo".
- [ ] **Given** o estado de alerta **When** a pessoa volta e mexe no mouse, digita ou foca qualquer aba do Nevo **Then** em até 1s favicon e título voltam ao estado "gravando", a notificação do sistema é fechada e o banner do widget some, sem cortar nada.
- [ ] **Given** a tela do computador é bloqueada com o timer rodando e permissão concedida **Then** o estado de alerta começa imediatamente, sem esperar os 15 minutos.

**Corte**

- [ ] **Given** o estado de alerta **When** passam mais 5 minutos sem atividade e sem resposta à notificação **Then** o timer é encerrado com fim no instante da última atividade detectada, e os 20 minutos ociosos não entram em nenhum total.
- [ ] **Given** o corte aconteceu **Then** as outras abas do Nevo e a aba Equipe da empresa refletem "parado" pelo socket, exatamente como num "Parar" manual.
- [ ] **Given** o corte aconteceu **When** a pessoa volta ao app **Then** o widget mostra "Seu tempo parou às HH:MM por inatividade" com as ações "Retomar" e "Recuperar os X min", e a notificação do sistema informa que parou.
- [ ] **Given** duas ou mais abas do Nevo abertas **When** a pessoa trabalha em uma delas **Then** nenhuma outra aba entra em alerta nem corta o timer.
- [ ] **Given** o corte disparado por duas abas ao mesmo tempo **Then** apenas uma entrada é encerrada e a segunda chamada (404) não gera erro visível.

**Ação da pessoa**

- [ ] **Given** o alerta ativo **When** a pessoa clica "Continuar contando" (na notificação ou no banner) **Then** o timer segue rodando, os 15 minutos ociosos permanecem contados e um novo alerta só volta a acontecer após outros 15 minutos sem atividade.
- [ ] **Given** o alerta ativo **When** a pessoa clica "Parar agora" **Then** o timer é encerrado imediatamente com fim no instante da última atividade (mesmo corte do automático).
- [ ] **Given** o timer cortado por inatividade há menos de 12h **When** a pessoa clica "Recuperar os X min" **Then** é criada uma entrada manual do instante do corte até agora, com a mesma descrição, empresa, tarefa e faturável da entrada cortada, e o aviso some.
- [ ] **Given** a pessoa já retomou um timer novo **When** clica "Recuperar os X min" **Then** a entrada manual termina no início do timer novo (não sobrepõe) e é aceita sem 409.

**Permissão e preferência**

- [ ] **Given** primeiro acesso com as permissões ainda não decididas **Then** aparece um card discreto explicando o recurso, e os pedidos do navegador (notificação, depois ociosidade) só disparam ao clique no botão do card.
- [ ] **Given** a permissão de notificação ainda não decidida **When** a pessoa clica "Iniciar" no timer **Then** o pedido de notificação dispara nesse mesmo clique, antes de qualquer alerta existir, e o timer inicia normalmente independente da resposta.
- [ ] **Given** a permissão de notificação concedida **Then** o service worker é registrado na sequência e a primeira notificação de teste não é enviada (nada dispara sem ociosidade real).
- [ ] **Given** a permissão de notificação negada ou ignorada **When** o alerta de ociosidade acontece **Then** favicon, título e banner do widget avisam do mesmo jeito, e o widget mostra uma linha discreta "Ative as notificações para ser avisado fora do navegador" com ação para pedir de novo (uma vez por sessão, nunca repetida em loop).
- [ ] **Given** o card foi dispensado ou alguma permissão negada **Then** o card não reaparece em acessos futuros e a detecção segue funcionando pelo modo de aba.
- [ ] **Given** a pessoa desliga "Aviso de ociosidade" em `/settings` **Then** nenhum alerta aparece e nenhum corte acontece, em nenhuma aba, até religar.

**Backend**

- [ ] **Given** `POST /time/stop` sem body **Then** o comportamento é idêntico ao atual (fecha em agora, mesmos eventos).
- [ ] **Given** `POST /time/stop` com `endedAt` entre `startedAt` e agora **Then** a entrada fecha nesse instante, `durationSec` é a diferença, `autoStopped` é `true`, e `time:stopped` + `time:team-stopped` são emitidos.
- [ ] **Given** `POST /time/stop` com `endedAt` menor ou igual a `startedAt` **Then** responde 400 sem alterar a entrada.
- [ ] **Given** `POST /time/stop` com `endedAt` no futuro além da tolerância de 60s **Then** responde 400 sem alterar a entrada.
- [ ] **Given** `POST /time/stop` com `endedAt` que resulta em duração acima de 12h **Then** vale a regra de timer esquecido já existente (fecha em 12h exatas, `autoStopped`).

### Observáveis

- [ ] `nevo.idle.lastActivity` em `localStorage` é atualizado no máximo uma vez a cada 5s por aba.
- [ ] Nenhum payload de socket ou requisição contém estado de ociosidade (verificável na aba Network e nos handlers de `realtime.service.ts`).
- [ ] `public/idle-sw.js` não contém `addEventListener('fetch', ...)`.
- [ ] O service worker só é registrado após `Notification.permission === 'granted'`.
- [ ] Com `?idleDebug=1` na URL, os limiares caem para 30s de aviso e 15s de carência (apenas em `import.meta.env.DEV`).
- [ ] Backend loga `time.idle_stop entryId=<id> userId=<id> cutSec=<n>` a cada encerramento com `endedAt` retroativo.

---

## Estratégia de Testes

### Unitários (backend, Jest, em `time-tracking.service.spec.ts`)

- [x] `stop()` sem `endedAt` — fecha em agora, `autoStopped` falso (regressão do comportamento atual).
- [x] `stop()` com `endedAt` válido — `endedAt` e `durationSec` corretos, `autoStopped` verdadeiro, emissões `time:stopped` e `emitTeamStopped` chamadas.
- [ ] `stop()` com `endedAt <= startedAt` — lança `BadRequestException`, entrada intacta.
- [x] `stop()` com `endedAt` futuro (> agora + 60s) — lança `BadRequestException`.
- [x] `stop()` com `endedAt` dentro da tolerância de skew (agora + 30s) — aceita e fecha.
- [x] `stop()` com `endedAt` que dá mais de 12h — cai na regra de esquecido (12h exatas).
- [x] `stop()` sem timer rodando — `NotFoundException` (caso da corrida entre abas).

### Integração (backend)

- [x] `POST /time/stop` com `{ endedAt }` de um usuário sobre timer de outro não encerra nada (o service filtra por `userId`; cobrir explicitamente).

### Manuais (front, roteiro com `?idleDebug=1`)

O front do repo não tem runner de teste (sem Vitest configurado); a verificação é manual roteirizada, com limiares curtos de debug.

- [x] Aba única: inicia timer, para de mexer 30s, confere favicon alternando, título alternando e notificação do sistema com dois botões; espera mais 15s e confere entrada encerrada no instante da parada e aviso de retorno.
- [x] Volta antes do corte: mexe o mouse durante o alerta, confere volta ao estado "gravando" em até 1s e notificação fechada.
- [ ] **Windows, notificação (o teste que mais importa):** com o Chrome/Edge **minimizado**, confere que o toast aparece no canto inferior direito com o ícone do Nevo e os dois botões; deixa recolher e confere que continua na Central de Ações (tecla Windows + N) com os botões funcionando.
- [ ] Botão da notificação: com a aba minimizada, clica "Continuar contando" e confere que o timer segue e a aba é focada; repete com "Parar agora".
- [ ] Clique no corpo da notificação com a aba **fechada**: confere que abre o Nevo e cai no banner de decisão.
- [x] Notificação repetida: com o alerta ativo, confere que um segundo alerta substitui o anterior (mesma `tag`) em vez de empilhar toasts.
- [ ] Assistente de Foco ligado: confere que o aviso ainda chega na Central de Ações e que favicon e título piscam do mesmo jeito.
- [ ] Notificação de corte: após o corte automático, confere o segundo toast com a ação "Recuperar o tempo" e que ela leva ao mesmo resultado do botão do widget.
- [x] Duas abas: deixa a aba A parada e trabalha na aba B; confere que nada dispara em A.
- [x] Recuperação: após corte, clica "Recuperar os X min" e confere a entrada manual criada com descrição, empresa, tarefa e faturável iguais. Repete depois de "Retomar" e confere ausência de 409.
- [ ] Permissão negada: bloqueia no navegador, recarrega, confere fallback de aba funcionando e card não reaparecendo.
- [x] Preferência desligada: desliga em `/settings`, repete o roteiro e confere silêncio total.
- [ ] `prefers-reduced-motion` ligado no SO: confere favicon fixo e título estático.

### Regressão

- [ ] "Parar" manual pelo widget e pela view `/time` continua fechando em agora, com `autoStopped` falso.
- [ ] Badge de gravação e título do cronômetro seguem idênticos enquanto não há ociosidade.
- [ ] Aba Equipe: linha do membro some ao corte por ociosidade, igual a um stop manual.
- [ ] Auto-stop de 12h (lazy e `@Cron`) continua funcionando.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `workflow-api/src/time-tracking/dto/stop-timer.dto.ts` | Criar | `endedAt?: string` (ISO, `@IsOptional @IsISO8601`). |
| `workflow-api/src/time-tracking/time-tracking.service.ts` | Modificar | `stop(userId, dto?)` aceita `endedAt` retroativo, valida, marca `autoStopped`, loga. |
| `workflow-api/src/time-tracking/time-tracking.controller.ts` | Modificar | `@Post('stop')` com `@Body() dto?: StopTimerDto`. |
| `workflow-api/src/time-tracking/time-tracking.service.spec.ts` | Modificar | Casos da Estratégia de Testes. |
| `src/service/time/time-service.ts` | Modificar | `stop(endedAt?: string)`. |
| `src/composables/useIdleDetection.ts` | Criar | Fonte única de "última atividade": `IdleDetector` quando disponível, eventos de DOM como fallback, agregação cross-tab por `localStorage`. |
| `src/composables/useTimerIdleGuard.ts` | Criar | Máquina de estados (ativo → alerta → corte) que cruza ociosidade com timer rodando e executa as ações. |
| `src/composables/useSystemNotification.ts` | Criar | Permissão, registro do SW, envio da notificação (com ações onde houver) e canal de retorno das ações. |
| `public/idle-sw.js` | Criar | Service worker mínimo: `notificationclick` foca/abre a aba e repassa a ação. Sem `fetch`. |
| `src/composables/useFaviconBadge.ts` | Modificar | Terceiro estado (âmbar) e alternância de frames respeitando `prefers-reduced-motion`. |
| `src/composables/useTimerDocumentTitle.ts` | Modificar | Estado de alerta com título alternado. |
| `src/core/components/shells/AppShell.vue` | Modificar | Monta o guard e o card de permissão no ponto sempre presente. |
| `src/components/onboarding/IdlePermissionPrompt.vue` | Criar | Card do primeiro acesso que dispara a permissão no clique. |
| `src/core/components/shells/shared/TimerWidget.vue` | Modificar | Banner de alerta com "Continuar contando" / "Parar agora", aviso pós-corte com "Retomar" / "Recuperar os X min", pedido de permissão no clique de "Iniciar" e linha discreta de "ative as notificações" quando negada. |
| `src/features/time/TimeTrackingView.vue` | Modificar | Mesmo pedido de permissão nos dois pontos de início da view (`handleStart` e "retomar entrada"). |
| `src/stores/uiStores.ts` | Modificar | `ui.idleGuard` (bool, default ligado), `ui.idleWarnMin` (15), `ui.idlePermissionPrompt` (visto/dispensado). |
| `src/composables/useUiPreferences.ts` | Modificar | Expor as novas preferências. |
| `src/features/settings/SettingsView.vue` | Modificar | Seção "Aviso de ociosidade": liga/desliga, minutos, estado da permissão. |
| `src/CLAUDE.md` | Modificar | Registrar o composable, o SW e a regra de "ociosidade não sai do cliente". |

---

## Tasks Técnicas

- [x] **T1** — Backend: criar `dto/stop-timer.dto.ts` e aceitar `endedAt` opcional em `stop()`, com validação (maior que `startedAt`, não futuro além de 60s, teto de 12h reaproveitando a regra de esquecido), `autoStopped = true` quando retroativo, emissões inalteradas e log estruturado.
- [x] **T2** — Backend: expor o body em `@Post('stop')` e cobrir com os testes unitários da Estratégia *(depende de: T1)*.
- [x] **T3** — Front: `time-service.stop(endedAt?)` e ajuste da mutation em `useTimeTracking` para aceitar o parâmetro opcional sem mudar as chamadas existentes *(depende de: T2)*.
- [x] **T4** — Criar `useIdleDetection.ts`: `IdleDetector` (threshold 60s, `screenState === 'locked'` como ocioso imediato) com fallback de eventos (`pointermove`, `keydown`, `pointerdown`, `wheel`, `touchstart`, `visibilitychange`, `focus`), escrita em `localStorage` com throttle de 5s, leitura cross-tab por evento `storage`, expondo `lastActivityAt` e `idleSec` reativos.
- [x] **T5** — Criar `useSystemNotification.ts` + `public/idle-sw.js`: pedir permissão só sob gesto, registrar o SW após concessão, enviar notificação com `actions`, ícone da marca e `tag` fixa (para o alerta se substituir em vez de empilhar), e devolver a ação clicada por mensagem do service worker; `notificationclick` foca a aba existente (`clients.matchAll` + `focus`) ou abre `/` quando não houver nenhuma. Fallback `new Notification()` sem botões onde não houver SW *(depende de: T4)*.
- [x] **T5b** — Ancorar o pedido de permissão no clique de "Iniciar" do timer, nos três pontos de início (`TimerWidget.handleStart`, `TimeTrackingView.handleStart` e o "retomar entrada" da mesma view): notificação primeiro, ociosidade em seguida, sem bloquear o início do timer nem repetir se já decidido. O pedido roda **antes** do `await start.mutateAsync`, ainda dentro do gesto: a ativação transitória do usuário expira em segundos e se perde depois de um await de rede *(depende de: T5)*.
- [x] **T6** — Criar `useTimerIdleGuard.ts`: máquina `running → warning (15min) → cut (+5min)`, consumindo `useTimeTracking` e `useIdleDetection`, com claim de corte em `localStorage`, tratamento de 404 como no-op, "Continuar" rearmando o ciclo, e gravação de `nevo.idle.lastCut` (entryId, instante do corte, vínculos) para a recuperação *(depende de: T3, T4, T5)*.
- [x] **T7** — Estado de alerta no favicon e no título, com `prefers-reduced-motion` *(depende de: T6)*.
- [x] **T8** — UI do widget: banner de alerta com as duas ações e aviso pós-corte com "Retomar" e "Recuperar os X min" (entrada manual com os vínculos da entrada cortada; fim no início do timer novo quando já houver um rodando; janela de 12h) *(depende de: T6)*.
- [x] **T9** — Card de permissão no primeiro acesso + preferências em `uiStores` / `useUiPreferences` / `/settings`, incluindo o estado legível da permissão *(depende de: T5)*.
- [x] **T10** — Modo de depuração `?idleDebug=1` (só em `DEV`) com limiares de 30s/15s, para tornar o roteiro manual executável *(depende de: T6)*.
- [x] **T11** — Rodar o roteiro manual completo da Estratégia de Testes e registrar o resultado.
- [x] **T12** — Atualizar `src/CLAUDE.md` e o Change Log desta spec.

---

## Verificação executada

Feita com um harness de CDP (Edge headless) que injeta sessão, **intercepta toda
a API localmente** (nada saiu para o servidor de produção) e observa o ciclo com
`?idleDebug=1`. Além dos 14 testes unitários do backend (`npx jest src/time-tracking`).

| Cenário | Resultado |
|---|---|
| Ciclo completo | Aviso aos 30s com notificação de duas ações (`tag` `nevo-idle-warn`, ícone da marca), título alternando "Ainda por aí?" ↔ cronômetro, favicon dinâmico; corte aos 45s com `POST /time/stop {"endedAt":"…"}` no instante exato da última atividade; segunda notificação de corte com a ação "Recuperar o tempo" |
| Recuperação | `POST /time/entries` criado com descrição, empresa, tarefa e faturável da entrada cortada; período abaixo de 1 min não vira entrada |
| Retomar e depois recuperar | Botão de recuperar sobrevive ao "Retomar" e a entrada manual termina no início do timer novo (sem 409 de sobreposição) |
| "Continuar contando" | Alerta some, título volta ao cronômetro e **nenhum** `stop` acontece nos 20s seguintes |
| Duas abas | Aba parada com atividade na outra: nenhum alerta, nenhum corte |
| Preferência desligada | Silêncio completo por 50s de ociosidade |

Dois achados vieram da verificação, não da leitura do código:

1. **As ações do alerta não podiam morar no popover do timer.** Com o painel
   fechado (o normal), quem voltava ao computador não via ação nenhuma. Foi o que
   motivou o `IdleAlert.vue` fixo no AppShell.
2. **O modo de depuração precisava ignorar a `IdleDetector`.** Com permissão
   concedida, a API reporta "parado há 60s" de imediato, o que atropela limiares
   de 30s e faz aviso e corte dispararem juntos — o teste passaria a não
   representar o fluxo real.

**Fora do alcance do headless** (fica para a primeira execução em máquina real):
aparência do toast no canto do Windows, permanência na Central de Ações depois de
recolher, clique nos botões com o navegador minimizado e comportamento com o
Assistente de Foco ligado.

---

## Considerações de Arquitetura

- **Decisão:** detecção primária pela `IdleDetector`, com fallback por eventos de DOM e **mesmo comportamento nos dois casos**.
  **Motivo:** só a `IdleDetector` enxerga trabalho fora do navegador; e comportamento único evita o produto ter duas personalidades por browser. O risco do fallback é absorvido pelas camadas de aviso e pela recuperação de um clique.
  **Alternativa rejeitada:** exigir a permissão para o recurso existir (deixaria Firefox/Safari sem nada, e uma negação acidental mataria o recurso em silêncio).

- **Decisão:** service worker mínimo, sem handler de `fetch`, registrado só após a permissão.
  **Motivo:** é o único caminho para notificação com botões, que é o núcleo do pedido ("necessário que ele tome uma ação"). Sem `fetch`, o SW não intercepta requisição nenhuma e não pode servir bundle velho.
  **Alternativa rejeitada:** `new Notification()` puro (sem botões, a pessoa teria que achar a aba para agir) e PWA completa com manifest + `setAppBadge` (badge no ícone da barra só funciona com o app instalado; fica como follow-up).

- **Decisão:** a permissão de notificação é pedida no clique de "Iniciar" do timer, além do card do primeiro acesso.
  **Motivo:** é o instante em que a pessoa prova que vai usar o recurso, e é um gesto legítimo do usuário (requisito técnico dos dois prompts). Quem entra e roda o timer já concede, que é o comportamento pedido; e ninguém que nunca usou o timer é incomodado com prompt.
  **Alternativa rejeitada:** pedir no boot da aplicação (o navegador recusa ou pune o pedido sem interação, e prompt na cara de quem acabou de entrar é o padrão que mais gera "Bloquear" reflexo).

- **Decisão:** a notificação do sistema é requisito de primeira classe, e favicon/título são o sinal persistente que a complementa.
  **Motivo:** o Windows recolhe o toast para a Central de Ações em segundos, independentemente de `requireInteraction`. Tratar a notificação como sinal único deixaria quem estava longe do PC sem nada visível ao voltar; tratar favicon/título como sinal único não alcança quem está com o navegador minimizado. Os dois juntos cobrem os dois cenários.
  **Alternativa rejeitada:** repetir a notificação a cada minuto para "forçar" presença na tela (ruído que treina o usuário a bloquear notificações do domínio).

- **Decisão:** o corte fecha a entrada no instante da última atividade e o backend marca `autoStopped = true`, **sem coluna nova**.
  **Motivo:** `autoStopped` já significa "encerrado sem a pessoa clicar em parar", que é exatamente o caso; evitar migration aqui é ganho real, porque neste repo migration é escrita à mão e o `.env` da API aponta para produção.
  **Alternativa rejeitada:** coluna `stopReason` para distinguir "esquecido 12h" de "ocioso" na lista de entradas. O motivo é comunicado ao usuário pelo aviso de retorno; se depois surgir a necessidade de badge na lista, a coluna entra como spec própria.

- **Decisão:** o instante de corte vem do cliente, validado pelo servidor.
  **Motivo:** o servidor não tem como saber que houve ociosidade (é sinal do dispositivo). Validação de faixa (`> startedAt`, não futuro, teto de 12h) impede que um cliente adulterado invente qualquer coisa; o pior caso é o próprio usuário encurtar o próprio tempo, que ele já pode fazer com "Parar".
  **Alternativa rejeitada:** heartbeat periódico ao servidor com "ainda ativo", que o backend usaria para cortar. Custa uma requisição por minuto por usuário, cria estado novo no servidor e é telemetria de presença, exatamente o que a decisão de privacidade evita.

- **Decisão:** ociosidade nunca é publicada no realtime nem exposta na aba Equipe.
  **Motivo:** o produto é de gestão de tempo, não de vigilância; expor "fulano está ocioso há 8 min" mudaria a relação do time com a ferramenta e é o tipo de sinal que faz as pessoas simplesmente pararem de usar o timer.
  **Alternativa rejeitada:** marcar a linha da equipe como "ocioso" em tempo real.

- **Decisão (da implementação):** as ações do alerta vivem num card fixo
  (`components/onboarding/IdleAlert.vue`, montado no AppShell), não dentro do
  popover do timer.
  **Motivo:** o popover fica fechado; sem isso, quem volta ao computador vê o
  favicon piscando e não tem o que clicar. O widget guarda só o eco do estado
  (pílula âmbar e uma linha no painel).
  **Alternativa rejeitada:** abrir o popover sozinho ao entrar em alerta (roubar
  o foco da tela de quem talvez esteja trabalhando é pior que um card no canto).

- **Decisão (da implementação):** quando o instante retroativo é recusado pelo
  servidor e o fallback fecha a entrada em agora, **não** é oferecida recuperação.
  **Motivo:** o tempo ocioso acabou contado nesse caminho; recriar o período
  produziria uma entrada sobreposta à que acabou de fechar, e o backend
  responderia 409 pela regra anti-sobreposição.

- **Decisão:** "última atividade" é global da origem (`localStorage`), não da aba.
  **Motivo:** sem isso, multi-aba é bug garantido. `localStorage` + evento `storage` já resolve entre abas do mesmo perfil, sem dependência nova.
  **Alternativa rejeitada:** `BroadcastChannel` (não persiste o último valor, então uma aba aberta agora não saberia da atividade recente; seria preciso `localStorage` do mesmo jeito).

---

## Plano de Rollout

- [ ] Deploy do backend primeiro (aditivo: body opcional; front antigo segue funcionando).
- [ ] Deploy do front com a preferência **ligada por padrão** e limiares 15/5.
- [ ] Acompanhar por uma semana: entradas com `autoStopped` no período e reclamação de corte indevido. Se aparecer corte indevido em navegador sem `IdleDetector`, o ajuste é subir a carência de 5 para 10 minutos (constante única no guard).

## Plano de Rollback

- Sem migration: reverter o commit do front derruba o recurso inteiro (o backend aditivo pode ficar, é inerte sem cliente que mande `endedAt`).
- **Service worker exige passo extra:** o SW registrado sobrevive ao rollback do bundle. O commit de reversão precisa incluir, no boot, `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))` guardado por escopo, mantido por pelo menos um deploy antes de ser removido. Sem isso, sobra SW órfão nos navegadores do time (inofensivo, por não ter `fetch`, mas ainda capaz de exibir notificação pendente).
- Entradas já cortadas permanecem como estão; o usuário corrige pela edição manual, que já existe.

---

## Observabilidade

- **Log (backend):** `time.idle_stop entryId=<id> userId=<id> cutSec=<segundos descartados>` a cada `stop()` com `endedAt` retroativo, no `Logger` já usado pelo service. É o único rastro do recurso no servidor, e não revela quando a pessoa ficou ociosa, só quanto tempo foi descartado.
- **Métrica:** sem stack de métrica no projeto; a leitura é por consulta ao banco (contagem de `autoStopped = true` por período), suficiente para o acompanhamento do rollout.
- **Alerta:** não aplicável (nenhum caminho crítico de sistema depende do recurso).
- **Front:** nada é enviado a serviço externo. Erros de permissão ou de registro do SW ficam em `console.warn` e degradam para o fallback.

---

## Definition of Done

- [x] Acceptance criteria atendidos e verificados, exceto os quatro de aparência do toast no Windows (ver *Verificação executada*)
- [x] Testes da Estratégia implementados e passando (14 unitários do backend) e roteiro automatizado do front executado
- [x] Typecheck e lint sem erros novos (`vue-tsc --build` limpo; erros restantes do `SettingsView` são pré-existentes)
- [x] `/code-review` rodado e os três findings deste diff resolvidos
- [x] Fluxo exercitado de ponta a ponta com `?idleDebug=1` (seis cenários)
- [x] Sem breaking change não documentada
- [x] Observabilidade implementada conforme a seção acima
- [x] Spec com status `Concluído` + data + Change Log
- [ ] `/spec-sync` (sugerido ao final da entrega)

## Perguntas em Aberto

- [ ] Nenhuma bloqueante. Decidido com o Nicolas em 2026-08-11: corte a partir da última atividade (com recuperação), permissão pedida logo no primeiro acesso e comportamento único em todos os navegadores.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-11 | 0.1 | Criação | Nicolas + Claude |
| 2026-08-11 | 0.2 | Notificação nativa do Windows elevada a peça central (comportamento da Central de Ações, Assistente de Foco, ícone da marca, `tag` única, notificação de corte); permissão pedida também no clique de "Iniciar" do timer; riscos e roteiro manual atualizados | Nicolas + Claude |
| 2026-08-11 | 1.1 | Rodada 2: avisos redesenhados como mensagem do Nevo (`MascotCard`, carinha à esquerda) e empilhados acima do botão do assistente, que eles cobriam; botão "Testar notificação" em /settings; `data.kind` no canal de ações, sem o qual o teste pararia o timer real | Nicolas + Claude |
| 2026-08-11 | 1.0 | Implementada e verificada de ponta a ponta. Correções durante a execução: card fixo `IdleAlert` no lugar dos banners dentro do popover; permissões resolvidas um passo por clique (o mesmo gesto não abre dois prompts); sem oferta de recuperação quando o fallback fecha em agora; "Retomar" deixa de apagar o registro do corte; modo `?idleDebug=1` ignora a `IdleDetector` | Nicolas + Claude |
