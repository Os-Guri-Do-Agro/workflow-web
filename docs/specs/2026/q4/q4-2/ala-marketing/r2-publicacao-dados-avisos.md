# Ala Marketing, rodada R2: publicação nas redes, dados do app, avisos e lixeira

**Status:** Concluído (07/11/2026). O código está pronto. O uso real depende das chaves das redes, do VAPID e do SendGrid no Railway e do release da PetJourney (ver "Ordem do release" na [M4](m4-dados-do-app.md)).
**Épico:** [ala-marketing](../../../../epicos/ala-marketing.md) · **Depois de:** [R1](r1-acervo-tarefas-convite.md) · **Inclui:** [M4](m4-dados-do-app.md) inteira e a M5 possível sem conta paga
**Repos:**
- no Nevo: `work-flow` e `workflow-api`;
- na PetJourney, só a parte B: `petjourney-web`, `petjourney-api` e `petjourney-app`
**Migrations:**
- `20261108120000_ala_marketing_r2`: só aditiva, com 9 tabelas novas e `deletedAt`/`deletedById` em 12 tabelas. **Já aplicada em produção** em 06/11; o código antigo ignora as colunas.
- `20261108130000_ala_marketing_r2_expense_source`: coluna `sourceKey` e índice único em `MarketingExpense`. Também aditiva.

## Origem

Em 06/11/2026 o Nicolas perguntou se dá para agendar e publicar nas redes, e depois pediu: "faz tudo que dá já, vamos fechar o máximo possível, quero uma ferramenta realmente boa". O pedido inclui o que a R1 deixou em aberto:
- a M4 (dados do app);
- a M5;
- o push dos avisos;
- o e-mail dos avisos;
- os follow-ups.

## Escopo

| Parte | Agente | O quê |
|---|---|---|
| A. Publicação | A | Conectar contas por marca, agendar, publicar sozinho, rascunho no TikTok, lembrete "à mão", resultados do post, gasto e resultado de anúncio da Meta |
| B. Dados do app (M4) | B | Captura na PetJourney, job diário com recorte, entrada no Nevo por token, área Dados |
| C. Avisos, lixeira e acabamento | C | Push e e-mail dos avisos com preferência por pessoa, meta de cadência, prévia do feed do Instagram, lixeira em todos os módulos, follow-ups da R1 |

**Fora, com motivo:**
- **Aviso no WhatsApp:** exige número na API oficial do WhatsApp (Meta), com custo por conversa e modelos aprovados. É decisão de dinheiro do Nicolas.
- **Anúncios do TikTok:** a API de negócios do TikTok exige outra aprovação.
- **X:** a API é paga.
- **Pinterest e Threads:** ficam no modo "à mão" nesta rodada. O Threads entra fácil depois, porque usa o mesmo app da Meta.
- **Install Referrer e SDK de atribuição no app:** são a M4.2 (D4 da M4).

## Fatos das redes (documentação oficial, conferida em 06/11/2026)

- **Instagram:** feed, carrossel de até 20 itens, Reels e Story.
  - Foto só em JPEG, até 8 MB, largura de 320 a 1440 px, proporção de 4:5 a 1,91:1, sRGB.
  - Reels: MP4 ou MOV, H.264 ou HEVC, de 3 s a 15 min, até 300 MB.
  - Story: de 3 a 60 s, até 100 MB, sem figurinha de link ou enquete.
  - A mídia vai por URL pública (a URL assinada do storage serve) ou por envio retomável.
  - Limite de 400 containers em 24 h; um container expira em 24 h.
  - A API não agenda: quem agenda é o Nevo.
  - Colaborador (até 3), alt text (só em foto) e marcação de produto existem.
  - Música só com áudio original.
  - Para contas da própria empresa basta o acesso padrão, sem App Review. Conta de terceiros exigiria acesso avançado.
