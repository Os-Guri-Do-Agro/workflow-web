# Nevo: o que falta para virar utilidade total (análise de produto + 120 ideias)

**Status:** Draft (ideação; nenhuma ideia aqui é spec aprovada)
**Autor:** Nicolas (via spec-driven, análise pedida em 2026-11-05)
**Criado em:** 2026-11-05
**Repos:** `work-flow` + `workflow-api`

> Documento de ideação. Cada ideia que for para frente vira spec própria (mini, full ou multi) no bucket do mês em que for criada. Ideias que já aparecem em outro épico estão marcadas com **[já mapeado: onde]**; todas as outras não existem no código nem em nenhum documento do repo.

---

## 0. Como foi feita a leitura

- Mapeadas as ~90 rotas da API (todos os `*.controller.ts`), os 60 models do `schema.prisma`, as 37 rotas do front e a paleta de comandos.
- Lidos o agente do copiloto (`copilot/agent.service.ts`), a busca semântica (`intelligence/intelligence.service.ts`), o webhook de deploy (spec `webhook-deploy-amplify-railway.md`), o service worker de push (`public/idle-sw.js`) e o cofre (`company-variable`).
- Cruzado com o que já está planejado: `EVOLUCAO.md`, épicos `workflow-v2`, `produto-next-200` e `workflow-next-level`.
- Dois agentes de inventário (front e integrações) conferiram o que cada tela e cada integração fazem de verdade.

---

## 1. O diagnóstico, do jeito que um time de produto de IA leria

### 1.1 O Nevo já tem o grafo de trabalho inteiro de uma software house

No mesmo banco moram: o cliente (`Company`), a tarefa (`Activity`), a spec da tarefa (`ActivityDoc`, markdown), o tempo com prova de vida (`TimeEntry` com heartbeat), a credencial (`CompanyVariable` cifrada), o repositório (`Repository`, PAT da org), o deploy (`DeployIntegration` + entregas), o bug do cliente por vídeo (`BugReport` com Gemini + Claude), a agenda (Google Calendar em duas vias), notas, drive, QR, OCR e encurtador.

Nenhuma ferramenta de mercado tem essas dez coisas juntas. Jira não sabe da credencial, Clockify não sabe do deploy, Sentry não sabe do contrato, Notion não sabe das horas.

### 1.2 Mas são ilhas: o valor está nas arestas, e elas não existem

Evidência no código:

- **A chave da tarefa só existe na tela.** O front deriva `PJ-K7Q2XM` do fim do id (`features/tasks/task-key.ts`), mas a API não resolve essa chave, e `Activity` não tem campo de commit, PR ou deploy (`schema.prisma:171-220`).
- **GitHub é um navegador de repositório, e escondido.** Lê branches, árvore, arquivo e PRs, cria PR, mas não recebe webhook, não lê commit nem CI (`repository/github.service.ts`). A tela saiu do menu e de Configurações (`NavList.vue:92`).
- **O deploy chega e não sabe o que levou.** Guarda `branch` e `jobId`, sem tarefa nem commit (`deploy-webhook.service.ts`). Só aparece num card de Configurações, para ADMIN. E o próprio front do Nevo roda na Vercel (`vercel.json`), que não é um dos provedores.
- **O wedge está fora do menu.** Bug reports e Calendário saíram da navegação (`config/nav-visibility.ts:13`), e o detalhe do bug report não troca status.
- **O tempo não sabe do código.** `TimeEntry` liga a tarefa por escolha manual; commit nenhum vira sugestão de lançamento.
- **O cofre não sabe quem viu.** O `GET` devolve todo `SECRET` decifrado para qualquer membro (`company-variable.service.ts:64` e `:76`), sem registro de leitura.
- **O agente só olha.** São 7 ferramentas, todas de leitura, com teto de 6 rodadas e 8 turnos de histórico (`agent.service.ts:17-18`, `:46-148`).
- **O índice semântico é força bruta e parcial.** Cada busca carrega todos os vetores da empresa e calcula cosseno em JS (`intelligence.service.ts:132-153`); o reindex apaga e recria tudo (`:78-93`); notas, comentários e arquivos do Drive ficam de fora (`:158-260`).
- **O único canal externo é o Discord.** Zero e-mail (o SendGrid está no `package.json` e nunca foi importado), zero WhatsApp. Push só em 3 eventos (deploy com falha e dois do timer).
- **Nada é medido.** O PostHog saiu do `src` e não entrou nada no lugar. O copiloto não registra custo nem qualidade por resposta.
- **Tudo roda dentro do processo HTTP.** Sem fila; os 3 crons (`intelligence` a cada 10 min, `notifications` a cada 2 h, `time-tracking` a cada 15 min) duplicam no dia em que o Railway subir duas réplicas.

### 1.3 A tese

O salto de 10x não é tela nova. São quatro coisas que ligam o que já existe:

1. **Uma chave universal** (`PET-142`) que aparece no nome da branch, no commit, no PR, no deploy, no áudio e no WhatsApp.
2. **Um barramento de eventos** onde tudo que acontece (commit, deploy, erro, timer, comentário) vira um fato que automação, notificação e agente podem assinar.
3. **Um agente com mãos**, que age com confirmação humana, e um **servidor MCP** que deixa os agentes que o time já usa (Claude Code) trabalharem dentro do Nevo.
4. **Canais que chegam onde a pessoa está**: push com botão de ação, e-mail, WhatsApp, Discord bidirecional.

E um insight que só aparece olhando este time por dentro: **vocês já trabalham com Claude Code e spec-driven, e a spec já mora dentro da tarefa** (`ActivityDoc`). Ninguém no mercado tem o lugar onde o pedido do cliente vira spec, a spec vira PR feito por agente, o PR vira deploy, e o deploy avisa o cliente, tudo no mesmo grafo. Esse é o produto: **o sistema operacional de uma software house que trabalha com agentes.**

---

## 2. As cinco fundações (destravam metade das ideias)

