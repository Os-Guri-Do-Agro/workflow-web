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
- `prints/` (ignorada pelo git): capturas de antes e depois da rodada de nov/2026.

## Pegadinhas

- No Git Bash, variável de ambiente com `/` vira caminho do Windows: use `MSYS_NO_PATHCONV=1`.
- O conteúdo das telas rola dentro do `<main>`: `fullPage` do Playwright só pega o viewport. Use `TALL=1`, que cresce o viewport (teto de 1900px no celular, porque o dobro disso estoura a textura do navegador e sai em branco).
