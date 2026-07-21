Prompt: evoluir a feature de Notas (compartilhamento + autosave + redesign)
1. Objetivo
Transformar as Notas de um bloco de texto pessoal e salvo-na-mão em uma feature colaborativa: compartilhável com a equipe, com persistência automática confiável, e com um editor visualmente à altura do resto do design system.

2. Contexto relevante
Stack e arquivos envolvidos

Frontend (c:\TRABALHO\workflow\work-flow, Vue 3.5 + Vuetify 4 + Pinia + Vue Query + Vite 7, TS estrito):

src/features/notes/NoteEditorView.vue - 1410 linhas em um único SFC, é o núcleo do problema de layout
src/features/notes/NotesView.vue - 480 linhas, lista/grid de notas
src/service/notes/notes-service.ts - 61 linhas, wrapper axios de /notes
Design system e tokens: src/CLAUDE.md, src/plugins/tokens.ts, src/components/ui/
Backend (c:\TRABALHO\workflow\workflow-api, NestJS + Prisma + Postgres):

src/note/ (controller, service, dto), src/share/ (padrão de link público por token já existente para board e roadmap), prisma/schema.prisma
Três correções de premissa do pedido cru, que precisam ser assumidas como verdade:

"não tem uma lib nova open source 2026?" / "parece full HTML e CSS puro" - falso no editor, verdadeiro no entorno. O projeto já usa TipTap 3.21 com ~18 extensões (tabelas, task list, code block com lowlight, highlight, text-align, character-count) e já tem yjs + @hocuspocus/provider instalados. O que é HTML/CSS cru é a casca: toolbar, sidebar, cards, header, estados. Não trocar de editor: BlockNote e Novel são React-only e seriam uma regressão. O caminho é (a) adotar os TipTap UI Components oficiais quando couberem, (b) usar reka-ui (já instalado, ainda não usado) para menus/popovers/tooltips headless, (c) quebrar o SFC de 1410 linhas em features/notes/components/.

"a solução deveria ser SSE?" - não. SSE é server→client unidirecional; ele não salva nada. Autosave é: debounce local (2s de inatividade) + flush imediato em blur, visibilitychange, beforeunload e navegação de rota, via PATCH /notes/:id, com estado visível (Salvando... / Salvo às HH:mm / Falha, tentar de novo) e retry. SSE/WebSocket só entra se houver co-edição simultânea real, e nesse caso o certo é @tiptap/extension-collaboration + Yjs sobre um servidor Hocuspocus, não SSE.

"hoje é privada" - confirmado no schema: model Note tem só createdById, sem companyId e sem tabela de permissão. Compartilhar exige migration + regras de autorização no backend, não é ajuste de UI.

Restrições