**1. A chave da tarefa vira chave do servidor.** O front já mostra `PJ-K7Q2XM` (prefixo da empresa + 6 últimos caracteres do id, `features/tasks/task-key.ts`). Passo 1, sem migration: a API passa a resolver essa chave quando ela aparece num nome de branch, commit, PR ou mensagem. Passo 2, com migration: número sequencial por empresa (`PJ-142`), que o próprio `task-key.ts` já registra como follow-up, porque `K7Q2XM` não se fala em voz alta nem num áudio de WhatsApp. *Por que todo mundo usa:* é como gente fala de tarefa ("subiu o PJ-142?"), e é o que liga branch, commit, PR, deploy, áudio e mensagem. Sem ela no servidor, nenhum vínculo automático é confiável.

**2. Barramento de eventos com fila (pg-boss no Postgres atual, sem Redis).** Todo fato vira evento tipado; consumidores assinam. *Por que:* hoje cada módulo notifica do seu jeito (feed best-effort, cron de 2 h para o Discord, push avulso). Com barramento, notificação, automação, webhook de saída, agente e auditoria viram assinantes. Resolve de quebra o cron duplicado em réplicas e tira IA e vídeo do processo HTTP (Decisão 9 do `EVOLUCAO.md`). *Base:* o contrato tipado de `activity-events.ts` é o embrião.

**3. E-mail transacional e de entrada.** SendGrid para saída (convite, digest, relatório) e um endereço de entrada por empresa (`pet@in.<domínio>`) para receber pedidos. *Por que:* sem e-mail não há convite, recuperação de senha, relatório para o chefe do cliente nem loop do bug report. **[saída já mapeada: workflow-v2 V2.4]**; a entrada é nova.

**4. Agente com ferramentas de escrita e cartão de confirmação.** `create_task`, `move_task`, `assign`, `comment`, `start_timer`, `log_time`, `schedule`; cada uma devolve uma prévia ("vou mover PET-142 para Em teste e avisar a Letícia") e só executa com o toque, registrando no feed com o autor "Nevo a pedido de Fulano". **[já mapeado: EVOLUCAO 5.3]**, e continua sendo o item de maior valor por esforço da camada de IA.

**5. Servidor MCP do Nevo.** Expõe tarefas, specs, comentários, timer e feed como ferramentas MCP com o token da pessoa. *Por que todo dev usaria todo dia:* dentro do Claude Code, "pega minha próxima tarefa" puxa o `ActivityDoc` como contexto, inicia o timer, e no fim "fecha a tarefa" comenta o resumo do que mudou, move para Em teste e anexa o PR. O dev nunca sai do terminal e o board se atualiza sozinho. *Base:* o padrão de token com hash e escopo do QR (`qr/api-token.service.ts`) serve como autenticação.

---

## 3. Deploys, alertas e operação (o buraco que você já sentiu)

**6. O deploy sabe o que levou.** Webhook do GitHub (push, PR merged) + chave na branch ou no commit. Quando o deploy de produção dá certo, o evento lista as tarefas que subiram. *Por que:* "isso já está em produção?" é a pergunta mais repetida de uma software house, e hoje a resposta é abrir três abas.

**7. Revisados vira Concluído sozinho.** O status `REVIEWED` já significa "aprovada no teste e esperando subir" (`agent.service.ts:61`). Deploy de produção com o commit da tarefa move para `DONE` e avisa quem pediu. *Por que:* elimina o passo manual mais esquecido do board, e o board para de mentir.

**8. Release notes automáticas em duas vozes.** A técnica para o time (tarefas, PRs, quem fez) e a do cliente ("agora dá para pagar com PIX"), escrita pelo Claude a partir das tarefas do deploy. Vai para o feed, para o portal e para o WhatsApp do cliente. *Por que:* ninguém escreve changelog, e todo cliente quer saber o que mudou.

**9. Build quebrado com diagnóstico, não só com aviso.** Ao chegar `FAILED`, o Nevo busca o log (Amplify `GetJob`, Railway `deploymentLogs`), e o Claude responde em três linhas: causa provável, commit suspeito, quem mexeu por último, e o comando para reproduzir. *Por que:* o alerta vira ação em 30 segundos em vez de 15 minutos de console da AWS.

**10. Rollback com um toque.** Amplify (`StartJob` no commit anterior) e Railway (`deploymentRedeploy`), só ADMIN, com confirmação por senha (o `PasswordConfirmDialog.vue` já existe) e registro no feed. *Por que:* às 23h, com o app do cliente fora, ninguém quer achar o botão certo no console.

**11. Tela de Deploys para o time, com "o que está em cada ambiente".** Hoje deploy só aparece num card de Configurações, para ADMIN, com as últimas 30 entregas (`DeployIntegrationsCard.vue`). A tela nova é de todo mundo: por cliente, uma matriz dev, staging e produção com o commit e as tarefas de cada um, e o diff "o que vai na próxima subida". *Por que:* responde na hora a reunião de release, e mostra tarefa aprovada que está parada sem subir.

**12. Preview por tarefa.** O link do preview da branch (Amplify branch previews, Railway PR environments, Vercel preview) aparece no card. O testador clica, testa, marca o check Web. *Por que:* fecha o ciclo do "teste por plataforma" que vocês já têm (`ActivityTestCheck`) sem ninguém pedir link no grupo.

**13. Monitor de uptime nativo.** Ping de minuto em minuto na URL ou no `/health` de cada app de cliente; duas falhas seguidas abrem alerta. *Por que:* hoje o cliente avisa antes do time. É o recurso mais barato desta lista e o que mais evita vergonha.

**14. Erros de runtime dos apps dos clientes viram tarefa.** Um SDK mínimo (web e Expo/React Native) ou um endpoint compatível com o envelope do Sentry. Erro novo agrupado por assinatura abre tarefa com stack, navegador, usuário afetado e triagem do Claude; erro que volta depois de resolvido reabre a tarefa. *Por que:* bug que ninguém reportou é a maioria dos bugs.

**15. Plantão com escalonamento.** Escala semanal; o alerta vai para quem está de plantão; o push tem o botão "Assumi" (o service worker já roteia ações, hoje só o timer usa); sem resposta em 10 minutos, escala para o próximo. *Por que:* alerta para todo mundo é alerta para ninguém.

