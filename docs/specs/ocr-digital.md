# Spec: OCR Digital (leitura automática de documentos assinados)

**Status:** Em Implementação
**Autor:** Claude (p/ Nicolas)
**Criado em:** 2026-07-30
**Última atualização:** 2026-07-31
**Versão:** 0.6

---

> **Integração externa:** o manual entregue a quem consome a API (o Marcel, na
> Sentia) vive em [ocr-integracao-sentia.md](./ocr-integracao-sentia.md):
> rotas, exemplos de retorno, os quatro estados de assinatura, o de-para com o
> cadastro de Empresa e o porquê de o grau de risco não sair do OCR.

## Visão Geral

Nova ferramenta de integração do workflow, no molde do QR: uma **API com token de
empresa** que recebe um documento de contrato, lê sozinha (motor: Claude), extrai
os campos, **valida a assinatura digital** (ICP-Brasil e/ou gov.br) e devolve
tudo pronto para o sistema do cliente preencher as lacunas. Sem configuração
nenhuma a leitura já funciona para qualquer formato (schema universal +
`outrosCampos`); o template é um refinamento opcional por empresa para
customizar as chaves. Nenhuma tela para o usuário final aprender.

É a versão-produto do leitor que hoje funciona embutido na Sentia via webhook.

## Motivação / Contexto de Negócio

- Documento que chega no mesmo formato é digitado à mão hoje por quem não tem o
  leitor. A ferramenta elimina a digitação: chegou, foi lido, campos extraídos,
  vinculado à empresa.
- Por serem contratos, o critério de "vale para efetivar" é a assinatura. A
  resposta já diz se o documento está apto, sem conferência manual.
- **Modelo de cobrança:** o uso do Claude é cobrado à parte do cliente. Por isso
  o consumo (tokens por documento, por empresa) precisa ficar registrado — o
  registro É a base da fatura.

## Decisões já tomadas com o Nicolas

| Decisão | Escolha |
|---|---|
| Motor de leitura | Claude (Anthropic API; `ANTHROPIC_API_KEY` já existe no Railway) |
| Assinatura válida | ICP-Brasil **e/ou** gov.br, qualquer uma vale |
| Consumo pelo integrador | API REST síncrona com token de empresa, igual ao QR, **e webhook de resultado por empresa, ambos na fase 1** (decisão do Nicolas em 2026-07-30, revendo a v0.1 que deixava webhook p/ fase 2) |
| Documentação | Docs do integrador (Scalar, molde do `/qr-docs`) fazem parte da entrega, incluindo o webhook |
| Escopo | Aprovada pelo Nicolas em 2026-07-30; implementação liberada |

---

## Research Findings

**Stack:** NestJS 11 + Prisma (Postgres/Supabase). Front Vue 3.5.

### O que já existe e é reusado (nada disso se constrói)

| Peça | Onde | Uso no OCR |
|---|---|---|
| Cliente Anthropic | `src/claude/claude.service.ts` (`ANTHROPIC_API_KEY`, model via `ANTHROPIC_MODEL`) | Ganha um método novo de extração com documento; nada do existente muda |
| Token de empresa | `CompanyApiToken` (schema:904) + `ApiTokenGuard` (`src/qr/api-token.service.ts`, prefixo `wfqr_`) | O MESMO token da empresa autentica o OCR. Guard extraído para lugar compartilhado |
| Docs do integrador | Scalar em `main.ts:193-224` (`/qr-docs`) | Segundo DocumentBuilder no mesmo molde → `/ocr-docs` |
| Storage de arquivo | `src/supabase/supabase.service.ts` (bucket + `getPublicUrl`/`remove`) | Guarda o template da empresa |
| Página no workflow | `work-flow/src/features/ocr/OcrDigitalView.vue` (hub Ferramentas, rota `/ocr`, entregue em 2026-07-30) | Evolui de apresentação para superfície de gestão |

### Fatos da API do Claude que moldam o desenho (verificados na skill claude-api)

