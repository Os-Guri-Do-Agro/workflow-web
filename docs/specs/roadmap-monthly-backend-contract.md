# Contrato do Roadmap Mensal

## Objetivo da tela

A tela `/roadmap` possui dois modos:

- `Calendários mensais`: visão padrão, organizada por mês.
- `Timeline anual`: visão antiga do roadmap anual.

Este documento descreve o que o backend precisa fornecer para a visão de `Calendários mensais` deixar de depender de dados locais mockados no frontend.

A tela mensal serve para o usuário acompanhar, mês a mês:

- foco principal do mês;
- lista de focos/prioridades;
- calendário visual com dias marcados;
- agenda completa do mês;
- categorias dos itens de agenda;
- anotações rápidas;
- imagens relacionadas ao foco do mês;
- exportação para PDF no frontend.

## Estado atual no frontend

Hoje a visão mensal está em `src/features/roadmap/RoadmapView.vue` e usa dados em memória.

O frontend mantém localmente:

- `monthlyPlans`: meses planejados, foco, bullets e itens de agenda;
- `extraFocusItems`: focos adicionados pelo usuário;
- `focusPhotos`: imagens adicionadas ao foco do mês;
- notas criadas em "Anotações rápidas", adicionadas como itens de agenda com categoria `note`;
- seleção de mês para exportar PDF.

Enquanto o backend não existir, qualquer criação/remoção de foco, imagem ou nota é perdida ao recarregar a página.

## Conceitos da tela

### Mês planejado

Representa um mês do roadmap.

Campos esperados:

```json
{
  "id": "month_2026_05",
  "key": "2026-05",
  "year": 2026,
  "month": 4,
  "title": "Maio 2026",
  "main": "Consolidar estratégia, conteúdo e timeline de saúde.",
  "order": 1
}
```

Observações:

- `key` deve usar formato `YYYY-MM`.
- `month` pode ser zero-based (`0` a `11`) para compatibilidade direta com o frontend atual, ou `1` a `12` se o backend preferir. Se mudar para `1` a `12`, o frontend precisa converter.
- `order` define a ordem visual dos meses.

### Foco do mês

Cada mês possui uma lista de focos/prioridades.

```json
{
  "id": "focus_123",
  "monthId": "month_2026_05",
  "text": "Datas-chave: diário pet, carteirinha estruturada e timeline de saúde.",
  "order": 1,
  "createdAt": "2026-05-01T12:00:00.000Z",
  "updatedAt": "2026-05-01T12:00:00.000Z"
}
```

Regras:

- `text` é obrigatório.
- O frontend limita a prévia do card a 4 focos.
- O modal de detalhes mostra todos os focos.
- O usuário precisa conseguir adicionar e remover focos.
- Textos longos devem ser aceitos; a quebra visual é responsabilidade do frontend.

### Imagem do foco

Imagens anexadas ao mês.

```json
{
  "id": "photo_123",
  "monthId": "month_2026_05",
  "url": "https://cdn.example.com/roadmap/month_2026_05/photo_123.jpg",
  "fileName": "referencia-campanha.jpg",
  "contentType": "image/jpeg",
  "size": 248102,
  "createdAt": "2026-05-03T15:00:00.000Z"
}
```

Regras:

- O card mensal mostra no máximo 2 imagens.
- Se houver mais imagens, o card mostra um indicador `+N imagens`.
- Remoção de imagem acontece apenas no modal de detalhes.
- Upload deve aceitar somente imagens.
- Backend deve validar tamanho máximo. Sugestão inicial: 5 MB por imagem.

### Item de agenda

Representa qualquer marcação do calendário mensal.

Categorias reconhecidas pelo frontend:

| Categoria | Uso na tela |
|---|---|
| `milestone` | Marco |
| `meeting` | Reunião |
| `delivery` | Entrega |
| `recording` | Gravação |
| `note` | Nota |
| `risk` | Risco |

Modelo esperado:

