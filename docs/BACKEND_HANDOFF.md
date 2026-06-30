# Backend handoff — overhaul didático (develop)

O frontend do overhaul didático (ver [docs/specs/didactic-overhaul.md](specs/didactic-overhaul.md)) foi entregue **sem vibecoding**: nada chama endpoint inventado. Onde uma melhoria dependia do backend, o frontend ficou **defensivo** (funciona com o que existe) e a dependência foi registrada aqui. Esta é a lista do que o time de backend precisa **confirmar ou prover** para fechar 100%.

Legenda: **OK** = já funciona, sem ação · **C** = contrato a confirmar · **N** = endpoint/campo novo a prover.

| # | Item | Endpoint | O que falta | Tipo |
|---|------|----------|-------------|------|
| 1 | **Kanban — status** | `PATCH /activity/:id/status` `{ status }` | Já existe e está sendo usado (drag-drop persiste). Confirmar que retorna a atividade atualizada e aceita `TODO/IN_PROGRESS/IN_TESTING/DONE`. | OK / C |
| 2 | **Roadmap anual** | `GET /company/:id/roadmap` | O front consome e tolera 2 shapes: `{ quarters:[{ id,label,months:[…] }] }` **ou** `{ lanes\|areas, items\|activities, milestones }`. Confirmar **qual shape** o backend retorna e **se a timeline anual existe** (hoje, vazio/404 → empty state honesto). | C |
| 3 | **Roadmap — marcos/reviews** | (sem rota) | Marcos (milestones) e datas de review do timeline anual **não têm fonte** — não são renderizados até o backend prover. | N |
| 4 | **Notas — pin** | `POST /notes/:id/pin` (via `togglePin(id)`) | Confirmar que alterna e **persiste** `isPinned`, e que `GET /notes` retorna `isPinned` (para ordenar pinadas primeiro). | C |
| 5 | **Notas — sensação Notion** | `PATCH /notes/:id` | Para emoji/cor/capa por nota persistirem, o `PATCH /notes/:id` precisa aceitar `{ coverImage?, noteColor?, emoji? }`. Hoje o service só tem `togglePin`. **A UI desses campos não foi construída** justamente porque depende disto (sem vibecoding). | N |
| 6 | **IA — texto** | `POST /quarter/:id/report/improve`, `POST /copilot/ask\|diagram\|roadmap\|improve` | O front já renderiza markdown sanitizado (marked + DOMPurify), seguro em qualquer caso. Confirmar **formato de saída** (markdown / HTML / plain) e se já vem sanitizado, para fechar o critério "contrato documentado". | C |
| 7 | **Notas — preview (otimização)** | `GET /notes` | Opcional: incluir `preview` (texto puro ~150 chars) para não derivar HTML no cliente. | N (opcional) |
| 8 | **Onboarding/shell multidevice** | `GET/PATCH /user/onboarding-flags`, `GET/PUT /user/shell-preference` | Opcional: hoje persiste em localStorage (funciona). Só necessário se quiser sincronizar entre dispositivos. | N (opcional) |
| 9 | **Canvas — flag server-side** | `GET /feature-flags { canvasEnabled }` | Opcional: hoje o Canvas é controlado por `VITE_CANVAS_ENABLED` (env, default off). | N (opcional) |

**Bloqueiam fechar 100% (itens não-opcionais):** #2/#3 (roadmap anual), #4 (pin persist), #5 (campos Notion), #6 (formato da IA). Os demais são otimizações.

> Detalhe completo de cada contrato na §12 da spec.
