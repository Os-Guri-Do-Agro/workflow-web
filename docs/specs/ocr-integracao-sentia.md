# OCR Digital: manual de integração (Sentia)

**Para:** Marcel Yassumoto (integração na Sentia)
**De:** Nicolas / Fluvio
**Versão:** 1.0
**Atualizado em:** 2026-07-31
**Docs interativas (Scalar):** `https://srhub.up.railway.app/ocr-docs`

---

## 1. O que essa API faz

Você manda um contrato em PDF. Ela devolve, na mesma resposta, três coisas:

1. **Os dados do documento já estruturados** (CNPJ, razão social, CNAE, datas,
   valores), prontos para preencher o cadastro sem ninguém digitar.
2. **O veredito da assinatura digital**: se o documento está realmente assinado
   com certificado ICP-Brasil ou gov.br, quem assinou, quando, e se aquele
   certificado continuava válido e não revogado na data da assinatura.
3. **Um identificador do documento no acervo**, porque todo PDF lido fica
   guardado em bucket privado. Se daqui a dois anos alguém perguntar "cadê o
   contrato que gerou esse cadastro", ele está lá.

Duas coisas que valem entender desde já, porque mudam como você escreve o
código:

- **Ler e validar são independentes.** Um contrato sem assinatura nenhuma é
  lido normalmente, e a resposta diz `assinatura.valida: false`. Quem decide o
  que fazer com isso é a Sentia, não a API. Você pode cadastrar mesmo assim e
  marcar como pendente, ou barrar. É regra de negócio de vocês.
- **A resposta é síncrona.** A chamada leva alguns segundos (é leitura de
  documento com modelo de linguagem, não regex). Trabalhe com timeout de 120
  segundos. Se preferir não segurar a requisição do usuário, tem webhook na
  seção 9.

---

## 2. Antes de começar

### 2.1 Token

Você vai receber do Nicolas um token no formato `wfqr_...`. Ele é criado na
tela **Ferramentas → Acessos Públicos** do workflow e tem **escopo**: peça um
token com acesso a **OCR Digital**. Se vier um token de escopo só de QR Codes,
a API responde **403** com a mensagem dizendo exatamente isso.

O token identifica a empresa. Você **não envia id de empresa em lugar nenhum**:
os documentos que você mandar já entram vinculados à empresa do token.

O valor completo do token aparece **uma única vez**, na hora que ele é criado.
Guarde em variável de ambiente ou cofre de segredos, nunca no código.

```
Authorization: Bearer wfqr_SEU_TOKEN
```

### 2.2 Base URL

```
https://srhub.up.railway.app
```

### 2.3 Limites

| Item | Valor |
|---|---|
| Tamanho máximo do arquivo | 10 MB |
| Formatos aceitos | PDF assinado (PAdES) ou `.p7s` anexado (CAdES com o documento dentro) |
| Tempo típico de resposta | 5 a 20 segundos |
| Timeout recomendado no seu cliente | 120 segundos |

---

## 3. A rota que você vai usar

```
POST /api/v1/ocr/read
```

É a única rota que a integração precisa. As outras (template, acervo, webhook)
são da tela interna do workflow e o Nicolas cuida delas.

### 3.1 Enviando como multipart (recomendado)

```bash
curl -X POST https://srhub.up.railway.app/api/v1/ocr/read \
  -H "Authorization: Bearer wfqr_SEU_TOKEN" \
  -F "file=@contrato.pdf"
```

O campo se chama `file`. Se você mandar um `.p7s` anexado, é o mesmo campo: a
API abre o envelope, valida a assinatura dele e lê o PDF que está dentro.

### 3.2 Enviando como JSON base64

Se seu stack não monta multipart com facilidade:

```bash
curl -X POST https://srhub.up.railway.app/api/v1/ocr/read \
  -H "Authorization: Bearer wfqr_SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "fileBase64": "JVBERi0xLjcK...", "fileName": "contrato.pdf" }'
```

### 3.3 Exemplo em Node

