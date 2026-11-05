# Spec: v2 do front, parte 1 (celular de verdade, home "Meu dia", visual "não IA", Lottie e tela de Deploys)

**Status:** Concluído (aguardando revisão do Nicolas e deploy)
**Autor:** Nicolas (via spec-driven, Agente 1)
**Criado em:** 2026-11-05
**Última atualização:** 2026-11-05
**Versão:** 0.2
**Épico:** [workflow-v2](../../../epicos/workflow-v2.md) (rodada V2.1)
**Irmãs na API:** `workflow-api/docs/specs/2026/q4/q4-2/seguranca-v2-auditoria-e-correcoes.md` e `webhook-deploy-amplify-railway.md`

---

## Visão Geral

> O app quebrava no celular, a home mostrava doze módulos e nenhum deles dizia "o que é meu hoje", e o visual tinha os tiques de tela gerada por IA. Esta spec entrega o app usável no celular (moldura própria + instalável), a home focada no trabalho da pessoa, a passada "não IA" nos rótulos, a escolha de fonte com prévia, animações Lottie próprias e a tela de configuração do webhook de deploy.

## Motivação / Contexto de Negócio

- O Nicolas vai trabalhar este mês principalmente pelo celular, e o time ganha uma pessoa nova.
- Pedido literal: "tela inicial tem MUITA informação", "tirar a cara de layout de IA", "a fonte tá meio fonte de IA", "puxando coisas do Lottie", "web app para celular bem gostosinho", "conectar os deploys de build da AWS com mensagem aqui", "apenas admin pode configurar webhook da própria empresa".
- Restrição de gosto registrada (memória `ui-nao-ia`): densidade e usabilidade Jira/Azure, cor do acento como sinal, Nevo continua bem-vindo, e mudança de fonte só com comparação real.

## Research Findings (verificado nesta sessão, com a API real local + Postgres embutido)

| Achado | Evidência |
|---|---|
| **Celular quebrado**: abaixo de 900px a sidebar de 248px fica fixa; em 375px ela ocupa dois terços da tela e o conteúdo some | print `home-m375` antes; `CommandShell.vue` sem nenhuma regra de largura; `AppShell.vue` só ajustava os recados do Nevo |
| A regra "uma coluna por tela" do board nunca funcionou: o `flex: 1 1 236px` deixava a coluna encolher até o `min-width` de 220px | medido: base 298px, largura real 220px (`TaskColumn.vue:325`) |
| A home não tinha "minhas tarefas" em lugar nenhum; a sequência ocupava a primeira dobra inteira | `DashboardView.vue` (12 módulos); print desktop antes |
| O `GET /dashboard/workspace` já traz todas as tarefas com `isMine`, status, prazo, prioridade e empresa | resposta real da API local; `dashboard.service.ts:61-146` |
| 104 blocos de CSS com rótulo em caixa alta + espaçamento largo ("ATIVIDADE", "DOCUMENTOS", "TRABALHO") | `scripts/de-caps.mjs --dry` |
| Agenda da home mostrava o enum cru ("MEETING", "DEADLINE") | `AgendaSection.vue:84` |
| Roadmap no celular abria com o formulário e mostrava "Dados da API" (jargão de quem construiu) | `RoadmapView.vue:1789` |
| `vercel.json` sem nenhum cabeçalho de segurança | `vercel.json` (só o rewrite) |
| Nenhuma lib de Lottie; nenhum manifest de PWA | `package.json`, `index.html` |
| Rotas já são lazy (37 `import()` no router): o item R1.8 do épico de julho está feito | `router/index.ts` |
| Não é bug: meses em inglês nos primeiros prints vieram do meu seed; a API grava em português | `workflow-api/src/shared/month/month-names.ts` |

## Decisões

