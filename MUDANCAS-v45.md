# Shogatsu — v45 — Notas desta versão

## 1. 🐛 BUG IMPORTANTE corrigido — impressão travava o navegador/sistema
Causa real: `window.print()` é bloqueante — enquanto a caixa de diálogo de impressão está
aberta numa janela, o navegador trava a interação até o usuário confirmar/cancelar. O fluxo
antigo abria as janelas de Caixa/Cozinha/Sushibar/Bar e chamava `print()` em todas quase ao
mesmo tempo — várias caixas de diálogo empilhadas travavam o navegador inteiro.
Agora (`painel.html` → `openBrowserTicket()` + `printOrder()`): cada via avisa quando terminou
de imprimir (evento `afterprint` + `postMessage`, com um tempo limite de segurança de 20s caso
o navegador não dispare o evento) e só DEPOIS disso a próxima via é aberta/impressa. Nunca mais
de uma caixa de diálogo de impressão aberta ao mesmo tempo.

## 2. Notificação estilo apps de delivery + som oriental
- Campo novo "Imagem grande" na campanha de push do painel (Configurações → Notificações Push)
  — deixa a notificação com banner, parecida com apps de delivery.
- `sw.js` envia `image`, `vibrate` e `silent:false` na notificação nativa, e também avisa (via
  `postMessage`) quem estiver com o site aberto na hora pra tocar o sino oriental sintetizado
  (`playAlertOriental()`, em `index.html`) — além do som padrão do celular/computador.

## 3. Coração pulsante com a avaliação
O badge de nota média no topo do cardápio agora é um coração pulsante com a nota dentro, em vez
de só uma estrela com o número do lado.

## 4. Confirmação de entrega pelo cliente — agora avisa o painel
Já existia o botão "Recebi meu pedido" no acompanhamento do pedido — só não avisava ninguém no
painel quando clicado. Agora: o botão fica **pulsante** (chama mais atenção), e ao confirmar o
painel recebe um toast em tempo real ("✅ Entrega confirmada pelo cliente — Pedido Nº X — Fulano
confirmou que recebeu"), com som.

## 5. Todos os botões mudam de cor ao toque
Regra CSS global — cliente e painel admin/master — sem precisar declarar em cada botão que já
existe hoje ou que for criado depois.

## 6. Agendamento e reservas dentro do horário de funcionamento
- **Novo:** `cfg.weekSchedule` — horário configurável por dia da semana (domingo a sábado),
  editável em **Configurações → Dados do Restaurante → 📅 Dias e horário de funcionamento**.
- **Agendar delivery:** agora só é possível PRA HOJE (o campo de data trava no dia atual). Se a
  loja estiver fechada hoje, a opção de agendar nem aparece. O horário só pode cair dentro do
  funcionamento de hoje, respeitando também a antecedência mínima já configurada.
- **Reservas:** ao escolher a data, o sistema avisa na hora se a loja está fechada naquele dia
  da semana. Se estiver aberta, em vez de um campo de hora livre, aparecem **botões de horário
  pré-estabelecidos** (a cada 30 min, dentro do funcionamento daquele dia) — só clicar.

## 7. Ajustes de uso no celular (painel admin/master)
O painel já tinha bastante trabalho de responsividade (menu lateral que vira gaveta, cards que
empilham, tabelas com rolagem horizontal). Reforçado nessa versão: modais ocupam a tela inteira
no celular (mais fácil de preencher com o teclado aberto), campos lado a lado empilham em coluna
única, e botões/campos ganharam altura mínima maior pra ficar mais fácil de tocar.
**Importante:** esse é um ajuste incremental, não uma reforma completa — o painel tem muitas
telas (Dashboard, Kanban, Configurações, Custos...) e cada uma pode precisar de polimento
específico. Se algum ponto continuar difícil de usar no celular, me diga qual tela
especificamente que eu foco nela.

## O que ainda ficou de fora
- Melhorias de UX na edição do Cardápio Popular (v44 já tem o editor funcionando; virou fila
  pra próxima versão — reordenar categorias, pré-visualização ao vivo, etc.)

## O que testar antes de publicar
1. Mandar imprimir um pedido com várias vias (caixa + cozinha + bar, por ex.) e confirmar que
   não trava mais — as janelas devem abrir uma de cada vez, na sequência.
2. Configurar os dias/horário por dia da semana e testar: agendar delivery num dia fechado (a
   opção deve sumir) e fazer uma reserva num dia fechado (deve avisar "fechado").
3. Enviar uma campanha push de teste com imagem, com o site aberto numa aba, e conferir se o
   sino oriental toca.
4. Abrir o painel no celular e testar um modal (ex: editar item do cardápio) — deve ocupar a
   tela inteira e ser fácil de preencher.

## Atualização — Editor do Cardápio Popular (melhorias de UX)
- Botões ↑/↓ pra reordenar grupos de preço, destaques e categorias sem precisar apagar e
  redigitar.
- Botão "⧉ Duplicar categoria" — útil pra categorias parecidas (ex: "Sushis" e "Sushis
  especiais").
- Link "🔗 Pré-visualizar página" no topo do editor, abre a página pública numa aba nova pra
  conferir como ficou depois de salvar.
