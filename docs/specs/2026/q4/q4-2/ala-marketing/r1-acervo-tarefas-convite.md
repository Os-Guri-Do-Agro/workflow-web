# Ala Marketing, rodada R1: Acervo, envios, tarefa do Nevo, convite e UTM

**Status:** Em implementação (06/11/2026)
**Épico:** [ala-marketing](../../../../epicos/ala-marketing.md) · **Depois de:** [M1](m1-aprovacao-calendario.md), [M2](m2-rastreio-estrategia.md), [M3](m3-dinheiro-eventos.md)
**Repos:** `work-flow` (front) e `workflow-api` (API)
**Migration:** `20261107120000_ala_marketing_r1`, só aditiva: 4 tabelas novas e nenhuma coluna em tabela existente

## Origem

Em 06/11/2026 o Nicolas usou a ala em produção e trouxe seis pontos:
1. convidar quem já está no Nevo sem digitar e-mail;
2. "como eu ou meu colaborador vamos subir as fotos e tudo mais da melhor forma possível?";
3. "tem coisa usando HTML ainda", com a UTM para verificar;
4. card ligado a uma tarefa do Nevo, puxando só as Em andamento das empresas ativas do grupo, e a tarefa andando no board quando o card é aprovado;
5. o link grande da UTM "não deu certo" (o curto deu);
6. "não tem nada de QR".

A decisão dele foi esta: "entra o acervo sim, faz o que é de melhor, não quero economizar em qualidade em nada".

## O que já existe e onde estava o atrito

| Ponto | Hoje | Atrito |
|---|---|---|
| Convite | E-mail, nome, papel, marcas e rótulo. Conta existente só ganha o papel | Quem já está no Nevo precisa ter o e-mail digitado; não há lista de colegas |
| Arquivos | Cada lugar tem o seu upload (versão do card, foto da ativação, nota, orçamento), com upload assinado direto ao bucket e prévia RGB | Não há lugar para material da marca (logo, foto de produto, foto de pet, bruto). Não cola com Ctrl+V nem arrasta pasta. Fechar o diálogo perde o envio. Vídeo grande sobe numa tacada só |
| Campos | Cerca de 80 `<select>` nativos e checkboxes nativos na ala | O resto do Nevo usa `AppSelect` (busca, visual do sistema) e `TagInput` |
| Tarefa | Card e tarefa vivem separados | Quem produz atualiza os dois à mão |
| URL final da UTM | Mostrada como "URL final" | Ela não passa pelo Nevo, então nenhum clique nela é contado. A tela não dizia isso |
| QR | Só nasce clicando em "Criar QR Code", no fim do painel | Ninguém acha; parece que não existe |

## Decisões

- **D1. O Acervo é por marca, com uma área "Geral do grupo".**
  - Pasta e item têm `companyId`; nulo quer dizer "Geral do grupo", que vale para todas as marcas.
  - Quem tem restrição de marca vê as suas marcas mais a Geral.
  - Na Geral só escreve Admin ou Dono sem restrição de marca.
- **D2. O arquivo do Acervo é um `MarketingAsset` comum.** Mesmo bucket, prévia, hash e regras de download. O `MarketingLibraryItem` só dá pasta, título, etiquetas, nota e favorito.
- **D3. Usar do Acervo copia, nunca referencia.**
  - "Escolher do acervo" na versão do card copia o objeto no storage (cópia do lado do servidor, sem baixar) para um asset novo da versão, com o mesmo sha256.
  - "Mandar para o acervo" a partir de uma versão ou foto de ativação faz o mesmo no sentido inverso.
  - Apagar de um lado nunca quebra o outro, e o original intocado segue garantido.
  - O uso fica em `MarketingLibraryUsage`, que alimenta o "Usado em".
- **D4. Um motor de envio só para a ala inteira.**
  - É uma fila global, visível em qualquer tela da ala: bandeja "Envios", embaixo à direita.
  - Sobe 3 arquivos em paralelo, com progresso por arquivo, cancelar e tentar de novo.
  - Avisa ao fechar a aba se ainda há envio.
  - O hash é calculado fora da thread da tela (worker incremental) para vídeo grande não travar.
  - Entradas: arrastar arquivos ou pastas (a estrutura de pastas é recriada no Acervo), Ctrl+V de imagem e, no celular, "Tirar foto" e "Galeria".
  - Todos os uploads atuais da ala passam por esse motor: versão, foto de ativação, nota fiscal e orçamento.
- **D5. Upload retomável quando o storage aceitar.**
  - Arquivo acima de 6 MB sobe em partes, pelo TUS do Supabase com token de upload assinado, se a documentação atual confirmar o suporte.
  - Se não confirmar, fica o upload assinado atual com nova tentativa automática, e a tela explica o limite.
  - O teto por arquivo continua sendo o do plano (`MARKETING_MAX_FILE_BYTES`). Retomar não fura o plano.