**16. Modo incidente.** Um botão abre a sala do incidente: linha do tempo montada sozinha (deploys, erros, uptime, comentários), status curto para o cliente atualizado ali mesmo, e no fim o Claude escreve o postmortem a partir da linha do tempo. *Por que:* incidente bem conduzido vira prova de profissionalismo para o cliente, em vez de desgaste.

**17. Status page pública por cliente** (`status.cliente.com.br`), alimentada pelo uptime e pelos incidentes. *Por que:* o cliente do seu cliente para de ligar para o seu cliente. Dá para vender como serviço.

**18. Radar de vencimentos.** SSL, domínio, conta de desenvolvedor Apple (anual), certificados de push e de distribuição, provisioning profiles, keystore, plano de hospedagem, tokens de terceiros guardados no cofre (campo `expiresAt`). Avisos em 30, 7 e 1 dia, com dono. *Por que:* conta Apple vencida tira o app da loja, e isso acontece em toda software house uma vez.

**19. Lojas de app no radar.** App Store Connect API e Google Play Developer API: build processando, revisão aprovada ou **rejeitada**, lançamento em fases, taxa de crash, queda de nota. *Por que:* rejeição da Apple descoberta três dias depois atrasa lançamento de cliente.

**20. Custo de nuvem por cliente.** AWS Budgets/Cost Explorer e uso do Railway por projeto; pico vira alerta; o valor do mês entra no relatório do cliente. *Por que:* conta da AWS que dobrou sem ninguém ver sai da margem da agência.

**21. Janela de congelamento.** Deploy de produção na sexta depois das 18h, ou na semana de lançamento do cliente, pede confirmação e avisa o plantão. *Por que:* regra que todo time tem e ninguém aplica.

**22. Roteamento inteligente de alertas.** Agrupa (5 falhas em 10 minutos viram 1 alerta), deduplica, respeita horário de silêncio por pessoa, manda o que não é urgente num resumo. *Por que:* sem isso, em um mês o time silencia o Nevo.

**23. Saúde de dependências dos repositórios.** `npm audit`/Dependabot dos repos ligados num resumo semanal por cliente; CVE crítico abre tarefa. *Por que:* segurança vira rotina visível em vez de susto.

**24. Checks do PR no card.** Status do CI e da revisão (GitHub Checks API) direto no card da tarefa. *Por que:* o testador sabe se pode testar sem abrir o GitHub.

**25. Cobertura dos provedores que vocês usam de fato.** Além de Amplify e Railway: Vercel (onde o próprio front do Nevo roda), EAS Build do Expo (o PetJourney é Expo) e GitHub Actions. *Por que:* hoje o deploy do próprio Nevo não avisa o Nevo.

---

## 4. O agente que trabalha (IA que faz, não que conversa)

**26. "Delegar ao agente" numa tarefa.** Um agente de código em nuvem (Claude Agent SDK, sandbox isolado) clona o repo (a rota `GET /repository/:id/clone` existe), lê a spec do `ActivityDoc`, implementa, roda os testes e abre o PR com a chave (a rota `POST /repository/:id/pulls` existe). O card mostra o log ao vivo; a revisão é humana. *Por que:* é o uso mais valioso de IA para uma software house em 2026, e vocês têm todas as peças.

**27. Spec automática para qualquer tarefa.** O pipeline do bug report (título vago vira spec com passos e severidade) generalizado: título + histórico do cliente + árvore do repo viram um `ActivityDoc` com critérios de aceite testáveis, para alguém aprovar. *Por que:* tarefa mal especificada é a maior fonte de retrabalho, e o time já escreve spec à mão.

**28. Revisor de PR contra os critérios.** No PR ligado à tarefa, o Claude confere o diff contra os critérios da spec e comenta "o critério 3 não está coberto". *Por que:* revisão de código olha o código; ninguém confere se o PR faz o que foi pedido.

**29. Agente de QA para o check Web.** Com o link de preview e os critérios, um agente com Playwright navega, grava vídeo e preenche o check Web com evidência. iOS e Android continuam humanos. *Por que:* o teste repetitivo sai da fila de gente.

**30. Daily assíncrona escrita sozinha.** Às 9h, cada pessoa recebe o rascunho "ontem, hoje, bloqueios" montado de `TimeEntry`, `ActivityLog`, commits e comentários; edita em 10 segundos; o líder vê o time todo. *Por que:* mata a reunião diária sem perder a informação.

**31. Estimativa pelo histórico real.** Tempo lançado por tarefa + embeddings de tarefas parecidas: "tarefas como esta levaram de 6 a 9 horas (mediana 7)". *Por que:* ninguém no mercado tem horas reais ligadas a tarefas parecidas do mesmo time. É estimativa que não depende de chute.

**32. Detector de tarefa que vai atrasar.** Idade no status, dias sem tempo lançado, carga do responsável, prazo: a tarefa ganha um sinal no "Meu dia" com o motivo em uma linha. *Por que:* atraso avisado com uma semana é renegociável; avisado no dia é crise.

**33. Triagem com deduplicação.** Todo bug report, erro de runtime ou mensagem de cliente é comparado por embedding: "parece o PET-88, de 3 semanas atrás (91%)", com botão de juntar. *Por que:* o mesmo problema vira três tarefas em três canais.

**34. Automações escritas em português.** "Quando uma tarefa ficar 3 dias em teste sem ninguém mexer, me avise e marque o responsável." O Claude compila em gatilho, condição e ação, mostra a regra para confirmar e ela roda no barramento (ideia 2). *Por que:* regra no-code sem tela de regra.

**35. Agentes agendados.** "Toda sexta às 17h, prepare o resumo de cada cliente e deixe como rascunho para eu revisar." *Por que:* o trabalho chato da semana chega pronto.

**36. Memória de decisões.** O Claude extrai decisões de comentários, notas e reuniões ("decidimos usar Stripe porque..."), guarda com link para a fonte, e o copiloto cita quando alguém pergunta de novo. *Por que:* "por que fizemos assim?" tem resposta em vez de arqueologia.

