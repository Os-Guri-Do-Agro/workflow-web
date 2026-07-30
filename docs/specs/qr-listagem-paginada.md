# Spec: Listagem de QR paginada com busca (tela `/qr` do workflow)

**Status:** Concluído
**Autor:** Claude (p/ Nicolas)
**Criado em:** 2026-07-30
**Última atualização:** 2026-07-30
**Versão:** 1.0

---

## Visão Geral

A tela `/qr` do workflow carrega **todos** os QR codes numa requisição só. Com
441 registros a aba congela. Esta spec pagina essa listagem no servidor,
acrescenta busca por nome e destino, e **reorganiza a tela**: a navegação por
projeto e pasta sai do miolo e vai para uma coluna lateral, onde as pastas ficam
aninhadas dentro do projeto a que pertencem.

## Escopo

**Dentro:** a listagem da tela `/qr` do workflow, o endpoint que só ela usa, e o
layout dessa tela.

**Fora, e é o ponto mais importante desta spec:** a API do microserviço
(`/api/v1/qr`) que os clientes consomem **não é tocada**. Nenhum arquivo dela
entra em "Arquivos Impactados", e o `shape()` compartilhado fica intacto.

## Motivação / Contexto de Negócio

Medido no código de `main` durante a investigação:

| Fato | Medição |
|---|---|
| Nós SVG por card de QR | ~340 |
| 18 QRs (cenário de teste) | 6.086 nós, clique de 250–330ms |
| **441 QRs (produção)** | **~150 mil nós numa montagem só** |
| INP relatado | 1,8s → 7,2s, degradando |

O custo é linear no número de QRs e não há nada entre os registros e o DOM. Cada
QR novo piora a tela.

---

## Research Findings

**Stack:** Backend NestJS 11 + Prisma (Postgres/Supabase). Frontend Vue 3.5 +
TanStack Query.

### A separação que garante que o cliente não é afetado

| Consumidor | Rota | Guard | Service |
|---|---|---|---|
| Workflow (esta tela) | `@Controller('qr')` → `/qr` | `JwtAuthGuard` | `qr.service.list()` |
| Clientes (microserviço) | `@Controller('api/v1/qr')` → `/api/v1/qr` | `ApiTokenGuard` | `qr.service.listForCompanyApi()` |

Rotas, autenticação e método de service diferentes. O **único** ponto
compartilhado é o `private shape()` (`qr.service.ts:169`), que os dois chamam.

**Por isso esta spec não altera `shape()`.** Campo novo, se precisar, entra no
mapeamento de `list()`, depois do `shape()`. É a regra que torna o contrato do
cliente inalterável por construção, não por cuidado.

**Padrões a seguir:**
- **Paginação:** `src/time-tracking/time-tracking.service.ts:212` — `take`/`skip`
  como string com `Math.min(..., 200)` de teto. É o padrão do repo. Difere num
  ponto: lá devolve array cru; aqui a tela precisa de `total` para o paginador,
  então devolve envelope.
- **Busca:** não existe em nenhum endpoint hoje. `contains` + `mode: 'insensitive'`.

**Referências no código:**
- `src/qr/qr.service.ts:~285` (`list`) — `findMany` sem `take`/`skip`. É a origem.
- `src/qr/qr.service.ts:169` (`shape`) — **compartilhado, não mexer**.
- `src/qr/qr.service.ts:472` (`listForCompanyApi`) — do cliente, não mexer.
- `work-flow/src/features/qr/QrCodesView.vue:44-129` — `groups`/`tabs`/`shownGroups`
  derivam da lista inteira. Com paginação, a contagem das abas tem que vir do servidor.
- `work-flow/src/features/qr/QrCodesView.vue:364-426` — barra de pastas. O
  `folder.qrCount` já vem de `GET /qr/folders`, então **as pastas não precisam de
  mudança no servidor**.

**Breaking Changes:**
- `GET /qr` passa a aceitar query params e a devolver envelope **quando algum for
  enviado**. Sem params, devolve o array de hoje.
