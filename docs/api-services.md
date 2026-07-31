# API e serviços

Camada HTTP do frontend. Todos os serviços usam a instância Axios central em `src/service/api.ts`.

## Cliente HTTP

```typescript
// src/service/api.ts
baseURL: import.meta.env.VITE_API_URL

// Headers automáticos (interceptor):
Authorization: Bearer <token>        // localStorage.token
x-company-id: <companyId>            // localStorage.activeCompany
Content-Type: application/json
```

## Mapa de serviços

| Serviço           | Arquivo                                                  | Domínio                        |
| ----------------- | -------------------------------------------------------- | ------------------------------ |
| Auth              | `service/auth/auth-service.ts`                           | Login (não há cadastro público) |
| User              | `service/user/user-service.ts`                           | CRUD de usuários               |
| Companies         | `service/companies/companies-services.ts`                | Empresas e membros             |
| Variables         | `service/companies/variables/variables-services.ts`      | Variáveis de ambiente          |
| Quarters          | `service/quarters/quarters-service.ts`                   | Trimestres, boards, relatórios |
| Activities        | `service/activities/activity-service.ts`                 | Tarefas/atividades             |
| Backlog           | `service/backlog/backlog-service.ts`                     | Backlog por empresa            |
| Dashboard         | `service/dashboard/dashboard-service.ts`                 | Métricas e workspace           |
| Events            | `service/events/events-service.ts`                       | Calendário e Google            |
| Boards            | `service/boards/boards-service.ts`                       | Canvas colaborativo Yjs        |
| AI                | `service/ai/ai-service.ts`                               | Busca global e Copilot         |
| Share             | `service/share/share-service.ts`                         | Links públicos read-only       |
| Inbox             | `service/inbox/inbox-service.ts`                         | Notificações in-app            |
| Collaboration     | `service/collaboration/collaboration-service.ts`         | Comentários, reações e feed    |
| Presence          | `service/presence/presence-service.ts`                   | Usuários online por empresa    |
| Realtime          | `service/realtime/realtime-service.ts`                   | Eventos socket.io              |
| Export            | `service/export/export-service.ts`                       | Downloads gerados no backend   |
| Health            | `service/health/health-service.ts`                       | Status público da API          |
| Notes             | `service/notes/notes-service.ts`                         | Notas e pastas                 |
| Bug Report        | `service/bug-report/bug-report-service.ts`               | Reports públicos e internos    |
| Repository        | `service/repository/repository-service.ts`               | Git browser                    |
| GitHub Connection | `service/github-connection/github-connection-service.ts` | OAuth GitHub                   |
| Tickets           | `service/tickets/ticket-service.ts`                      | Tickets internos               |
| Notifications     | `service/notifications/notifications-service.ts`         | Webhooks Discord               |
| Import            | `service/import/import-service.ts`                       | Importação Jira XML            |

---

## Endpoints por domínio

### Auth

| Método | Endpoint      | Descrição                     |
| ------ | ------------- | ----------------------------- |
| POST   | `/auth/login` | Login (retorna `accessToken`) |
| POST   | `/user`       | Criar usuário (exige JWT; sem cadastro público) |

### User

| Método | Endpoint   | Descrição                |
| ------ | ---------- | ------------------------ |
| GET    | `/user/me` | Perfil do usuário logado |
| GET    | `/user`    | Listar usuários          |
| POST   | `/user`    | Criar usuário            |

### Company

| Método | Endpoint                   | Descrição                 |
| ------ | -------------------------- | ------------------------- |
| GET    | `/company`                 | Empresas do usuário       |
| GET    | `/company/all`             | Todas as empresas (admin) |
| GET    | `/company/with-metrics`    | Empresas com métricas     |
| POST   | `/company`                 | Criar empresa             |
| GET    | `/company/:id/members`     | Membros da empresa        |
| POST   | `/company/:id/member`      | Adicionar membro          |
| POST   | `/company/:id/member/lote` | Adicionar membros em lote |
| POST   | `/company/:id/admin`       | Promover admin            |

