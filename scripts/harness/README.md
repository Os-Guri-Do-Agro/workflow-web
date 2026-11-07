# Harness local de verificação

Sobe a **API real** contra um **Postgres embutido** com **dados sintéticos** e captura as telas com Playwright em três larguras. Serve para conferir uma mudança de verdade (tela aberta, endpoint chamado) sem tocar a produção.

O que ele nunca faz:

- carregar o `.env` de produção (o `api.sh` aponta `DOTENV_CONFIG_PATH` para um arquivo que não existe);
- conectar em banco remoto (o schema é gerado offline pelo `prisma migrate diff`);
- mandar Discord, push ou e-mail (o seed não tem webhook, VAPID nem SendGrid).

## Uso

```bash
cd scripts/harness && npm i          # uma vez (Postgres embutido, pg, playwright-core)

# 1. Postgres embutido em 127.0.0.1:55432 (deixe rodando)
node pg.mjs

# 2. Schema offline a partir do schema.prisma (sem conectar em banco nenhum)
cd ../../../workflow-api
DOTENV_CONFIG_PATH=/nao-existe DATABASE_URL_IPV6_FAST_CONNECTION=postgresql://postgres:postgres@127.0.0.1:55432/wf \
  npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > ../work-flow/scripts/harness/schema.sql
cd ../work-flow/scripts/harness
node apply-schema.mjs schema.sql     # recria o banco "wf" em UTF8
node seed.mjs > seed-out.json        # 5 pessoas, 4 empresas, tarefas, tempo, notas, agenda
node seed-extra.mjs                  # bia (tudo concluído) e caio (dia 1)

# 3. API real buildada (use um worktree limpo se alguém estiver editando a API)
(cd ../../../workflow-api && npx nest build)
bash api.sh ../../../workflow-api 3599

# 4. Front apontando para a API local
(cd ../.. && VITE_API_URL=http://127.0.0.1:3599 npx vite --port 5174)

# 5. Capturas: 375, 768 e 1440 px (VP filtra, TALL=1 captura a página inteira)
node shot.mjs saida nicolas@nevo.test light
VP=m375 TALL=1 node shot.mjs saida caio@nevo.test dark home
```

Senha de todo mundo: `nevo1234`. Nicolas é ADMIN nas quatro empresas; os outros são WORKER.

## Outras ferramentas

