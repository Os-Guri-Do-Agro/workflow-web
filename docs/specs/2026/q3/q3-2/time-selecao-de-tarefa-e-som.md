# Spec: Seleção de tarefa do Meu tempo + som de início/parada

**Status:** Concluído
**Autor:** Nicolas (com Claude)
**Criado em:** 2026-08-11
**Última atualização:** 2026-08-11
**Versão:** 1.2

---

## Visão Geral

> Trocar o select de tarefa do Meu tempo por um menu navegável (trimestre → mês → tarefa, com busca, atalhos e concluídas fora do caminho) e dar ao timer um retorno sonoro próprio ao iniciar e ao parar, na mesma linguagem dos sons do modo XP.

## Motivação / Contexto de Negócio

Duas queixas, mesma raiz: apontar tempo tem que ser gostoso, senão ninguém aponta.

1. **"Às vezes não acha a tarefa."** O select lê `workspaceData.activities`, que é o payload do dashboard. Isso significa três buracos concretos: (a) o dashboard traz **só tarefas raiz** (`parentId: null` em `dashboard.service.ts:50`), então **nenhuma subtarefa** pode receber tempo; (b) o dado é carregado uma vez por sessão e nunca revalidado (`useCompanyActivities` só busca quando está vazio), então tarefa criada agora não aparece sem recarregar a página; (c) tarefa concluída ocupa a lista igual às ativas, e a maioria da lista de uma empresa antiga é justamente concluída.
2. **A lista plana não escala.** Dezenas de títulos num combobox sem hierarquia obrigam a lembrar o nome exato. O trabalho já é organizado por trimestre e mês em todo o resto do produto (board, navegação, roadmap); o seletor de tempo é o único lugar que ignora essa estrutura.

E o som: o feedback do modo XP mostrou que retorno sonoro no gesto certo dá vontade de usar. Iniciar e parar o cronômetro são os dois momentos de recompensa do Meu tempo, e hoje são silenciosos.

---

## Research Findings

**Padrões a seguir:**

- **Sons são sintetizados, nunca arquivos.** `src/composables/useXpSounds.ts` gera tudo com Web Audio (osciladores + ruído filtrado), `AudioContext` preguiçoso criado no primeiro gesto, volume baixo. O som do timer nasce no mesmo molde, em composable próprio.
- **Preferência de UI é Pinia persistido** (`ui.*` em `uiStores`), lida por `useUiPreferences`.
- **Dados remotos por Vue Query**, com chave por empresa.
- **Menu com camada própria vai por `Teleport`**: conteúdo de rota não cobre o chrome do shell (ver `src/CLAUDE.md`, seção Boundaries).

**Referências no código:**

- `src/composables/useCompanyActivities.ts` — fonte atual das opções (`optionsFor`), alimentada pelo workspace do dashboard. É o que limita hoje.
- `workflow-api/src/dashboard/dashboard.service.ts:44-54` — `parentId: null` no payload do dashboard, deliberado para o board agregado não duplicar trabalho. Não deve ser mexido: quem precisa de subtarefa é o seletor, não o board.
- `src/components/ui/ActivitySelect.vue` — combobox reka com busca; substituído pelo picker nos 6 pontos de uso (2 no `TimerWidget`, 4 no `TimeTrackingView`: timer parado, timer rodando, entrada manual e edição de entrada).
- `src/components/ui/TagInput.vue` — precedente de combobox ARIA feito à mão com lista teleportada, incluindo as armadilhas documentadas do reka.
- `prisma/schema.prisma` — `Quarter.label` é enum `Q1..Q4`; `Month.name` é texto em inglês ("January") com `number` 1–12; `ActivityStatus` é `TODO | IN_PROGRESS | IN_TESTING | DONE`.
- `src/features/time/composables/useTimePeriod.ts` — já tem os nomes de mês em português para reaproveitar.

