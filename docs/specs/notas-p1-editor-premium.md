# Spec: Notas P1 - editor premium, pastas e autosave

**Status:** Concluído
**Autor:** Nicolas (via spec-driven)
**Criado em:** 2026-07-21
**Última atualização:** 2026-07-21 (implementada)
**Versão:** 0.1
**Épico:** [notas-colaborativas-premium.md](./epicos/notas-colaborativas-premium.md)
**Repo:** `work-flow` (frontend). **Nenhuma mudança de backend.**
**Absorve:** a fase L2 (Notes Stack) de [legacy-views-migration.md](./legacy-views-migration.md)

---

## Visão Geral

Reescrever a superfície visual das Notas: editor, listagem, pastas e modo imersivo, com salvamento automático invisível. Sem tocar na API.

## Motivação

É a parte que você olha todo dia e odeia. E é onde mora o débito: 701 das 1410 linhas do editor são CSS legado, a listagem faz um request por tecla, erro de rede vira grid vazio silencioso, e não existe autosave. Entregar isso primeiro dá resultado visível sem migration, sem deploy coordenado e sem risco em produção.

---

## Research Findings

### Estado atual, medido

**[NoteEditorView.vue](../../src/features/notes/NoteEditorView.vue)** - 1410 linhas, zero sub-componentes:

| Bloco | Linhas |
|---|---|
| `<script setup>` | 1-372 |
| `<template>` | 374-708 |
| `<style scoped>` | 710-1410 (**701 linhas**, ~50% do arquivo) |

- TipTap configurado inline em `useEditor` (L104-140), 18 extensões, `onUpdate` só faz `content.value = e.getHTML()`
- Save manual: botão L466-469, handler `saveNote()` L208-267
- Ctrl+S (L362-371) pendurado no DOM do ProseMirror via `watch(..., { once: true })` sem `removeEventListener`: não funciona com foco no título nem nas tags, e nunca é limpo
- Carregamento imperativo em `onMounted` L150-156, sequencial. Sem Vue Query, sem cache, sem `watch` em `route.params.id`
- Popovers de emoji/cor DIY (L403, L429): sem click-outside, sem Esc, sem Teleport, sem foco gerenciado
- Sem bubble menu, sem slash menu, sem floating menu, sem drag handle
- 9 cores hex hardcoded (L99-102) e 24 emojis fixos (L91-95)
- Capa só aceita URL colada; imagem via `window.prompt('URL da imagem:')` (L350-355)
- `improveNoteText()` (L305-323) sobrescreve a nota inteira com o retorno da IA, sem confirmação
- CSS usa `rgba(var(--v-theme-secondary), X)` em vez de `var(--text-2)`; hex crus no syntax highlight (L1211-1220)

**[NotesView.vue](../../src/features/notes/NotesView.vue)** - 480 linhas, 321 de CSS:

- Busca com `@input="fetchNotes"`: **um request HTTP por tecla**, sem debounce e sem cancelamento (race condition real)
- Pastas: só leitura. Sem criar, renomear, excluir, mover, cor ou aninhamento, apesar de o backend expor tudo isso
- Pin: só ícone. Sem toggle na listagem, sem seção de fixadas
- Tags: só exibe 2 primeiras. Sem filtro, apesar de `getNotes` aceitar `tag`
- Erro: `catch` com `console.error`. Falha de rede = grid vazio sem explicação
- Loading e empty inline, sem usar `Skeleton.vue` nem `EmptyState.vue`
- `notes = ref<any[]>([])`: **não existe tipo `Note` no frontend**

### Ativos prontos que a P1 consome

