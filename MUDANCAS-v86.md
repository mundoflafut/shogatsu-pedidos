# Shogatsu v86

## 🐛 CORRIGIDO — janela do PowerShell/console do Agente Local podia ser fechada por engano e derrubava a impressão inteira
A tarefa agendada do Windows chamava `node.exe` diretamente. `node.exe` é um programa de
console — mesmo com a tarefa marcada "Hidden" no Agendador (isso só esconde a tarefa da LISTA
do Agendador, **não** a janela!), o Windows sempre abria uma janela preta de terminal com o
agente rodando, que qualquer pessoa da loja podia fechar sem saber o que era — matando o
processo inteiro, parando a impressão automática de **todas** as vias de uma vez.

**Corrigido:** `instalar.ps1` agora gera um lançador oculto (`print-agent/run-hidden.vbs`) e a
tarefa agendada chama ele em vez de chamar `node.exe` direto. O processo continua rodando
normalmente — só não existe mais janela pra fechar por engano.
**⚠️ Precisa rodar `INSTALAR.bat` de novo na loja** (só reiniciar não recria a tarefa).

## 🐛 CAUSA RAIZ REAL — CORRIGIDA: "categoria marcada como Sushibar e mesmo assim não imprime"
Até a v75, cada PRODUTO tinha seu próprio controle de "via de impressão", removido naquela
versão (ficou só na categoria). O problema: a v75 tirou o controle da TELA, mas nunca limpou o
campo `stations` que já estava GRAVADO em cada item desde antes — e a função que decide pra
onde um item imprime continuava checando esse campo do item **primeiro**, só caindo pra
categoria se o item não tivesse nada gravado.

Resultado: **todos os itens do cardápio já tinham `stations: ["cozinha"]` fixado neles desde
antes** (68 itens, conferidos um por um nos dados do zip) — um valor congelado, sem nenhuma
tela pra ver ou mudar. Não importava o que fosse marcado na categoria: o item sempre vencia.

**Corrigido:** a lógica de resolução de via (em `index.html` e em `painel.html`, pro pedido
manual) agora **ignora completamente** esse campo antigo do item — a categoria é a única fonte
de verdade, como a v75 já tinha decidido que deveria ser. Corrigido também o "badge" da
listagem de itens no Cardápio, que mostrava o campo antigo (podia exibir 🍳 mesmo com a
categoria em 🍣) — agora mostra a via que vai imprimir de verdade. Removi de brinde o campo
órfão dos 68 itens no arquivo de dados incluído neste pacote, mas isso é só o snapshot local —
o código corrigido já resolve o problema sozinho, independente disso.

## ✨ NOVO — Escolher manualmente quais vias imprimir
Do lado do botão "🖨 Imprimir" (que continua mandando pra todas as vias configuradas, um clique
só), tem um botão novo **"🖨▾"** — abre uma lista com todas as vias ativas, cada uma já marcada
se o pedido tem item pra ela (e desmarcada, com aviso, se não tem). Marque quantas quiser e
clique em "Imprimir selecionadas" — só essas vias saem. Disponível na lista de pedidos e no
kanban.

## 🐛 CORRIGIDO — impressão triplicada
Causa real: "imprimir automaticamente" (`cfg.print`) é um interruptor **global**, não por
aparelho — todo painel aberto e conectado (qualquer aba, qualquer aparelho) dispara sua própria
impressão sozinho quando um pedido novo chega. Com 2-3 painéis abertos ao mesmo tempo (2 abas
no mesmo PC, ou vários aparelhos com "Terminal de Impressão" marcado — mais comum depois da
orientação da v85), cada um mandava seu próprio pedido de impressão pra cada via, sem saber que
os outros já tinham feito o mesmo — a mesma via saía 2, 3 vezes.

**Corrigido no servidor:** só para disparos automáticos (nunca clique manual — isso sempre
funciona, inclusive o seletor de vias acima), o servidor marca no próprio pedido qual via já
foi auto-impressa; uma segunda tentativa automática da mesma via do mesmo pedido é ignorada,
não importa de quantos painéis venha.

## 🎯 Sobre Delivery e Expedição (retomando da v86 anterior)
Mesma questão de categoria acima, e `print-agent/config.json` não cobria essas duas vias — só
`caixa`, `cozinha`, `sushibar`. Já incluído nesta versão com `delivery` e `expedicao`
adicionadas na mesma impressora única.
**⚠️ Precisa copiar esse `config.json` novo pro computador do agente** e rodar
`REINICIAR-AGENTE.bat`.

## ✅ Testes feitos
- `node --check` em `server.js` e nos blocos de script de `painel.html`/`index.html` — sem erro.
- `onclick`/`onchange` novos conferidos contra as funções que existem de fato.
- `data/config.json` revalidado como JSON após a limpeza dos 68 campos órfãos.
- `print-agent/config.json` revalidado como JSON.
- Conferência manual, caractere por caractere, do escaping do VBScript gerado pelo
  `instalar.ps1` (sem Windows neste ambiente pra rodar de verdade — teste numa loja/computador
  de teste antes de produção, confirmando que nenhuma janela aparece após reiniciar o Windows).

## ⚠️ O que fazer antes de ligar pros clientes
1. Confira de novo se cada categoria está marcada na via certa (Cardápio → editar categoria →
   "Imprime na(s) via(s) de:") — agora que o bug do item não atrapalha mais.
2. Copie o `print-agent/config.json` novo pro computador do agente e rode `REINICIAR-AGENTE.bat`.
3. Rode `INSTALAR.bat` de novo pra pegar a janela oculta.
4. Faça um pedido de teste puxando item de cada categoria (Cozinha, Sushibar, Bar, Delivery,
   Expedição) e confira se cada via saiu exatamente uma vez, na impressora certa.

## ⚠️ O que NÃO foi mexido
- Nenhum dado de pedido ou cliente foi alterado.
- Nenhuma categoria foi marcada automaticamente — isso continua sendo sua decisão, feita no painel.
- `DIAGNOSTICO.bat` continua idêntico (roda o agente visível de propósito, pra debug manual).
