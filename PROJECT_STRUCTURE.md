# Work Flow - Sistema de Gestão de Tarefas

Sistema profissional de gestão de tarefas e projetos desenvolvido com Vue 3, TypeScript e Vuetify.

## 📁 Estrutura do Projeto

```
src/
├── core/                    # Componentes e tipos compartilhados
│   ├── components/          # Componentes globais (AppBar, NavigationDrawer)
│   └── types/              # Tipos TypeScript compartilhados
├── features/               # Features organizadas por domínio
│   ├── dashboard/          # Feature de Dashboard
│   │   ├── DashboardView.vue
│   │   └── index.ts
│   └── tasks/              # Feature de Tarefas
│       ├── components/     # Componentes específicos de tarefas
│       │   └── TaskForm.vue
│       ├── TasksView.vue
│       ├── useTasks.ts     # Composable de tarefas
│       └── index.ts
├── plugins/                # Plugins (Vuetify)
├── router/                 # Configuração de rotas
├── App.vue                 # Componente raiz
└── main.ts                 # Entry point

```

## 🚀 Tecnologias

- **Vue 3** - Framework progressivo
- **TypeScript** - Tipagem estática
- **Vuetify 3** - Framework de componentes Material Design
- **Vue Router** - Gerenciamento de rotas
- **Vite** - Build tool

## 📦 Instalação

```sh
npm install
```

## 🛠️ Desenvolvimento

```sh
npm run dev
```

## 🏗️ Build para Produção

```sh
npm run build
```

## 🧹 Lint

```sh
npm run lint
```

## 📋 Features

- ✅ Dashboard com estatísticas e atividades recentes
- ✅ Gestão de tarefas por empresa
- ✅ Filtros e organização de tarefas
- ✅ Sistema de prioridades e status
- ✅ Navegação lateral responsiva
- ✅ Tema claro/escuro

## 🎯 Arquitetura

O projeto segue uma arquitetura baseada em **features**, onde cada funcionalidade é isolada em seu próprio módulo com componentes, composables e views específicos. Os elementos compartilhados ficam na pasta `core`.

### Benefícios:
- 📦 Modularidade e escalabilidade
- 🔍 Fácil localização de código
- 🧪 Facilita testes unitários
- 🔄 Reutilização de código
- 👥 Melhor colaboração em equipe