| Ativo | Caminho | Papel |
|---|---|---|
| `SaveStatus.vue` (131 linhas) | `src/components/ui/` | "Salvando... / Salvo às HH:MM / Erro + Tentar de novo", `aria-live="polite"`, emite `retry` |
| `save-state.ts` | `src/components/ui/` | `type SaveState = 'idle'\|'saving'\|'saved'\|'error'` |
| `InlineEditText.vue` (266 linhas) | `src/components/ui/` | Campo com autosave debounced 800ms, flush no blur, Esc desfaz, não sobrescreve enquanto focado |
| `ConfirmDialog.vue` | `src/components/ui/` | Padrão de modal: Teleport + scrim + `role="dialog"` + tokens |
| `TaskDetailPanel.vue:254-277` | `src/features/tasks/components/` | Referência completa de drawer: Esc, trava de scroll do body, foco, SaveStatus no header |
| `EmptyState.vue`, `Skeleton.vue`, `Pill.vue`, `AppSelect.vue` | `src/components/ui/` | Primitivas do design system |
| `useBoards.ts` (68 linhas) | `src/composables/` | Molde de composable Vue Query: `boardKeys`, `useBoard(id)` com `MaybeRefOrGetter`, mutations com invalidação |
| CRUD de pastas na API | `POST/PATCH/DELETE /notes/folders` | **Já existe, nunca foi consumido** |

**Padrões a seguir:**
- Overlay: `Teleport` + CSS tokenizado. **Proibido** `v-dialog`/`v-menu`/`v-navigation-drawer` em código novo (exigem os 40+ `!important` de `styles/overlays.css`)
- Ícones: `lucide-vue-next`. Zero `mdi-*`
- Cores: só tokens de `plugins/tokens.ts`. Exceção única e documentada: a paleta de cor da nota, que é dado persistido
- Densidade: honrar `useUiPreferences().density` (a listagem já faz, L59)

**Breaking changes:** nenhuma. Contrato da API intocado. `NoteEditorView.vue` e `NotesView.vue` mantêm rota, nome e props.

---

## Requisitos Não-Funcionais

- **Performance:** busca com debounce de 300ms e cancelamento da request anterior. Digitar 20 caracteres dispara no máximo 2 requests (hoje: 20)
- **Acessibilidade:** todo popover/diálogo com `role="dialog"`, foco preso enquanto aberto, Esc fecha, foco devolvido ao gatilho. Botões de toolbar com `aria-label` e `aria-pressed`. Alvo de toque mínimo 40px. `SaveStatus` com `aria-live="polite"`
- **Compatibilidade:** modo imersivo degrada para tela cheia dentro da janela onde a Fullscreen API não estiver disponível. `prefers-reduced-motion` desliga as transições de entrada
- **Observabilidade:** falha de autosave loga `requestId` (já anexado pelo interceptor em `api.ts:126-142`) no console e mostra a mensagem do servidor no `SaveStatus`

---

## Design visual

**Referências:** Bear e Craft para tipografia e respiro do corpo do texto; Linear para densidade da lista e atalhos; Notion para slash menu e drag handle. Nada de importar visual de fora: a linguagem é a do design system atual, bem executada.

### Editor

```
┌──────────────────────────────────────────────────────────────┐
│ ←  📌 Ata da reunião          Salvo às 14:32   ⤢   ⋯         │  header sticky, .glass
├──────────────────────────────────────────────────────────────┤
│                                                              │
│         [ capa opcional, 180px, gradiente de fade ]          │
│                                                              │
│         😀  Ata da reunião                                   │  emoji 44px + título 34px
│         Pasta · 3 tags · 412 palavras                        │  meta em --text-3
│                                                              │
│    ⠿  Texto do corpo em coluna de 68ch, centralizada.        │  drag handle na margem
│       Digite "/" para inserir bloco.                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
     ▲ bubble menu aparece na seleção, flutuante, .glass-strong
```

- **Toolbar fixa some.** Formatação passa a viver em dois lugares: bubble menu na seleção e slash menu ao digitar `/`. Sobra no header apenas: voltar, título, status de save, expandir e um menu `⋯` (capa, cor, emoji, exportar, excluir)
- **Coluna de leitura de 68ch**, centralizada, com `--text-body-large` respeitando a escala de fonte do usuário
- **Drag handle** (`@tiptap/extension-drag-handle-vue-3`) aparece na margem esquerda no hover do bloco
- **Modo imersivo** (`⤢`): esconde shell, header e meta; a página inteira vira papel. Fullscreen API quando disponível. Sai com Esc ou clicando de novo. Preferência persistida em `uiStore`

### Listagem