- **D1. Moldura de celular separada (`MobileShell`), abaixo de 900px, em qualquer variante.** A variante (command/focus/canvas) é preferência de desktop; nenhuma cabe numa tela pequena. 900 e não 768 porque o iPad em retrato e a janela dividida caem no mesmo problema.
- **D2. Tab bar com Início, Tarefas (mês corrente), Tempo (com o relógio quando roda), Notas e Mais** (folha com o menu inteiro, tema, assistente, configurações). O botão flutuante do assistente sai no celular: cobria a lista.
- **D3. Home em três abas, só a aberta monta.** Meu dia (padrão), Jornada (o palco completo do Nevo, nada removido) e Painel (os números da empresa). `/#sequencia` abre na Jornada.
- **D4. "Meu dia" derivado no cliente** do `/dashboard/workspace`: sem endpoint novo, sem migration, realtime de graça (o `useRealtimeQuerySync` já invalida a chave).
- **D5. Caixa alta só onde é dado** (dia da semana, código, hex, badge de status, impressão). O resto vira caixa normal, sem espaçamento, com 12px de piso.
- **D6. A Figtree continua padrão.** Entram mais quatro opções em Configurações > Aparência, com prévia na própria fonte, carregadas sob demanda. Trocar o padrão do time fica para depois da comparação (Pergunta em aberto 1).
- **D7. Lottie desenhado em código** (`scripts/lottie/build.mjs`): zero licença de terceiro, 3 a 7 KB por arquivo, cores como marcadores trocados pelos tokens na hora (segue tema e acento). `lottie-web` light por import dinâmico; reduced-motion mostra o último quadro.
- **D8. CSP aplicada, não só relatório**: `script-src 'self'` é a barreira que importa contra XSS, e o app não carrega script de terceiro. Rotas públicas (`/report`, `/r`, `/public`, `/f`) ficam sem `frame-ancestors` (podem ser incorporadas por cliente).

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | CSP aplicada quebrar algo em produção que o teste local não exercitou | Build de produção servido com os mesmos cabeçalhos e 13 rotas navegadas (inclusive three.js, editor com websocket, Drive, bug report público): zero violação. Rollback é tirar o bloco do `vercel.json` (sem dado envolvido) |
| Médio | A passada nos rótulos mexer em layout denso | Só CSS, só blocos com caixa alta, lista de exceção; prints das 9 telas em 3 larguras depois |
| Médio | Mudar a home tirar algo que o time usa | Nada foi removido: Jornada e Painel guardam tudo, e a aba fica lembrada |
| Médio | `/dashboard/workspace` passa a ser pedido sempre que a home abre (antes só no modo Workspace) e devolve a história inteira de tarefas | Mesmo endpoint que o `/board` já usa e cacheado pelo Vue Query; filtrar no servidor é a V2.7 do épico |
| Baixo | Push `deploy_failed` cair na lógica do cronômetro | Conferido: o guarda de ociosidade só age em `continue`/`stop`/`recover` (`useTimerIdleGuard.ts:436-445`) |

## Acceptance Criteria

- [x] Em 375px nenhuma tela tem rolagem horizontal da página; topo compacto e tab bar com área segura (`env(safe-area-inset-*)`).
- [x] A tab "Tarefas" leva ao mês corrente da empresa ativa; a "Tempo" mostra o relógio quando o cronômetro roda.
- [x] "Mais" abre uma folha modal (foco no fechar, Esc fecha, foco volta) com o menu inteiro e as ações que não couberam no topo.
- [x] Home abre em "Meu dia" com as tarefas da pessoa de todas as empresas, em grupos; linha abre a tarefa no painel do `/board`.
- [x] Pessoa sem nenhuma tarefa (dia 1) vê três passos; pessoa com tudo concluído vê "Tudo em dia" com a animação.
- [x] Board no celular: uma coluna por tela com snap e a ponta da próxima, cabeçalho em duas linhas, filtros numa faixa só.
- [x] Instalável: manifest com ícones 192/512/maskable, `theme-color` seguindo o topo, `apple-touch-icon` opaco.
- [x] Cabeçalhos de segurança no `vercel.json`, CSP sem violação no build de produção.
- [x] Fonte escolhível com prévia; a escolha vale na hora e persiste; só baixa a woff2 de quem escolhe.
- [x] Lottie anima com CSP aplicada e respeita reduced-motion.
- [x] Tela de Deploys exercitada de ponta a ponta contra a API nova (`scripts/harness/deploy-e2e.cjs`, 18 checagens): criar pela tela, token uma vez, evento real do EventBridge 200, repetido 200 idempotente, token errado 401, app fora da lista 403, "Autorizar este app", evento de teste, aviso no feed e no sino, token antigo 401 depois de girar, WORKER e quem não é da empresa 403, celular sem rolagem lateral.
- [x] Nenhuma tela quebra com a autorização nova da API (C1): 14 rotas como ADMIN e como WORKER sem nenhuma resposta 4xx/5xx (`scripts/harness/api-smoke.cjs`).
- [x] Comentário de tarefa de outra empresa (aberta pelo `/board` agregado) sai com a empresa da tarefa e é gravado nela (antes: lista vazia e gravado na empresa ativa). Verificado no banco do harness.
- [x] `vue-tsc --build` limpo e todo `.vue` alterado compila pelo Vite.
- [x] Copy visível sem em-dash.

## Estratégia de Testes

- **Visual:** `scripts/harness` (API real + Postgres embutido + seed sintético), 9 telas x 375/768/1440, claro e escuro, mais os estados de home (dia 1, tudo em dia).
- **Medição:** `probe.mjs` para larguras de coluna e overflow; `csp-check.mjs` no build de produção; `lottie-check.cjs` para a animação.
- **Gesto:** não exercitado em aparelho físico. Arraste de card no celular continua o mesmo de antes (vue-draggable-plus); fica para o Nicolas confirmar no telefone.

## Arquivos Impactados

Novos: `core/components/shells/MobileShell.vue`, `shells/shared/MobileMoreSheet.vue`, `shells/shared/current-month.ts`, `composables/useCompactViewport.ts`, `features/dashboard/my-day.ts`, `home-tabs.ts`, `components/MyDaySection.vue`, `components/StreakSummaryCard.vue`, `components/ui/LottiePlayer.vue`, `features/settings/components/DeployIntegrationsCard.vue`, `service/deploy/deploy-integrations-service.ts`, `public/manifest.webmanifest`, `public/lottie/*.json`, `public/brand/pwa-*.png` + `apple-touch-icon.png`, `scripts/lottie/build.mjs`, `scripts/de-caps.mjs`, `scripts/harness/*`.

