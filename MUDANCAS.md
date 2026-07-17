# Shogatsu — Impressora no menu principal, ícones, cancelamento e cupom

## 🖨 Botão de impressora movido
Antes ficava um atalho no topo do painel. Agora tem um item fixo no **menu
lateral principal, logo abaixo de "Configurações"** — mais previsível,
sempre no mesmo lugar.

## 🍱 Ícones das categorias do cardápio — maiores e mais visíveis
No site do cliente, os emojis das categorias (no menu de navegação do topo
e nos títulos de cada seção) estavam pequenos, do mesmo tamanho do texto ao
lado. Agora eles têm tamanho próprio, bem maior:
- Ícones da barra de categorias: quase o dobro do tamanho, ficam coloridos
  ao passar o mouse/tocar ou quando a categoria está ativa.
- Ícones dos títulos de seção: bem grandes (32px), com uma sombrinha sutil
  pra destacar mais do fundo escuro.

## ✅ Motivo de cancelamento — agora clicável
Antes, cancelar um pedido abria uma caixinha de texto pra digitar o motivo.
Agora abre uma janela com **botões clicáveis** pros motivos mais comuns
(os mesmos cadastrados em Configurações → Pedidos, se você tiver
configurado; senão usa uma lista padrão), mais uma opção "✏️ Outro motivo"
que libera um campo de texto só quando escolhida. Mais rápido pro dia a
dia, e ainda flexível pra casos fora do padrão.

## 💳 Desconto do cupom agora aparece na via do Caixa
Quando o pedido tem cupom aplicado, o comprovante do Caixa mostra a linha
"🎟️ Cupom XXXX: -R$ X,XX" entre o subtotal e o total — tanto na impressão
pelo navegador quanto em impressoras térmicas de rede/USB. Testado e
confirmado.

## 🎟️ Cupons disponíveis — clicáveis no checkout
Além de digitar o código manualmente, agora aparecem **botõezinhos com os
cupons ativos** logo acima do campo de cupom no checkout. O cliente só
toca no cupom desejado e ele já é validado e aplicado na hora — se o
pedido ainda não atingir o mínimo exigido, o botão aparece "desabilitado"
mostrando a partir de quanto ele vale, sem precisar digitar nada pra
descobrir.

## Sobre "buscar na internet"
Não encontrei uma pergunta específica que precisasse de busca externa desta
vez — o que apareceu na mensagem foram tudo itens de melhoria interna do
sistema, que já cobri acima com testes reais. Se você tinha algo específico
em mente pra eu pesquisar (concorrência, tendências de cardápio, etc.), me
diga o que exatamente que eu busco.

## Como aplicar
Os 3 arquivos mudaram desta vez: `server.js`, `public/index.html` e
`public/painel.html`. Substitua os três e dê push.
