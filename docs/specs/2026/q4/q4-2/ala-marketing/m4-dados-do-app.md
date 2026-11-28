# Ala Marketing, M4: Dados do app

**Status:** Implementada na rodada R2, parte B (07/11/2026). No Nevo, falta o commit. Na PetJourney, o código está pronto no working tree, sem commit; o release é do Nicolas.
**Contrato (parte A):** [m4-contrato-dados-do-app.md](m4-contrato-dados-do-app.md)
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

## Ordem do release

O contrato mudou nas duas pontas em 07/11 e continua `payloadVersion` 1. Um Nevo antigo recusa o corpo novo da PetJourney (400), e um Nevo novo recusa o corpo antigo. As duas pontas sobem juntas, nesta ordem:

1. **PetJourney, banco:** `prisma migrate deploy` em produção, com as duas migrations aditivas (`20261107100000_nevo_como_nos_conheceu_enum` e `20261107100100_nevo_atribuicao_e_ultimo_acesso`).
2. **PetJourney, API** (`develop` vira `master`). Sem `NEVO_API_URL`/`NEVO_API_TOKEN` o job fica inerte: pode subir antes do Nevo.
3. **Nevo:** as tabelas da R2 (`MarketingAppMetricDay`, `MarketingAppToken`), depois a API e o front com a área Dados.
4. **Token:** o Dono do grupo cria o token em Marketing, Configurações, "Conexão com o app", e ele vai para `NEVO_API_TOKEN` (com `NEVO_API_URL`) na API da PetJourney.
5. **Primeira rodada** (na hora seguinte): sai a janela de 7 dias, o histórico de cerca de 90 dias e as semanas fechadas. Cada dia e cada semana saem uma vez.
6. **Só depois, o site e o app da PetJourney.** Os dois mandam campo novo no cadastro, que a API antiga recusaria.

No DEV, antes da primeira prova com o contrato novo:
- rode `scripts/nevo/smoke-dev.ts limpar-marcadores` na PetJourney;
- limpe os dados do app no Nevo de DEV;
- NUNCA apague o segredo do recorte (`nevo_recorte_segredo`).

## Critérios de aceite

- [x] Clicar no link curto de um post, cadastrar no site e, quando a semana fecha, o cadastro conta no funil da UTM no Nevo. *(o funil é por semana fechada desde a revisão de 07/11: 1 cadastro numa semana vai para "Outras UTMs", e 5 ou mais por semana aparecem no post. Roteiro B2 a B9)*
- [x] Cadastro pelo `/r/<codigo>` do parceiro conta para o parceiro no ranking. *(B7, sem contar duas vezes a UTM da placa que leva ao /r/)*
- [x] Nenhum payload que sai da PetJourney contém id, e-mail, nome, IP, token ou célula menor que 5; o teste de contrato falha se contiver. *(petjourney-api `src/nevo/nevo-contrato.spec.ts`, 54 testes, dia e semana; a força bruta do `nevo-recorte.propriedade.spec.ts` confere que nada de 1 a 4 se deduz; o Nevo também recusa com 400)*
- [x] Reenviar o mesmo dia não duplica número no Nevo, e o app nunca manda duas versões do mesmo dia nem da mesma semana. *(B6 e teste de serviço; do lado do app, a propriedade de versão única em `nevo-envio.cron.spec.ts`)*
- [x] Token revogado é recusado com 401 e aparece como revogado na tela. *(C1)*
- [x] Sem dado do app, a área Dados explica como conectar, sem quebrar a ala. *(D1 a D3)*
- [x] Comparação com o período anterior bate com a soma dos dias. *(B8 e teste de serviço)*

## Riscos

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | Reidentificação por cruzamento em dia de pouco movimento | O recorte é complementar, com o balde escolhido por ordem secreta. Os estoques saem só com o total, arredondados para cima. UTM e parceiro vão por semana, que soma só os dias exatos. Cada dia sai uma vez, e nada de geografia. Tudo conferido por força bruta (revisões de 07/11) |
| Médio | Instalação direta da loja sem UTM | "Como nos conheceu" (D3); Install Referrer fica para a M4.2 |
| Médio | Origem forjável (UTM e canal vêm do cliente) | É estimativa, não prova; a tela diz isso; nada de pagamento depende dela |
| Baixo | O job falhar em silêncio | Monitor no Sentry, e no Nevo "último envio do app" com alerta depois de 36 h |

## Change log

| Data | Versão | O quê |
|---|---|---|
| 2026-11-06 | 0.1 | Spec da M4 a partir da pesquisa no repositório da PetJourney (conferida no código) |
| 2026-11-07 | 1.0 | Implementada (R2, parte B). Detalhes abaixo. |
| 2026-11-07 | 1.1 | Revisão do contrato ([m4-contrato-dados-do-app.md](m4-contrato-dados-do-app.md)): UTM e parceiro por semana fechada (`cadastros_semana`), estoque só com o total e arredondado para cima, canceladas, plano e tipo fora, pets novos por espécie. O funil e o ranking de parceiros leem a semana; os quadros de plano e tipo saíram da tela. |
| 2026-11-07 | 1.2 | Envio único (revisão do B): o app manda cada dia em D+1 e cada semana uma vez, com o conteúdo congelado até o aceite, nova tentativa até D+7 e perda com log depois disso. Ordem do release escrita acima. |

**O que entrou na 1.0:**
- **Contrato v1 nos dois lados.** O recorte ficou assim:
  - célula de 1 a 4 sai `null`;
  - família exaustiva junta os pequenos em "outros", nunca uma célula pequena sozinha (senão sairia por subtração do total);
  - nenhum cruzamento no mesmo dia.
- **A tela mostra a soma com corte como intervalo** ("32 a 38", "menos de 5").
- **Parceiro.** O cadastro pelo `/r/<codigo>` liga ao parceiro do Nevo pela UTM que aponta para o `/r/` dele, ou pelo nome do estabelecimento, sem somar duas vezes.
- **"Como nos conheceu"** ganhou TikTok, YouTube, Google, Loja de apps, Clínica ou pet shop, Evento e Outro.
- **Leitura do critério 1.** A UTM vem por semana fechada (revisão de 07/11): 1 cadastro numa semana vai para "Outras UTMs", e 5 ou mais por semana aparecem no post. O roteiro prova os dois: com 1 cadastro o post fica sem número e "Outras UTMs" leva ele; com 5 na semana, o post mostra 5.
- **Migrations da PetJourney** `20261107100000_nevo_como_nos_conheceu_enum` e `20261107100100_nevo_atribuicao_e_ultimo_acesso`:
  - foram para o banco de DEV junto com o `migrate deploy` de outra sessão, em 06/11 às 23h40;
  - ficam congeladas.
- **Prova:** `scripts/harness/marketing-appdata-e2e.cjs`.
  - Modo real: PetJourney do harness.
  - `PJ_MODE=simulado`: só o lado do Nevo, com `fake-app.cjs`.
- **Smoke no DEV da PetJourney (07/11):**
  - cadastro pelo site e como o app;
  - o último acesso gravado;
  - o job da PetJourney mandando ao Nevo do harness, e o reenvio sem mudar nenhuma linha;
  - a área Dados e o painel com os números do DEV.

  Prints em `scripts/harness/prints/marketing-appdata/dev-smoke/`.
- **Painel:** os indicadores do app vêm dentro do `GET home`. Continua uma chamada só, e o `marketing-shot.cjs` confere.