**37. Pergunte ao código.** Ferramentas `search_code` e `read_file` sobre os repos ligados (a API já lê árvore e arquivo): "onde fica o login do PetJourney?" responde com link para o arquivo. *Por que:* dev novo e atendimento param de interromper o dev sênior.

**38. Reunião vira trabalho.** Áudio ou vídeo da reunião (o Gemini já processa vídeo no bug report) vira transcrição, decisões, tarefas com responsável sugerido e uma nota. *Por que:* metade do que se combina em reunião some.

**39. Áudio vira tarefa no celular.** Segurar para falar no `MobileShell`: "cria pra Letícia ajustar o checkout da Sentia até sexta" vira tarefa com chave, prazo e responsável. *Por que:* você vai trabalhar pelo celular este mês, e digitar tarefa no celular é a pior parte.

**40. Traduzir para o cliente.** Um toque reescreve texto técnico (PR, release, bug) em linguagem de cliente. *Por que:* a mensagem para o cliente é escrita todo dia por alguém que não gosta de escrever.

**41. Contexto ao abrir a tarefa.** Tarefas parecidas já feitas, arquivos que provavelmente mudam (pelos PRs antigos ligados), quem mexeu por último. *Por que:* os primeiros 20 minutos de toda tarefa são procurar contexto.

**42. Copiloto proativo, não chat.** Três sugestões por dia no "Meu dia", cada uma com botão: "PET-12 está há 4 dias em teste. Cobrar a Letícia?". *Por que:* ninguém abre chat de IA espontaneamente; todo mundo aperta um botão útil.

**43. Avaliação contínua do copiloto.** Cada execução registrada (pergunta, ferramentas, custo, latência, 👍/👎), com um conjunto de regressão de perguntas reais. Trocar de modelo vira decisão medida. *Por que:* é assim que laboratório de IA trabalha: avaliação antes de impressão.

**44. Custo de IA por empresa e por recurso.** Tokens por chamada, teto mensal por empresa, roteamento por tarefa (Haiku para classificar, Sonnet para escrever, Opus só para OCR e spec), prompt caching no contexto fixo e Batch API no que roda à noite. *Por que:* o throttle de IA hoje é por IP (`EVOLUCAO 5.4`); no dia em que um cliente pesar, a margem some sem aviso.

**45. Privacidade do agente.** Valor de segredo nunca entra em prompt (redação automática do que vem do cofre), opção "não usar minhas notas pessoais", e registro do que foi enviado a cada modelo. *Por que:* é a pergunta que todo cliente maior vai fazer antes de aceitar IA no projeto dele.

---

## 5. O cliente dentro

**46. Portal do cliente com link mágico e a marca da agência.** **[já mapeado: workflow-v2 R3.5, EVOLUCAO 5.2]**. Continua sendo a trava de saída mais forte do produto.

**47. Aprovação formal de entrega.** O cliente aprova ou recusa a entrega com comentário; fica registro com data e quem aprovou. *Por que:* vira evidência contratual e acaba com o "eu nunca aprovei isso".

**48. Pedido de mudança com orçamento automático.** O cliente pede algo fora do escopo; o Nevo estima pelo histórico (ideia 31), gera o orçamento em horas e reais, o cliente aprova no portal e vira tarefa com verba. *Por que:* escopo que cresce de graça é o maior vazamento de dinheiro de agência; aqui ele vira receita.

**49. Pacote de horas por cliente.** Horas contratadas no mês, consumo em tempo real, aviso aos dois lados em 80%. *Por que:* evita a conversa constrangedora do fim do mês.

**50. SLA por contrato.** Severidade define prazo de resposta e de resolução; o relógio aparece no card; estouro gera alerta. *Por que:* contrato com SLA só é vendável se alguém medir.

**51. WhatsApp de entrada e de saída.** Entrada **[já mapeada: EVOLUCAO 5.2]**. A saída é nova: "o PET-142 foi para produção" chega no WhatsApp do cliente, com o texto da ideia 8. *Por que:* é onde o cliente brasileiro está.

**52. E-mail com cópia para o Nevo.** Copiar `pet@in.<domínio>` numa conversa anexa a thread na linha do tempo do cliente, e o Claude extrai os pedidos como rascunhos de tarefa. *Por que:* pedido que chega por e-mail para uma pessoa só some quando ela sai de férias.

**53. Relatório mensal que se monta sozinho.** **[já mapeado: EVOLUCAO 5.3]**. Novo: a versão "apresentação", com as capas das tarefas entregues (a capa já existe no card) e as release notes do mês, em PDF ou slides.

**54. CSAT de um clique depois de cada entrega.** *Por que:* a agência descobre cliente insatisfeito antes do cancelamento.

**55. Linha do tempo do cliente.** Pedidos, deploys, incidentes, reuniões, e-mails e entregas em ordem. *Por que:* quem assume o cliente entende a história em 5 minutos.

**56. Changelog público por app**, alimentado pelas release notes. *Por que:* o cliente ganha uma página "novidades" para os usuários dele sem trabalho.

**57. Números do app do cliente no relatório.** Usuários ativos, crashes e nota da loja (PostHog, Firebase, App Store). *Por que:* mostra valor entregue em número, que é o que o dono do cliente lê.

---

## 6. Pessoas e colaboradores

**58. Onboarding de colaborador como modelo.** Checklist automático (contas, acesso aos repos, escopo do cofre, leituras, primeira tarefa fácil), padrinho e marcos de 30, 60 e 90 dias. *Por que:* o time ganha uma pessoa este mês, e cada entrada hoje depende de alguém lembrar de tudo.

**59. Desligamento seguro em um botão.** Revoga a org do GitHub, o Nevo e as sessões; lista os segredos que a pessoa revelou (ideia 81) e cria as tarefas de rotação. *Por que:* desligamento é o maior risco de segurança de empresa pequena, e ninguém faz checklist.

**60. Férias, folgas e ausências com aprovação**, ligadas à capacidade e ao banco de horas (pedido de compensação de saldo). *Por que:* hoje isso mora numa planilha ou no grupo.