TypeScript sempre; gate obrigatório npx tsc --noEmit (ou npm run type-check) limpo antes de encerrar.
Zero hex em componentes: só tokens de plugins/tokens.ts. Ícones novos em lucide-vue-next, nunca mdi-*.
Em-dash (—) proibido em qualquer copy visível ao usuário.
Backend em produção no Railway: migration precisa ser reversível e as notas existentes têm que continuar privadas por padrão.
Feature nova de porte: seguir a skill spec-driven em modo retrieval-first (o repo tem scripts/spec-rag/ e docs/specs/INDEX.json), gerando spec em docs/specs/ antes de codar.
3. Plano de execução
Research retrieval-first: consultar o RAG de specs (npm run spec:query) por notas, share, permissões e design system; ler NoteEditorView.vue e NotesView.vue inteiros; ler src/note/* e src/share/* no backend; mapear como ShareLink de board/roadmap funciona hoje para reaproveitar o padrão.
Escrever a spec em docs/specs/notes-collab-e-redesign.md cobrindo modelo de dados, contrato de API, comportamento de autosave, matriz de permissão e escopo visual. Parar aqui para aprovação humana antes de implementar.
Backend, modelo de dados: adicionar ao schema.prisma visibility (PRIVATE | COMPANY) em Note e um modelo NoteShare { noteId, userId, role: VIEW | EDIT }; migration com default PRIVATE para tudo que já existe.
Backend, autorização: centralizar em note.service.ts um canRead / canWrite e aplicá-lo em todos os handlers (GET /notes, GET /notes/:id, PATCH, DELETE, pin). O GET /notes passa a retornar minhas notas + as compartilhadas comigo, com flag de origem.
Backend, endpoints de share: GET/POST/DELETE /notes/:id/shares (listar, convidar por userId, revogar) e opcionalmente POST /notes/:id/share-link reaproveitando o padrão de token público read-only do share.module.
Backend, concorrência: adicionar version (int) ou usar updatedAt como token de optimistic locking no PATCH, retornando 409 quando o cliente está desatualizado. Sem isso, dois autosaves concorrentes se sobrescrevem em silêncio.
Frontend, camada de dados: estender notes-service.ts com os endpoints novos e tipar as respostas (hoje é any); criar composables/useNotes.ts / useNote.ts com Vue Query, update otimista e invalidação.
Frontend, autosave: criar useAutosave.ts (debounce 2s + flush em blur/visibilitychange/beforeunload/onBeforeRouteLeave), com máquina de estados idle | dirty | saving | saved | error, retry com backoff, e tratamento explícito do 409. O botão Salvar continua existindo, mas só como flush manual.
Frontend, indicador de estado: componente de status de salvamento no header do editor, mais bloqueio de saída quando há mudança não persistida.
Frontend, UI de compartilhamento: modal/drawer de "Compartilhar" com busca de membros da empresa, papel (Ver / Editar), lista de quem já tem acesso, revogar, e link público opcional. Badge de "compartilhada" nos cards de NotesView.
Frontend, redesign: quebrar NoteEditorView.vue em features/notes/components/ (NoteToolbar, NoteHeader, NoteSidebar, NoteShareDialog, NoteBubbleMenu, NoteSlashMenu), reconstruir a casca com tokens do design system, TipTap UI Components e primitivas reka-ui, e refazer NotesView com hierarquia visual real (fixadas, pastas, tags, busca), cobrindo empty state, loading (Skeleton.vue), erro, hover/focus/active e dark/light.
Verificação: npm run type-check limpo, npm run lint, subir o app e exercitar o fluxo de ponta a ponta (criar, digitar, desfocar, recarregar, compartilhar, abrir com o outro usuário, revogar), com screenshots antes/depois.
4. Critérios de aceite
 Digitar na nota e clicar fora persiste sem tocar em nenhum botão; recarregar a página mostra o texto salvo.
 Fechar a aba com alteração pendente não perde conteúdo (flush em visibilitychange/beforeunload).
 O estado de salvamento é visível e honesto: Salvando..., Salvo às HH:mm, e mensagem de falha com ação de tentar de novo.
 Caso de erro tratado: com a API fora do ar, o editor mostra falha explícita, mantém o conteúdo em memória e re-tenta; não some com o texto nem finge que salvou.
 Conflito de edição concorrente retorna 409 e a UI oferece um caminho claro em vez de sobrescrever silenciosamente.
 Uma nota compartilhada com papel EDIT aparece na lista do outro usuário e ele consegue editar; com VIEW, o editor abre em modo leitura e o PATCH é rejeitado pelo backend (não só escondido no front).
 Revogar acesso remove a nota da lista do outro usuário e passa a retornar 403 no GET /notes/:id.
 Todas as notas pré-existentes continuam PRIVATE depois da migration; nenhuma nota vaza para a empresa por default.
 Autorização validada no backend em todos os handlers, não apenas na UI.
 npx tsc --noEmit limpo e npm run lint sem erros novos.
 Zero hex hardcoded e zero mdi-* nos componentes novos de Notas; nenhum — na copy visível.
 Teste manual descrito passo a passo no relatório final, com dois usuários da mesma empresa, mais screenshots antes/depois do editor e da lista.
5. Fora do escopo
Co-edição simultânea em tempo real (Yjs/Hocuspocus, cursores de presença). O terreno fica preparado, mas o serviço Hocuspocus não sobe nessa rodada.
Histórico de versões / restaurar versão anterior.
Comentários por trecho de texto e menções dentro da nota.
Editor offline-first com fila de sincronização.
Trocar TipTap por outra biblioteca de editor.
Mexer em outras features (Board, Roadmap, Tarefas, Calendário), mesmo que compartilhem componentes.
Deploy: mudanças de schema não vão para produção sem pedido explícito.
6. Perguntas abertas
Granularidade do compartilhamento: escolher pessoas específicas da empresa (com papel Ver/Editar), ou basta o toggle "visível para toda a empresa"? E o link público read-only por token, entra agora ou fica pra depois?
Co-edição: alguém precisa editar a mesma nota ao mesmo tempo que outra pessoa, ou "abrir e ver a versão mais recente do colega" já resolve? A resposta define se o Hocuspocus entra no roadmap ou some.
Referência visual: o alvo do redesign é Notion, Obsidian, Linear Docs, ou manter a linguagem do design system atual só que bem executada? Sem isso, "tá feio" vira alvo móvel.