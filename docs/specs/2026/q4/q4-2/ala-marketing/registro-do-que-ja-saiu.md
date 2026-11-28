# Ala Marketing: registrar o que já saiu e voltar pela origem

- **Status:** Concluído (24/11/2026)
- **Origem:** prints da Leticia (19/11/2026), em produção, no meio do lançamento do que a equipe já tinha feito antes da ala.
- **Épico:** `docs/specs/epicos/ala-marketing.md`
- **Tamanho:** mini (ajuste de uso), escrita para guardar as decisões.

## Problema

1. **Soltar em Publicado** um card em produção dava o toast "Esse passo não existe no fluxo do card". O fluxo só chega em Publicado depois de aprovar e agendar. O que já saiu fora do Nevo, antes da ala existir, não tinha como entrar.
2. **"Mudar status"** na página do card só listava as setas liberadas (num card em produção, só "Ideia"). Parecia que a ala tinha só dois status.
3. **Editar pelo Calendário "jogava para Aprovações".** O card abre em página própria, e a volta, a aba acesa e o breadcrumb sempre diziam Aprovações.

## Decisões

- **D1. Registro, não seta.** O Admin registra o que já saiu fora do Nevo com o `POST /cards/:id/record-done`, que vai direto para o fim da trilha (Publicado, ou Impresso e entregue na peça impressa).
  - O registro não passa por versão nem aprovação, e o `checkMove` não muda. Arrastar continua com a regra de sempre; a frase de recusa aponta para a ação.
  - **Por que só Admin:** é quem aprova. Deixar o Editor pular a aprovação desmontaria a ala.
- **D2. A data é a de verdade.** O post grava `publishedAt` e `publishAt` com a data informada, para o calendário, o feed e a cadência mostrarem o post no dia em que saiu.
  - O padrão é a data de publicação do card, se já passou; senão, agora.
  - Data no futuro é recusada, porque o que ainda vai sair é "Agendar publicação".
  - O link do post é opcional e só aceita http ou https.
  - A peça impressa não tem data de entrega no card: o registro é só a confirmação.
- **D3. Vindo de Agendado**, o registro espera a publicação que está saindo (409) e cancela o que não saiu, sem aviso. É o mesmo "marcado como Publicado à mão" que já existia.
- **D4. Card publicado não recebe versão.** A regra continua: um Admin reabre o card. O diálogo avisa quando o card está sem arte, para a pessoa subir a V1 antes de registrar.
- **D5. "Mudar status" com a trilha inteira.**
  - O menu é o mesmo "Mover para" do board, com cara de campo.
  - Liberados: o que o servidor diz (`me.allowedMoves`).
  - Bloqueados: aparecem com o motivo.
  - O fim da trilha vira "Registrar como já publicado" para o Admin.
  - Reabrir mostra "Reabre o card: a aprovação cai.".
- **D6. Origem do card.** O `router.afterEach` do layout guarda a aba de onde o card foi aberto, com a URL e o estado dela.
  - A volta, a aba acesa e o breadcrumb seguem essa aba.
  - Sem origem (link colado, sino de fora da ala), vale Aprovações.
  - Foi escolhido no lugar de abrir o card num painel lateral no Calendário: a página do card é grande demais para um painel, e a origem resolve o "me jogou para Aprovações" em todas as abas, não só no Calendário.
- **D7. Painel Publicação.** No card registrado à mão (Publicado sem nenhuma publicação), o painel diz "Este post saiu fora do Nevo e foi registrado à mão" no lugar de "A versão atual ainda não foi aprovada".

## Critérios de aceite

- [x] **CA1.** O Admin solta em Publicado um card em produção. Abre "Registrar como já publicado", com a data planejada já preenchida e o aviso de card sem arte, e sem toast de erro. Confirmar grava Publicado com a data e o link.
  - Prova: `marketing-record-done-e2e.cjs` [board].
- [x] **CA2.** No "Mover para" do Admin, Publicado aparece liberado como registro, e o resto bate com o `allowedMoves`. Cancelar não muda nada.
  - Prova: [menu]. O `marketing-board-fit-e2e.cjs` segue verde.
- [x] **CA3.** O Editor não registra. No board, o toast diz "Só Admin registra um post como já publicado"; no menu, o item aparece desabilitado com o motivo. A API responde 403.
  - Prova: [editor], [api] e os testes do serviço.
- [x] **CA4.** "Mudar status" lista os 7 status, e todo bloqueado diz o motivo. Data no futuro é recusada com a frase da tela. A página mostra "Publicado" e "Ver o post". O painel Publicação não fala de aprovação.
  - Prova: [card].
- [x] **CA5.** Card aberto pelo Calendário: a volta, a aba e o breadcrumb dizem Calendário. Voltar abre a mesma vista e o mesmo dia, já com a edição. Card aberto pelo board ou por link colado: Aprovações.
  - Prova: [origem].
- [x] **CA6.** Peça impressa: soltar em "Impresso e entregue" abre "Registrar como já entregue", sem data, e grava.
  - Prova: [grafica].
- [x] **CA7.** No celular (375px), a folha "Mover para" traz o registro e abre o diálogo sem rolagem lateral.
  - Prova: [celular].
- [x] **CA8.** Vindo de Agendado, o registro espera envio saindo, grava com o filtro `NOT_PUBLISHING` e o ouvinte da publicação recebe a mudança.
  - Prova: `marketing-cards.service.spec.ts`.

## Arquivos

- **API**
  - `core/marketing-status.ts`: `finalStatusOf`, `recordDoneLabel`, `checkRecordDone` e a frase do pulo para o fim.
  - `cards/marketing-cards.{controller,dto,service}.ts`: a rota, o `RecordDoneBody`, o `recordDone` e o `me.canRecordDone`.
  - `social/social-publications.service.ts`: a frase do painel.
  - Testes nos três `.spec.ts`.
- **Front**
  - `approvals/approvals-meta.ts`: `canRecordDone`, `wantsRecord`, `MoveTarget.record` e `note`.
  - `approvals/components/MarketingRecordDoneDialog.vue`: novo.
  - `MarketingMoveMenu.vue`: `variant="button"`, `allowed` e `canRecord`.
  - `MarketingMoveSheet.vue` e `MarketingBoardCard.vue`.
  - `MarketingCardFields.vue`: o link "Ver o post".
  - `views/MarketingApprovalsView.vue` e `views/MarketingCardView.vue`.
  - `marketing-nav.ts`: `cardOrigin` e `rememberCardOrigin`.
  - `MarketingLayout.vue` e `service/marketing/marketing-cards.ts`.
- **Harness**
  - `marketing-record-done-e2e.cjs`: novo.
  - `PGPORT` em todo script que fala com o Postgres do harness.

Sem migration: `publishedAt` e `publishedUrl` já existiam.

## Fora do escopo (follow-up)

- **Pré-existente, não é desta mudança:** `marketing-selects-e2e.cjs`, parte 2. No diálogo "Novo card", o Esc com a lista do Tipo aberta às vezes deixa o campo em "Selecione…".
  - Também falha com a árvore sem esta mudança (conferido com `git stash` em 24/11).
  - Investigar no `AppSelect` com o reka-ui.
- Criar o card já como "publicado" direto no "Novo card", sem passar pela página. Fica para quando a equipe pedir, porque hoje o registro já sai em dois cliques do board.

## Change log

- **0.1 (24/11/2026):** escrita e concluída na mesma rodada.