### Company Variables

| Método | Endpoint                      | Descrição                   |
| ------ | ----------------------------- | --------------------------- |
| GET    | `/company-variable`           | Listar variáveis da empresa |
| POST   | `/company-variable`           | Criar variável              |
| PATCH  | `/company-variable/:id`       | Atualizar variável          |
| DELETE | `/company-variable/:id`       | Remover variável            |
| POST   | `/company-variable/:id/image` | Upload de imagem            |

**Modelo de campo:** `{ key, value, type: 'TEXT' | 'URL' | 'SECRET' }`

### Quarters & Boards

| Método | Endpoint                       | Descrição                 |
| ------ | ------------------------------ | ------------------------- |
| GET    | `/company/:companyId/quarters` | Trimestres e meses        |
| GET    | `/company/:companyId/roadmap`  | Roadmap                   |
| GET    | `/month/:monthId/board`        | Board Kanban do mês       |
| GET    | `/quarter/:id/report`          | Obter relatório           |
| POST   | `/quarter/:id/report`          | Salvar relatório          |
| POST   | `/quarter/:id/report/improve`  | Melhorar relatório com IA |

### Activities

| Método | Endpoint                   | Descrição                                                                |
| ------ | -------------------------- | ------------------------------------------------------------------------ |
| POST   | `/activity`                | Criar atividade                                                          |
| GET    | `/activity/:id`            | Detalhe da atividade                                                     |
| PATCH  | `/activity/:id`            | Atualizar atividade (inclui `monthId` para mover entre meses/trimestres) |
| DELETE | `/activity/:id`            | Remover atividade                                                        |
| POST   | `/activity/:id/attachment` | Upload de anexo                                                          |
| POST   | `/activity/:id/suggest`    | Sugestão com IA                                                          |

### Backlog

| Método | Endpoint                       | Descrição        |
| ------ | ------------------------------ | ---------------- |
| GET    | `/backlog/company/:companyId/` | Itens do backlog |

### Dashboard

| Método | Endpoint                                     | Descrição                    |
| ------ | -------------------------------------------- | ---------------------------- |
| GET    | `/dashboard/workspace`                       | Dados agregados do workspace |
| GET    | `/dashboard/company/:companyId`              | Métricas da empresa          |
| GET    | `/dashboard/company/:companyId/weekly-trend` | Tendência semanal            |

### Events

| Método | Endpoint                   | Descrição                         |
| ------ | -------------------------- | --------------------------------- |
| GET    | `/events`                  | Listar eventos (filtro start/end) |
| GET    | `/events/upcoming?limit=N` | Próximos eventos                  |
| GET    | `/events/:id`              | Detalhe                           |
| POST   | `/events`                  | Criar evento                      |
| PATCH  | `/events/:id`              | Atualizar                         |
| DELETE | `/events/:id`              | Remover                           |
| GET    | `/auth/google/link`        | URL OAuth Google Calendar         |

### Boards

| Método | Endpoint                  | Descrição                          |
| ------ | ------------------------- | ---------------------------------- |
| GET    | `/boards`                 | Listar metadados dos boards        |
| POST   | `/boards`                 | Criar board                        |
| GET    | `/boards/:id`             | Obter metadados                    |
| GET    | `/boards/:id/snapshot`    | Snapshot read-only do documento    |
| PATCH  | `/boards/:id`             | Atualizar título/thumbnail         |
| POST   | `/boards/:id/duplicate`   | Duplicar board e canvas            |
| DELETE | `/boards/:id`             | Remover board                      |
| POST   | `/boards/:id/thumbnail`   | Upload de thumbnail                |
| WS     | `/collab`                 | Documento Yjs (`name = boardId`)   |

### AI / Workspace Intelligence