- **Facebook (página):** o mesmo app da Meta. Tem agendamento nativo, mas usamos o nosso, para ter uma fonte só.
- **YouTube:** `videos.insert` com até 100 envios por dia e `status.publishAt`. Vídeo enviado por projeto não verificado não fica mais preso no privado. Shorts é vídeo vertical curto.
- **LinkedIn (página):** exige a Community Management API (`w_organization_social`), com revisão de 1 a 2 semanas. Imagens: de 2 a 20 por post. Vídeo: MP4 de 3 s a 30 min, até 500 MB. Sem documento e sem enquete.
- **TikTok:** Direct Post sem auditoria sai só privado. A auditoria recusa com todas as letras "ferramenta para subir conteúdo nas contas que você ou seu time gerencia". **Caminho: rascunho** (`video.upload`, caixa de entrada): a pessoa recebe a notificação no app e publica.

## Decisões

### Parte A. Publicação

- **A1. Conexão por marca, OAuth no servidor.**
  - `GET .../social/connect/:network?companyId=` devolve a URL de autorização com `state` assinado (HMAC, 10 min, preso a pessoa, grupo, marca e rede).
  - O callback público `GET /marketing/social/callback/:network` valida o `state`, troca o código e guarda os tokens cifrados com o `CryptoService`. Nada de token na resposta da API, no log ou no socket.
  - Depois volta para `/marketing/configuracoes?aba=redes`.
  - Conectar e desconectar: Dono e Admin. Desconectar revoga na rede quando ela permite.
  - **Meta:** um Login do Facebook só traz as páginas, os Instagram profissionais ligados a elas e as contas de anúncio (`META_ADS`).
    - Escopos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `read_insights`, `business_management`, `ads_read`.
    - O token de usuário vira longo (60 dias), e o de página é o longo dele.
  - **YouTube:** OAuth do Google com acesso offline (refresh token) e escopos `youtube.upload` e `youtube.readonly`.
  - **LinkedIn:** `w_organization_social` e `r_organization_social`; lista as páginas em que a pessoa é admin.
  - **TikTok:** `user.info.basic` e `video.upload`.
- **A2. Inerte sem chave.**
  - Sem `META_APP_ID`/`META_APP_SECRET`, `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` (com fallback para `GOOGLE_*`), `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET` ou `TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`, a tela de redes mostra o passo a passo de criar o app, com as URLs de callback prontas para copiar, e o resto da ala segue igual.
  - As URLs base das redes vêm de env (`META_GRAPH_URL`, `YOUTUBE_API_URL`, `LINKEDIN_API_URL`, `TIKTOK_API_URL`) para o harness apontar para um falso.
- **A3. Agendar.**
  - No card Aprovado com `publishAt`, "Agendar publicação" mostra uma linha por rede do card: conta da marca, modo e formato (Feed, Carrossel, Reels, Story, Vídeo, Shorts).
  - Modos:
    - Instagram, Facebook, YouTube e LinkedIn: AUTO;
    - TikTok: DRAFT;
    - as outras redes, ou quando não há conta: MANUAL.
  - Antes de aceitar, valida a versão aprovada contra a regra da rede e do formato e mostra o que falta em frase clara. Exemplos: "O Reels precisa de vídeo de 3 s a 15 min", "A foto tem 1080x1920 e o feed aceita de 4:5 a 1,91:1".
  - Agendar cria uma `MarketingPublication` por rede, com a legenda congelada (`captions[rede]` mais as hashtags), e leva o card para Agendado.
  - `publishAt` do card é a fonte: mudar a data reagenda o que ainda não saiu.
  - Desagendar (card volta para Aprovado), versão nova ou card na lixeira cancelam o pendente e avisam.
- **A4. Mídia.**
  - Sai a versão aprovada, na ordem dos arquivos.
  - **Foto:** o `sharp` converte para JPEG sRGB (CMYK incluso), até 1440 px de largura e 8 MB. O derivado vai para `marketing/<g>/publish/<publicationId>/<n>.jpg`, e a rede baixa por URL assinada de 1 h.
  - **Proporção fora:** o Nevo bloqueia e explica; não corta sozinho.
  - **Vídeo:** confere container, tamanho e duração com um leitor de MP4 em JS puro (sem ffmpeg no Railway).
