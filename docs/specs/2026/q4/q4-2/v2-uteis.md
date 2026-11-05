# Spec: v2, parte 2 (coisas úteis no dia a dia, sem IA)

**Status:** Em Implementação
**Autor:** Nicolas (via spec-driven, Agentes 1 e 2)
**Criado em:** 2026-11-05
**Versão:** 0.1
**Épico:** [workflow-v2](../../../epicos/workflow-v2.md)
**Origem:** recorte da análise [nevo-utilidade-total-ideias.md](./nevo-utilidade-total-ideias.md). O dono pediu "coisas úteis de verdade, sem foco em IA, não quero 120 coisas".

---

## O recorte (o que entra hoje)

| # | Item | Ideias da análise | Quem |
|---|---|---|---|
| U1 | A chave da tarefa funciona: Ctrl+K abre tarefa por `PJ-K7Q2XM` ou pelo título; atalhos para Board, Tarefas do mês, Meu tempo, Notas; Nova tarefa e Nova nota | 1 (passo de leitura), 90 | Agente 1 |
| U2 | "Meu dia" que resolve: Começar / Mandar pra teste, Adiar (amanhã, próxima segunda, uma semana) e timer na própria linha | M22 | Agente 1 |
| U3 | Timer dentro do painel da tarefa | M21 | Agente 1 |
| U4 | Pessoa nova entra sozinha: link de primeiro acesso e "Esqueci minha senha" (e-mail opcional) | 3 (saída), 58 | Agente 2 |
| U5 | Cofre: segredo mascarado, "Revelar" registrado e Histórico | 82, M10 | Agente 2 |
| U6 | CI nos dois repos (typecheck, testes, build) | M7 | Agente 2 |

Fora daqui (de propósito): agente com ações, MCP, release notes por IA, diagnóstico de build por IA, barramento de eventos. A chave **no servidor** (para ligar commit, PR e deploy à tarefa) entra junto com o webhook do GitHub, que é a próxima rodada.

## Decisões

- **D1. Chave resolvida no front.** O `/dashboard/workspace` (o mesmo do Meu dia, cacheado) já traz id e empresa de toda tarefa; a paleta calcula a chave com o mesmo `taskKey()` do card e casa com `matchesTaskKey()`. Zero endpoint novo, zero migration. Ordem: chave exata, chave parcial, título que começa com o termo, título que contém; abertas antes das concluídas.
- **D2. O botão principal do Meu dia segue o fluxo do time e para em Em teste.** A fazer vira "Começar" (Em andamento); Em andamento vira "Mandar pra teste". Dali em diante quem testa decide (Revisados exige as três plataformas).
- **D3. Um timer por pessoa.** `useTaskTimer` para o timer atual antes de ligar em outra tarefa, abre o aviso de proteção limitada quando precisa (igual ao widget do topo) e toca os sons do cronômetro.
- **D4. Toda ação vai com a empresa da tarefa** (`x-company-id` explícito): o Meu dia e o Ctrl+K misturam empresas.
- **D5. "Nova tarefa" da home abre o mês corrente.** Antes ia para o primeiro mês do ano (janeiro), e a tarefa caía no board errado (bug encontrado nesta rodada).
- **D6. Meu dia no celular: ações na fileira da empresa e do prazo.** Uma fileira só de botões por tarefa deixava a lista três vezes mais alta. A meta saiu de dentro do link (botão dentro de `<a>` é inválido) e o link se estica sobre a linha (`::after`), então qualquer vão continua abrindo a tarefa. Quando não cabe, o `flex-wrap` desce as ações sozinho. No celular o botão diz "Pra teste" (o nome acessível continua "Mandar pra teste").

## Achados no caminho (corrigidos nesta rodada)

- **Todo o conteúdo do celular vazava ~8px na direita.** O grid do `MobileShell` não definia coluna; a coluna implícita crescia até o min-content do topo (o nome inteiro da empresa conta, mesmo com reticências) e o `overflow: hidden` cortava a sobra. Agora `grid-template-columns: minmax(0, 1fr)`; abaixo de 390px a marca do Nevo sai do topo para o nome da empresa caber (alvos de toque de 44px não encolhem).
- **Board no celular:** os quatro selects empilhavam um por linha, alinhados à direita, e a toolbar comia um terço da tela. Viraram uma fileira que rola de lado (o menu abre em portal, não é cortado).
- **Meu tempo no celular:** a aba "Meu tempo" quebrava em duas linhas dentro da pílula de 34px. As abas dividem a largura sem quebrar; abaixo de 375px os ícones saem.
- **Ctrl+K:** resultado da busca semântica não ganha mais destaque letra a letra ("P" e "j" de "Planejamento" ao buscar "pj-"); o marco do roadmap no índice usa "Título · 28/11/2026" em vez de "2026-11-28 — Título" (travessão em copy). Os índices antigos se refazem sozinhos no cron de 10 min na próxima edição da empresa.

## Acceptance Criteria (U1 a U3)

- [x] Ctrl+K com `PJ-19663A` lista a tarefa e o Enter abre o painel em `/board?task=&company=`.
- [x] Ctrl+K com "cadastro do pet" acha pelo título, sem acento e sem caixa.
- [x] Painel: "Timer" liga nesta tarefa, mostra o relógio e para.
- [x] Meu dia: Começar manda para Em andamento; Adiar para amanhã grava o prazo; timer liga e para na linha, que fica destacada.
- [x] "Nova tarefa" da home abre `/tasks/<mês atual>?new=1`.
- [x] Celular (375 px): ações sempre visíveis, alvo de 36 px, na mesma fileira da empresa e do prazo; tocar na meta abre a tarefa.
- [x] Desktop: clicar no vão da linha abre a tarefa (link esticado).
- [x] Nada passa da borda em 320, 360, 375, 390 e 414 px (home, board, tempo, notas).

Prova: `scripts/harness/uteis-e2e.cjs` (18 checagens, conferindo status, prazo e `TimeEntry` no banco do harness; repetível, devolve a tarefa para A fazer antes). Sondas de largura e do filtro do board no celular rodaram à parte.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-11-05 | 0.1 | U1 a U3 entregues e provados; U4 a U6 em andamento | Nicolas (via spec-driven, Agentes 1 e 2) |
| 2026-11-05 | 0.2 | D6 + achados no caminho (vazamento do shell no celular, filtros do board, abas do tempo, Ctrl+K) | Nicolas (via spec-driven, Agente 1) |
