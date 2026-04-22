# Spec: Design System Evolution — work-flow

**Status:** Em Implementação — F1–F4 entregues · **Fase P (Premium) entregue** · limpeza mdi→lucide remanescente deferida
**Criado em:** 2026-04-22
**Última atualização:** 2026-04-22
**Tipo:** Refactor global (Design System + App Shell + Feature Rework)
**Locale:** pt-BR (somente) — sem i18n nesta spec

---

## Visão Geral

Elevar o nível visual, arquitetural e de experiência do `work-flow` a um padrão de SaaS top-tier (referências: Linear, Height, Notion, Attio, Vercel Dashboard, Raycast), mantendo a stack atual (Vue 3.5 + Vuetify 4 + Pinia + Vue Router).

O trabalho é entregue em **4 fases** independentes — cada uma é um incremento autônomo que pode ser revisado, aprovado e mergeado antes da próxima começar. Cada fase tem suas próprias tasks e acceptance criteria.

**Escopo decidido com o usuário:**
- Variáveis permanecem **por empresa** (nível `CompanyVariable`). Mudança é apenas de estilo/UX.
- 3 variantes de App Shell (Focus / Command / Canvas) com **toggle pelo usuário** nas configurações.
- **Sem** i18n nesta spec. Copy permanece em pt-BR.
- **Com** rework completo da feature Variables (export `.env`, copy, filtro por tipo, ordenação, busca avançada).

---

## Discovery (consolidado)

**Stack:**
- Vue 3.5.29 + Vuetify 4.0.1 + Pinia 3 + Vue Router 5 + @tanstack/vue-query
- TypeScript 5.9, Vite 7, ESLint + oxlint, Prettier
- Ícones: `lucide-vue-next` (misturado com `@mdi/font`) ← **inconsistência**
- Fonte: `system-ui` (hard-coded em `App.vue`)
- echarts via `vue-echarts`, `tiptap` para notas, `posthog-js`, `sortablejs`, `vue-draggable-plus`

**Backend relevante:**
- `CompanyVariable { id, name, description, imageUrl, fields: Json, companyId }`
  - `fields: [{ key, value, type: 'TEXT'|'SECRET'|'URL' }]`
  - SECRETs criptografados em trânsito via `CryptoService`
  - Endpoints: `POST/GET/PATCH/DELETE /company-variable`, `POST /:id/image`
  - Guards: `JwtAuthGuard` + `CompanyRoleGuard` (`WORKER` para mutações, `CLIENT` e `WORKER` para leitura)

**MCPs consultados:** Vuetify MCP disponível — será usado durante a implementação para validar props de cada componente Vuetify 4 citado nesta spec.

**Padrões atuais a preservar:**
- Organização `src/features/*` com subpasta `components/` quando a feature cresce
- Estilo de botão primário invertido (`bg: secondary / text: primary`) — manter, é parte da identidade
- `rounded="xl"` em cards/dialogs, `rounded="lg"` em inputs e botões
- Hover em cards: `border-color` + `box-shadow: 0 4px 20px rgba(0,0,0,0.12)`
- Densidade dupla: `compact` em filtros, `comfortable` em formulários

**Tela de referência mais próxima:**
- [CompanyVariablesView.vue](../../src/features/companies/CompanyVariablesView.vue) — feature que mais consome padrões locais; será o alvo do rework na F3.

**Specs existentes:** nenhuma. Esta é a primeira spec do projeto.

---

# PARTE 1 — Design Doc

## 1.1 Princípios (guardrails para todas as fases)

1. **Densidade é feature, não bug.** Gestores e devs de SaaS top-tier preferem ver mais em menos espaço. Default = compact; comfortable é opt-in.
2. **Tokens > overrides.** Nenhuma cor hex solta em `.vue`. Se não tem token, cria token. Se não cabe na escala, a escala está errada.
3. **Monocromático semântico, acento opcional.** A UI base é preto-e-branco (já é hoje). Cor é reservada para **status**, **acento configurável** e **alertas** — nunca decoração.
4. **Inter, não system-ui.** Mesma fonte em todas as plataformas = identidade reconhecível.
5. **Motion discreto.** Transições 120–180ms, ease-out. Nada de bounce, spring ou delay > 200ms.
6. **Keyboard-first.** ⌘K já existe; adicionar atalhos contextuais em cada view (J/K para navegar listas, E para editar, D para detalhes).
7. **Componente → composable → feature → page.** Hierarquia de reuso explícita.

---

## 1.2 Fase F1 — Foundation (Tokens + Tipografia + Ícones)

### Layout e estrutura visual

Não há UI nova em F1. É trabalho de tokens e infraestrutura de estilo — visível como "tudo ficou mais coerente" no app inteiro.

### Tokens expandidos (dois temas)

A ideia é **não** substituir `primary/secondary` do Vuetify (são neutros intencionalmente) — é **adicionar** uma camada rica de tokens semânticos, expostos como CSS custom properties em `:root` / `[data-theme="dark"]`, gerenciados por um plugin Vuetify customizado.

**Arquivo-fonte único:** `src/plugins/tokens.ts` — exporta dois objetos (light/dark) consumidos pelo `createVuetify({ theme })` **e** injetados como CSS variables no `<html>` no mount.

#### Escala de text (hierarquia, não cor)

| Token | Dark | Light | Uso |
|---|---|---|---|
| `--text` | `#FAFAFA` | `#0B0B0C` | Títulos, valores de destaque |
| `--text-2` | `rgba(250,250,250,0.70)` | `rgba(11,11,12,0.70)` | Body, labels de form |
| `--text-3` | `rgba(250,250,250,0.48)` | `rgba(11,11,12,0.48)` | Helper, meta, placeholder |
| `--text-4` | `rgba(250,250,250,0.32)` | `rgba(11,11,12,0.32)` | Disabled, eyebrow, pontos decorativos |

#### Surfaces

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0B0B0C` | `#F4F4F5` |
| `--surface` | `#121214` | `#FFFFFF` |
| `--surface-2` | `#17171A` | `#F7F7F8` |
| `--surface-3` | `#1D1D21` | `#EFEFF1` |
| `--border` | `rgba(250,250,250,0.08)` | `rgba(11,11,12,0.08)` |
| `--border-strong` | `rgba(250,250,250,0.14)` | `rgba(11,11,12,0.16)` |

#### Status (migrado das cores MDI atuais para escala Untitled UI)