Alterados (rodada 2, depois da revisão): `NotesView.vue`, `utils/html-preview.ts`, `CommentsPanel.vue`, `useComments.ts`, `collaboration-service.ts`, `TaskDetailPanel.vue`, `FeedSection.vue`, `InboxBell.vue`, novo `utils/event-labels.ts`; na API, `src/note/note.service.ts` (`toPreview`) + `note-preview.spec.ts`.

Alterados: `AppShell.vue`, `AssistantLauncher.vue`, `AppToast.vue`, `IdlePermissionPrompt.vue`, `DashboardView.vue`, `DashboardHeader.vue`, `AgendaSection.vue`, `TasksView.vue`, `TaskColumn.vue`, `RoadmapView.vue`, `SettingsView.vue`, `plugins/tokens.ts`, `stores/uiStores.ts`, `composables/useUiPreferences.ts`, `index.html`, `vercel.json`, `package.json` (lottie-web e três fontes), e os 85 arquivos da passada de rótulos (só CSS).

## Tasks Técnicas

- [x] M1 `MobileShell` + folha "Mais" + `--shell-bottom-inset` para assistente, recados e toasts
- [x] M2 PWA (manifest, ícones, viewport-fit, theme-color dinâmico)
- [x] H1 `my-day.ts` + `MyDaySection` (grupos, estados de carregando/erro/dia 1/tudo em dia)
- [x] H2 `StreakSummaryCard`
- [x] H3 Home em abas (`DashboardHeader` sem rótulo em caixa alta)
- [x] B1 Board no celular (cabeçalho, faixa de filtros, coluna com snap de verdade)
- [x] R1 Roadmap no celular (leitura primeiro) e copy "Dados da API"
- [x] T1 Passada de rótulos (`scripts/de-caps.mjs`, 104 blocos)
- [x] T2 Escolha de fonte (tokens + store + Aparência)
- [x] L1 `LottiePlayer` + 3 animações próprias
- [x] S1 Cabeçalhos de segurança no `vercel.json`
- [x] W1 Tela de Deploys (cliente tipado + card), contrato da spec da API
- [x] W2 Verificação de ponta a ponta da tela de Deploys contra a API nova
- [x] C1-front: `companyId` explícito em `CommentsPanel` → `useComments` → `collaboration-service` (achado da revisão cruzada)
- [x] N1 Notas no celular (pastas viram botão, cabeçalho numa linha) e prévia da lista com um trecho por bloco (`note.service.ts toPreview`, com 6 testes; não apaga mais hífen, parênteses nem exclamação)
- [x] Copy: código cru de evento na timeline e no sino vira rótulo em português (`utils/event-labels.ts`)
- [x] G1 Revisão cruzada (Agente 2 revisou o front; achados aplicados, ver Change Log). O `/code-review` multiagente NÃO rodou: o dono limitou a 2 agentes e a skill abre revisores próprios

## Plano de Rollback

Tudo é front e sem dado: reverter o commit. O `vercel.json` sozinho volta tirando o array `headers`. A fonte escolhida mora no `localStorage` (`ui.font`); valor desconhecido cai na Figtree.

## Perguntas em Aberto

- [ ] **Fonte padrão do time.** Figtree continua. Depois de alguns dias comparando em Configurações, o time escolhe se troca (minha aposta para "não IA" com conforto: IBM Plex Sans). Responsável: Nicolas.
- [ ] **Onde a mensagem de deploy aparece** ficou na decisão padrão da spec da API (falha: timeline + sino + push de quem foi escolhido + Discord; sucesso: timeline + Discord). Confirmar.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-11-05 | 0.1 | Criação e implementação das tasks M1 a W1 | Nicolas (via spec-driven, Agente 1) |
| 2026-11-05 | 0.2 | Revisão cruzada do Agente 2. **Alto:** a CSP travava a prévia do QR com logo (`qr-code-styling` busca a logo data URL por XHR): `connect-src` ganhou `data: blob:`, verificado no build de produção com QR com logo em `/qr`. **Médio:** `object-src` liberado para `self blob: https:` (prévia de PDF); copy do card de Deploys dizia que lista vazia aceita qualquer app (a API recusa): corrigida; trocar de moldura ao cruzar 900px remontava a página: agora troca só na navegação (verificado). **Baixo:** fundo próprio da moldura no Modo XP; edição da integração depois de criada (verificado); `dispatchError` visível no teste e no histórico; 403 vira mensagem de permissão; copy da AWS com input transformer e região. Também: travessão removido de 19 textos visíveis antigos (inclusive nome da extensão), comentários de outra empresa com a empresa certa, prévia das notas por bloco, rótulos de evento em português | Nicolas (via spec-driven, Agentes 1 e 2) |
