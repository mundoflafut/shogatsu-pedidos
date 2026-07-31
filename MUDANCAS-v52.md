# Shogatsu — v52 — Notas desta versão

## 1. 🐛 Causa raiz encontrada — impressão automática ("printing" is not allowed for specified platform)
Esse erro não era um bug de configuração — é uma **limitação da própria API do Chrome**:
`chrome.printing.submitJob`, usada pela extensão pra imprimir sem abrir caixa de diálogo, só é
permitida em dispositivos **ChromeOS** (Chromebook/Chromebox). Em Windows, Mac ou Linux comuns
— mesmo com Chrome ou Edge — toda tentativa falha com exatamente essa mensagem, não importa a
impressora escolhida.

O que mudou:
- `chrome-extension/background.js` agora detecta esse erro específico e devolve uma mensagem
  clara em vez do texto técnico do Chrome, junto com uma flag `platformUnsupported`.
- `public/painel.html`: quando isso acontece, o pedido **não fica mais sem imprimir** — o
  painel cai automaticamente pro método "Navegador" (abre a caixa de impressão normal do
  Windows/Mac) só nessa via, e avisa o operador com um toast explicando o que aconteceu.
- `chrome-extension/README.md`: corrigido o texto que dava a entender que funcionava em
  qualquer PC — agora deixa claro que a impressão *silenciosa* da extensão só vale a pena em
  Chromebook, e que o **Agente Local** (`print-agent/`) é o caminho certo pra Windows/Mac/Linux.

**Testar:** numa loja com PC Windows/Mac, tentar imprimir com a extensão instalada — antes
falhava com o erro cru; agora deve abrir a janela de impressão do navegador automaticamente
pra essa via, com um aviso explicando o motivo.

## 1.1 🐛 Corrigido — tela de opções da extensão travava (crash) em PC comum
Além do erro acima na hora de imprimir, a **tela de opções** da extensão (onde se escolhe qual
impressora usar por via) quebrava assim que abria em qualquer PC que não fosse Chromebook, com
o erro `Cannot read properties of undefined (reading 'getPrinters')` — porque `chrome.printing`
nem existe fora do ChromeOS (não é que a chamada falha, o objeto inteiro é `undefined`), e o
código chamava `chrome.printing.getPrinters(...)` sem checar isso antes.

Corrigido em `chrome-extension/options.js` e `chrome-extension/background.js`: agora, antes de
qualquer chamada à API, checamos se `chrome.printing` existe. Se não existir, a tela de opções
mostra um aviso claro (em vez de travar em branco) explicando que esse recurso só existe em
Chromebook, e a extensão já devolve a mesma mensagem amigável na hora de imprimir — sem depender
de capturar um erro genérico depois que o crash já aconteceu.

**Testar:** recarregar a extensão, abrir as opções dela num PC Windows/Mac — antes travava com
o erro no console; agora deve mostrar a mensagem explicando a limitação, sem travar a tela.

## 2. 🐛 Causa raiz encontrada — cardápio "cortado" e botões com bug no mobile
O site já tinha barras fixas no topo (cabeçalho, Delivery/Retirada/Reservar Mesa, categorias)
e destaque automático de categoria ao rolar — mas os espaços reservados pra essas barras eram
**valores fixos** (60px de cabeçalho + 48px da barra de modos = 108px), calculados pensando só
no desktop. No celular, sempre que o cabeçalho precisava de mais espaço — nome de loja grande,
banner "restaurante fechado" aparecendo, ícones extras — a altura real ficava maior que esses
valores fixos, e:
- Clicar numa categoria rolava a seção pro topo absoluto da tela, escondendo o título dela
  atrás das barras fixas (o efeito de "cardápio cortado").
- A categoria destacada na barra ficava errada/atrasada em relação ao que aparecia na tela.
- Em telas bem estreitas, os botões Delivery/Retirada/Reservar Mesa podiam ficar espremidos.

O que mudou (`public/index.html`):
- Os espaços das barras fixas agora são **medidos de verdade** em JS
  (`updateStickyOffsets()`), guardados em variáveis CSS (`--header-h`, `--sticky-total-h`) e
  recalculados sempre que a altura muda de verdade — no carregamento, ao girar/redimensionar a
  tela, e via `ResizeObserver` (cobre banner aparecendo/sumindo, nome de loja diferente, etc.).
- Cada seção do cardápio ganhou `scroll-margin-top` baseado nesse valor real — isso corrige o
  "corte" ao clicar numa categoria sem precisar calcular manualmente o scroll.
- O destaque automático de categoria (`setupCategoryObserver`) passou a usar a altura real em
  vez do valor fixo 108.
- Cabeçalho: trocado `height:60px` fixo por `min-height:60px` com `flex-wrap`, pra não cortar
  conteúdo se precisar quebrar em 2 linhas num aparelho muito estreito (agora que os offsets
  são dinâmicos, isso deixou de quebrar o layout).
- Novo ajuste fino pra telas ≤480px e ≤360px: ícones/botões do cabeçalho e da barra de modos
  (Delivery/Retirada/Reservar Mesa) com espaçamento e fonte reduzidos, texto cortado com "…"
  em vez de estourar a linha, e os rótulos menos essenciais (ex: texto "Status") somem nas
  telas mais apertadas mantendo só o ícone.

**Testar:** no celular (ou no modo responsivo do navegador em ~360–390px de largura), rolar o
cardápio, clicar em cada categoria da barra (Favoritos, Rodízio, Combos, Promoções...) e
conferir que o título da seção aparece completo, sem ficar atrás das barras fixas, e que a
categoria destacada acompanha certinho o que está na tela.

## 3. Gravação automática e persistente do formulário de entrega (Painel de Checkout)
Implementado um sistema de rascunho separado do login por conta (PIN) — funciona mesmo pra
quem nunca criou conta. Qualquer alteração nos campos Nome, WhatsApp, CEP, Rua, Número,
Complemento, Bairro, Ponto de Referência ou Cupom é salva automaticamente no `localStorage`
do navegador (com um pequeno atraso pra não gravar a cada tecla). Ao voltar pro site — mesmo
depois de fechar o navegador — os campos são preenchidos de novo sozinhos com o último valor
salvo. Campos já preenchidos (por exemplo, pelo login da conta) nunca são sobrescritos por um
rascunho antigo — o rascunho só completa o que estiver vazio.

**Testar:** preencher o endereço de entrega sem finalizar o pedido, fechar a aba, abrir de
novo e abrir "Finalizar Pedido" — os campos devem vir preenchidos sozinhos.

## O que testar antes de publicar
1. Recarregar a extensão em `chrome://extensions` e tentar imprimir num PC comum (não
   ChromeOS) — deve cair pro método Navegador automaticamente, com aviso explicando o motivo.
2. No celular, navegar pelo cardápio e testar a barra de categorias fixa (clique + rolagem).
3. Preencher o formulário de entrega, fechar e reabrir o site, e conferir que os dados
   continuam lá.
4. Conferir que os botões Delivery / Retirada / Reservar Mesa aparecem completos e sem corte
   em telas de celular estreitas (320–390px de largura).