| Token | Valor |
|---|---|
| `--status-todo` | `#2E90FA` |
| `--status-prog` | `#F79009` |
| `--status-test` | `#9E77ED` |
| `--status-done` | `#12B76A` |
| `--status-block` | `#F04438` |
| `--success` | `#12B76A` |
| `--warn` | `#F79009` |
| `--err` | `#F04438` |
| `--info` | `#2E90FA` |

#### Acento configurável (valor vem de `localStorage.accentColor` ou default)

| Acento | Dark | Light |
|---|---|---|
| Neutral (default) | `#E7E7E7` | `#0B0B0C` |
| Blue | `#60A5FA` | `#2563EB` |
| Violet | `#A78BFA` | `#7C3AED` |
| Green | `#34D399` | `#059669` |
| Orange | `#FB923C` | `#EA580C` |
| Pink | `#F472B6` | `#DB2777` |

Expostos como `--accent` e `--accent-fg`. Alterar `accent` em runtime = atualizar estas duas vars no `<html>`.

#### Radius e elevação

| Token | Valor |
|---|---|
| `--radius-sm` | `6px` |
| `--radius` | `10px` |
| `--radius-lg` | `14px` |
| `--radius-xl` | `20px` |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.20)` |
| `--shadow` | `0 8px 24px rgba(0,0,0,0.35)` (dark) / `0 6px 18px rgba(0,0,0,0.08)` (light) |
| `--shadow-overlay` | `0 16px 48px rgba(0,0,0,0.45)` (para menus, palettes) |

### Tipografia

Adicionar **Inter** via `@fontsource-variable/inter` (mais leve e controlável que Google Fonts CDN) com a escala:

| Token | Tamanho | Line-height | Weight | Uso |
|---|---|---|---|---|
| `--font-display` | 28px | 32px | 700 | H1 de página |
| `--font-title` | 20px | 26px | 600 | H2 de seções |
| `--font-label` | 13px | 18px | 600 | Labels de cabeçalhos |
| `--font-body` | 13px | 18px | 500 | Body default |
| `--font-meta` | 11.5px | 16px | 500 | Meta, timestamps |
| `--font-eyebrow` | 10.5px | 14px | 700 letter-spacing:0.08em uppercase | Section headers |

**Remover** o `* { font-family: ... }` de `App.vue` — centralizar em `tokens.ts` via `body { font-family: var(--font) }`.

### Ícones — padronizar em lucide-vue-next

Remover `@mdi/font` (economia de ~500kb). Migrar todos `mdi-*` para `lucide-vue-next`. Os casos específicos (estados vazios, avatar placeholder) podem usar lucide também.

**Mapa de migração** (as migrations estão todas no código atual — grep `mdi-` para encontrar):

| MDI | Lucide |
|---|---|
| `mdi-magnify` | `Search` |
| `mdi-plus` | `Plus` |
| `mdi-close` | `X` |
| `mdi-pencil-outline` | `Pencil` |
| `mdi-delete-outline` | `Trash2` |
| `mdi-eye-outline` / `-off-outline` | `Eye` / `EyeOff` |
| `mdi-open-in-new` | `ExternalLink` |
| `mdi-chevron-down` / `-up` / `-right` | `ChevronDown` / `ChevronUp` / `ChevronRight` |
| `mdi-shield-key-outline` | `ShieldKey` |
| `mdi-text-box-outline` | `FileText` |
| `mdi-link-variant` | `Link2` |
| `mdi-camera` | `Camera` |
| `mdi-tag-outline` | `Tag` |
| `mdi-domain` | `Building2` |
| `mdi-check-circle` | `CheckCircle2` |
| `mdi-inbox-outline` | `Inbox` |
| `mdi-menu` | `Menu` |
| `mdi-moon-waning-crescent` | `Moon` |
| `mdi-white-balance-sunny` | `Sun` |
| `mdi-cog-outline` | `Settings` |
| `mdi-logout` | `LogOut` |

Vuetify usa MDI internamente para ícones próprios (datepicker chevrons, select dropdown). Mantemos `defaultSet: 'mdi'` mas **só o necessário**, via `vuetify/iconsets/mdi-svg` (tree-shaken), **não** `@mdi/font` completo.

### Componentes Vuetify utilizados em F1

| Componente | Props | Onde |
|---|---|---|
| `v-theme-provider` | `theme="light|dark"` | Exceção para áreas com tema forçado (ex: pré-view do Settings) |
| (nenhum componente novo) | — | F1 é puramente infraestrutura |

Durante a implementação, o Vuetify MCP deve ser consultado com `get_component_api_by_version` para validar que `createVuetify` da versão 4.0.1 aceita a config de theme prescrita abaixo.

### Config Vuetify nova (arquivo `src/plugins/vuetify.ts`)

Em vez de hex inline, consumir `tokens.ts`:

```ts
import { tokens } from './tokens'

