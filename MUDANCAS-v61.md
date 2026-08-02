# Shogatsu — v61 — Chat Express

**Importante**: esta versão foi construída em cima do zip mais recente que você me mandou
(`evolução_v60_plus.zip`), que já tinha uma versão bem mais avançada da ferramenta de
conversas (estilo "WhatsApp Web" de verdade, com lista de conversas + chat, indicador de
"digitando...", upload de foto/áudio e sessão de login persistida). As mudanças abaixo foram
aplicadas em cima dessa base — não voltei pra nenhuma versão anterior.

## ⚡ Renomeado para "Chat Express" + ícone novo
- "💬 Conversas com Clientes" agora se chama **Chat Express**, com o ícone do robô que você
  mandou (usado no cabeçalho do card do painel, no avatar de modo automático — tanto no
  painel quanto no chat do cliente — e no menu de contato do cardápio).
- Arquivo salvo em `public/icons/chat-express-icon.png` (otimizado pra 256×256, ~60KB).

## 🐛 Bug corrigido — caixa de digitar pequena demais
O campo de texto não tinha altura mínima definida, a fonte era pequena (13px) e o teto de
crescimento era baixo (80px) — bem menor que o print do WhatsApp que você mandou como
referência. Agora tem altura mínima confortável (44px), fonte maior (14.5px) e cresce até
130px — aplicado tanto no painel quanto no chat do cliente.

## 🐛 Bug corrigido — áudio reiniciando sozinho no meio da escuta
A tela de conversa se atualiza sozinha a cada 5 segundos. O problema: essa atualização
recriava todas as mensagens sempre, o que interrompia um áudio que estivesse tocando bem no
meio da escuta — parecia que o player "travava" ou reiniciava do zero. Corrigido: agora, se
tiver algum áudio tocando naquela conversa, a atualização daquela rodada é pulada — a
conversa volta a se atualizar normalmente assim que o áudio pausar ou terminar.

## 🔔 Avisos sonoros — enviar, receber e cliente chamando o atendente
Três "assinaturas" sonoras diferentes, geradas na hora (sem precisar de nenhum arquivo de
áudio externo, então funciona em qualquer navegador):
- **Enviar** — um bipe curto, toca ao mandar texto, foto ou áudio pelo painel.
- **Receber** — dois bipes, toca quando chega mensagem nova de um cliente (mesmo se você
  estiver vendo outra conversa).
- **Cliente chamando o atendente** — três bipes num tom diferente e mais chamativo, toca
  quando um cliente pede pra falar com atendente (a hora que mais precisa de atenção rápida).

## 🔕 Botão de silenciar por conversa
Ícone 🔔/🔕 no topo de cada conversa aberta — silencia só aquela conversa (as outras
continuam avisando normalmente). Fica salvo neste navegador; conversas silenciadas mostram um
🔕 do lado do nome na lista, pra você lembrar rapidinho quais estão mudas.

## 📷 Foto: limite subiu para 5MB
Tanto no painel quanto no chat do cliente — servidor e front-end atualizados dos dois lados.
(O áudio continua com o limite de antes, que já era suficiente.)

---

## Arquivos alterados
- `public/painel.html` — ícone/nome Chat Express, correção da caixa de digitar, correção do
  bug de áudio reiniciando, avisos sonoros, botão de silenciar por conversa, limite de foto.
- `public/index.html` — ícone/nome Chat Express, correção da caixa de digitar, limite de foto.
- `server.js` — limite de foto (painel e cliente) subiu pra 5MB.
- `public/icons/chat-express-icon.png` — novo arquivo (ícone do robô).

## Testes feitos antes de fechar
- `node --check` em `server.js`: sem erro.
- Checagem de sintaxe de todos os `<script>` de `painel.html`, `index.html` e
  `entregador.html`: sem erro.
- Balanceamento de `<div>`/`</div>` no `painel.html` inteiro (886/886).
- Conferido que as novas funções (`toggleMuteConversaAdmin`, `atualizarBotaoMuteAdmin`,
  `waAvatarHTML`, `playChatSound`, `atdBeep`) estão definidas uma única vez cada e que os IDs
  referenciados existem no HTML.
- Conferido que `public/icons/chat-express-icon.png` existe e é servido como PNG estático
  pelo `serveStatic` do servidor (mesmo caminho usado por outros ícones do app).
