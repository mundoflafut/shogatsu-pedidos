# Shogatsu — Textos de status e botões editáveis

## ✏️ Personalize os textos do fluxo de pedidos
Em **Configurações → Textos de Status e Botões**, agora dá pra renomear:
- O nome das 4 colunas do Kanban (Novos / Preparando / Pronto / Entregue)
- O texto dos botões de ação (Aceitar Pedido / Marcar Pronto / Confirmar
  Entrega / Cancelar)

Esses textos aparecem tanto no Kanban quanto na lista de Pedidos e no
dashboard — muda em um lugar só e atualiza em todo o painel.

Isso, somado ao que já existia (renomear as vias de impressão), cobre a
parte do painel que faz mais sentido customizar: o vocabulário do fluxo de
trabalho, pra bater com como seu restaurante realmente chama cada etapa.
Não mexi nos botões de utilidade (Editar, Excluir, Salvar, etc.) porque
tornar esses editáveis não traria ganho real e deixaria a manutenção do
sistema mais arriscada — se quiser algo específico aí, me diga qual botão.

## 🐛 Bug encontrado: salvamento "raso" das configurações
Ao salvar configurações, o servidor substituía objetos aninhados inteiros
(estações de impressão, temas, fontes) em vez de mesclar campo por campo.
Na prática isso nunca deu problema visível porque o painel sempre manda o
objeto completo — mas era uma armadilha esperando acontecer (bastaria uma
função futura mandar só uma parte pra apagar o resto sem querer). Corrigido
e testado: rename de uma única via de impressão agora garante que as outras
3 continuam intactas.

## Como aplicar
Substitua `server.js` e `public/painel.html` no seu repositório do GitHub
(o `index.html` não mudou nesta atualização) e dê push — o Render atualiza
sozinho.