**61. Capacidade real da semana.** Jornada (`WorkSchedule` já existe) menos ausências menos reuniões do Google Calendar, contra as estimativas atribuídas: mapa de carga, e aviso ao atribuir para quem já está cheio. *Por que:* distribuição de trabalho deixa de ser "quem respondeu primeiro".

**62. Um para um contínuo.** Espaço privado entre líder e pessoa, com pauta sugerida a partir do período (entregas, bloqueios, horas extras) e combinados que passam de uma conversa para a outra. *Por que:* o 1:1 deixa de começar do zero.

**63. Mapa de quem sabe o quê e alerta de pessoa única.** Derivado de tarefas, commits e clientes: "quem sabe mexer no app da Sentia?". E alerta quando só uma pessoa mexeu num repo nos últimos 6 meses. *Por que:* conhecimento concentrado é o risco invisível de toda software house.

**64. Sinal de sobrecarga (opcional e privado).** Padrão de horas extras seguidas ou trabalho de madrugada no `TimeEntry` gera um aviso discreto para a pessoa e, se ela permitir, para o líder. *Por que:* burnout aparece nos dados semanas antes de aparecer na pessoa.

**65. Reconhecimento ligado ao Nevo.** Elogio de colega preso a uma tarefa, vira pontos e aparece no feed. *Por que:* a gamificação ganha um lado social que não é só métrica individual.

**66. Comunicados com confirmação de leitura.** Política nova, feriado, mudança de processo, com "li e entendi". *Por que:* substitui o "viu a mensagem no grupo?".

**67. Espelho de ponto mensal para o contador.** O banco de horas já exporta CSV (`BalanceReport.vue:111`); falta o espelho mensal em PDF, com ciência do colaborador registrada no app. Antes de chamar de ponto oficial, validar com o contador se precisa atender à Portaria 671. *Por que:* fecha o mês sem planilha e sem assinatura em papel.

**68. Demonstrativo de PJ.** Horas vezes valor por prestador, fechamento mensal que o prestador confirma no app antes de emitir a nota. *Por que:* elimina a conferência de planilha todo dia 1.

**69. Distribuição justa de revisão e teste.** Sugere quem revisa e quem testa por carga e conhecimento, não sempre a mesma pessoa. *Por que:* a fila de teste é o gargalo silencioso do board.

**70. Foco protegido.** Bloco de foco no calendário e presença "em foco" seguram as notificações que não são urgentes. *Por que:* o Nevo passa a defender o tempo da pessoa, não só medir.

**71. Nevo Wrapped do mês e do ano.** Entregas, deploys, horas, maior sequência, cliente mais atendido, em formato de compartilhar. *Por que:* é divertido, gera conversa e reforça o hábito.

**72. Missões de higiene.** Missões do Nevo ligadas à saúde real do trabalho: documentar um runbook, fechar tarefa parada, resolver um alerta, revisar um PR. *Por que:* a gamificação passa a puxar o comportamento que a empresa precisa.

**73. Sequência de produção verde.** "34 dias sem quebrar produção na Sentia" como sequência de equipe, no mesmo motor da sequência diária. *Por que:* liga o Nevo ao resultado que mais importa, e a equipe defende a sequência.

---

## 7. Conhecimento

**74. Ficha 360 do cliente.** Uma página por cliente: contatos, contrato, stack, repos, ambientes, integrações de deploy, cofre mascarado, tarefas abertas, horas do mês, último deploy, saúde. *Por que:* hoje clicar num projeto leva para a tela de variáveis; a ficha vira a porta de entrada de qualquer assunto do cliente.

**75. Runbooks presos aos alertas.** O alerta de deploy da Sentia abre o runbook "como subir a Sentia"; depois do incidente, o Claude propõe a atualização do runbook. *Por que:* runbook só é lido quando aparece na hora do problema.

**76. Manual da empresa com dono e validade.** Páginas com responsável e revisão a cada 90 dias; página vencida ganha aviso. *Por que:* documentação morre por falta de dono, não por falta de editor.

**77. Glossário por cliente alimentando a IA.** Termos do domínio de cada cliente entram no contexto das specs e do copiloto. *Por que:* a spec gerada para o cliente de saúde passa a usar a língua do cliente de saúde.

**78. As specs dos repositórios dentro do Nevo.** Indexar `docs/specs/**` dos repos ligados (vocês já usam spec-driven com `INDEX.json`) e ligar spec e tarefa, com o status da spec no card. *Por que:* a spec que o Claude Code escreve no repo passa a ser vista pelo PM sem abrir o GitHub.

**79. Busca com operadores.** `status:teste @leticia cliente:pet tag:bug` com recaída para a busca semântica, cobrindo comentários, notas, conteúdo de arquivo do Drive e docs dos repos. *Por que:* a paleta já existe; falta ela entender filtro.

**80. Gravação de tela interna.** O bug report já grava 60 segundos de tela; o mesmo recurso para o time explicar uma tarefa ou um PR, com transcrição e resumo. *Por que:* substitui a reunião de 15 minutos por um vídeo de 2.

**81. Drive com versões e conteúdo pesquisável.** Versões de arquivo (não existem hoje) e o texto dos PDFs indexado (o pipeline do OCR já extrai). *Por que:* "qual é a versão final do contrato?" deixa de ser pergunta.

---

## 8. Cofre e segurança operacional

**82. Revelar segredo sob demanda, com registro.** A listagem devolve mascarado; revelar é um clique que registra quem, quando e de onde (motivo opcional). *Por que:* hoje a tela mascara, mas a API entrega todos os segredos decifrados para qualquer membro de uma vez (`company-variable.service.ts:64`), sem rastro. A aba Histórico do cofre já está desenhada como "Em breve" (`VariableDrawer.vue:217`). É correção de segurança e recurso de venda ao mesmo tempo.

**83. Escopo de segredo por ambiente e por pessoa.** Segredo de produção só para ADMIN ou pessoas nomeadas. *Por que:* o estagiário não precisa da chave de produção do gateway de pagamento.

