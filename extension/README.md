# Nevo — detector de atividade (extensão)

Extensão MV3 que dá ao cronômetro do Nevo o sinal de atividade do **computador
inteiro**, sem depender de permissão do navegador e sobrevivendo à aba fechada.

## Primeiro: quase ninguém precisa dela

A permissão de detecção do próprio navegador dá a **mesma** proteção com um
clique e sem instalar nada. A tela `/protecao` do app oferece esse caminho
primeiro, e a extensão só aparece como alternativa para dois casos: quem
bloqueou a permissão antes (e aí só o cadeado reverteria) e quem quer proteção
com o Nevo fechado.

Não faça o time inteiro instalar extensão. Faça o time inteiro clicar em
Permitir.

## Empacotar

```bash
npm run extension:build -- --origin https://nevo.suaempresa.com
# com o id da loja já conhecido:
npm run extension:build -- --origin https://nevo.suaempresa.com --id abcdefghijklmnop
```

O domínio pode vir do `.env` (`VITE_APP_ORIGIN`) em vez do argumento. Sai tudo
em `dist-extension/`:

| Arquivo | Para quê |
|---|---|
| `nevo-extension-<versão>.zip` | subir na Chrome Web Store |
| `nevo-extension/` | carregar sem compactação (teste local) |
| `politica-chrome.reg` | instalação automática em máquinas com Chrome |
| `politica-edge.reg` | idem, Edge |
| `politica-mdm.json` | mesma regra por MDM/Intune/Workspace |

O manifesto versionado no repositório traz um marcador no lugar do domínio, de
propósito: o empacotador injeta o real. **Nunca** use curinga de plataforma
(`https://*.vercel.app/*`), que injetaria o content script em todo site
hospedado lá.

## Distribuir: os três caminhos, do melhor para o pior

**Política do navegador (zero passos para o funcionário).** Se as máquinas são
gerenciadas, aplique `politica-chrome.reg` / `politica-edge.reg` (ou o JSON no
MDM). Na próxima abertura do navegador a extensão já está instalada, e ninguém
precisa saber que ela existe. Requer o id da loja, então publique antes.

**Chrome Web Store (um clique).** Suba o `.zip` no [painel do
desenvolvedor](https://chrome.google.com/webstore/devconsole). Taxa única de
cinco dólares, revisão de alguns dias. Publicada, preencha
`VITE_EXTENSION_STORE_URL` e a tela `/protecao` passa a instalar em um clique,
com atualização automática dali em diante. Edge e Brave instalam da mesma loja.

**Carregar sem compactação (só para desenvolvimento).** `chrome://extensions` →
Modo do desenvolvedor → Carregar sem compactação → `dist-extension/nevo-extension`.
Não distribua assim: o navegador reclama a cada reinício e não atualiza sozinho.

## O que ela vê, e o que ela não vê

Usa `chrome.idle`, que responde uma coisa só: **ativo, ocioso ou tela
bloqueada**. Não há acesso a teclas, conteúdo, aba aberta ou histórico, e a
extensão não fala com a API do Nevo — quem faz isso é o app, autenticado. O
único dado que atravessa a ponte é um instante (`lastActivityAt`).

Isso também é o que responder na ficha de privacidade da loja.
