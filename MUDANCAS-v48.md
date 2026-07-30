# Shogatsu — v48 — Notas desta versão

## 1. 🐛 Bug corrigido — múltiplas telas abertas ao mesmo tempo
As telas cheias do cardápio (Conta, Reserva, Avaliação, Checkout, Acompanhamento do Pedido) só
ligavam a própria classe "aberta" — nada garantia que a tela anterior tivesse sido desligada
antes. Em alguns fluxos (ex: fazer um segundo pedido rapidinho, ou abrir "Conta" enquanto ainda
tinha um pedido sendo acompanhado) duas telas cheias podiam ficar abertas ao mesmo tempo, uma
por cima da outra. Criada uma função central (`openFullScreen()`) que desliga TODAS as outras
antes de abrir qualquer uma — só existe uma tela cheia visível por vez, sempre, garantido.

## 2. Atalho de status no topo da tela
Além do balãozinho flutuante que já existia (aparece quando você minimiza o acompanhamento),
agora tem um botão **"📦 Status"** fixo no cabeçalho, sempre que houver um pedido em andamento —
mais fácil de achar do que rolar a tela até o widget flutuante.

## 3. 🐛 Bug corrigido — "Recebi meu pedido" não sumia depois do admin confirmar
A mensagem/botão pedindo pro cliente confirmar o recebimento continuava aparecendo mesmo depois
do pedido já estar marcado como **Entregue** pelo painel — pedindo pro cliente confirmar uma
coisa que a loja já tinha fechado. Corrigido: agora o botão só aparece enquanto o status é
"saiu para entrega"; assim que vira "entregue" (pelo cliente ou pelo admin), a mensagem some.

## 4. Sobre a mensagem chegando em inglês ("from Shogatsu")
Investiguei bastante e não encontrei nenhum texto em inglês controlável pelo código — tudo no
sistema (títulos de notificação, nome do app, idioma da página) já está em português. A
explicação mais provável, se isso está acontecendo pelo SMS/WhatsApp: contas **Twilio Trial
(gratuitas)** colam automaticamente um aviso em inglês ("Sent from your Twilio trial account -")
na frente de toda mensagem — isso é feito pela própria Twilio, não tem configuração que tire, e
some sozinho assim que a conta vira paga. Adicionei um aviso sobre isso direto na tela de
Configurações → SMS, pra ficar claro de onde vem. Se não for esse o caso, me diga exatamente
onde essa mensagem aparece (notificação push do navegador? SMS? WhatsApp?) que eu vou atrás de
novo com mais detalhe.

## O que testar antes de publicar
1. Fazer um pedido, minimizar o acompanhamento, abrir "Conta" e depois "Reservar Mesa" — só uma
   tela cheia deve aparecer por vez, nunca duas sobrepostas.
2. Com um pedido ativo, conferir que o botão "📦 Status" aparece no topo e reabre o
   acompanhamento ao clicar.
3. Marcar um pedido como "Saiu para entrega" e depois "Entregue" direto pelo painel (sem o
   cliente clicar em nada) — o botão "Recebi meu pedido" no app do cliente deve sumir sozinho.

## Atualização — atalho de status sobrevive a atualizar a página
Descobri que o atalho (balãozinho flutuante + botão "📦 Status") sumia se o cliente atualizasse
a página ou fechasse e reabrisse o navegador, mesmo com o pedido ainda em andamento — o estado
ficava só na memória da aba, que zera a cada carregamento. Agora, ao abrir o site, o sistema
confere se o último pedido salvo ainda está ativo e, se estiver, restaura o atalho sozinho (sem
abrir a tela cheia por conta própria — só deixa disponível pra quem quiser conferir).