```json
{
  "id": "entry_123",
  "monthId": "month_2026_05",
  "date": "2026-05-19",
  "title": "Reunião time",
  "description": "Alinhar prioridades e responsáveis.",
  "category": "meeting",
  "source": "manual",
  "createdAt": "2026-05-01T12:00:00.000Z",
  "updatedAt": "2026-05-01T12:00:00.000Z"
}
```

Regras:

- `date` deve ser `YYYY-MM-DD`.
- `title` é obrigatório.
- `description` pode ser `null`.
- `category` deve ser uma das categorias reconhecidas.
- O card mensal mostra no máximo 8 itens na prévia.
- O modal de detalhes e o PDF mostram todos os itens.
- A tela calcula dias marcados agrupando itens por `date`.
- Se um dia tiver mais de um item, o calendário mostra contador.

## Endpoints necessários

Os endpoints devem respeitar a empresa ativa via header `x-company-id`, conforme `docs/api-services.md`.

### `GET /roadmap/monthly?year=2026`

Retorna todos os meses planejados do ano para a empresa ativa.

Resposta esperada:

```json
{
  "year": 2026,
  "months": [
    {
      "id": "month_2026_05",
      "key": "2026-05",
      "year": 2026,
      "month": 4,
      "title": "Maio 2026",
      "main": "Consolidar estratégia, conteúdo e timeline de saúde.",
      "order": 1,
      "focusItems": [
        {
          "id": "focus_1",
          "text": "Datas-chave: diário pet, carteirinha estruturada e timeline de saúde.",
          "order": 1
        }
      ],
      "photos": [
        {
          "id": "photo_1",
          "url": "https://cdn.example.com/photo_1.jpg",
          "fileName": "referencia.jpg",
          "contentType": "image/jpeg",
          "size": 248102
        }
      ],
      "entries": [
        {
          "id": "entry_1",
          "date": "2026-05-19",
          "title": "Reunião time",
          "description": "Alinhar prioridades e responsáveis.",
          "category": "meeting",
          "source": "manual"
        }
      ]
    }
  ]
}
```

### `POST /roadmap/monthly`

Cria um mês planejado.

Payload:

```json
{
  "key": "2026-05",
  "year": 2026,
  "month": 4,
  "title": "Maio 2026",
  "main": "Consolidar estratégia, conteúdo e timeline de saúde.",
  "order": 1
}
```

### `PATCH /roadmap/monthly/:monthId`

Atualiza dados principais do mês.

Campos editáveis:

- `title`
- `main`
- `order`

### `DELETE /roadmap/monthly/:monthId`

Remove o mês planejado e seus dados filhos.

Se o backend preferir segurança maior, usar soft delete.

## Endpoints de focos

### `POST /roadmap/monthly/:monthId/focus`

Adiciona foco textual.

Payload:

```json
{
  "text": "Validar comunicação com cuidadores e veterinários.",
  "order": 4
}
```

Resposta:

```json
{
  "id": "focus_123",
  "monthId": "month_2026_05",
  "text": "Validar comunicação com cuidadores e veterinários.",
  "order": 4
}
```

### `PATCH /roadmap/monthly/:monthId/focus/:focusId`

Atualiza texto ou ordem do foco.

### `DELETE /roadmap/monthly/:monthId/focus/:focusId`

Remove foco textual.

## Endpoints de imagens

### `POST /roadmap/monthly/:monthId/photos`

Upload de uma ou mais imagens do foco.

Formato recomendado: `multipart/form-data`.

Campo:

- `files`: imagem ou lista de imagens.

Resposta:

```json
[
  {
    "id": "photo_123",
    "monthId": "month_2026_05",
    "url": "https://cdn.example.com/roadmap/month_2026_05/photo_123.jpg",
    "fileName": "referencia.jpg",
    "contentType": "image/jpeg",
    "size": 248102
  }
]
```

### `DELETE /roadmap/monthly/:monthId/photos/:photoId`

Remove imagem.

## Endpoints de agenda

### `POST /roadmap/monthly/:monthId/entries`

Cria item de agenda.

Payload:

```json
{
  "date": "2026-05-19",
  "title": "Reunião time",
  "description": "Alinhar prioridades e responsáveis.",
  "category": "meeting"
}
```

