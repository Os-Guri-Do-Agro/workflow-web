# Épico: workflow-v2

**Status:** In Review
**Autor:** Nicolas (via spec-driven, modo 3)
**Criado em:** 2026-07-29
**Última atualização:** 2026-07-29
**Versão:** 0.1
**Repos:** `work-flow` (frontend) + `workflow-api` (backend NestJS/Prisma, deploy Railway)

---

## Visão Geral

Transformar o work-flow de "ferramenta interna madura" em produto que aguenta um usuário que não é o Nicolas, atacando as duas pontas (front + API) por rodadas fechadas. Cada rodada entrega valor sozinha e pode ser interrompida sem deixar o produto pior.

## Relação com `docs/EVOLUCAO.md`

**Este épico não é um diagnóstico novo.** O diagnóstico existe: [docs/EVOLUCAO.md](../../EVOLUCAO.md), de 2026-07-19, com 1.659 linhas, 10 problemas priorizados, 4 ondas de roadmap e 14 decisões de arquitetura. Ele é bom e continua válido.

O que este épico adiciona, e que o outro documento não podia ter:

1. **Verificação.** O EVOLUCAO.md se declara explicitamente como "achados não confirmados" (a fase adversarial da auditoria foi cortada por limite de sessão). Aqui cada achado que entra numa rodada foi reconferido no código em 2026-07-29, com arquivo e linha, e os que já foram corrigidos saíram.
2. **Recorte por rodada executável.** As ondas do EVOLUCAO.md são grandes (a Onda 1 tem 20 itens, a Onda 2 tem 19). As rodadas aqui têm 4 a 8 itens e um tema único, para caber numa sessão de trabalho.
3. **Eixo de growth explícito** por lacuna, que o outro documento tratava de forma narrativa.

Onde os dois discordarem sobre estado do código, **este vale** (é mais novo e verificado). Onde discordarem sobre estratégia, **o EVOLUCAO.md vale** (a aposta central do wedge não mudou).

---

## Estado verificado em 2026-07-29

O EVOLUCAO.md tem 10 dias e parte da Onda 1 e 2 foi executada nesse intervalo. Reconferência dos itens que importam para as próximas rodadas:

### Já corrigido (sai do roadmap)

| Item EVOLUCAO | Como está hoje | Evidência |
|---|---|---|
| 1.6 decorator `@CompanyId()` | **Existe e é usado** | `workflow-api/src/auth/decorators/company-id.decorator.ts`; consumido em `user.controller.ts:52` |
| 1.7 `GET /user` global | **Escopado** para quem divide empresa | `user.controller.ts` → `userService.findAllVisibleTo(user.sub)` |
| 1.7 `PATCH /user/:id/discord` | **Usa o `sub` do token** | `user.controller.ts` → `updateDiscord(user.sub, id, body)` |
| 2.1 `parentId: null` no `getWorkspace` | **Aplicado**, com comentário citando o board mensal | `dashboard.service.ts:45-50` |
| 2.2 `Number(x) \|\| 1` rebaixando P0 | **Sumiu** de `TaskDetailsView.vue` | grep `\|\| 1` no arquivo volta vazio |
| 2.3 fonte única de prioridade | **Existe** | `src/utils/priority.ts` + `src/features/tasks/task-meta.ts` |
| 2.12 edição inline com estado por campo | **Entregue** | `useActivityDetail.ts` (estado por campo, otimista, rollback, retry) |
| 2.13 card grande como painel sobre o board | **Entregue** | `features/tasks/components/TaskDetailPanel.vue` |
| 2.8 / Problema 7 realtime de atividade ("1 de 15 caminhos") | **Resolvido.** Contrato tipado em `activity-events.ts`; `emitActivityChange` chamado em create (`:89`), update (`:165`), delete (`:454`), upload e delete de anexo (`:477`, `:499`), mais o segundo evento para o board de origem na troca de mês (`:169`). Front consome com dedupe por `updatedAt`, filtro por empresa ativa e refresh na volta do foco | `activity.service.ts` + `useActivityBoardRealtime.ts` |
| 1.19 migração mdi→lucide | **Quase pronta**: 3 arquivos `.vue` restantes (era 19) | grep `mdi-` |
| Zero `v-dialog` | **Confirmado**, `AppDialog` é o padrão | `src/CLAUDE.md` + grep |

