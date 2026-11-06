# Ala Marketing, M4: Dados do app

**Status:** Pronta para implementar depois da rodada R1 (06/11/2026)
**Épico:** [ala-marketing](../../../../epicos/ala-marketing.md) · **Depois de:** [R1](r1-acervo-tarefas-convite.md)
**Repos:**
- no Nevo: `work-flow` e `workflow-api`;
- na PetJourney (`C:\TRABALHO\PetJourney`): `petjourney-web`, `petjourney-api` e `petjourney-app`

## Problema

O Leonardo quer o dashboard do app dentro da ala, e a pergunta que importa é "qual post, QR ou parceiro trouxe o cadastro". Hoje o Nevo conta clique no link curto e leitura do QR, mas a contagem para aí: o cadastro acontece no site ou no app da PetJourney, que não guarda a UTM.

## O que a pesquisa achou (06/11, conferido no código)

| Já existe na PetJourney | Onde |
|---|---|
| Canal e plataforma do cadastro (`canalCadastro`, `plataformaCadastro`, `versaoAppCadastro`) | `petjourney-api/prisma/schema.prisma`, `Usuario`, linhas 71 a 73 |
| Indicação por parceiro ou influenciador (`referidoPorParceiroId`, `referidoPorInfluencerId`), por `/r/<codigo>` no site e no app | `Usuario`, linhas 49 e 61; `usuario.service.ts` (`resolverIndicacao`) |
| "Como nos conheceu" (`comoNosConheceu`) e a rota `GET /marketing/como-nos-conheceu-stats` | A API aceita, mas nenhum cliente envia |
| Agendador (`ScheduleModule`, mais de 60 `@Cron`), lock entre as 3 réplicas (`comLock`), monitor no Sentry | `app.module.ts:111`, `notificacao/helpers/advisory-lock.helper.ts` |
| Modelo de cliente HTTP externo com token (WFQR) | `src/qr/qr-client.service.ts` |
| Atividade por aparelho (`DispositivoUso.ultimoUsoEm`) | `schema.prisma`, linha 7030 |
| GA4 e GTM no site, que recebem a UTM mas não a ligam ao cadastro | `petjourney-web/src/lib/gtag.ts`, `layout.tsx` |

**Não existe:**
- UTM no cadastro;
- Install Referrer no Android;
- SDK de atribuição (AppsFlyer, Branch e afins);
- definição única de "ativo".

## Decisões

- **D1. Primeiro toque no site.**
  - O `petjourney-web` lê `utm_*` em qualquer rota pública e guarda num cookie de primeiro toque, por 30 dias, sem sobrescrever.
  - Envia no `POST /usuario` junto com o `ref` que já existe.
  - O link curto do Nevo já entrega a UTM no destino (o `buildUtmUrl`), então o caminho post, link curto, site e cadastro passa a ser rastreado de ponta a ponta.
- **D2. A atribuição fica numa tabela à parte** (`AtribuicaoCadastro`, 1:1 com `Usuario`), sem inchar `Usuario`.
  - Campos: as cinco UTMs, a página de entrada e o momento do primeiro toque.
  - Tudo validado e truncado no DTO.
- **D3. Origem declarada como rede de segurança.**
  - O cadastro do app e do site passa a perguntar "Como nos conheceu" (opcional, uma tela).
  - É a origem barata para quem instala direto da loja, onde a UTM se perde.
- **D4. App da loja fica para depois.**
  - Install Referrer do Android e SDK de atribuição saem da M4 mínima, porque são caros e o SDK exige contrato e consentimento.
  - Entram como M4.2 só se o volume de instalação direta justificar.
- **D5. Só agregados saem, com recorte mínimo.** Um job diário na `petjourney-api` (módulo `src/nevo/`, com lock e Sentry) calcula:
  - cadastros por dia, por canal e plataforma, por UTM (fonte, mídia, campanha e conteúdo), por parceiro (id e rótulo, nunca nome de pessoa física) e por "como nos conheceu";
  - ativos em 1, 7 e 30 dias;
  - assinaturas por plano e status;
  - pets por espécie;
  - uso das funções (registros criados por dia e por função).

  Regras de saída:
  - célula com menos de 5 vira nula;
  - cruzamentos só em janela de 7 dias;
  - a lista de chaves é fechada, e um teste de contrato falha se aparecer chave fora dela, id, e-mail, IP ou token, no molde do `vazamentos-pii.spec.ts` que já existe.