- **PDF entra nativo**: bloco `{"type": "document", "source": {"type": "base64", "media_type": "application/pdf", ...}}`, sem beta, limite 32MB/requisição e 600 páginas. Contrato escaneado (imagem) é lido do mesmo jeito — o modelo enxerga a página. **Não é preciso converter para markdown**; a conversão jogaria fora exatamente o caso escaneado.
- **Structured outputs**: `output_config: {format: {type: "json_schema", schema}}` garante resposta que valida contra o schema do template — os `dados` da resposta nunca vêm malformados. (O `completeJson` atual do `ClaudeService` é parse por prompt; o método novo usa o mecanismo nativo.)
- **Modelo:** `claude-opus-5` como default do OCR (extração de contrato é intolerante a erro e o custo é repassado), configurável por env `OCR_ANTHROPIC_MODEL`. Preço de referência p/ precificar a cobrança: $5/M tokens de entrada, $25/M de saída. Um contrato típico de poucas páginas fica na casa de centavos de dólar por documento.

**Breaking Changes:** nenhuma. Tudo aditivo: modelos novos no schema, módulo novo,
segundo Scalar, método novo no `ClaudeService`. `/api/v1/qr` intocado.

---

## Como funciona (o contrato da ferramenta)

### 1. Extração: leitura inteligente por padrão; template opcional por empresa

**Sem template (o caminho padrão, v0.6):** todo documento é lido com o schema
universal de contrato — chaves fixas `tipoDocumento`, `objeto`, `partes[]`
(nome/papel/cpfCnpj), `dataAssinatura`, `vigenciaInicio`, `vigenciaFim`,
`valores[]` — mais a válvula `outrosCampos[]` para o que variar entre formatos.
A empresa pode ter N formatos de contrato sem configurar nada; leituras
genéricas gravam `templateVersion: 0` no acervo. Racional do Nicolas: o
template não reduz token nem "treina" nada; obrigá-lo só atrapalhava.

**Com template (opcional):** o ADMIN sobe o documento-modelo na página `/ocr`.
No upload, o Claude lê o modelo **uma vez** e deriva o mapa de extração: quais
campos existem, onde vivem, que tipo têm (ex.: `empresa`, `cnpj`,
`dataAssinatura`, `valorMensal`). O ADMIN revisa a lista, ajusta, salva. Esse
mapa vira o JSON schema das leituras seguintes — a resposta passa a trazer
exatamente as chaves da empresa.

Trocar o template é subir outro documento (o "vai atualizando" do requisito).
O mapa é re-derivado e a versão anterior fica registrada no documento processado
(cada leitura grava com qual versão de template foi lida).

### 2. Leitura: o endpoint que o integrador chama

```
POST /api/v1/ocr/read
Authorization: Bearer wfqr_...        (token da empresa, o mesmo do QR)
Content-Type: multipart/form-data     (file) — ou JSON com base64

→ 200
{
  "documentoLido": true,
  "assinatura": {
    "valida": true,
    "tipo": "ICP-Brasil",             // ou "gov.br" | null
    "assinadoPor": "FULANO:12345678900",
    "assinadoEm": "2026-07-28T14:22:00Z"
  },
  "dados": {                          // campos do template OU universais
    "empresa": "PetJourney Ltda",
    "cnpj": "12.345.678/0001-90"
  },
  "documentoId": "ocr_abc123"
}
```

- A **empresa é o token**: cada token é escopado a uma companyId, então o
  vínculo documento→empresa é automático, sem o integrador mandar id nenhum.
- Sem template configurado → leitura **genérica** com o schema universal (não
  há mais 409; decisão v0.6).
- PDF apenas nesta fase (ver Considerações de Arquitetura).
- Resposta síncrona; a leitura leva segundos, não minutos.

### 3. Validação de assinatura: o critério de negócio

Assinatura ICP-Brasil e gov.br vivem **dentro do PDF** (padrão PAdES: CMS/PKCS#7
embutido, campo `ByteRange`). A validação verifica, nesta ordem:

1. Existe assinatura embutida? (sem → `valida: false, tipo: null`)
2. O digest do documento bate com o assinado? (documento alterado depois de
   assinado → inválida)
3. A cadeia de certificação chega numa raiz confiável? Raízes aceitas: cadeia
   **ICP-Brasil** (AC-Raiz) e cadeia do **gov.br**. Qualquer uma das duas vale,
   conforme decidido.
4. O certificado estava dentro da validade na data da assinatura?

