# Épico: Ala Marketing (começando pela PetJourney)

**Status:** M1 a M3 e a rodada R1 em produção (06/11/2026). Rodada R2 em implementação: publicação nas redes, M4 (dados do app) e a M5 possível sem conta paga ([r2-publicacao-dados-avisos](../2026/q4/q4-2/ala-marketing/r2-publicacao-dados-avisos.md)). Specs filhas em `docs/specs/2026/q4/q4-2/ala-marketing/`.
**Autor:** Nicolas (via spec-driven, modo 1)
**Criado em:** 2026-11-05
**Última atualização:** 2026-11-05
**Versão:** 0.1
**Origem:** pedido da Leticia, [`PedidoparaoNicolasSistemadeMarketingPetJourney.pdf`](../../../../PedidoparaoNicolasSistemadeMarketingPetJourney.pdf) (fora do repo, na pasta `C:\TRABALHO\workflow`), de 05/11/2026.
**Repos:** `work-flow` (front) + `workflow-api` (API). Toca de leve o app da PetJourney (`C:\TRABALHO\PetJourney`), só na fase M4.

---

## Visão Geral

Uma área **Marketing** dentro do Nevo para o time de marketing de uma empresa cliente (primeiro a PetJourney: Leticia e Leonardo, depois freelancer e um visualizador). Nela ficam aprovação de posts e artes, calendário editorial, campanhas, UTMs e QR Codes, ideias, ativações, financeiro e os dados do app. Objetivo do pedido: parar de abrir um grupo de WhatsApp para cada arte, vídeo ou campanha.

## Por que dentro do Nevo, e não um CMS à parte

Dá para fazer, e o Nevo já tem a metade difícil pronta e em produção. Um CMS genérico (Strapi, Directus, Payload ou o CMS do site da PetJourney, que é um Next com Mantine) daria tabelas e formulários. O que o pedido tem de difícil é o **fluxo**:
- aprovação com versões e comentário na arte;
- calendário que puxa o que foi aprovado;
- campanha que leva o gasto para o financeiro;
- UTM que vira QR e mostra quantos cliques trouxe.

Isso teria que ser escrito do zero em qualquer CMS, junto com login, permissão, arquivos, notificações e celular, que o Nevo já tem.

| Pedido da Leticia | Já existe no Nevo | O que falta |
|---|---|---|
| Login individual, Google | Login, Google, senha por link de primeiro acesso | Nada |
| Admin, Editor, Visualizador | Papel por empresa (ADMIN, WORKER) | Papel próprio do módulo (Admin, Editor, Visualizador) |
| Arquivos grandes, prévia sem baixar, baixar original | Drive com bucket privado e URL assinada; `FileViewer` (imagem, PDF, vídeo) | Upload em partes para vídeo grande; prévia RGB de arquivo CMYK sem tocar no original; zip |
| Comentários, menções, reações | `CommentsPanel` (menções por id, reações) | Comentário preso a um ponto da arte e a um minuto do vídeo |
| Notificações | Inbox, push, Discord, e-mail (falta configurar o SendGrid) | Eventos de marketing e aviso de prazo |
| Histórico | Feed da empresa (`FeedEvent`) | Eventos novos |
| Busca geral | Ctrl+K com busca semântica | Indexar post, UTM, link, campanha |
| Celular | Moldura de celular, board de uma coluna, folha "Mover para", barra acima do teclado | Aprovar arte pelo celular (tela própria) |
| Kanban e lista com filtros | Board de tarefas (colunas, arrastar, filtros na URL, lista com massa) | Board do card de marketing, com os status dele |
| Calendário | Roadmap visão Mês (grade, faixas de vários dias, arrastar não) | Semana, lista, cadência por rede, arrastar para mudar a data |
| Links com senha protegida | Cofre das Variáveis (SECRET mascarado, revelar registrado no feed) | Categoria, favoritos, botão copiar link |
| UTMs | Encurtador já guarda `utm_source` a `utm_content` e conta cliques | Gerador com listas fixas (minúsculo, sem acento), aviso de duplicada, "onde será usado", vínculo com campanha e post |
| QR Code | QR dinâmico (destino editável depois de impresso), leituras contadas, logo e cores | Ligar QR à UTM e ao parceiro |
| Financeiro, campanhas, ativações, parceiros, ideias | Nada | Tudo novo |
| Dados do app | Dashboard com gráficos no tema | Receber os números do app (só agregados) |

