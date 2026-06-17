# Arquitetura — sessão expirada e redirect

## Objetivo

Documentar a arquitetura esperada para o fluxo de sessão expirada no frontend, sem alterar contrato do backend. O comportamento desejado é: quando o JWT deixar de ser válido, o usuário deve ser levado para a tela de login e, depois de autenticar novamente, voltar com segurança para a tela protegida que estava tentando acessar.

## Escopo

Este documento cobre apenas o frontend `workflow-web`.

Não faz parte deste escopo:

- criar refresh token;
- alterar endpoints de autenticação;
- alterar tempo de expiração do JWT;
- mudar regras de autorização por empresa ou role;
- criar telas novas além de possíveis ajustes na tela de login.

## Peças envolvidas

### Router

Arquivo principal: `src/router/index.ts`.

Responsabilidades:

- definir quais rotas são públicas;
- proteger rotas privadas;
- impedir navegação para rota privada quando não houver sessão válida;
- preservar o destino original em `redirect` quando a navegação for interrompida.

Rotas públicas esperadas:

- `/login`;
- `/signup`;
- `/download`;
- `/report/:companyId`;
- `/reports/:companyId`;
- `/r/:id`.

Todas as demais rotas exigem autenticação.

### Cliente HTTP

Arquivo principal: `src/service/api.ts`.

Responsabilidades:

- anexar `Authorization: Bearer <token>` quando houver token;
- anexar `x-company-id` quando houver empresa ativa;
- detectar respostas `401` em rotas privadas;
- encerrar a sessão local quando a API indicar que a autenticação não é mais válida.

O interceptor de resposta deve ignorar `401` vindo de rotas públicas para não quebrar login, signup ou fluxos externos de bug report.

### Persistência local

Chaves atuais:

- `token`: JWT da sessão;
- `activeCompany`: empresa ativa do usuário;
- `ui.*`: preferências de interface, como tema, acento, densidade e shell.

Ao expirar a sessão, a limpeza deve remover apenas credenciais e contexto autenticado:

- remover `token`;
- remover `activeCompany`.

Preferências de UI não devem ser apagadas, para que o usuário volte ao mesmo tema/shell depois do login.

### Tela de login

Arquivo principal: `src/features/auth/LoginView.vue`.

Responsabilidades:

- autenticar via `authService.postLogin`;
- salvar `accessToken` em `localStorage.token`;
- ler opcionalmente `redirect` da query string;
- redirecionar para o destino seguro depois do login;
- usar `/` como fallback.

O valor de `redirect` deve ser aceito apenas se for caminho interno relativo, por exemplo `/tasks/abc`. Valores externos como `https://site.com` ou `//site.com` devem ser recusados para evitar open redirect.

## Fluxo esperado

### Usuário entra sem token em rota privada

1. Usuário acessa `/dashboard`.
2. Guard do router detecta ausência de `token`.
3. Usuário é enviado para `/login?redirect=/dashboard`.
4. Após login bem-sucedido, a tela de login navega para `/dashboard`.

### Usuário tem token expirado antes da navegação

1. Usuário tenta navegar para `/variables`.
2. Guard do router detecta que o JWT expirou.
3. Frontend remove `token` e `activeCompany`.
4. Usuário é enviado para `/login?redirect=/variables`.
5. Após novo login, retorna para `/variables`.

### Usuário tem token expirado durante uso da aplicação

1. Usuário está em rota privada.
2. Uma chamada HTTP retorna `401`.
3. Interceptor Axios remove `token` e `activeCompany`.
4. Usuário é enviado para `/login?redirect=<rota-atual>`.
5. Após novo login, retorna para a rota original.

### Usuário erra credenciais no login

1. `POST /auth/login` retorna erro.
2. Tela de login mostra mensagem de erro.
3. Interceptor global não deve forçar novo redirect, pois o usuário já está em rota pública.

## Estados principais

### Sessão válida

Condição:

- existe `token`;
- JWT pode ser decodificado;
- `exp` ainda está no futuro.

Comportamento:

- rotas privadas são permitidas;
- requests recebem `Authorization`;
- empresa ativa é enviada quando disponível.

### Sessão ausente

Condição:

- não existe `token`.

Comportamento:

- rotas públicas são permitidas;
- rotas privadas redirecionam para login;
- login bem-sucedido leva ao redirect seguro ou `/`.

### Sessão expirada ou inválida

Condição:

- JWT não decodifica;
- JWT não possui `exp`;
- `exp` já passou;
- API retorna `401` em rota privada.

Comportamento:

- remover credenciais locais;
- preservar preferências de UI;
- redirecionar para login;
- preservar rota atual em `redirect`.

## Regras de segurança

- Nunca aceitar redirect absoluto externo.
- Nunca enviar o usuário para `//host`.
- Não limpar `localStorage.clear()` nesse fluxo, pois isso apaga preferências de UI.
- Não redirecionar repetidamente em múltiplos `401` simultâneos; o fluxo deve ter trava simples para evitar loop.
- Não interceptar `401` de páginas públicas como tentativa de sessão expirada.

## Arquivos sugeridos para implementação

- `src/utils/session.ts`: helpers para limpar sessão, validar expiração do JWT e reconhecer rotas públicas.
- `src/router/index.ts`: guard de autenticação e redirect para login.
- `src/service/api.ts`: interceptor de resposta para `401`.
- `src/features/auth/LoginView.vue`: leitura e validação do query param `redirect`.

## Critérios de aceite

- Acessar rota privada sem token leva para `/login?redirect=<rota>`.
- Token expirado em navegação leva para login sem renderizar a tela privada.
- `401` vindo de chamada protegida leva para login.
- Erro de senha no login não causa loop de redirect.
- Após login, o usuário volta para a rota original quando ela for segura.
- Preferências de tema, acento, densidade e shell permanecem salvas.
- `npm run type-check` passa.