- `/api/v1/qr`: **nenhuma**.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | Alguma mudança vazar para o contrato do cliente | `shape()` intocado; nenhum arquivo de `qr-api.controller.ts` / `api-token.service.ts` no escopo. AC de regressão compara a resposta de `/api/v1/qr` antes e depois. |
| Alto | Deploy dessincronizado quebrar `/qr` em produção | Envelope só com query param. Front novo + API velha recebe array e trata como página única. API nova + front velho manda sem params e recebe o array de sempre. Coberto por AC. |
| Médio | Contagem das abas por empresa deixa de existir quando só uma página chega | `groupBy` por `companyId` no servidor, devolvido no envelope. Sem isso as abas mentem (hoje mostram 441/422/18/1). |
| Médio | Paginação com filtro de pasta: o `qrCount` da pasta e o `total` da página podem discordar | `total` sempre reflete o filtro ativo (escopo + pasta + busca). O `qrCount` da pasta continua sendo o total da pasta. São números diferentes de propósito, e a UI rotula cada um. |
| Baixo | Busca sem índice em `label`/`targetUrl` | 441 linhas. `contains` resolve com folga. Índice vira follow-up se passar de dezenas de milhares. |

---

## Requisitos Não-Funcionais

- **Segurança:** `GET /qr` continua atrás de `JwtAuthGuard`. Sem mudança de acesso.
- **Performance:** a tela monta com no máximo `limit` cards, independente de
  quantos QRs existam no banco.
- **Compatibilidade:** `GET /qr` sem params responde exatamente como hoje.
  `/api/v1/qr` byte a byte igual.
- **Acessibilidade:** campo de busca com label; botões de paginação com
  `aria-label`; estado de página anunciado ("Página 2 de 19").
- **Observabilidade:** log `[Qr] list page=<n> limit=<n> search=<bool> total=<n>`.

---

## User Stories

- Como **usuário com centenas de QRs**, quero **abrir `/qr` sem a aba travar**
  para **conseguir usar a tela**.
- Como **usuário**, quero **buscar pelo nome ou pelo destino** para **achar um QR
  sem varrer páginas**.
- Como **usuário**, quero **que as abas de empresa e os filtros de pasta
  continuem funcionando** com a lista paginada.

---

## Layout

Hoje a tela é uma coluna centralizada de 1080px (`QrCodesView.vue:508`), o que
deixa duas faixas mortas nas laterais em tela cheia, e empurra a navegação
(abas de empresa + chips de pasta) para dentro do miolo, competindo espaço com os
próprios cards. Com 8 pastas os chips já quebram em duas linhas.

**Passa a ser:** coluna de navegação à esquerda + conteúdo à direita.

```
┌──────────────────────┬────────────────────────────────────────────┐
│  [busca...]          │  QR Codes                      [+ Novo QR] │
│                      │                                            │
│  Todos          441  │  ┌────────┐ ┌────────┐ ┌────────┐          │
│  Pessoais        12  │  │  card  │ │  card  │ │  card  │          │
│                      │  └────────┘ └────────┘ └────────┘          │
│  PetJourney     422  │  ┌────────┐ ┌────────┐ ┌────────┐          │
│    dev-parceiros 31  │  │  card  │ │  card  │ │  card  │          │
│    dev-pets      78  │  └────────┘ └────────┘ └────────┘          │
│    prod-pets    142  │                                            │
│    Sem pasta     N   │           ‹ 1 2 3 … 19 ›                   │
│  FitCertify365   18  │                                            │
│  Marketing        1  │                                            │
└──────────────────────┴────────────────────────────────────────────┘
```

**Por que a pasta vira filha do projeto:** `QrFolder` tem `companyId`, ou seja o
vínculo já existe no dado. Hoje a UI achata isso numa fileira de chips e a pessoa
precisa saber de cabeça que `prod-pets` é da PetJourney. Somando os contadores do
print: as 8 pastas dão 415 dos 422 QRs da PetJourney, então na prática a fileira
de chips inteira pertence a um projeto só.

Regras:
- Selecionar um projeto filtra por ele. Selecionar uma pasta filtra por projeto **e** pasta.
- O projeto selecionado expande suas pastas; os outros ficam recolhidos.
- Criar e excluir pasta continuam existindo, agora dentro do nó do projeto.
- Sem `border-left` como recurso de hierarquia (indentação e peso tipográfico dão a leitura).
- Abaixo de 900px a coluna vira uma gaveta acessível por botão, e o conteúdo ocupa a largura toda.