**Sobre os QR Codes:** é o ponto onde o Nevo já entrega hoje. O QR é dinâmico, então se o link da placa da Vida Felina mudar, troca o destino e a placa impressa continua valendo. Ligando QR, encurtador e UTM, cada placa, folder e parceiro ganha o próprio link. Quando o app guardar a origem do cadastro (ver M4), dá para saber quantos cadastros cada um trouxe, que é o "Indicações de parceiros" do pedido.

---

## Decisões (alto nível)

- **D1. Módulo do Nevo, ligado por empresa.** Uma seção nova "Marketing" no menu, que só aparece para a empresa que ativar o módulo (a PetJourney primeiro). Nada muda para as outras empresas.
- **D2. Papel do módulo separado do papel na empresa.** Admin (Leticia: cria, edita, aprova e apaga tudo, inclusive o que o Leonardo criou), Editor (Leonardo: cria, sobe, comenta, lança gastos, não aprova) e Visualizador (vê, não edita). Um freelancer entra como Editor só da ala Marketing, sem ver o board de desenvolvimento da empresa.
- **D3. O card de marketing é uma entidade nova, não uma tarefa.** Os campos, os status (Ideia, Em produção, Aguardando aprovação, Ajustes pedidos, Aprovado, Agendado, Publicado) e a regra de aprovação são outros. O que se reaproveita é a interface: o board, a lista, o painel lateral, os comentários e o celular. Peça impressa é o mesmo card com a trilha da gráfica (Aprovado para impressão, Enviado, Prova recebida, Impresso e entregue).
- **D4. A aprovação mora no servidor.** Só Admin aprova; pedir ajuste exige comentário; subir uma versão nova volta o card para Aguardando. Toda versão fica guardada (V1, V2, V3) para comparar lado a lado. Cada pedido de ajuste vira um item de checklist que quem produziu marca como feito.
- **D5. Um dado, um lugar.**
  - O calendário editorial mostra o próprio card pela data de publicação, sem cadastro duplicado.
  - O gasto de campanha, ativação e gráfica entra sozinho no financeiro.
  - A UTM é o link curto do encurtador.
  - O QR da placa aponta para esse link curto.
  - "Transformar em post" cria o card a partir da ideia.
- **D6. Arquivos no storage que o Nevo já usa**, privados, com URL assinada.
  - Vídeo grande sobe em partes, direto do navegador para o storage, sem passar pela API.
  - O original nunca é alterado nem comprimido.
  - A prévia de arquivo CMYK é uma cópia RGB gerada à parte.
- **D7. Dados do app só agregados.** O app manda números por dia (cadastros por origem, ativos, assinaturas, pets por espécie, uso das funções), nunca linha de tutor (LGPD). A entrada é uma rota com token de API, no molde dos Acessos Públicos que já existem.
- **D8. Visual do Nevo, com a cara da PetJourney onde é preferência.** A ala segue o design system do Nevo (denso, sem cara de IA). As cores da marca entram como acento padrão da empresa e a DM Sans como opção de fonte. Não existe um tema paralelo só para essa área.

---

## Fases (cada uma usável sozinha)

A ordem é a do PDF, com dois ajustes: comentário na arte entra já na M1 (é o coração da aprovação) e a peça impressa sai da M2 para depois das UTMs.

