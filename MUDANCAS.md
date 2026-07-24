# v19 a v24 — Segurança, Fidelidade, WhatsApp, PIX automático, Favoritos, Relatórios

## v19 — Bugs reais encontrados e corrigidos
- **XSS armazenado no painel**: nome/telefone/endereço/observação do pedido eram inseridos
  direto no HTML sem escapar. Um pedido malicioso podia rodar script no navegador de quem
  opera o painel. Corrigido com uma função `esc()`.
- **XSS armazenado nas avaliações públicas** (mais grave): o comentário de uma avaliação
  aparecia sem escapar pra QUALQUER visitante do site, não só pro admin. Corrigido.
- **Preço de item adulterável pelo cliente**: o servidor aceitava sem checar o preço que o
  navegador mandava ao criar o pedido — bastava editar a requisição pra "pagar" R$0,01 em
  qualquer prato. Agora o servidor valida contra o cardápio real antes de aceitar.
- **Rota duplicada** `GET /api/admin/customers` (a segunda nunca era executada — código morto).
  Mesclada numa só, mais completa.
- **Configuração de chave PIX inexistente no painel**: o servidor já suportava PIX, mas não
  havia NENHUM campo na interface pra cadastrar a chave — PIX nunca funcionava de verdade.
  Adicionado o card "💠 PIX" em Configurações.

## v20 — Programa de Fidelidade (pontos)
Cliente ganha pontos a cada pedido **entregue** (configurável, padrão 1 ponto por R$1) e troca
por desconto no próximo pedido. Calculado ao vivo a partir do histórico de pedidos (sem contador
que possa dessincronizar). Testado ponta a ponta: ganhar pontos → resgatar → desconto aplicado
corretamente → saldo atualizado.

## v21 — Notificações por WhatsApp
Duas camadas: (1) botão manual "💬" em cada pedido, que abre uma conversa no WhatsApp já com a
mensagem de status pronta — funciona sempre, de graça, sem depender de nada; (2) envio automático
opcional via Twilio (mesma conta usada pro SMS), configurável em Configurações → SMS.

## v22 — Confirmação de Pagamento PIX
Botão "✅ Marcar pago" no painel pra confirmação manual (funciona sempre). Estrutura opcional de
webhook `/api/webhook/pix` pronta pra integrar com Mercado Pago (confirmação 100% automática) —
exige conta própria e Access Token de produção, configurável em Configurações → PIX.

## v23 — Favoritos no cardápio do cliente
Cliente marca pratos favoritos (coração no card) e filtra o cardápio só pelos favoritos.
Guardado no navegador do próprio cliente, sem precisar de conta.

## v24 — Relatórios evoluídos
Página de Relatórios ganhou: cards de KPI (faturamento, pedidos e ticket médio dos últimos 7
dias), faturamento por forma de pagamento e ranking dos pratos mais pedidos — além do que já
existia (gráfico de barras, histórico e exportação CSV). De brinde, corrigi mais um XSS
(nome do cliente sem escapar na tabela de histórico).

---



## 🐛 Bug real encontrado e corrigido: fechamento automático da impressão
Ao mexer na correção do bloqueio de pop-up (atualização anterior), acabei
introduzindo sem querer um bug onde o texto `</script>` dentro do ticket
impresso quebrava a página por trás — o tipo de bug que só aparece de
verdade no navegador. Peguei isso numa checagem de sintaxe antes de
liberar, corrigi, e aproveitei pra deixar o fechamento automático da
janela de impressão **mais confiável**: agora tem um evento principal
("depois de imprimir" fecha sozinho) e um limite de segurança de 45s caso
o navegador não dispare esse evento — nunca mais deve ficar uma janela de
impressão aberta pra sempre.

## ⚡ Avaliação abre mais rápido quando o restaurante marca "Entregue"
O aplicativo do cliente verifica o status do pedido a cada 2 segundos
agora (era a cada 5). Isso deixa a abertura automática da avaliação —
seja pelo cliente clicando "Recebi" ou pelo restaurante marcando
"Entregue" — bem mais parecida com "no mesmo momento", já que o atraso
máximo cai de 5s pra 2s.

## 🔢 Dois pedidos não podem mais ter o mesmo número
Se o caixa digitar manualmente um número de pedido que **já está sendo
usado por outro pedido ainda em andamento** (não entregue, não
cancelado), o sistema recusa com uma mensagem clara dizendo qual pedido
já está com aquele número, e pede pra escolher outro. Pedidos já
entregues ou cancelados liberam o número de novo pro ciclo normal.
Também blindei a atribuição automática (quando você aceita sem digitar
nada) pra pular qualquer número já em uso, mesmo em cenários raros de
muitos pedidos simultâneos.

Testei os dois cenários rodando o servidor: número repetido → recusado
com mensagem clara; número diferente → aceito normalmente.

## Como aplicar
`server.js` e `public/painel.html` mudaram — `public/index.html` também
mudou (intervalo de verificação). Os três: substitua e dê push.
