# Shogatsu v73 — Mudanças

## 1) Relatório de Taxas de Motoboy (Relatórios → 🛵 Taxas de Motoboy)
- Novo endpoint `GET /api/admin/courier-report` (server.js): calcula entregas e valor a pagar
  por motoboy, agrupado por bairro.
- Filtros: período (De/Até) e motoboy específico.
- Duas visualizações: **Juntos** (todos os motoboys somados, por bairro) e **Separados** (um
  bloco por motoboy, com a quebra por bairro dele).
- Botão **🖨 Imprimir** — abre um documento pronto pra impressão com os totais e uma **linha de
  assinatura** por motoboy (ou geral, no modo Juntos), pra controle físico da entrega do dinheiro.
- Nova configuração em **Configurações → 🚚 Delivery → 🛵 Pagamento de Motoboy**: valor fixo por
  entrega, ou valor por bairro (independente da taxa cobrada do cliente).
- Só entram no relatório pedidos com `mode: 'delivery'`, `status: 'entregue'` e motoboy atribuído
  (`courierName`).
- Cada pedido agora grava o bairro (`order.hood`) separadamente — extraído automaticamente do
  endereço pra pedidos antigos.

## 2) 🖼 Fotos Provisórias & Badges (Cardápio → nova aba ao lado de "Edição")
- Nova aba no painel de Cardápio, sem alterar o layout/fontes/cores/tema existente.
- **Foto Provisória Global**: uma imagem usada automaticamente em todo produto sem foto própria.
  Assim que o produto ganha foto manual, para de usar a provisória sozinho (a manual nunca é
  substituída). Botões: Alterar/Selecionar Foto, Remover Foto, Ativar/Desativar.
  Configurações: Posição (esquerda/direita/acima), Modo (preencher/ajustar/cortar),
  Arredondamento (nenhum/pequeno/médio/grande).
- **Badge Global**: selo (texto + ícone) exibido automaticamente em todos os produtos, com
  configuração completa: cor de fundo, cor da fonte, tamanho, peso, transparência, borda, raio da
  borda, espaçamento interno, sombra e posição (acima/abaixo/sobre a foto, acima/abaixo do nome,
  cantos superiores).
- **Pré-visualização em tempo real** de tudo isso, num card de exemplo.
- **Herdar Global / Personalizar / Sem badge** por item — na edição de cada prato (modal existente),
  sem mexer no restante do modal.
- O cardápio público (`index.html`) já aplica a foto provisória e o badge global automaticamente
  onde o prato não tem foto/badge próprio.

## Arquivos alterados
- `server.js` — config (`placeholderPhoto`, `globalBadge`, `courierPay`), `order.hood`,
  `GET /api/admin/courier-report`.
- `public/painel.html` — aba Fotos Provisórias & Badges, relatório de motoboy, config de
  pagamento de motoboy, ajustes no modal de item e na listagem de itens.
- `public/index.html` — fallback de foto/badge no cardápio do cliente, campo `hood` no checkout.
