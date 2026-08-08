# Shogatsu v77 — Auditoria e Correções

Segui o método pedido: mapeei o projeto, identifiquei os problemas concretos, corrigi com
segurança (testado no navegador antes de fechar), sem remover nenhuma funcionalidade.

## ✅ Cabeçalho dos cards — ícones consolidados
Antes cada card de Configurações mostrava 6 ícones soltos no título
(⭐ ➖ 📌 ⚙️ 👁️ ✖). Consolidado num único botão **⋮ Mais opções**, que abre um mini-menu com
as mesmas 6 ações de sempre (Favoritar, Fixar no topo, Minimizar, Ocultar/Mostrar, Ir pro
primeiro campo, Fechar) — só um por vez, fecha ao clicar fora, mesmo padrão dos modais.
Nenhuma função foi removida, só reorganizada.

## 🐛 BUG CORRIGIDO — duplicação de categorias no Cardápio
A v76 tinha adicionado uma fileira de chips de categoria em cima da lista de produtos — só que
isso duplicava a mesma navegação que já existe na coluna esquerda. Removido: a coluna esquerda
é a única navegação de categorias agora, como deveria ser desde o início.

## 🐛 BUG CORRIGIDO — rolagem/altura do editor de Cardápio
Um container interno da aba "Edição" não tinha `display:flex`, o que fazia o `flex:1` da lista
de produtos não funcionar de verdade (`flex` só funciona dentro de um pai flex). Corrigido —
agora a busca e os filtros ficam sempre fixos no topo, e só a lista de produtos rola, sem cortar
conteúdo e sem rolagem indevida.

## 📋 Auditoria completa
- Funções JavaScript duplicadas: **nenhuma encontrada**.
- Código morto: removido CSS não utilizado (`.card-ctrl-btn`, referente ao sistema antigo de
  ícones soltos nos cards).
- Console/erros de rede: nenhum erro causado pelas alterações (testado em todas as páginas).

## Testes feitos antes de fechar (Playwright, navegador real)
✓ Todas as páginas abrem sem erro de console ✓ Cardápio sem duplicação de categorias ✓ Menu
"⋮" abre, favoritar funciona, dropdown fecha sozinho depois do clique e ao clicar fora ✓ Seção
"⭐ Favoritos" atualiza corretamente ✓ Nenhuma funcionalidade existente foi removida.

## O que ficou de fora desta rodada (escopo muito grande pra uma entrega só seguindo o mesmo
padrão de fatias pequenas e testadas das versões anteriores):
- Busca global CTRL+K
- Compactação geral dos cards de Configurações (padding/margens)
- Consolidação formal de "Aparência e Personalização" em subseções recolhíveis
- Função central única "Mostrar/Ocultar Cardápio" (não existe hoje nenhuma versão duplicada
  dela — seria uma funcionalidade nova, não uma correção de duplicação)
- Pré-visualização lado a lado (70/30) nas configurações de aparência

## Arquivos alterados
- `public/painel.html` — menu "⋮" nos cards, remoção da duplicação de categorias no Cardápio,
  correção do flex/scroll do editor de Cardápio.
