# Spec: `.md` na tarefa vira documento OU anexo (o usuário escolhe)

**Status:** implementada
**Criada:** 11/08/2026
**Épico:** [workflow-v2](../../../epicos/workflow-v2.md)
**Revisa:** [tasks-tags-arquivos-markdown.md](./tasks-tags-arquivos-markdown.md) (a regra "markdown tem uma casa só")

---

## Visão Geral

Markdown dentro da tarefa passa a ter **dois destinos legítimos**: documento (conteúdo legível, editável, herdado pelas subtarefas, copiável cru para o agente) e **anexo** (o arquivo, do jeito que veio, na lista de Arquivos). A escolha é do usuário, feita na hora do upload, na tela.

## Motivação

A rodada anterior decidiu que "markdown tem uma casa só, e é o documento". A decisão protegia uma ambiguidade real: subir um `.md` e descobrir pela sorte se ele virou conteúdo legível ou um link opaco de download. O preço, porém, foi alto e apareceu no uso:

1. **"Às vezes eu só vou jogar o arquivo."** Nem todo `.md` é spec para trabalhar dentro do produto. Anexar um markdown recebido de fora, ou um dump que só precisa ficar junto da tarefa, era impossível: o servidor respondia 400.
2. **O formulário de criação descartava arquivo em silêncio.** `TaskForm` pegava o **primeiro** `.md` do lote como documento e jogava fora os demais, sem aviso. Escolher dois `.md` perdia um.
3. **A saída oferecida não existia para todo caso.** A mensagem de erro mandava usar a seção Documentos, mas quem queria o arquivo como arquivo não tinha para onde ir.

A ambiguidade que a regra antiga combatia continua combatida, só que na origem certa: em vez de proibir metade do caso de uso, a tela **pergunta**.

## Decisão

| Onde | Comportamento |
| --- | --- |
| Criação (`TaskForm`) | Cada `.md` escolhido vira uma linha com seletor `Documento \| Anexo`. O primeiro do lote assume Documento **apenas se** o campo de documento ainda estiver vazio. Documento é exclusivo: eleger outro rebaixa o anterior a anexo. |
| Tarefa existente (`TaskAttachments`) | `.md` (arrastado ou escolhido) abre o diálogo de destino **antes** do upload. Os arquivos comuns do mesmo lote sobem imediatamente, sem esperar a decisão. |
| Seção Documentos (`TaskDocs`) | "Subir .md" não pergunta nada: quem entra por ali já escolheu documento. |
| Anexo de subtarefa (`TaskDetailsView`) | O campo se chama "Anexo"; escolher `.md` ali já é declarar arquivo. |
| Servidor | `POST /activity/:id/attachment` **continua recusando `.md` com 400**, a menos que o multipart traga `asFile=true`. |

### Por que a declaração `asFile` em vez de simplesmente liberar `.md`

Liberar sem condição devolveria a ambiguidade para qualquer cliente que não conheça a bifurcação (integração, script, uma tela futura distraída): um `.md` viraria anexo por acidente e a mensagem que ensina o caminho certo desapareceria. Com o campo, a permissão é consequência de uma escolha humana explícita, e o 400 pedagógico continua valendo como padrão.

`asFile` **não afrouxa nada além do markdown**: teto de 10 MB e denylist de executável valem igual.

## Riscos e Mitigações

| Sev. | Risco | Mitigação |
| --- | --- | --- |
| Média | Anexo `.md` vira link opaco, exatamente o que a regra antiga evitava | O `FileViewer` renderiza markdown: baixa o texto da URL de exibição e passa por `renderMarkdown` (marked + DOMPurify). Falha de rede cai no cartão de download, sem tela quebrada |
| Média | XSS pelo conteúdo do `.md` anexado, que agora é renderizado | Mesmo caminho único de render do documento (`renderMarkdown`, com DOMPurify). Nenhum `v-html` novo fora dele |
| Baixa | Perda de trabalho ao trocar o destino de um `.md` que já preencheu o documento | O campo só é limpo se o texto ainda for idêntico ao arquivo lido. Editado à mão, permanece |
| Baixa | Fetch do markdown falhar por CORS em bucket futuro | Já cai no cartão de download; o Drive usa URL assinada e o viewer refaz a leitura quando a URL chega |

## Acceptance Criteria

### Criação

- [x] **Given** o formulário de nova atividade com o documento vazio **When** escolho `spec.md` em Arquivos **Then** ele aparece numa linha marcada como `Documento` e o campo de documento é preenchido com o conteúdo e o título derivado do nome
- [x] **Given** o mesmo formulário **When** escolho dois `.md` de uma vez **Then** o primeiro fica como Documento, o segundo como Anexo, e **nenhum é descartado**
- [x] **Given** um `.md` marcado como Documento **When** clico em `Anexo` **Then** ele passa a contar como arquivo e o campo de documento é limpo (se ainda não foi editado à mão)
- [x] **Given** dois `.md` na lista **When** marco o segundo como Documento **Then** o primeiro cai para Anexo automaticamente (documento é exclusivo)
- [x] **Given** um `.md` como Anexo **When** crio a atividade **Then** ele sobe pelo endpoint de anexo com `asFile=true` e aparece na seção Arquivos

