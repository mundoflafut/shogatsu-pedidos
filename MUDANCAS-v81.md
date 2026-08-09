# Shogatsu v81 — correção de bugs + reorganização do push

## 🐛 Alerta push simultâneo (PC + celular) "às vezes não chega em nenhum aparelho" — CORRIGIDO
Causa encontrada: pedido novo e reserva nova sempre usavam a **mesma `tag` fixa** em toda
notificação daquele tipo (ex: sempre `shogatsu-novo-pedido`, sempre `shogatsu-nova-reserva`).
O navegador usa a `tag` pra decidir se substitui uma notificação já existente — e substituir
sem `renotify:true` acontece **em silêncio**: sem som, sem vibração, sem a tela acender de
novo. Numa loja corrida, se o alerta do pedido anterior ainda estava parado na tela (ninguém
tinha dispensado), o próximo pedido "chegava" de verdade (o servidor confirmava 200 OK), só
que substituía o anterior sem avisar ninguém — daí a sensação de "às vezes não chega em
aparelho nenhum".

Corrigido em duas camadas, pra não depender só do comportamento de um navegador específico:
- **`server.js`** — a tag agora inclui o ID do próprio pedido/reserva
  (`shogatsu-novo-pedido-SG...`, `shogatsu-nova-reserva-RS...`), então dois avisos nunca mais
  colidem na prática.
- **`public/sw.js`** — adicionado `renotify:true` em toda notificação da loja, como segunda
  camada de proteção: mesmo que algum aviso repita uma tag no futuro, o navegador é obrigado a
  re-tocar som/vibração ao substituir.

## 🔉 Volume no alerta push simultâneo
O volume do som de uma notificação do sistema (a que toca com o painel fechado) é sempre
controlado pelo próprio aparelho — não existe, na API padrão de notificações do navegador, um
jeito de definir um volume numérico customizado pra ela. Em vez de fingir resolver isso, o que
foi implementado é o controle que É possível:

- Novo checkbox **"🔇 Silenciar som do sistema neste aparelho"** (Configurações → 🔔
  Notificações Push → alerta da loja). Quando marcado, esse aparelho específico para de tocar o
  som do sistema pro alerta de pedido/reserva/atendente — e passa a depender só do som do
  próprio painel (que aí sim respeita o slider **🔊 Alertas → 🔉 Volume do alerta**), enquanto o
  painel estiver aberto ali.
- É uma preferência **por aparelho** (salva junto da inscrição push dele em
  `admin-push-subs.json`), igual o volume já era "só neste aparelho/navegador" — cada aparelho
  decide o que faz mais sentido pra ele: o PC do balcão (painel sempre aberto) pode silenciar o
  som do sistema e confiar só no som configurável; já um celular que fica no bolso, com o painel
  fechado a maior parte do tempo, deve manter o som do sistema ligado (senão não avisa nada).
- A lista de aparelhos com alerta ativado agora mostra um 🔇 do lado dos que estão com o som do
  sistema desligado, pra ficar visível de longe.

## 🗂️ Simplificação — tudo de push num lugar só
A seção **"📱💻 Alerta push simultâneo"** (o alerta que avisa a LOJA de pedido/reserva/atendente
chamado) estava meio escondida dentro do card **🔊 Alertas**, longe da seção de campanha/
agendamento push pro CLIENTE, que já morava no card **🔔 Notificações Push**. As duas coisas se
chamam "push", mas confundiam: uma é "avisar quem trabalha aqui", a outra é "avisar o cliente
sobre promoção". Agora as duas vivem juntas dentro do card 🔔 Notificações Push (a seção da loja
primeiro, deixando claro que é diferente da campanha pro cliente logo abaixo), e o card 🔊
Alertas ficou só com o que é dele de verdade: o som local do painel (toggle + volume + teste).
Nenhuma funcionalidade foi removida — só reorganizada num lugar só, como pedido ("tudo numa só
aba"). Ainda não mexi em mais nada além disso na varredura por enquanto — se quiser que eu
continue simplificando outras coisas que notei pelo caminho (ex: os 5 sons de teste em 🔊
Alertas, que hoje só o "oriental" é realmente usado nos alertas automáticos), me avisa que entro
nisso na próxima rodada.

## Testes feitos antes de fechar
✓ `node --check` em `server.js`, `public/sw.js` e todo o JavaScript inline de `painel.html` e
`index.html` — sem erros de sintaxe ✓ Servidor sobe sem erro ✓ Testado ao vivo via API: login →
ativar alerta push com `silent:true` → confere na lista → trocar pra `silent:false` sem perder o
aparelho → desativar → lista volta vazia ✓ Testado ao vivo via API: `GET
/api/admin/scheduled-push` sem login continua bloqueado (403), como antes ✓ Testado ao vivo via
API: criar 2 pedidos e 1 reserva seguidos, sem nenhum aparelho inscrito — não derruba o servidor,
segue normal (mesma proteção de antes, `sendAdminPush` nunca rejeita) ✓ Conferido que as tags
geradas usam o ID real do pedido/reserva ✓ Sem IDs duplicados no HTML depois de mover a seção de
alerta da loja pro card 🔔 Notificações Push.

## Arquivos alterados
- `public/sw.js` — `renotify:true` na notificação da loja; honra `data.silent` por envio (era
  sempre `false`, ignorando qualquer preferência).
- `server.js` — tags de pedido/reserva agora incluem o ID (evita colisão); `sendAdminPush()`
  monta o payload por aparelho, aplicando o `silent` salvo de cada inscrição; `POST
  /api/admin/push/subscribe` aceita e guarda `silent` por aparelho (preserva o valor salvo se a
  requisição não mandar nada, pra não resetar sozinho numa reinscrição automática); `GET
  /api/admin/push/subs` agora devolve `silent` de cada aparelho.
- `public/painel.html` — seção "Alerta push simultâneo" movida do card 🔊 Alertas pro card 🔔
  Notificações Push; novo checkbox de silenciar som do sistema (`toggleAdminPushSilent`); estado
  do checkbox é carregado/refletido a partir do aparelho atual; 🔇 aparece ao lado do nome do
  aparelho na lista quando está com o som do sistema desligado.