```js
const form = new FormData()
form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), 'contrato.pdf')

const res = await fetch('https://srhub.up.railway.app/api/v1/ocr/read', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OCR_TOKEN}` },
  body: form,
  signal: AbortSignal.timeout(120_000),
})

if (!res.ok) {
  // Ver a tabela de erros na seção 8 antes de decidir se repete a chamada.
  throw new Error(`OCR ${res.status}: ${await res.text()}`)
}

const resultado = await res.json()
```

---

## 4. A resposta, campo por campo

```json
{
  "documentoLido": true,
  "assinatura": {
    "valida": true,
    "tipo": "ICP-Brasil",
    "assinadoPor": "MARCEL YASSUMOTO:12345678900",
    "assinadoEm": "2026-07-28T14:22:00.000Z",
    "totalAssinaturas": 2,
    "revogacaoVerificada": true,
    "carimboTempo": {
      "presente": true,
      "verificado": true,
      "data": "2026-07-28T14:22:05.000Z"
    },
    "detalhes": [
      {
        "valida": true,
        "tipo": "ICP-Brasil",
        "assinadoPor": "MARCEL YASSUMOTO:12345678900",
        "revogacao": "ok",
        "motivo": null
      },
      {
        "valida": false,
        "tipo": null,
        "assinadoPor": "FULANO DE TAL:98765432100",
        "revogacao": "nao_verificada",
        "motivo": "Certificado fora da validade na data da assinatura"
      }
    ]
  },
  "dados": { },
  "documentoId": "ocr_ab12cd34ef56gh78"
}
```

### 4.1 O que significa cada campo da assinatura

| Campo | O que é | Como usar |
|---|---|---|
| `valida` | `true` se **pelo menos uma** assinatura do documento passou em todas as checagens | É o seu semáforo principal |
| `tipo` | `"ICP-Brasil"`, `"gov.br"` ou `null` | Guarde junto com o cadastro, é evidência |
| `assinadoPor` | Nome no certificado, geralmente `NOME:CPF` | Confira contra quem deveria assinar |
| `assinadoEm` | Data declarada na assinatura (ISO 8601) | Ver `carimboTempo` antes de confiar nela |
| `totalAssinaturas` | Quantas assinaturas existem no arquivo | `0` significa documento sem assinatura nenhuma |
| `revogacaoVerificada` | `true` quando a API conseguiu consultar a lista de revogados da autoridade certificadora e ninguém estava revogado | `false` não quer dizer problema, quer dizer "não deu para conferir" |
| `carimboTempo` | Carimbo de tempo RFC 3161, quando o documento tem | Se `verificado: true`, a `data` é prova independente de quando foi assinado |
| `detalhes[]` | Uma entrada por assinatura encontrada | Use quando precisar auditar assinatura por assinatura |

### 4.2 Como decidir, na prática

```js
const a = resultado.assinatura

if (a.detalhes.length === 0) {
  // Não há assinatura digital NENHUMA no arquivo. Diferente de assinatura
  // inválida: aqui não existe nada para validar. É o caso de PDF escaneado
  // ou de aceite feito em plataforma sem certificado.
  return { status: 'SEM_ASSINATURA' }
}

if (!a.valida) {
  // Existe assinatura, mas não passou. O motivo está em detalhes[].motivo.
  return { status: 'ASSINATURA_INVALIDA', motivos: a.detalhes.map((d) => d.motivo) }
}

if (!a.revogacaoVerificada) {
  // Assinatura boa, mas a consulta de revogação não pôde ser feita (a lista da
  // autoridade certificadora estava fora do ar, ou o certificado não publica
  // uma). Recomendação: aceitar e marcar para reconferir depois, não barrar.
  return { status: 'VALIDA_SEM_CHECAGEM_DE_REVOGACAO' }
}

