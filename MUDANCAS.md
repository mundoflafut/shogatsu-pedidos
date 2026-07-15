# Shogatsu — Evoluções aplicadas

## Fase 1 — Organização e Variações do Cardápio
- Reordenar categorias e itens no painel (setas ▲▼).
- Busca de pratos no painel (todas categorias de uma vez) e no site do cliente.
- Variações de item: grupos de opções (tamanho, sabor, adicionais), escolha
  única ou múltipla, obrigatório ou opcional, cada opção com preço extra.
  No site, prato com variação abre uma tela de personalização antes de ir
  pro carrinho, com preço já calculado.

## Fase 5 — Impressão por Estação (até 4 vias)
Agora existem **dois modelos de impressão** diferentes, de acordo com a via:

**Via CAIXA (comprovante completo)**
- Nome, telefone e endereço do cliente (endereço só se for delivery)
- Horário estimado de entrega/retirada (calculado a partir da hora do
  pedido + o tempo configurado em "Tempo estimado", ex: 40–60 min vira
  "20:40 – 21:00")
- Todos os itens do pedido com preço
- Observações do pedido (se houver)
- Subtotal, taxa de entrega, total e forma de pagamento (com troco, se for
  dinheiro)

**Vias de produção (Cozinha / Sushibar / Bar)**
- Só o número do pedido, horário, modo (delivery/retirada)
- Só os itens daquela estação específica (sem preço — não é comprovante)
- Observações do pedido (útil pra alergias/preferências)
- **Sem nenhum dado pessoal do cliente** (nome/telefone/endereço não aparecem
  mais nas vias de produção — antes apareciam por engano)

**Como usar**
- Cada pedido agora tem um botão **🖨 Imprimir** (na lista de pedidos, no
  Kanban e no card do dashboard). Ele imprime automaticamente só as vias que
  têm itens daquele pedido (ex: se não tem bebida, a via do Bar nem abre).
- Cada via abre numa janelinha separada e já manda pra impressão do
  navegador (funciona com qualquer impressora térmica USB comum ligada no
  computador do caixa/cozinha, sem precisar configurar IP).
- Em Configurações → existe a opção **"Imprimir ao Receber"**: se ativada,
  toda vez que um pedido novo chegar, todas as vias são impressas
  automaticamente, sem precisar clicar em nada. **Esse campo já existia na
  tela mas não estava funcionando (nunca era salvo) — corrigido nessa
  atualização.**
- Se você configurar impressora de rede (IP) ou USB (caminho do dispositivo)
  em Configurações → Impressoras por Estação, a impressão sai direto por lá
  em vez de abrir a janela do navegador — os dois modelos (Caixa completo /
  Produção enxuta) valem pros dois jeitos de imprimir.

## Como aplicar
Substitua `server.js`, `public/index.html` e `public/painel.html` no seu
repositório do GitHub por estes arquivos (ou suba o projeto inteiro) e dê
push — o Render atualiza sozinho.

⚠️ Lembrete de sempre: os dados ainda ficam em arquivos JSON no disco do
Render sem persistência configurada, então um reinício ainda apaga
cardápio/pedidos de teste. Isso é uma questão separada, que já conversamos
antes (fica pra quando o sistema estiver mais "fechado").
