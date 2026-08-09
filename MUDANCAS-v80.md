# Shogatsu v80 — correção de bugs

## 🔇 Sons do Painel mudos — CORRIGIDO
Causa: em `public/painel.html`, todo som (alerta de pedido novo, sino de reserva, os 5 sons de
teste em Configurações → 🔊 Alertas) ligava o controle de volume nele mesmo
(`_mg.connect(_mg)`) em vez de ligar na saída de áudio de verdade (`_mg.connect(ctx.destination)`).
Isso deixava **todo** som do painel mudo, mesmo com o volume no máximo. Corrigido nas 6
ocorrências. O cardápio do cliente (`index.html`) não tinha esse bug — só o painel.

## 🔔 Notificação push parou de chegar no celular — mitigado
Navegadores (Chrome/Android é o caso mais comum) podem trocar a inscrição push sozinhos em
segundo plano, sem avisar a página — o app continua mostrando "notificações ativadas", mas o
endereço salvo no servidor fica inválido e as notificações somem, sem erro nenhum. Adicionado o
tratamento padrão pra isso: `sw.js` agora escuta o evento `pushsubscriptionchange` e reinscreve o
aparelho sozinho, reenviando pro servidor automaticamente — tanto pro chat/pedidos do cliente
quanto pro alerta do painel (que guarda também o token de sessão, já que essa rota exige login e
o Service Worker roda sem sessão de página aberta).
*(Se mesmo assim não chegar, o próximo suspeito é a permissão de notificação do site ter sido
revogada manualmente nas configurações do celular — nesse caso só reativando na mão resolve.)*

## 📅 Agendamento de push agora pode enviar várias vezes ao dia
Antes só existia "uma vez / todo dia / toda semana / todo mês" (mínimo 1x por dia). Nova opção
**"🔁 Várias vezes ao dia"** em Configurações → 🔔 Notificações Push, com campo pra escolher de
quantas em quantas horas repetir (ex: a cada 4h). Implementado com o campo `intervalMinutes` e a
recorrência `hourly` (`server.js` + `painel.html`).

## ⋮ Botão "Mais opções" travando — CORRIGIDO
No menu "⋮" dos cards de Configurações, clicar em "👁️ Ocultar/Mostrar conteúdo" desativava o
clique (`pointer-events:none`) no card **inteiro** — inclusive no próprio botão "⋮", que é filho
do card. Resultado: depois de ocultar um card uma vez, o menu ficava travado, sem jeito de
reverter pelo próprio botão. Corrigido: o título (onde mora o "⋮") agora sempre continua
clicável, mesmo com o resto do card oculto.

## 🙋 Atendimento IA agora notifica quem foi chamado, mesmo com celular fechado
Quando o cliente clica em "Falar com atendente" no Chat Express, dispara agora o mesmo alerta
push simultâneo (PC + celular, funciona com o painel/app fechado) que já existia pra pedido novo
e reserva nova — quem for chamado sabe na hora, numa tela, mesmo longe do balcão.

## 🍣 IA passa a oferecer diretamente as opções do cardápio
- Botão fixo **"🍣 Ver o cardápio"** sempre visível no Chat Express (não depende de nenhuma FAQ
  cadastrada) — um toque já pergunta pra IA e ela lista os pratos.
- Instruções da IA reforçadas: sempre que o cliente pedir "o cardápio", "opções", "o que vocês
  têm" ou parecer indeciso, a IA agora lista os pratos com preço e recomenda 2-3 opções, em vez
  de só responder se perguntada de um jeito bem específico ou mandar o cliente olhar a tela.
- Mensagem de saudação do chat atualizada pra deixar essa opção clara desde o início.

## Testes feitos antes de fechar
✓ Servidor sobe sem erro ✓ Todo o JavaScript de `index.html`, `painel.html`, `sw.js` e das
demais páginas públicas validado sintaticamente (`node --check`) ✓ Testado ao vivo via API:
criar conversa → pedir atendente humano (dispara o push sem quebrar mesmo sem ninguém inscrito)
✓ Testado ao vivo via API: criar agendamento "várias vezes ao dia" com intervalos de 4h e 30min
— matemática de repetição conferida ✓ `GET /api/admin/scheduled-push` sem login continua
bloqueado (403), como antes.

## Arquivos alterados
- `public/painel.html` — correção do `_mg.connect(_mg)` (6x); correção do `pointer-events` no
  menu "⋮"; UI de recorrência "várias vezes ao dia" (Configurações → 🔔 Notificações Push);
  recibo de reinscrição push (`shogatsu-push-meta`) no ativar/desativar alerta do painel.
- `public/index.html` — chip fixo "🍣 Ver o cardápio" no Chat Express; saudação atualizada;
  recibo de reinscrição push no ativar/desativar notificações do cliente.
- `public/sw.js` — evento `pushsubscriptionchange` (reinscrição automática em segundo plano).
- `server.js` — recorrência `hourly` + `intervalMinutes` em `/api/admin/scheduled-push`
  (POST/PUT) e em `computeNextSend()`; push automático em `/api/atendimento/:id/humano`;
  instruções da IA reforçadas em `perguntarIA()` pra oferecer o cardápio proativamente.
