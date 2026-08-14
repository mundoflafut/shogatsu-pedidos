# Shogatsu v87

Duas frentes pedidas: deixar o cardápio do cliente mais compacto/moderno, e melhorar o Editor
de Cardápio no painel. Nada de banco de dados, Supabase, preços, produtos, pedidos, login ou
identidade visual foi tocado além do pedido explicitamente.

## 🍣 CARDÁPIO DO CLIENTE (index.html)

**Descrição oculta por padrão:** cada prato mostra só 1-2 linhas da descrição (corte por CSS,
sem cortar o texto de verdade — o texto original nunca é alterado). Item sem descrição não
mostra nem espaço vazio nem botão. Toque em "⌄ Ver mais" expande suave; vira "⌃ Ocultar
descrição". Só um prato fica expandido por vez — abrir outro fecha o anterior automaticamente.

**Fecha ao rolar:** um listener de `scroll` único (`passive:true`, sem trabalho pesado por
evento) fecha a descrição aberta depois de ~350ms rolando — tolerância pra não fechar num
toque acidental que gera um "tremor" mínimo de scroll. Não interfere na rolagem em si.

**Sobrevive a atualizações do carrinho:** `renderMenu()` roda de novo toda vez que algo é
adicionado/removido do carrinho — sem cuidado especial, isso reconstruiria o HTML e fecharia
qualquer descrição aberta mesmo sem o cliente ter rolado nada. Corrigido pra reaplicar o estado
expandido depois de cada re-render.

**Botão "+ Pedir aqui":** substitui o "+" isolado — mesma função exata (`addToCart`), mesmo
vermelho do Shogatsu, agora em formato pílula com texto, boa área de toque no celular.

**Área de avaliação sempre visível:** antes, sem nenhuma avaliação ainda, a seção "⭐
Avaliações" inteira sumia da página (`display:none`). Agora ela sempre aparece — mostra "⭐
Avalie seu pedido / Sua opinião ajuda o Shogatsu a melhorar" enquanto não há avaliação nenhuma,
e a lista normal assim que a primeira chegar.

## 🛠️ EDITOR DE CARDÁPIO (painel.html)

**👁️ Ocultar item do cardápio (novo):** botão 🟢/⚪ em cada prato. Oculto some do cardápio do
cliente (index.html) mas continua normal no painel pra edição — nada é excluído do banco.
Diferente de "Esgotado" (🚫), que continua mostrando o prato pro cliente, só cinza e sem botão
de adicionar.

**Variações — já existiam** (grupos, opções, obrigatório/opcional, preço extra, adicionar,
editar, excluir) desde antes; não dupliquei nada. Só faltava "reordenar", que era pedido
explicitamente — adicionei ▲▼ nos grupos e nas opções dentro de cada grupo.

**📋 Copiar item:** no card de cada prato, escolhe pra quais categorias copiar (pode marcar
várias de uma vez, inclusive a própria categoria pra duplicar). Mantém nome, descrição, foto,
preço, variações, badge e todas as outras configurações. Sempre cria um registro novo — nunca
sobrescreve o original.

**📋 Copiar categoria:** botão na lista de categorias. Escolhe a categoria de destino, mostra o
resumo ("Você está copiando 12 itens de Sushi para Hot Roll") antes de confirmar, com
Cancelar/Copiar itens.

**💰 Ajustar preços em massa:** botão no topo do editor de cardápio. Escolhe categoria inteira
ou o cardápio todo, tipo de ajuste (porcentagem ou valor fixo em R$) e direção (aumentar ou
reduzir). Sempre exige clicar em "Ver prévia" primeiro — mostra tabela item por item (atual →
novo) antes de liberar o botão de aplicar. Nunca altera preço sem essa confirmação explícita.
Preço nunca fica negativo (trava em R$ 0,00 se a redução for maior que o preço).

## ✅ Testes feitos
- `node --check` nos blocos de script de `index.html` e `painel.html` — sem erro.
- Todos os `onclick`/`onchange`/`oninput` novos conferidos contra as funções que existem de
  fato (só os 2 falsos-positivos antigos, já conhecidos de versões anteriores, continuam).
- Revisão manual do CSS `.vgroup-head` (flex) — comporta a coluna de botões ▲▼ nova sem
  quebrar o layout existente.
- Conferido que a listagem de itens do cardápio do cliente (`renderMenu`) filtra `item.hidden`
  sem afetar a lista de favoritos, busca por texto nem contagem de categorias.

## ⚠️ O que NÃO foi mexido
- Nenhuma estrutura de dados existente foi duplicada — reaproveitei `item.variants`,
  `menu[].items`, `apiPost('/api/config', ...)` que já existiam.
- Preço, banco, Supabase, checkout, impressão, login e entrega — intocados.
- Cores e identidade visual — mesmas classes/variáveis CSS de sempre (`var(--red)`,
  `var(--gold)`, `.btn primary/secondary`), nada de paleta nova.