- **D6. Ativo tem uma definição só.**
  - `Usuario.ultimoAcessoEm`, gravado no máximo uma vez por dia por usuário no refresh e no login (`auth.service.ts`).
  - Até ele existir, o job usa `DispositivoUso.ultimoUsoEm` e avisa no payload que a fonte é o aparelho.
- **D7. A entrada no Nevo é uma rota pública com token por grupo**, no molde dos Acessos Públicos.
  - O Dono cria o token em Configurações, "Conexão com o app": escolhe a marca e copia o token uma vez só.
  - O Nevo guarda só o hash, mostra o último uso e permite revogar.
  - `POST /public/marketing/app-metrics` é idempotente pela chave marca, data, métrica e dimensão, e reenviar o mesmo dia substitui.
  - DTO fechado (`forbidNonWhitelisted`), limite de tamanho e de taxa.
- **D8. "Qual post trouxe" é um join por UTM.**
  - O Nevo casa a tupla fonte, mídia, campanha e conteúdo do cadastro com a `MarketingUtm` da mesma marca, e daí com o card, a campanha, o QR e o parceiro ligados.
  - O gerador de UTM do Nevo já normaliza (minúsculo, sem acento), e a PetJourney manda o valor como chegou. O casamento normaliza dos dois lados.
- **D9. Área "Dados" na ala.**
  - Números por dia, com comparação com o período anterior (7, 30 e 90 dias).
  - Funil por UTM: cliques, leituras de QR, cadastros, conversão.
  - Ranking de campanha, post e parceiro por cadastros.
  - Pets por espécie, assinaturas por plano e uso das funções.
  - Exportar CSV e o link do Looker Studio, que é uma configuração do grupo.
  - O painel inicial ganha os indicadores do app.
  - Gráficos no tema do Nevo (`VChart`), denso, sem cara de IA.
  - Visualizador vê, como o financeiro (decisão de 06/11).

## Partes (cada uma usável sozinha)

| Parte | Repo | Entrega |
|---|---|---|
| A. Contrato | os dois | Documento do payload (chaves, tipos, recorte, idempotência, versão) em `docs/` dos dois lados |
| B. Captura | petjourney-web, petjourney-api | Cookie de primeiro toque, `AtribuicaoCadastro`, DTO, "Como nos conheceu" no cadastro do site e do app |
| C. Entrada no Nevo | workflow-api, work-flow | Token por grupo e marca, rota pública, tabelas `MarketingAppMetricDay` e `MarketingAppToken` (só tabelas novas), tela de conexão |
| D. Job diário | petjourney-api | `src/nevo/` com cron, lock, Sentry, agregados com recorte, teste de contrato, cliente com `NEVO_API_URL` e `NEVO_API_TOKEN` |
| E. Área Dados | work-flow, workflow-api | Telas, funil por UTM, rankings, CSV, Looker Studio, painel inicial |
| F. Ativo único | petjourney-api | `ultimoAcessoEm` com gravação diária |

**Ordem:** A, depois B e C em paralelo, depois D, depois E, e F junto com D.

## Critérios de aceite

- [ ] Clicar no link curto de um post, cadastrar no site e, no dia seguinte, o post aparece com 1 cadastro no funil da UTM no Nevo.
- [ ] Cadastro pelo `/r/<codigo>` do parceiro conta para o parceiro no ranking.
- [ ] Nenhum payload que sai da PetJourney contém id, e-mail, nome, IP, token ou célula menor que 5; o teste de contrato falha se contiver.
- [ ] Reenviar o mesmo dia não duplica número no Nevo.
- [ ] Token revogado é recusado com 401 e aparece como revogado na tela.
- [ ] Sem dado do app, a área Dados explica como conectar, sem quebrar a ala.
- [ ] Comparação com o período anterior bate com a soma dos dias.

## Riscos

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | Reidentificação por cruzamento em dia de pouco movimento | Recorte mínimo de 5, cruzamento só em 7 dias, sem geografia |
| Médio | Instalação direta da loja sem UTM | "Como nos conheceu" (D3); Install Referrer fica para a M4.2 |
| Médio | Origem forjável (UTM e canal vêm do cliente) | É estimativa, não prova; a tela diz isso; nada de pagamento depende dela |
| Baixo | O job falhar em silêncio | Monitor no Sentry, e no Nevo "último envio do app" com alerta depois de 36 h |

## Change log

| Data | Versão | O quê |
|---|---|---|
| 2026-11-06 | 0.1 | Spec da M4 a partir da pesquisa no repositório da PetJourney (conferida no código) |