- **D6. Mapa do card para a tarefa:**

  | Card | Tarefa |
  |---|---|
  | Ideia | não mexe |
  | Em produção | Em andamento |
  | Aguardando aprovação | Em teste |
  | Ajustes pedidos | Em andamento |
  | Aprovado, e daí em diante, inclusive a trilha da gráfica | Concluído |

  - Revisado fica de fora porque exige o checklist das três plataformas, que não existe para post.
  - O mapa vale ao ligar e a cada mudança de status do card.
  - A tarefa só anda se o status de destino for diferente do atual.
- **D7. A tarefa anda pelo servidor, com rastro.**
  - Quem mudou o card é o autor do movimento no histórico da tarefa (`ActivityLog`), e a mensagem diz "pela ala Marketing".
  - Usa o mesmo caminho do `updateStatus` (log, aviso aos responsáveis, realtime do board e limpeza do sinal de teste). Por isso funciona mesmo quando quem aprovou não é membro da empresa da tarefa.
  - Falha ao mover nunca bloqueia o card: fica em `lastSyncError` e aparece no card com "Tentar de novo".
- **D8. Quem liga a tarefa precisa ser membro da empresa dela.**
  - O seletor lista só tarefas **Em andamento** das empresas ligadas e ativas do grupo onde a pessoa tem `UserCompany`.
  - Começa pela marca do card, com busca por título.
  - No card, quem não é da empresa (o freelancer) vê só o título, o status e a empresa, sem link.
  - No painel da tarefa no Nevo aparece "Cards de marketing", com link para quem é da ala e tem a marca; os outros veem só a contagem.
  - Um card liga até 5 tarefas.
- **D9. Convite "Do Nevo".**
  - Lista quem já trabalha nas empresas do grupo (Admin restrito vê só as empresas das marcas dele), sem quem já está na ala.
  - Mostra foto, nome, e-mail e empresas, com busca.
  - Permite marcar várias pessoas, com papel, marcas e rótulo iguais para o lote.
  - O servidor confere que cada `userId` está no conjunto de candidatos; isso impede enumerar usuários do Nevo.
  - Quem entra recebe aviso no sino e no push, com link para a ala.
- **D10. UTM e QR.**
  - "Gerar QR Code" vem marcado ao criar UTM, e a criação com QR é atômica no servidor.
  - O QR sobe para o topo do painel, ao lado do link curto, com prévia, PNG e SVG.
  - A lista mostra a miniatura do QR.
  - "URL final" passa a se chamar "URL com UTM", com o aviso: "Não passa pelo Nevo, então não conta clique. Para divulgar, use o link curto ou o QR."
  - O link curto ganha o botão Abrir.
  - Na tela QR Codes do Nevo, o QR da ala aparece com o selo "Ala Marketing", só leitura, com "Abrir na ala".
- **D11. Visual do Nevo nos campos.**
  - Todo `<select>` da ala vira `AppSelect`. Fica nativo só onde houver motivo registrado em comentário.
  - Checkbox e campo de data seguem o padrão que o resto do Nevo usa.
  - Campo que salva sozinho volta ao valor anterior quando a API recusa.
- **D12. Os gaps abertos da auditoria entram nesta rodada:**
  - export e resumo do financeiro com teto e mensagem clara;
  - lista de ativações paginada (acima de 500);
  - painel inicial sem a requisição a mais;
  - selects que não voltavam ao valor (coberto pela D11).

## Partes e donos

| Parte | Dono | Arquivos que só ele mexe |
|---|---|---|
| P1. Acervo (API e tela) | agente R1-A | `src/marketing/library/**` (API), `features/marketing/library/**`, `views/MarketingLibraryView.vue`, a rota e o item de menu, o `copy` no `DriveStorageService` e no fake-storage |
| P2. Motor de envio | agente R1-B | `service/marketing/marketing-core.ts` (upload), `features/marketing/uploads/**`, `MarketingUploadVersionDialog.vue`, `ActivationPanel.vue`, `FinanceExpenseDialog.vue`, `FinanceExpensesTab.vue`, `QuotesPanel.vue`, o TUS no fake-storage |
| P3. Tarefa do Nevo | agente R1-C | `src/marketing/tasks/**` (API), a ligação no `cards` service, um método novo no `ActivityService`, `features/marketing/tasks/**`, a seção no `MarketingCardView.vue`, "Cards de marketing" no painel da tarefa |
| P4. Convite, UTM e QR, gaps | agente R1-D | `group/**` (candidatos e lote), `utm/**`, `features/qr/**` (selo), `finance/export`, `activations` (paginação), `MarketingHomeView`, `settings/SettingsTeam.vue` |
| P5. Campos com o visual do Nevo | agente R1-E, depois da junção de P1 a P4 | o resto de `features/marketing/**` |
| P6. Levantamento da M4 no app da PetJourney | agente de pesquisa (só leitura) | nenhum; vira a spec `m4-dados-do-app.md` |

