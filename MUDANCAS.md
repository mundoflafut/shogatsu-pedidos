# Shogatsu — Dados corretos, auto-horário, impressão ao aceitar

## 📋 Dados do restaurante corrigidos
Endereço, CEP, telefone e WhatsApp atualizados com os valores certos que
você passou:
- Endereço: Av. Gov. Roberto Silveira, 109 · Costazul · Rio das Ostras · CEP 22896-155
- Telefone/WhatsApp: (22) 2764-1333

⚠️ **Atenção importante**: isso corrige o *padrão de fábrica* do sistema
(usado só quando não há nada salvo ainda). Como seu sistema já está no ar
com dados próprios salvos, **esses valores só vão realmente aparecer no
seu site depois que você for em Configurações → Dados do Restaurante /
Contato e confirmar os campos com esses valores, e clicar "💾 Salvar
Tudo"** — eu não tenho como sobrescrever os dados que já estão salvos no
seu servidor no ar a partir daqui.

## 🖨 Impressão: fonte Verdana, tamanho 20
Ajustado como pedido. Mesma ressalva do item acima: confirme em
Configurações → Impressoras → Fonte de Impressão e salve.

## ⏰ Auto-Abertura/Fechamento por horário
Nova seção em Configurações → Dados do Restaurante: ative
"Auto-programação" e defina o horário (já vem com o exemplo 18:00–23:00
preenchido). O restaurante abre e fecha sozinho, sem precisar tocar no
botão manual todo dia — testei com o horário real e o cálculo bateu
certinho, inclusive considerando sempre o horário de Brasília (não o
fuso do servidor, que evita o clássico bug de "abriu 3h errado" quando o
servidor roda em outro fuso).

## 🖨 Impressão abre automaticamente ao aceitar o pedido
Antes você tinha que clicar em "Aceitar" e depois em "🖨 Imprimir"
separadamente. Agora, ao aceitar, a impressão das vias já é disparada na
hora, sozinha.

## ⭐ Avaliação: 5 estrelas já vêm marcadas
Ao abrir a tela de avaliação, as 5 estrelas já aparecem preenchidas — o
cliente satisfeito só precisa tocar em "Enviar", sem precisar marcar nada
(mas pode reduzir a nota se quiser).

## ⭐ Avaliação agora abre pelo cliente OU pelo restaurante
Antes, só abria quando o cliente clicava "Recebi meu pedido". Agora
também abre sozinha **quando o restaurante marca o pedido como
"Entregue"** no painel — não depende só do cliente lembrar de clicar.
Testado: marquei "Entregue" direto pelo painel (sem o cliente fazer nada)
e confirmei que o pedido fica com tudo pronto pra abrir a avaliação
automaticamente do lado do cliente.

## ✕ Removido — substituído por texto claro
Tirei o ícone "✕" (que fechava a tela de acompanhamento) e troquei por um
link de texto "Continuar navegando pelo cardápio", mais claro do que um
X pequeno. Além disso, agora, ao terminar de avaliar (ou pular a
avaliação), o site já volta sozinho pro cardápio — não precisa fechar
manualmente depois.

## Como aplicar
`server.js` e `public/painel.html` mudaram — `public/index.html` também
mudou (várias partes do fluxo do cliente). Os três: substitua e dê push.