- **A5. Agendador.**
  - `@Cron` a cada minuto.
  - Pega o trabalho por update condicional: SCHEDULED com `scheduledAt <= agora` e sem trava, ou com trava de mais de 10 min, vira PUBLISHING com trava. Assim nunca publica duas vezes.
  - Sucesso: PUBLISHED, com `externalId`, `permalink` e `publishedAt`.
  - Erro passageiro (rede, 5xx, limite): tenta de novo em 1, 5 e 15 min.
  - Erro definitivo (token vencido, mídia recusada) ou fim das tentativas: FAILED, com a frase do motivo, aviso para o responsável e para quem agendou, e "Tentar de novo" no card.
  - Quando toda publicação do card está concluída (PUBLISHED, ou MANUAL e DRAFT marcadas como publicadas), o card vai sozinho para Publicado, com `publishedAt` e `publishedUrl` (o primeiro link) e log "pelo agendador".
- **A6. À mão (MANUAL).** Na hora, a publicação vira WAITING_MANUAL e chega o aviso "Hora de publicar <título> no <rede>" para o responsável. O card mostra:
  - "Baixar arte";
  - "Copiar legenda";
  - "Abrir <rede>";
  - "Marquei como publicado", com o link opcional.
- **A7. TikTok em rascunho (DRAFT).** Na hora, o vídeo vai para a caixa de entrada do TikTok da conta e a publicação vira DRAFT_SENT. O aviso diz: "Abra o TikTok para publicar". "Marquei como publicado" fecha.
- **A8. Resultados do post.**
  - Cron diário puxa as publicações PUBLISHED dos últimos 30 dias:
    - Instagram: alcance, curtidas, comentários, salvos, compartilhamentos, visualizações;
    - Facebook: insights do post;
    - YouTube: visualizações, curtidas, comentários;
    - LinkedIn: estatísticas do compartilhamento, quando a permissão existir.
  - O card mostra os números, e a campanha soma os seus cards.
- **A9. Anúncios da Meta.**
  - Na campanha da ala, "Ligar campanha de anúncio" lista as campanhas da conta `META_ADS` da marca.
  - Cron diário grava `MarketingAdMetricDay`: gasto, impressões, alcance, cliques e resultado pelo objetivo.
  - A campanha mostra o total e a série por dia.
  - O financeiro continua a fonte do dinheiro. O botão "Lançar gasto do mês no financeiro" cria o lançamento na categoria Tráfego pago, sem repetir o mesmo mês.

### Parte B. Dados do app

Segue a [M4](m4-dados-do-app.md) inteira, decisões D1 a D9 e partes A a F, com três acréscimos:
- **Nada sobe da PetJourney.**
  - O código fica pronto no `develop` local, com os testes verdes e sem commit.
  - A migration só roda no Postgres do harness.
  - O release da PetJourney (o `develop` vira `master`, depois `migrate deploy` e `release:check`) é do Nicolas.
- **Prova de ponta a ponta no harness:**
  - o job da PetJourney roda contra um banco local com cadastros falsos e manda para a API do Nevo no harness;
  - a área Dados mostra o funil.
- **Contrato versionado** em `docs/` dos dois lados: `payloadVersion` 1, lista fechada de métricas e dimensões.

### Parte C. Avisos, lixeira e acabamento

- **C1. Push dos avisos.** O `MarketingLogService.notify` passa a mandar push (`PushService.sendToUser`) para quem tem `push` ligado e não silenciou o tipo, com o mesmo título, texto e link (`?grupo=`). Sem VAPID fica inerte.
- **C2. E-mail dos avisos.**
  - IMMEDIATE manda um e-mail por aviso.
  - DAILY manda um resumo às 8h de Brasília com os avisos não lidos desde o último resumo.
  - Usa o `MailService` (SendGrid); sem chave fica inerte, e a tela diz isso.
- **C3. "Meus avisos".**
  - Cada pessoa, em qualquer papel, escolhe na ala:
    - push sim ou não, com o pedido de permissão do navegador pelo mesmo fluxo de push do Nevo;
    - e-mail: desligado, na hora ou resumo diário;
    - tipos silenciados.
  - O padrão sem linha é: push ligado, e-mail no resumo diário.
- **C4. Meta de cadência.**
  - Admin define a meta por marca e rede (por exemplo, 3 por semana no Instagram).
  - Conta os cards da rede com `publishAt` na semana ISO e status Agendado ou Publicado.
  - Da quarta-feira em diante, se a soma não bate a meta, avisa uma vez por semana os Admins e Editores da marca.
  - O painel inicial mostra "Cadência da semana: 2 de 3 no Instagram".
