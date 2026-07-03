# Time Tracking (estilo Clockify) — ferramenta global do workflow

**Status:** aprovada para implementação · **Escopo:** backend (workflow-api) + frontend (work-flow)
**Decisão de produto:** time tracking é ferramenta **do usuário**, não da empresa. Todo usuário
logado pode trackear tempo, independente de qual empresa está ativa — o vínculo com
empresa/tarefa é **opcional** por entrada.

## Regras (a "melhor regra")

1. **Dono da entrada é o usuário.** Cada `TimeEntry` pertence a um `userId`. O usuário vê,
   edita e apaga só as suas.
2. **Vínculo opcional.** Uma entrada pode referenciar `companyId` e/ou `activityId`
   (tarefa). Sem vínculo = tempo pessoal ("Geral").
3. **Um timer por usuário.** Iniciar um timer novo para automaticamente o anterior
   (comportamento Clockify). Timer rodando = `endedAt IS NULL`.
4. **Privacidade:** ADMIN/OWNER de uma empresa enxergam (relatório agregado) apenas as
   entradas **vinculadas àquela empresa** — nunca o tempo pessoal ou de outras empresas
   do usuário.
5. **Sem x-company-id nos endpoints pessoais.** O guard é só JWT; a empresa ativa não
   filtra o timer nem a lista pessoal (é cross-company por natureza). Só o relatório
   de empresa usa o header.
6. **Duração materializada no stop** (`durationSec`) para agregações baratas; fonte de
   verdade continua sendo `startedAt/endedAt`.
7. **Entrada manual permitida** (retroativa), com validação `endedAt > startedAt` e limite
   de 24h por entrada.

## Dados (migration aditiva — nada existente muda)

```prisma
model TimeEntry {
  id          String    @id @default(cuid())
  userId      String
  description String    @default("")
  startedAt   DateTime
  endedAt     DateTime?            // null = timer rodando
  durationSec Int?                 // materializado no stop
  companyId   String?              // vínculo opcional
  activityId  String?              // vínculo opcional (tarefa)
  billable    Boolean   @default(false)
  source      TimeEntrySource @default(TIMER)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  company  Company?  @relation(fields: [companyId], references: [id], onDelete: SetNull)
  activity Activity? @relation(fields: [activityId], references: [id], onDelete: SetNull)

  @@index([userId, startedAt])
  @@index([companyId, startedAt])
}

enum TimeEntrySource { TIMER MANUAL }
```

Único índice parcial garantindo 1 timer ativo por usuário (SQL puro na migration):
`CREATE UNIQUE INDEX "TimeEntry_one_running_per_user" ON "TimeEntry"("userId") WHERE "endedAt" IS NULL;`

## API (módulo novo `src/time-tracking`)

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/time/start` | Inicia timer `{description?, companyId?, activityId?, billable?}`. Para o anterior se houver. Valida membership quando `companyId` vier. |
| POST | `/time/stop` | Para o timer rodando; materializa `durationSec`. 404 se não há timer. |
| GET | `/time/current` | Timer rodando (ou `null`). |
| GET | `/time/entries?from&to&companyId&activityId` | Entradas do próprio usuário, desc por `startedAt`, paginação `take/skip`. |
| POST | `/time/entries` | Entrada manual (`startedAt`, `endedAt` obrigatórios). |
| PATCH | `/time/entries/:id` | Edita descrição/vínculos/horários (dono apenas). |
| DELETE | `/time/entries/:id` | Remove (dono apenas). |
| GET | `/time/summary?from&to` | Totais do usuário por dia + por empresa (alimenta a view). |
| GET | `/time/company-report?from&to` | ADMIN+ da empresa ativa (`x-company-id`): agregado por usuário/tarefa/dia **somente** de entradas vinculadas à empresa. |

Realtime: eventos `time:started` / `time:stopped` na room `user:<id>` (sincroniza widget
entre abas/dispositivos).

## Frontend

- **Widget global de timer** nos 3 shells (ao lado do CmdK/sino): mostra o timer rodando
  (descrição + cronômetro vivo) ou botão play. Clique abre popover: descrição, empresa
  (select das empresas do usuário + "Pessoal"), tarefa (autocomplete das tasks da empresa
  escolhida), start/stop. Componente `core/components/shells/shared/TimerWidget.vue`.
- **View `/time`** (`features/time/TimeTrackingView.vue`, item "Meu tempo" na seção pessoal
  do NavList): timer no topo + lista agrupada por dia (estilo Clockify: descrição, chips de
  empresa/tarefa, intervalo, duração, ações), totais do dia/semana, filtro por período e
  empresa, entrada manual.
- **Composable `useTimeTracking.ts`**: vue-query + socket para `time:*`; cronômetro local
  derivado de `startedAt` (nunca conta no cliente).
- Tokens/lucide/AppSelect; datas exibidas com utilitários de `utils/date.ts`.

## Fora de escopo (v2)

Tags, valores/hora faturável, exportação CSV, metas semanais, lembrete de timer esquecido.

## Critérios de aceite

1. Iniciar timer na empresa A, trocar para empresa B: widget continua mostrando o timer.
2. Duas abas: start numa, a outra atualiza sozinha (socket).
3. Start com timer já rodando: o anterior é parado com duração correta e o novo inicia.
4. CLIENT de uma empresa não acessa `/time/company-report` (403); ADMIN vê apenas entradas
   vinculadas à sua empresa.
5. Entrada manual com `endedAt <= startedAt` → 400.
6. Reload da página com timer rodando: widget retoma do `GET /time/current`.
