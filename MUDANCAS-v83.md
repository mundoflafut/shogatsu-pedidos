# Shogatsu v83 — celular como controle remoto de impressão, diagnóstico direto do sushibar, bug do header iOS

Sua mensagem trouxe uma lista grande (v83 completa). Consegui resolver de ponta a ponta os itens
mais críticos (impressão + os dois bugs concretos que achei); o resto da lista fica detalhado
no final, com o que preciso de você pra seguir.

## 🖨️ Sushibar não imprime — diagnóstico agora aponta a causa exata
Pela sua captura de tela, o Sushibar está ✅ ativo e configurado igual à Cozinha — então não é
um problema de configuração ali. A causa quase certa é o `print-agent/config.json` (no
computador da loja) não ter o Sushibar listado em NENHUMA impressora.

Pra confirmar isso sem você precisar me mandar mais nada: em **Configurações → 🖨 Central de
Impressão**, a caixa de status agora compara as vias ativas em modo Automática contra o que os
agentes conectados realmente cobrem — se o Sushibar estiver nessa situação, vai aparecer um
aviso vermelho explicando exatamente isso, com o passo a passo de como corrigir no
`config.json` (adicionar `"sushibar"` na lista `"stations"` de alguma impressora, e reiniciar o
agente).

## 📱 Celular como controle remoto de impressão (feito)
Pra vias em modo **"Navegador"**: antes, clicar em Imprimir no celular só abria a janela de
impressão NO PRÓPRIO CELULAR (inútil — o celular não tem a impressora ligada nele). Agora:

- Em Configurações → 🖨 Central de Impressão tem um novo checkbox: **"🖥️ Este computador é o
  Terminal de Impressão"** — marca isso só no PC que fica de fato ligado na impressora térmica,
  com o painel aberto o tempo todo (ex.: o computador do caixa).
- Clicar em Imprimir/Reimprimir de QUALQUER outro aparelho (celular, outro PC) agora avisa esse
  terminal por SSE em tempo real, e ele abre a janela e imprime sozinho — o celular vira um
  controle remoto de verdade.
- Isso não muda nada pra quem usa só o modo "Automática" (Agente Local) — essa via já funcionava
  remotamente desde a v54.

## 🍎 Bug do header no iOS — achado e corrigido
O Safari (iOS e macOS) tem um bug documentado nos próprios fóruns de desenvolvedor da Apple:
`overflow-x: clip` (usado desde a v63 pra travar rolagem horizontal sem quebrar `sticky`)
também clipa o eixo Y por engano no WebKit, mesmo com `overflow-y: visible` explícito — só
acontece no Safari, não em Chrome/Firefox. Era exatamente isso que fazia o cabeçalho/barra de
categorias "sticky" sumir atrás do cardápio ao rolar, só no iPhone. Corrigido com uma regra que
mira só WebKit/iOS (via `@supports (-webkit-touch-callout: none)`, uma propriedade que só
existe lá) trocando pra uma combinação que não aciona esse bug — sem afetar o comportamento nos
outros navegadores.
⚠️ Não tenho como testar visualmente num iPhone de verdade a partir daqui — recomendo conferir
depois de publicar, num iPhone real (não só no simulador do Chrome DevTools, que não reproduz
esse bug específico do WebKit).

## Itens da sua lista que ainda ficam pendentes (cada um é grande o suficiente pra merecer sua
própria rodada, em vez de um remendo apressado misturado com os bugs críticos acima):

1. **Galeria de fundos prontos + upload manual de fotos** — precisa de UI nova (grade de
   miniaturas, seleção, exclusão) e um lugar novo pra guardar essas fotos: dá pra reaproveitar o
   `/api/upload` que já existe, mas o desenho da tela merece ser pensado com calma.
2. **Unificar "⏰ Auto-Abertura/Fechamento" com "Dados do Restaurante" e outras ferramentas** —
   pra fazer isso bem, preciso saber exatamente quais telas/ferramentas você quer juntar (tem
   bastante coisa hoje espalhada em Configurações). Consegue listar quais especificamente?
3. **"Tempo Estimado (Retirada)" errado na comanda/app** — esse eu preciso ver primeiro: hoje
   ele é calculado (tempo de preparo de cada item + fila de pedidos em andamento), não fixo. Se
   você quer um valor FIXO e pré-determinado (ex.: sempre "20-30 min"), me confirma isso; se é
   o cálculo automático que está saindo errado, me manda um exemplo (número que apareceu vs. o
   que deveria aparecer) que eu vou direto na causa.
4. **App de pedidos "mínimo e interativo", melhor visualização** — precisa de mais detalhe:
   qual tela especificamente (painel da cozinha? app do cliente?) e o que está sobrando/
   atrapalhando hoje.
5. **Tela dividida pra pedidos simultâneos do mesmo cliente** — hoje, quando o cliente já tem um
   pedido em andamento e faz outro, o quê exatamente está acontecendo de errado agora (os dois
   pedidos se misturam? um substitui o outro? a tela de acompanhamento só mostra um)? Preciso
   entender o sintoma atual antes de desenhar a divisão de tela.
6. **"Meus Pedidos" igual à tela de pedido do PC/mobile** — igual em quê exatamente (layout?
   informações mostradas? os dois já usam o mesmo código de tela hoje, no responsivo — me diz o
   que está diferente que você notou).

**Arquivos alterados nesta versão:** `server.js` (broadcast `print-order-remote` pra vias
Navegador), `public/painel.html` (checkbox Terminal de Impressão, listener SSE, diagnóstico de
via não coberta), `public/index.html` (fix do `overflow-x:clip` só pro WebKit/iOS).

**Testes feitos:** `node --check` em todos os arquivos JS/HTML alterados — sem erro de sintaxe.
Servidor testado ao vivo (sobe normalmente, `/api/print-agent/status` responde certo, página
inicial carrega com HTTP 200).
