# Spec: Agendamento público (estilo Calendly) via Google

**Status:** Implementado, aguardando migration e deploy
**Criado em:** 2026-11-19
**Versão:** 1.0
**Repos:** `workflow-api` (migration `20261119120000_booking_pages` + módulo `booking/` + correções do OAuth do Google) e `work-flow` (feature `booking/`)

---

## Visão geral

Cada pessoa do Nevo pode ter uma página pública (`/agendar/<slug>`) onde
clientes e parceiros escolhem um horário livre e marcam uma reunião. A reunião
nasce no Google Calendar do anfitrião com link do **Google Meet**, e o Google
manda o convite por e-mail para o convidado. Remarcar e cancelar acontecem por
um link que vai dentro do próprio convite (`/reuniao/<token>`), sem login.

## Motivação

Pedido direto do Emílio (Fluviotec): "a agenda do Emílio conecta via Google no
Calendly, as pessoas veem a disponibilidade dele e marcam um horário. O que
importa muito: fuso horário." Com reuniões recorrentes chegando (PetJourney,
reuniões mensais/semanais da Letícia), o time precisava de um lugar onde
"marcar com o Emílio" funcione sem troca de mensagens. O Nevo tinha a conexão
com o Google, mas quebrada (ver "Correções no OAuth").

---

## Fluxos

**Anfitrião** (`/agendamentos`, logado, pessoal, não depende da empresa ativa):

1. Conecta o Google (mesma conexão do `/calendar`).
2. Escolhe o endereço e o fuso. A página nasce pronta: seg-sex, 09-12 e 13-18,
   com um tipo "Reunião de 30 minutos".
3. Ajusta tipos de reunião, horários semanais, datas específicas (viagem,
   folga) e copia o link.
4. Acompanha as reuniões (próximas, passadas, canceladas) e cancela se precisar.

**Convidado** (sem login):

1. `/agendar/<slug>`: escolhe o tipo (com um tipo só, vai direto ao calendário).
2. `/agendar/<slug>/<tipo>`: escolhe dia e horário, no fuso DELE (detectado do
   navegador, trocável na tela), informa nome, e-mail e assunto.
3. Confirmação com o resumo e o link do Meet. O convite do Google chega no
   e-mail, com o link de remarcar/cancelar na descrição.
4. `/reuniao/<token>`: vê, remarca ou cancela. O Google avisa a outra parte.

---

## Decisões

| # | Decisão | Por quê |
|---|---|---|
| D1 | Disponibilidade guardada em "HH:MM" **no fuso do anfitrião**, convertida para instante só no cálculo | UTC guardado quebra duas vezes por ano em fuso com horário de verão e toda vez que o anfitrião viaja e troca o fuso |
| D2 | O servidor fala só em **instantes ISO UTC**; a tela decide o fuso | O convidado vê no fuso dele, o anfitrião no dele. Um horário 23:30 de SP aparece no dia seguinte para quem está em Lisboa |
| D3 | O POST só aceita horário que a página **oferece** (mesma função de `/slots`) | Sem isso, qualquer instante inventado pelo cliente (fora do expediente, desalinhado) seria aceito |
| D4 | Ocupado = **free/busy do Google** + reservas confirmadas no banco | O Google cobre a agenda real; o banco cobre a janela entre reservar e o Google saber |
| D5 | **Falha fechado**: sem Google conectado ou com Google fora do ar, não há horário | Mostrar horário sem conseguir conferir a agenda é oferecer horário ocupado |
| D6 | Corrida resolvida com **advisory lock por anfitrião** + checagem no banco dentro da transação | Dois convidados no mesmo segundo: o segundo leva 409. `EXCLUDE USING gist` exigiria a extensão `btree_gist` no deploy |
| D7 | Google falhou ao criar = **a reserva sai** (503) | Reunião sem convite e sem sala do Meet é pior que um erro pedindo para tentar de novo |
| D8 | Convite e avisos pelo **próprio Google** (`sendUpdates: 'all'`), sem e-mail do Nevo | É o convite do Google que entra no calendário das pessoas, em qualquer provedor |
| D9 | Remarcar/cancelar por **token de 192 bits** no link do convite | Convidado não tem conta. O token É a autorização; nunca aparece na listagem do anfitrião |
| D10 | Tipo de reunião é **arquivado**, nunca apagado; o slug ganha sufixo | Reuniões já marcadas continuam de pé e o link pode ser reaproveitado |
| D11 | Reunião vira também um `Event` pessoal do anfitrião (espelho) | Aparece no `/calendar` na hora, sem esperar o sync de 3 min |

### Fuso horário (o ponto que o pedido destacou)

- Conversão hora de parede → instante em `booking/engine/tz.ts`, só com `Intl`
  (sem lib). O offset é consultado **no instante convertido**: o mesmo 09:00 é
  UTC-5 em janeiro e UTC-4 em julho em Nova York.
- Hora que não existe (pulo do horário de verão) é empurrada para frente; hora
  repetida (volta do horário de verão) fica com a primeira ocorrência.
- O fatiamento em horários é feito em **instantes**, depois da conversão, para
  a reunião que atravessa a troca de horário ter a duração certa.
- Horizonte ("até 60 dias") contado em **dias civis** do anfitrião.
- A tela mostra o fuso usado ("Horário Padrão de Brasília (GMT-3)"), deixa
  trocar com busca por cidade/offset e, quando os fusos diferem, mostra as duas
  horas ("10:00 para Emílio (GMT-3)").