### Tarefa existente

- [x] **Given** a seção Arquivos **When** solto `spec.md` na dropzone **Then** um diálogo pergunta o destino, com as duas opções descritas, e nada subiu ainda
- [x] **Given** o mesmo lote com `spec.md` + `foto.png` **When** solto os dois **Then** a foto sobe na hora e só o markdown espera a escolha
- [x] **Given** o diálogo aberto **When** escolho "Documento da tarefa" **Then** um documento é criado com o conteúdo do arquivo e a lista de documentos recarrega
- [x] **Given** o diálogo aberto **When** escolho "Anexo" **Then** o arquivo sobe com progresso e aparece na lista de arquivos
- [x] **Given** um anexo `.md` na lista **When** abro no visualizador **Then** o markdown é renderizado (títulos, tabela, bloco de código), não um cartão de download

### Servidor

- [x] **Given** `POST /activity/:id/attachment` com `.md` **e sem** `asFile` **Then** 400 com a mensagem que aponta a seção Documentos
- [x] **Given** o mesmo POST **com** `asFile=true` **Then** 201 e o anexo é criado
- [x] **Given** `asFile=true` com arquivo de 12 MB ou com `.exe` **Then** 400 (a declaração não afrouxa as outras regras)

## Estratégia de Testes

- **Unitário (API):** `src/common/upload-rules.spec.ts` cobre os três ACs do servidor. `npx jest src/common/upload-rules.spec.ts` verde (11 testes).
- **Visual (front):** Edge headless + CDP com API mockada (ver memória `verificacao-visual-cdp`), exercitando o seletor de destino no `TaskForm` (três transições de estado conferidas no DOM), o diálogo de destino no detalhe da tarefa, o upload com `asFile` chegando no mock e o markdown renderizado no `FileViewer` (h1, tabela e `<pre>` presentes).
- **Gate:** `npx vue-tsc --noEmit` e `npx tsc --noEmit` limpos nos dois repositórios; ESLint limpo nos componentes tocados.

## Arquivos Impactados

### Backend (`workflow-api`)

| Arquivo | Ação | O quê |
| --- | --- | --- |
| `src/common/upload-rules.ts` | Modificar | `AttachmentOptions { asFile }`; `assertAttachmentAllowed(file, options)` libera markdown só com a declaração |
| `src/common/upload-rules.spec.ts` | Modificar | Casos de `asFile` (aceita, recusa sem declaração, não afrouxa tamanho/executável) |
| `src/activity/activity.controller.ts` | Modificar | `@Body('asFile')` no multipart + documentação Swagger do campo |
| `src/activity/activity.service.ts` | Modificar | Repassa as opções para a validação |

### Frontend (`work-flow`)

| Arquivo | Ação | O quê |
| --- | --- | --- |
| `src/utils/file-kind.ts` | Modificar | `isMarkdownFilename()` (extensão, porque o `File.type` de `.md` varia por sistema); markdown entra em `isPreviewable` |
| `src/service/activities/activity-service.ts` | Modificar | `postActivityAttachment(..., { asFile })` acrescenta o campo ao FormData |
| `src/components/tasks/TaskForm.vue` | Modificar | Lista de `.md` com seletor de destino, exclusividade do documento, fim do descarte silencioso |
| `src/features/tasks/TasksView.vue` | Modificar | Upload da criação declara `asFile` para markdown |
| `src/features/tasks/components/TaskAttachments.vue` | Modificar | Diálogo de destino; criação de documento a partir do arquivo; upload com `asFile` |
| `src/components/ui/FileViewer.vue` | Modificar | Leitura de markdown (fetch + `renderMarkdown`), coluna de leitura de 820px |
| `src/features/tasks/TaskDetailsView.vue` | Modificar | `asFile` nos dois uploads de subtarefa; importa `TagIcon` (bug: o ícone era usado no template sem import) |
| `src/features/tasks/components/TaskDocs.vue` | Modificar | Comentário: "Subir .md" é o caminho sem pergunta, não o único caminho |
| `src/CLAUDE.md` | Modificar | A regra nova, com os três lugares onde a pergunta aparece |

## Follow-ups

- `features/tasks/styles/markdown-doc.css` ainda mora na feature, mas hoje é consumido pelo `FileViewer` (primitivo compartilhado). Promover junto, como foi feito com `file-kind.ts`.
- O Drive (spec `drive-p1-nativo`) já trata `.md` como arquivo comum e usa o mesmo viewer: a leitura de markdown vale de graça lá.