- `probe.mjs <rota> <largura> "<expressão JS>"`: mede algo na página (larguras de coluna, overflow).
- `csp-server.mjs <dist> 5180` + `csp-check.mjs`: serve o build de produção com os cabeçalhos do `vercel.json` e lista toda violação de CSP navegando pelas telas principais.
- `lottie-check.cjs`: confirma que as animações do `LottiePlayer` estão de fato animando.
- `font-shot.cjs <figtree|plex|source|atkinson|system>`: captura Configurações e o board com uma fonte escolhida.
- `api-smoke.cjs [email]`: navega 14 telas e lista toda resposta 4xx/5xx da API (o que uma mudança de autorização quebraria). Rode como ADMIN e como WORKER.
- `deploy-e2e.cjs` e `deploy-edit.cjs`: tela de Deploys de ponta a ponta (criar, token, eventos reais do EventBridge, idempotência, 401/403, autorizar app, teste, rotação, WORKER, editar). Precisa da migration `20261105120000_deploy_webhook` aplicada no banco do harness.
- `comment-check.cjs`: comentário de tarefa de outra empresa aberto pelo `/board` sai e é gravado com a empresa certa.
- `shell-hysteresis.cjs`: a moldura de celular só troca na navegação, nunca no meio da página.
- `qr-csp-check.cjs`: QR com logo desenha com a CSP aplicada (rode com o `csp-server.mjs` no ar).
- `celular-e2e.cjs`: board e notas no celular de ponta a ponta com toque de verdade (CDP `Input.dispatchTouchEvent`): abas, deslizar troca de coluna sem mover card, segurar abre "Mover para" e grava, Revisados recusado com a frase do menu, reordenar arrastando, `/board` e agrupado; barra de formatação acima do teclado (shim do `visualViewport`), tab bar saindo com o foco, topo da nota numa linha em todo estado; zero rolagem lateral em 320/375/414; nenhuma resposta 401 sem sessão. Devolve status, posição e `updatedAt` das tarefas do mês e apaga a nota que cria. `ONLY=board|desktop|notas|overflow|sessao` roda uma parte; `SHOTS=<pasta>` guarda capturas. Espera o mês como o seed deixa (ex.: "Crash ao abrir galeria no Android 14" em A fazer).
- `uteis-e2e.cjs`: Ctrl+K por chave e por título, Meu dia (Começar, Adiar, timer), timer no painel da tarefa e "Nova tarefa" no mês atual, no banco `wf` (`PGPORT`). Devolve o estado no fim, passe ou falhe: status, posição e prazo das tarefas do mês da tarefa usada, e apaga os registros de tempo que criou. Antes disso o "Começar" deixava a tarefa em Em andamento e o `celular-e2e` que rodasse depois no mesmo banco quebrava; agora os dois rodam em qualquer ordem.
- `board-order.test.mjs`: testes da ordem do board do mês (`src/features/tasks/board-order.ts`) com o `node:test`, compilando o módulo de verdade pelo esbuild do projeto (o front não tem vitest): atrasada, hoje, futura e sem data; prioridade pela escala do `task-meta`; empate na ordem manual; rotina virtual e otimista pela data; a mesma ordem em cinco fusos; o índice do `PATCH /move` (com 2000 casos aleatórios). Uso: `node scripts/harness/board-order.test.mjs`.
- `board-entrega-e2e.cjs`: a "Ordem: Entrega | Manual" de ponta a ponta. Cria o cenário no Nevo Studio (datas e prioridades fora da ordem manual de propósito) e confere contra um oráculo lido do banco: ordem de entrega nas cinco colunas, arraste dentro da coluna sem efeito, arraste para outra coluna com filtro ligado (posição da coluna inteira no `PATCH /move`, sem pular no eco nem no refetch), criação pelo formulário e inline, lozenge do painel, status em massa da Lista (com par empatado), agrupado por pessoa, Manual reordenando e persistindo (URL, `‹ ›`, "Lembrar filtro"), a ala Marketing gravando no fim e a tela pondo no lugar da data, e o celular de 375 (folha "Mover para"). Prints claro e escuro em `prints/board-entrega/`. Env: `API`, `WEB`, `HARNESS_DB` (precisa do `seed-marketing-out` do banco), `ONLY=desktop|lanes|manual|marketing|celular`, `SHOTS`. Devolve o banco no fim.
- `fake-storage.mjs [porta]` (padrão 54329): Supabase Storage falso em Node puro (buckets, upload direto por URL assinada, URL assinada de leitura com Range, download autenticado, remoção, cópia do lado do servidor (`POST /object/copy`, a do `DriveStorageService.copy`), URL pública, CORS aberto). O `api.sh` já aponta `SUPABASE_BUCKET_URL` para ele (troque com `HARNESS_STORAGE_URL`), então suba o fake antes da API para uploads e anexos funcionarem. Os arquivos ficam em `fake-storage-data/` (ignorada pelo git); o bucket público `workflow-attachments` nasce junto, os demais a API cria.
- `fake-social.mjs [porta]` (padrão 54351): redes sociais FALSAS em Node puro para a publicação da ala (R2, parte A): Meta (diálogo de login, troca de token, páginas, Instagram com containers, status e `media_publish`, Facebook foto, várias fotos e vídeo, insights, campanhas e insights de anúncio), YouTube (consentimento, token, canais, upload retomável em partes, estatísticas), LinkedIn (OAuth, organizationAcls, imagens, vídeo em partes com ETag, posts, estatísticas) e TikTok (OAuth, caixa de entrada em partes, status). Confere o que recebe (foto JPEG de 3 canais e sRGB até 1440 px, vídeo com `ftyp`, cabeçalhos `Linkedin-Version` e Rest.li) e devolve token `FAKETOKEN-...` para os roteiros procurarem vazamento. Controle: `GET /__control/state`, `POST /__control/reset`, `/fail` (`{ match, status | "drop", times }`), `/delay`, `/clear-faults`, `/revoke`. Envs da API: `META_GRAPH_URL=http://127.0.0.1:54351/meta`, `META_AUTH_URL=.../meta-www`, `YOUTUBE_API_URL=.../google`, `YOUTUBE_AUTH_URL=.../google-auth`, `YOUTUBE_OAUTH_URL=.../google-oauth`, `LINKEDIN_API_URL=.../li`, `LINKEDIN_AUTH_URL=.../li-www`, `TIKTOK_API_URL=.../tt`, `TIKTOK_AUTH_URL=.../tt-www`, mais qualquer valor em `*_APP_ID`/`*_CLIENT_ID`/`*_SECRET`.
- `marketing-publish-e2e.cjs`: publicação nas redes de ponta a ponta (todos os critérios da parte A da R2). Sobe a PRÓPRIA API na 3651 (sem chaves, depois com chaves, e uma segunda instância numa porta efêmera para os dois agendadores), usa o `fake-social.mjs` e grava os logs das APIs em `prints/marketing-publish/` para varrer token. Pede o Vite em `WEB` (padrão 5251) e o banco `wf_pub`. `ONLY=a1,a2,a3,a4,a5,a6,a7,a8,a9,a10,a11,mobile` roda uma parte (a11: YouTube, LinkedIn e Facebook). Storage: `HARNESS_STORAGE_URL` (padrão 54329) e `STORAGE_DIR`, a pasta `drive-files` desse storage (padrão `fake-storage-data/drive-files`), onde o roteiro confere que os JPEG derivados saíram; pasta que não existe ou sem nada do grupo falha com a frase.
- `marketing-trash-e2e.cjs`: a Lixeira da ala (R2, C6), os 12 tipos, efeitos, papéis e o expurgo de 30 dias com o storage. Storage: `STORAGE` (URL que a API usa, padrão 54329; vai também para o contexto da API em que o roteiro roda o expurgo) e `STORAGE_DIR` (a pasta `drive-files` desse storage, padrão `fake-storage-data/drive-files`). Pasta que não existe ou sem nada do grupo faz as checagens de storage falharem com a frase, em vez de o "saiu do storage" passar em falso.
- `fake-storage-check.mjs [porta] [tamanhoKB]`: com o fake no ar, exercita-o com o `@supabase/supabase-js` real da API (use `5120` para ~5 MB).
- `marketing-library-e2e.cjs`: Acervo da ala (R1, P1) de ponta a ponta, pela API e pela tela: papéis e marcas (inclusive id de outra marca em detalhe, download, zip, lote, cópia), pasta com subpastas e 30 fotos soltas na tela (entradas de `webkitGetAsEntry`), Ctrl+V, duplicata (Pular e Manter os dois), lote, detalhes, tela cheia, zip de 50 e recusa de 201, "Escolher do acervo" (V2 por cópia com o mesmo sha256, card de volta para Aguardando, "Usado em"), apagar de um lado sem afetar o outro, "Mandar para o acervo", 375px, claro e escuro, e o "indisponível" sem as tabelas da R1 (renomeia as tabelas por instantes e devolve). Env: `API`, `WEB`, `HARNESS_DB`, `HARNESS_SEED`, `SHOTS`. O token de cada pessoa fica em cache num arquivo temporário e é validado em `/user/me` (a API limita 10 logins por minuto por processo). Monta os dois diálogos que o orquestrador costura com `library-dialogs-mount.ts` (só do harness, servido pelo Vite).
- `marketing-r1-audit-e2e.cjs`: achados da auditoria do front da R1, pela tela e conferidos no banco: repetido do Acervo sem travar a fila (saindo da tela e da ala), cancelar e tentar de novo sem duplicar, falha ao criar o item (retomada só do passo), subpasta no "Tentar de novo", sair da conta com envio pendente (pergunta, aborta no servidor, próxima conta sem fila, sem recarregar), zip pelo download do navegador (link de uso único, 410 na segunda vez, frase do erro na tela), rodapé do convite em 375 e 1366x768, larguras 1024/1280/375 e extras (outra marca, colar com diálogo, seleção, soltar fora). Atraso e falha saem do `page.route` (não mexe no fake-storage compartilhado). `ONLY=A,B,...` roda uma parte.
- `app-select.cjs`: ajuda comum dos roteiros para o `AppSelect` (reka-ui). O gatilho é um botão `role="combobox"` e a lista abre num portal com `role="option"`, então `page.selectOption` não serve. `pickOption(page, escopo, 'Texto da opção')` abre o campo e clica na opção; `pickByKeyboard` escolhe com setas e Enter; `selectedText`, `listOptions`, `openSelect`, `closeSelect`. O `escopo` é um seletor, um Locator (o contêiner do campo ou o próprio combobox) ou `{ label }`. A opção se escolhe pelo texto visível (o AppSelect não expõe o valor no DOM).
- `marketing-selects-e2e.cjs`: os selects da ala Marketing. (a) lê o código-fonte e exige zero `<select>` sem o comentário de motivo; (b) percorre as telas e os diálogos de criação e conta os `<select>` reais do DOM (zero); (c) escolhe por teclado em 6 `AppSelect` (Escape, foco de volta, setas que não andam o calendário, Enter da linha de lançamento rápido que não lança); (d) campos que salvam sozinhos com a API recusando (`page.route` responde 400): Tipo do card, Situação do parceiro e da ativação, Cor da empresa voltam ao valor anterior, uma chamada por escolha, nada gravado ao abrir ou reabrir; (e) celular 375px, menu dentro da tela e gatilho de 44px, prints claro e escuro em `prints/marketing-selects/`. Env: `API`, `WEB`, `HARNESS_DB`, `HARNESS_SEED`, `SHOTS`, `ONLY=a,b,c,d,e`.
- `marketing-appdata-e2e.cjs`: dados do app (M4) de ponta a ponta. Prints em `prints/marketing-appdata/`.
  - **O que cobre:** token por marca (uma vez, só o hash, papéis); a rota pública (401, 400, 413) e o corpo fora do contrato recusado inteiro (UTM no dia, semana fora da segunda, semana em curso, estoque nulo ou fora do 5 em 5, a métrica da semana em `days`, envio vazio); a tupla da semana que não é UTM viva vira `utm:outras`; do clique no link curto ao funil POR SEMANA FECHADA (1 cadastro na semana vai para "Outras UTMs", 5 aparecem; as linhas "Outras UTMs" e "Sem UTM"; a semana em curso); o reenvio sem duplicar o dia nem a semana; o parceiro pelo `/r/`; o total igual à soma dos dias; os estoques "cerca de" (arredondados para cima); o revogado com 401 e na tela; o alerta de 36 h; a área sem dado; o CSV com a linha da semana; o Looker; 375px e escuro.
  - **O relógio do app:** o "ontem" do app é o domingo da última semana fechada (o "hoje" dele é a segunda seguinte), para o cadastro cair numa semana que já fechou. No modo real, o roteiro passa `--agora` ao `harness-envio.ts`; os cliques e a leitura do QR voltam para esse domingo.
  - **Como prova o fluxo:** o site do app (petjourney-web em dev) grava o primeiro toque, o cadastro passa pelo pipe e pelo `UsuarioService` de verdade num Postgres LOCAL da PetJourney, e o job de verdade manda o dia, pelo `petjourney-api/scripts/nevo/harness-envio.ts`.
  - **Pré-requisitos:** API na 3661 (`wf_m4`), Vite na 5261, o banco `pj_m4` com as migrations da PetJourney (`prisma migrate deploy` com a URL local e `DOTENV_CONFIG_PATH` apontando para um arquivo que não existe) e o petjourney-web em dev na 3091 com `BACKEND_API_URL=http://127.0.0.1:9`.
  - **Env:** `API`, `WEB`, `HARNESS_DB`, `PJ_DIR`, `PJ_DB`, `PJ_WEB`, `ONLY=a,b,c,d`.
  - **`PJ_MODE=simulado`:** prova só o lado do Nevo, sem o código nem o banco da PetJourney. O `fake-app.cjs` faz o papel do app: guarda os cadastros por dia, pede as UTMs vivas (`GET app-utms`), aplica o recorte complementar do contrato v1 e manda como o job mandaria (um envio com os 3 dias e a última semana fechada e, na primeira vez, 90 dias de histórico em lotes de 30 com as semanas deles). Os passos do site e do cadastro saem como PULADO.
  - **Pegadinha:** o Playwright NÃO intercepta navegação redirecionada. Por isso o clique sai por `fetch` com `redirect: 'manual'`, e o navegador abre direto o destino no dev; seguir o 302 levaria ao site de produção.