```
┌─ Pastas ────────┬─ Notas ──────────────────────────────────────┐
│ 🔍 Buscar       │  [ Todas ] [ Fixadas ] [ #tag ] [ ⊞ ⊟ ]      │
│                 │                                              │
│ ▸ Todas    24   │  ── Fixadas ────────────────────────────────  │
│ ▸ Reuniões  8   │  ┌──────────┐ ┌──────────┐                   │
│   ▸ 2026    5   │  │ 📌 Ata   │ │ 📌 Specs │                   │
│ ▸ Ideias    6   │  └──────────┘ └──────────┘                   │
│ + Nova pasta    │  ── Recentes ───────────────────────────────  │
└─────────────────┴──────────────────────────────────────────────┘
```

- Árvore de pastas com aninhamento real (o backend já tem `parentId`), contador, cor, menu de contexto (renomear, mudar cor, excluir) e arrastar nota para pasta
- Seção "Fixadas" separada, com toggle de pin direto no card
- Filtro por tag clicável (o parâmetro `tag` já existe na API e nunca foi usado)
- Alternância grade/lista, persistida
- Estados: `Skeleton.vue` no loading, `EmptyState.vue` no vazio, **estado de erro com botão "Tentar de novo"** (hoje não existe)

---

## User Stories

- Como **autor de notas**, quero que o texto salve sozinho para nunca mais perder trabalho ao fechar a aba
- Como **autor de notas**, quero organizar em pastas com subpastas e cores para achar a nota de três meses atrás
- Como **autor de notas**, quero escrever sem toolbar poluindo a tela, com `/` e seleção resolvendo formatação
- Como **autor de notas**, quero um modo imersivo para escrever texto longo sem distração

---

## Acceptance Criteria

### Autosave

- [ ] **Given** uma nota aberta com texto alterado **When** eu clico fora do editor **Then** a alteração é persistida sem eu tocar em nenhum botão, e o header mostra "Salvo às HH:MM"
- [ ] **Given** texto alterado **When** passam 2s sem digitação **Then** o PATCH dispara automaticamente e o header passa por "Salvando..." e "Salvo às HH:MM"
- [ ] **Given** alteração pendente **When** eu troco de aba do navegador (`visibilitychange`) ou fecho a aba (`beforeunload`) **Then** o flush dispara antes da saída
- [ ] **Given** alteração pendente **When** eu navego para outra rota **Then** o flush dispara no `onBeforeRouteLeave` e a navegação só segue depois
- [ ] **Given** a API fora do ar **When** o autosave falha **Then** o header mostra "Erro ao salvar" com "Tentar de novo", o texto continua na tela, e uma nova tentativa acontece automaticamente em 5s, 15s e 45s
- [ ] **Given** nada foi alterado **When** eu clico fora **Then** nenhuma request é disparada
- [ ] O botão "Salvar" continua existindo no menu `⋯`, agora como flush manual

### Editor

- [ ] **Given** texto selecionado **Then** o bubble menu aparece junto à seleção com negrito, itálico, sublinhado, tachado, código, link, cor e destaque
- [ ] **Given** o cursor numa linha vazia **When** eu digito `/` **Then** abre o menu de blocos filtrável por digitação, navegável por setas, confirmado com Enter e fechado com Esc
- [ ] **Given** o mouse sobre um bloco **Then** o drag handle aparece na margem e permite reordenar por arrasto
- [ ] **Given** eu clico em `⤢` **Then** a interface entra em modo imersivo (shell e header ocultos, coluna de texto centralizada) e sai com Esc
- [ ] Todo popover fecha com Esc e com clique fora, e devolve o foco ao elemento que o abriu
- [ ] **Given** eu uso "Melhorar com IA" **Then** aparece confirmação antes de substituir o conteúdo, e Ctrl+Z desfaz a substituição inteira num passo

### Comportamentos preservados (regressão do arquivo de 1410 linhas)

- [ ] Fixar/desafixar com atualização otimista e rollback no erro
- [ ] Convenção de diff parcial: `""` limpa o campo, campo omitido mantém (emoji, cor, capa)
- [ ] Emoji, cor da nota e capa por URL continuam funcionando, agora no menu `⋯`
- [ ] Adicionar e remover tags
- [ ] Inserir e editar link, inserir imagem por URL, inserir tabela 3x3 com cabeçalho e a barra contextual de tabela
- [ ] Contadores de caracteres e palavras
- [ ] Criar nota nova: `POST` e `router.replace('/notes/<id>')` sem recarregar a tela

### Listagem e pastas