- Testes cobrem SP, Nova York (as duas transições de 2026), Kolkata (meia
  hora), Kiritimati (UTC+14) e a ida e volta.

---

## Modelo de dados (migration `20261119120000_booking_pages`, aditiva)

- `User.googleEmail` (nullable): qual conta Google está ligada, para exibição.
- `BookingPage` (1 por usuário): `slug` único, `timezone`, `displayName`,
  `headline`, `active`, `weeklyHours` (JSON), `dateOverrides` (JSON).
- `BookingEventType`: `slug` único por página, `title`, `description`,
  `durationMin`, `slotStepMin`, `bufferBeforeMin`, `bufferAfterMin`,
  `minNoticeMin`, `maxDaysAhead`, `dailyLimit`, `active`, `position`,
  `archivedAt`.
- `Booking`: `startAt`/`endAt`, `status` (CONFIRMED/CANCELED), dados do
  convidado, `inviteeTimezone`, `manageToken` único, `googleEventId`,
  `meetLink`, `eventId` (espelho), `rescheduleCount`, dados de cancelamento.

A migration usa `IF NOT EXISTS` em tudo e é aplicada com
`node scripts/run-prod-migration.mjs 20261119120000_booking_pages`.

## API

Anfitrião (JWT, sem `x-company-id`):

| Método | Rota | O quê |
|---|---|---|
| GET | `/booking/page?fresh=1` | Página + tipos + saúde do Google + sugestão de slug |
| PUT | `/booking/page` | Cria (1ª vez) ou atualiza página/horários |
| GET | `/booking/page/slug-check?slug=` | Endereço livre? |
| POST/PATCH/DELETE | `/booking/event-types[/:id]` | Tipos de reunião (DELETE arquiva) |
| GET | `/booking/bookings?scope=upcoming\|past\|canceled` | Reuniões |
| POST | `/booking/bookings/:id/cancel` | Cancela e avisa pelo Google |

Público (sem login, com limite por IP):

| Método | Rota | Limite |
|---|---|---|
| GET | `/public/booking/pages/:slug` | 60/min |
| GET | `/public/booking/pages/:slug/:eventSlug` | 60/min |
| GET | `/public/booking/pages/:slug/:eventSlug/slots?start&end` (máx. 45 dias) | 40/min |
| POST | `/public/booking/pages/:slug/:eventSlug/book` | 5 a cada 10 min |
| GET | `/public/booking/manage/:token` (+ `/slots`) | 30-40/min |
| POST | `/public/booking/manage/:token/reschedule` e `/cancel` | 5 a cada 10 min |

Códigos que a tela trata de forma diferente: **409** (horário tomado → volta ao
calendário recarregado), **429** (limite de 3 reuniões futuras por e-mail com o
mesmo anfitrião), **503** (Google indisponível, nada foi marcado).

## Correções no OAuth do Google ("quebrado mas tem")

1. O callback redirecionava fixo para `https://stackroads.vercel.app/calendar`:
   em qualquer outro domínio a conexão "não funcionava". Agora usa
   `FRONTEND_URL` (o domínio antigo continua como fallback) e volta para a tela
   que pediu (`?returnTo=`, só caminho relativo).
2. O `state` era o id do usuário puro: qualquer um podia ligar a própria conta
   Google à conta de outra pessoa e receber os eventos dela. Agora é um JWT
   assinado com segredo DERIVADO (o `JWT_SECRET` puro faria o state valer como
   token de login), com 15 min de validade.
3. Erro no callback respondia JSON de 500 para o navegador; agora sempre
   redireciona com `?sync=error`.
4. `refresh_token` ausente não apaga mais a conexão existente.
5. Reunião apagada direto no Google (ou pelo `/calendar`) cancela a reserva,
   liberando o horário na página. Apagar pelo `/calendar` avisa o convidado.

## Notificações para o anfitrião

Socket `booking:changed` (a tela atualiza sozinha) e Web Push "Nova reunião
agendada / remarcada / cancelada pelo convidado", que abre `/agendamentos`
(`public/idle-sw.js` roteia `kind: 'booking'` por `data.url`, só caminho
relativo).

---

## Para colocar no ar

1. Aplicar a migration (banco de dev primeiro):
   `node scripts/run-prod-migration.mjs 20261119120000_booking_pages`.
2. API: definir `FRONTEND_URL` com o domínio real do front (o boot avisa se
   faltar em produção).
3. Google Cloud Console:
   - `GOOGLE_REDIRECT_URI` precisa estar em "Authorized redirect URIs".
   - Tela de consentimento **publicada** ("In production"). Em "Testing" o
     Google expira a autorização em 7 dias e a página sai do ar sozinha (o
     painel mostra "A conexão com o Google parou de funcionar" com o botão de
     reconectar).
4. Quem já tinha o Google conectado deve reconectar uma vez para o e-mail da
   conta aparecer no painel (o resto funciona sem isso).

## Fora do escopo (próximos passos)

- Conferir conflitos em calendários além do principal (hoje: `primary`).
- Perguntas personalizadas no formulário do convidado.
- Página de equipe / round-robin (marcar com "alguém do comercial").
- Lembrete próprio por e-mail/WhatsApp antes da reunião (hoje: lembretes do Google).
- `googleRefreshToken` continua em texto puro no banco (já era assim); cifrar
  com o `CryptoService` exige migrar os tokens existentes.
