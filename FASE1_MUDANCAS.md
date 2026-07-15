# Fase 1 — Base do Cardápio (o que mudou)

## 1) Organização
- **Reordenar categorias:** no painel → Cardápio, cada categoria tem setas ▲▼ pra
  subir/descer na lista (afeta a ordem que aparece pro cliente).
- **Reordenar itens dentro da categoria:** mesma ideia, setas ▲▼ em cada prato.
- **Busca no painel:** campo de busca no topo da lista de itens — procura em
  TODAS as categorias de uma vez (por nome ou descrição), útil quando o
  cardápio crescer.
- **Busca no site do cliente:** campo de busca logo abaixo das categorias —
  filtra os pratos exibidos em tempo real.

## 2) Variações de item (tamanho, sabor, complementos)
- No painel, ao editar um prato, agora existe uma seção **"Variações"**.
- Você cria **grupos** (ex: "Tamanho", "Sabor", "Adicionais"), escolhe se é:
  - **Escolha única** (ex: Tamanho: P ou G — só pode escolher um)
  - **Múltipla escolha** (ex: Adicionais — pode marcar vários)
  - **Obrigatório** ou opcional
- Cada grupo tem **opções** com nome + valor extra em R$ (pode ser 0, ou até
  negativo se quiser um desconto por opção).
- No site do cliente, pratos com variação mostram um botão **"🎛 Personalizar"**
  em vez do "+" direto — abre uma tela pra escolher as opções antes de
  adicionar ao carrinho, já com o preço final calculado.
- Duas combinações diferentes do mesmo prato (ex: um Grande e um Pequeno)
  aparecem como linhas separadas no carrinho e no pedido da cozinha.

## O que NÃO mudou
- Pratos sem variação continuam funcionando exatamente como antes (botão "+"
  direto, sem nenhuma tela extra).
- Estrutura de pedidos, PIX, impressão por estação, etc. — tudo igual.

## Como aplicar
Substitua `server.js`, `public/index.html` e `public/painel.html` no seu
repositório do GitHub pelos arquivos desta pasta (ou suba o projeto inteiro),
depois faça o commit/push — o Render vai atualizar sozinho.

⚠️ Lembrando do que já conversamos: como os dados ainda ficam em arquivos
JSON no disco (sem persistência configurada), um reinício do Render ainda
vai apagar cardápio/pedidos de teste. Isso é uma questão separada da Fase 1.