- **C5. Prévia do feed do Instagram.**
  - Grade de 3 colunas por marca com os cards do Instagram Agendados e Publicados, mais novo primeiro, usando a miniatura da versão aprovada e mostrando a hora.
  - Arrastar um agendado sobre outro troca os horários. O `PATCH` volta ao valor anterior se a API recusar.
  - Fica no Calendário como modo "Feed".
- **C6. Lixeira em todos os módulos.**
  - **Vale para** card, campanha, ideia, cofre, UTM, ativação, parceiro, lançamento, recorrente, orçamento, pasta e item do Acervo.
  - **Apagar:** grava `deletedAt` e `deletedById`.
  - **Leituras:** toda leitura da ala filtra `deletedAt: null`. Isso inclui listas, contagens, calendário, painel, exportações, totais do financeiro e crons.
  - **Teste estático:** lista toda chamada `prisma.marketing<Modelo>.find*/count/aggregate/groupBy` em `src/marketing` e exige o filtro, ou um motivo na lista de exceções.
  - **Efeito de apagar:** igual ao de hoje enquanto o item está na lixeira. Por exemplo, a UTM apagada para de redirecionar e o card apagado cancela as publicações pendentes.
  - **Restaurar:** devolve tudo.
  - **Apagar uma pasta do Acervo:** leva os itens dela juntos, com o mesmo `deletedAt`, e restaurar devolve juntos.
  - **Tela "Lixeira":**
    - Admin vê tudo e restaura;
    - Editor vê e restaura o que ele apagou;
    - "Apagar de vez" só para Admin;
    - Visualizador não vê.
  - **Expurgo:** um cron apaga de vez depois de 30 dias, com o storage limpo pelo `MarketingFilesService.remove`.
- **C7. Follow-ups da R1:**
  - o `ValidationPipe` (`enableImplicitConversion`) transforma "false" em true. Entra um decorator `ToBoolean` em todo campo booleano de query da API, com teste;
  - "2.000 de N" na aba Lançamentos;
  - lista de UTM acima de 500 com paginação;
  - conferir e fechar os gaps da R1: teto do export e do resumo do financeiro com mensagem, ativações acima de 500 paginando, painel com uma requisição a menos.

## Regras para quem implementa (os 3 agentes na MESMA árvore)

1. **Sem cópia, sem worktree.**
   - Trabalhe em `C:\TRABALHO\workflow\work-flow` e `C:\TRABALHO\workflow\workflow-api`; a parte B também nos repositórios da PetJourney.
   - Proibido: `git stash`, `git checkout -- <arquivo>`, `git reset`, `git clean`, commit e push. Quem commita é o orquestrador.
2. **Arquivo existente só com Edit pequeno e localizado, relendo antes.**
   - Nunca reescreva com Write um arquivo que já existe.
   - Nunca rode formatador no repositório inteiro.
   - Nunca desfaça mudança que não é sua.
3. **Arquivos compartilhados:** `marketing.module.ts`, `marketing-nav.ts`, `routes.ts`, as abas de Configurações, `MarketingCardView.vue`, `marketing-cards.service.ts`, `marketing-home.service.ts`, `campaigns.service.ts` e `src/CLAUDE.md`. Só acrescente: registre o seu módulo, a sua aba, a sua regra.
4. **O schema está congelado.** Precisa mudar? Pare e descreva no relatório; o orquestrador decide e aplica. Não rode `prisma migrate` nem `db push` fora do harness.
5. **A árvore compila sempre.**
   - Mude em passos que passam no `tsc` e no `vue-tsc`.
   - Erro de tipo num arquivo que você não tocou é de outro agente no meio do trabalho: espere e confira de novo, não corrija.
6. **Pacote novo:** só o agente A instala, na `workflow-api`, e precisa justificar no relatório. O B instala só nos repositórios da PetJourney. O C não instala.
7. **Harness:**
   - Postgres em 55432 e storage falso em 54329, os dois já no ar (não derrube).
   - Portas por agente:

     | Agente | API | Vite | Banco | Extra |
     |---|---|---|---|---|
     | A | 3651 | 5251 | `wf_pub` | redes falsas em 54351 |
     | B | 3661 | 5261 | `wf_m4` | banco da PetJourney `pj_m4` |
     | C | 3671 | 5271 | `wf_r2c` | |

   - Cada um com `VITE_CACHE_DIR=node_modules/.vite-<agente>`.
   - Ao terminar, pare só os SEUS processos, pelo PID, depois de conferir a linha de comando.