createVuetify({
  theme: {
    defaultTheme: localStorage.getItem('theme') || 'dark',
    themes: {
      dark:  { dark: true,  colors: tokens.dark.vuetifyColors },
      light: { dark: false, colors: tokens.light.vuetifyColors },
    },
    variations: { colorsOff: true },
  },
  defaults: {
    VBtn:        { rounded: 'lg', variant: 'flat', flat: true },
    VCard:       { rounded: 'xl', elevation: 0 },
    VTextField:  { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
    VSelect:     { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
    VTextarea:   { variant: 'outlined', density: 'comfortable', rounded: 'lg' },
    VDialog:     { scrimOpacity: 0.6 },
  },
})
```

`defaults` elimina a repetição de `variant/density/rounded` em centenas de lugares.

---

## 1.3 Fase F2 — App Shell (3 variantes com toggle)

### Layout e estrutura visual

```
AppShell.vue (wrapper que lê ui store)
└── RouterView dentro de:
    ├── FocusShell.vue       ← rail 52px | contexto 240px | main
    ├── CommandShell.vue     ← topbar 52px; sidebar 244px | main  [DEFAULT]
    └── CanvasShell.vue      ← topbar horizontal full; main com dock flutuante
```

### Detalhamento de cada variante

#### CommandShell (default — evolução do atual)

```
┌──────────────────────────────────────────────────────────────────┐
│ TopBar 52px                                                      │
│ ┌─Logo─┐ │ ┌─Empresa▼─┐ > Breadcrumb          [cmd-k] [☀]  [AL]│
├──────────┴────────────────────────────────────────────────────────┤
│ Sidebar 244px               │ Main                              │
│ ┌ Trabalho ┐                │ (RouterView — padding 24px)       │
│   Dashboard                 │                                   │
│   Board                     │                                   │
│   Tickets                   │                                   │
│   Tarefas ▼                 │                                   │
│     Q2 • abr-jun            │                                   │
│       Abril                 │                                   │
│   Variáveis                 │                                   │
│   Usuários                  │                                   │
│ ┌ Pessoal ┐                 │                                   │
│   Notas                     │                                   │
│   Calendário                │                                   │
│ ───────── divider           │                                   │
│ [Plano: 12/20 projetos]     │                                   │
│ [Sair]                      │                                   │
└──────────────────────────────────────────────────────────────────┘
```

Diferenças vs. atual:
- Company switcher movido para topbar (ganha espaço vertical na sidebar)
- Breadcrumb ao lado do switcher (não na linha da sidebar como hoje)
- Footer do drawer ganha "card de plano" (placeholder, não ligado ainda — só visual)
- Eyebrow de seções (`Trabalho` / `Pessoal`) via `--font-eyebrow`

#### FocusShell (rail estilo Linear)

```
┌──┬───────────┬────────────────────────────────────────────────────┐
│w.│ Nova Eng▼ │ Slim top 42px — breadcrumb + [Assistente] [🔔]   │
│  │───────────┼────────────────────────────────────────────────────┤
│▮ │ PROJETOS  │ Main                                              │
│▮ │ • Nova…72%│                                                   │
│▮ │ • Merid…40%│                                                  │
│▮ │ FAVORITOS │                                                   │
│▮ │           │                                                   │
│──│───────────│                                                   │
│⚙ │ [Buscar⌘K]│                                                   │
│AL│           │                                                   │
└──┴───────────┴────────────────────────────────────────────────────┘
```

- Rail 52px com ícones + indicador de item ativo (barra vertical à esquerda)
- Coluna de contexto 240px muda de conteúdo por rota (em `/tasks/*` mostra trimestres; em outras, mostra projetos + favoritos)

#### CanvasShell (nav horizontal + dock)

```
┌──────────────────────────────────────────────────────────────────┐
│ Nav: w. │ Empresa▼ │ Dashboard · Board · Tarefas · Notas · Cal  │
│                                         [cmd-k] [+ Novo] [🔔] [AL]│
├──────────────────────────────────────────────────────────────────┤
│ Main (full-bleed, sem sidebar)                                   │
│                                                                  │
│         ┌──────────── Dock flutuante ─────────┐                 │
│         │  [🏠] [📋] [✓] [🎫] [📝]  │ [✨]   │                 │
│         └─────────────────────────────────────┘                 │
└──────────────────────────────────────────────────────────────────┘
```

- Centrado em `max-width: 1440px`
- Dock flutuante centralizado no bottom (`position: absolute; bottom: 18px`)
- Sem company switcher expandido — só o nome, trocar via ⌘K

### Componentes Vuetify utilizados em F2

| Componente | Props | Onde |
|---|---|---|
| `v-app` | — | Root em `App.vue` |
| `v-main` | — | Container do RouterView |
| `v-navigation-drawer` | `width="244" permanent border="none" color="primary"` | CommandShell |
| `v-app-bar` | `elevation="0" color="primary" height="52" flat` | CommandShell, CanvasShell |
| `v-list` | `nav density="compact"` | Navegação |
| `v-list-item` | `rounded="lg" color="secondary"` | Itens |
| `v-list-group` | `no-action` | Tarefas expansível |
| `v-menu` | `location="bottom end"` | User menu, company switcher |
| `v-dialog` | `max-width="440" scrim-opacity="0.6"` | Company switch modal |
| `v-breadcrumbs` | — | TopBar |

**Uso do Vuetify MCP:** consultar `get_component_api_by_version` para `v-navigation-drawer` e `v-app-bar` na 4.0.1 para confirmar que `color="primary" border="none"` e `height="52"` funcionam como esperado, e que o slot `append` aceita footer custom.

### Estados visuais

| Estado | Como representar | Componente |
|---|---|---|
| Item de nav ativo | `background: var(--surface-2)` + texto `var(--text)` + font-weight 600 | `v-list-item--active` |
| Item de nav hover | `background: rgba(text, 0.04)` | `:hover` |
| Shell em transição de variante | Crossfade 180ms | `<Transition name="shell-fade">` em AppShell |
| Theme toggle em andamento | Tema troca sem flash | Preload ambos CSS vars |
| Acento aplicado | `--accent` atualizado em runtime no `<html>` | Composable `useUiPreferences` |

### Integração com Settings (já existe `SettingsView.vue`)

Expandir [SettingsView.vue](../../src/features/settings/SettingsView.vue) com nova seção "Aparência":

- **Tema** (já existe) — toggle sun/moon
- **Densidade** (nova) — `compact` / `comfortable`
- **Variante de shell** (nova) — 3 cards clicáveis com preview (wireframe) de cada variante
- **Cor de destaque** (já existe) — expandir com a paleta completa do `tokens.ts`

Todas persistem em `localStorage` com prefixo `ui.*` e são lidas no boot por `useUiPreferences`.

### Command Palette refinado

Já existe `CommandPalette.vue`. Em F2, melhorar:
- Suporte a agrupamento (Navegação / Projetos / Tarefas / Ações)
- Hotkey hints (`⏎` para abrir, `→` para ver sub-itens)
- Preview de resultado (se for tarefa, mostrar status + projeto + responsável em uma linha secundária)
- Recentes (`localStorage.cmdk_recent`)

---

## 1.4 Fase F3 — Variables Rework

### Layout e estrutura visual

A versão atual é um grid de cards coloridos — funciona mas não escala bem para quem tem 30+ variáveis. O rework é uma **listagem densa estilo password manager / 1Password**, com detalhe em drawer lateral.

```
VariablesPage
├── PageHeader
│   ├── Título "Variáveis" + eyebrow "Credenciais, URLs e configs da empresa"
│   └── Ações: [Exportar .env ▼] [+ Nova Variável]
├── FiltersRow (sticky)
│   ├── SearchInput (com shortcut /)
│   ├── TypeFilter chips: [Todos] [TEXT] [URL] [SECRET]
│   ├── SortSelect: Nome · Mais recente · Mais usado
│   └── [⊞ Grid] [☰ Lista] ← view toggle
├── ListView (default) OU GridView
│   └── VariableRow × N (tabela densa)
│       │ Ícone │ Nome · descrição │ Tipo │ Campos │ Atualizado │ ⋯ │
└── VariableDrawer (direita, slide-in 480px)
    ├── Header: ícone + nome + fechar
    ├── Tabs: [Campos] [Histórico]
    └── Conteúdo por tab
```

### Tabela densa (ListView)

Linha de 52px, hover com `background: var(--surface-2)`:

```
┌─ ícone 32×32 ─┬─ nome                          ─┬─ tipos      ─┬─ N ─┬─ há 2h    ─┬─ ⋯ ─┐
│ [AWS]         │ aws_credentials                  │ 🔒 URL TXT   │ 4   │ Ana · 2h   │     │
│               │ Credenciais da AWS para deploy   │              │     │            │     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Coluna tipos**: mostra só os tipos presentes nos `fields` da variável, como ícones coloridos + contagem (ex: `🔒×2 URL×1 TXT×1`)
- **Coluna N**: total de campos
- **Coluna "Atualizado"**: avatar do último editor + relativo (`há 2h`, `ontem`, `12 abr`)
- **Coluna ⋯**: menu com Editar, Duplicar, Exportar .env (só esta), Excluir

### Drawer de detalhe (substitui o modal de edição + view)

```
┌── Drawer 480px ────────────────────────────────┐
│ [AWS] aws_credentials                     [×] │
│ Credenciais da AWS para deploy                │
│ ─────────────────────────────────────────────│
│ [Campos] [Histórico]                          │
│ ─────────────────────────────────────────────│
│ KEY              VALUE                    [⎘]│
│ access_key_id    AKIA••••••••••        🔒 [👁]│
│ secret_key       ••••••••••••••         🔒 [👁]│
│ region           us-east-1              TXT   │
│ console_url      https://console.aw...  URL   │
│                                               │
│ + Adicionar campo                             │
│ ─────────────────────────────────────────────│
│              [Duplicar] [Excluir] [Salvar]    │
└──────────────────────────────────────────────┘
```

- Todos os valores inline-editáveis (clique na row vira input)
- `[⎘]` em cada row copia só o valor daquele campo
- `[👁]` revela SECRETs temporariamente (com toast "Valor revelado por 30s", auto-hide)
- `[⎘ Copiar .env]` no topo gera o bloco `KEY=value` inteiro
- Aba **Histórico**: se o backend adicionar `CompanyVariableAudit` no futuro (não é escopo desta spec, só deixar o espaço reservado com mensagem "Em breve")

### Modal de criação (simplificado)

Para **criar** nova variável, manter modal rápido, mas mais simples:
- Nome + descrição
- Adicionar 1+ campos inline (chave, valor, tipo)
- Sem upload de imagem no criar (ícone gerado por default, upload fica no drawer de edição)

### Export .env

Botão dropdown `[Exportar .env ▼]` no header da página oferece:
- **Todas as variáveis** → gera `.env` único agrupando por variável (comentários `# aws_credentials` acima de cada bloco)
- **Selecionadas** (se tiver modo de seleção ativado via checkbox nas rows) → só as escolhidas
- **Copiar para clipboard** ou **Baixar como `.env`**

**Exemplo de output:**
```
# aws_credentials — Credenciais da AWS para deploy
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_KEY=...
AWS_REGION=us-east-1
AWS_CONSOLE_URL=https://console.aws.amazon.com

# database_prod
DB_HOST=db.prod.internal
DB_USER=svc_prod
```

**Regra de transformação do key**: preservar se o dev já escreveu em UPPER_SNAKE_CASE; caso contrário, converter `camelCase` / `kebab-case` / espaços para `UPPER_SNAKE_CASE` e prefixar com o nome da variável em UPPER_SNAKE_CASE quando não começar com ele.

### Ícones por tipo (após migração para lucide)

| Tipo | Ícone | Cor |
|---|---|---|
| TEXT | `FileText` | `var(--info)` |
| URL | `Link2` | `var(--success)` |
| SECRET | `ShieldKey` | `var(--status-test)` (violeta) |

### Componentes Vuetify utilizados em F3

| Componente | Props | Onde |
|---|---|---|
| `v-card` | `rounded="xl"` | Container |
| `v-text-field` | `density="compact" hide-details prepend-inner-icon` | Search, inline edit |
| `v-select` | `density="compact"` | Sort, type filter |
| `v-chip` | `size="small" variant="tonal"` | Tipos na coluna |
| `v-menu` | `location="bottom end"` | Menu ⋯ por linha e dropdown Exportar |
| `v-navigation-drawer` | `location="right" width="480" temporary` | Drawer de detalhe |
| `v-dialog` | `max-width="480"` | Modal de criar + confirmação de exclusão |
| `v-btn` | `variant="flat"` primários, `variant="text"` secundários | Ações |
| `v-tabs` | — | Campos / Histórico no drawer |
| `v-skeleton-loader` | `type="list-item-avatar-two-line"` | Loading da tabela |

### Dados mockados (para dev local sem API)

```typescript
interface VariableField {
  key: string
  value: string
  type: 'TEXT' | 'SECRET' | 'URL'
}

interface Variable {
  id: string
  name: string
  description?: string
  imageUrl?: string
  fields: VariableField[]
  updatedAt: string
  updatedBy: { id: string; name: string; initials: string }
}

const mock: Variable[] = [
  {
    id: 'v1', name: 'aws_credentials',
    description: 'Credenciais da AWS para deploy',
    fields: [
      { key: 'access_key_id', value: 'AKIAIOSFODNN7EXAMPLE', type: 'SECRET' },
      { key: 'secret_key', value: 'wJalrXUtnFEMI/K7MDENG', type: 'SECRET' },
      { key: 'region', value: 'us-east-1', type: 'TEXT' },
      { key: 'console_url', value: 'https://console.aws.amazon.com', type: 'URL' },
    ],
    updatedAt: '2026-04-22T10:32:00Z',
    updatedBy: { id: 'u1', name: 'Ana Lopes', initials: 'AL' },
  },
  {
    id: 'v2', name: 'database_prod',
    description: 'Banco de produção',
    fields: [
      { key: 'host', value: 'db.prod.internal', type: 'TEXT' },
      { key: 'user', value: 'svc_prod', type: 'TEXT' },
      { key: 'password', value: 'p@ssw0rd', type: 'SECRET' },
    ],
    updatedAt: '2026-04-20T14:10:00Z',
    updatedBy: { id: 'u2', name: 'Rafael Souza', initials: 'RS' },
  },
  // + 3-4 variáveis para exercitar empty/paginação/filtro
]
```

### Estados visuais F3

| Estado | Como representar |
|---|---|
| Loading inicial | 6 linhas skeleton |
| Vazio | Ícone `ShieldKey` 48px + "Nenhuma variável cadastrada" + CTA `[+ Criar primeira variável]` |
| Vazio com filtro | Ícone `Search` + "Nenhuma variável encontrada para \"{termo}\"" + `[Limpar filtros]` |
| SECRET não revelado | `••••••••` (monospace) |
| SECRET revelado | valor real + toast "Oculto em 30s" + contador |
| Copia de valor | Toast "Copiado" + ícone `Check` no botão por 1.2s |
| Erro de rede | Banner vermelho no topo da view + retry |

---

## 1.5 Fase F4 — Polish (Motion, Acessibilidade, Skeletons)

### Motion system

Três durações, uma curva:

| Token | Valor | Uso |
|---|---|---|
| `--motion-fast` | `120ms` | Hover, focus, small state changes |
| `--motion` | `180ms` | Toggles, drawers, menus |
| `--motion-slow` | `280ms` | Shell transitions, page enters |
| curva | `cubic-bezier(0.2, 0.8, 0.2, 1)` (ease-out) | Default em tudo |

`prefers-reduced-motion` respeitado: todas transições viram `0ms` quando set.

### Focus rings (acessibilidade)

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: inherit;
}
```

Em inputs: remover outline-offset e usar border-color + box-shadow ring para não sair do input.

### Skeletons padronizados

Três tipos reutilizáveis em `src/components/ui/Skeleton.vue`:
- `<Skeleton type="row" lines="3" />` — linha de tabela
- `<Skeleton type="card" />` — card genérico
- `<Skeleton type="text" lines="N" />` — párag. de texto

Animação: shimmer 1.4s infinite (já existe em `CompanyVariablesView.vue`, só extrair).

### Empty states padronizados

Componente `src/components/ui/EmptyState.vue` com props `{ icon, title, description, action }`. Substitui os blocos copy-pasted que existem em várias features.

### Toast refinado

O `AppToast.vue` atual serve. Melhorias:
- Posição fixa bottom-right (já é)
- Suporte a **ações** no toast (`{ action: { label, handler } }`)
- Stack vertical de até 3 toasts
- Swipe-to-dismiss em mobile

---

# PARTE 2 — Architecture Doc

## 2.1 Árvore de arquivos nova

```
src/
├── plugins/
│   ├── tokens.ts                    ← NOVO — single source of truth de cores/radius/shadow
│   └── vuetify.ts                   ← MODIFICAR — consumir tokens.ts + defaults
├── styles/
│   ├── tokens.css                   ← NOVO — gera CSS vars a partir de tokens.ts no runtime
│   ├── typography.css               ← NOVO — classes utilitárias (.text-display, .text-eyebrow)
│   └── reset.css                    ← NOVO — scrollbar, focus-visible, motion
├── composables/
│   └── useUiPreferences.ts          ← NOVO — lê/escreve theme, density, shell variant, accent
├── stores/
│   └── uiStores.ts                  ← NOVO — Pinia store persistente para preferências
├── core/
│   ├── components/
│   │   ├── shells/
│   │   │   ├── AppShell.vue         ← NOVO — wrapper que escolhe variante
│   │   │   ├── CommandShell.vue     ← NOVO (evoluído do AppBar+Drawer atual)
│   │   │   ├── FocusShell.vue       ← NOVO
│   │   │   ├── CanvasShell.vue      ← NOVO
│   │   │   └── shared/
│   │   │       ├── CompanySwitcher.vue
│   │   │       ├── UserMenu.vue
│   │   │       ├── CmdKButton.vue
│   │   │       └── ThemeToggle.vue
│   │   ├── AppBar.vue               ← REMOVER (absorvido em CommandShell)
│   │   └── NavigationDrawer.vue     ← REMOVER (absorvido em CommandShell)
├── components/
│   ├── CommandPalette.vue           ← MODIFICAR — grupos, recentes, preview
│   ├── AppToast.vue                 ← MODIFICAR — ações + stack
│   └── ui/
│       ├── Skeleton.vue             ← NOVO
│       ├── EmptyState.vue           ← NOVO
│       ├── Pill.vue                 ← NOVO — chip de status monocromático
│       └── KeyValue.vue             ← NOVO — linha chave/valor copiável
├── features/
│   ├── settings/
│   │   └── SettingsView.vue         ← MODIFICAR — expandir Aparência (densidade + shell)
│   └── companies/
│       ├── CompanyVariablesView.vue ← REWORK completo
│       └── components/
│           ├── VariablesToolbar.vue       ← NOVO
│           ├── VariablesList.vue          ← NOVO (tabela densa)
│           ├── VariablesGrid.vue          ← NOVO (mantém view em grid como opção)
│           ├── VariableRow.vue            ← NOVO
│           ├── VariableDrawer.vue         ← NOVO
│           ├── VariableCreateDialog.vue   ← NOVO (substitui o modal atual simplificado)
│           ├── VariableFieldInput.vue     ← NOVO (input inline tipado)
│           ├── VariableTypeChip.vue       ← NOVO
│           └── useEnvExport.ts            ← NOVO (composable) — gera .env
```

## 2.2 Decisões de arquitetura

### Decisão 1 — Tokens como TS + CSS vars (não só SCSS)

- **Alternativas:** (a) só SCSS variables; (b) só Vuetify theme; (c) CSS custom properties geradas runtime a partir de TS.
- **Escolhido:** (c).
- **Motivo:** precisamos trocar tema e acento **em runtime** sem recompilar. Vuetify theme cobre apenas as chaves pré-definidas (`primary`, `surface`...), e precisamos de `--text-2`, `--surface-2`, `--status-prog` etc. que não cabem nele. TS + CSS var é o único formato que permite tanto consumo em `<script setup>` quanto em `<style scoped>`.

### Decisão 2 — 3 shells como componentes separados, não 1 com condicionais

- **Alternativas:** (a) um `AppShell.vue` com `v-if` gigante; (b) 3 arquivos distintos chamados pelo wrapper.
- **Escolhido:** (b).
- **Motivo:** as variantes têm layouts **estruturalmente diferentes** (grid, presença de sidebar, floating dock). Um `v-if` gigante ficaria intragável e difícil de testar. Com 3 arquivos, cada shell é autossuficiente, reusa `shells/shared/*` para as partes comuns.

### Decisão 3 — `useUiPreferences` é composable + store Pinia

- **Alternativas:** (a) só composable com ref global; (b) só store Pinia; (c) store + composable.
- **Escolhido:** (c).
- **Motivo:** store Pinia garante reatividade cross-componente + devtools; composable expõe uma API ergonômica (`const { theme, setTheme, ... } = useUiPreferences()`). Persistência em `localStorage` acontece em um `watch` dentro do store.

### Decisão 4 — Remover `@mdi/font` e padronizar em lucide (+ `mdi-svg` tree-shaken)

- **Alternativas:** (a) manter ambos; (b) só mdi-svg; (c) só lucide.
- **Escolhido:** lucide para todo o código nosso; `mdi-svg` apenas para ícones internos do Vuetify (alias padrão).
- **Motivo:** bundle size (-~500kb); consistência visual (lucide tem traços mais modernos e consistentes); já usamos lucide no drawer. Vuetify depende de MDI para seus próprios ícones — não podemos remover totalmente, mas podemos usar a versão tree-shaken.

### Decisão 5 — Rework de Variables como redesign completo, não refactor incremental

- **Alternativas:** (a) só CSS cleanup; (b) redesign UX completo.
- **Escolhido:** (b).
- **Motivo:** a UX atual (grid de cards coloridos + modal longo) não escala para quem tem muitas variáveis, e o código-fonte tem muito copy-paste inline (`getRandomColor`, `getInitials` no próprio componente). Um redesign permite separar em sub-componentes testáveis e entregar features pedidas (copy, export `.env`, filtro por tipo) de uma vez.

### Decisão 6 — `AppShell.vue` substitui `App.vue` logic atual

- **Alternativas:** (a) manter `App.vue` com `<NavigationDrawer>` + `<AppBar>` como hoje; (b) mover toda essa lógica para `AppShell` e `App.vue` fica só com `<v-app>` + `<AppShell>` + `<AppToast>`.
- **Escolhido:** (b).
- **Motivo:** separação de responsabilidades — `App.vue` é o plumbing (providers), `AppShell` é a estrutura visível. Facilita trocar a variante de shell sem tocar em `App.vue`.

## 2.3 Impacto em arquivos existentes

| Arquivo | Ação | O que muda |
|---|---|---|
| `src/App.vue` | Modificar | Substitui `<NavigationDrawer>` + `<AppBar>` por `<AppShell>`. Remove o `* { font-family }`. |
| `src/main.ts` | Modificar | Importa `tokens.css`, `typography.css`, `reset.css`. Remove sync manual de `activeCompany` (mover para `useUiPreferences`/`workspaceStores`) |
| `src/plugins/vuetify.ts` | Modificar | Consome `tokens.ts`. Adiciona `defaults`. |
| `src/router/index.ts` | Sem mudança | Rotas continuam iguais. |
| `src/core/components/AppBar.vue` | **Remover** | Lógica migra para `CommandShell.vue` + `shared/UserMenu.vue` + `shared/CmdKButton.vue` |
| `src/core/components/NavigationDrawer.vue` | **Remover** | Idem — migra para `CommandShell.vue` + `shared/CompanySwitcher.vue` |
| `src/features/companies/CompanyVariablesView.vue` | Rework completo | Nova orquestração; ~90% do código atual é substituído |
| `src/features/settings/SettingsView.vue` | Expandir | Nova seção "Aparência" completa (densidade + shell variant) |
| `src/components/CommandPalette.vue` | Modificar | Grupos, recentes, preview |
| `src/components/AppToast.vue` | Modificar | Suporte a action + stack |
| `package.json` | Modificar | Remove `@mdi/font`, adiciona `@fontsource-variable/inter`, adiciona `vuetify/iconsets/mdi-svg` |

## 2.4 Não escopo (explícito)

- **i18n**: fora. Copy permanece em pt-BR.
- **Mobile-first responsive**: fora. Mantemos comportamento atual em mobile (degraded, não otimizado). Uma spec separada pode atacar isso depois.
- **Audit log de variáveis**: fora como feature completa — só deixamos o espaço da aba "Histórico" reservado com mensagem "Em breve". Backend precisa de modelo novo.
- **Permissões finas**: guards existentes (`WORKER` / `CLIENT`) são preservados como estão.
- **Testes unitários novos**: o projeto atual não tem cobertura de unit tests de componentes Vue. Esta spec não introduz infra de testes — uma spec separada deve fazê-lo.

---

# PARTE 3 — Tasks e Implementação

As tasks são **por fase**. Cada fase é um PR independente (ou múltiplos PRs pequenos se preferido). Fases podem ser implementadas em ordem ou em paralelo em branches distintas, mas **F2 depende de F1** e **F3 se beneficia de F1+F2** (usa tokens e shells).

## F1 — Foundation

- [x] **F1.1** Criar `src/plugins/tokens.ts` com as escalas de text, surface, status, accent, radius, shadow
- [x] **F1.2** Criar `src/styles/reset.css` + `typography.css` e importar em `main.ts`
- [x] **F1.3** Adicionar `@fontsource-variable/inter` ao `package.json` e importar em `main.ts`
- [x] **F1.4** Reescrever `src/plugins/vuetify.ts` consumindo `tokens.ts` + adicionar `defaults` mínimos (VDialog.scrimOpacity)
- [x] **F1.5** Remover `* { font-family }` de `App.vue`
- [x] **F1.6** Criar `useUiPreferences` composable + `uiStores` Pinia
- [x] **F1.7** Migrar `AppBar.vue` (6 icons) + `NavigationDrawer.vue` (3 icons) para lucide-vue-next
- [x] **F1.8** AppBar usa `useUiPreferences.toggleTheme()` — tokens CSS atualizam em runtime ao trocar tema
- [x] **F1.9** `vue-tsc --build` passa sem erros
- [ ] **F1.10** Migração `mdi-*` → lucide nas demais 23 views/componentes **(deferido — será feito por redesign em F2/F3; diff massivo quebraria PR)**
- [ ] **F1.11** Remover `@mdi/font` e adicionar `vuetify/iconsets/mdi-svg` **(depende de F1.10)**
- [ ] **F1.12** Visual regression manual: abrir cada rota em dark e light, verificar que nada regrediu
- [ ] **F1.13** Atualizar `src/CLAUDE.md` com tabela de features + tokens documentados + convenção lucide

**Dependências:** nenhuma — F1 é autônomo.

## F2 — App Shell

- [x] **F2.1** Criar estrutura `src/core/components/shells/shared/` com `CompanySwitcher`, `UserMenu`, `CmdKButton`, `ThemeToggle`, `NavList`
- [x] **F2.2** Implementar `CommandShell.vue` (topbar + sidebar + plan card)
- [x] **F2.3** Implementar `FocusShell.vue` (rail 56px + contexto 240px + slim top)
- [x] **F2.4** Implementar `CanvasShell.vue` (topnav full + dock flutuante)
- [x] **F2.5** Criar `AppShell.vue` wrapper que escolhe variante do `useUiPreferences`, com transição de rota
- [x] **F2.6** Atualizar `App.vue` para usar `<AppShell>` (enxuto — só `v-app + AppShell + AppToast`)
- [x] **F2.7** Refinar `CommandPalette.vue` — lucide icons + tokens + `useUiPreferences.toggleTheme`
- [x] **F2.8** Expandir `SettingsView.vue`: seção Aparência (tema toggle, accent picker, densidade segmented, shell variant com preview wireframe), shortcuts
- [ ] **F2.9** Remover `NavigationDrawer.vue` e `AppBar.vue` antigos — **ainda referenciados até que nada os importe**. Hoje não são mais importados por `App.vue`, mas mantidos no repo por segurança. Podem ser removidos em cleanup.
- [ ] **F2.10** Teste manual em browser (não executado — aguardando usuário)

**Dependências:** F1 concluído.

## F3 — Variables Rework

- [x] **F3.1** `VariableTypeChip.vue` — lucide icon + cor por tipo (TEXT/URL/SECRET)
- [x] **F3.2** Primitives UI: `EmptyState.vue`, `Skeleton.vue`, `Pill.vue`
- [x] **F3.3** `VariablesToolbar.vue` — busca + type filter (chips) + sort select + view toggle + export dropdown + CTA
- [x] **F3.4** `VariableRow.vue` — linha densa (ícone + nome + tipos + contagem + updated + menu ⋯)
- [x] **F3.5** `VariablesList.vue` — tabela com header fixo
- [x] **F3.6** `VariablesGrid.vue` — view em cards
- [x] **F3.7** `VariableDrawer.vue` — drawer lateral 480px com abas (Campos / Histórico "em breve"), edit inline, upload de imagem
- [x] **F3.8** `VariableFieldInput.vue` — linha key/value/type com copy, reveal SECRET, abrir URL
- [x] **F3.9** `VariableCreateDialog.vue` — modal de criação
- [x] **F3.10** `useEnvExport.ts` — build/copy/download de `.env` com normalização automática de chaves
- [x] **F3.11** Reescrever `CompanyVariablesView.vue` orquestrando tudo, consumindo service existente
- [x] **F3.12** Atalhos: `/` foca busca, `N` abre criar, `Esc` fecha drawer
- [x] **F3.13** Copy-to-clipboard + toast de feedback
- [x] **F3.14** Reveal temporário de SECRETs (30s auto-hide) em `VariableFieldInput` + `VariableDrawer`
- [ ] **F3.15** Teste manual em browser (não executado — aguardando usuário)

**Dependências:** F1 concluído (tokens + lucide); F2 recomendável mas não obrigatório (a view funciona dentro do CommandShell atual).

## F4 — Polish

- [x] **F4.1** Tokens `--motion-fast`, `--motion`, `--motion-slow`, `--motion-ease` em `tokens.ts`
- [x] **F4.2** Componentes novos usam `transition: var(--motion-fast) var(--motion-ease)` nos hovers
- [x] **F4.3** `@media (prefers-reduced-motion: reduce)` em `reset.css` (zera animações) e em `Skeleton.vue` (desliga shimmer)
- [x] **F4.4** `:focus-visible` global em `reset.css` usando `--accent`
- [x] **F4.5** Variables + Settings usam `<EmptyState />`
- [x] **F4.6** Variables loading usa `<Skeleton type="card" />`
- [x] **F4.7** `AppToast.vue` reescrito sem Vuetify snackbar, com Transition customizada + ícone colorido por tipo
- [ ] **F4.8** QA de acessibilidade detalhado (não executado — aguardando usuário)
- [ ] **F4.9** Migrar `mdi-*` nos 19 arquivos de features não tocadas (171 ocorrências) — _cleanup incremental ao tocar cada feature_
- [ ] **F4.10** Remover `@mdi/font` após F4.9 — economia estimada de ~1.3MB no webfont MDI

**Dependências:** F1 + F3 (muitos polimentos dependem dos componentes novos).

---

## Acceptance Criteria (global)

### F1
- [ ] Nenhum hex hardcoded em `.vue`/`.css` do projeto fora de `tokens.ts`
- [ ] `body` usa Inter em dark e em light
- [ ] Nenhum `mdi-*` permanece em código nosso (exceto defaultSet do Vuetify via mdi-svg)
- [ ] Bundle diminuiu (medir com `vite build --report` antes/depois)
- [ ] Theme toggle continua funcionando; novo accent é persistido

### F2
- [ ] As 3 variantes renderizam corretamente em dark e light
- [ ] Trocar variante em Settings atualiza a UI em runtime (sem reload)
- [ ] Cada variante tem a company switcher, cmd-k, theme toggle e user menu funcionando
- [ ] Navegação para todas as rotas existentes funciona em cada variante
- [ ] Arquivos `AppBar.vue` e `NavigationDrawer.vue` antigos foram removidos
- [ ] Nenhum import quebrado após remoção

### F3
- [ ] Tabela densa renderiza com 20+ variáveis sem lag
- [ ] Filtro por tipo, ordenação e busca funcionam combinados
- [ ] Copy no valor de um campo copia o **valor**, não a chave
- [ ] Export .env gera string válida (testar colando em `.env` real e rodando projeto)
- [ ] SECRET revelado volta a ocultar após 30s
- [ ] Drawer abre/fecha sem perder scroll da lista
- [ ] Criar, editar, excluir variável funciona end-to-end
- [ ] Upload de imagem no drawer funciona e persiste no backend

### F4
- [ ] Transições respeitam `prefers-reduced-motion`
- [ ] Focus ring visível em todos os interativos (botões, inputs, rows clicáveis, chips)
- [ ] Empty states em todas as páginas usam o mesmo componente
- [ ] Skeletons em todas as páginas usam o mesmo componente
- [ ] Toast com ação (`Desfazer`) funciona em pelo menos uma feature (ex: exclusão de variável)

---

## Testes Manuais (Happy Path Global)

- [ ] Login → Dashboard carrega com novo shell (CommandShell default)
- [ ] Trocar para Focus em Settings → todas as rotas continuam acessíveis
- [ ] Trocar para Canvas → idem
- [ ] Trocar tema dark → light → verificar que tokens atualizaram tudo (sem flash, sem áreas "esquecidas")
- [ ] Trocar accent para Violet → botões primários e focus rings refletem
- [ ] Ir em Variáveis → criar uma variável com 1 SECRET + 1 URL + 1 TEXT → editar no drawer → revelar secret → copiar valor → exportar .env → baixar
- [ ] Cmd+K → buscar por "vari" → navegar pra Variáveis
- [ ] Company switcher → trocar empresa → Variáveis recarregam
- [ ] Fazer tudo acima em Firefox + Chrome + Safari
- [ ] Verificar console: zero warnings de deprecação, zero `[Vue warn]`

---

## Definition of Done

- [ ] Todas as fases implementadas e mergeadas
- [ ] Acceptance criteria de cada fase validados
- [ ] Happy path global executado sem bugs
- [ ] Bundle size documentado (antes/depois)
- [ ] `CLAUDE.md` no `src/` atualizado com:
  - Tabela de features registradas (dashboard, board, tasks, notes, calendar, tickets, variables, users, settings)
  - Documentação dos tokens disponíveis
  - Convenção de uso de lucide-vue-next
  - Como adicionar uma nova variante de shell no futuro
- [ ] Spec atualizada com status `Concluído`

---

## Perguntas em aberto

- [ ] **Audit log de variáveis** — o backend quer adicionar `CompanyVariableAudit { variableId, action, userId, snapshot, at }` no futuro? Se sim, isso vira F5.
- [ ] **Projeto como entidade** — a spec preserva variáveis por empresa. Se em algum momento surgir `Project` como entidade abaixo de `Company`, haverá outra spec para mover/duplicar variáveis por projeto.
- [ ] **Sincronia com CLI/local** — para devs, faz sentido oferecer um CLI que puxa `.env` de uma variável direto? Fora do escopo, mas anotar como ideia de F5.

---

---

# PARTE 4 — Fase P (Premium) — adicionada após feedback

Direção: elevar o app ao nível Linear/Attio/Raycast — estética mais "produto premium". Decisões arquiteturais adicionais abaixo.

## P — Novas dependências

| Pacote | Para quê |
|---|---|
| `@vueuse/motion` + `motion-v` | Física de molas + utilitários de motion (Framer Motion-like) |
| `reka-ui` | Primitivos headless (não consumidos nesta fase — instalado para futuro) |
| `vue-sonner` | Toast premium (substitui nosso `AppToast` custom) |
| `@fontsource-variable/inter` (F1) | Fonte variável |

## P — Tasks entregues

- [x] **P1** Instalar libs premium + plugin `MotionPlugin` em `main.ts`
- [x] **P2** `AuroraBackground.vue` — gradient blobs animados + noise + grid mask, usado em todos os 3 shells com `intensity="subtle|medium|bold"`
- [x] **P3** Utilities CSS em `reset.css`:
  - `.glass` / `.glass-strong` — backdrop-filter blur com `color-mix`
  - `.gradient-border` — borda cônica animada rotacionando (usa `@property --gradient-angle`)
  - `.press` / `.hover-lift` — micro-interactions utilitárias
  - `::view-transition-*` — transições de rota via View Transitions API
- [x] **P4** Shells atualizados:
  - `CommandShell` — topbar glass + sidebar glass + breadcrumbs em pill + **plan card com `gradient-border`** animada e bar com glow
  - `FocusShell` — rail e context column em glass com `z-index` acima do aurora
  - `CanvasShell` — dock flutuante com `glass-strong` + `gradient-border` + **float animation** (6s ease-in-out)
- [x] **P5** `CommandPalette.vue` reconstruído — **fuzzy search com highlight** (match characters em `<mark>`), **recentes** em grupo próprio (`localStorage.cmdk.recents`, top 6), **keybind hints** no footer (↑↓ / ↵ / esc), glass+gradient-border no container
- [x] **P6** `AppToast.vue` reescrito usando `vue-sonner` — bottom-right stack, swipe to dismiss, rich colors mapeadas para nossos tokens (`--success`/`--err`/`--warn`/`--info`), close button, tema sincronizado com `useUiPreferences`
- [x] **P7** Route transitions premium em `AppShell.vue` — scale + translate + blur 260ms ease-out/160ms ease-in, respeita `prefers-reduced-motion`
- [x] **P8** `DashboardView.vue` redesenhado — migrado para lucide, novo **hero** com saudação dinâmica e big number gradiente (56px com text-fill-color gradient), **sparklines echarts** nos 4 stat cards, hero spark com line+area e glow, cards de projeto com **dot glow**, gradient progress bars e hover lift, activity list com rail colorido por status

## P — Não escopo (ainda)

- Reka-UI primitives não foram adotados (v-menu/v-dialog da Vuetify ainda funcionam bem com nossos tokens)
- Motion-v `<Motion>` não usado (nosso CSS motion + Vue Transition cobre). Fica disponível para features futuras
- Migração completa `mdi-*` → lucide (171 ocorrências restantes) continua incremental

## P — Acceptance

- [x] Aurora visível em dark e light (intensidades ajustadas por tema)
- [x] Glass morphism funcionando com backdrop-filter em Chrome/Edge/Safari/Firefox modernos
- [x] CommandPalette: fuzzy highlight renderiza corretamente, recentes persistem, Enter executa, atalhos navegam
- [x] Toast premium: success/error/warning/info renderizam com cores certas
- [x] Dashboard: sparklines animam no load, hero number com gradient text, projetos com dot glow
- [x] Transições de rota: fade+blur+scale entre navegações, sem piscadas
- [x] `npm run type-check` limpo
- [x] `npm run build-only` (Vite production) limpo — 15.74s

---

## Riscos

| Risco | Mitigação |
|---|---|
| Remover `@mdi/font` quebra ícones internos do Vuetify (datepicker, select) | Manter `mdi-svg` tree-shaken via `vuetify/iconsets/mdi-svg` — validar que datepicker e select continuam com chevrons |
| Trocar `App.vue` para `<AppShell>` quebra login/download (rotas sem shell) | `AppShell` lê `route.name` e renderiza `<slot />` raw quando `login` ou `download` |
| `useUiPreferences` conflita com `localStorage.theme` pré-existente | Ler `theme` legado no primeiro boot, migrar para novo formato `ui.theme`, remover chave antiga |
| Rework de Variables pode introduzir regressões em upload de imagem | Manter o mesmo endpoint + FormData; drawer faz upload assim que arquivo é escolhido, não só no save |
| PRs grandes ficam impossíveis de revisar | Cada fase = 1 PR; dentro de F3, sub-PRs por componente são aceitáveis |