O orquestrador junta tudo. A costura que cruza donos fica com ele: o botão "Escolher do acervo" no diálogo de versão e o "Mandar para o acervo" no visualizador de versão e na ativação.

## Contratos da API (novos)

Todas as rotas ficam em `/marketing/groups/:groupId/...`, atrás do `MarketingAccessGuard`.

**P1, Acervo (`library`)**
- `GET library/folders?companyId=` devolve a árvore com contagens. `POST library/folders` recebe `{companyId|null, parentId?, name}`. `PATCH library/folders/:id` recebe `{name?, parentId?}`, com checagem de ciclo e profundidade até 5. `DELETE library/folders/:id` devolve 409 se a pasta tiver conteúdo, a menos que venha `?mover=pai`.
- `GET library/items` aceita os filtros `companyId`, `folderId`, `q`, `tipo=imagem|video|pdf|outro`, `tag`, `enviadoPor`, `favoritos`, mais `cursor` e `limit` (até 100). Devolve os itens com URLs assinadas de prévia, dimensões, tamanho, etiquetas e `usageCount`.
- `POST library/uploads` recebe `{companyId|null, folderId?, files:[{name,size,mimeType,sha256,relativePath?}]}` e devolve, por arquivo, o ticket de upload (o fluxo atual de `requestUpload`). Avisa duplicata pelo sha256: `{duplicateOf:{itemId,title,folderPath}}`. O `relativePath` recria as subpastas.
- `POST library/items` recebe `{assetId, title?, tags?, folderId?, companyId|null}` e cria o item depois do confirm do asset.
- `PATCH library/items/:id`, `DELETE library/items/:id` (regra de `canDelete`) e `POST library/items/bulk` com `{ids, acao: mover|etiquetar|desetiquetar|favoritar|desfavoritar|apagar, folderId?, tags?}`.
- `GET library/items/:id/download` devolve a URL assinada do original. `POST library/zip` recebe `{ids}` (até 200 arquivos) e devolve o zip.
- `GET library/tags` devolve as etiquetas com contagem.
- `POST library/items/from-asset` recebe `{assetId, folderId?, companyId?, title?}` e faz o "Mandar para o acervo", por cópia.
- `POST cards/:cardId/versions/from-library` recebe `{itemIds[], note?}` e cria a versão nova pelo mesmo caminho do upload de versão: volta para Aguardando, avisa e move a tarefa. Grava `MarketingLibraryUsage`.

**P3, tarefas (`tasks`)**
- `GET tasks/candidates?companyId=&q=` lista as tarefas Em andamento que a pessoa pode ligar, conforme a D8.
- `GET cards/:cardId/tasks`, `POST cards/:cardId/tasks` com `{activityId}`, `DELETE cards/:cardId/tasks/:linkId` e `POST cards/:cardId/tasks/:linkId/sync` (tentar de novo).
- Fora do grupo: `GET /marketing/tasks/:activityId/cards`, com o usuário autenticado, devolve os cards ligados que ele pode ver, mais o total.

**P4, convite**
- `GET members/candidates?q=` (só Admin ou acima) devolve `[{userId,name,email,avatarUrl,companies:[...]}]`.
- `POST members` aceita, além do formato atual, `{userIds:[...] (até 20), role, brandIds?, title?}`.

## Critérios de aceite

**Acervo**
- [ ] O Editor arrasta uma pasta com subpastas e 30 fotos e o Acervo recria a árvore. A bandeja mostra o progresso de cada arquivo e dá para continuar usando a ala enquanto sobe.
- [ ] Ctrl+V de uma imagem copiada cai na pasta aberta. No celular, "Tirar foto" abre a câmera.
- [ ] O mesmo arquivo de novo avisa "já está no acervo em <pasta>", com "Manter os dois" e "Pular".
- [ ] "Escolher do acervo" no card cria a V2 com cópia de mesmo sha256. O card volta para Aguardando aprovação, e o item mostra "Usado em: <card>".
- [ ] Apagar o item do Acervo não apaga a versão do card, e vice-versa.
- [ ] O Editor restrito à marca A não vê nem baixa o item da marca B (inclusive por id na URL), e vê a Geral do grupo.
- [ ] O Visualizador vê, filtra e baixa, mas não sobe, não move e não apaga.
- [ ] Baixar 50 itens em zip funciona, e 201 itens dão uma mensagem clara.