**Breaking Changes:** Nenhuma. Rota nova no backend, componente novo no front; `ActivitySelect` continua existindo para quem quiser lista plana.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Médio | **Payload do picker cresce** numa empresa com muitas tarefas (só títulos, mas todas). | Resposta enxuta (id, título, status, pai, dono, vencimento), sem descrição/anexo/tag. Empresa de ~500 tarefas fica em ~60 KB, cacheado por 30s e compartilhado entre os quatro seletores da tela. Se passar disso, o próximo passo é paginar por trimestre (documentado, não implementado). |
| Médio | **Rota nova capturada por `@Get(':id')`** do mesmo controller. | `@Get('picker')` declarado ANTES de `:id` (ordem importa no Nest). Coberto por teste. |
| Baixo | Som irritar quem trabalha com fone o dia inteiro. | Volume baixo (pico 0.06), duração < 450ms, e preferência `ui.timerSounds` em `/settings` para desligar. |
| Baixo | Tarefa selecionada de outra empresa/apagada perde o rótulo. | O picker cai no título vindo do workspace e, se nem lá houver, mostra o estado "Tarefa indisponível" em vez de rótulo vazio. |

## Requisitos Não-Funcionais

- **Segurança:** a rota exige JWT + membership na empresa do `x-company-id` (`CompanyRoleGuard`, já aplicado no controller). Nunca devolve tarefa de empresa da qual o usuário não é membro.
- **Acessibilidade:** navegação completa por teclado (setas, Enter, Esc, Backspace volta um nível), `role="listbox"`/`option` com `aria-selected`, alvos ≥36px, foco visível. O som é reforço, nunca o único sinal.
- **Performance:** uma requisição por empresa a cada 30s no máximo, compartilhada; filtro e navegação são locais (nenhuma ida ao servidor ao trocar de mês ou digitar).

---

## Acceptance Criteria

### Seleção de tarefa

- [x] **Given** uma empresa escolhida **When** o seletor de tarefa abre **Then** aparece busca no topo, "Sem tarefa" sempre acessível, atalhos ("Minhas tarefas" e "Recentes") e a lista de trimestres com a contagem de tarefas abertas de cada um.
- [x] **Given** o menu aberto **When** clico num trimestre **Then** vejo os meses daquele trimestre em português, com contagem; ao clicar num mês vejo as tarefas dele.
- [x] **Given** qualquer nível **When** digito no campo de busca **Then** a lista passa a mostrar tarefas de TODOS os trimestres que casam com o texto (sem acento, sem caixa, todas as palavras), cada uma com o caminho "Q3 · Agosto".
- [x] **Given** a busca sem resultado **Then** aparece um estado vazio explicando, com a ação de mostrar concluídas quando elas estiverem ocultas.
- [x] **Given** o menu aberto **Then** tarefas concluídas NÃO aparecem, e existe um controle "Mostrar concluídas" que as traz de volta (preferência lembrada entre sessões).
- [x] **Given** uma subtarefa **Then** ela aparece na lista com o título do pai acima ("Pai › Subtarefa") e pode ser selecionada.
- [x] **Given** uma tarefa selecionada **Then** o gatilho mostra o título e o caminho, e reabrir o menu já cai no mês dessa tarefa.
- [x] **Given** uma tarefa recém-criada em outra aba **When** abro o menu **Then** ela aparece (os dados são revalidados na abertura).
- [x] **Given** o teclado **Then** ↑/↓ navegam, Enter escolhe, → entra no grupo, ← ou Backspace volta um nível, Esc fecha e devolve o foco ao gatilho.
- [x] **Given** uma tarefa escolhida **Then** ela entra na lista "Recentes" daquela empresa (máximo 5, mais nova primeiro).

### Som

- [x] **Given** o som ligado **When** o timer inicia **Then** toca um arpejo ascendente curto (< 450ms, volume baixo).
- [x] **Given** o som ligado **When** o timer é parado pelo usuário **Then** toca a resolução descendente correspondente.
- [x] **Given** o corte automático por ociosidade **Then** NENHUM som toca (a pessoa não está lá; quem avisa é a notificação).
- [x] **Given** `ui.timerSounds` desligado em `/settings` **Then** nenhum som do timer toca, e o modo XP continua com os sons dele.
- [x] **Given** o navegador sem Web Audio (ou contexto bloqueado) **Then** o timer inicia e para normalmente, sem erro no console.

