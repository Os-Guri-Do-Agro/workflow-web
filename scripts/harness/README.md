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
- `celular-e2e.cjs`: board e notas no celular de ponta a ponta com toque de verdade (CDP `Input.dispatchTouchEvent`): abas, deslizar troca de coluna sem mover card, segurar abre "Mover para" e grava, Revisados recusado com a frase do menu, reordenar arrastando, `/board` e agrupado; barra de formatação acima do teclado (shim do `visualViewport`), tab bar saindo com o foco, topo da nota numa linha em todo estado; zero rolagem lateral em 320/375/414; nenhuma resposta 401 sem sessão. Devolve status, posição e `updatedAt` das tarefas do mês e apaga a nota que cria. `ONLY=board|desktop|notas|overflow|sessao` roda uma parte; `SHOTS=<pasta>` guarda capturas.
- `fake-storage.mjs [porta]` (padrão 54329): Supabase Storage falso em Node puro (buckets, upload direto por URL assinada, URL assinada de leitura com Range, download autenticado, remoção, cópia do lado do servidor (`POST /object/copy`, a do `DriveStorageService.copy`), URL pública, CORS aberto). O `api.sh` já aponta `SUPABASE_BUCKET_URL` para ele (troque com `HARNESS_STORAGE_URL`), então suba o fake antes da API para uploads e anexos funcionarem. Os arquivos ficam em `fake-storage-data/` (ignorada pelo git); o bucket público `workflow-attachments` nasce junto, os demais a API cria.
- `fake-storage-check.mjs [porta] [tamanhoKB]`: com o fake no ar, exercita-o com o `@supabase/supabase-js` real da API (use `5120` para ~5 MB).
- `marketing-library-e2e.cjs`: Acervo da ala (R1, P1) de ponta a ponta, pela API e pela tela: papéis e marcas (inclusive id de outra marca em detalhe, download, zip, lote, cópia), pasta com subpastas e 30 fotos soltas na tela (entradas de `webkitGetAsEntry`), Ctrl+V, duplicata (Pular e Manter os dois), lote, detalhes, tela cheia, zip de 50 e recusa de 201, "Escolher do acervo" (V2 por cópia com o mesmo sha256, card de volta para Aguardando, "Usado em"), apagar de um lado sem afetar o outro, "Mandar para o acervo", 375px, claro e escuro, e o "indisponível" sem as tabelas da R1 (renomeia as tabelas por instantes e devolve). Env: `API`, `WEB`, `HARNESS_DB`, `HARNESS_SEED`, `SHOTS`. O token de cada pessoa fica em cache num arquivo temporário e é validado em `/user/me` (a API limita 10 logins por minuto por processo). Monta os dois diálogos que o orquestrador costura com `library-dialogs-mount.ts` (só do harness, servido pelo Vite).
- `prints/` (ignorada pelo git): capturas de antes e depois da rodada de nov/2026.

## Pegadinhas

- No Git Bash, variável de ambiente com `/` vira caminho do Windows: use `MSYS_NO_PATHCONV=1`.
- O conteúdo das telas rola dentro do `<main>`: `fullPage` do Playwright só pega o viewport. Use `TALL=1`, que cresce o viewport (teto de 1900px no celular, porque o dobro disso estoura a textura do navegador e sai em branco).