**84. Cofre sincronizado com Railway, Amplify e Vercel.** O Nevo como fonte única das variáveis de ambiente, com diff entre ambientes ("staging tem `STRIPE_KEY`, produção não"). *Por que:* variável faltando em produção é causa clássica de deploy quebrado (e conecta com a ideia 9).

**85. Rotação com lembrete.** Idade de cada segredo, tarefa de rotação automática, e rotação obrigatória depois de desligamento (ideia 59). *Por que:* segredo que nunca roda é segredo que já vazou e ninguém sabe.

**86. Varredura de segredo vazado.** Padrões de chave em commits e PRs dos repos ligados geram alerta imediato. *Por que:* chave da AWS commitada vira conta de cinco dígitos em horas.

**87. Login forte.** Passkey ou TOTP, confirmação extra para revelar segredo de produção, lista de sessões e dispositivos com revogação. **[sessão curta já mapeada: segurança V2.5, M9]**; o resto é novo.

**88. Registro de auditoria da empresa, exportável.** Quem mudou o quê e quando, em todos os módulos. *Por que:* contrato com cliente maior pede; a LGPD agradece.

**89. Backup que prova que funciona.** Dump noturno em storage separado e, uma vez por semana, restauração automática num Postgres embutido (o harness de `scripts/harness` já sabe subir um) com relatório na tela de ADMIN. *Por que:* backup não testado é esperança, e hoje o desenvolvimento acontece na produção.

---

## 9. O dia a dia de quem usa

**90. Paleta que faz, não só navega.** O Ctrl+K já navega, troca de empresa e busca (`CommandPalette.vue:101-130`), mas nem leva ao Board, Notas, Tempo e Calendário, nem abre tarefa pela chave. Faltam os verbos: "mover para Em teste", "atribuir à Letícia", "iniciar timer nesta", "criar tarefa no PJ", e frase livre interpretada pelo Haiku. *Por que:* é o atalho que transforma usuário frequente em fã.

**91. Caixa de triagem com teclado.** Menções, atribuições, pedidos de teste, alertas e aprovações numa fila só: `j`/`k` para andar, `e` para feito, `s` para adiar. *Por que:* o inbox atual tem 4 tipos de notificação; a fila vira o lugar onde o dia começa.

**92. Adiar até uma data ou até um evento.** "Me lembra depois do deploy", "até segunda". *Por que:* é o que todo mundo faz marcando como não lida.

**93. Dependência e bloqueio entre tarefas.** "Bloqueada por PET-12" no card, e aviso automático quando o bloqueio cai. *Por que:* o `Activity` não tem relação nenhuma entre tarefas, e quase todo trabalho real tem ordem.

**94. Campos personalizados por empresa.** Texto, número, data, lista, pessoa. *Por que:* cada cliente tem um dado que só ele usa (número do chamado, versão do app, loja).

**95. Visões salvas e compartilháveis.** O board já filtra por empresa, prioridade, busca e "Só minhas". Falta salvar a combinação com nome ("Bugs da Sentia em teste") e mandar por link. *Por que:* cada pessoa monta o mesmo filtro todo dia.

**96. Modelos de projeto.** "Lançamento de app" com as 40 tarefas de sempre (ícones, splash, política de privacidade, ficha da loja, prints, conta de teste para a revisão da Apple, deep links, push), "Cliente novo", "Site institucional". *Por que:* é o conhecimento da agência virando produto; cada projeto novo começa 80% pronto.

**97. Planejar arrastando para o calendário.** Tarefa arrastada para a agenda vira bloco de tempo, sincronizado com o Google. *Por que:* planejar a semana vira um gesto. *Melhoria junto:* o sync com o Google hoje só puxa quando alguém abre a agenda (ver M4).

**98. Lançamento de horas sugerido pelos rastros.** "Você fez commits das 14h às 17h no repo da Sentia sem timer. Lançar 3h no SENT-31?" E reuniões do calendário viram sugestão de lançamento no cliente certo. *Por que:* segue a filosofia que vocês já escolheram ("nunca cortar tempo trabalhado") e recupera hora faturável esquecida.

**99. Compartilhar do celular para o Nevo.** `share_target` na PWA (o manifesto já existe e não tem): print da galeria vira tarefa ou bug report. *Por que:* o caminho mais rápido do celular é o botão Compartilhar.

**100. Extensão que captura bug de qualquer site.** A extensão já existe para ociosidade; ganha o botão "capturar": print, console, requisições com erro, URL e navegador viram bug report no cliente certo. *Por que:* o testador e o atendimento reportam com tudo que o dev precisa, sem pedir "manda o console".

**101. Bug report dentro do app do cliente.** SDK para Expo e React Native: chacoalhar o celular abre o report com print, dispositivo, versão e logs, no mesmo pipeline do vídeo. *Por que:* o testador do cliente reporta de dentro do app, que é onde o bug está.

**102. Ações direto na notificação.** Aprovar, assumir alerta, responder comentário, mover tarefa, parar timer. O service worker já roteia ações; só o timer usa. *Por que:* metade das interações do dia pode terminar sem abrir o app.

**103. Discord e Slack nos dois sentidos.** `/nevo nova "..."` cria tarefa; reagir com ✅ conclui; resposta na thread vira comentário. *Por que:* o time já está no Discord; o Nevo vai até lá.

**104. Celular que aguenta sinal ruim.** Fila local de escrita (criar tarefa, comentar, timer) que envia quando a conexão volta, com estado honesto ("3 alterações esperando sinal"). O service worker hoje não intercepta requisição de propósito (`idle-sw.js:9-11`), então isso pede desenho cuidadoso. *Por que:* trabalhar pelo celular inclui metrô e elevador.

**105. Modo apresentação.** A revisão do mês vira apresentação automática com as tarefas entregues e as capas. *Por que:* a reunião com o cliente fica pronta em um clique.

---

## 10. O dinheiro da software house

**106. Rentabilidade por cliente.** Valor do contrato menos horas vezes custo interno: margem por cliente e por mês, e o alerta "o cliente X dá prejuízo há 3 meses". *Por que:* é o número que o dono mais quer e nenhuma ferramenta de tarefa dá. Pede valor-hora e contrato no `Company`, que não existem.