---

## Estratégia de Testes

### Unitários (backend)

- [x] `pickerTree` monta trimestres → meses → tarefas, incluindo subtarefas com o título do pai.
- [x] `pickerTree` marca `isMine` pelas responsabilidades do usuário.
- [x] `GET /activity/picker` não é capturado pela rota `:id`.

### Manuais (front)

- [x] Navegar Q → mês → tarefa e selecionar; conferir o rótulo e o caminho no gatilho.
- [x] Buscar por parte do nome com acento trocado ("relatorio" achando "Relatório").
- [x] Selecionar subtarefa e conferir que o tempo salva com ela.
- [x] Criar tarefa em outra aba e conferir que aparece ao reabrir o menu.
- [x] Alternar "Mostrar concluídas" e conferir que a escolha sobrevive ao reload.
- [x] Percorrer tudo por teclado.
- [x] Iniciar e parar o timer com som ligado e desligado.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `workflow-api/src/activity/activity.controller.ts` | Modificar | `@Get('picker')` antes de `:id`. |
| `workflow-api/src/activity/activity.service.ts` | Modificar | `pickerTree(companyId, userId)`. |
| `workflow-api/src/activity/activity.service.spec.ts` | Criar/Modificar | Testes do `pickerTree`. |
| `src/service/activities/activity-service.ts` | Modificar | `getPickerTree(companyId)`. |
| `src/composables/useTaskPicker.ts` | Criar | Vue Query + achatamento para busca + contagens + recentes. |
| `src/components/ui/TaskPicker.vue` | Criar | O menu navegável. |
| `src/core/components/shells/shared/TimerWidget.vue` | Modificar | Usa o picker (2 pontos) e toca os sons. |
| `src/features/time/TimeTrackingView.vue` | Modificar | Usa o picker (4 pontos) e toca os sons. |
| `src/composables/useTimerSounds.ts` | Criar | `playStart` / `playStop` sintetizados. |
| `src/stores/uiStores.ts` + `useUiPreferences.ts` | Modificar | `ui.timerSounds`, `ui.pickerShowDone`. |
| `src/features/settings/SettingsView.vue` | Modificar | Toggle do som. |
| `src/CLAUDE.md` | Modificar | Registrar picker e sons. |

---

## Tasks Técnicas

- [x] **T1** — Backend: `pickerTree` + rota `GET /activity/picker` (antes de `:id`) + testes.
- [x] **T2** — Front: `getPickerTree` no service e `useTaskPicker` (query por empresa, achatado para busca, contagens, recentes em `localStorage`) *(depende de: T1)*.
- [x] **T3** — `TaskPicker.vue`: gatilho, navegação Q → mês → tarefa, busca global, atalhos, concluídas, teclado *(depende de: T2)*.
- [x] **T4** — Trocar os 6 usos de `ActivitySelect` no Meu tempo pelo picker *(depende de: T3)*.
- [x] **T5** — `useTimerSounds` + preferência + toggle em `/settings`.
- [x] **T6** — Ligar os sons no início e na parada manual do timer (widget e view), deixando o corte por ociosidade em silêncio *(depende de: T5)*.
- [x] **T7** — Verificação (typecheck, lint, testes, roteiro manual) e documentação.

---

## Considerações de Arquitetura

- **Decisão:** rota dedicada `GET /activity/picker` em vez de reaproveitar o payload do dashboard.
  **Motivo:** o dashboard existe para o board agregado e exclui subtarefas de propósito; incluir subtarefa lá duplicaria trabalho nas métricas e nos cards. O picker precisa do oposto (tudo que pode receber tempo) e de bem menos campos por item.
  **Alternativa rejeitada:** chamar `GET /month/:id/board` por mês (N requisições e payload pesado, com descrição, anexos e tags que o seletor não usa).

