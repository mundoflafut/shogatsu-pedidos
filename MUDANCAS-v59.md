# Shogatsu — v59 — Notas desta versão (Etapa 1 de 6)

Como combinado, a v59 também vai sair por etapas. Esta primeira etapa entrega a reorganização de
botões em **Gerenciar Pedidos** e **Reserva de Mesas**. As próximas (Editar Cardápio estilo iFood,
Configurações com menos abas, previsão de entrega na nota/caixa/delivery, categorias fixas no
cardápio do cliente) vêm nas próximas levas, testadas em separado.

## ✋ Botões com posição editável — Gerenciar Pedidos e Reserva de Mesas
Em três grupos de botões — as abas **Visão Geral / Lista / Kanban**, os filtros da aba **Lista**
(Todos/Novos/Preparando/Prontos/Entregues/Cancelados), e os filtros de **Reserva de Mesas**
(Todas/Pendentes/Confirmadas/Recusadas) — apareceu um botão **✏️ Editar posição** do lado.

- Clicando nele entra em "modo edição": os botões do grupo ganham uma moldura pontilhada dourada
  e um ícone de "arrastar" (⠿), e viram arrastáveis.
- Basta arrastar e soltar cada botão na ordem que preferir.
- Clicando em **✅ Concluir**, a ordem escolhida fica salva no navegador de quem está usando o
  painel (cada funcionário pode organizar do seu jeito, sem afetar os outros computadores/contas).
- Se um botão novo for adicionado numa versão futura, ele aparece automaticamente no fim da lista
  de quem já tinha uma ordem salva — nada quebra.

## Arquivos alterados
- `public/painel.html` — CSS do modo de reordenação (`.reorder-mode`), três grupos de botões
  marcados com `data-reorder-id`, e funções novas (`toggleReorderMode`, `applyButtonOrder`,
  `saveButtonOrder`, `setupReorderDrag`, `restoreAllButtonOrders`) plugadas no `boot()`.

## Testes feitos antes de fechar
- `node --check` em todos os `<script>` de `painel.html`: sem erro de sintaxe.
- Conferido visualmente no código que os três grupos (`pedidos-viewtabs`, `pedidos-filterbar`,
  `reservas-filterbar`) batem entre o HTML e o array `BTN_REORDER_GROUPS` usado no boot.
- Ordem salva é por `localStorage` (mesmo padrão já usado no painel pra tema, sidebar, etc.) —
  não mexe em nada do banco de dados/servidor.
