# M4, parte A: contrato dos dados do app (payloadVersion 1)

**Status:** Em vigor (07/11/2026; revisão do mesmo dia: UTM e parceiro por semana fechada, estoque só com o total e arredondado para cima, canceladas, plano e tipo fora) · **Spec:** [m4-dados-do-app.md](m4-dados-do-app.md) · **Rodada:** [R2](r2-publicacao-dados-avisos.md)
**Espelho do lado que envia:** `petjourney-api/docs/integracoes/nevo-agregados-v1.md`
**Código:** quem envia em `petjourney-api/src/nevo/nevo-contrato.ts`; quem recebe em `workflow-api/src/marketing/app-data/app-data.contract.ts`

Os dois documentos dizem a mesma coisa. Mudou uma chave, uma família ou uma regra: muda nos dois lados, nos dois arquivos de código e sobe a versão.

## A chamada

```
POST {NEVO_API_URL}/public/marketing/app-metrics
Authorization: Bearer wfapp_...
Content-Type: application/json
```

- O token é criado pelo Dono do grupo em Marketing, Configurações, aba "Conexão com o app". Ele aparece uma vez só; o Nevo guarda só o sha256.
- O token decide o grupo e a marca. O corpo não leva marca.
- https é obrigatório. O app só aceita http em `localhost`, para o harness.

| Resposta | Quando |
|---|---|
| 200 `{ ok, days, weeks, rows }` | gravado |
| 400 | corpo fora do contrato. `message` traz a lista dos problemas, em PT-BR, e nada é gravado |
| 401 | sem token, token inválido ou revogado (a frase diz qual) |
| 403 | a marca do token saiu da ala, ou a ala foi desligada no grupo |
| 413 | corpo acima de 1 MB |
| 429 | mais de 10 chamadas por minuto da mesma origem |

## O corpo

```json
{
  "payloadVersion": 1,
  "generatedAt": "2026-11-09T06:15:00.000Z",
  "timeZone": "America/Sao_Paulo",
  "days": [
    {
      "date": "2026-11-08",
      "metrics": [
        { "metric": "cadastros", "dimension": "", "value": 36 },
        { "metric": "cadastros", "dimension": "canal:web", "value": 13 },
        { "metric": "cadastros", "dimension": "canal:app", "value": 23 },
        { "metric": "assinaturas_ativas", "dimension": "", "value": 35 },
        { "metric": "pets_novos", "dimension": "", "value": 9 },
        { "metric": "pets_novos", "dimension": "especie:cachorro", "value": 9 }
      ]
    }
  ],
  "weeks": [
    {
      "week": "2026-11-02",
      "metrics": [
        { "metric": "cadastros_semana", "dimension": "", "value": 120 },
        { "metric": "cadastros_semana", "dimension": "utm:instagram|organico|lancamento|carrossel-dor", "value": 7 },
        { "metric": "cadastros_semana", "dimension": "utm:outras", "value": 9 },
        { "metric": "cadastros_semana", "dimension": "utm:sem_utm", "value": 104 },
        { "metric": "cadastros_semana", "dimension": "parceiro:PJ-CL1N1C|Clinica Bicho Feliz", "value": 6 },
        { "metric": "cadastros_semana", "dimension": "parceiro:sem_parceiro", "value": 114 }
      ]
    }
  ]
}
```

- **Chaves fechadas em todo nível:** chave a mais dá 400. Valem só `payloadVersion`, `generatedAt`, `timeZone`, `days` e `weeks` (esta é opcional); em cada dia, `date` e `metrics`; em cada semana, `week` e `metrics`; em cada linha, `metric`, `dimension` e `value`.
- **Sem conversão:** `"12"` não vira 12.
- **`date`:** dia de Brasília, `AAAA-MM-DD`. Não pode ser no futuro nem ter mais de 400 dias.
- **`week`:** a SEGUNDA-FEIRA de uma semana ISO (segunda a domingo de Brasília), `AAAA-MM-DD`.
  - Só semana FECHADA: o domingo (`week` + 6 dias) é antes de hoje em Brasília. No domingo a semana ainda está em curso; na segunda seguinte, fechou.
  - A mesma regra de idade dos dias (até 400 dias), e nada de semana repetida no envio.