**Envios**
- [ ] Fechar o diálogo da versão no meio do envio não cancela: a bandeja segue e o card recebe a versão ao terminar.
- [ ] A rede cai no meio de um arquivo grande: ele retoma de onde parou, ou tenta de novo sozinho na volta da rede.
- [ ] Fechar a aba com envio pendente pede confirmação.
- [ ] Hash de 300 MB não trava a tela.

**Tarefa**
- [ ] Ligar a tarefa Em andamento ao card Aguardando aprovação leva a tarefa para Em teste na hora. Aprovar leva para Concluído, e o board de quem está com a empresa aberta atualiza ao vivo.
- [ ] O histórico da tarefa mostra quem aprovou "pela ala Marketing".
- [ ] O freelancer sem empresa vê o nome da tarefa no card e não tem link.
- [ ] Uma tarefa apagada no Nevo some do card sem erro.
- [ ] Falha ao mover aparece no card com "Tentar de novo".

**Convite**
- [ ] O Admin marca 3 colegas na aba "Do Nevo" e todos entram com o papel escolhido e recebem o aviso.
- [ ] `userId` fora do conjunto de candidatos dá 403.

**UTM e QR**
- [ ] Criar uma UTM gera o QR junto, visível no topo do painel e na lista.
- [ ] A URL com UTM avisa que não conta clique.
- [ ] O QR da ala aparece na tela QR Codes com o selo, só leitura.

**Campos**
- [x] Nenhum `<select>` nativo na ala sem comentário de motivo.
- [x] Quando a API recusa, o campo volta ao valor anterior.

**Gaps**
- [ ] Export e resumo do financeiro acima do teto dão uma mensagem clara.
- [ ] Ativações acima de 500 paginam.
- [ ] O painel inicial faz uma requisição a menos.

**Produção**
- [ ] Sem a migration R1, a API sobe e a ala existente funciona. Acervo e tarefa respondem "indisponível", sem 500 em tela.

## Riscos

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | A tarefa anda sem o dono querer | O mapa é fixo e explícito (D6), só para frente ou de volta para Em andamento; o histórico da tarefa diz quem e por quê; desligar a tarefa é um clique |
| Alto | Vazamento entre marcas no Acervo (id adivinhado, zip, cópia) | Todo acesso passa por `brandOrGroupWhere`; roteiro de acesso cruzado por papel e por marca, inclusive em `from-asset`, `zip` e `download` |
| Médio | O TUS com token assinado não é suportado | D5 já tem a alternativa; o agente confirma na documentação atual antes de codar |
| Médio | Ligar tarefa expõe o board para quem não é da empresa | D8: o candidato exige `UserCompany`; o card mostra só o título para os outros |
| Médio | 80 selects trocados quebram fluxos já testados | P5 roda depois da junção, com os 9 roteiros da ala de novo |
| Baixo | Deploy antes da migration | Padrão da fundação: `isMarketingSchemaMissing` cai em "indisponível" |

## Testes

- API: testes por serviço (regras de marca, mapa D6, candidatos, cópia), seguindo os specs atuais.
- Harness, roteiros novos de ponta a ponta:
  - `marketing-library-e2e.cjs` (Acervo, papéis e marcas, cópia, zip);
  - `marketing-uploads-e2e.cjs` (bandeja, pasta, Ctrl+V, retomar, aba fechando);
  - `marketing-tasks-e2e.cjs` (ligar, mover, realtime, freelancer);
  - `marketing-utm-e2e.cjs` ampliado (QR na criação, URL com UTM);
  - `marketing-settings-e2e.cjs` ampliado (Do Nevo).
- Regressão: os 9 roteiros da ala, `api-smoke` como Admin e como Worker, uteis, celular e roadmap.
- Duas auditorias independentes no fim: segurança da API e costuras do front.

## Change log

| Data | Versão | O quê |
|---|---|---|
| 2026-11-06 | 0.1 | Spec da rodada a partir do uso real do Nicolas em produção; schema e migration congelados antes dos agentes |
| 2026-11-06 | 0.2 | Auditoria do front (30 achados): repetido vira pergunta da fila (não trava ao sair da tela), cancelar e tentar de novo sem duplicar, falha do item do Acervo vira erro com retomada só do passo, subpasta base fixa, logout limpa a fila, zip por download nativo (`POST library/zip/ticket` + `GET library/zip/:token`), "Mandar para o acervo" só para a marca do arquivo ou a Geral, `GET utm/:id`. Roteiro `marketing-r1-audit-e2e.cjs` |
| 2026-11-06 | 0.3 | P5 (R1-E): os 62 `<select>` da ala viraram `AppSelect` (`select-items.ts`, `useSavedSelect`); Tipo e Responsável do card, Situação da ativação e do parceiro e Cor da empresa voltam ao valor gravado quando a API recusa. Nativo só o `<datalist>` de forma de pagamento, com motivo. Roteiro `marketing-selects-e2e.cjs` e helper `app-select.cjs` nos roteiros antigos |
