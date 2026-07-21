# Spec: Notas P4 - bloco de rabisco a mão livre

**Status:** In Review
**Autor:** Nicolas (via spec-driven)
**Criado em:** 2026-07-21
**Última atualização:** 2026-07-21
**Versão:** 0.1
**Épico:** [notas-colaborativas-premium.md](./epicos/notas-colaborativas-premium.md)
**Depende de:** [P1](./notas-p1-editor-premium.md). Ganha sincronização de graça se a [P3](./notas-p3-edicao-ao-vivo.md) estiver entregue.
**Repo:** `work-flow`. **Nenhuma mudança de backend.**

---

## Visão Geral

Inserir um quadro de desenho a mão livre no meio da nota, com traço sensível à pressão do Apple Pencil, para quem escreve no iPad rabiscar diagrama, seta e assinatura sem sair do texto.

## Motivação

É o que separa "editor de texto" de "caderno". Quem participa de reunião com iPad hoje desenha em outro app e cola print.

---

## Research Findings

`perfect-freehand` já é dependência e já roda em produção em [`BoardCanvasView.vue`](../../src/features/boards/BoardCanvasView.vue), com pressão real de stylus:

- **SVG, não canvas.** `<svg class="drawing-surface">` (L1841-1849) com `@pointerdown/@pointermove/@pointerup/@pointerleave`. Traço = `<path :d="freehandPath(stroke)">` mais um `<polyline class="hit-stroke">` invisível de área de clique
- `pointFromEvent()` (L423-433) lê `event.pressure` com fallback `0.5` quando ausente ou zero
- `freehandPath()` (L847-871): `getStroke(pontos, { size, thinning: 0.58, smoothing: 0.62, streamline: 0.45, simulatePressure: false, start/end com taper })`. **`simulatePressure: false` significa que confia na pressão real da caneta** - é exatamente o que faz o traço parecer tinta no iPad
- Marcador = largura x3 e opacidade 0.32 (L474-475)

**Limitações do código atual que não devem ser copiadas:**
- `handlePointerMove` faz append imutável (`points: [...prev, point]`) a cada evento: custo quadrático em traço longo, sem throttle nem `requestAnimationFrame`
- Não usa `setPointerCapture`, nem `getCoalescedEvents()` (que é justamente o que entrega os pontos intermediários de alta frequência do Apple Pencil)
- Nenhuma simplificação de traço ao finalizar

