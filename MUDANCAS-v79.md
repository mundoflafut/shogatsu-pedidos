# Shogatsu v79

## ✅ Alerta push simultâneo — PC + celular (mesmo com o painel fechado)
Investigação concluída: a infraestrutura de push (VAPID + `webpush.js`) que já existia pros
clientes já suportava múltiplos aparelhos de sobra — só faltava um canal de inscrição próprio
pro **painel** (a loja), separado do dos clientes.

Agora, em **Configurações → 🔊 Alertas**, tem um botão **"🔔 Ativar alerta push neste
aparelho"**. Ative em cada aparelho que deve avisar (o PC do balcão, o celular do dono, um
tablet da cozinha...) — cada um vira uma inscrição independente, e quando chega **pedido novo**
ou **reserva nova**, o servidor manda a notificação pra todos ao mesmo tempo, de verdade, mesmo
com o painel fechado (o som que já existia só toca com a aba aberta na tela).

A tela mostra a lista de aparelhos ativados (com o nome de quem ativou) e cada um pode ser
removido individualmente. Tem um botão "▶ Testar" pra confirmar que está tudo funcionando sem
precisar esperar um pedido de verdade chegar.

## ✅ Notificações push agendadas e recorrentes
Em **Configurações → 🔔 Notificações Push**, depois de escrever a campanha (título, mensagem,
imagem, destinatários — os mesmos campos de sempre), agora dá pra clicar em **"📅 Agendar essa
notificação"** em vez de enviar na hora: escolhe data/hora e se repete **uma vez, todo dia, toda
semana ou todo mês**. Um checador no servidor roda a cada 1 minuto e dispara sozinho quando a
hora chega — funciona mesmo com o painel fechado. A lista de agendamentos ativos aparece embaixo,
com botão de pausar/reativar e excluir.

*(Ficou de fora por enquanto: a opção "manda quando a loja abrir" — o servidor hoje não tem uma
noção própria de horário de funcionamento pra disparar nisso com segurança; dá pra fazer, mas
merece uma rodada própria pra não usar o horário errado.)*

## Testes feitos antes de fechar
✓ Servidor sobe sem erro com os dois novos arquivos de dados (`admin-push-subs.json`,
`scheduled-push.json`) ✓ Todos os endpoints novos testados via API (criar/listar/pausar/excluir
agendamento; inscrever/listar/testar push do painel) ✓ Criação de pedido testada de ponta a
ponta com o gatilho de push plugado — não quebra nem quando não há nenhum aparelho inscrito ✓
Todo o JavaScript do `painel.html` validado sintaticamente depois das mudanças.

## Ainda em aberto (fica pra próxima rodada)
- **Fotos reais na Galeria de fundos prontos** — tentei buscar fotos de verdade (Wikimedia
  Commons, com licença livre) pra substituir as ilustrações SVG atuais, mas as ferramentas de
  busca disponíveis aqui não me deixam confirmar um link direto e estável pra cada foto — e eu
  prefiro não colar um link "no chute" num sistema que vocês usam de verdade, porque se a foto
  cair ou não for bem a que eu pensei, quebra a galeria sem aviso. Duas saídas boas pra próxima
  rodada: (1) vocês sobem 8–10 fotos próprias (do restaurante, dos pratos) e eu monto a galeria
  em cima delas — fica com a cara de vocês, sem risco de link quebrado; ou (2) eu levanto uma
  lista de links do Wikimedia Commons com URL direta confirmada, um por um, numa sessão focada
  só nisso.
- Simplificar "Editar Cardápio" numa aba só
- Busca global (CTRL+K)
- Compactar os cards de Configurações
- Consolidar "Aparência e Personalização" em subseções recolhíveis
- Design System formal, redesign do Painel de Pedidos, acessibilidade, performance (itens mais
  amplos da v74, ainda em aberto)

## Arquivos alterados
- `server.js` — `ADMIN_PUSH_SUBS_FILE`, `SCHEDULED_PUSH_FILE`, função `sendAdminPush()`,
  endpoints `/api/admin/push/subscribe|unsubscribe|subs|test`, endpoints
  `/api/admin/scheduled-push` (GET/POST/PUT/DELETE), `checkScheduledPush()` + `setInterval` de
  1 minuto, gatilho de push plugado em pedido novo e reserva nova.
- `public/painel.html` — bloco de UI e funções JS do alerta push do painel (Configurações →
  🔊 Alertas) e da seção de agendamento/recorrência (Configurações → 🔔 Notificações Push);
  helpers `apiPut`/`apiDelete` novos.