return { status: 'VALIDA' }
```

### 4.3 Motivos que você vai ver em `detalhes[].motivo`

Quando `valida` é `false`, o motivo é sempre um destes:

| Motivo | O que aconteceu |
|---|---|
| `Digest não confere: o documento foi alterado depois de assinado...` | O PDF foi mexido após a assinatura. Grave. Não aceite. |
| `Certificado revogado pela AC: ...` | O certificado foi cancelado. Não aceite. |
| `Certificado fora da validade na data da assinatura` | O certificado estava expirado quando assinaram |
| `Validação de cadeia falhou: ...` | A cadeia não chega a uma raiz confiável ICP-Brasil ou gov.br. Costuma ser assinatura de plataforma estrangeira ou certificado auto-assinado |
| `Certificado do signatário ausente no CMS` | Arquivo malformado |
| `CMS da assinatura ilegível` | Arquivo corrompido |

O valor de `revogacao` em cada detalhe é `"ok"`, `"revogado"` ou
`"nao_verificada"`.

---

## 5. O campo `dados`: onde vêm os dados do contrato

Aqui existem **dois formatos possíveis**, e qual você recebe depende de a
empresa ter ou não um modelo configurado no workflow.

### 5.1 Sem modelo configurado (leitura genérica)

Funciona para qualquer contrato, sem configurar nada. As chaves são fixas:

```json
{
  "dados": {
    "tipoDocumento": "contrato de prestação de serviços",
    "objeto": "Prestação de serviços de gestão de saúde ocupacional",
    "partes": [
      {
        "nome": "Beneficência Hospitalar De Cesário Lange",
        "papel": "contratante",
        "cpfCnpj": "50.351.626/0008-97"
      },
      { "nome": "Sentia Ltda", "papel": "contratada", "cpfCnpj": "..." }
    ],
    "dataAssinatura": "2026-07-28",
    "vigenciaInicio": "2026-08-01",
    "vigenciaFim": "2027-07-31",
    "valores": [{ "descricao": "valor mensal", "valor": 12000 }],
    "outrosCampos": [
      { "campo": "CNAE principal", "valor": "8660-7/00" },
      { "campo": "CEP", "valor": "13.184-090" }
    ]
  }
}
```

Repare no `outrosCampos`: é uma **lista de pares**, não chaves fixas. O nome do
campo vem do que estava escrito no documento, então varia. Serve para não
perder informação, mas **não serve para mapear direto no formulário**.

### 5.2 Com modelo configurado (recomendado para a Sentia)

O Nicolas anexa uma vez um contrato-modelo na tela `/ocr` do workflow. A partir
daí, `dados` volta com **exatamente as chaves que a Sentia precisa**, sempre as
mesmas, e você mapeia direto:

```json
{
  "dados": {
    "cnpj": "50.351.626/0008-97",
    "razaoSocial": "Beneficência Hospitalar De Cesário Lange",
    "nomeFantasia": "BHCL Hortolândia",
    "cep": "13.184-090",
    "uf": "SP",
    "municipio": "Hortolândia",
    "cnaePrincipal": "8660-7/00",
    "cnaeDescricao": "Atividades de apoio à gestão de saúde",
    "totalColaboradores": 340,
    "numeroContrato": "2026/0142",
    "dataAssinatura": "2026-07-28",
    "vigenciaInicio": "2026-08-01",
    "vigenciaFim": "2027-07-31",
    "valorMensal": 12000
  }
}
```

Todo campo pode vir `null` se não estiver no documento. **Nunca vem inventado**:
a instrução dada ao leitor é explícita nesse ponto.

> **Recomendação:** peça ao Nicolas para configurar o modelo antes de você
> começar. A diferença entre as duas formas é o seu código ter `dados.cnpj` ou
> ter que caçar dentro de `partes[]` e `outrosCampos[]` com heurística.

---

## 6. Mapeando para o cadastro de Empresa da Sentia

Esse é o objetivo final: o contrato chega e o cadastro de empresa sai
preenchido. O de-para com a tela atual:

| Campo na tela da Sentia | Vem de | Observação |
|---|---|---|
| CNPJ | `dados.cnpj` | Normalize antes de salvar (ver 6.1) |
| Razão social | `dados.razaoSocial` | |
| Nome fantasia | `dados.nomeFantasia` | Costuma incluir a unidade, ex.: "BHCL Hortolândia" |
| UF | `dados.uf` | Se vier `null`, derive do CEP |
| CEP | `dados.cep` | Normalize para 8 dígitos |
| CNAE principal | `dados.cnaePrincipal` | Formato `8660-7/00` |
| Grau de risco | **Não vem do OCR** | Ver 6.2, isso é importante |
| Logo | Não vem do OCR | Upload manual |

Usando o exemplo real da unidade de Hortolândia:

```json
{
  "cnpj": "50.351.626/0008-97",
  "razaoSocial": "Beneficência Hospitalar De Cesário Lange",
  "nomeFantasia": "BHCL Hortolândia",
  "cep": "13.184-090",
  "cnaePrincipal": "8660-7/00",
  "cnaeDescricao": "Atividades de apoio à gestão de saúde"
}
```

### 6.1 Normalize antes de salvar

O documento traz o que estiver escrito nele, com a máscara que o redator usou.
Duas empresas iguais podem chegar como `50.351.626/0008-97` e
`50351626000897`. Antes de gravar ou comparar:

```js
const soDigitos = (v) => (v ?? '').replace(/\D/g, '')

