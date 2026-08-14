# Nevo — detector de atividade (extensão)

Extensão MV3 que dá ao cronômetro do Nevo o sinal de atividade do **computador
inteiro**, sem depender de permissão do navegador e sobrevivendo à aba fechada.

## Antes de distribuir: troque o domínio

O `manifest.json` traz `https://nevo.SEU-DOMINIO.com/*` como marcador. **Troque
pelo domínio exato do Nevo** nos dois lugares (`host_permissions` e
`content_scripts.matches`) antes de empacotar.

Não use curinga de plataforma (`https://*.vercel.app/*`, `https://*.netlify.app/*`
e afins). O curinga faria o content script ser injetado em **todo site hospedado
naquela plataforma**, e qualquer um deles poderia conversar com a extensão. O
alcance precisa ser o domínio do produto, e só ele.

## Instalar sem compactar (teste)

1. `chrome://extensions` (ou `edge://extensions`)
2. Ligue o **Modo do desenvolvedor**
3. **Carregar sem compactação** e aponte para esta pasta
4. Abra o Nevo: o selo de proteção do cronômetro passa a "completa"

Para conferir o estado, clique no ícone da extensão — o popup mostra a última
atividade detectada e se a página do Nevo está conectada.

## O que ela vê, e o que ela não vê

Ela usa `chrome.idle`, que responde uma coisa só: **ativo, ocioso ou tela
bloqueada**. Não há acesso a teclas, conteúdo, aba aberta ou histórico, e a
extensão não fala com a API do Nevo — quem faz isso é o app, autenticado. O
único dado que atravessa a ponte é um instante (`lastActivityAt`).

## Por que ela existe

O `IdleDetector` da web resolve o mesmo problema, mas exige permissão explícita
que muita gente nunca chegou a ver (o Chrome silencia solicitações em máquina
configurada assim), e morre junto com a aba. A extensão não pede nada em tempo
de uso e continua valendo com o Nevo fechado.