- **Onde vai cada métrica:** a do dia só em `days`, e a da semana (`cadastros_semana`) só em `weeks`.
- **Limites:** de 0 a 31 dias e de 0 a 20 semanas por envio, mas nunca os dois vazios. Até 3.000 linhas por dia ou por semana e 10.000 por envio, dias e semanas somados. Não pode repetir métrica e dimensão no mesmo dia nem na mesma semana.
- **`value`:** inteiro de 0 a 1 bilhão, ou `null` onde o recorte manda (abaixo).

## Recorte de privacidade

1. **Célula solta de 1 a 4 sai `null`.** Vale para o total de uma métrica do dia (`cadastros`, `assinaturas_novas`, `pets_novos`), para o `uso` (`funcao:`) e para os ativos (`fonte:`). O Nevo recusa com 400 um número de 1 a 4 nesses lugares. Zero não identifica ninguém e sai como 0. Total `null` ou zero: a métrica não leva nenhuma família naquele dia.
2. **Família que reparte o total é partição completa, com recorte COMPLEMENTAR.** São elas: `canal`, `plataforma`, `como_conheceu`, `especie` (dos pets novos) e, na semana, `utm` (com o complemento `utm:sem_utm`) e `parceiro` (com `parceiro:sem_parceiro`).
   - Nenhuma célula delas sai `null` nem 0, e a soma fecha com o total.
   - As células de 1 a 4 vão para o balde (`<família>:outros`; na UTM, `utm:outras`). Se o balde tem célula pequena e menos de 2 células, ou soma menos de 5, uma célula grande vai junto, escolhida por uma ordem secreta de quem envia, nunca pelo valor.
   - Assim nenhuma célula pequena se deduz pelo total menos as outras. Célula de 1 a 4 sozinha numa família é recusada com 400.
3. **Estoque sai só com o total, arredondado PARA CIMA de 5 em 5.** Vale para `assinaturas_ativas` e `pets`.
   - 0 sai 0; de 1 a 5 sai 5; de 6 a 10 sai 10. Nunca sai `null`: o Nevo recusa estoque nulo ou fora do múltiplo de 5.
   - Sem quebra por plano, tipo ou espécie. Com ela, a conta do estoque de dois dias seguidos com o fluxo exato fixava a célula pequena do fluxo.
   - Fluxo que fecharia a conta do estoque não sai. As assinaturas canceladas saíram do contrato: com o total exato das novas e o estoque de dois dias, o total cortado delas se fixava em 1 ou 4. O Nevo mostra a variação do estoque no período no lugar.
4. **Sem cruzamento no mesmo dia, e UTM e parceiro só por semana fechada.** Cada dimensão tem uma família só.
   - A `plataforma` é a partição dos cadastros do APP: só sai quando `canal:app` sai exato (`plataforma:web` era a mesma contagem que `canal:web`).
   - A `utm` e o `parceiro` não vêm no dia, só em `cadastros_semana`. Por dia, quase toda UTM ficava abaixo de 5 e ia para "outras"; na semana o número aparece.
   - O total da semana é a soma dos totais de `cadastros` dos dias da semana que saíram EXATOS. O dia de 1 a 4 fica de fora (e as pessoas dele ficam fora da UTM e do parceiro), para a semana menos os outros dias não revelar o dia cortado. Por isso o total da semana é 0 ou 5 ou mais, nunca `null` nem de 1 a 4.
   - Quando os dias da semana vêm no mesmo envio, o Nevo confere: com os 7, a soma bate; com parte deles, o total não é menor que a soma dos que vieram.
5. **A UTM só sai com o nome se a tupla é uma UTM viva da marca no Nevo** (`GET /public/marketing/app-utms`). O resto vira `utm:outras`, e assim nome de pessoa colado num link nunca sai da PetJourney. O Nevo confere de novo: tupla que não é UTM viva da marca vai para `utm:outras` antes de gravar.
6. **Listas fechadas nas duas pontas** (tabela abaixo). Valor do banco fora delas vai para o balde da família, nunca com o próprio nome.
7. **Sem geografia.**
8. **Nada que pareça id, e-mail, IP, token, CPF ou telefone,** em nenhuma dimensão. Os dois lados conferem e recusam:
   - quem envia troca a parte da UTM por `removido` e confere o envio inteiro antes de mandar;
   - quem recebe devolve 400.

