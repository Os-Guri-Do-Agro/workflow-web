# Spec: v2, parte 3 (board e notas no celular, roadmap novo com teste)

**Status:** Implementado no harness (sem commit; aguarda o dono para subir e aplicar a migration 20261105220000_roadmap_teste)
**Autor:** Nicolas (via spec-driven, Agentes 1 e 2)
**Criado em:** 2026-11-05
**Versão:** 0.3
**Épico:** [workflow-v2](../../../epicos/workflow-v2.md)
**Antes desta:** [v2-uteis.md](./v2-uteis.md)

---

## O pedido

> "para mobile deveria ser uma forma diferente a board, assim não dá para arrastar a tela e depois arrastar a atividade" (print do board do mês em 397 px)
>
> "faça tudo necessário, melhore até o roadmap, opção de teste ali, tem que ter mais coisa legal, melhorar notas para funcionar em celular da melhor forma, a parte de roadmap tem que evoluir muito o layout. pode fazer tudo."

O dono aprovou o caminho A do board no celular (uma coluna por vez) e deu aprovação prévia para o resto.

## O recorte

| # | Item | Quem |
|---|---|---|
| C1 | Board no celular: uma coluna por vez com abas e contagem, deslizar troca de coluna; segurar o card abre "Mover para" em folha; arraste só depois de segurar. Vale no board do mês e no `/board` | Agente 2 |
| C2 | Notas no celular: topo que não quebra, barra de formatação presa acima do teclado, sem bubble menu no toque, tab bar some enquanto digita, lista mais rápida de usar | Agente 2 |
| R1 | Roadmap, visão Mês: um mês por vez com navegação, calendário com o título dos itens dentro do dia, painel lateral (objetivo, foco, próximos, em teste, fotos), editar e mover item | Agente 1 |
| R2 | Roadmap, visão Ano: linha do tempo de verdade (meses no eixo, faixa de objetivos, marcos com janela de teste, entregas empilhadas sem colisão), zoom por trimestre, lista vertical no celular | Agente 1 |
| R3 | "Teste" no roadmap: categoria Teste para item da agenda, janela de teste no marco (de quando a quando a versão fica em teste antes de sair) e o painel "Em teste agora" com Web, iOS e Android de cada tarefa | Agente 1 (API e front) |
| N1 | Necessários pequenos: as 5 chamadas que levam 401 no login e no `/redefinir-senha`; o teste instável do heartbeat do timer | Agente 2, depois de C1 e C2 |

Fora daqui: npm audit (PR próprio), auditoria rota a rota do grupo 2 da API (vira a próxima rodada), qualquer recurso de IA novo. O "Gerar com IA" do roadmap continua existindo, mas sai da barra principal para o menu "Mais".

## Decisões

- **D1. Board no celular = uma coluna por vez (abaixo de 640 px).** As abas no topo mostram as colunas com a contagem; a aba ativa usa a cor do acento. Deslizar troca de coluna, com `scroll-snap` e a aba acompanhando. O arraste do Sortable só começa depois de segurar 300 ms (`delay` + `delayOnTouchOnly`), então rolar nunca pega card sem querer. Segurar e soltar sem mover abre a folha "Mover para" com as colunas em botões grandes (alvo de 48 px). A folha é o caminho principal no celular; o arraste fica para reordenar dentro da coluna. No computador nada muda.
- **D2. A regra de Revisados vale na folha.** O "Mover para" do celular passa pelo mesmo `reviewBlockReason` do menu do card. Não existe caminho novo de gravação: a folha emite o mesmo `move` do menu "…".
- **D3. Notas no celular: a formatação mora acima do teclado.** Com o editor em foco no celular, a toolbar do topo some e aparece uma barra presa acima do teclado (`visualViewport`), rolável de lado: checklist, lista, título, negrito, itálico, link, desfazer e "fechar teclado". O bubble menu não abre no toque (briga com o menu nativo de seleção). Enquanto o teclado está aberto, a tab bar do `MobileShell` sai. O "Salvo às HH:MM" vira um indicador curto que não quebra linha.
- **D4. Roadmap: duas visões, Mês e Ano**, no lugar de "Mensal" e "Timeline do ano". A visão Mês mostra um mês por vez (setas, "Hoje", teclas ← →) em vez de cartões lado a lado mais "Meses passados (10)". A visão Ano é uma linha do tempo com meses no eixo; as "lanes por trimestre" saem, porque cada linha só tinha conteúdo no próprio trimestre e o resto ficava vazio.
- **D5. Categoria Teste em `RoadmapCategory`** (`test`). Migration aditiva (`ALTER TYPE ... ADD VALUE`). Cor `--status-test`, ícone de frasco. Sem a migration, a API responde 503 com mensagem em PT-BR ao criar item de teste; ler continua funcionando.
- **D6. Janela de teste no marco** (`RoadmapMilestone.testStart`, `YYYY-MM-DD`, opcional, no máximo igual à data do marco). Na visão Ano, o marco ganha uma faixa "Teste" de `testStart` até a data; na visão Mês, os dias da janela ganham a faixa no calendário e a agenda mostra "Teste de App 1.5 (21 a 27/11)". Mesma migration da D5.
- **D7. "Em teste agora"** vem da API: o `GET /roadmap/monthly` passa a trazer `inTesting` (tarefas de primeiro nível da empresa em Em teste, com ou sem prazo, com `testChecks`), e cada entrega traz `testChecks`. Usa o `ActivityTestCheckService.withTestChecks` que o board já usa. O link público continua sem tarefa nenhuma.
- **D8. Itens editáveis.** Clicar num item da agenda abre o editor (título, data, tipo, descrição; excluir). Mudar a data para outro mês move o item de mês (cria o mês de destino se preciso e apaga do antigo). O objetivo do mês (`main`) é editável no próprio cabeçalho (PATCH do mês).
- **D9. Mais útil, sem vitrine:** contagem até o próximo marco ("App 1.5 nas lojas em 23 dias"), progresso das tarefas do mês ("4 de 6 concluídas"), filtro por pessoa na visão Ano, e entrega clicada abre a tarefa no painel do board.
- **D10. Paridade.** Nada que existe some: foco do mês (adicionar e remover), fotos (subir e remover), comentários do mês, exportar PDF (um mês ou todos), compartilhar link público, gerar com IA, marcos e reviews (criar, editar, remover), e os estados vazio, carregando e erro.