### Continua aberto e confirmado

| Item | Estado verificado | Evidência |
|---|---|---|
| **XSS armazenado na descrição** | **Aberto.** Dois `v-html` sem sanitizador, e o arquivo não importa nenhum | `TaskDetailsView.vue:751` e `:1355`; grep `DOMPurify\|renderHtml` no arquivo volta vazio |
| Sanitização no backend | **Não existe.** `src/shared/security/` só tem `password-confirm.service.ts`; zero dependência de sanitização no `package.json` | `activity.service.ts` grava `dto.description` cru |
| Feed no `update` de atividade | **Aberto.** `feed.record` só é chamado em `notifyStatusChange`; editar título, prazo, prioridade ou responsáveis não deixa rastro na timeline | `activity.service.ts:351` é o único `feed.record` do módulo |
| Notificar quem foi atribuído | **Aberto.** `notifyStatusChange` notifica responsáveis só na troca de status. Ser designado a uma tarefa não gera notificação nenhuma | `activity.service.ts:329-355` |
| PostHog | **Só `$pageview`.** Zero evento de produto | `usePostHog.ts:19` é a única chamada de `capture` em todo o `src/` |
| Lazy loading de rotas | **Zero.** `grep -c "import("` no router = 0; chunk único de **3,39 MB** | `dist/assets/index-*.js` |
| `GET /company/all` | **Aberto**, devolve CNPJ de todas as empresas | `company.controller.ts:39` |
| Fallback do `ENCRYPTION_KEY` | **Aberto.** `\|\| '12345678901234567890123456789012'` | `crypto.service.ts:9` (bate com a memória `envs-producao-railway`) |
| CORS aberto, sem `helmet` | **Aberto.** `enableCors({ exposedHeaders })` sem `origin` | `main.ts:186-187` |
| Headers de segurança no Vercel | **Ausentes.** `vercel.json` só tem o rewrite de SPA | `vercel.json` |
| CI | **Não existe** em nenhum dos dois repos | sem `.github/workflows` |
| `useTasks.ts` mock | **Ainda lá**, 180 linhas de dados falsos, importado por 2 views | `features/tasks/useTasks.ts` |
| `Quarter` sem `year` | **Aberto** | `schema.prisma:93-118` |

**Nota de processo:** o `docs/EVOLUCAO.md` não aparece no retrieval do RAG (`npm run spec:query`) porque o indexador cobre `docs/specs/` e `docs/README.md`. Foi encontrado por grep. **Corrigir o indexador é item da R1** (senão a próxima sessão replaneja em cima dele de novo).

---

## Auditoria de produto por eixo de growth

Cada linha é uma lacuna verificada, não uma ideia. Eixos: **AQ** aquisição · **AT** ativação · **RE** retenção · **EX** expansão/receita · **RF** referral.

### Tarefas / Kanban

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| Existe | Kanban por mês com arraste persistido (`position`), painel de detalhe com edição inline por campo, backlog de mudanças de status, filtros client-side, comentários com menção e reação | | |
| **Pela metade** | Descrição é texto plano num `<textarea>`, renderizada com `v-html` sem sanitizar. Quebras de linha somem, critérios de aceitação viram parágrafo grudado | RE | **R1** |
| **Pela metade** | Subtarefas são somente-leitura no painel; sem progresso visível, sem toggle inline | RE | **R1** |
| **Pela metade** | Criar tarefa (`TaskForm.vue`) usa `<textarea>` cru: a descrição nasce sem formatação e ganha formatação só depois | AT | **R1** |
| **Pela metade** | Ser designado a uma tarefa não notifica ninguém, e editar campos da tarefa não deixa rastro no feed da empresa | RE | **R1** |
| **Não existe** | Anexo pelo painel (só na página cheia), sem arrastar-e-soltar | RE | R2 |
| **Não existe** | Dimensão de ano. Janeiro de 2027 cai no mesmo `monthId` de janeiro de 2026 | RE | R4 |
| **Não existe** | Etiquetas, estimativa, dependência entre tarefas, tarefa recorrente | EX | R5 |