---

## Acceptance Criteria

### Layout

- [ ] **Given** a tela em 1440px
      **When** ela carrega
      **Then** existe uma coluna de navegação à esquerda **e** o conteúdo usa a
      largura restante, sem a faixa morta de hoje.

- [ ] **Given** a coluna lateral
      **When** eu olho a PetJourney
      **Then** as pastas dela aparecem **aninhadas abaixo dela**, com o contador
      de cada uma, e não como chips soltos no miolo.

- [ ] **Given** o projeto "PetJourney" selecionado e a pasta "prod-pets" clicada
      **When** a lista recarrega
      **Then** mostra só QRs da PetJourney **na** pasta prod-pets, e o paginador
      reflete esse total.

- [ ] **Given** a tela abaixo de 900px de largura
      **When** ela carrega
      **Then** a navegação vira gaveta e o conteúdo ocupa a largura toda, sem
      rolagem horizontal.

### Comportamentais

- [ ] **Given** 441 QRs no banco
      **When** o front abre `/qr`
      **Then** o `GET /qr` responde no máximo `limit` itens (default 24)
      **e** a tela monta sem interação acima de 200ms.

- [ ] **Given** a tela carregada
      **When** eu digito "parceiro" na busca
      **Then** a lista mostra só QRs cujo `label` **ou** `targetUrl` contém
      "parceiro" (sem diferenciar maiúscula) **e** o paginador reflete o total
      filtrado, não o total geral.

- [ ] **Given** a busca preenchida
      **When** eu troco de aba de empresa ou de pasta
      **Then** os filtros se combinam (busca **e** escopo **e** pasta) e a página
      volta para a primeira.

- [ ] **Given** a aba "PetJourney" com 422 QRs
      **When** a listagem está paginada
      **Then** a aba continua mostrando **422**, não a contagem da página.

- [ ] **Given** eu na página 3, ou com busca preenchida
      **When** eu crio um QR
      **Then** a lista volta para a **página 1** e a busca é limpa, e o QR recém
      criado aparece no topo — mesmo resultado visível de hoje.
      *(O backend ordena por `createdAt: desc`; sem isso o QR nasce fora da vista
      e parece que a criação falhou.)*

- [ ] **Given** uma página com um único item
      **When** eu excluo ou cancelo esse item
      **Then** a lista volta uma página em vez de mostrar página vazia
      (exceto na página 1, que mostra o estado vazio normal).

- [ ] **Given** um QR visível por causa do filtro de pasta ativo
      **When** eu movo esse QR para outra pasta
      **Then** ele sai da lista e o `total` e o contador da pasta acompanham,
      sem deixar página vazia pendurada.

- [ ] **Given** a API **antiga** e o front **novo**
      **When** `/qr` carrega
      **Then** renderiza tratando a resposta como página única, sem erro.

- [ ] **Given** a API **nova** e o front **antigo**
      **When** chama `GET /qr` sem params
      **Then** recebe o array completo, como hoje.

- [ ] **Given** um token de API de cliente
      **When** chama `GET /api/v1/qr`
      **Then** a resposta é **idêntica** à de antes desta mudança, campo a campo.

### Observáveis

- [ ] `GET /qr?page=1&limit=24` responde `{ items, total, page, limit, scopes }`.
- [ ] `GET /qr` sem params responde array.
- [ ] `limit` acima de 50 é fixado em 50; `page` menor que 1 vira 1.
- [ ] `scopes` traz `{ key, label, count }` com contagem de `groupBy`, não da página.
- [ ] `private shape()` não foi modificado (verificável no diff).
- [ ] Nenhum arquivo de `/api/v1/qr` no diff.

---

## Estratégia de Testes

### Unitários (backend — Jest já existe, ver `src/qr/*.spec.ts`)
- [ ] `list()` sem params devolve array; com params devolve envelope.
- [ ] `list()` — `limit=999` vira 50; `page=0` vira 1; `page` além do fim devolve lista vazia com `total` correto.
- [ ] `list()` — `search` casa em `label` e em `targetUrl`, sem diferenciar maiúscula; borda: string vazia e só espaços = sem filtro.
- [ ] `list()` — busca combinada com `scope` e `folderId`.
- [ ] `list()` — `scopes` conta o conjunto inteiro, não a página.