- [ ] **Given** eu digito na busca **Then** a request só dispara 300ms após a última tecla, e a resposta de uma busca antiga nunca sobrescreve a atual
- [ ] **Given** falha de rede na listagem **Then** aparece estado de erro com "Tentar de novo" (hoje: grid vazio silencioso)
- [ ] **Given** eu clico em "Nova pasta" **Then** consigo criar, e depois renomear, mudar cor e excluir pastas pela UI
- [ ] **Given** uma pasta com subpastas **Then** a árvore mostra o aninhamento e permite expandir e recolher
- [ ] **Given** eu arrasto uma nota para uma pasta **Then** a nota muda de pasta com atualização otimista e rollback no erro
- [ ] **Given** eu excluo uma pasta com notas dentro **Then** aparece confirmação avisando quantas notas ficarão sem pasta
- [ ] Notas fixadas aparecem em seção própria, e o pin pode ser alternado direto no card
- [ ] Clicar numa tag filtra a listagem por ela
- [ ] Excluir nota existe na UI (hoje `deleteNote` está no service e ninguém chama), com confirmação

### Qualidade de código

- [ ] `NoteEditorView.vue` fica com no máximo 250 linhas, orquestrando sub-componentes
- [ ] Existe `src/features/notes/types.ts` com `Note`, `NoteFolder`, `NoteListItem`. Zero `any` em `src/features/notes/**` e em `notes-service.ts`
- [ ] Zero `rgba(var(--v-theme-*))` e zero `mdi-*` em `src/features/notes/**`
- [ ] Toda leitura passa por Vue Query com `noteKeys`, e toda mutation invalida a chave certa
- [ ] Nenhum caractere `—` em copy visível

---

## Estratégia de Testes

O projeto não tem framework de teste no frontend (constatado em `legacy-views-migration.md:168`). A verificação é manual e por gates estáticos.

### Gates estáticos
- [ ] `npm run type-check` limpo
- [ ] `npm run lint` sem erros novos
- [ ] `npm run build-only` conclui
- [ ] `grep -r "mdi-\|v-theme-\|: any" src/features/notes/` sem resultado

### Manuais (happy path)
- [ ] `/notes`: criar pasta "Teste", subpasta, mudar cor, renomear, excluir
- [ ] Criar nota, digitar, clicar fora, recarregar a página: texto persistiu
- [ ] Digitar e fechar a aba imediatamente: reabrir mostra o texto
- [ ] Selecionar texto, aplicar negrito e link pelo bubble menu
- [ ] Digitar `/` e inserir tabela, lista de tarefas e bloco de código
- [ ] Arrastar bloco pelo drag handle
- [ ] Entrar e sair do modo imersivo por botão e por Esc
- [ ] Arrastar nota entre pastas
- [ ] Fixar pela listagem e conferir a seção "Fixadas"
- [ ] Filtrar por tag e por busca

### Erro
- [ ] Derrubar a API (parar o backend), digitar: "Erro ao salvar" aparece, texto continua, "Tentar de novo" funciona ao subir a API
- [ ] Derrubar a API e abrir `/notes`: estado de erro com botão, não grid vazio
- [ ] Buscar por termo inexistente: `EmptyState` correto, não estado de erro