### Board agregado (`/board`)

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| Existe | Visão multi-empresa com card abrindo o painel de detalhe | | |
| **Não existe** | Filtro por pessoa, "só as minhas", "atrasadas", com estado na query string (filtro compartilhável por link) | RE, RF | R2 |
| **Não existe** | Avatar de empresa com monograma determinístico. Board multi-empresa hoje não é escaneável | RE | R2 |

### Time tracking

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| Existe | Timer único por usuário garantido por índice parcial, auto-stop por cron, agregação por usuário/atividade/dia, `billableSec` separado, visão de equipe em tempo real (v2, jul/2026) | | |
| **Não existe** | Valor-hora por pessoa e por projeto, fechamento de mês em reais, CSV para o contador | **EX** | R3 |
| **Não existe** | Timer disparado da tarefa. Hoje o vínculo tarefa↔timer é feito escolhendo num select | RE | R2 |

### Notas

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| Existe | Editor TipTap premium com bubble/slash menu, autosave honesto, pastas aninhadas, compartilhamento por pessoa e por link público | | |
| Pela metade | P2 (compartilhamento) tem código pronto e **migration não aplicada em produção** | RE | R2 |
| Pela metade | P3 (edição ao vivo) e P4 (rabisco) em `In Review`, não implementadas | RE | R5 |

### Onboarding / funil

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| Existe | `WelcomeGuide.vue` + `useOnboarding.ts` para quem **já tem** empresa | AT | |
| **Não existe** | Caminho para criar a primeira empresa. Quem se cadastra chega em tela vazia sem saída: o único `CreateCompanyModal` está atrás de rota `requiredRole: 'ADMIN'` | **AQ, AT** | R3 |
| **Não existe** | Convite por e-mail. `@sendgrid/mail` está no `package.json` da API e nunca foi importado | **AQ, RF** | R3 |
| **Não existe** | Recuperação de senha. `auth.controller.ts` só tem `POST /auth/login` | **AQ** | R3 |
| **Não existe** | Dados de exemplo. Empresa nova nasce com 12 meses vazios | **AT** | R3 |

### Analytics

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| Pela metade | PostHog inicializado e capturando `$pageview`. Nenhum evento de produto, nenhum evento de ativação definido | **todos** | **R1** |

### QR

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| Existe | QR dinâmico com redirect editável, métricas, pastas, token de API com hash sha256 e docs Scalar próprias. É o modelo a generalizar | EX | |
| Pela metade | Migrations de pastas e tokens **pendentes em produção** (memória `qr-microservice-roles`) | EX | R2 |

### Bug report (o wedge)

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| Existe | URL pública por empresa sem login, gravação de tela, Gemini extraindo do vídeo, Claude escrevendo a spec, virada em `Activity`, link `/r/<id>` de acompanhamento | **AQ, RF** | |
| **Não existe** | Fechar o loop: `reporterContact` é gravado e nunca usado para responder | **RF** | R3 |
| **Não existe** | Papel `CLIENT` e portal do cliente | **AQ, EX, RF** | R3 |

### Performance de entrada

| Estado | O que é | Eixo | Rodada |
|---|---|---|---|
| **Quebrado** | Chunk único de 3,39 MB de JS, zero rota lazy. Primeira impressão do produto em toda sessão, e o público-alvo declarado inclui 50+ em máquina fraca (spec `didactic-overhaul`) | **AQ, AT** | **R1** |

---

## Auditoria de dependências

Medida por `grep -rl <pacote> src` em 2026-07-29. Frontend: 119 arquivos `.vue`.

### Órfãs (zero uso, remover)