**107. Fechamento e cobrança.** Horas aprovadas ou pacote viram fatura, nota de serviço por API de emissão e cobrança por PIX ou boleto (Asaas ou similar), com o status "pago" voltando para o cliente. *Por que:* fecha o ciclo do dinheiro dentro do mesmo grafo. **[valor-hora e CSV já mapeados: workflow-v2 R3.7]**; emissão e cobrança são novas.

**108. Proposta comercial pelo histórico.** O lead descreve o projeto; o Nevo acha os projetos parecidos, soma as horas reais e gera a proposta com faixa de preço em PDF. *Por que:* orçamento deixa de ser chute e passa a ser dado.

**109. Funil leve de leads.** Lead, proposta, ganho; o lead ganho vira empresa com o modelo de projeto certo (ideia 96). *Por que:* o comercial da agência mora em lugar nenhum hoje.

**110. Contratos com vencimento e reajuste.** Aviso de renovação e de reajuste por índice. *Por que:* reajuste esquecido é dinheiro que não volta.

**111. Previsão de caixa.** Contratos recorrentes, pacotes e faturas em aberto, para os próximos 90 dias. *Por que:* o dono decide contratação olhando para frente, não para o extrato.

**112. As APIs como linha de receita.** QR, OCR e encurtador já são vendidos por token, e o OCR já mede custo por documento (`ocr/cost.ts`), mas não há limite nem cobrança. Um medidor único para todo microsserviço, limites por plano e fatura de uso mensal por cliente. *Por que:* transforma o que já está pronto em receita previsível, e cada microsserviço novo nasce cobrável.

**113. Custo de IA repassado.** O custo de OCR e de IA por cliente entra na fatura sozinho. *Por que:* hoje esse custo sai da margem.

---

## 11. Plataforma e ecossistema

**114. API pública v1 e webhooks de saída assinados.** **[já mapeado: produto-next-200 P2.21]**. Com o barramento (ideia 2) fica quase de graça.

**115. Conector para n8n, Make e Zapier.** *Por que:* cada cliente tem uma ferramenta estranha; o conector resolve as cem integrações que vocês nunca vão escrever.

**116. GitLab com o mesmo peso do GitHub.** Webhooks, merge requests e pipelines ligados à chave da tarefa. *Por que:* parte do código do time mora no GitLab (há um CSV de issues abertas do GitLab na raiz da API), e esse código hoje é invisível para o Nevo.

**117. Importadores que podem rodar duas vezes.** O importador do Jira duplica tarefas ao reimportar e mapeia status por IDs fixos (`import/import.service.ts`). Importação idempotente, com prévia, e mais fontes: GitLab issues, Trello, Linear, ClickUp. *Por que:* migrar para o Nevo vira tarefa de 10 minutos, e é a primeira barreira de qualquer venda.

**118. Prévia rica de link.** Link de tarefa colado no Discord, WhatsApp ou Slack mostra chave, título, status e responsável (OpenGraph sem dado sensível). *Por que:* todo mundo cola link de tarefa o dia inteiro.

**119. Flags por empresa e por pessoa.** Hoje só existe `canvasEnabled` (`feature-flags.controller.ts`). Flags por empresa, por porcentagem e com desligamento de emergência. *Por que:* lançar recurso para um cliente piloto sem lançar para todos.

**120. Medição de uso de verdade.** Eventos de produto próprios (sem lib de terceiro, gravados no barramento) e um painel de "quem usa o quê". *Por que:* em outubro as Notas saíram do menu e tiveram que voltar porque havia gente usando (memória `ui-nao-ia`). Com medição, decisão de produto deixa de ser palpite.

---

## 12. O que melhorar no que já existe

**M1. Busca semântica.** Trocar a força bruta por `pgvector` (o Supabase tem), indexar por entidade na escrita em vez de apagar e recriar tudo, e incluir notas, comentários e conteúdo do Drive. Evidência: `intelligence.service.ts:78-93`, `:132-153`, `:158-260`.

**M2. Agente.** Ferramentas de escrita com confirmação (fundação 4), memória por usuário, plano visível antes de agir, e o teto de 6 rodadas ajustável por tipo de pedido. Evidência: `agent.service.ts:17-18`.

**M3. Notificação orientada a evento.** O cron de 2 h que manda atrasadas e sem responsável para o Discord vira assinante do barramento, com preferência por pessoa e por canal. Evidência: `notifications.service.ts`.

**M4. Google Calendar em tempo real.** Hoje só puxa quando alguém abre a agenda, o erro vai para `console.error` e o redirect está fixo em `stackroads.vercel.app`. Usar os canais de `watch` do Google, retry e URL por ambiente. Evidência: `auth/google.controller.ts`, `event/event.service.ts`.

**M5. Migration aplicada pelo pipeline.** Pelo menos quatro migrations ficaram pendentes em produção nos últimos meses, e o schema já se curva a isso: tabelas são criadas separadas "porque o deploy não aplica migration" (`schema.prisma:225-227`). Rodar `prisma migrate deploy` na fase de release, com bloqueio se falhar, e uma tela de ADMIN mostrando migrations pendentes. É a melhoria de processo que mais devolve tempo.

**M6. Ambiente de desenvolvimento separado.** **[já mapeado: EVOLUCAO Problema 2]**. O harness com Postgres embutido e seed sintético já é meio caminho para um staging.

**M7. CI.** Existem 71 arquivos `*.spec.ts` na API e nada que os rode. Typecheck, lint, testes e build em PR nos dois repos. **[já mapeado: workflow-v2 R2.10]**.

**M8. Observabilidade.** Só o `Logger` do Nest e `console.error` em pontos. Sentry (ou o próprio recurso da ideia 14 usado no Nevo), logs estruturados com o `requestId` que já existe, e alerta do próprio Nevo no Nevo.

**M9. Crons com trava.** Trava por `pg_advisory_lock` nos três crons, antes de qualquer segunda réplica no Railway, ou eles disparam em dobro.