## Acceptance Criteria

### C1. Board no celular
- [x] Em 375 px, o board do mês mostra uma coluna por vez, com abas no topo (nome e contagem) e a aba da coluna visível marcada.
- [x] Deslizar o dedo sobre um card troca de coluna e não move o card (status e posição no banco iguais).
- [x] Segurar um card e soltar sem mover abre a folha "Mover para"; tocar numa coluna move o card, e o status no banco do harness confere.
- [x] Mover de Em teste para Revisados sem as três plataformas é recusado na folha, com a mesma mensagem do menu (a folha já mostra o motivo embaixo de Revisados).
- [x] Segurar e arrastar reordena dentro da coluna.
- [x] O `/board` segue o mesmo modelo no celular (sem reordenar: lá não existe ordem manual).
- [x] Em 1440 px, os dois boards continuam iguais (diferença de 0 px em `/tasks`, agrupado e `/board`).

Decisões tomadas na implementação: no celular o arraste só reordena dentro da coluna e trocar de coluna é pela folha; segurar só abre a folha com o dedo (mouse nunca); colunas a 100% sem a ponta da vizinha; "Recolher Concluído" fica fora no modo de uma coluna; no agrupado por pessoa, trocar de coluna é um deslize medido (56 px). Componentes: `BoardColumnTabs`, `TaskMoveSheet`, `useBoardPager`, `useCardLongPress`, `usePhoneViewport`.

### C2. Notas no celular
- [x] Em 375 px, o topo da nota não quebra linha em nenhum estado de salvamento (52 px em inicial, Salvando, Salvo, Erro e Só leitura; 320 px visto).
- [x] Com o editor em foco, a barra de formatação aparece presa acima do teclado (simulada pelo `visualViewport` no harness) e aplica checklist, lista, título e negrito (a formatação chega ao banco).
- [x] O bubble menu não abre ao selecionar texto com toque.
- [x] A tab bar sai enquanto o editor está em foco e volta ao sair (também ao sair da nota com o foco dentro).
- [x] No computador, a toolbar do topo e o bubble menu continuam como estão.

Componentes: `NoteKeyboardBar` (checklist, lista, numerada, H2, negrito, itálico, tachado, link, desfazer, refazer e "Fechar teclado"; botões de 44 px que não tiram o foco do editor), `useShellChrome` (pedido de tela com dono para a tab bar sair, com `--shell-bottom-inset` coerente) e `SaveStatus` com a prop `short`. Na lista: busca e pastas na mesma linha, prévia de 2 linhas, fixar visível no toque.

### R1 a R3. Roadmap
- [x] Visão Mês, computador: um mês por vez com ‹ › e "Hoje"; o calendário mostra o título de até 3 itens por dia e "+N"; o painel lateral tem objetivo editável, foco, próximos 14 dias, em teste agora e fotos.
- [x] Visão Mês, 375 px: calendário compacto com pontos; tocar num dia filtra a agenda; nada passa da borda (conferido também em 320 px).
- [x] Adicionar item da categoria Teste grava `category: test` e aparece no calendário com a cor de teste.
- [x] Editar um item (título e data) grava, e mudar a data para outro mês move o item de mês.
- [x] Marco com janela de teste: na visão Ano aparece a faixa "Teste" de `testStart` até a data; na visão Mês, os dias da janela têm a faixa.
- [x] "Em teste agora" lista as tarefas em Em teste com o estado de Web, iOS e Android.
- [x] Visão Ano, computador: meses no eixo, faixa de objetivos por mês, marcos e entregas sem sobreposição de rótulo, linha de hoje; Q1 a Q4 dão zoom; clicar numa entrega abre a tarefa.
- [x] Visão Ano, 375 px: lista vertical por mês, aberta no mês atual.
- [x] Exportar PDF, compartilhar, foco, fotos, comentários e gerar com IA continuam funcionando. PDF local, link público, foco e comentários exercitados no harness; subir foto e gerar com IA dependem de bucket e chave que o harness não tem (o código chama as mesmas rotas de antes).
- [x] Sem a migration, ler o roadmap funciona e criar item de teste devolve 503 com mensagem clara (janela de teste exercitada com a coluna removida no harness; a categoria por teste unitário, porque o Postgres não remove valor de enum).