| Método | Endpoint            | Descrição                              |
| ------ | ------------------- | -------------------------------------- |
| GET    | `/search/status`    | Status da indexação da empresa         |
| POST   | `/search`           | Busca global por embeddings            |
| POST   | `/search/reindex`   | Reindexação manual (ADMIN)             |
| POST   | `/copilot/ask`      | Pergunta ao workspace com fontes       |
| POST   | `/copilot/diagram`  | Gera diagrama estruturado              |
| POST   | `/copilot/improve`  | Reescreve/melhora texto                |
| POST   | `/copilot/roadmap`  | Gera e persiste roadmap mensal         |

### Share

| Método | Endpoint                 | Descrição                           |
| ------ | ------------------------ | ----------------------------------- |
| GET    | `/share`                 | Listar links ativos                 |
| POST   | `/share/board/:boardId`  | Criar link público de board         |
| POST   | `/share/roadmap/:year`   | Criar link público de roadmap anual |
| DELETE | `/share/:token`          | Revogar link público                |
| GET    | `/public/board/:token`   | Board público read-only             |
| GET    | `/public/roadmap/:token` | Roadmap público read-only           |

Rotas `/public/*` usam `publicApi`, sem `Authorization` nem `x-company-id`.

### Inbox

| Método | Endpoint              | Descrição                       |
| ------ | --------------------- | ------------------------------- |
| GET    | `/inbox`              | Listar notificações recentes    |
| GET    | `/inbox/unread-count` | Contador de não lidas           |
| PATCH  | `/inbox/:id/read`     | Marcar notificação como lida    |
| POST   | `/inbox/read-all`     | Marcar todas como lidas         |
| DELETE | `/inbox/:id`          | Dispensar/remover uma notificação |

### Collaboration

| Método | Endpoint                          | Descrição                         |
| ------ | --------------------------------- | --------------------------------- |
| GET    | `/comments?entityType=&entityId=` | Comentários de uma entidade       |
| POST   | `/comments`                       | Criar comentário                  |
| PATCH  | `/comments/:id`                   | Editar comentário do autor        |
| DELETE | `/comments/:id`                   | Remover comentário do autor       |
| POST   | `/comments/:id/reactions`         | Adicionar reação                  |
| DELETE | `/comments/:id/reactions/:emoji`  | Remover reação                    |
| GET    | `/feed?take=50`                   | Timeline da empresa               |
| POST   | `/copilot/digest`                 | Digest IA do feed                 |

### Realtime & Presence

| Canal / Método | Endpoint      | Descrição                                                       |
| -------------- | ------------- | --------------------------------------------------------------- |
| socket.io      | `/socket.io`  | `notification:new`, `feed:new`, `comment:new`, `presence:update` |
| GET            | `/presence`   | Presença inicial `{ online: string[] }`                         |

### Export & Health

| Método | Endpoint                    | Descrição                    |
| ------ | --------------------------- | ---------------------------- |
| GET    | `/export/roadmap.pdf?year=` | Download do PDF do roadmap   |
| GET    | `/health`                   | Status público da API        |

### Notes

| Método | Endpoint         | Descrição                      |
| ------ | ---------------- | ------------------------------ |
| GET    | `/notes`         | Listar (folderId, search, tag) |
| GET    | `/notes/folders` | Pastas                         |
| GET    | `/notes/:id`     | Detalhe                        |
| POST   | `/notes`         | Criar                          |
| PATCH  | `/notes/:id`     | Atualizar                      |
| DELETE | `/notes/:id`     | Remover                        |
| POST   | `/notes/:id/pin` | Fixar/desfixar                 |

### Bug Report

| Método | Endpoint                                | Descrição                 |
| ------ | --------------------------------------- | ------------------------- |
| GET    | `/bug-report/public/company/:companyId` | Info pública da empresa   |
| POST   | `/bug-report/upload`                    | Enviar report (multipart) |
| GET    | `/bug-report/:reportId/status`          | Status público            |
| GET    | `/bug-report/by-company`                | Lista interna             |
| GET    | `/bug-report/:reportId/messages`        | Mensagens                 |
| POST   | `/bug-report/:reportId/messages`        | Enviar mensagem           |