`documentoLido` e `assinatura.valida` são independentes de propósito: um
documento sem assinatura ainda é lido e extraído — o integrador decide o que
fazer com um contrato apto-mas-não-efetivável.

**Limitação declarada da fase 1:** revogação de certificado (CRL/OCSP) não é
consultada. A resposta carrega `"revogacaoVerificada": false` para o integrador
saber exatamente o que foi conferido. Consulta de revogação e/ou validação pelo
serviço oficial do ITI ficam na fase 2 (ver Follow-up).

### 4. Registro e acervo: cada leitura vira uma linha E o arquivo fica guardado

Cada chamada grava um `OcrDocument`: empresa, resultado, versão do template,
hash do arquivo, **tokens de entrada/saída e modelo usados**. É a trilha de
auditoria e a base da cobrança à parte.

**O PDF original é retido em bucket**, sempre. O workflow é o centralizador das
empresas do Nicolas (Sentia, PetJourney, FitCertify...), então todo contrato
lido vira acervo consultável: a página `/ocr` lista os processados e abre o
documento original de qualquer leitura, a qualquer momento.

Regras do acervo:
- Bucket **privado**, separado do bucket público de anexos. O de hoje
  (`SupabaseService`) devolve URL pública aberta; contrato assinado não pode
  viver atrás de link adivinhável.
- Acesso de leitura por **URL assinada de curta duração**, gerada sob demanda
  para membro autenticado da empresa dona do documento.
- Caminho por empresa: `ocr/<companyId>/<ano>/<documentoId>.pdf`, o `sha256`
  gravado no `OcrDocument` permite conferir integridade do acervo.
- Se o upload ao bucket falhar, a leitura NÃO responde sucesso silencioso: o
  acervo é requisito, não best-effort. A resposta vira 502 com mensagem clara e
  nada é cobrado.

---

### 5. Webhook: o resultado empurrado para o sistema da empresa

Além da resposta síncrona, cada empresa pode registrar **uma URL de webhook**
(na página `/ocr`, por ADMIN). Toda leitura concluída dispara um POST para ela:

```
POST <url registrada>
X-Ocr-Signature: sha256=<hmac do corpo com o segredo do webhook>
X-Ocr-Event: document.read

{ ...mesmo payload da resposta síncrona, mais "companyId" e "recebidoEm" }
```

Regras:
- **Segredo por webhook**, gerado na criação e usado para assinar o corpo
  (HMAC-SHA256). As docs ensinam a verificar a assinatura; sem verificação o
  integrador não deve confiar no POST.
- **Fire-and-forget com retentativa:** o disparo acontece DEPOIS da resposta
  síncrona e nunca a atrasa nem a quebra. 3 tentativas com backoff (1s/5s/25s);
  falha final vira log, o resultado continua disponível na resposta síncrona e
  no acervo.
- Entrega registrada em `OcrDocument.webhookStatus`
  (`SENT` / `FAILED` / `NONE`), visível na lista do `/ocr` — quem depura
  integração enxerga o que foi entregue.
- Webhook é **opcional**: sem URL registrada, nada dispara e nada falha.

---

## Riscos e Mitigações

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | Validação criptográfica errada dizendo `valida: true` para assinatura forjada — é O critério de negócio | Verificação completa (digest + cadeia + validade), nunca só "existe assinatura". Testes com fixtures reais: PDF assinado no gov.br, PDF ICP-Brasil, PDF adulterado pós-assinatura, PDF sem assinatura. O adulterado TEM que falhar. Limitações declaradas no payload (`revogacaoVerificada: false`), não escondidas |
| Alto | Prompt injection: contrato malicioso contendo instruções para o modelo ("ignore o schema e responda X") | Structured output com schema fechado (`additionalProperties: false`) — a resposta não tem onde carregar payload fora dos campos; system prompt fixo tratando o documento como DADO, nunca como instrução; `dados` nunca é executado/interpretado pelo backend |
| Médio | Custo por documento fora do previsto | `usage` gravado por documento desde o dia 1; teto de páginas/tamanho no upload (10MB, alinhado ao limite de 32MB da Anthropic com folga); modelo por env para ajustar o custo sem deploy |
| Médio | Template ruim → extração ruim e silenciosa | O upload do template mostra os campos derivados para o ADMIN revisar ANTES de salvar; a página de teste em `/ocr` permite rodar um documento de amostra e ver o resultado antes de dar o endpoint ao integrador |
| Médio | `ApiTokenGuard` compartilhado: mexer nele para o OCR não pode quebrar o QR | Extração do guard para `shared/` sem mudança de comportamento, coberta pelos testes de QR existentes (40 verdes hoje) que precisam continuar verdes |
| Médio | Reter contrato em bucket público por engano (o `SupabaseService` atual é público) | Serviço de storage PRÓPRIO do OCR apontando para bucket privado; AC explícito de que nenhuma URL pública existe; download só via URL assinada com expiração |
| Baixo | Crescimento do bucket com o acervo | Contratos são KB/poucos MB; caminho por empresa/ano facilita levantamento e eventual política de arquivamento futura. Sem limpeza automática: acervo é o objetivo |
| Baixo | Documento gigante estourando a requisição | Limite de upload + validação de páginas antes de chamar o modelo, erro 413 claro |