8. **Produção:** nada. Nem leitura, nem `.env` de produção, nem chamada a rede real.
9. **Copy em pt-BR, sem o caractere em-dash.** Visual denso, sem cara de IA (`src/CLAUDE.md` e os componentes do Nevo: `AppSelect`, `LibraryCheck`, `mk-` utilitários). Nada de `<select>` nativo (regra 9 da ala).

## Critérios de aceite

Conferência de 07/11, na árvore final, com banco novo (`wf_final`). A prova de cada item é o roteiro do harness (parte entre colchetes) ou o teste de unidade indicado.

**A. Publicação** (`marketing-publish-e2e.cjs`, 126/0, contra redes falsas)
- [x] Sem chave da rede, a aba Redes mostra o passo a passo com as URLs de callback, e a ala inteira segue funcionando. Prova: [A1].
- [x] Conectar a Meta no harness (rede falsa) traz a página, o Instagram e a conta de anúncio da marca, e nenhum token aparece em resposta, log ou socket. Prova: [A2], que varre 2.167 respostas, socket e logs. Desde a auditoria, a volta da rede só guarda uma reserva de uso único, e o Admin escolhe as contas e a marca no front logado.
- [x] Agendar um carrossel de 3 fotos (uma CMYK) para daqui a 2 min: na hora sai um carrossel com 3 JPEG sRGB de até 1440 px, e o card vai para Publicado com o link. Prova: [A3].
- [x] Foto fora da proporção, Story longo e Reels curto são barrados com a frase do motivo, antes de agendar. Prova: [A4] e `media-rules.spec.ts`.
- [x] Dois agendadores ao mesmo tempo não publicam duas vezes. Prova: [A5], com duas APIs reais no mesmo banco, e o teste de claim concorrente.
- [x] Rede fora do ar: 3 tentativas, depois FAILED com aviso. "Tentar de novo" publica. Prova: [A6]. Erro ambíguo no passo final ("pode ter saído") não tenta sozinho; só volta pelo "Tentar de novo", depois de conferir na rede.
- [x] Mudar `publishAt` do card reagenda; versão nova ou lixeira cancelam e avisam. Prova: [A7], o B2 do `marketing-calendar-e2e.cjs` (arrastar no calendário) e o `marketing-feed-e2e.cjs` (troca no feed).
- [x] TikTok vira rascunho com aviso, e MANUAL vira lembrete com baixar, copiar e "Marquei como publicado". Prova: [A8].
- [x] Os resultados do post e o gasto da campanha de anúncio aparecem no card e na campanha; "Lançar gasto do mês" não duplica. Prova: [A9] e os testes de "anúncios" do `social-services.spec.ts`. A origem fica na coluna única `MarketingExpense.sourceKey` (migration `20261108130000`).
- [x] Editor de outra marca não vê a conta nem agenda nela; Visualizador só vê o status. Prova: [A10].

**B. Dados do app** (os critérios da [M4](m4-dados-do-app.md), mais estes)
- [x] O job local manda o dia, o Nevo grava, e reenviar não duplica. Prova: no DEV da PetJourney, em 07/11, com a API local da PetJourney (`develop 34fd6aec`) mandando para o Nevo do harness. O dia vai uma vez só, com o conteúdo congelado, e o reenvio respondeu "nada pendente" com o mesmo hash no Nevo. O modo simulado do `marketing-appdata-e2e.cjs` deu 128/0.
- [x] O teste de contrato da PetJourney falha com id, e-mail, nome, IP, token ou célula menor que 5. Prova: `nevo-contrato.spec.ts` e o teste de propriedade `nevo-recorte.propriedade.spec.ts`, que cobre subtração no dia, dias seguidos, a semana e duas versões do mesmo dia.
- [x] Sem dado, a área Dados explica como conectar. Prova: `marketing-appdata-e2e.cjs`.