| Pacote | Uso em `src/` | Por que está lá | Ação |
|---|---|---|---|
| `qrcode` | **0** | Substituído por `qr-code-styling` (2 arquivos), que faz o mesmo com estilo | Remover |
| `sortablejs` | **0 direto** | `vue-draggable-plus` já o carrega como dependência própria; o import direto nunca aconteceu | Remover do `package.json` (continua chegando transitivamente) |
| `motion-v` | **0** (só citado no `src/CLAUDE.md`) | Instalado na Fase P do design system "para uso futuro" | **Adotar na R1** (ver duplicadas) |
| `@vueuse/motion` | **Plugin registrado, diretiva nunca usada.** `grep v-motion` volta vazio | Mesma Fase P | Remover na R1 |
| `@fontsource-variable/inter` | 1 (`main.ts`) | Fallback do Geist. Mas o Geist é self-hosted **variável** e já tem fallback de sistema em `tokens.ts:27` | Remover na R2 (mede-se o FOUT antes) |
| `@mdi/font` | 2 | 3 arquivos `.vue` ainda usam `mdi-*`; a fonte pesa 3,6 MB em 4 formatos | Remover ao fechar os 3 (R2) |

`@huggingface/transformers` **não é órfã**: alimenta `scripts/spec-rag/lib/model.mjs` (embeddings locais do RAG de specs). Está corretamente em `devDependencies`.

### Duplicadas (escolher uma)

| Conflito | Medição | Decisão | Motivo |
|---|---|---|---|
| `motion-v` vs `@vueuse/motion` | Ambas com **zero uso real** | **Ficar com `motion-v`, remover `@vueuse/motion`** | `motion-v` é o port Vue oficial do Motion (ex-Framer Motion), com API de componente tree-shakeable e física de mola de verdade. `@vueuse/motion` é uma diretiva que exige plugin global e está em manutenção. A R1 já usa `motion-v` no anel de progresso e no painel, então a escolha vira uso e não aposta |
| `Vuetify 4` vs `reka-ui 2` | Vuetify em **16 de 119** `.vue`, concentrado em `v-list-item` (27), `v-list` (10), `v-card` (9), `v-btn` (7), `v-menu` (6). reka-ui em 3 | **Sair do Vuetify, faseado. R3** | 16 arquivos e uma superfície pequena e repetitiva. Sair remove o maior peso do bundle depois do lazy loading. Não é R1: mexe em navegação e no `vuetifyThemeColors` de `tokens.ts` |
| `marked` vs TipTap | `marked` em 3 arquivos, sempre dentro de `useMarkdownRenderer` | **Manter as duas** | Trabalhos diferentes: `marked` renderiza markdown **da IA** para leitura; TipTap edita HTML **do usuário**. Não há sobreposição |
| `sortablejs` vs `vue-draggable-plus` | 0 vs 1 | Ver órfãs | |

### Faltantes (instalar, com justificativa)

| Pacote | Onde | Problema que resolve | Custo | Alternativa considerada |
|---|---|---|---|---|
| `sanitize-html` | **API** (`workflow-api`) | Descrição rica gravada sem sanitização no servidor. Sanitizar só no front deixa a API como vetor para qualquer outro consumidor (microserviço, API pública da Onda 4, copiloto) | ~60 KB, server-side, não entra no bundle do front | `isomorphic-dompurify` foi rejeitado: arrasta `jsdom` (~2 MB de dependência) para ter a mesma semântica do front. `xss` foi rejeitado: allowlist menos expressiva para o conjunto de tags do TipTap |
| `@tiptap/extension-placeholder` | Front | **Já instalado.** Nada a fazer | | |

