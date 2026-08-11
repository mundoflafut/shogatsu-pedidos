# Shogatsu v84 — Agente de Impressão unificado + 3 bugs corrigidos

## 🖨️ 1. Agente de Impressão — ferramenta nova integrada ao sistema
Existiam DUAS cópias do `print-agent.js` circulando: a de dentro do projeto
(`print-agent/print-agent.js`, mais antiga) e a de dentro do instalador solto
(`SHOGATSU-INSTALADOR-IMPRESSAO/`, mais nova — v83.2). A versão nova corrige um problema sério
no Windows: o pacote nativo `printer` (usado pra falar com impressora USB instalada como
`"printer:NOME"`) está abandonado e não compila mais em versões novas do Node sem Python +
Visual Studio Build Tools instalados — então, em qualquer computador novo, instalar o Agente
Local pra impressora USB simplesmente falhava ("No driver set!").

A versão nova contorna isso sem depender desse pacote: monta o ticket em ESC/POS normalmente,
mas em vez de mandar pra impressora via esse pacote nativo, pega os bytes já prontos
(`getBuffer()`) e manda direto pra fila de impressão do Windows (RAW, via `winspool.drv`),
chamando um script PowerShell auxiliar (`winprint-helper.ps1`) — o mesmo mecanismo que o Bloco
de Notas usa por baixo dos panos pra imprimir, sem precisar de nenhum pacote extra nem
compilador instalado. Impressora de rede (`tcp://IP:porta`) e Linux (`/dev/...`) continuam
funcionando exatamente como antes, sem nenhuma mudança de comportamento.

**O que foi feito**: essa versão corrigida (`print-agent.js` + `winprint-helper.ps1`) agora
está dentro do projeto principal, em `print-agent/`, junto com tudo que já usa (README,
`config.example.json`, `package.json`) — não tem mais duas versões divergentes por aí. O
instalador (`SHOGATSU-INSTALADOR-IMPRESSAO/`) já estava com essa versão, então nada muda pra
quem já instalou por ele.

## 🐛 2. Impressora não imprime em todas as vias marcadas (principalmente em pedido real) — CORRIGIDO
Achei a causa: em `painel.html`, quando chegava um pedido novo com "imprimir automaticamente"
ligado (`cfg.print`), o painel chamava a impressão de cada via **sem avisar o servidor que era
um disparo automático** (faltava o parâmetro `isAuto`). O próprio `server.js` já tinha essa
checagem pronta desde a v55 — quando é um disparo automático de verdade, ele pula um aviso
extra pro Agente Local porque o Agente Local **já recebeu e imprimiu esse pedido sozinho**,
direto, assim que ele chegou (evento `new-order`, sem precisar de nenhum painel aberto). Sem
esse parâmetro, o painel (se estivesse aberto com auto-impressão ligada) mandava um SEGUNDO
aviso de impressão pro mesmo pedido, na mesma via — duas impressões quase simultâneas na MESMA
impressora física, uma pelo caminho automático de verdade e outra pelo disparo duplicado do
painel.

Isso explica o padrão relatado: um teste manual (🖨 Testar) só dispara uma única impressão, por
isso sempre funcionava; já um pedido real, quando chega com o painel aberto e auto-impressão
ligada, disparava duas impressões colidindo na mesma impressora — e uma das vias (ou mais de
uma) simplesmente não saía ou saía cortada.

**Corrigido** em `public/painel.html`: o disparo automático de impressão ao receber `new-order`
agora avisa `isAuto:true` corretamente, igual ao aceite automático de pedidos já fazia.

## 🐛 3. Forma de pagamento não indicava "pagamento na entrega" — CORRIGIDO
PIX é pago ANTES (pelo gateway, ou confirmado manualmente no painel), mas dinheiro, cartão de
crédito e cartão de débito escolhidos num pedido delivery são sempre cobrados só na hora da
entrega — o sistema mostrava só "Dinheiro" ou "Cartão de Crédito" cru (na lista de pedidos, nos
relatórios e nas comandas impressas), sem deixar claro isso pra equipe/motoboy, que às vezes
achava que já estava pago.

**Corrigido** em `server.js`, `print-agent/print-agent.js` e `public/painel.html`: qualquer
forma de pagamento que não seja PIX agora ganha o sufixo **"(Pagamento na Entrega)"** — ou
"(Pagamento na Retirada)", se o pedido for retirada — em toda comanda impressa (rede, USB e
Agente Local) e na lista/relatório de pedidos do painel. PIX continua aparecendo só como "PIX",
já que esse é pago antes.

## 🗑️ 4. Ferramenta "Foto Provisória Global" removida (duplicada) do Editor de Cardápio
Em Cardápio → aba de ferramentas globais existiam DUAS ferramentas: "Foto Provisória Global" e
"Badge Global". A foto provisória era uma ferramenta **duplicada**: cada prato já tem seu
próprio upload de foto individual (Cardápio → Edição → abrir o prato → "Foto do Prato") — ter
uma segunda ferramenta de upload de imagem, só pra cobrir os pratos que ainda não têm foto
própria, confundia qual ferramenta usar (e nenhuma foto enviada por ela nunca substituía a foto
manual mesmo assim, então na prática ela só cobria pratos esquecidos, algo que o próprio upload
individual já resolve).

**Removida por completo**: a aba (renomeada de "🖼 Fotos Provisórias & Badges" pra "🏷 Badge
Global") não tem mais o card de foto — só o Badge Global, que continua 100% funcional. A
aplicação da foto provisória no cardápio do cliente (`public/index.html`) também foi removida;
um prato sem foto própria volta a cair no fallback já existente (logo da loja ou ícone da
categoria).
