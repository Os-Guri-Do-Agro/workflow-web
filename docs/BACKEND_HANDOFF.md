# Backend handoff — overhaul didático (develop)

O backend entregou os contratos (consolidados em `docs/specs/didactic-overhaul-backend.md`, no repo do backend) e o **frontend já os consome**. Esta tabela é o estado final de cada dependência.

Legenda: **✅ Integrado** = front já consome o contrato real · **⏳ Adiado** = consciente, sem bloqueio · **🚫 Não wireado** = decisão de produto.

| # | Item | Estado no frontend |
|---|------|--------------------|
| 1 | **Kanban — status** (`PATCH /activity/:id/status`) | ✅ Integrado — drag-drop persiste com update otimista + revert/toast. Backend valida o enum e retorna a atividade. |
| 2 | **Roadmap anual** (`GET /company/:companyId/roadmap`, shape `quarters`) | ✅ Integrado — parse do shape `quarters` confirmado; empty state honesto quando vazio. |
| 3 | **Roadmap — marcos/reviews** (`milestones[]`, `type=MILESTONE\|REVIEW`, `quarterId?`) | ✅ Integrado — render de MILESTONE (losango) vs REVIEW (círculo) + faixa flutuante por data. Escrita (POST/PATCH/DELETE) tem rota mas **UI de criação/edição ainda não foi construída** (próximo passo, se quiser). |
| 4 | **Notas — pin** (`togglePin` → `POST /notes/:id/pin`) | ✅ Integrado — persiste `isPinned`; `GET /notes` ordena fixadas primeiro (server-side). |
| 5 | **Notas — emoji/cor/capa** (`POST`/`PATCH /notes/:id`) | ✅ Integrado — UI de emoji, cor e capa no editor + exibição nos cards; convenção `""`=limpa / omitir=mantém respeitada. |
| 6 | **IA — formato** | ✅ Integrado — `improveReport` é **HTML** → `renderHtml` (DOMPurify sanitize-only); `ask/improve/digest` markdown → `renderMarkdown`. Server não sanitiza → DOMPurify é a camada. |
| 7 | **Notas — preview** (`GET /notes.preview`) | ✅ Integrado — cards usam `note.preview` com fallback `stripHtmlPreview(content)`. |
| 8 | **Onboarding/shell multidevice** | ⏳ Adiado pelo backend (chaves não fixadas na §12). Front segue em localStorage (single-device, funciona). Retomar quando o contrato fechar. |
| 9 | **Canvas — flag server-side** (`GET /feature-flags { canvasEnabled }`, default **ligado**) | 🚫 Não wireado **de propósito**: o flag do backend vem ligado por padrão, e a decisão de produto é manter o Canvas **escondido**. O gate continua no frontend (`VITE_CANVAS_ENABLED`, default off). Para controle server-side sem reativar o Canvas, defina `CANVAS_ENABLED=false` no backend antes de ligar o consumo do endpoint. |

**Notas:**
- `docs/specs/roadmap-backend-contract.md` (neste repo) está **desatualizado** — descreve o shape antigo (`lanes`/`reviews[]`), sem `type`/`quarterId`. O front segue o contrato novo e tolera o legado por segurança. Vale atualizar esse doc.
- Tudo verificado com `vue-tsc` (type-check) + `vite build` verdes.
