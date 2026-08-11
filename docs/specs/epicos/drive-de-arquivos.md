# Épico: Drive de Arquivos

**Status:** Em Implementação (P1 In Review)
**Autor:** Nicolas (via spec-driven)
**Criado em:** 2026-08-11
**Última atualização:** 2026-08-11
**Repos:** `workflow-api` (storage + API) e `work-flow` (UI)

---

## Visão

Uma área de arquivos no produto, no modelo Google Drive: cada usuário tem um
espaço **pessoal** e cada empresa tem um espaço **compartilhado**, com pastas,
upload, preview, download e (depois) compartilhamento granular e integração com
o Google Drive real.

O produto já usa a divisão pessoal/empresa em QR, Notas e Eventos
(`companyId String?` nullable = pessoal). O Drive estende essa convenção para
arquivos e, de quebra, cria a fundação de storage privado que a Decisão 13 do
`docs/EVOLUCAO.md` cobra: bucket privado, signed URL, path por dono.

## Por que agora

- Todo anexo hoje vai para bucket **público** com path previsível
  (`${Date.now()}-${filename}`, `workflow-api/src/supabase/supabase.service.ts:26`).
  Documento de cliente acessível a quem tiver o link é problema contratual.
- Imagem em nota/relatório é `window.prompt` de URL (não há upload). Avatar não
  tem upload. O Drive resolve a família inteira de lacunas de arquivo.
- O portal do cliente (wedge do produto) multiplica a superfície de arquivos que
  saem da empresa; o EVOLUCAO.md manda resolver storage privado **antes** dele.

## Partes (cada uma shippable sozinha)

| Parte | Spec | Status | Escopo |
|---|---|---|---|
| **P1 - Drive nativo** | [drive-p1-nativo.md](../2026/q3/q3-2/drive-p1-nativo.md) | In Review | Bucket privado + `DriveFile`/`DriveFolder` + área pessoal e por empresa + upload/preview/download/renomear/mover + UI com sidebar de escopos |
| **P2 - Integrações internas** | (a criar) | Ideia | Anexar a partir do Drive em tarefas e notas; upload de imagem no TipTap via Drive; anexos de atividade visíveis no Drive; extração de `TaskAttachments` para o primitivo compartilhado |
| **P3 - Compartilhamento** | (a criar) | Ideia | ACL por arquivo/pasta (molde `NoteAccess` VIEW/EDIT) + `ShareLink` revogável (`ShareResourceType` ganha `FILE`/`FOLDER`) |
| **P4 - Google Drive real** | (a criar) | Ideia | Conectar conta Google (OAuth já existe para Calendar), navegar e importar arquivos; exige scopes novos (`drive.file`), re-consent e verificação do app no Google |

Regra de fatiamento verificada: P1 funciona sem P2/P3/P4; P2 e P3 dependem só
de P1; P4 depende só de P1.

## Decisões transversais (valem para todas as partes)

1. **Storage privado no padrão OCR, nunca no padrão dos anexos.** Bucket via
   env, `public: false`, path canônico por dono, leitura exclusivamente por
   `createSignedUrl` (`workflow-api/src/ocr/ocr-storage.service.ts` é o molde).
2. **Pessoal = `companyId null` + `ownerId`; empresa = `companyId` preenchido.**
   Mesma convenção de `Note`, `Event` e QR.
3. **Permissão no padrão QR:** pessoal = só o dono; empresa = todo membro vê e
   sobe, quem subiu gerencia os próprios arquivos, ADMIN gerencia tudo
   (incluindo pastas de empresa).
4. **Um resolver de acesso único por recurso** (lição da spec
   `notas-p2-compartilhamento`): nenhum handler consulta `ownerId`/`companyId`
   direto no `where`; todos passam pelo resolver, que os testes cobrem.
5. **Migrations à mão, aditivas e idempotentes** (política do repo documentada
   em `prisma/migrations/20260810120000_.../migration.sql:1-16`; o `.env` local
   aponta para produção e há drift pendente).
6. **Namespace `/drive`** no front e na API (`/download` já é a landing do app
   desktop).

## Fora de escopo do épico (registrado para não esquecer)

- Quota de storage por empresa/usuário e cobrança por volume.
- Versionamento de arquivo.
- Antivírus / verificação de conteúdo por magic bytes.
- Migração do acervo de anexos existente para o bucket privado (é a execução
  plena da Decisão 13; ganha spec própria quando priorizada).

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-08-11 | 0.1 | Criação do épico com P1-P4 | Nicolas (via spec-driven) |