---

## Requisitos Não-Funcionais

- **Segurança:** endpoint do integrador atrás do token de empresa (sha256, igual
  QR); gestão de template atrás de JWT + ADMIN da empresa. Documentos lidos e
  templates ficam em **bucket privado**; download só por URL assinada de curta
  duração, para membro autenticado da empresa dona. Nenhum arquivo do OCR em
  bucket público.
- **Privacidade/LGPD:** documentos contêm dados pessoais e **são retidos por
  decisão de produto** — as empresas integradoras são do próprio Nicolas e o
  workflow é o acervo central delas. A mitigação passa a ser controle de acesso
  (bucket privado + URL assinada + escopo por empresa), não descarte. Registrar
  a retenção nas docs do integrador.
- **Performance:** resposta síncrona; alvo p95 < 30s por documento de até 10
  páginas.
- **Observabilidade:** log `[Ocr] read company=<id> template=v<n> valida=<bool>
  tokensIn=<n> tokensOut=<n> ms=<n>`.
- **Compatibilidade:** nada existente muda de contrato.

---

## Acceptance Criteria

### Comportamentais

- [ ] **Given** empresa com template configurado e token válido
      **When** `POST /api/v1/ocr/read` com um PDF assinado (gov.br OU ICP-Brasil)
      **Then** responde 200 com `documentoLido: true`, `assinatura.valida: true`,
      o `tipo` correto, e `dados` contendo os campos do template preenchidos.

- [ ] **Given** um PDF **adulterado após a assinatura**
      **When** enviado ao endpoint
      **Then** `assinatura.valida: false` (o digest não bate). Este é o teste que
      não pode passar por acaso.

- [ ] **Given** um PDF sem assinatura nenhuma
      **When** enviado
      **Then** `documentoLido: true`, `assinatura: {valida: false, tipo: null}`,
      `dados` extraídos mesmo assim.

- [x] **Given** empresa sem template
      **When** o integrador chama o endpoint
      **Then** leitura genérica: `dados` com as chaves universais +
      `outrosCampos`, `templateVersion: 0` no acervo (decisão v0.6; era 409).

- [ ] **Given** o ADMIN sobe um documento-modelo na página /ocr (opcional)
      **When** o upload conclui
      **Then** a tela mostra os campos que o leitor derivou, o ADMIN pode
      renomear/remover campos, e as leituras passam a usar as chaves dele.

- [ ] **Given** um documento com texto tentando instruir o modelo
      **When** processado
      **Then** a resposta contém somente os campos do schema (nada além), e a
      instrução embutida não altera o comportamento.

- [ ] **Given** qualquer leitura concluída
      **When** consulto `OcrDocument` daquela empresa
      **Then** existe a linha com tokens de entrada/saída, modelo, versão do
      template e resultado — o suficiente para faturar.

- [ ] **Given** um documento lido semanas atrás
      **When** abro a lista em /ocr e clico nele
      **Then** o PDF original abre (URL assinada), idêntico ao enviado
      (sha256 confere).

- [ ] **Given** um usuário de OUTRA empresa
      **When** tenta baixar esse documento
      **Then** recebe 403; e o link assinado expirado deixa de funcionar.