- `prints/` (ignorada pelo git): capturas de antes e depois da rodada de nov/2026.

## Pegadinhas

- No Git Bash, variável de ambiente com `/` vira caminho do Windows: use `MSYS_NO_PATHCONV=1`.
- **Storage próprio** (um fake numa porta só sua, para um roteiro que estrangula o storage não atrapalhar os outros): a API aponta para ele por `HARNESS_STORAGE_URL`, e quem lê a pasta do storage precisa saber onde ela está. Passe `STORAGE` (a URL) e `STORAGE_DIR` (a pasta `drive-files` dele, que fica ao lado do `fake-storage.mjs` que subiu). Usam isso o `marketing-trash-e2e.cjs` e o `marketing-publish-e2e.cjs` (este com `HARNESS_STORAGE_URL`).
- **Ordem ao rodar a regressão inteira:**
  - o `marketing-publish-e2e.cjs` pede banco limpo e sobe a própria API (pare a sua na mesma porta): rode primeiro;
  - a API limita 10 logins por minuto por processo: rode o `marketing-tasks-e2e.cjs` cedo e deixe cerca de 1 minuto entre os roteiros;
  - o `marketing-r1-stitch-e2e.cjs` usa a primeira ativação da lista, e o seed não cria nenhuma: crie uma antes (ou rode depois de quem deixa uma);
  - `uteis-e2e.cjs` e `celular-e2e.cjs` rodam em qualquer ordem no mesmo banco `wf` (o `uteis` devolve o estado);
  - `api-smoke.cjs` usa a API na 3599 e o `seed-out.json`, e `uteis`/`roadmap` usam o banco `wf`: recrie o `wf` (`marketing-db.sh wf`, copie `seed-out.wf.json` para `seed-out.json` e rode `seed-roadmap.mjs`).
- O conteúdo das telas rola dentro do `<main>`: `fullPage` do Playwright só pega o viewport. Use `TALL=1`, que cresce o viewport (teto de 1900px no celular, porque o dobro disso estoura a textura do navegador e sai em branco).
