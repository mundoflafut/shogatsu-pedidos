# Shogatsu — v51 — Notas desta versão

## 1. Botão "escolher impressora" removido
O botão "🖨▾" (que abria um modal pra escolher em quais vias imprimir) foi removido, como
pedido. O botão "🖨 Imprimir" agora sempre manda pra todas as vias configuradas que tiverem
itens desse pedido, direto — sem esse passo a mais.

## 2. 🐛 Bug corrigido — janela "fantasma" travada em "Carregando pedido..."
Encontrei a causa raiz: a versão anterior abria **uma janela em branco por via** antes de saber
se todas seriam realmente usadas. Se qualquer coisa desse errado no meio do processo de
impressão (a extensão travando numa via, um erro de rede, etc.), as janelas das vias que ainda
não tinham tido a vez ficavam paradas pra sempre com "Carregando pedido..." — exatamente o que
apareceu na imagem que você mandou.

Reescrevi o fluxo de impressão: agora é usada **uma única janela**, reaproveitada pra cada via
impressa via navegador, dentro de um bloco `try/finally` que **garante o fechamento no final**
não importa o que aconteça no meio do caminho. Não tem mais como sobrar janela fantasma.

## 3. 🐛 Bug corrigido — impressão automática pela extensão não funcionava
Achei um bug real no `chrome-extension/background.js`: o "ticket" de impressão mandado pra API
`chrome.printing.submitJob()` era só `{ version: '1.0' }` — um ticket incompleto, sem as opções
de impressão que a API realmente espera (cor, orientação, tamanho de papel...). Isso pode ser
rejeitado silenciosamente pela impressora ou pelo Chrome, sem erro claro nenhum, e o trabalho
nunca sai.

Corrigido: agora a extensão pergunta pra impressora quais são as capacidades dela
(`chrome.printing.getPrinterInfo`) e monta um ticket de verdade a partir da opção padrão de
cada capacidade, antes de mandar o trabalho. **Depois de atualizar, é preciso recarregar a
extensão** em `chrome://extensions` (botão de recarregar no card dela) pra pegar o
`background.js` novo.

## 4. Cardápio Popular — mais fácil de editar
- **Fontes ajustáveis**: título (serifada/moderna/arredondada) e texto (com ou sem serifa).
- **Cor de destaque ajustável**: seletor de cor, aplicada em preços, ícones e detalhes.
- **Tamanho do texto ajustável**: controle deslizante de 85% a 125%.
- **Edição manual (avançado)**: um botão "🛠️ Editar manualmente" abre um campo de JSON com tudo
  o que está configurado — útil pra copiar/colar entre lojas ou fazer ajustes finos que os
  campos individuais não cobrem. Clicar em "Aplicar" recarrega os campos normais a partir do
  JSON colado (upload de fotos e edição por categoria continuam disponíveis como antes).

As fotos de capa e galeria com upload direto + prévia no formato original (sem cortar) já
tinham sido implementadas numa versão anterior — continuam funcionando normalmente.

## O que testar antes de publicar
1. Imprimir um pedido com várias vias e confirmar que abre só UMA janela, imprimindo uma via
   depois da outra, e fecha sozinha no final — mesmo se cancelar uma das caixas de diálogo de
   impressão no meio do caminho.
2. Recarregar a extensão em `chrome://extensions` e testar a impressão automática de novo.
3. Em Editar Cardápio Popular → 🎨 Aparência, trocar a fonte/cor/tamanho e conferir na página
   pública (`/cardapio-rodizio-popular.html`).
4. Testar o "Editar manualmente" — copiar o JSON, mudar algo nele, aplicar, e conferir que os
   campos acima refletem a mudança.