- [ ] **Given** o bucket indisponível no momento da leitura
      **When** o integrador chama o endpoint
      **Then** recebe 502 explícito, nenhum `OcrDocument` de sucesso é gravado
      e nada entra na base de cobrança.

- [ ] **Given** empresa com webhook registrado
      **When** uma leitura conclui
      **Then** a URL recebe o POST com o payload da leitura e assinatura
      HMAC válida, **depois** de a resposta síncrona já ter saído.

- [ ] **Given** a URL do webhook fora do ar
      **When** uma leitura conclui
      **Then** a resposta síncrona sai normal, as 3 tentativas acontecem com
      backoff, e `webhookStatus: FAILED` fica visível na lista do /ocr.

- [ ] **Given** empresa sem webhook
      **When** uma leitura conclui
      **Then** nada é disparado e nada falha.

### Observáveis

- [ ] `GET /ocr-docs` serve as docs Scalar do integrador.
- [ ] O mesmo token `wfqr_` autentica `/api/v1/qr` e `/api/v1/ocr`.
- [ ] Os 40 testes de QR existentes continuam verdes após a extração do guard.
- [ ] Migration aditiva; `prisma generate` limpo.
- [ ] Todo documento lido existe no bucket privado em
      `ocr/<companyId>/<ano>/<documentoId>.pdf`, e `OcrDocument.storagePath`
      aponta para ele.
- [ ] O bucket do OCR não expõe URL pública.

---

## Estratégia de Testes

### Unitários
- [ ] `SignatureService` — fixtures: assinado gov.br (válida), assinado
      ICP-Brasil (válida), adulterado (inválida por digest), sem assinatura,
      cadeia desconhecida (inválida), certificado expirado à época (inválida).
- [ ] `OcrService.read` — sem template → 409; template ok → chama extração com o
      schema certo; grava `OcrDocument` com usage e `storagePath`.
- [ ] `OcrService.read` — upload ao bucket falha → 502 e NENHUM `OcrDocument`
      de sucesso gravado.
- [ ] `OcrStorageService` — URL assinada expira; caminho segue
      `ocr/<companyId>/<ano>/<documentoId>.pdf`; download de empresa alheia → 403.
- [ ] Schema derivado do template sempre tem `additionalProperties: false`.
- [x] Sem template → schema universal (mesma contenção), `templateVersion: 0`.
- [ ] Guard compartilhado: token revogado → 401; token de outra empresa não lê
      template alheio.

### Integração
- [ ] Fluxo completo com Claude real (1 documento de amostra) em ambiente de dev,
      validando o shape da resposta ponta a ponta.

### Regressão
- [ ] Suíte de QR completa verde (o guard mudou de lugar).

### Manuais (happy path)
- [ ] Subir template real da PetJourney, revisar campos, salvar.
- [ ] Ler um contrato assinado real via curl com o token e conferir os dados.
- [ ] Conferir a linha de billing (`OcrDocument`) da leitura.

---

## Arquivos Impactados

| Arquivo | Ação | Descrição |
|---|---|---|
| `workflow-api/prisma/schema.prisma` | Modificar | Models `OcrTemplate` (companyId único, storagePath, extractionSchema Json, version, createdById), `OcrWebhook` (companyId único, url, secret, active) e `OcrDocument` (companyId, templateVersion, fileName, **storagePath**, sha256, assinatura*, dados Json, model, tokensIn/Out, ms, webhookStatus) |
| `workflow-api/prisma/migrations/...` | Criar | Aditiva idempotente (padrão do repo) |
| `workflow-api/src/shared/api-token.guard.ts` | Mover | `ApiTokenGuard` sai de `qr/` p/ compartilhar, sem mudar comportamento |
| `workflow-api/src/ocr/ocr.module.ts` `ocr.service.ts` | Criar | Núcleo: template (derivar/salvar), leitura (assinatura → extração → registro) |
| `workflow-api/src/ocr/signature.service.ts` | Criar | PAdES: ByteRange/CMS, digest, cadeia ICP-Brasil + gov.br, validade |
| `workflow-api/src/ocr/ocr-storage.service.ts` | Criar | Bucket PRIVADO do OCR: upload, URL assinada de curta duração, caminho por empresa. (Não reusa o `SupabaseService` atual, que é de bucket público com URL aberta) |
| `workflow-api/src/ocr/ocr.controller.ts` | Criar | Interno (JWT): template CRUD, lista de documentos, **download por URL assinada**, teste de leitura |
| `workflow-api/src/ocr/ocr-api.controller.ts` | Criar | Integrador (`/api/v1/ocr`, ApiTokenGuard): `POST /read` |
| `workflow-api/src/ocr/dto/*` | Criar | DTOs + exemplos p/ as docs |
| `workflow-api/src/claude/claude.service.ts` | Modificar | Método novo `extractFromPdf({pdfBase64, schema, instructions})` com document block + structured output (aditivo) |
| `workflow-api/src/main.ts` | Modificar | Scalar `/ocr-docs` (molde do `/qr-docs`) |
| `workflow-api/src/app.module.ts` | Modificar | Registrar `OcrModule` |
| `work-flow/src/features/ocr/OcrDigitalView.vue` | Modificar | De apresentação p/ gestão: upload/revisão do template, lista de processados, teste, link `/ocr-docs`, tokens |
| `work-flow/src/service/ocr/ocr-service.ts` + composable | Criar | Axios + vue-query da feature |