**Como o Nevo mostra:**
- A soma de células com corte é um intervalo. Uma célula `null` vale "de 1 a 4"; três dias com 5, `null` e 7 somam "13 a 16". A tela nunca inventa o número.
- O estoque v quer dizer "entre v-4 e v": 5 aparece como "até 5", e o resto como "cerca de v".
- O funil por UTM e o ranking de parceiros leem a semana. O período do filtro arredonda para semanas inteiras: da segunda da semana do primeiro dia ao domingo da última semana fechada. Os cliques e as leituras de QR contam no mesmo intervalo, para a conversão bater. A semana em curso aparece como "ainda não fechou" e entra na segunda-feira seguinte.

## Métricas (lista fechada)

| Métrica | Onde | Tipo | Total (`""`) | Famílias |
|---|---|---|---|---|
| `cadastros` | `days` | fluxo | sim | `canal`, `plataforma`, `como_conheceu` |
| `ativos_1d`, `ativos_7d`, `ativos_30d` | `days` | estoque | não (uma linha `fonte:`) | `fonte` |
| `assinaturas_ativas` | `days` | estoque, para cima de 5 em 5 | sim, e só ele | nenhuma |
| `assinaturas_novas` | `days` | fluxo | sim | nenhuma |
| `pets` | `days` | estoque, para cima de 5 em 5 | sim, e só ele | nenhuma |
| `pets_novos` | `days` | fluxo | sim | `especie` |
| `uso` | `days` | fluxo | não | `funcao` |
| `cadastros_semana` | `weeks` | fluxo da semana | sim (a soma dos dias exatos) | `utm`, `parceiro` |

- **Fora do contrato desde 07/11** (o Nevo recusa com 400): `assinaturas_canceladas`; as famílias `plano` e `tipo`; `especie` no estoque de pets; `utm` e `parceiro` no dia.
- **Fluxo:** eventos do dia; o Nevo soma no período.
- **Estoque:** foto do fim do dia; vale a mais recente do período. Só o dia mais recente do envio leva estoque.
- **Semana:** `cadastros_semana` é dos cadastros da semana fechada inteira, de segunda a domingo de Brasília.
- **O universo é o tutor:** usuário com perfil de tutor, fora o admin do sistema.
- **Ativo em N dias:** último acesso a partir da meia-noite de Brasília do dia D-N+1.
  - A fonte é `fonte:usuario` (`Usuario.ultimoAcessoEm`, gravado no login e no refresh, no máximo uma vez por dia).
  - Enquanto a janela começa antes de o último acesso existir, a fonte é `fonte:aparelho` (`DispositivoUso.ultimoUsoEm`), e o Nevo mostra essa fonte.

## Famílias e valores

| Família | Onde | Valores |
|---|---|---|
| `canal` | `cadastros` | `app`, `web`, `desconhecido`, `nao_medido` (antes de 2026-10), `outros` |
| `plataforma` | `cadastros` | `ios`, `android`, `nao_medido`, `outros`. Reparte só os cadastros do app (`canal:app`): o site não tem plataforma |
| `como_conheceu` | `cadastros` | `instagram`, `facebook`, `linkedin`, `site`, `indicacao`, `tiktok`, `youtube`, `google`, `loja_de_apps`, `clinica_ou_pet_shop`, `evento`, `outro`, `nao_informado`, `outros` |
| `especie` | `pets_novos` | `cachorro`, `gato`, `ave`, `roedor`, `coelho`, `peixe`, `reptil`, `outro`, `outros` |
| `funcao` | `uso` | `vacina`, `consulta`, `peso`, `medicamento`, `lembrete`, `documento`, `diario`, `alergia` |
| `fonte` | ativos | `usuario`, `aparelho` |
| `utm` | `cadastros_semana` | `fonte\|midia\|campanha\|conteudo`, quatro partes de até 100 caracteres sem `\|`. O app manda normalizado (minúsculo, sem acento, espaço vira hífen); o `utm_term` fica de fora. Mais `outras` (o balde: tupla que não é UTM viva da marca, ou abaixo de 5 na semana) e `sem_utm` (o complemento) |
| `parceiro` | `cadastros_semana` | `CODIGO\|rótulo`. O código é o do `/r/<codigo>`. O rótulo é o nome do estabelecimento só quando ele tem CNPJ; senão "Parceiro CODIGO" ou "Influenciador CODIGO" (nunca nome de pessoa física). Mais `outros` (o balde) e `sem_parceiro` (o complemento) |

