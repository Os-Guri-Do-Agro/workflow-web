# 🚀 Guia Rápido - Nova Estrutura

## 📍 Como Adicionar Novas Features

### 1. Criar nova feature (exemplo: "projects")

```bash
mkdir src/features/projects
mkdir src/features/projects/components
```

### 2. Criar arquivos da feature

```
src/features/projects/
├── components/
│   └── ProjectForm.vue
├── ProjectsView.vue
├── useProjects.ts
└── index.ts
```

### 3. Exportar no index.ts

```typescript
export { useProjects } from './useProjects'
export { default as ProjectForm } from './components/ProjectForm.vue'
export { default as ProjectsView } from './ProjectsView.vue'
```

### 4. Usar imports com alias @

```typescript
import { useProjects } from '@/features/projects/useProjects'
import ProjectForm from '@/features/projects/components/ProjectForm.vue'
```

## 📦 Como Adicionar Componentes Globais

Componentes usados em múltiplas features vão em `core/components/`:

```
src/core/components/
├── AppBar.vue
├── NavigationDrawer.vue
└── NovoComponenteGlobal.vue  ← Adicionar aqui
```

## 🎯 Como Adicionar Novos Tipos

Tipos compartilhados vão em `core/types/`:

```typescript
// src/core/types/index.ts
export interface NovoTipo {
  id: string
  name: string
}
```

## 🔄 Padrão de Imports

### ✅ Correto (usar alias @)
```typescript
import { useTasks } from '@/features/tasks/useTasks'
import { Task } from '@/core/types'
import AppBar from '@/core/components/AppBar.vue'
```

### ❌ Evitar (imports relativos longos)
```typescript
import { useTasks } from '../../../features/tasks/useTasks'
import { Task } from '../../core/types'
```

## 📝 Convenções de Nomenclatura

- **Componentes**: PascalCase → `TaskForm.vue`, `AppBar.vue`
- **Composables**: camelCase com prefixo "use" → `useTasks.ts`, `useProjects.ts`
- **Views**: PascalCase com sufixo "View" → `TasksView.vue`, `DashboardView.vue`
- **Tipos**: PascalCase → `Task`, `Company`, `User`
- **Arquivos de índice**: sempre `index.ts`

## 🗂️ Onde Colocar Cada Coisa

| Tipo | Localização | Exemplo |
|------|-------------|---------|
| Componente global | `core/components/` | AppBar.vue |
| Componente específico | `features/{feature}/components/` | TaskForm.vue |
| Composable | `features/{feature}/` | useTasks.ts |
| View/Page | `features/{feature}/` | TasksView.vue |
| Tipo compartilhado | `core/types/` | Task, Company |
| Plugin | `plugins/` | vuetify.ts |
| Rota | `router/` | index.ts |

## ✨ Dicas

1. **Mantenha features isoladas**: Evite dependências entre features
2. **Use o core para compartilhar**: Elementos usados por múltiplas features
3. **Um arquivo index.ts por feature**: Facilita imports
4. **Componentes próximos ao uso**: Componentes específicos dentro da feature
5. **Tipos bem definidos**: Use TypeScript para maior segurança