---

## Tasks Técnicas

- [x] **T1** — Schema Prisma + migration (`OcrTemplate`, `OcrDocument`).
- [x] **T2** — Extrair `ApiTokenGuard` para `shared/` (suíte QR verde prova a não-regressão).
- [x] **T3** — `SignatureService` + fixtures de teste (é a task de maior risco; fazer cedo). *(independente)*
- [x] **T4** — `ClaudeService.extractFromPdf` com document block + json_schema. *(independente)*
- [x] **T4b** — `OcrStorageService`: bucket privado (criar no Supabase), upload com caminho por empresa, URL assinada. *(depende de: T1)*
- [x] **T5** — Template: derivação de campos no upload, revisão, versão, storage. *(depende de: T1, T4, T4b)*
- [x] **T6** — `POST /api/v1/ocr/read`: assinatura → extração → **persistência no bucket** → `OcrDocument` com usage (falha de bucket = 502, sem cobrança). *(depende de: T2, T3, T4b, T5)*
- [x] **T6b** — Webhook: registro por empresa (URL + segredo), disparo pós-leitura com HMAC e retentativas, `webhookStatus`. *(depende de: T6)*
- [x] **T7** — Docs Scalar `/ocr-docs`, incluindo payload do webhook e verificação da assinatura. *(depende de: T6, T6b)*
- [x] **T8** — Front: página /ocr vira gestão (upload template, revisão de campos, lista com **abrir o PDF original** e status do webhook, config do webhook, teste). *(depende de: T5, T6, T6b)*
- [ ] **T9** — Testes conforme Estratégia + verificação ponta a ponta com documento real. *(depende de: T6, T8)*

---

## Considerações de Arquitetura

- **Decisão:** PDF apenas na fase 1; docx fica de fora.
  **Motivo:** a validação exigida (ICP-Brasil/gov.br) é PAdES, que é um padrão de
  **PDF**. Docx assinado nesse fluxo não existe na prática; aceitar docx criaria
  um caminho sem o critério de validade que define a ferramenta.
  **Alternativa rejeitada:** converter docx para md e ler — leitura sem validação
  é meio produto, e o caso escaneado se perderia.

- **Decisão:** o Claude lê o PDF nativo, sem conversão intermediária.
  **Motivo:** suporte nativo da API (32MB/600 págs) cobre inclusive contrato
  escaneado, que uma conversão para texto/markdown perderia por completo.

- **Decisão:** mesmo `CompanyApiToken` para QR e OCR.
  **Motivo:** uma credencial de integração por empresa; o cliente configura uma
  vez. A cobrança do OCR é por uso (registro por documento), não por ter acesso.
  **Alternativa rejeitada:** token com escopo por ferramenta — burocracia sem
  ganho enquanto o Nicolas controla a emissão; se um dia precisar, o campo de
  escopo entra aditivo.

- **Decisão:** validação de assinatura local (parse PAdES + cadeias ICP-Brasil e
  gov.br embarcadas), sem depender de serviço externo na requisição.
  **Motivo:** latência e disponibilidade — o endpoint é síncrono; cair junto com
  um serviço do governo quebraria o integrador.
  **Alternativa registrada para fase 2:** validar pelo serviço oficial do ITI
  (veredito com fé pública, cobre revogação). Entra como verificação assíncrona
  ou selo extra, não no caminho crítico.