As listas são FECHADAS nas duas pontas: valor do banco fora delas vai para o balde da família (`outros`), nunca com o próprio nome. Valor novo só entra com a mudança feita nos dois contratos ao mesmo tempo. `plano` e `tipo` saíram do contrato com a quebra do estoque.

## Idempotência

- A chave é a marca (do token), a data, a métrica e a dimensão (`@@unique([companyId, date, metric, dimension])`).
- **A semana vai na mesma tabela** (`MarketingAppMetricDay`, sem migration): `date` é a segunda-feira da semana e `metric` é `cadastros_semana`.
- **Reenviar substitui.** Para cada métrica que veio num dia ou numa semana, o Nevo apaga as dimensões daquela métrica naquele dia (ou naquela segunda-feira) e grava as novas, na mesma transação.
  - O reenvio nunca duplica.
  - O dia da segunda-feira e a semana que começa nela não se apagam: as métricas são outras.
- Métrica que não veio fica como estava.
- **Mas o app nunca manda duas versões do mesmo dia nem da mesma semana** (revisão do B de 07/11). Duas versões com a contagem mudada em 1 entre elas, a mesma ordem secreta e a substituição do Nevo deduziam a célula pequena pela diferença. O Nevo continua aceitando a substituição: um corpo igual substitui igual.

## Quando o app manda

- **Cada dia e cada semana saem UMA vez** (`petjourney-api src/nevo/nevo-envio.cron.ts`).
  - O cron roda de hora em hora, com lock entre as réplicas e monitor no Sentry (`api-nevo-agregados`).
  - **O dia D sai em D+1,** já fechado. Só o dia de ontem leva a foto do estoque; dia mandado atrasado vai sem ela. Depois do 200, nunca mais sai. O que muda no banco depois do envio é ignorado.
  - **O conteúdo montado fica congelado no app até o aceite** e é reenviado igual. Nem a resposta perdida (o Nevo gravou e a rede caiu) gera outra versão.
  - **Se o Nevo não aceitar,** a hora seguinte tenta de novo, até D+7. Depois disso, o dia se perde com aviso no log do app, e a semana dele sai sem ele.
  - **A semana sai num corpo próprio** (só `weeks`), uma vez, quando os 7 dias dela foram aceitos ou perdidos. Normalmente é na segunda-feira seguinte, logo depois do domingo. Ela é montada com a parte que cada dia guardou no aceite, então o total dela é exatamente a soma dos dias exatos que o Nevo recebeu.
  - **Na primeira rodada,** além dos 7 dias até ontem, vai o histórico: da segunda-feira antes dos 90 dias até a véspera da janela, só de fluxo, em lotes de 30 dias. Depois vão as semanas fechadas desse período, num corpo de até 20.
- **O segredo do recorte (do lado do app) nunca é apagado nem trocado.** Com outro segredo, a mesma semana escolheria outra célula para o balde.
- **No Nevo,** "último envio do app" mostra quando chegou o último número. Depois de 36 h sem envio, a área Dados e o painel inicial avisam.

## Versão

`payloadVersion` 1. Versão nova só com a mudança feita nos dois lados ao mesmo tempo; o Nevo recusa versão que não conhece.

A revisão de 07/11 (UTM e parceiro por semana fechada, estoque só com o total e para cima, canceladas, plano e tipo fora, pets novos por espécie) ficou na versão 1: as duas pontas mudam juntas, e o corpo antigo é recusado com 400 (UTM no dia, estoque nulo ou com plano, canceladas).