**Nada mais entra.** Em particular: nenhuma lib de editor nova (a decisão de ficar no TipTap está fundamentada no [épico de notas](./notas-colaborativas-premium.md#decisão-de-biblioteca-por-que-continuar-no-tiptap)), nenhuma lib de máscara de foco (o `AppDialog` já resolve com Teleport + tokens), nenhuma lib de animação além da que já está paga.

---

## Rodadas

Esforço: **P** até 1 dia · **M** 2 a 5 dias · **G** 1 a 3 semanas.

### R1 — A tarefa como superfície de trabalho *(esta rodada)*

**Tema:** a tarefa é o átomo do produto e hoje é a superfície mais fraca. Atacar de ponta a ponta, front + API.

Spec: [workflow-v2-r1-tarefa-como-superficie.md](../workflow-v2-r1-tarefa-como-superficie.md)

| # | Item | Eixo | Esforço | Contrato de backend |
|---|---|---|---|---|
| R1.1 | Descrição rica **fundida** (superfície única, formatação inline, sem UI de blocos) no painel e no formulário de criação | RE, AT | M | Nenhum (coluna já é `TEXT`) |
| R1.2 | Fechar o XSS armazenado: sanitizar na leitura (front) **e na escrita** (API) | RE | P | `sanitize-html` + `HtmlSanitizerService`, aplicado no create/update de `Activity` |
| R1.3 | Notificar quem foi designado a uma tarefa + gravar feed em toda edição (residual do 2.8; o realtime em si já está pronto) | RE | P | `notifyAssigned` + `feed.record` no `update` |
| R1.4 | PostHog instrumentado com camada tipada + evento de ativação definido | todos | P | Nenhum |
| R1.5 | Progresso de subtarefas: anel com mola + checklist com toggle inline no painel | RE | P | Nenhum (usa `PATCH /activity/:id/status`) |
| R1.6 | Prosa da tarefa tokenizada (`task-content.css`) nos dois temas | RE | P | Nenhum |
| R1.7 | Armadilha de foco no painel + `aria` correto | RE | P | Nenhum |
| R1.8 | Lazy loading de todas as rotas + `manualChunks` | AQ, AT | P | Nenhum |
| R1.9 | Higiene: deletar `useTasks.ts` mock; remover `qrcode`, `sortablejs`, `@vueuse/motion`; indexar `docs/EVOLUCAO.md` no RAG | todos | P | Nenhum |

### R2 — O board para de mentir e a equipe se enxerga

| # | Item | Eixo | Esforço |
|---|---|---|---|
| R2.1 | Filtro por pessoa, "só as minhas", "atrasadas" no `/board`, com estado na query string | RE, RF | M |
| R2.2 | `CompanyAvatar` com monograma determinístico no board multi-empresa | RE | P |
| R2.3 | Anexo pelo painel com arrastar-e-soltar | RE | P |
| R2.4 | Timer disparado direto da tarefa | RE | P |
| R2.5 | `useSession()` + `useCompanySwitch()` únicos, com `queryClient.clear()` e `disconnect()` do socket | RE | M |
| R2.6 | Rooms do socket derivadas da membership no banco, não do claim do JWT | RE, segurança | P |
| R2.7 | Fechar os 3 `mdi-*` restantes e remover `@mdi/font` (3,6 MB) | AQ | P |
| R2.8 | Aplicar em produção as migrations pendentes: notas P2, pastas de QR, tokens de API | RE, EX | P |
| R2.9 | `GET /company/all` removido; `ENCRYPTION_KEY` com fail-fast; CORS por allowlist; `helmet()`; headers no `vercel.json` | segurança | P |
| R2.10 | CI nos dois repos: `typecheck` + `lint` sem `--fix` + `build`, obrigatório em PR | todos | P |

### R3 — O funil existe

| # | Item | Eixo | Esforço |
|---|---|---|---|
| R3.1 | `MailModule` com o SendGrid que já está pago e nunca foi importado | AQ, RF | M |
| R3.2 | `/welcome`: criar a primeira empresa, CNPJ opcional, seed de exemplo removível | AQ, AT | G |
| R3.3 | Model `Invitation` + `POST /company/:id/invite` + tela de aceite | AQ, RF | M |
| R3.4 | Recuperação de senha com token expirável | AQ | P |
| R3.5 | Papel `CLIENT` + portal do cliente (`/portal`) com login por link mágico | AQ, EX, RF | G |
| R3.6 | Fechar o loop do bug report pelo `reporterContact` | RF | P |
| R3.7 | Faturamento por horas: valor-hora, fechamento de mês, CSV | **EX** | M |
| R3.8 | Saída do Vuetify (16 arquivos) | AQ | M |

### R4 — O produto para de se degradar com o tempo

`Activity.companyId` denormalizado com backfill (**antes** do ano, para as queries pararem de depender do join), depois `Quarter.year` com seeding lazy, `?year=` nos endpoints, seletor de ano na navegação. Mais soft delete e lixeira. Esforço **G**, com migration e plano de rollback próprio.

### R5 — Diferenciação

Notas P3 (edição ao vivo) e P4 (rabisco), copiloto que executa ações com confirmação, roadmap público que vende, WhatsApp como entrada de bug report, etiquetas e estimativa na tarefa, API pública v1 generalizando o padrão do QR.

---

## Decisões que valem para todas as rodadas

- **D1. Nada de big bang.** Cada item de rodada é entregável sozinho. Se a rodada parar no meio, o que foi feito continua valendo.
- **D2. Sanitizar nas duas pontas.** Front sanitiza na leitura (defesa contra dado histórico sujo), API sanitiza na escrita (defesa contra qualquer outro consumidor). Nenhuma das duas substitui a outra.
- **D3. Retrocompatibilidade de conteúdo no front.** Formato de campo que muda (texto plano → HTML) é resolvido na leitura, com detecção, não com migration de dados. Migration de conteúdo só quando houver ambiente de desenvolvimento separado (EVOLUCAO 1.1, ainda aberto).
- **D4. Zero `v-dialog`.** `AppDialog` é a casca de overlay. Proibido reintroduzir.
- **D5. Zero hex em componente.** Só tokens de `plugins/tokens.ts`. Cor nova entra no token primeiro.
- **D6. Sem em-dash em copy visível.**
- **D7. Sem neon.** Nenhum glow saturado, nenhum `box-shadow` colorido de alta intensidade, nenhum gradiente ácido. Profundidade vem de superfície, borda e sombra neutra; ênfase vem de peso tipográfico e do `--accent` em área pequena.
- **D8. Gate por rodada:** `npm run type-check` e `npm run lint` limpos, mais o fluxo exercitado de verdade (tela aberta, endpoint chamado), mais screenshot nos dois temas quando há mudança visual.
- **D9. Commit e push só com pedido explícito.** Autorização não atravessa rodadas.

---

## Riscos do épico

| Nível | Risco | Mitigação |
|---|---|---|
| **Alto** | Desenvolvimento continua acontecendo dentro da produção (EVOLUCAO 1.1, aberto). Qualquer rodada que toque o banco arrisca dado de cliente | Nenhuma rodada até a R3 aplica migration destrutiva. A R1 não tem migration nenhuma. R2.8 aplica migrations **aditivas** já escritas e revisadas. A R4, que tem backfill, **fica bloqueada** até existir Supabase de desenvolvimento |
| **Alto** | Sanitização no backend rejeita HTML legítimo do TipTap e o usuário perde formatação ao salvar | A allowlist é derivada da lista de extensões de `useTaskDescriptionEditor`, não escrita à mão. Teste de ida-e-volta por tag em cada uma das extensões habilitadas (AC da R1) |
| **Médio** | Sem CI (R2.10), toda rodada depende de disciplina manual no gate | Gate declarado em D8 e verificado item por item no relatório de fechamento de cada rodada, até a R2.10 existir |
| **Médio** | O `docs/EVOLUCAO.md` fora do RAG faz a próxima sessão redescobrir tudo | R1.9 indexa `docs/**/*.md`, não só `docs/specs/` |
| **Médio** | Lazy loading de rotas quebra o `AppShell` (que escolhe a variante de shell) ou o guard de rota | R1.8 exercita as 3 variantes de shell mais um deep link direto por URL antes de fechar |

---

## Perguntas em Aberto

- [ ] **Escala de prioridade** (EVOLUCAO decisão 5): `P0` é crítico ou é a menor? Hoje `priorityNumber: 0` é o default do DTO, o que sugere "menor", mas a UI mostra P0 primeiro na lista de chips. Não bloqueia a R1. Bloqueia a R2 se entrar filtro por prioridade. Responsável: Nicolas.
- [ ] **Vuetify sai na R3 ou fica?** A auditoria recomenda sair. Não bloqueia R1 nem R2.
- [ ] **Ambiente de desenvolvimento separado:** quando? Bloqueia a R4 inteira. Responsável: Nicolas.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-29 | 0.1 | Criação. Reverificação do EVOLUCAO.md, auditoria de growth por eixo, auditoria de dependências, recorte em 5 rodadas | Nicolas (via spec-driven) |
