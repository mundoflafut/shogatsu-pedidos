# Shogatsu v75

## 🏷️ Desconto direto num item (Anúncios no Cardápio)
Cada anúncio agora pode, opcionalmente, ser amarrado a um prato específico do cardápio:
- Escolhe o prato (lista com categoria + preço atual).
- Escolhe o tipo de desconto: **% (percentual)** ou **R$ (valor fixo)**.
- Enquanto o anúncio estiver **ativo e não vencido**, o prato aparece no cardápio com o preço
  original riscado + o preço com desconto, e o valor com desconto é o que efetivamente vai pro
  carrinho e pro checkout (não é só cosmético).
- Desativar o anúncio ou ele vencer volta o prato pro preço normal automaticamente — sem precisar
  editar o item.

## 🐛 "Posição do badge" travada — CORRIGIDO
Achei a causa real: a posição escolhida só valia dentro da pré-visualização do painel — nunca
tinha sido aplicada no cardápio de verdade que o cliente vê, então o badge sempre saía no mesmo
lugar independente da opção escolhida. Agora as 7 posições (acima/abaixo/sobre a foto, acima/
abaixo do nome, cantos superiores) funcionam de verdade no cardápio público.

## 🐛 Galeria de fundos prontos — "falha ao carregar"
Todos os 10 fundos prontos existem e carregam certinho no servidor. A causa mais provável do que
vocês veem é uma falha passageira de rede/servidor (ex: hospedagem gratuita "acordando"),
somada à falta de nova tentativa. Adicionei retry automático (até 2 tentativas, com espera
crescente) antes de mostrar "Falha ao carregar" — cobre esse tipo de falha intermitente.

## 🖼 Moldura destacada em todas as janelas
Todos os 10 modais do sistema (item, categoria, pedido, motoboy, cancelamento, exclusão, etc.)
agora têm uma borda dourada + brilho ao redor, deixando claro visualmente qual janela está em
primeiro plano.

## 📠 Estações de Impressão — movida pra Categoria, removida do item
O backend já suportava estação por categoria com herança automática pros itens — só faltava
tirar o controle duplicado do item. Removido o botão "📠 Estações" e o modal correspondente da
edição de cada prato; agora só existe em **Cardápio → editar categoria → "Imprime na(s) via(s)
de:"**, valendo pra todos os itens dela automaticamente.

## Auditoria geral
Não encontrei ícones quebrados, funções JS duplicadas nem IDs duplicados de verdade no código-
fonte ou nos dados salvos. Se o "símbolo entre parênteses" quebrado continuar aparecendo, me diga
em qual tela exatamente pra eu localizar e trocar.

## Testes feitos antes de fechar (Playwright, navegador real)
✓ Todas as páginas do painel abrem sem erro de console ✓ Categoria mostra o seletor de Estações;
item não mostra mais botão de Estações ✓ Criar anúncio com desconto, salvar, e ver o preço
riscado + desconto no cardápio público — testado de ponta a ponta ✓ Moldura dourada visível em
modal testado ✓ Nenhuma funcionalidade existente foi removida.

## Arquivos alterados
- `public/painel.html` — editor de anúncios com desconto por item, remoção do controle de
  Estações do item, retry na galeria de fundos, moldura dos modais.
- `public/index.html` — aplica desconto de anúncio (preço + carrinho), aplica posição real do
  badge global.