**C. Avisos, lixeira e acabamento**
- [x] Aviso da ala chega por push para quem ligou e não chega para quem silenciou o tipo. Prova: `notify.spec.ts` e `marketing-notify-e2e.cjs` (71/0).
- [x] IMMEDIATE manda um e-mail por aviso; o resumo DAILY junta os não lidos, uma vez por dia. Sem SendGrid, nada quebra. Prova: `notify.spec.ts` e o roteiro notify. O resumo só leva aviso de marca que a pessoa ainda vê, de item fora da lixeira, e devolve a reserva se o envio falhar.
- [x] Meta de 3 no Instagram com 2 agendados: um aviso na quarta e nenhum repetido na semana. Prova: `cadence.spec.ts` e a parte D do roteiro notify.
- [x] O feed mostra a grade, e trocar dois agendados troca os horários (e reagenda a publicação). Prova: `marketing-feed-e2e.cjs` (44/0). A troca confere o horário esperado e dá 409 na grade velha.
- [x] Apagar cada um dos 12 tipos manda para a Lixeira, some de todas as telas e totais, e restaurar volta tudo. O teste estático passa. Prova: `marketing-trash-e2e.cjs` (142/0) e `trash-reads.spec.ts`, que lê o código pela árvore do TypeScript.
- [x] O expurgo de 30 dias apaga de vez e limpa o storage. Prova: `trash.service.spec.ts` e a parte F do roteiro. Apagar de vez trava a linha, e o storage só sai depois do commit.
- [x] `?ativo=false` chega como false em todas as rotas com booleano de query. Prova: `to-boolean.spec.ts`, com o ValidationPipe real e a varredura do `src/`. Os booleanos de body da ala também usam `@ToBoolean`.

## Riscos

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | Publicar duas vezes ou na conta errada | Trava por update condicional; a conta é da marca do card (validada no servidor); o roteiro testa dois agendadores |
| Alto | Vazar token de rede | Cifrado no banco, fora de toda resposta, log e socket; o teste procura o token falso em respostas e logs |
| Alto | A lixeira deixar item apagado aparecer (total do financeiro errado) | Teste estático de toda leitura mais roteiro por módulo e por total |
| Médio | A API real difere do falso | Seguir a doc oficial ao pé da letra, com a URL da doc no comentário de cada chamada; o primeiro uso real é acompanhado pelo Nicolas |
| Médio | Três agentes na mesma árvore | Regras acima; schema congelado; o orquestrador commita por parte |
| Médio | Reidentificação nos dados do app | D5 da M4: recorte de 5, cruzamento só em 7 dias, teste de contrato |

## Testes

- API: testes por serviço (agendador, validação de mídia, sync de status, lixeira, preferências, ingestão).
- Roteiros novos no harness:
  - `marketing-publish-e2e.cjs`, com o servidor de redes falsas `fake-social.mjs`;
  - `marketing-appdata-e2e.cjs`;
  - `marketing-notify-e2e.cjs`;
  - `marketing-trash-e2e.cjs`;
  - `marketing-feed-e2e.cjs`.
- Regressão: os 16 roteiros da ala.
- No fim, cada agente audita a parte de outro (A audita C, B audita A, C audita B), só lendo.

## Change log

| Data | Versão | O quê |
|---|---|---|
| 2026-11-06 | 0.1 | Spec da rodada a partir do pedido do Nicolas; schema e migration congelados e aplicados em produção antes dos agentes |
| 2026-11-07 | 0.2 | Entregue e conferido. Auditoria cruzada em duas voltas, cada achado corrigido por um agente diferente do autor e revisado pelo dono. Mudanças de desenho que saíram das auditorias: (1) conectar com reserva de uso único e escolha de contas e marca no front logado; (2) travas de PUBLISHING no card, container do Instagram (`ctr:`) e falha ambígua (`amb:`) sem republicar sozinha; (3) M4 com cada dia mandado uma vez, `utm` e `parceiro` por semana ISO fechada, estoques só no total e arredondados, sem canceladas; (4) `MarketingExpense.sourceKey` único (migration `20261108130000_ala_marketing_r2_expense_source`); (5) Lixeira, Configurações e Meus avisos no cabeçalho da ala. Regressão final: 21 roteiros da ala e 5 de fora, todos verdes |