### Regressão (o que protege o cliente)
- [ ] `listForCompanyApi()` — snapshot da resposta antes e depois, campo a campo.
- [ ] `GET /api/v1/qr` com token responde igual.
- [ ] Criar, editar, mover para pasta, cancelar e excluir continuam funcionando.
- [ ] `/q/:code` continua redirecionando e contando scan.

### Manuais (happy path)
- [ ] Abrir `/qr` com a massa real (441) e confirmar que a tela responde.
- [ ] Buscar por "parceiro" e achar.
- [ ] Combinar busca + aba PetJourney + pasta `prod-parceiros`.
- [ ] Navegar entre páginas, ir e voltar.
- [ ] Conferir que a aba PetJourney segue mostrando 422.
- [ ] Ir para a página 3, criar um QR, e ver que ele aparece (voltou pra página 1).
- [ ] Com busca preenchida, criar um QR e ver que ele aparece.
- [ ] Excluir o último item de uma página e conferir que recua em vez de ficar vazia.
- [ ] Exportar PNG, JPG e SVG de um QR com logo (deve continuar idêntico a hoje).

### Verificação de performance (fecha o motivo desta spec)
- [ ] Com os 441, medir via `window.__perf.dump()`: nenhuma interação da `/qr`
      acima de 200ms.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `workflow-api/src/qr/dto/list-qr.dto.ts` | Criar | `page`, `limit`, `search`, `scope`, `folderId` |
| `workflow-api/src/qr/qr.service.ts` | Modificar | **só** `list()`: filtros, `take`/`skip`, `total`, `scopes`. `shape()` e `listForCompanyApi()` intocados |
| `workflow-api/src/qr/qr.controller.ts` | Modificar | `@Get()` aceita a DTO; ramo sem params preservado |
| `workflow-api/src/qr/qr-list.spec.ts` | Criar | Unitários + regressão do contrato do cliente |
| `work-flow/src/service/qr/qr-service.ts` | Modificar | `list(params)` + tipos do envelope |
| `work-flow/src/composables/useQrCodes.ts` | Modificar | Query com params, `placeholderData` p/ não piscar, tolerância a array |
| `work-flow/src/features/qr/QrCodesView.vue` | Modificar | Novo layout (2 colunas), busca com debounce, paginador, contagens do servidor |
| `work-flow/src/features/qr/components/QrSidebar.vue` | Criar | Coluna de navegação: busca + árvore projeto → pastas + criar/excluir pasta |
| `work-flow/src/features/qr/components/QrPagination.vue` | Criar | Paginador tokenizado, reutilizável |

---

## Tasks Técnicas

- [x] **T1** — `ListQrDto` com normalização e tetos.
- [x] **T2** — `qr.service.list()`: `where` com escopo/pasta/busca, `take`/`skip`, `total` e `scopes` via `groupBy`. Sem tocar `shape()`. *(depende de: T1)*
- [x] **T3** — Controller: envelope com params, array sem params, log. *(depende de: T2)*
- [x] **T4** — Unitários + teste de regressão do contrato de `/api/v1/qr`. *(depende de: T3)*
- [x] **T5** — Front: service e composable com params, tolerando resposta em array. *(depende de: T3)*
- [x] **T6** — Front: `QrSidebar` (busca + árvore projeto→pastas + CRUD de pasta) e `QrPagination`; `QrCodesView` reorganizada em 2 colunas. *(depende de: T5)*
- [x] **T6b** — Front: continuidade das mutações com paginação — criar volta pra página 1 e limpa a busca; excluir/cancelar/mover o último item da página recua uma página. *(depende de: T6)*
- [x] **T7** — Verificação: typecheck nos 2 repos, fluxo exercitado, medição com a sonda. *(depende de: T4, T6)*

---

## Considerações de Arquitetura

- **Decisão:** paginar no servidor, não no cliente.
  **Motivo:** paginar no cliente ainda baixaria os 441 registros; o custo de rede
  e de parse continua.
  **Alternativa rejeitada:** virtualizar a lista mantendo tudo no cliente.