### `PATCH /roadmap/monthly/:monthId/entries/:entryId`

Atualiza item de agenda.

Campos editáveis:

- `date`
- `title`
- `description`
- `category`

### `DELETE /roadmap/monthly/:monthId/entries/:entryId`

Remove item de agenda.

## Anotações rápidas

Na UI atual, "Anotações rápidas" cria um item de agenda com categoria `note`.

Fluxo esperado:

1. Usuário escolhe mês.
2. Usuário escolhe data.
3. Usuário escreve texto.
4. Frontend chama `POST /roadmap/monthly/:monthId/entries`.
5. Backend cria item com `category: "note"`.

Payload recomendado:

```json
{
  "date": "2026-05-03",
  "title": "Alinhar campanha com parceiros",
  "description": "Anotação adicionada manualmente.",
  "category": "note",
  "source": "quick_note"
}
```

## Exportação para PDF

Hoje o PDF é gerado no frontend com `window.print()`.

O backend não precisa gerar PDF neste primeiro momento.

O backend precisa apenas garantir que `GET /roadmap/monthly?year=YYYY` retorne todos os dados necessários para o frontend montar:

- PDF de todos os meses;
- PDF de um mês específico;
- agenda completa, sem limite de 8 itens;
- todos os focos, sem limite de 4 itens.

Opcional futuro:

```http
GET /roadmap/monthly/export?year=2026&month=2026-05
```

Se implementado futuramente, pode retornar um PDF pronto, mas isso não é necessário para a tela atual.

## Regras de validação esperadas

- Isolar dados por empresa usando `x-company-id`.
- Validar `year`, `month` e `key`.
- Impedir meses duplicados com mesma `key` dentro da mesma empresa.
- Validar `date` como `YYYY-MM-DD`.
- Validar `category` contra as categorias reconhecidas.
- Validar `title` obrigatório para item de agenda.
- Validar `text` obrigatório para foco.
- Validar upload apenas para imagens.
- Retornar erros com mensagem útil para o frontend exibir.

## Ordenação esperada

- Meses: por `order`, depois por `key`.
- Focos: por `order`, depois por `createdAt`.
- Agenda: por `date`, depois por `createdAt`.
- Imagens: por `createdAt`.

## Compatibilidade com a tela atual

O frontend atualmente espera dados equivalentes a:

```typescript
type CalendarCategory = 'milestone' | 'meeting' | 'delivery' | 'recording' | 'note' | 'risk'

type CalendarEntry = {
  id: string
  date: string
  title: string
  description?: string
  category: CalendarCategory
}

type MonthlyPlan = {
  key: string
  year: number
  month: number
  title: string
  main: string
  bullets: string[]
  entries: CalendarEntry[]
}
```

Ao integrar com API, o frontend pode mapear:

- `focusItems[].text` para `bullets`;
- `entries` diretamente para agenda;
- `photos` para galeria do foco;
- `id` do mês para operações de CRUD.

## Critérios de aceite para integração

- Ao abrir `/roadmap`, a visão mensal carrega meses da API.
- Se a API falhar, o frontend pode manter fallback local temporário.
- Adicionar nota persiste no backend e aparece após recarregar.
- Adicionar foco persiste no backend e aparece após recarregar.
- Remover foco remove no backend.
- Enviar imagem persiste URL no backend e aparece após recarregar.
- Remover imagem remove no backend.
- Agenda do card mantém limite visual de 8 itens, mas modal e PDF mostram todos.
- Exportação de PDF usa dados vindos da API.

## Pontos pendentes de decisão

- Definir se o endpoint final será `/roadmap/monthly` ou se deve seguir o padrão existente `/company/:companyId/roadmap`.
- Definir se `month` será zero-based (`0` a `11`) ou humano (`1` a `12`).
- Definir storage de imagens: local, S3, Cloudinary ou outro.
- Definir permissões: quem pode editar roadmap mensal, focos, notas e imagens.
- Definir se itens de agenda podem espelhar eventos de `/events` ou se serão independentes.
- Definir se o roadmap anual antigo usará o mesmo domínio ou continuará separado.
