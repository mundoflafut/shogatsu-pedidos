# Shogatsu — v49 — Notas desta versão

## 1. 🐛 Bug corrigido (raiz do problema) — "impressora não imprime" em vias além de Cozinha/Sushibar/Bar
Achei três lugares no servidor que, juntos, faziam com que qualquer via além das 3 originais
(Cozinha, Sushibar, Bar) nunca imprimisse de verdade, mesmo configurada certinho:

1. **Na criação do pedido** (`POST /api/orders`) — os itens tinham a estação apagada e trocada
   por "Cozinha" bem no instante em que o pedido era criado, porque só existia uma lista fixa de
   3 estações válidas ali.
2. **Na impressão** (`POST /api/print`) — a mesma lista fixa recusava ("Via inválida") qualquer
   estação nova.
3. **Ao carregar as configurações** (`readConfig()`) — qualquer estação nova criada pelo admin
   era apagada sozinha no próximo carregamento, porque o código só preservava as 4 chaves
   originais.

Esse era o motivo real por trás de "a impressora não imprime": não era um problema de driver ou
de extensão — era o sistema descartando a marcação da via antes mesmo de tentar imprimir. Os três
pontos foram corrigidos pra funcionar com **qualquer** estação existente em `cfg.stations`, não
uma lista fixa.

## 2. 📠 Nova funcionalidade — Estações de Impressão (por item do cardápio)
Em **Editar Cardápio**, cada item agora tem um botão **📠 Estações** ao lado de ✏️ Editar. Ele
abre um modal com cards grandes (ícone + nome + checkbox) pra marcar em quais estações aquele
item deve sair na hora de imprimir — Caixa, Cozinha, Sushibar, Bar, Delivery, Expedição, ou
qualquer via customizada criada em Configurações.

- Um item pode pertencer a várias estações ao mesmo tempo.
- Botões "✔ Selecionar Todas" / "✖ Limpar Seleção" / "💾 Salvar" / "❌ Cancelar".
- Se nenhuma estação for marcada, o item usa a **estação padrão** do sistema (configurável em
  Configurações → 📠 Impressoras por Estação).
- Ao excluir uma estação, a referência dela some automaticamente de todos os itens/categorias que
  a usavam (não fica "fantasma" marcado numa via que não existe mais).
- Tema escuro, cards com animação suave ao marcar/desmarcar, responsivo (celular/tablet/desktop).

### Estações agora são dinâmicas de verdade
Antes existiam só 4 vias fixas no código inteiro (Cozinha/Sushibar/Bar/Caixa). Agora:
- **Delivery** 🛵 e **Expedição** 📦 já vêm como padrão, junto com as 4 originais.
- O admin pode **criar vias customizadas** (ex: "Forno", "Grelha") com o botão **➕ Nova Estação**
  em Configurações → 📠 Impressoras por Estação — cada uma com ícone, nome, tempo de preparo e
  forma de impressão (navegador / automática / rede / USB) próprios.
- Dá pra **excluir** uma via customizada (🗑 Excluir) — exceto a Caixa, que é fixa por ser o
  comprovante completo do pedido.
- Tudo isso reflete automaticamente no cardápio, na impressão de pedidos, no modal 📠 Estações e
  nas categorias — sem precisar editar código.

## 3. 📤 Splash Screen (Tela de Abertura) — upload de foto de verdade
Antes só dava pra colar um link de imagem (`https://...`). Agora cada foto da sequência de
abertura tem um botão **📤 Upload** que envia a foto direto do celular/computador (com a mesma
compressão automática já usada nas fotos de item do cardápio, pra não pesar no carregamento).

## 4. 🖼️ Cardápio Rodízio Popular — upload de foto de capa e galeria
A página pública já usava `heroPhoto` (foto de capa) e `gallery` (galeria de fotos), mas **não
existia nenhuma tela no painel pra editar isso** — por isso o upload "não aparecia". Adicionado em
Editar Cardápio Popular:
- **Foto de capa**: upload do dispositivo ou link, com **prévia no formato original** (sem cortar
  — `object-fit: contain`), pra você conferir enquadramento antes de publicar.
- **Galeria de fotos**: adicionar/remover/reordenar fotos, cada uma com upload próprio.

## O que ainda falta (avisado, não feito nesta rodada)
- **Ajuste de tela mobile em todo o app** (cliente e admin/master) — pedido muito amplo pra cobrir
  com segurança numa única passada num sistema desse tamanho. Se puder listar quais telas
  especificamente estão com problema no celular (nomes ou prints), eu foco exatamente nelas.
- **Duplicar item / Importar-exportar cardápio**: a função de duplicar item ainda não existe no
  sistema; quando for criada, as estações do item já serão copiadas automaticamente (é só mais um
  campo do item). O import de cardápio (formato nativo) já preserva `stations` se estiver no
  arquivo; o export em CSV é simplificado e não inclui essa coluna — posso adicionar se for útil.

## O que testar antes de publicar
1. **Editar Cardápio** → abrir 📠 Estações de um item, marcar "Delivery" (ou criar uma via nova em
   Configurações primeiro), salvar, fazer um pedido de teste com esse item e conferir que a via
   correta recebe a impressão.
2. **Configurações → 📠 Impressoras por Estação** → criar uma via nova, salvar, recarregar a
   página e confirmar que ela continua lá (não some mais).
3. Excluir uma via de teste e conferir que ela some do modal 📠 Estações dos itens que a usavam.
4. **Configurações → Splash Screen** → enviar uma foto pelo botão 📤 Upload e conferir no
   `cardapio-rodizio-popular` ou app do cliente.
5. **Editar Cardápio Popular** → enviar uma foto de capa e uma foto de galeria, salvar, e conferir
   na página pública `/cardapio-rodizio-popular.html`.