- **Decisão:** a árvore inteira vem numa requisição e toda a navegação/busca é local.
  **Motivo:** trocar de mês ou digitar tem que ser instantâneo; é o que faz o menu parecer leve. O payload é só de títulos.

- **Decisão:** concluídas ocultas por padrão, com interruptor lembrado.
  **Motivo:** em empresa madura, a maioria das tarefas está concluída e nunca mais recebe tempo; mostrá-las é o que faz "não achar" a tarefa certa. Esconder sem oferecer o retorno seria pior: apontar tempo em algo que acabou de ser concluído é caso real.

- **Decisão:** som só no gesto do usuário (iniciar / parar manual), nunca no corte automático.
  **Motivo:** som sem gesto é ruído; e no corte por ociosidade, por definição, não tem ninguém na frente do computador.

## Verificação executada

Mesmo harness de CDP das specs anteriores (Edge headless, API interceptada
localmente, nada saiu para produção), com uma árvore de tarefas montada para
cobrir os casos difíceis: trimestre com tudo concluído, subtarefa, tarefa de
outro trimestre e acento no título.

| Passo | Resultado |
|---|---|
| Abrir | Raiz com "Sem tarefa", seção "Minhas tarefas" e trimestres com contagem que já exclui concluídas (Q1 · 1, Q3 · 3) |
| Q3 → Agosto | Caminho "Tudo / Q3 / Agosto", tarefas do mês, subtarefa exibida como "Portal do cliente › Tela de login" |
| Busca sem acento | "relatorio" encontra "Relatório trimestral" com o caminho "Q1 · Março" |
| Concluídas | O interruptor traz "Ajuste de contraste" de volta e a escolha sobrevive ao reload |
| Selecionar subtarefa | Gatilho passa a mostrar título + caminho; `nevo.time.recentTasks` guarda `{"c1":["a5"]}` |
| Iniciar com subtarefa | `POST /time/start` com `activityId: a5` — antes impossível, porque subtarefa não existia na lista |
| Teclado | ↓↓ move, → entra no trimestre, Enter entra no mês; Esc fecha |
| Mês só com concluídas | "Nenhuma tarefa aberta neste mês" + ação "Mostrar 1 concluída", que revela a tarefa |

Backend: 5 testes de `pickerTree` (montagem, subtarefa com pai, `isMine`,
concluídas incluídas, escopo por empresa).

O estado vazio com ação nasceu justamente daqui: o teste de teclado caiu num mês
cujas tarefas estavam todas concluídas e a tela ficou muda, sem oferecer a saída.

**Som:** verificado por código e no `/settings` (a prévia toca o par completo);
a conferência de timbre no fone é sua, não dá para julgar áudio em headless.

---

## Definition of Done

- [x] Acceptance criteria verificados
- [x] Typecheck e lint limpos nos dois repos
- [x] Testes do backend passando (5 do picker; 19 no total com time tracking)
- [x] `/code-review` no diff, findings de correção resolvidos
- [x] Fluxo exercitado (seleção, busca, teclado, som)
- [x] `src/CLAUDE.md` atualizado + Change Log

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-11 | 0.1 | Criação | Nicolas + Claude |
| 2026-08-11 | 1.2 | Som virou GALERIA: seis timbres (nevo, sino, marimba, bolha, retrô, suave) com prévia ao escolher e três níveis de volume, em vez de um único par fixo. Motivo: som é gosto, e um só cansa | Nicolas + Claude |
| 2026-08-11 | 1.1 | Rodada 2 (pedido do Nicolas): heatmap de constância estilo GitHub no rail do Meu tempo e na Equipe (mapa do escopo + faixa por pessoa no ranking), com `byUserDay` novo no `company-report`. Escala por janela desenhada, nota quando o filtro de empresa não se aplica | Nicolas + Claude |
| 2026-08-11 | 1.0 | Implementada e verificada. Ajustes durante a execução: estado vazio com ação "Mostrar N concluídas"; teto de 2h na recuperação e listener global liberado no unmount (achados do code-review) | Nicolas + Claude |