Prova: `scripts/harness/roadmap-e2e.cjs`, 31/31 (rodar de novo só depois de 1 minuto, ver o cabeçalho do roteiro). Prints em `scripts/harness/prints/roadmap-*.png`.

### N1
- [x] `/login` e `/redefinir-senha` abrem sem nenhuma resposta 401 (eram 9 chamadas: antes do router resolver, a moldura logada montava por um instante; e o cronômetro do `AppShell` buscava sem sessão. Agora `hasSession` em `composables/useSession.ts`).
- [x] O teste do heartbeat passa 5 vezes seguidas na suíte inteira (a asserção recalculava o instante com outro `Date.now()`; o serviço estava certo).

Prova de C1, C2 e N1: `scripts/harness/celular-e2e.cjs`, 111/111 (rodado pelo Agente 2 e de novo pelo Agente 1). Regressão: `uteis-e2e.cjs` 18/18, `api-smoke.cjs` sem nenhuma resposta 4xx/5xx em 14 telas como ADMIN e como WORKER, `npm test` da API com 1104 testes.

## Achados no caminho (R)

- **A mensagem real do Prisma 7 não diz qual coluna falta** ("The column `(not available)` does not exist"). O primeiro detector de coluna ausente exigia o nome e deixava a timeline dar 500 sem a migration; o roteiro pegou. Agora o código P2022 basta, a menos que a mensagem nomeie outra coluna (com teste usando a mensagem capturada).
- **O jest do workflow-api resolvia `.js` antes de `.ts`**, e há 9 `.js` compilados antigos versionados em `src/` (ex.: `src/roadmap/roadmap.service.js`). Teste de `RoadmapService` rodava contra a cópia velha. A ordem virou `ts, js, json`; apagar os `.js` fica para o dono decidir.
- **"Marco" existia duas vezes**: como tipo de item da agenda e como marco da linha do tempo. O filtro junta os dois em "Marcos" e item novo não oferece mais o tipo (o antigo continua editável).

## Achados no caminho (C e N)

- **Abrir uma nota já gravava**: o `setEditable` do TipTap 3 emite `update`, e isso mandava um PATCH idêntico ao do servidor. A data e a ordem na lista mudavam a cada abertura, e numa nota compartilhada quem abrisse depois podia levar o 409. Agora é `setEditable(canEdit, false)`; o roteiro confere 0 PATCH ao abrir.
- **`npx vue-tsc --noEmit` não confere nada neste repo**: o `tsconfig.json` da raiz tem `files: []` e só referências. A checagem real é `npx vue-tsc --build` (com `--force` para ignorar o cache). Rodada limpa nesta entrega.
- **`npx jest` puro derruba 3 suítes de OCR** por falta de `--experimental-vm-modules`; o certo é `npm test`.

## O que só o aparelho prova

Posição da barra com o teclado de verdade do iOS e do Android, a barra acompanhando a rolagem, os botões não fecharem o teclado no iOS; a tolerância de 8 px do dedo, o deslize rápido parando na coluna vizinha, a lupa e o menu do Safari e do Android ao segurar. Fora daqui: zoom de pinça com a barra de formatação.

## Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Deploy sem a migration da D5/D6 | Média | Médio | Leitura não usa o valor novo; escrita com `test` ou `testStart` devolve 503 em PT-BR; a migration vai na lista do dono e é aditiva |
| Gesto do celular brigar com o Sortable | Média | Alto | `delayOnTouchOnly` + teste de toque real no harness (`hasTouch`), com deslizar e segurar exercitados |
| Reescrever o roadmap perder recurso | Média | Alto | Lista de paridade (D10) conferida item a item no harness antes de fechar |
| `visualViewport` diferente no iOS | Média | Médio | Barra posicionada por `visualViewport.height + offsetTop`, com fallback para o rodapé fixo; conferir no iPhone de verdade depois do deploy (o dono) |

## Verificação

Harness (`scripts/harness`): API real em Postgres embutido, capturas em 375 e 1440 px e roteiros de ponta a ponta para cada item, conferindo o banco. `npx vue-tsc --noEmit` e `npx tsc --noEmit` limpos; testes da API passando.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-11-05 | 0.1 | Recorte, decisões e critérios; implementação começa com aprovação prévia | Nicolas (via spec-driven, Agentes 1 e 2) |
| 2026-11-05 | 0.2 | R1 a R3 entregues e provados (31/31); achados do caminho | Nicolas (via spec-driven, Agente 1) |
| 2026-11-05 | 0.3 | C1, C2 e N1 entregues pelo Agente 2 e reverificados (111/111); regressão e gates; status Implementado no harness | Nicolas (via spec-driven, Agentes 1 e 2) |
