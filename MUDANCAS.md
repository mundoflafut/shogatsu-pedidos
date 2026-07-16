# Shogatsu — Evoluções aplicadas (atualização mais recente)

## 🖨 Impressoras: renomear + escolher pra onde cada prato vai

**Renomear o nome de cada via**
Em **Configurações → Impressoras por Estação**, cada uma das 4 vias
(Cozinha, Sushibar, Bar, Caixa) agora tem um campo de texto pra você
renomear como quiser (ex: "Cozinha" → "Cozinha 1", "Bar" → "Bar/Drinks").
Também dá pra escolher, por via, se ela imprime pela janela do navegador
(mais simples, padrão), por impressora de rede (informando o IP) ou por
impressora USB (informando o caminho do dispositivo). Tem um botão
**🖨 Testar** pra confirmar que está tudo certo antes de usar de verdade.

**Marcar pra onde cada prato vai (uma ou mais vias)**
Ao editar um prato no cardápio, o campo que antes era um "select" de uma
via só virou **caixinhas de marcação**: Cozinha / Sushibar / Bar. Agora dá
pra marcar mais de uma — por exemplo, um combo com bebida pode sair
impresso ao mesmo tempo na Cozinha **e** no Bar, cada um recebendo sua
parte. Antes só dava pra escolher uma via por prato.

## 🔄 Cardápio do cliente atualiza sozinho, em tempo real
Antes, se um cliente já estivesse com o site aberto no celular e você
mudasse um preço, marcasse um prato como esgotado ou alterasse qualquer
coisa no painel, ele só via a mudança se recarregasse a página manualmente.

Agora o site do cliente fica "escutando" o painel: assim que você salva
qualquer coisa (cardápio, preços, variações, config geral), todo mundo que
já está com o cardápio aberto recebe a atualização na hora, sem precisar
dar F5. Testado e confirmado funcionando de ponta a ponta.

## 🐛 Bugs encontrados e corrigidos nessa varredura
1. **"Imprimir ao Receber" não fazia nada.** O campo existia na tela de
   Configurações, mas nunca era salvo nem lido — ativar ou desativar não
   mudava nada de verdade. Corrigido: agora funciona de verdade (imprime
   todas as vias automaticamente quando um pedido novo chega).
2. **Vias de produção (Cozinha/Sushibar/Bar) mostravam nome e telefone do
   cliente.** Não faz sentido a cozinha ter esse dado — corrigido na
   atualização anterior de impressão, mantido aqui.
3. **Não existia jeito de marcar um prato como esgotado.** Adicionei um
   botão "✅ Disponível / 🚫 Esgotado" em cada item do cardápio no painel —
   um clique já salva.
4. **Editar um prato reativava ele sozinho.** Se um prato estava marcado
   como esgotado e você só editava a descrição ou o preço, ele voltava a
   ficar "disponível" escondido — sem querer. Corrigido: editar não mexe
   mais nesse status.

## Como aplicar
Substitua `server.js`, `public/index.html` e `public/painel.html` no seu
repositório do GitHub por estes arquivos (são os 3 únicos que mudaram) e dê
push — o Render atualiza sozinho. Não precisa mexer em mais nada.

⚠️ Lembrete de sempre: os dados ainda ficam em arquivos JSON no disco do
Render sem persistência configurada — um reinício ainda apaga
cardápio/pedidos de teste. Fica pra quando o sistema estiver mais fechado,
como já combinamos.