const cnpj = soDigitos(dados.cnpj)          // "50351626000897"
const cep = soDigitos(dados.cep)            // "13184090"
const cnae = soDigitos(dados.cnaePrincipal) // "8660700"
```

Compare sempre por dígitos. **Use o CNPJ normalizado como chave** para decidir
entre criar empresa nova ou atualizar existente.

### 6.2 Grau de risco: por que o OCR não devolve

Grau de risco **não é informação do contrato**. Ele é definido pelo Quadro I da
NR-4, que associa cada código CNAE a um grau de 1 a 4. Ou seja: é uma tabela
oficial, não um dado que se lê do documento.

O jeito certo, e é o que a própria tela da Sentia já faz (o campo aparece
preenchido e travado): **a Sentia mantém a tabela CNAE para grau de risco e
deriva o valor a partir do `cnaePrincipal` que o OCR devolveu.**

```js
// grauDeRiscoPorCnae vem da tabela do Quadro I da NR-4, mantida pela Sentia.
const grauDeRisco = grauDeRiscoPorCnae[soDigitos(dados.cnaePrincipal)] ?? null
```

Se o OCR devolvesse grau de risco, ele estaria chutando ou copiando algo que o
redator do contrato pode ter escrito errado. Preferimos a tabela oficial. Se
algum dia o grau vier escrito no documento e vocês quiserem esse dado, dá para
incluir no modelo como campo separado, deixando claro que é "o que o documento
alega", não "o que a NR-4 determina".

---

## 7. Guardando a evidência

Junto com o cadastro, guarde estes três campos. Eles são o que responde
auditoria depois:

| Guarde | De onde vem | Serve para |
|---|---|---|
| `documentoId` | `resultado.documentoId` | Localizar o PDF original no acervo do workflow |
| `assinatura.valida` e `assinatura.tipo` | resposta | Provar que o cadastro veio de documento assinado |
| `assinatura.assinadoPor` e `assinadoEm` | resposta | Quem assinou e quando |

O PDF original fica retido no acervo privado do workflow, acessível pela tela
`/ocr` com URL assinada de curta duração. A Sentia não precisa guardar o
arquivo, só o `documentoId`.

---

## 8. Erros e o que fazer com cada um

| Código | Significa | O que fazer |
|---|---|---|
| **400** | Formato não suportado (não é PDF nem `.p7s`), ou base64 inválido | Não repita. Avise o usuário que o arquivo não serve |
| **401** | Token ausente, inválido ou revogado | Não repita. Fale com o Nicolas |
| **403** | O token tem escopo de QR Codes e não acessa o OCR | Não repita. Peça um token de escopo OCR |
| **413** | Arquivo acima de 10 MB | Não repita. Comprima o PDF ou peça outro |
| **502** | Acervo ou motor de leitura indisponível | **Pode repetir.** O documento não foi processado nem cobrado |
| **500** | Erro inesperado | Repita uma vez com espera. Se persistir, avise |

Regra geral: **só 502 e 500 merecem retentativa.** Os outros são problema do
lado de quem chamou e repetir só gasta.

Cada resposta de erro traz `requestId`. Se precisar que a gente investigue,
mande esse id junto, é ele que localiza a chamada no log.

---

## 9. Webhook (opcional)

Se você preferir não segurar a requisição do usuário esperando a leitura, dá
para registrar uma URL sua no workflow. Aí, **além** da resposta síncrona,
cada leitura é entregue por POST na sua URL com o mesmo corpo, mais
`companyId` e `recebidoEm`.

Headers que chegam:

```
X-Ocr-Event: document.read
X-Ocr-Signature: sha256=<HMAC-SHA256 do corpo cru com o seu segredo>
```

**Verifique a assinatura antes de confiar no conteúdo.** Sem isso qualquer um
que descubra sua URL manda cadastro falso:

```js
import crypto from 'node:crypto'