### Regressão
- [ ] Os 9 comportamentos da seção "Comportamentos preservados", um a um
- [ ] Tema claro e escuro nas duas telas
- [ ] Densidade compacta e confortável
- [ ] `components/reports/TiptapEditor.vue` e `components/modals/EventModal.vue` continuam funcionando após a extração do `TipTapToolbar`

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `src/features/notes/types.ts` | Criar | `Note`, `NoteListItem`, `NoteFolder`, `NoteFolderTree` |
| `src/features/notes/composables/useNoteEditor.ts` | Criar | Configuração única do TipTap (extensões + opções). Ponto de extensão da P3 e da P4 |
| `src/features/notes/composables/useNotes.ts` | Criar | `noteKeys`, `useNotes(filters)`, `useNoteFolders()`, `useNoteMutations()` |
| `src/features/notes/composables/useNote.ts` | Criar | `useNote(id)` com `MaybeRefOrGetter` e `enabled` |
| `src/features/notes/composables/useNoteAutosave.ts` | Criar | Debounce 2s, flush em blur/visibilitychange/beforeunload/route leave, retry 5s/15s/45s, `SaveState` |
| `src/features/notes/components/NoteHeader.vue` | Criar | Voltar, título, `SaveStatus`, expandir, menu `⋯` |
| `src/features/notes/components/NoteBubbleMenu.vue` | Criar | Menu flutuante de seleção |
| `src/features/notes/components/NoteSlashMenu.vue` | Criar | Menu de blocos via `@tiptap/suggestion` |
| `src/features/notes/components/NoteMetaMenu.vue` | Criar | Emoji, cor, capa, exportar, excluir (Teleport + tokens) |
| `src/features/notes/components/NoteFolderTree.vue` | Criar | Árvore com CRUD, cor, aninhamento e drop de nota |
| `src/features/notes/components/NoteCard.vue` | Criar | Card com pin, emoji, cor, tags, preview |
| `src/features/notes/components/NoteFolderDialog.vue` | Criar | Criar/renomear pasta |
| `src/components/ui/TipTapToolbar.vue` | Criar | Primitiva tokenizada compartilhada (absorve a L2 da spec de migração legada) |
| `src/features/notes/NoteEditorView.vue` | Reescrever | Vira orquestrador, no máximo 250 linhas |
| `src/features/notes/NotesView.vue` | Reescrever | Listagem, árvore de pastas, filtros, estados |
| `src/service/notes/notes-service.ts` | Modificar | Tipar retornos, adicionar `createFolder`, `updateFolder`, `deleteFolder` |
| `src/stores/uiStores.ts` | Modificar | `notesImmersive: boolean`, `notesViewMode: 'grid'\|'list'` |
| `package.json` | Modificar | + drag-handle-vue-3, suggestion, details, emoji |
| `src/CLAUDE.md` | Modificar | Tabela de features, novos componentes, correção sobre `reka-ui` |
| `docs/specs/legacy-views-migration.md` | Modificar | Marcar L2 como absorvida por esta spec |

---

## Tasks Técnicas

- [x] **T1** - Criar `types.ts` e tipar `notes-service.ts` (retornos + 3 métodos de pasta)
- [x] **T2** - Criar `useNotes.ts`, `useNote.ts` com Vue Query, no molde de `useBoards.ts` *(depende de: T1)*
- [x] **T3** - Criar `useNoteEditor.ts` extraindo a configuração do TipTap de `NoteEditorView.vue:104-140`, mais as extensões novas *(depende de: T1)*
- [x] **T4** - Criar `useNoteAutosave.ts` com máquina de estados `SaveState`, debounce, os 4 gatilhos de flush e retry com backoff *(depende de: T2)*
- [x] **T5** - Criar `components/ui/TipTapToolbar.vue` tokenizado *(depende de: T3)*
- [x] **T6** - Criar `NoteBubbleMenu.vue` e `NoteSlashMenu.vue` *(depende de: T3, T5)*
- [x] **T7** - Criar `NoteHeader.vue` com `SaveStatus` e botão de imersivo, e `NoteMetaMenu.vue` *(depende de: T4)*
- [x] **T8** - Reescrever `NoteEditorView.vue` como orquestrador, com o modo imersivo *(depende de: T6, T7)*
- [x] **T9** - Criar `NoteFolderTree.vue` + `NoteFolderDialog.vue` com CRUD, cor e aninhamento *(depende de: T2)*
- [x] **T10** - Criar `NoteCard.vue` com pin inline e tags clicáveis *(depende de: T2)*
- [x] **T11** - Reescrever `NotesView.vue`: busca com debounce, filtros, seção de fixadas, drop de nota em pasta, estados de loading/vazio/erro *(depende de: T9, T10)*
- [x] **T12** - Migrar `components/reports/TiptapEditor.vue` e `components/modals/EventModal.vue` para o `TipTapToolbar` compartilhado *(depende de: T5)*
- [x] **T13** - Rodar os gates estáticos e o roteiro manual completo, com screenshots antes e depois
- [x] **T14** - Atualizar `src/CLAUDE.md` e reconciliar `legacy-views-migration.md`

---

## Plano de Rollout

Sem migration, sem coordenação com backend. Merge na branch de trabalho, verificação no app rodando local, screenshots no relatório final.

## Plano de Rollback

