# Contrato do Calendário

## Estado no frontend

A tela `/calendar` voltou a consumir a API de eventos como fonte principal.

Enquanto o backend não estiver completo ou algum endpoint falhar, a tela usa eventos mockados em memória como fallback para manter a experiência navegável. Nesse modo, criar, editar e excluir eventos altera apenas o estado local da tela.

## Diferença entre mock e API

| Comportamento | Mock local | API esperada |
|---|---|---|
| Listagem mensal | Dados fixos gerados no frontend em torno da data atual | `GET /events?start=ISO&end=ISO` retorna eventos do intervalo visível |
| Criar evento | Adiciona item em memória com `id local-*` | `POST /events` persiste e retorna o evento criado |
| Editar evento | Atualiza item em memória | `PATCH /events/:id` persiste alterações |
| Excluir evento | Remove item em memória | `DELETE /events/:id` remove no backend |
| Próximos eventos | Calculado no frontend a partir da lista carregada | Pode continuar local ou usar `GET /events/upcoming?limit=N` |
| Entregas/prazos | Filtra eventos `TASK` e `DEADLINE` | Backend deve retornar `type` correto para cada evento |

## Endpoints necessários

### `GET /events`

Lista eventos da empresa ativa dentro de um intervalo.

Query params:

- `start`: ISO datetime obrigatório ou recomendado.
- `end`: ISO datetime obrigatório ou recomendado.

Resposta esperada:

```json
[
  {
    "id": "evt_123",
    "title": "Daily com engenharia",
    "description": "Alinhamento rápido",
    "startDate": "2026-07-03T12:00:00.000Z",
    "endDate": "2026-07-03T12:30:00.000Z",
    "type": "MEETING",
    "recurrence": null,
    "activityId": null,
    "attendees": []
  }
]
```

### `POST /events`

Cria evento.

Payload:

```json
{
  "title": "Entrega do release web",
  "description": "Fechar escopo e QA",
  "startDate": "2026-07-03T20:00:00.000Z",
  "endDate": "2026-07-03T21:00:00.000Z",
  "type": "DEADLINE",
  "recurrence": null,
  "activityId": null,
  "attendees": []
}
```

Deve retornar o evento criado com `id`.

### `PATCH /events/:id`

Atualiza parcialmente os mesmos campos do `POST`.

### `DELETE /events/:id`

Remove o evento e retorna sucesso sem exigir payload.

### `GET /events/upcoming?limit=N`

Opcional para a tela atual. Hoje o frontend calcula próximos eventos localmente após `GET /events`.

Se implementado, deve retornar eventos futuros ordenados por `startDate`.

## Tipos aceitos

O frontend já reconhece:

- `MEETING`
- `DEADLINE`
- `REMINDER`
- `SPRINT`
- `RETROSPECTIVE`
- `TASK`
- `PERSONAL`

Qualquer tipo fora dessa lista cai em visual genérico.

## Regras de backend esperadas

- Respeitar `x-company-id` enviado pelo interceptor Axios para isolar eventos por empresa.
- Persistir datas em ISO UTC e devolver no mesmo formato.
- Aceitar `endDate` ausente ou `null` para eventos sem término.
- Validar `startDate` obrigatório.
- Validar `title` obrigatório.
- Validar `type` contra os tipos aceitos.
- Ordenar por `startDate` quando fizer sentido, principalmente em `/events/upcoming`.
- Retornar erros com mensagem útil para a UI exibir via toast.

## Pontos ainda pendentes

- Decidir se recorrência será só armazenada (`recurrence`) ou expandida em ocorrências no backend.
- Definir se `TASK`/`DEADLINE` devem ser eventos livres ou espelhos de atividades reais.
- Completar vínculo `activityId` para abrir detalhe da atividade a partir do calendário.
- Definir modelo de participantes (`attendees`) e se haverá convites/notificações.
- Definir integração Google Calendar: OAuth, sincronização bidirecional e estratégia de conflito.
- Criar endpoint ou campo para origem do evento (`LOCAL`, `GOOGLE`, `ACTIVITY`) se a integração avançar.

## Comportamento atual de fallback

Se `GET /events` falhar, a tela:

- Mostra eventos de exemplo locais.
- Indica a fonte como `Exemplos locais`.
- Mantém criação/edição/exclusão apenas em memória.

Quando `GET /events` responde com sucesso, a tela:

- Usa somente os eventos retornados pela API.
- Indica a fonte como `Eventos da API`.
- Salva alterações via `POST`, `PATCH` e `DELETE`.
