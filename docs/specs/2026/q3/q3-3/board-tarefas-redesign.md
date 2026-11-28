# Spec: Board de tarefas "não IA" (Jira denso + Lista + Agrupar por pessoa)

**Status:** Em Implementação
**Autor:** Claude (Opus 5.5) a pedido do Nicolas
**Criado em:** 2026-09-26
**Última atualização:** 2026-09-26 (v0.6, correções da revisão final)
**Versão:** 0.6

> Direção aprovada pelo Nicolas em 2026-09-26 no protótipo navegável (https://claude.ai/artifact/Lc6YKGTyUUwbyWeSApqHpq): **"A com B e C"**. Em números: board denso estilo Jira como padrão, vista Lista estilo Linear com seleção em massa, e "Agrupar por pessoa" estilo Azure como opção.

Pesquisa completa (mapa do código, diagnóstico com prints, referências oficiais de Jira, Azure DevOps e Linear, princípios e riscos): `scratchpad/board-research.md` da sessão de 2026-09-26. Os pontos que decidem esta spec estão abaixo.

---

## Visão Geral

Trocar o board de tarefas do mês (e o `/board` agregado) por uma ferramenta de trabalho com usabilidade de Jira/Azure e acabamento de Linear, tirando a "cara de IA" apontada pelo dono.

## Motivação

Palavras do dono: "o nosso é muito IAZADO, tá meio ridículo, até os cards tão IAZADOS". A pesquisa confirma com medida e print:
- **Densidade:** o card mediano tem 121px, e só cabem 4 a 5 cards por coluna em 1440x900.
- **Excesso de enfeite:** 27 `color-mix` só no KanbanBoard, pills tintadas em tudo, eyebrows em caixa alta e animação em cada carga e em cada hover.
- **Falta de identidade:** não existe chave de tarefa.
- **Prioridade contraditória:** quatro escalas diferentes. A mesma tarefa aparece como P0 "Baixíssima" verde numa tela e P0 "Crítica" vermelho na outra.
- **Feito por partes:** dois boards que divergem em card, arraste, detalhe e prioridade.

---

## Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Direção:** A (Jira denso) é o padrão da aba Board. C (Lista agrupada + seleção em massa) é a vista "Lista". B entra como **"Agrupar: Pessoa"** na toolbar do board. | Escolha do dono no protótipo. |
| D2 | **Chave de exibição sem migration:** `<PREFIXO>-<6 últimos caracteres do id em maiúsculas>`, por exemplo `PJ-K7Q2XM`. O prefixo são as iniciais da empresa (PetJourney → PJ, Stack Roads → SR); com uma palavra só, as 2 primeiras letras. Aparece no card, na lista, no painel, no breadcrumb e na busca (aceita `PJ-K7Q2XM`, `k7q2xm` ou `k7q2`). | Estável para sempre e sem coluna nova. Numerar por ordem de criação renumeraria as tarefas quando alguém excluísse uma. A chave sequencial de verdade fica como follow-up com migration. |
| D3 | **Prioridade única, com 5 níveis na exibição:** Sem prioridade, Baixa, Média, Alta e Urgente. Mapeamento crescente do `priorityNumber`: 0 sem, 1 baixa, 2 média, 3 alta, 4 e 5 urgente. **Um só** módulo de meta (`task-meta.ts`) para status e prioridade, com um único conjunto de ícones, usado por todas as telas. | O formulário e o board do mês, onde nasce a maioria dos dados, gravam em ordem crescente. Uma contagem por valor em produção (script somente leitura para o dono rodar) confirma ou corrige o mapeamento. |
| D4 | **Card:** título 14/500 (até 2 linhas); tags como ponto + texto (máx. 2 + "+N"); linha de meta 12px com chave, rotina, prazo, subtarefas `3/6` e anexos; à direita, prioridade (só Alta e Urgente têm cor) e até 2 avatares de 20px. Sem capa, sem checklist expansível, sem lixeira no card (excluir vai para o menu "…"). **O anel de subtarefas sai do card e vira texto `3/6`**; o anel continua no Dashboard. | Densidade (64 a 84px, 8 a 9 cards por coluna). Cor só onde muda decisão. |
| D5 | **Coluna:** largura fixa 280px, poço neutro (`--surface-sunken`, raio 8px), cabeçalho de 36px com ícone de status, nome e contagem. "+" e "…" aparecem no hover. "Criar" inline no rodapé. Concluído pode ser recolhido. | Padrão Jira/ADS. |
| D6 | **Cor:** o status aparece só no ícone de 14px (A fazer neutro, Em andamento azul, Em teste violeta, Concluído verde). Prazo em vermelho se atrasado ou vence hoje, laranja até 7 dias, cinza no resto, sempre texto e nunca fundo. O accent fica só para o primário, o foco e a seleção. **Sem** cor em borda de card, cabeçalho de coluna, régua ou fundo, e nunca borda esquerda. | Princípio "nada compete por atenção que não ganhou" (Linear 2026). |
| D7 | **Movimento:** fica só onde há mão: assentamento ao soltar, reordenação FLIP de 150ms, abertura do painel (180ms), recolher e expandir. **Sai:** entrada escalonada, hover que levanta, zoom de capa, leque de avatares, contador que pula, anel com mola no card, barra de pulso, blur de vidro no scrim do painel e nos diálogos das tarefas, e rotação/escala no arraste. | Movimento gratuito é o que mais denuncia template. |
| D8 | **Toolbar sempre visível:** busca (`/`), avatares clicáveis, "Só minhas", "Atrasadas", "Atualizadas 24h", "Sem responsável", menus Tags e Prioridade, "Agrupar: Nenhum / Pessoa" e "Limpar". Os filtros vão para a URL. O "Lembrar filtro" que já existe continua. | Quick filters do Jira. |
| D9 | **Detalhe em painel lateral** sobre o board do mês (`?task=`), reusando o `TaskDetailPanel`. Tem chave com copiar, status como botão-lozenge com menu, grade de propriedades, subtarefas em lista de 32px e J/K para trocar de tarefa. A página cheia continua como está (fallback) e converge depois. | Sidebar do Jira e peek do Linear. O painel já tem autosave. |
| D10 | **Teclado:** C cria, / filtra, J/K e setas navegam, Enter/O abre, Esc fecha ou limpa, X seleciona (lista), ? mostra a ajuda. Tudo é ignorado com foco em input. | Jira, Azure e Linear convergem. |
| D11 | **Lista (C):** linha de 36px (checkbox, prioridade, chave, status, título, tags, `3/6`, prazo, avatares), agrupada por status com grupos recolhíveis. Seleção por clique no checkbox, Shift/Ctrl+clique e X. Barra de massa com Status, Responsável, Prioridade, Mês e Excluir (N `PATCH` em paralelo). Rotinas virtuais ficam fora da seleção. | Edição em massa é natural em lista. |
| D12 | **Agrupar por pessoa (B):** linhas recolhíveis por responsável (primeiro responsável; os outros aparecem como avatar "+"), com "Sem responsável" no topo e contagem por status. Na v1, **arrastar entre linhas fica desligado** (só muda o status). | A reatribuição com vários responsáveis pede decisão de produto. |
| D13 | **"Backlog" vira "Histórico"**, porque é isso que a aba é (log de status). | Nome honesto. |
| D14 | **Shell fora desta spec.** Topbar de 48px, widgets no menu do avatar e mascote fora das rotas de tarefa ficam para uma spec separada com o ok do dono. A chama da sequência fica, porque ele adora. | Escopo e gosto. |
| D15 | **Sem migration.** Tudo desta spec é front, mais no máximo endpoints aditivos. | O `.env` da API aponta para produção. |

## Princípios visuais (resumo operacional)

- **Tipografia:** Geist com três pesos só (400, 500 e 600). Título do card 14/20 500; meta 12/16; cabeçalho de coluna 13/600 `--text-2`; título da página 20/600. `tabular-nums` em chave, contagem, data e `3/6`. Sentence case e **zero eyebrow**.
- **Grid 4px:**
  - card com padding 8px 10px, gap 6px entre cards e linhas internas de 4 a 6px;
  - lista com linhas de 36px;
  - board começando a cerca de 110px do topo da área de conteúdo.
- **Raios:** 4px (tag, badge, checkbox), 6px (botão, input, card), 8px (coluna, menu, popover), 10px (diálogo, painel), 999px só em avatar.
- **Superfície:**
  - dark: card com borda 1px `--border`, sem sombra;
  - light: card branco com a sombra raised do ADS, sem borda;
  - coluna em `--surface-sunken`;
  - uma elevação só, a de overlay (painel, menu, card arrastado).
- **Estados:**
  - hover sobe um degrau de fundo;
  - foco com outline de 2px accent por dentro;
  - seleção com fundo accent de 8 a 10% e borda accent;
  - lugar de soltar com borda tracejada `--border-strong`.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | **Arraste com filtro ligado grava a posição errada.** O KanbanBoard emite o índice da lista filtrada, e o TasksView aplica esse índice na lista completa (`TasksView.vue:761-794`). Os filtros rápidos expõem isso. | Corrigir na Fatia 0 pela âncora do vizinho: inserir depois do card visível anterior, no índice absoluto. |
| Alto | Quatro escalas de prioridade gravadas no banco com semânticas opostas. | D3 + script somente leitura de contagem por valor (`workflow-api/scripts/count-priorities.ts`) para o dono rodar. Corrigir dados, se precisar, é UPDATE autorizado à parte. |
| Médio | Realtime (`applyRemoteMove` faz `splice` por índice) e rotinas virtuais (`rec:<regra>:<data>`, sem linha no banco). | Agrupamentos e lista sempre **computados** do mesmo ref; rotinas virtuais sem chave, sem seleção e com o clique atual (gerenciador). |
| Médio | `TaskDetailsView` (2.513 linhas) tem recursos que o painel não tem. | Não refatorar agora. O board do mês passa a abrir o painel, e a página continua acessível. |
| Médio | Nenhum teste cobre KanbanBoard, TasksView, BoardView ou TaskDetailPanel. | Harness de prints `scratchpad/verify/board-shots.mjs` com mocks de tarefas, em dark e light, esparso e cheio, a cada fatia. |
| Baixo | O dono aprovou o anel de progresso em ago/2026. | Continua no Dashboard. No card vira `3/6` (D4), e isso faz parte da direção aprovada. |

## Requisitos Não-Funcionais

- **Acessibilidade 50+:** texto >= 12px; alvos >= 44px nos botões de ação da toolbar e do painel (cards e linhas são alvos grandes por natureza); foco visível; aria em pt-BR; atalhos documentados no "?".
- **Performance:** coluna com 60 cards e lista com 200 linhas sem travar. Sem animação por item na carga.
- **Temas:** claro, escuro e Modo XP legíveis.
- **Copy:** PT-BR, sem em-dash (inclui os toasts e tooltips das tarefas que hoje têm em-dash).

## Acceptance Criteria

- [ ] **Given** o board do mês em 1440x900 com dados cheios **Then** cabem 8 ou mais cards de título curto por coluna, e cada card mostra a chave `XX-XXXXXX`.
- [ ] **Given** a mesma tarefa com `priorityNumber=0` **Then** ela aparece como "Sem prioridade" no board do mês, no `/board`, na lista, no painel e na página de detalhe.
- [ ] **Given** o filtro "Só minhas" ligado **When** um card é arrastado para a 2ª posição de outra coluna **Then** o `PATCH /move` grava a posição correta na lista completa.
- [x] **Given** "Criar" no rodapé de "Em andamento" **When** digito o título e aperto Enter **Then** a tarefa nasce em Em andamento, no fim da coluna.
- [x] **Given** um card **When** clico nele **Then** o painel lateral abre com `?task=`, J/K trocam de tarefa e Esc fecha.
- [x] **Given** a vista Lista **When** seleciono 3 linhas com Shift+clique e escolho Status → Concluído **Then** as 3 vão para Concluído e a barra some.
- [x] **Given** "Agrupar: Pessoa" **Then** aparecem linhas por responsável (e "Sem responsável" quando houver), recolhíveis, com contagem por status.
- [ ] **Given** qualquer tela de tarefas **Then** não há `border-left` colorida, eyebrow em caixa alta, pill tintada de tag, entrada escalonada nem hover que levanta.
- [ ] `npx vue-tsc --build` limpo e eslint limpo nos arquivos tocados.

## Tasks (fatias entregáveis, em ordem)

- [x] **S0 Fundações:** `task-meta.ts` único (status, prioridade D3, ícones); util `taskKey()`; correção do índice de arraste com filtro; tokens `--surface-sunken` e de raio; em-dash fora da copy das tarefas; script `count-priorities.ts` (API, somente leitura, não executar).
- [x] **S1 Card e coluna:** `TaskCard.vue` único para KanbanBoard e BoardView; colunas de 280px; D4 a D7; sem `border-left` no `/board` e na Agenda.
- [x] **S2 Toolbar e filtros:** D8, seletor de mês `‹ ›`, breadcrumb real (`Tarefas / Q3 / Setembro / chave`), "Backlog" vira "Histórico" (D13), pulso arco-íris fora.
- [x] **S3 Painel:** D9 no board do mês.
- [x] **S4 Criação inline e teclado:** D5 ("Criar") e D10.
- [x] **S5 Lista e massa:** D11.
- [x] **S6 Agrupar por pessoa:** D12.

## Follow-ups

- Chave sequencial por empresa (migration + backfill, com a chave de sufixo continuando a resolver como apelido).
- Histórico de todos os campos (tabela nova).
- Spec do shell (D14).
- Convergência da `TaskDetailsView` para o painel em modo página.
- Rota curta `/t/PJ-K7Q2XM` com lookup por sufixo.

## Change Log

- 2026-09-26 v0.1: criação a partir da pesquisa e da escolha do dono no protótipo.
- 2026-09-26 v0.2: S0 e S1 entregues (sem commit; diff para revisão).
  - **S0.** `task-meta.ts` é a fonte única (status, prioridade D3 com `priorityLevel`, ícones SVG do protótipo como componentes funcionais, `dueSignal`); trocados todos os usos antigos (KanbanBoard, TaskForm, TaskDetailsView com os 3 inputs numéricos virando seleção, BoardView, TaskDetailPanel, RecurringTemplateCard, Agenda, ordenação das rotinas e o `WorkspaceView` órfão). `task-key.ts` com exemplos conferidos (o front não tem teste). `board-order.ts` corrige o arraste com filtro. Tokens novos nos dois temas e no Modo XP: `--surface-sunken`, `--shadow-raised`, `--task-status-*`, `--prio-urgent/high`, `--due-late/soon`, `--radius-xs/md`. Em-dash fora dos toasts e textos das tarefas. `workflow-api/scripts/count-priorities.ts` só lê (não executado). A IA da API (`ai.service`, `claude.service`, bug report) já grava 1 a 5 crescente, o que reforça o mapeamento D3.
  - **S1.** `TaskCard.vue` e `TaskColumn.vue` únicos nos dois boards; menu "…" com "Mover para" e Excluir (com a confirmação que já existia; na rotina virtual vira "Dispensar esta data"); "+" da coluna abre a criação com a coluna escolhida; Concluído recolhível e lembrado. Sem `border-left` no `/board` e na Agenda. Mantidos: arraste (e o ignorar prop durante o drag), realtime, rotinas virtuais, somente leitura e renomear por duplo clique, que antes não funcionava (o 1º clique navegava).
  - **Medidas** (harness, 1440x900): card mediano de 121px para 100px com os títulos longos do mock e 80px com títulos curtos; no `/board`, de 181px para 80px. Visíveis por coluna no board do mês: de 4 a 5 para 7/7/6/8 (títulos longos) e 8/7/6/8 (curtos; Em teste só tem 6 cards). O topo do 1º card continua em y = 179px porque o cabeçalho da página é da S2; com o board começando em ~110px (S2) toda coluna passa de 8.
  - **Desvios conscientes:** iniciais do avatar em 10px (duas letras não cabem no disco de 20px em 12px); empresa no `/board` vai no prefixo da chave e no tooltip, não por extenso (por extenso quebrava a meta em quase todo card); poço da coluna na altura toda, para a coluna inteira ser alvo de soltura; "…" da coluna hoje só tem "Criar tarefa aqui" e, em Concluído, "Recolher coluna".
- 2026-09-26 v0.3: S2 e S3 entregues (sem commit; diff para revisão).
  - **S2.** Cabeçalho com `‹ Setembro ›` (os meses do menu lateral, atravessando trimestre, levando o filtro junto), vistas Board | Agenda | Histórico (D13), "Rotinas N" e "Nova tarefa C". As teclas `C` e `/` já funcionam; o resto do teclado é da S4. Saíram o pulso arco-íris, a legenda de pontos e o "N atividades".
    - Toolbar sempre à vista (`TaskBoardToolbar` + `useBoardFilters`): busca por título e chave (`matchesTaskKey`), até 5 rostos mais "+N", "Só minhas", "Atrasadas", "Atualizadas 24h" e "Sem responsável" com contagem, menus Tags (combina por E) e Prioridade (por OU), "Limpar filtros" e "Lembrar filtro".
    - Tudo vai para a URL por `replace` (`q, pessoa, prioridade, tags, minhas, atrasadas, recentes, sem-responsavel`). A memória por empresa grava o formato novo e ainda lê o antigo.
    - Breadcrumb `Tarefas / Q3 / Setembro / PJ-XXXXXX` no `CommandShell`; no detalhe, o mês vira link. O trimestre, que nunca aparecia (o código lia `name` e a API manda `label`), agora vai no breadcrumb.
    - Estado vazio: "Nenhuma tarefa em junho." com "Criar tarefa"; no mês vazio a toolbar sai. `/board` sem o eyebrow "BOARD".
  - **"Agrupar: Nenhum | Pessoa" não entrou, por decisão.** Sem a S6 o controle teria um único estado que funciona, e "Em breve" seria promessa na tela. Entra com a S6, no cabeçalho ao lado das vistas (é opção de exibição, não filtro).
  - **S3.** O clique no card abre o `TaskDetailPanel` sobre o board com `?task=`.
    - Abrir é `push`, então o voltar do navegador fecha. J/K e ↑/↓ trocam por `replace`, na ordem visível (sem coluna recolhida e sem rotina virtual) e sem animação. Esc, X e o scrim fecham, e o foco volta para o card da tarefa aberta. Card de rotina continua abrindo o gerenciador.
    - Restilizado: 640px e sem blur (o `AppDialog` também perdeu o blur). Topo de 48px com a chave em mono, copiar (Clipboard API com plano B), "Abrir em página", "…" (Copiar link, Copiar chave, Excluir tarefa) e fechar. Título 20/600 que quebra linha. Status em lozenge com menu.
    - Grade de Responsáveis, Prioridade, Prazo, Mês, Tags e Rotina em linhas de 32px, com menus reka. Subtarefas em linhas de 32px (check, chave, título, pessoa, prazo). Documentos e arquivos como antes. Atividade com o histórico de status (`GET /backlog/activity/:id`) e os comentários, sem a caixa e sem o eyebrow "Colaboração".
    - Abre com 16px de deslize e fade em 180ms; com reduced-motion, sem animação. Cada patch do painel volta por `@patched` e muda o card na hora.
  - **Achados e correções:**
    1. O `data` do Vue Query é readonly profundo: escrever no card falhava em silêncio, inclusive no renomear otimista da S1. O `TasksView` agora copia cada card ao sincronizar.
    2. O `TaskDescriptionEditor` gravava a descrição sozinho quando o campo passava de só leitura para editável (o `setEditable` do TipTap emite `update`), e o HTML normalizado trocava `<h3>` por `<p>`. Agora não emite, e o painel só se declara leitura depois que o papel carrega.
    3. O lozenge do board do mês grava por `PATCH /move` no fim da coluna. `PATCH /status` não renumera, e o card pulava para a posição antiga no refetch. O `/board`, que mistura empresas, continua no `/status`.
  - **Medidas** (1440x900, harness `s2s3-flows.mjs`):
    - 1º card em y = 180px da janela, ou 124px do topo da área de conteúdo (cabeçalho de 32px em 6, toolbar de 32px em 50).
    - A meta de ~110px não cabe com o alvo de 44px: duas faixas de 44px (cabeçalho e toolbar) mais os 36px do cabeçalho da coluna dão 124px, o mínimo sem sobrepor alvos.
    - Com títulos curtos: 8 / 7 / 6 (de 6) / 8 cards inteiros por coluna, e capacidade de 8 pela mediana (80px). Em "Em andamento" o 8º fica cortado por 20px porque dois cards têm 100px (meta em duas linhas e rotina).
    - Para ganhar altura: a topbar de 48px (shell, D14) dá +8px; aceitar alvos que se tocam no vão dá cerca de 116px.
  - **Desvios conscientes:** rostos da toolbar com 28px de largura (sobrepostos, como no protótipo, mas com 44px de altura de alvo); valores da grade com 32px de altura (a linha inteira é o alvo); iniciais do avatar em 10px (exceção já aceita). Com todos os filtros ligados e contagens de dois dígitos, ou abaixo de 1440px, a toolbar quebra em duas linhas.
  - **Não exercitado:** a linha "Rotina" do painel só aparece com tarefa materializada (modo API), e o ambiente de teste roda no modo local. A `TaskDetailsView` segue com eyebrow e caixa alta (a convergência é follow-up).
- 2026-09-26 v0.4: S5 entregue (sem commit; diff para revisão).
  - **Lista.** Vistas `Board | Lista | Agenda | Histórico`, com a vista na URL (`?vista=lista`, `agenda`, `historico`; o Board não aparece), trocada por `replace` e levada pelo `‹ ›`. A Lista recebe as MESMAS colunas filtradas da toolbar, agrupa por status em grupos recolhíveis (lembrados no navegador), com cabeçalho que gruda no topo, e mostra linhas de 36px (checkbox, prioridade sempre visível, chave, status, título, até 2 tags + "+N", `3/6`, prazo com a cor do `dueSignal` e até 2 avatares + "+N"). O "+" do grupo abre o formulário já no status do grupo.
  - **Seleção** (`useTaskSelection`): checkbox, Ctrl/Cmd+clique, Shift+clique (intervalo na ordem visível, somado à seleção), X e Shift+X, Esc limpa. Teclado da Lista: J/K e ↓/↑ movem o foco (tabindex itinerante: um Tab entra na lista, não 200), Enter/O abre, tudo ignorado com foco em campo, menu ou diálogo. Com o painel aberto sobre a Lista, J/K trocam a tarefa na ordem da LISTA (o `useTaskKeyboard` só faz isso com o Board à frente). Ao fechar o painel, o foco volta para a linha.
  - **Barra de massa** (`TaskBulkBar`): "N selecionadas", Status, Responsável (marcado = todas têm, traço = algumas; o clique tira de todas ou põe nas que faltam, mandando a lista COMPLETA em `responsibleUserIds`), Prioridade, Mês (outros meses do trimestre e os dois vizinhos) e Excluir (com `ConfirmDialog`). Otimismo pelo mesmo `applyPanelPatch` da S3 e rollback por item; toast resume ("3 movidas para Concluído", "2 atualizadas, 1 falhou"); o que falhou continua selecionado. Status, Mês e Excluir soltam a seleção usada (a barra some); Prioridade e Responsável mantêm, para encadear edições. Alvos de 44px e sombra de overlay.
  - **Rotina virtual** aparece com "Rotina" no lugar da chave, sem checkbox e fora de todo intervalo; Ctrl/Shift+clique não faz nada nela; o clique abre o gerenciador, como no board.
  - **Desvios conscientes:**
    1. **Status em massa vai em SÉRIE**, não em paralelo: um `PATCH /move` por vez, no fim da coluna (o caminho do lozenge da S3), na ordem da lista. Na API, o `move` renumera a coluna de origem (`compactColumn`) e a de destino (`reorderColumn`) numa transação Read Committed; dois `/move` em paralelo saindo da mesma coluna travam as mesmas linhas em ordem cruzada, e o Postgres aborta um deles por deadlock. Em série, a ordem no servidor é também a da tela, e nada pula no refetch. Prioridade, Responsável, Mês e Excluir só tocam a própria linha e vão em paralelo (`Promise.allSettled`).
    2. **Barra alinhada à esquerda** (sobre a coluna dos checkboxes), não centrada como no protótipo: o toast do app nasce no canto inferior direito e, centrada em 1440, a barra ficava com "Excluir" e "×" cobertos por ele por 3 s depois de cada ação.
    3. A seleção é podada pelo filtro: o que a busca ou um chip esconde sai da seleção, e a barra nunca age sobre tarefa fora da tela. Grupo recolhido NÃO poda (o contador mostra quantas estão lá).
  - **Medidas** (harness `s5-flows.mjs`, 1440x900): linha de 36px; 1ª linha a 126px do topo da área de conteúdo. Com 200 linhas: a Lista monta em ~350 ms do clique ao DOM, com uma long task de ~200 ms em build de dev e GPU por software. Dela, o código da Lista é ~7 ms; o resto é runtime do Vue, layout, o `formatDate` do Histórico (~50 ms: o TasksView re-renderiza o Histórico escondido a cada troca de vista, com um `toLocaleString` por entrada) e o `dueSignal` (~20 ms: cria um `Intl.DateTimeFormat` por chamada). Shift+clique de 74 linhas em ~170 ms; J em ~28 ms por tecla (com o ida e volta do Playwright). Linhas sem transição nem animação.
  - **Não exercitado:** a API real (o deadlock do `/move` em paralelo é leitura do código da API; o mock não tem transação); o realtime durante a massa (cada `activity:updated` dispara um refetch, e um item ainda em voo pode piscar o valor antigo até o próprio PATCH terminar); Modo XP; celular (em 390px o shell não recolhe a sidebar nesse harness, o que já acontece no Board).
- 2026-09-26 v0.5: S4 e S6 entregues (sem commit; diff para revisão).
  - **S4, criação inline.** "Criar" logo depois do último card de cada coluna (como no Jira; parado, a lista tem a altura dos cards e só cresce até o fim da coluna durante o arraste, para a coluna vazia continuar sendo alvo), e o "+" do cabeçalho e o "Criar tarefa aqui" do "…" abrem o mesmo campo (`TaskQuickCreate`). Enter cria e o campo continua aberto e vazio; Shift+Enter quebra a linha ao escrever (o título é uma linha só no banco, como no painel, e a quebra vira espaço); Esc cancela e devolve o foco a quem abriu; sair do campo vazio fecha, com texto não fecha.
    - **Otimista** (`useQuickCreate`): o card `tmp:*` aparece na hora, esmaecido, sem chave, sem arrastar e sem abrir; se o POST falha, some, o título volta para o campo e um toast diz qual tarefa falhou. Os otimistas moram fora de `tasks` (o refetch substitui aquele ref inteiro) e entram depois dos reais e antes das rotinas virtuais.
    - **Servidor:** `POST /activity` já com `status` (o DTO aceita) e `PATCH /move` para o fim, numa fila (Enter, Enter mantém a ordem digitada). O move é necessário: a tarefa nasce com `position` 0 e, numa coluna já renumerada, ficaria em 2º lugar. O move só sai se houver outro card na coluna.
    - **Responsável:** no board simples, quem criou (como no protótipo: com "Só minhas" ligado a tarefa não some); agrupado, o dono da linha; em "Sem responsável", ninguém. Sem prazo e sem prioridade (prazo de hoje deixaria todo card novo vermelho). Filtro que esconde a tarefa criada gera um aviso.
    - O "Nova tarefa" continua abrindo o formulário completo e perdeu o `C` do botão, porque a tecla agora faz outra coisa. O "+" da Lista (S5) também continua no formulário.
    - **"…" da coluna:** "Criar tarefa aqui", "Ordenar por prioridade" (só na tela: maior primeiro, empate na ordem manual, nada é gravado, some ao recarregar, ícone no cabeçalho enquanto vale; ordenada, a reordenação dentro dela fica desligada e soltar ali só troca a coluna) e "Recolher coluna" em Concluído.
  - **S4, teclado** (`useTaskKeyboard`): C cria inline em "A fazer" (em qualquer vista: da Lista, da Agenda e do Histórico ele volta ao Board; no mês vazio abre o formulário); `/` busca; `?` abre os atalhos (`TaskShortcutsDialog`, AppDialog sem blur; também pelo ícone de teclado do cabeçalho); J/K e ↓/↑ na ordem visível, tirada do DOM (coluna por coluna, de cima para baixo; agrupado, linha por linha), e com o painel aberto trocam a tarefa pelo MESMO caminho (a ordem da S3 saiu do TasksView); ← → vão para o card mais perto na altura da coluna vizinha, pulando coluna vazia; Enter (do próprio card) e O abrem; E renomeia no lugar (o campo do duplo clique; Enter grava, Esc desfaz, o foco volta ao card); Esc tira o foco. O foco é o do DOM, com o contorno de 2px accent por dentro e rolagem até o card. Fora do Board só C, / e ? valem (a Lista tem o teclado dela); com o painel aberto, só J/K e ↑/↓.
  - **S6, agrupar por pessoa.** "Agrupar: Nenhum | Pessoa" no cabeçalho, ao lado das vistas (só no Board), com `agrupar=pessoa` na URL, levado pelo `‹ ›` e guardado no "Lembrar filtro". "Limpar filtros" e desligar a memória não desagrupam: é o jeito de olhar, não um recorte.
    - `TaskLanes` com as linhas de `groupByPerson` (`board-lanes.ts`), sempre computadas das colunas já filtradas do mesmo `tasks` (realtime e `applyRemoteMove` seguem valendo). "Sem responsável" no topo, depois "você", depois ordem alfabética (ordem por carga faria as linhas trocarem de lugar a cada criação).
    - Cabeçalho da linha com 44px: chevron, avatar de 24px (iniciais em 12px), nome com "(você)", contagem por status com os ícones do task-meta e um "+" no hover que cria para aquela pessoa. Cabeçalhos das colunas presos no topo; um scroll só para a matriz. A tarefa fica na linha do 1º responsável e o card esconde só o dono da linha.
    - Recolher por clique; O e U expandem e recolhem todas. Linhas recolhidas valem até sair da tela (não são gravadas).
    - Arraste só dentro da mesma linha (cada linha é um grupo do Sortable): o `move-task` leva a ordem visível da célula e o `resolveDropIndex` da S0 traduz para a posição absoluta pela âncora do vizinho. Entre linhas, a célula de lá não aceita e nada é gravado.
  - **Desvios conscientes:**
    1. **O e U agrupado.** A S4 pede "Enter/O abre" e a S6 "o/u expandem e recolhem"; as duas regras disputam a mesma tecla. Agrupado vale a do Azure (O expande, U recolhe) e o card abre com Enter; no board simples, O abre. A ajuda mostra a regra de cada modo.
    2. **Botões "+" e "…" do cabeçalho da coluna seguem com 28px** (S1): o cabeçalho tem 36px e um alvo de 44px invadiria o card de baixo e a faixa da toolbar. Os controles novos têm 44px: "Criar" (36px + `::after`), "Agrupar", o ícone de atalhos, o cabeçalho e o "+" da linha e o fechar da ajuda.
    3. **Sem "Criar" por célula no agrupado** (seriam 28 botões na tela): cria-se pelo "+" da linha ou pelo C, que abre na linha do card em foco, na sua ou na primeira.
  - **Medidas** (harness `s4s6-flows.mjs`, 1440x900): densidade igual à da S2/S3 (1º card em 124px da área de conteúdo; 6/7/6/8 cards inteiros com títulos longos), porque o "Criar" vem depois do último card. "Criar" a 6px do último card. Duas escritas por criação (POST + move). 92 de 92 checagens no escuro, mais os prints no claro; o harness da S2/S3 passa 86 de 89 (as 3 que mudam são de propósito: a aba "Lista" da S5, o C que agora cria inline e o "Nova tarefa" sem o C) e o da S5 passa 84 de 84.
  - **Não exercitado:** a API real (o mock ordena por `position` e `createdAt` como a API, e é isso que prova a necessidade do move); o eco do realtime de "criada" no meio de uma criação (o card real substitui o que o refetch trouxer, sem duplicar, mas não houve socket no teste); Modo XP; celular (em 390px o shell não recolhe a sidebar, como já acontecia).
- 2026-09-26 v0.6: correções da revisão final de lógica (24 achados; sem commit).
  - **Desfazer de verdade.** `refreshTasks()` refaz `tasks` do cache depois do refetch (`syncFromQuery`), inclusive quando o refetch falha; a Lista usa o mesmo caminho (`refresh`). Antes, com o structural sharing do Vue Query, o refetch igual ao cache não disparava o `watch` e nenhuma escrita recusada (renomear, mover, mês, massa) voltava. `patchOrigin` guarda de onde o card saiu (coluna, posição e, na troca de mês, o próprio card): o rollback volta ao mesmo lugar. O painel recebe `applyPatch` como prop função (o `emit` do painel desmontado pelo J/K era descartado).
  - **Lista.** Card otimista `tmp:*` sem checkbox, sem "Rotina" e fora da seleção e do J/K do painel; `set()` da seleção só aceita o que está na lista; excluir com 404 conta como sucesso.
  - **Teclado.** J/K e setas com visualizador de arquivo, confirmação ou outro diálogo por cima do painel ficam com quem está na frente (board e Lista).
  - **Filtro.** "Lembrar filtro" sobrevive à troca de mês pelo menu lateral; o "+" da linha de quem só tem rotina no mês cria com a pessoa (o `personKey` resolve o nome pelos membros).
  - **Board.** Soltar em coluna "Ordenada por prioridade" vai para o fim da ordem manual; arraste cancelado ressincroniza o que chegou durante o gesto; no `/board`, VIEWER da empresa do card não vê "Mover para" nem arrasta.
  - **Painel e página cheia.** Painel que vira leitura com ele aberto não quebra (o menu de formatação fica montado) e grava o rascunho sujo antes de travar; `/user/me` falhando não vira leitura (vale o papel do token). Página cheia: prioridade 5 abre e salva como 5, e "Aplicar sugestão" com 5 mostra "Urgente".
  - **Desempenho.** Histórico montado só na aba (`v-if`) e com a data formatada uma vez por carga; `dueSignal` com um `Intl.DateTimeFormat` só. Com 3000 entradas: tecla na busca de ~330 ms para ~15 ms; J com o painel de ~400 ms para ~5 ms.