| Fase | Entra | Resultado para o time | Tamanho |
|---|---|---|---|
| **M1. Aprovação e calendário** | Módulo por empresa, papéis Admin/Editor/Visualizador, card de marketing (tipo, redes, arquivos com versões, legenda por rede, hashtags, prazo, publicação, responsável), Aprovar e Pedir ajuste, comentário no ponto da arte e no minuto do vídeo, checklist de ajustes, board e lista com filtros, prazo vencido em vermelho, aprovar pelo celular, calendário editorial (mês, semana, lista; arrastar muda a data; clicar no dia cria), Links de trabalho (sobre o cofre), notificações dentro do Nevo | Arte, vídeo e texto saem do WhatsApp | Grande |
| **M2. Rastreio e estratégia** | Gerador de UTM sobre o encurtador (listas fixas, duplicada, "onde será usado"), QR ligado à UTM, Ideias e trends (mural, curti, "Transformar em post"), Campanhas (orçamento, período com valor por dia, público, artes e UTM ligadas, resultados, aprendizados; só fica ativa com aprovação), peças para a gráfica (checklist pré-gráfica, orçamentos, baixar o original), e-mail das notificações | Sabe de onde vem cada clique e cada leitura de QR | Médio |
| **M3. Dinheiro e eventos** | Financeiro (lançamentos, categorias, orçamento x realizado, recorrentes, nota fiscal, aviso de lançamento sem nota, visão do ano, exportar Excel e PDF, zip das notas do mês), Ativações (feiras, palestras, parceiros, checklist, custo, fotos, no calendário), Parceiros e orçamentos (contatos com botão de WhatsApp, último contato, próximo passo) | A planilha e o histórico de parceiros saem do celular | Médio |
| **M4. Dados do app** | Área Dados (números por dia, comparação com o período anterior, CSV, link do Looker Studio) e o painel inicial completo | O dashboard do Leonardo | Pequeno no Nevo; depende do app |
| **M5. Depois** | Resultados de anúncios pela API da Meta e do TikTok, aviso no WhatsApp, prévia do feed do Instagram, aviso de cadência abaixo da meta, lixeira em todos os módulos | Menos digitação manual | A decidir |

Estimativa grosseira: a M1 leva de 1 a 2 semanas de trabalho focado, a M2 e a M3 cerca de 1 semana cada, e a M4 alguns dias depois que o app mandar os dados. Cada fase termina com roteiro de ponta a ponta no harness, como as rodadas de novembro.

### Critérios de aceite do épico (alto nível)
- [ ] Leticia aprova e pede ajuste pelo celular, e o Leonardo recebe o aviso e sobe a V2 sem sair do Nevo.
- [ ] Nenhum dado é cadastrado duas vezes: o calendário, o financeiro e a UTM puxam do card, da campanha e do encurtador.
- [ ] Um Visualizador vê e não edita nada; um freelancer não vê o board de desenvolvimento da empresa.
- [ ] O arquivo original da gráfica sai igual ao que entrou (mesmo hash), inclusive em CMYK.
- [ ] O dashboard do app não tem nenhum dado pessoal de tutor.
- [ ] Empresa sem o módulo ligado não vê nenhuma tela nem rota nova.

---

## Riscos

| Nível | Risco | Mitigação |
|---|---|---|
| Alto | O app não guarda a origem de quem se cadastra (conferido em 05/11: não há campo de UTM nem de origem no `petjourney-api` nem no app), e sem isso a M4 não responde "qual post trouxe o cadastro" | Entra como tarefa do app antes da M4: guardar a UTM do link de entrada e a origem do cadastro. As fases M1 a M3 não dependem disso |
| Alto | Vídeo de alguns minutos passa do limite atual (o padrão do Drive é 50 MB por arquivo, ajustável por `DRIVE_MAX_FILE_BYTES`) e do plano do storage | Upload em partes direto para o storage; limite por arquivo decidido junto com o plano do Supabase antes da M1 |
| Médio | Escopo grande (11 módulos) virar meses sem nada em uso | Fases que entregam sozinhas; a M1 já tira o WhatsApp do dia a dia |
| Médio | Freelancer ou visualizador vendo o que não deve (financeiro, board da empresa) | Papel do módulo checado no servidor em toda rota (o mesmo cuidado da auditoria de segurança v2), com teste de acesso cruzado por papel |
| Médio | Prévia de CMYK com cor errada na tela | A prévia é aproximação RGB e a tela diz isso; o que vale para a gráfica é o original e a prova impressa (status "Prova recebida") |
| Baixo | API da Meta e do TikTok exigem app aprovado e verificação do negócio | Fica na M5; até lá o resultado é lançado à mão na campanha |