### Repository

| Método | Endpoint                   | Descrição           |
| ------ | -------------------------- | ------------------- |
| GET    | `/repository`              | Listar repositórios |
| POST   | `/repository`              | Criar/vincular      |
| GET    | `/repository/:id/access`   | Permissões          |
| POST   | `/repository/:id/access`   | Conceder acesso     |
| GET    | `/repository/:id/branches` | Branches            |
| GET    | `/repository/:id/tree`     | Árvore de arquivos  |
| GET    | `/repository/:id/file`     | Conteúdo de arquivo |
| GET    | `/repository/:id/pulls`    | Pull requests       |
| POST   | `/repository/:id/pulls`    | Criar PR            |
| GET    | `/repository/:id/clone`    | URL de clone        |

### GitHub Connection

| Método | Endpoint                                 | Descrição           |
| ------ | ---------------------------------------- | ------------------- |
| GET    | `/github-connection`                     | Conexões existentes |
| POST   | `/github-connection`                     | Nova conexão        |
| GET    | `/github-connection/:id/available-repos` | Repos disponíveis   |

### Tickets

| Método | Endpoint  | Descrição      |
| ------ | --------- | -------------- |
| GET    | `/ticket` | Listar tickets |
| POST   | `/ticket` | Criar ticket   |

### Notifications

| Método | Endpoint                                      | Descrição                  |
| ------ | --------------------------------------------- | -------------------------- |
| GET    | `/notifications/companies`                    | Config por empresa         |
| POST   | `/notifications/companies/:id/discord`        | Configurar webhook Discord |
| POST   | `/notifications/companies/:id/discord/test`   | Testar webhook             |
| POST   | `/notifications/companies/:id/discord/toggle` | Ativar/desativar           |

### Import

| Método | Endpoint           | Descrição                        |
| ------ | ------------------ | -------------------------------- |
| POST   | `/import/jira-xml` | Importar XML do Jira (multipart) |

---

## Composables ↔ Services

Mapeamento entre composables Vue Query e serviços:

| Composable              | Service             | Query Key                    |
| ----------------------- | ------------------- | ---------------------------- |
| `useDashboardMetrics`   | `dashboard-service` | `['metrics', companyId]`     |
| `useWorkspaceDashboard` | `dashboard-service` | `['workspace']`              |
| `useBacklog`            | `backlog-service`   | `['backlog', companyId]`     |
| `useCompanyBoards`      | `quarters-service`  | `['boards', monthId]`        |
| `useCompanyQuarters`    | `quarters-service`  | `['quarters', companyId]`    |
| `useNavQuarters`        | `quarters-service`  | `['navQuarters', companyId]` |
| `useUpcomingEvents`     | `events-service`    | `['upcomingEvents']`         |

## Stores ↔ Services

| Store             | Services usados                           |
| ----------------- | ----------------------------------------- |
| `workspaceStores` | `dashboard-service`, `companies-services` |
| `authStores`      | — (apenas `companyId` em memória)         |
| `uiStores`        | — (preferências locais)                   |

## Tratamento de erros

Padrão nos services com `handleRequest`:

```typescript
try {
  const response = await api.get(...)
  return response.data
} catch (error) {
  throw new Error(errorMessage)
}
```

Nas views, erros são exibidos via `useToast()`:

```typescript
const { success, error } = useToast()
error(error.response?.data?.message || 'Mensagem fallback')
```

## Autenticação nos requests

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ localStorage│────▶│  Interceptor │────▶│  API Backend│
│ token       │     │  Axios       │     │             │
│ activeCompany│    │              │     │             │
└─────────────┘     └──────────────┘     └─────────────┘
```

Rotas públicas de bug report **não** enviam token (formulário externo), mas a instância Axios ainda injeta headers se existirem.