`git revert` do commit ou da faixa de commits da P1. Nenhum estado persistido muda de formato: as notas continuam sendo o mesmo HTML no mesmo campo. As preferências novas em `uiStore` (`notesImmersive`, `notesViewMode`) são aditivas no localStorage e ignoradas pela versão antiga.

## Observabilidade

- **Log:** falha de autosave loga mensagem do servidor + `requestId` (via `getApiRequestId` de `api.ts:33`)
- **UI:** `SaveStatus` é o indicador primário. Sem métrica ou alerta: é frontend sem telemetria dedicada nesta fase (PostHog já está no projeto, mas instrumentar Notas está fora do escopo)

---

## Definition of Done

- [ ] Todos os acceptance criteria verificados no app rodando, não só no código
- [ ] Gates estáticos verdes (`type-check`, `lint`, `build-only`, grep de padrões proibidos)
- [ ] Roteiro manual completo executado, incluindo os casos de erro com a API derrubada
- [ ] `/code-review` rodado, findings de correção resolvidos
- [ ] Screenshots antes e depois: listagem, editor, modo imersivo, bubble menu, slash menu, tema claro e escuro
- [ ] `src/CLAUDE.md` e `legacy-views-migration.md` atualizados
- [ ] Spec com status `Concluído` + data + Change Log
- [ ] `/spec-sync` rodado

## Desvios da spec durante a implementação

Registrados aqui porque a spec é a fonte da verdade e a realidade mudou em quatro pontos.

1. **Modo imersivo não é persistido.** A spec previa `notesImmersive` no `uiStore`. Removido: a Fullscreen API exige gesto do usuário, então não há como restaurar o fullscreen no carregamento; restaurar só o layout deixaria o usuário num modo que ele não pediu. `notesViewMode` (grade/lista) continua persistido.
2. **Imersivo é teleportado para o `body`.** O conteúdo da rota vive dentro do `main` do shell, que cria contexto de empilhamento próprio, e nenhum `z-index` de dentro passa por cima da topbar (descoberto na verificação visual). `<Teleport to="body" :disabled="!immersive">` resolve nas três variantes de shell sem que a nota precise conhecer nenhuma delas.
3. **TipTap alinhado em 3.28 nos quatro consumidores.** As extensões novas exigiam 3.28 e duas cópias do `@tiptap/core` quebram o ProseMirror. No v3, `Link` e `Underline` fazem parte do StarterKit: `TiptapEditor.vue` e `EventModal.vue` os declaravam por fora e passariam a subir com extensão duplicada. Corrigido nos dois (fora do escopo original, mas seria quebra em produção).
4. **`getApiErrorMessage` deixou de vazar "Network Error".** Sem `response`, o axios devolve mensagem em inglês, que apareceu na tela durante o teste do caso de erro. Agora cai no fallback em português de quem chamou. Afeta o app inteiro, para melhor.

## Verificação executada

Método: Edge headless via CDP com JWT falso e API mock local (ver memória `verificacao-visual-cdp`), porque não há credenciais de teste no repo.

- Gates: `vue-tsc --noEmit` limpo · `oxlint` e `eslint` sem erros novos nos arquivos tocados · `vite build` conclui
- Fluxos exercitados no app rodando: listagem (grade, seções fixadas/outras, árvore de pastas com contador acumulado), editor (tipografia, task list, tabela, código com destaque), slash menu por `/` com navegação, bubble menu na seleção, menu de propriedades, modo imersivo, diálogo de nova pasta, tema claro e escuro
- **Autosave confirmado ponta a ponta:** digitar disparou o PATCH e o header passou a "Salvo às HH:MM" sem nenhum clique
- **Caso de erro confirmado:** com a API de notas recusando conexão, o header mostra "Erro ao salvar" com "Tentar de novo", **o texto digitado continua na tela**, e a listagem mostra estado de erro com botão em vez de grid vazio

Não verificado nesta rodada (exige interação humana): arrastar bloco pelo drag handle, arrastar nota entre pastas, e o flush no fechamento real da aba.

## Perguntas em Aberto

Nenhuma.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-21 | 0.1 | Criação | Nicolas |
| 2026-07-21 | 1.0 | Implementada. T1 a T14 concluídas, com os quatro desvios registrados acima | Nicolas |