**Decisão de biblioteca:** tldraw e Excalidraw estão descartados (React, e a licença do tldraw exige marca d'água visível sem plano pago). `perfect-freehand` é MIT, já está no projeto e é o motor de traço que ambos usam por baixo.

**Breaking changes:** nenhuma. O node novo é aditivo; nota sem desenho não muda.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| **Médio** | **Documento inchado.** Um traço bruto pode ter centenas de pontos; uma página de rabisco vira dezenas de KB de HTML, e a nota trafega inteira em cada PATCH | Simplificação do traço ao soltar o ponteiro (tolerância ~0.7px), coordenadas arredondadas a 1 casa, teto de 4000 pontos por bloco. AC com medição do tamanho |
| **Médio** | **Palma da mão desenhando junto** no iPad | Enquanto houver `pointerType === 'pen'` na sessão do bloco, eventos `touch` são ignorados para desenho (usados só para rolar a página). Alternável em "Só caneta" |
| **Médio** | Traço travando em desenho longo por causa do append quadrático | Acumular pontos em array mutável com render agendado por `requestAnimationFrame`, e usar `getCoalescedEvents()` |
| **Baixo** | Desenho ilegível em tema claro/escuro (cor fixa) | Paleta usa tokens; o traço "padrão" é `currentColor` do texto e inverte com o tema. Cores explícitas ficam como escolhidas |
| **Baixo** | Bloco de desenho inacessível para leitor de tela | `role="img"` com `aria-label` editável ("Descrição do desenho"), que também serve de legenda opcional |

---

## Arquitetura

**Node do TipTap** `drawing`, atomo de bloco, com NodeView Vue (`VueNodeViewRenderer`):

```ts
attrs: {
  paths:  Array<{ d: string; color: string; width: number; opacity: number }>,
  height: number,   // altura do quadro, redimensionável
  label:  string,   // texto alternativo
}
```

Serializa como `<div data-type="drawing" data-paths="[...]" data-height="320">`. Vive dentro do documento, portanto: entra no undo do editor, sobrevive a copiar e colar, acompanha o texto e - com a P3 - sincroniza pelo Yjs sem código adicional.

**Utilitário compartilhado:** extrair de `BoardCanvasView.vue` para `src/utils/freehand.ts` as funções `freehandPath()`, `pointFromEvent()` e os tipos de ponto, passando os dois consumidores a usar a mesma implementação.

**Ferramentas do bloco:** caneta (3 espessuras), marca-texto, borracha por traço, desfazer, limpar, paleta de 6 cores em tokens, alça de redimensionamento vertical.

---

## Acceptance Criteria

- [ ] **Given** o cursor numa linha vazia **When** digito `/desenho` **Then** um bloco de desenho é inserido com altura padrão de 320px
- [ ] **Given** um bloco de desenho num iPad com Apple Pencil **When** desenho variando a pressão **Then** o traço varia de espessura de forma contínua
- [ ] **Given** a mão apoiada na tela enquanto uso a caneta **Then** o apoio não desenha
- [ ] **Given** um traço desenhado **When** clico em desfazer do bloco, e depois Ctrl+Z do editor **Then** ambos removem o traço, e o Ctrl+Z remove o traço inteiro num passo só
- [ ] **Given** a borracha ativa **When** toco num traço **Then** aquele traço inteiro é removido
- [ ] **Given** um desenho pronto **When** salvo, recarrego a página e reabro **Then** o desenho aparece idêntico
- [ ] **Given** um desenho **When** arrasto a alça inferior **Then** a altura do bloco muda e o conteúdo mantém a proporção
- [ ] **Given** uma nota em modo somente leitura (P2) **Then** o desenho é exibido mas não aceita traço novo
- [ ] **Given** a P3 entregue e dois usuários na mesma nota **When** um desenha **Then** o outro vê o traço aparecer sem recarregar
- [ ] **Given** um bloco com 30 traços longos **Then** o atributo serializado fica abaixo de 60 KB (medido) e o desenho continua fluido ao adicionar traço novo
- [ ] O bloco tem `aria-label` editável, e desenhar com mouse funciona (pressão simulada constante)
- [ ] Tema claro e escuro: traço padrão legível nos dois

---

## Estratégia de Testes

### Manuais
- [ ] iPad com Apple Pencil: pressão, apoio da palma, rolagem com o dedo enquanto a caneta está ativa
- [ ] Desktop com mouse: desenhar, apagar, desfazer, redimensionar
- [ ] Recarregar e conferir persistência exata
- [ ] Copiar o bloco e colar em outra nota
- [ ] Medir o tamanho do `content` antes e depois de 30 traços
- [ ] Com a P3: dois navegadores desenhando ao mesmo tempo
- [ ] Nota em modo Ver: desenho não editável

### Regressão
- [ ] `BoardCanvasView.vue` continua desenhando igual após a extração de `freehand.ts` (com `VITE_CANVAS_ENABLED=true`)

---

## Arquivos Impactados

| Arquivo | Ação |
|---|---|
| `src/utils/freehand.ts` | Criar - `freehandPath`, `pointFromEvent`, `simplify`, tipos |
| `src/features/notes/extensions/drawing-node.ts` | Criar - node do TipTap |
| `src/features/notes/components/NoteDrawingBlock.vue` | Criar - NodeView com superfície SVG e ferramentas |
| `src/features/notes/components/NoteDrawingToolbar.vue` | Criar - caneta, marca-texto, borracha, cores, desfazer |
| `src/features/notes/composables/useNoteEditor.ts` | Modificar - registrar o node |
| `src/features/notes/components/NoteSlashMenu.vue` | Modificar - item "Desenho" |
| `src/features/boards/BoardCanvasView.vue` | Modificar - passar a usar `utils/freehand.ts` |

## Tasks Técnicas

- [ ] **T1** - Extrair `src/utils/freehand.ts` de `BoardCanvasView.vue` e apontar o board para ele
- [ ] **T2** - Adicionar `simplify()` (Ramer-Douglas-Peucker) e arredondamento de coordenadas *(depende de: T1)*
- [ ] **T3** - Criar o node `drawing` com atributos e serialização *(depende de: T1)*
- [ ] **T4** - `NoteDrawingBlock.vue`: superfície SVG, `setPointerCapture`, `getCoalescedEvents`, render por rAF, rejeição de palma *(depende de: T3)*
- [ ] **T5** - `NoteDrawingToolbar.vue` com ferramentas e paleta em tokens *(depende de: T4)*
- [ ] **T6** - Redimensionamento vertical e `aria-label` editável *(depende de: T4)*
- [ ] **T7** - Item no slash menu e modo somente leitura *(depende de: T5)*
- [ ] **T8** - Roteiro manual, incluindo iPad real e medição de tamanho *(depende de: T7)*

## Plano de Rollout

Frontend puro. Nota sem bloco de desenho não muda em nada.

## Plano de Rollback

`git revert`. Notas que já tiverem desenho passam a mostrar o `<div data-type="drawing">` como bloco desconhecido: o TipTap descarta nós que não reconhece ao carregar, então o desenho seria perdido no primeiro save posterior ao rollback. **Antes de reverter com desenhos em produção, exportar o `content` das notas afetadas** (`SELECT id, content FROM "Note" WHERE content LIKE '%data-type="drawing"%'`).

## Observabilidade

Nenhuma métrica dedicada. O indicador de problema é o tamanho do `content`, verificável pela consulta acima.

## Definition of Done

- [ ] Acceptance criteria verificados, incluindo teste em iPad real com Apple Pencil
- [ ] `npm run type-check` limpo
- [ ] Board colaborativo continua funcionando após a extração do utilitário
- [ ] `/code-review` rodado
- [ ] Spec `Concluído` + Change Log + `/spec-sync`

## Perguntas em Aberto

- [ ] Há um iPad disponível para o teste de pressão e palma? Sem ele, os AC de stylus ficam verificados só por emulação do DevTools, o que não prova pressão real - responsável: Nicolas

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-21 | 0.1 | Criação | Nicolas |
