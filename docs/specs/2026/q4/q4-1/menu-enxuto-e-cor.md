# Spec: Menu enxuto (itens escondidos, seções recolhíveis) e mais da cor escolhida

**Status:** Concluído (sem commit)
**Autor:** Claude (Opus 5.5) a pedido do Nicolas
**Criado em:** 2026-10-22
**Versão:** 1.1

> **v1.1 (2026-10-23):** duas mudanças:
> - Notas voltou ao menu ("descobri que tinha gente usando"). Continuam fora Roadmap, Calendário e Bug reports.
> - Nova ordem das seções: Trabalho, Pessoal, Empresa, Ferramentas. Vale no NavList, no rail e na coluna do Focus, nas abas e no dock do Canvas.

> Pedido: *"ninguém usa calendário, notas, bug reports e roadmap, pode esconder esses caras? Empresa: ter a opção de minimizar, Ferramentas também, assim fica mais lean. Tenta colocar alguns detalhes a mais da cor selecionada em configuração, tá muito light o projeto, óbvio que tá legal o layout, só dar mais um tcham."*

## Decisões

| # | Decisão | Motivo |
|---|---|---|
| D1 | **Esconder a entrada, não a tela.** `config/nav-visibility.ts` lista `/roadmap`, `/notes`, `/calendar` e `/bug-reports`, e `isNavHidden` filtra:<br>• o `NavList` (Command, Focus e Canvas);<br>• o rail do Focus e as abas e o dock do Canvas;<br>• o menu iniciar e a área de trabalho do Modo XP;<br>• o Ctrl K.<br>As rotas continuam. | Link antigo, notificação e favorito seguem abrindo. Mesmo tratamento reversível do Canvas: voltar é tirar da lista ou ligar `VITE_SHOW_ALL_NAV=true`. |
| D2 | **Seções recolhíveis pelo próprio nome** (botão com `aria-expanded`). A preferência fica em `localStorage` (`nav.collapsed`). Na primeira vez, **Empresa e Ferramentas nascem recolhidas**. Recolhida, a seção mostra a contagem e continua mostrando o item da tela aberta. A seta das seções abertas só aparece no hover ou no foco. | O menu fica enxuto sem a pessoa perder onde está. A seta sempre à vista era ruído. |
| D3 | **Tons derivados do acento**, definidos em `applyThemeTokens`:<br>• `--accent-ink`: 72% acento + texto, para ícone e texto (AA sobre o `soft`);<br>• `--accent-soft`: 13%, fundo de item ativo;<br>• `--accent-wash`: 6% sobre a superfície, para a moldura.<br>Destaque de conteúdo nunca usa o `--accent` puro. | O Nicolas já rejeitou o acento puro como "neon" (Biblioteca, set/2026). Misturado, ele dá cor sem brilho. |
| D4 | **Onde a cor entra:**<br>• moldura do CommandShell (sidebar e topo em `--accent-wash`);<br>• item ativo do menu (`soft` + `ink`);<br>• contagem da seção recolhida;<br>• vista ativa do board (Board/Lista/Agenda/Histórico e Agrupar);<br>• modo ativo do dashboard (Empresa/Workspace);<br>• seleção de texto.<br>O conteúdo (cards, colunas) continua neutro. | Cor como sinal de "onde estou" e identidade da moldura; o board segue a regra de cor só onde muda decisão. |

## Verificação

Harness `scratchpad/verify/shots-nav.mjs` (Vite + API falsa + Edge), 12 checagens por rodada, em claro com teal, azul, laranja, violeta e neutro, e em escuro com teal e laranja:
- menu sem os quatro itens;
- Empresa e Ferramentas recolhidas por padrão;
- abrir Empresa mostra Drive, Variáveis e Usuários, e a escolha fica guardada;
- em `/drive`, com Empresa recolhida, o Drive continua à vista (e só ele);
- item ativo tingido;
- `/notes` ainda abre por link;
- Ctrl K sem Roadmap.

`vue-tsc`, eslint e oxlint dos arquivos tocados limpos; build ok.

## Fora do escopo / follow-ups

- Os shells Focus e Canvas mantêm o próprio estilo de item ativo (só o `NavList` deles mudou).
- Itens escondidos continuam com tela e API. Apagar de vez fica para quando o time confirmar que não volta.
