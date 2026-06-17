# Roadmap — contrato esperado para backend

## Contexto

A tela `RoadmapView` existe no frontend em `src/features/roadmap/RoadmapView.vue` e está registrada na rota autenticada `/roadmap`.

Hoje ela usa **dados mockados locais** porque o backend ainda não expõe rotas para roadmap. Este documento descreve o comportamento atual do frontend e o que o backend precisa entregar para substituir os mocks por dados reais.

## Objetivo da tela

Mostrar uma timeline anual de eventos, atividades e marcos por área, inspirada em um roadmap trimestral:

- Q1, Q2, Q3 e Q4 no topo
- trilhas por área/responsável
- barras de atividades com início, fim, status e progresso
- marcos pontuais com data
- reviews trimestrais
- filtros por trimestre, área e status
- painel de detalhes ao selecionar uma atividade ou marco

## Estado atual no frontend

Dados mockados em `RoadmapView.vue`:

- `lanes`: áreas/trilhas do roadmap
- `roadmapItems`: atividades/eventos com período
- `milestones`: marcos pontuais
- `reviewMarkers`: reviews trimestrais
- `quarters`: Q1-Q4 de 2026

Interações já implementadas:

- filtro por trimestre (`Ano`, `Q1`, `Q2`, `Q3`, `Q4`)
- filtro por área
- filtro por status
- seleção de atividade ou marco
- painel de detalhes vazio inicialmente
- zoom visual no trimestre selecionado

## Tipos usados no frontend

```ts
type RoadmapStatus = 'done' | 'active' | 'planned' | 'risk'

type RoadmapLane = {
  id: string
  title: string
  description: string
  owner: string
  status: RoadmapStatus
  color: string
  icon?: string
}

type RoadmapItem = {
  id: string
  laneId: string
  title: string
  start: string // ISO date: YYYY-MM-DD
  end: string // ISO date: YYYY-MM-DD
  progress: number // 0-100
  status: RoadmapStatus
  kind: 'activity' | 'event'
}

type RoadmapMilestone = {
  id: string
  laneId: string
  title: string
  date: string // ISO date: YYYY-MM-DD
  status: RoadmapStatus
}

type RoadmapReview = {
  id: string
  label: string
  date: string // ISO date: YYYY-MM-DD
}
```

## Resposta sugerida

Endpoint principal:

```http
GET /roadmap?year=2026&companyId=<id>
```

Resposta:

```json
{
  "year": 2026,
  "start": "2026-01-01",
  "end": "2026-12-31",
  "quarters": [
    { "label": "Q1", "period": "Jan - Mar", "start": "2026-01-01", "end": "2026-03-31" }
  ],
  "lanes": [
    {
      "id": "development",
      "title": "Desenvolvimento",
      "description": "Entrega de roadmap, betas e release.",
      "owner": "Engenharia",
      "status": "active",
      "color": "success"
    }
  ],
  "items": [
    {
      "id": "development",
      "laneId": "development",
      "title": "Development",
      "start": "2026-04-01",
      "end": "2026-08-22",
      "progress": 42,
      "status": "active",
      "kind": "activity"
    }
  ],
  "milestones": [
    {
      "id": "alpha",
      "laneId": "development",
      "title": "Alpha",
      "date": "2026-05-20",
      "status": "active"
    }
  ],
  "reviews": [
    {
      "id": "review-q2",
      "label": "Review Q2",
      "date": "2026-06-26"
    }
  ]
}
```

## Endpoints recomendados

MVP somente leitura:

| Método | Endpoint | Uso |
|---|---|---|
| `GET` | `/roadmap?year=2026` | Carregar roadmap anual da empresa ativa |
| `GET` | `/roadmap/:id` | Detalhe completo de um roadmap, se houver entidade própria |

CRUD futuro:

| Método | Endpoint | Uso |
|---|---|---|
| `POST` | `/roadmap/items` | Criar atividade/evento |
| `PATCH` | `/roadmap/items/:id` | Atualizar atividade/evento |
| `DELETE` | `/roadmap/items/:id` | Remover atividade/evento |
| `POST` | `/roadmap/milestones` | Criar marco |
| `PATCH` | `/roadmap/milestones/:id` | Atualizar marco |
| `DELETE` | `/roadmap/milestones/:id` | Remover marco |

## Regras de negócio esperadas

- Roadmap deve ser escopado por empresa ativa (`x-company-id`), seguindo o padrão do frontend.
- Datas devem vir em `YYYY-MM-DD`.
- `progress` deve ficar entre `0` e `100`.
- `laneId` de item/marco deve existir em `lanes`.
- Status permitido: `done`, `active`, `planned`, `risk`.
- `start` deve ser menor ou igual a `end`.
- Itens podem atravessar trimestres.
- Reviews trimestrais podem ser gerados automaticamente pelo backend ou configurados.

## Integração no frontend quando backend existir

Criar:

- `src/service/roadmap/roadmap-service.ts`
- `src/composables/useRoadmap.ts`

Fluxo esperado:

1. `RoadmapView.vue` chama `useRoadmap(year)`.
2. `useRoadmap` usa Vue Query.
3. `roadmap-service.ts` consome `GET /roadmap?year=YYYY`.
4. Mocks locais são removidos ou movidos para fallback/dev fixture.

## Critérios de aceite para backend

- `GET /roadmap?year=2026` retorna `lanes`, `items`, `milestones`, `reviews` e `quarters`.
- A resposta funciona sem o frontend precisar transformar nomes de campos.
- Respeita empresa ativa via `x-company-id`.
- Retorna lista vazia quando não houver dados, não erro.
- Valida datas, status e progresso.
- Não expõe dados de outra empresa.

## Observações

O frontend usa tokens visuais próprios. O backend não precisa enviar classes CSS nem ícones Lucide. Para `color`, prefira valores semânticos (`accent`, `success`, `info`, `warn`, `err`) ou omita o campo e deixe o frontend mapear por área/status.