app.post('/webhooks/ocr', express.raw({ type: 'application/json' }), (req, res) => {
  const esperado =
    'sha256=' + crypto.createHmac('sha256', process.env.OCR_WEBHOOK_SECRET)
      .update(req.body)  // corpo CRU, antes de qualquer parse
      .digest('hex')

  const recebido = req.headers['x-ocr-signature']
  if (
    !recebido ||
    !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido))
  ) {
    return res.status(401).end()
  }

  const payload = JSON.parse(req.body.toString())
  // ... processa
  res.status(200).end()
})
```

Dois detalhes: o segredo do webhook também aparece **uma única vez** quando é
criado, e a entrega tem 3 tentativas com espera crescente (1s, 5s, 25s). Se
todas falharem, o documento fica marcado como falha de webhook na tela do
workflow, então nada some silenciosamente.

---

## 10. Boas práticas que vão te poupar tempo

1. **Idempotência.** O mesmo contrato enviado duas vezes gera duas leituras e
   dois `documentoId`. Antes de mandar, verifique se você já processou aquele
   arquivo (guarde um hash do PDF do seu lado, ou marque o registro de origem).
   Cada leitura consome modelo e é cobrada à parte.
2. **Não reenvie em loop.** Veja a tabela da seção 8: só 502 e 500 pedem
   retentativa, e com espera entre elas.
3. **Trate `null` em todo campo.** Campo ausente no documento vem `null`, e
   isso é o comportamento correto. Decida quais são obrigatórios para a Sentia
   e valide do seu lado.
4. **Não confie em `assinadoEm` sozinho** quando o documento tiver carimbo de
   tempo. Se `carimboTempo.verificado` é `true`, a data do carimbo é a prova
   forte, porque não depende do relógio de quem assinou.
5. **Log com `documentoId`.** Quando algo estranho aparecer no cadastro, é com
   esse id que a gente abre o PDF original e confere.

---

## 11. Checklist de integração

- [ ] Recebi um token `wfqr_` com escopo de **OCR Digital** e guardei em
      variável de ambiente
- [ ] Confirmei com o Nicolas se a empresa tem **modelo configurado** (define
      se `dados` vem com as chaves da Sentia ou no formato genérico)
- [ ] Chamada com timeout de 120s e retentativa só em 502/500
- [ ] Trato os quatro estados de assinatura: sem assinatura, inválida, válida
      sem checagem de revogação, válida
- [ ] Normalizo CNPJ, CEP e CNAE para dígitos antes de comparar ou gravar
- [ ] Derivo o grau de risco da tabela da NR-4 pelo CNAE, não do OCR
- [ ] Guardo `documentoId`, `assinatura.valida`, `tipo`, `assinadoPor` e
      `assinadoEm` junto do cadastro
- [ ] Se usar webhook: verifico o HMAC com o corpo cru antes de processar

---

## 12. Dúvidas e contato

As docs interativas ficam em `https://srhub.up.railway.app/ocr-docs`. Lá dá
para testar a chamada direto do navegador colando o token.

Para dúvida de comportamento (um documento que deveria validar e não valida,
por exemplo), mande o `documentoId` ou o `requestId` do erro. Com ele
conseguimos olhar exatamente aquela chamada.