- **Decisão:** resposta polimórfica (array sem params, envelope com params).
  **Motivo:** permite deployar os dois repos em qualquer ordem sem quebrar
  produção.
  **Alternativa rejeitada:** endpoint novo, que deixaria dois caminhos vivos.
  **Dívida assumida:** com data para sair, ver Follow-up.

- **Decisão:** `shape()` fica intocado, mesmo custando um pouco de duplicação no
  mapeamento de `list()`.
  **Motivo:** é o que garante, por construção e não por atenção, que o contrato
  dos clientes não muda.

- **Decisão:** contagem das pastas continua vindo de `GET /qr/folders`.
  **Motivo:** o `qrCount` já existe e já é o total da pasta. Não precisa entrar
  no envelope.

---

## Plano de Rollout

- [ ] Deploy do **backend primeiro** (sem params, contrato idêntico).
- [ ] Conferir em produção: `GET /qr` sem params ainda responde array, e
      `GET /api/v1/qr` com token de cliente responde igual.
- [ ] Deploy do **front**.
- [ ] Medir a tela com os 441 usando a sonda.

## Plano de Rollback

Sem migration. Reverter commits e redeployar. Os dois repos são independentes:
dá para reverter só o front (a API nova segue servindo o contrato antigo) ou só a
API (o front novo degrada para página única).

---

## Observabilidade

- **Log:** `[Qr] list user=<u> page=<n> limit=<n> search=<bool> total=<n>`.

---

## Definition of Done

- [ ] Todos os acceptance criteria atendidos e verificados.
- [ ] Testes da Estratégia passando, incluindo a regressão do contrato do cliente.
- [ ] Typecheck limpo nos dois repos.
- [ ] `/code-review` rodado e findings de correção resolvidos.
- [ ] Fluxo exercitado de ponta a ponta.
- [ ] Medição com a sonda confirmando nenhuma interação acima de 200ms.
- [ ] Diff conferido: nenhum arquivo de `/api/v1/qr`, `shape()` inalterado.
- [ ] Spec `Concluído` + Change Log.

## Follow-up (fora do escopo, decisão do Nicolas)

- [ ] **Preview servido pelo backend.** O servidor já gera o QR estilizado com
      logo (`qr-styled.ts`) e expõe em `GET /q/image/:code`, cacheado. Trocar o
      desenho client-side por `<img loading="lazy">` levaria o card de ~340 nós
      para 1. É front-only e não toca o cliente. **Não entra aqui porque não foi
      pedido**, mas é o que faria a tela ficar instantânea em vez de aceitável:
      com 24 cards por página o desenho client-side ainda custa ~300ms.
- [ ] **`style.logoUrl` no payload.** Continua indo na listagem. Com 24 por
      página e logos de até 200KB, a página pode passar de 5MB. Cai junto se o
      item acima for feito.
- [ ] Remover o ramo legado sem params do `GET /qr` quando o front estabilizar.
- [ ] Remover `src/utils/perf-probe.ts` quando esta investigação fechar.

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-30 | 0.1 | Criação | Claude |
| 2026-07-30 | 0.2 | Escopo cortado a pedido do Nicolas: só a listagem do workflow. Microserviço e `shape()` saem do escopo e viram risco Alto com AC de regressão. Preview servido pelo backend vira Follow-up. | Claude |
| 2026-07-30 | 0.3 | Continuidade das mutações com paginação (T6b): criar volta pra página 1, excluir/mover o último item recua. Lacuna encontrada pela pergunta do Nicolas sobre criar dentro do projeto. | Claude |
| 2026-07-30 | 0.4 | Layout entra no escopo a pedido do Nicolas: navegação sai do miolo centralizado e vira coluna lateral com pastas aninhadas no projeto. Aprovado para implementar. Status → Em Implementação. | Claude |
| 2026-07-30 | 1.0 | Implementado e verificado com massa de 441 QRs em navegador real. Backend: 40 testes verdes (24 novos), `tsc` limpo. Front: `vue-tsc` limpo. Diff auditado: `shape()` e `listForCompanyApi()` fora do diff. Achado durante a verificação: a coluna nova derrubou a grade de 3 para 2 colunas em 1440px, corrigido baixando o `minmax` do card de 300 para 264. Status → Concluído. | Claude |
