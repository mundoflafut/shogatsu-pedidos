# Shogatsu — v47 — Notas desta versão

## 1. 🖨️ Impressão automática — nova Extensão de navegador (Chrome/Edge)
Além do Agente Local (v46), agora existe uma **extensão de navegador** (`chrome-extension/`)
como forma mais fácil de conseguir impressão automática sem instalar Node.js/terminal:
- Usa `chrome.printing.submitJob` — API real de extensão do Chrome que manda direto pra fila de
  impressão do sistema, sem abrir nenhuma caixa de diálogo.
- Gera o PDF da comanda na hora, sem biblioteca externa (`pdf-lite.js`).
- Configuração de impressora por via feita uma vez só, no popup da extensão.
- O painel detecta sozinho se a extensão está instalada e tenta usá-la primeiro; se não estiver,
  cai pro Agente Local — as duas formas convivem, sem precisar escolher uma só.
- **Limitação honesta:** só funciona em navegadores Chromium (Chrome/Edge), e o PDF gerado é só
  texto (sem logo). Passo a passo completo em `chrome-extension/README.md`.

## 2. 🐛 Bug corrigido — Notificação Push perdia imagem e som
O formulário de campanha (Configurações → Notificações Push) já mandava os campos "imagem" e
"som" desde a v45 — mas o endpoint `POST /api/admin/send-push` nunca lia esses campos do corpo
da requisição, então toda notificação saía sem banner e sem o sinal pro sino oriental tocar.
Corrigido: os dois campos agora chegam de verdade no aparelho do cliente.

## 3. 🐛 Bug corrigido — CEP sumia sem deixar rastro
O campo CEP do checkout era pedido e validado, mas nunca entrava no endereço salvo do pedido —
por isso nunca aparecia em lugar nenhum do painel (cartão do pedido, impressão, WhatsApp).
Corrigido: o CEP agora vai junto no final do endereço salvo.

## 4. 🐛 Bug corrigido — Pedido Manual não puxava dados de clientes conhecidos
Criar um pedido manual pelo painel exigia redigitar nome e endereço toda vez, mesmo pra clientes
que já tinham pedido antes. Agora, ao sair do campo telefone, o painel busca automaticamente
(`GET /api/admin/customer-lookup`) e preenche nome/endereço sozinho — só quando os campos ainda
estão vazios, nunca sobrescrevendo o que a equipe já digitou.

## 5. ✅ Barra de categorias — já estava pronta
Conferimos o pedido de "Sticky Horizontal Navigation" (fixa no topo, scroll horizontal sem barra
visível, centralização automática da categoria clicada, indicador animado estilo iFood, buscador
sempre visível) e essa funcionalidade **já existia** no sistema (de uma versão anterior) — não
precisou recriar nada.

## 6. 🎬 Splash Screen Premium — nova
Tela de abertura com fotos em tela cheia e animação suave (zoom Ken Burns, parallax ou fade),
duração configurável (2 a 5s), botão de pular, e some sozinha caindo na tela inicial.
Administração completa em **Configurações → 🎬 Splash Screen**: ativar/desativar, duração,
efeito de transição, e lista de fotos com reordenação (↑/↓) e remoção.

## 7. Cardápio Popular — edição de itens ficou mais fácil
A lista de itens de cada categoria (Configurações → QR Code & Links → Editar Cardápio Popular)
deixou de ser uma caixa de texto só (onde era fácil bagunçar a formatação "Nome | subtítulo") e
virou uma linha por item — campo de nome, campo de subtítulo opcional, e botões de mover
pra cima/baixo e remover. Os dados salvos continuam no mesmo formato de sempre.

## O que testar antes de publicar
1. Instalar a extensão (`chrome-extension/README.md`), escolher uma impressora e testar via
   painel.
2. Mandar uma campanha push com imagem e conferir que ela chega com o banner no celular do
   cliente.
3. Fazer um pedido de delivery de teste e conferir, no painel, que o CEP aparece no endereço.
4. Criar um Pedido Manual usando o telefone de um cliente que já pediu antes — nome/endereço
   devem preencher sozinhos.
5. Ativar a Splash Screen com 2-3 fotos e abrir o cardápio numa aba anônima pra ver a animação.