## Requisitos não funcionais
- **Segurança:** papel do módulo validado no servidor; arquivo só por URL assinada; senha de link só no cofre (mascarada, revelar registrado).
- **LGPD:** dados do app só agregados; nenhuma linha de tutor sai do app.
- **Celular:** aprovar, comentar e mover card pelo celular são o caminho principal, não o secundário.
- **Arquivo:** original intocado; prévia gerada à parte; download em zip para carrossel e notas.

---

## Respostas às perguntas da Leticia (rascunho para o Nicolas revisar)

1. **Do zero ou com base pronta?** Dentro do Nevo, que já tem login, permissões, arquivos, comentários, notificações, QR, encurtador e celular. Um CMS pronto teria que ganhar o fluxo de aprovação inteiro do zero.
2. **Onde ficam os arquivos e qual o limite?** No storage privado que o Nevo já usa, com link assinado. O padrão do Drive hoje é 50 MB por arquivo (dá para subir por configuração). Para reels de alguns minutos, a M1 traz upload em partes; o limite final depende do plano do storage e precisa ser decidido antes.
3. **Comentário em cima da imagem e no minuto do vídeo na fase 1?** Sim. É o centro da aprovação e entra na M1.
4. **O app já guarda a UTM de quem se cadastra?** Não. Conferido no código do app e da API em 05/11. Precisa entrar no app antes da fase de dados.
5. **Tracking por API ou exportação?** API: o app manda os números do dia para o Nevo com um token. Exportação em CSV fica como plano B.
6. **Ligar com a API da Meta e do TikTok?** Dá, depois (M5). Exige app aprovado nas duas plataformas e verificação do negócio.
7. **Prazo de cada fase?** Estimativa grosseira: M1 de 1 a 2 semanas, M2 e M3 cerca de 1 semana cada, M4 alguns dias depois que o app mandar os dados.
8. **Notificação para os dois sobre tudo?** Proposta: cada um recebe o que é seu (quem produz recebe ajuste e aprovação; quem aprova recebe o que chegou para aprovar e o prazo de amanhã), e quem quiser liga "tudo" nas preferências.

## Perguntas em aberto (para o Nicolas)
- Visualizador vê o financeiro, ou só Admin e Editor?
- O freelancer entra como membro da empresa PetJourney (com papel só no módulo) ou como convidado sem acesso ao resto?
- Limite de tamanho por vídeo e plano do storage (decide junto com o custo).
- A ala Marketing vira produto para outras empresas clientes depois da PetJourney? Isso muda pouco agora, mas pesa no nome das telas e no que é configurável.

---

## Change Log

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-11-05 | 0.1 | Épico em alto nível a partir do PDF da Leticia: reuso, decisões, fases M1 a M5, riscos, respostas e perguntas | Nicolas (via spec-driven, modo 1) |
| 2026-11-06 | 0.3 | M1 a M3 em produção. Rodada R1 aberta a partir do uso real: Acervo, motor de envio, tarefa do Nevo ligada ao card, convite "Do Nevo", UTM e QR, gaps da auditoria ([r1-acervo-tarefas-convite](../2026/q4/q4-2/ala-marketing/r1-acervo-tarefas-convite.md)) | Nicolas e orquestrador |
| 2026-11-06 | 0.2 | Decisões do Nicolas (Visualizador vê o financeiro; freelancer só com papel na ala; arquivo no máximo do storage; ala de um GRUPO de empresas com o cargo Dono). Fundação + M1 a M3 implementadas por 6 agentes em paralelo, juntadas e auditadas | Orquestrador |
| 2026-11-06 | 0.4 | R1 fechada (AppSelect em e840eb3). Rodada R2 aberta: publicação nas redes (Instagram, Facebook, YouTube, LinkedIn; TikTok em rascunho), resultados do post e de anúncio da Meta, M4 inteira, push e e-mail dos avisos, meta de cadência, prévia do feed, lixeira. Fora: WhatsApp (custo), anúncios do TikTok (outra aprovação), X (API paga). Schema `20261108120000_ala_marketing_r2` aplicado em produção | Orquestrador |