- **Decisão:** derivar o schema de extração NO upload do template (uma chamada ao
  Claude), não a cada leitura.
  **Motivo:** é o "absorve o modelo" do requisito. Leituras ficam mais baratas
  (prompt menor: só o schema, não o modelo inteiro) e o ADMIN revisa os campos
  uma vez, com controle do que sai na resposta.

- **Decisão:** modelo default `claude-opus-5` (env `OCR_ANTHROPIC_MODEL`).
  **Motivo:** extração de contrato é intolerante a erro de leitura; o custo é
  repassado ao cliente. Env permite baixar para sonnet se o custo pesar, sem
  deploy.

- **Decisão:** reter TODO documento lido em bucket privado (acervo), revertendo
  a não-retenção da v0.1.
  **Motivo:** pedido do Nicolas — o workflow-nevo é o centralizador das SUAS
  empresas (Sentia, PetJourney, FitCertify...); o contrato lido precisa ser
  consultável depois ("um dia que eu precisar de um contrato lido eu consigo
  ver"). O trade-off de privacidade muda de descarte para controle de acesso.
  **Alternativa rejeitada:** processar e descartar — fazia sentido para clientes
  terceiros, não para acervo próprio.

## Configuração (env) e bucket

Levantado a pedido do Nicolas em 31/07: o que precisa existir no ambiente para
o OCR funcionar 100%.

**O bucket NÃO precisa ser criado à mão.** `OcrStorageService.ensureBucket()`
cria na primeira gravação, já como **privado** (`{ public: false }`), usando a
service role key. Se a chave não puder criar bucket, o erro aparece no primeiro
upload com causa clara, e a leitura responde 502 sem cobrar. Criar manualmente
no painel do Supabase também funciona: o nome padrão é `ocr-documents` e ele
tem que ficar **privado** (leitura só por URL assinada de 5 minutos).

| Env | Obrigatória | Default | Para quê |
|---|---|---|---|
| `SUPABASE_BUCKET_URL` | sim | — | Projeto Supabase do acervo. **Já existe** (é a mesma dos anexos) |
| `SUPABASE_SERVICE_ROLE_BUCKET_KEY` | sim | — | Service role key: cria o bucket e assina as URLs. **Já existe** |
| `ANTHROPIC_API_KEY` | sim | — | Motor de leitura. Sem ela, `extractFromPdf` lança e a leitura falha. **Já existe** |
| `OCR_BUCKET` | não | `ocr-documents` | Só para usar outro nome de bucket |
| `OCR_ANTHROPIC_MODEL` | não | `claude-opus-5` | Trocar o modelo da extração sem mexer no resto do app |
| `OCR_TRUSTED_CA_DIR` | não | `<raiz>/trusted-cas` | As raízes ICP-Brasil e gov.br já estão versionadas ali (12 arquivos) |

Ou seja: **em produção não falta env nova**, as três obrigatórias são as que a
API já usa para anexos e para o assistente. O que falta conferir no Railway é
se as três estão lá com valor, porque sem `ANTHROPIC_API_KEY` a leitura falha
e sem a service key o acervo não grava.

## Plano de Rollout

- [x] Raízes ICP-Brasil (v5-v13, repositório oficial do ITI) E cadeia gov.br
      completa (repo.iti.br, via AIA do certificado) commitadas em
      `workflow-api/trusted-cas/` — o validador carrega do diretório default,
      sem env.
- [x] **Smoke com documento REAL cumprido** (NDA do Nicolas assinado no
      gov.br): `valida: true, tipo: gov.br`. O smoke real pegou dois defeitos
      que as fixtures sintéticas não pegavam, ambos corrigidos: (1) o gov.br
      embute só o certificado folha no CMS, então as ACs do diretório entram
      como material de construção da cadeia; (2) o certificado gov.br é
      efêmero, então a cadeia é validada na DATA DA ASSINATURA (signingTime), e
      não em "agora". Smoke permanente em `src/ocr/real-pdf.smoke.spec.ts`
      (roda com `REAL_SIGNED_PDF=<caminho>`; pula sem a env).
- [ ] Migration (aditiva) → deploy da API (rotas novas, nada muda) → deploy do front.
- [ ] Testar com a PetJourney (template + contrato real) antes de divulgar a ferramenta.
- [ ] Página /ocr sai do estado "em desenvolvimento" no mesmo deploy do front.

## Plano de Rollback

Reverter commits e redeploy. Migration é aditiva (tabelas novas); em rollback as
tabelas ficam, sem efeito sobre o resto. Front volta à página de apresentação.

## Definition of Done

- [ ] Todos os AC verificados, incluindo o PDF adulterado falhando.
- [ ] Testes da Estratégia passando; suíte QR verde.
- [ ] Typecheck limpo nos dois repos.
- [ ] `/code-review` rodado; findings de correção resolvidos.
- [ ] Fluxo exercitado com documento real de ponta a ponta.
- [ ] Docs `/ocr-docs` publicadas com exemplos de request/response.
- [ ] Spec `Concluído` + Change Log; `/spec-sync` rodado.

## Follow-up (fase 2, fora desta spec)

- [x] ~~Consulta de revogação (CRL)~~ — implementada em 2026-07-31.
- [ ] Painel de consumo por empresa no /ocr (a fatura visual da cobrança à parte).
- [ ] Docx, se aparecer caso real com assinatura validável.

## Perguntas em Aberto

- [ ] Lib de parse PAdES: avaliar na T3 entre parse próprio (`node-forge` para
      CMS) e libs prontas de verificação de assinatura de PDF; critério = passar
      nas seis fixtures. Responsável: Claude, na implementação.
- [ ] Preço cobrado por documento ao cliente: decisão de negócio do Nicolas
      (o registro de tokens dá o custo; a margem é escolha).

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-07-30 | 0.1 | Criação, após decisões do Nicolas (motor Claude, ICP-Brasil e/ou gov.br, REST síncrono, hub primeiro) | Claude |
| 2026-07-31 | 0.6 | Template vira OPCIONAL (decisão do Nicolas: não reduz token, não treina, só atrapalhava; empresa pode ter N formatos). Sem template a leitura usa schema universal (tipoDocumento, objeto, partes[], datas, valores[] + outrosCampos[]) e grava templateVersion 0; 409 eliminado. Fix de upload no front: o axios global força Content-Type JSON e os POSTs de FormData do OCR não sobrescreviam p/ multipart — o multer nunca via o arquivo (provado e2e local: 400 com o bug, atravessa com o fix). Tela /ocr sempre ativa; modelo vira card opcional | Claude |
| 2026-07-31 | 0.5 | Fase 2 aplicada (pedido do Nicolas): revogação via CRL (revogado derruba; inacessível declara), carimbo RFC 3161 verificado como data-referência, CAdES .p7s anexado aceito no endpoint. 3 helpers de PKI de teste extraídos p/ `test-pki.ts`; 12 testes novos (66 no total). Payload ganha `carimboTempo` e `revogacao` por assinatura | Claude |
| 2026-07-30 | 0.4 | Implementação T1-T8 entregue: schema+migration (não aplicada), guard compartilhado via export, SignatureService (7 testes, PDF adulterado reprova), extractFromPdf (PDF nativo + structured output), bucket privado, service+controllers (boot verificado, /ocr-docs 200, guard 401), webhook HMAC com retentativas, docs Scalar, front de gestão (verificado em navegador com mock). 55 testes verdes. T9 pendente do smoke com contrato REAL (fica com o Nicolas) + /code-review | Claude |
| 2026-07-30 | 0.3 | Webhook sobe da fase 2 para a fase 1 (T6b: registro por empresa, HMAC, retentativas, webhookStatus); docs do integrador reforçadas como parte da entrega. Spec aprovada pelo Nicolas; status → Em Implementação | Claude |
| 2026-07-30 | 0.2 | Acervo: todo PDF lido é retido em bucket PRIVADO (pedido do Nicolas — workflow como centralizador das empresas dele). `OcrDocument.storagePath`, `OcrStorageService` (T4b), download por URL assinada na página /ocr, ACs de acesso/isolamento, LGPD muda de descarte p/ controle de acesso | Claude |