**M10. Cofre.** Ver ideias 82 e 83. É o item de segurança com maior risco real hoje.

**M11. Banco de horas.** Feriados estaduais e municipais (hoje só nacionais, `holidays.ts`), regra de hora extra configurável e o espelho em PDF da ideia 67.

**M12. Drive.** Versões e busca por conteúdo (ideia 81), seleção múltipla e lixeira; hoje a busca é só por nome.

**M13. Webhook de deploy.** Mais provedores (ideia 25) e o vínculo com tarefa (ideia 6). O backend está pronto e a migration ainda não foi aplicada.

**M14. Inbox e push.** O inbox tem 4 tipos e o push tem 3 gatilhos. Com o barramento, toda notificação passa a ter canal, prioridade e ação.

**M15. Empresa como cliente de verdade.** `Company.cnpj` é obrigatório e único: dois projetos do mesmo cliente exigem dois CNPJs. CNPJ opcional **[já mapeado: EVOLUCAO 5.6]**, mais os campos de contrato, valor-hora e marca que as ideias 49, 74 e 106 pedem.

**M16. Ano na tarefa.** **[já mapeado: workflow-v2 R4]**. Janeiro de 2027 ainda cai no mesmo mês de janeiro de 2026.

**M17. Roadmap.** `RoadmapView.vue` com 5.650 linhas **[já mapeado: workflow-v2 V2.6]**.

**M18. Contrato front e back tipado.** Tipos gerados a partir do OpenAPI **[já mapeado: EVOLUCAO Decisão 14]**; fica obrigatório quando o MCP e a API pública existirem, porque viram três consumidores do mesmo contrato.

**M19. Recorrência ligada de verdade.** O backend de tarefas recorrentes está concluído, mas o front roda com `RECURRING_API_ENABLED` desligado e a recorrência fica só local (`config/feature-flags.ts:64`). Ligar a flag é o que separa "tarefa recorrente" de "tarefa recorrente no meu navegador".

**M20. O wedge de volta ao menu.** Bug reports e Calendário estão fora da navegação (`config/nav-visibility.ts:13`), e o detalhe do bug report não muda status nem responde a quem reportou. É o recurso mais diferenciado do produto escondido atrás de URL.

**M21. Timer e IA dentro da tarefa.** O timer não fica na tarefa (ela é escolhida na tela de Tempo) **[já mapeado: workflow-v2 R2.4]**, e o "Melhorar com IA" só existe na página cheia, não no painel (`TaskDetailsView.vue:1130`). As duas ações mais frequentes ficam a dois cliques do lugar onde a pessoa está.

**M22. "Meu dia" que resolve.** Hoje cada linha leva ao board; não dá para concluir, adiar ou iniciar o timer ali (`MyDaySection.vue`). Ações na própria linha fazem a home virar o lugar onde o dia anda.

**M23. Exportar tarefas.** Não existe exportação de tarefas (só tempo em CSV, roadmap em PDF, QR em imagem e variáveis em `.env`). CSV e JSON por empresa, que também é a base da portabilidade da LGPD **[portabilidade já mapeada: EVOLUCAO 5.4]**.

**M24. Higiene que confunde.** O atalho "Ctrl Shift L" está documentado em Configurações sem handler (`SettingsView.vue:1164-1170`); `useKeyboardShortcuts.ts` e `askWorkspace` não são usados; `WorkspaceView.vue` não tem rota; `/download` aponta para um artefato fixo do CI; e o `src/CLAUDE.md` ainda cita `/tickets` e abas que mudaram. Cada uma dessas é pequena, mas é exatamente o que faz um agente (ou uma pessoa nova) tomar decisão errada.

---

## 13. Ordem que eu seguiria

O critério é alavanca: quantas outras ideias cada item destrava, e quanto ele protege.

| # | Item | Ideias | Por que nesta posição |
|---|---|---|---|
| 1 | Chave da tarefa resolvida pela API + webhook do GitHub ligando commit e PR | 1, 6, 24 | Destrava mais de 15 ideias e começa sem migration, porque a chave já existe no front. Sem ela, deploy e código continuam ilhas |
| 2 | Deploy sabe o que levou, Revisados vira Concluído, release notes | 7, 8, 25, M13 | Fecha o recurso de deploy que você já começou e que o time sente falta |
| 3 | Diagnóstico de build com Claude + plantão com "Assumi" no push | 9, 15, 22 | Transforma alerta em ação; o service worker já suporta botão |
| 4 | Cofre com revelação registrada e escopo por ambiente | 82, 83 | Maior risco real de segurança hoje, e esforço pequeno |
| 5 | Servidor MCP do Nevo | 5 | Barato e usado todo dia por quem já vive no Claude Code |
| 6 | Barramento de eventos com pg-boss + trava nos crons | 2, M3, M9 | Base de automação, notificação e escala, sem infraestrutura nova |
| 7 | Agente com mãos e cartão de confirmação | 4, 42 | O copiloto deixa de ser chat |
| 8 | Radar de vencimentos + uptime | 13, 18 | Barato e evita o pior dia do ano de um cliente |
| 9 | Migration no pipeline + backup testado | M5, 89 | Devolve tempo toda semana e protege a produção onde se desenvolve |
| 10 | Delegar ao agente de código | 26, 27, 28 | A aposta grande; depende de 1, 5 e 7 estarem de pé |

## 14. O que eu deliberadamente não faria

- **CI/CD próprio.** Ler o CI dos outros (ideia 24) entrega o valor sem o custo.
- **Sentry completo.** Aceitar o envelope do Sentry ou integrar; construir agregação de erro do zero é um produto inteiro.
- **Folha de pagamento.** Espelho de ponto e demonstrativo (67 e 68) sim; folha é regulação demais para o tamanho do time.
- **Chat interno.** Discord e WhatsApp já existem; o Nevo vai até eles (103 e 51).
- **App nativo** antes de `share_target`, ações na notificação e fila offline na PWA (99, 102 e 104).

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-11-05 | 0.1 | Criação: diagnóstico, 120 ideias, 24 melhorias, ordem e anti-lista | Nicolas (via spec-driven) |
