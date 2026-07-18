# Shogatsu — Localização por GPS, cupom automático, SMS, e mais

## 🍱 Barra de categorias mostra o que já foi adicionado
Cada categoria no menu de navegação do topo agora tem uma bolinha vermelha
com a quantidade de itens daquela categoria já no carrinho — dá pra ver de
relance o que já foi escolhido em cada seção.

## 🔢 Número do pedido simplificado
Antes mostrava "Senha 42" + "Pedido #SGXXXX" separados, o que confundia.
Agora é só **"Pedido nº 42"** — um número só, mais simples de falar e
anotar. O código interno (#SGXXXX) ainda aparece pequeno, só como
referência técnica, em todo lugar: tela do cliente, ícone flutuante,
impressão (navegador e térmica).

## 📍 Localização automática por GPS
Novo botão "📍 Usar minha localização atual" no checkout (modo entrega).
Usa o GPS do celular do cliente + geocodificação reversa gratuita
(OpenStreetMap) pra preencher CEP, rua e bairro sozinho — sem precisar
digitar nada. Funciona com qualquer um dos modos de taxa (fixo/CEP/bairro/
distância), já que só preenche os campos e deixa o cálculo de taxa normal
seguir depois.

## 🖨 Ícone de impressão animado
O botão de imprimir agora "pisca" (efeito de rotação sutil) enquanto o
pedido está sendo enviado pra impressão, dando feedback visual claro de
que algo está acontecendo.

## 🎟️ Cupom automático + animado
- Cupons elegíveis no checkout agora têm um brilho suave (chama atenção
  sem ser irritante).
- Ao abrir o checkout, se existir um cupom pro qual o cliente já é
  elegível (considerando o pedido mínimo), ele é **aplicado sozinho**,
  sem precisar clicar em nada — prioriza frete grátis, depois o de maior
  desconto em R$. Se não for elegível pra nenhum, nada muda, ele pode
  aplicar manualmente como já era possível.

## 👤 Botão "Peça Aqui" após login/cadastro
Depois de criar conta ou entrar, a tela de conta mostra um botão grande
"🍽️ Peça Aqui" que fecha a tela e volta direto pro cardápio.

## 📢 SMS para clientes (infraestrutura pronta)
Nova seção em Configurações → SMS para Clientes:
- Campos pra conta Twilio (Account SID, Auth Token, Número de origem) —
  **precisa de conta própria e paga na Twilio**, isso não tem como ser
  gratuito (é o mesmo tipo de serviço usado por qualquer empresa que manda
  SMS de verdade).
- Lista de clientes cadastrados com checkbox pra selecionar quem recebe.
- Campo de mensagem + botão de enviar, com relatório de quantos enviaram
  com sucesso e quantos falharam.
- Testei a rota sem credenciais configuradas: dá erro claro pedindo pra
  configurar a Twilio, sem travar nada.

## 🐛 Bugs corrigidos
Fiz nova varredura no sistema de impressão e pedidos — não achei bugs
funcionais novos além dos já corrigidos nas atualizações anteriores
(pop-up bloqueado, desconto sumindo do total, alerta sonoro que não
desativava). O botão de imprimir na tela "Gerenciar Pedidos" agora também
tem o texto editável (junto com os outros botões de status).

## Como aplicar
`server.js`, `public/index.html` e `public/painel.html` — os três
mudaram. Substitua e dê push.
