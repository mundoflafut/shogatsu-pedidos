# v39 — Bug da reserva, impressão de todas as vias, e ferramenta de QR Code & Links

**Bug real corrigido: botão "Solicitar Reserva" continuava ativo depois da reserva já feita.**
Depois de enviar uma reserva, a tela passava a mostrar o card de acompanhamento (status), mas o
formulário com o botão "✅ Solicitar Reserva" continuava visível e clicável logo acima — dava pra
clicar de novo (ou várias vezes seguidas) e criar reservas duplicadas pro mesmo cliente. Agora o
botão é desabilitado assim que clicado (evita duplo clique enquanto a requisição está no ar) e o
formulário inteiro some assim que a reserva é confirmada com sucesso, sobrando só o card de status
e o botão "+ Fazer nova reserva" pra quando o cliente realmente quiser reservar de novo. O mesmo
vale ao reabrir a tela com uma reserva já em aberto salva no navegador.

**Bug real corrigido: nem toda via imprimia.** O botão "🖨 Imprimir" no painel abre uma janela por
via (Caixa/Cozinha/Sushibar/Bar) usando a impressão do navegador. Como cada via só é confirmada
depois de um `await` na rede, a partir da segunda via o navegador podia bloquear a janela como
pop-up — e isso só era evitado quando o pedido já estava carregado na lista local em memória; se
vinha de outro lugar (card do dashboard, lista filtrada, etc.) essa proteção falhava e só a
primeira via imprimia de verdade. Agora as 4 janelas são sempre pré-abertas de forma síncrona,
ainda dentro do clique do usuário, então nenhuma consegue ser bloqueada — as que acabam sem uso
(via sem itens desse pedido, ou impressora de rede/USB configurada) são fechadas automaticamente.

**Novo: aba "🔗 QR Code & Links" no painel.** Ferramenta dedicada (antes só existiam 2 links
enterrados dentro de Configurações) com uma aba própria pra cada página pública do sistema —
**Cardápio** tem a sua aba separada, além de Delivery/Pedir Agora, Cardápio Rodízio Popular,
Divulgação, Avaliação Rodízio e Painel do Entregador. Cada aba mostra o link (com botão de copiar)
e o QR Code correspondente, com botões de baixar, imprimir (abre uma janela só com o QR pra colar
na mesa/conta) e abrir a página. Também tem um gerador personalizado: cola qualquer link ou texto
e gera um QR na hora, com os mesmos botões de baixar/imprimir — útil pra promoções e cupons.

## Como aplicar
`public/index.html` e `public/painel.html` mudaram. Substitua os dois arquivos e dê push (o
Service Worker já busca a versão nova sozinho, mas se quiser garantir, force um recarregamento
sem cache — Ctrl+Shift+R — na primeira vez que abrir).

---

# v38 — Barra de categorias padrão iFood/Uber Eats, legibilidade dos pratos e revisão do PWA

**Barra de categorias + busca, unificadas num só bloco fixo com blur e sombra.** Antes a barra
de busca ficava solta, abaixo da barra de categorias (que já era fixa). Agora as duas vivem
dentro de um único painel "vidro fosco" (glassmorphism) que gruda no topo junto, como no
iFood/Uber Eats.

**Indicador animado deslizante.** Em vez de só trocar a cor da categoria ativa, agora tem uma
"trilha" dourada/vermelha que desliza suavemente (280ms) até a categoria selecionada — tanto ao
clicar quanto ao rolar a página.

**Trocado o cálculo de categoria ativa por `IntersectionObserver`.** Antes, a cada pixel rolado
a página recalculava manualmente a posição de cada seção (`offsetTop`) pra saber qual categoria
estava visível — funcionava, mas gastava processamento à toa. Agora o navegador avisa sozinho
quando uma seção entra na área visível, o que é mais preciso e mais leve (ajuda a manter os
60 FPS pedidos). A rolagem horizontal com o mouse (arrastar) e a centralização automática da
categoria ativa, adicionadas na v37, continuam funcionando do mesmo jeito.

**Legibilidade dos pratos melhorada.** Nome, descrição e preço com mais peso de fonte, melhor
contraste de cor e espaçamento — mesma identidade visual (mesmas fontes e cores), só mais fácil
de ler.

**PWA revisado (instalação e fotos).** Conferido o fluxo de "Instalar App": ele já usa o prompt
nativo do navegador direto (sem etapa extra) e já não aparece de novo depois de instalado —
nenhuma mudança necessária aí, só validado. Revisadas todas as fotos de prato do cardápio (lista
principal, miniaturas do editor, cardápios do rodízio): todas já usam `object-fit: cover` com
proporção fixa e cantos preservados — não foi encontrado nenhum ponto com distorção ativa no
código atual; se o problema aparecer de novo com uma foto específica, me manda o print que eu
reproduzo e conserto pontualmente.

**Ficou de fora desta rodada, por serem funcionalidades grandes e novas (não ajustes visuais):**
- **Ícone do app editável pelo painel** (upload, recorte e atualização automática do
  `manifest.json`/favicons) — é um recurso novo de verdade (processamento de imagem, geração de
  vários tamanhos de ícone), não um bug a corrigir.
- **Módulo do Rodízio Presencial 100% separado do Delivery**, com editor próprio no painel,
  QR Code automático sempre atualizado, e envio automático do link/QR junto da confirmação de
  reserva — isso é um sistema novo inteiro (categorias/produtos próprios, endpoints novos,
  geração de QR, integração com WhatsApp/e-mail na confirmação da reserva).

Ambos valem a pena, mas são grandes o bastante pra merecerem uma rodada só deles, testada com
calma, em vez de entrar de última hora numa lista já cheia de mudanças visuais.

---



**Bug real corrigido: no celular não dava pra reabrir o menu lateral.** O botão de
recolher/expandir a sidebar (criado na v36) ficava *dentro* da própria sidebar — em tela
pequena ela já começa escondida por padrão, então o botão de abrir sumia junto. Corrigido com
um ☰ sempre visível na barra superior em telas pequenas, mais um fundo escurecido atrás da
sidebar (toca fora pra fechar).

**Fontes aumentadas em todo o painel.** Todo tamanho de fonte do `painel.html` subiu ~1px
(o texto base foi de 13px pra 14px, e assim por diante em cascata) — mantém a hierarquia
visual, só fica mais legível.

**Modernização visual do painel** (só aparência — nenhuma lógica, API ou regra de negócio
mudou): cantos mais arredondados (12–16px) em cards e botões, sombras mais suaves com
elevação ao passar o mouse, efeito glassmorphism discreto na barra superior e nos modais,
animação de entrada suave ao trocar de aba, efeito ripple (ondinha) ao clicar em qualquer
botão, e ícones da barra lateral com uma leve animação ao selecionar. Como a maioria dos
elementos (cards, botões, barra lateral) é compartilhada entre as abas, o efeito já aparece
em Pedidos, Reservas, Motoboys, Cardápio, Relatórios, Avaliações, Configurações, Impressoras
e Usuários sem precisar mexer aba por aba.

*Não incluído nesta rodada, por escopo*: troca completa dos emojis por ícones Lucide/Heroicons
e um redesenho estrutural (não só visual) de cada tela individualmente — isso é bem mais
arriscado de fazer de uma vez só num sistema em produção; prefiro fazer aba por aba, testando
cada uma, se for do interesse continuar.

**Cardápio (index.html): barra de categorias — Sticky Scrollable Category Bar completa.**
A barra já existia fixa no topo com rolagem horizontal; adicionado o que faltava do pedido:
arrastar com o mouse no desktop (o toque no celular já funcionava nativamente), a categoria
ativa agora se centraliza sozinha dentro da barra conforme a rolagem da página muda de seção,
brilho e ícone com bounce na categoria ativa, e glassmorphism com sombra na barra. A lógica de
detectar a seção visível e rolar suavemente até ela já existia e não foi alterada.

---



**Bug real corrigido: painel ficava preso numa versão antiga (cache do Service Worker).**
O `sw.js` usava "cache primeiro" pra **todo** arquivo HTML, inclusive o `painel.html` — uma vez
que o navegador guardava uma cópia, ele nunca mais buscava a versão nova sozinho no servidor,
mesmo pra quem era master. Corrigido: páginas HTML agora usam "rede primeiro" (sempre busca a
versão mais nova; só cai pro cache se estiver offline de verdade); ícones/fontes continuam em
cache primeiro, que é mais rápido e não tem esse risco. Versão do cache subiu pra limpar o que
já estava guardado em todo mundo. O painel também ganhou um aviso automático ("🔄 Nova versão
disponível") quando detecta uma atualização, já que costuma ficar aberto numa aba o dia todo.

**Painel: sidebar recolhível e redimensionável por arraste.** Primeiro passo da modernização
visual pedida — feito só em CSS/JS de layout, sem tocar em nenhuma lógica de pedidos/config.
Botão ◀ recolhe a barra lateral pra só ícones; a borda direita dá pra arrastar pra redimensionar;
largura e estado (recolhida ou não) ficam salvos e voltam do jeito que a pessoa deixou da última
vez. Também entraram ajustes de responsividade — em telas menores nada corta mais, a sidebar
vira um menu por cima e as grades se reorganizam sozinhas.

**Novo: cardápio do Rodízio Popular, avaliação específica e página de divulgação.** Três páginas
novas e independentes em `/public`: `cardapio-rodizio-popular.html` (cardápio completo do rodízio
de terça a domingo, com preços por grupo de dias, destaques do dia e espaços de foto editáveis),
`avaliar-rodizio.html` (avaliação específica pro rodízio presencial — estrelas por categoria,
manda formatado pro WhatsApp da loja) e `divulgacao-rodizio.html` (o link único pra colocar na
bio do Instagram/Facebook, com frases chamativas e botões de ação).

---



**Bug real corrigido: produto ficava "preso" no carrinho.** Três lugares (`placeOrder`,
`clearCartOnAccountSwitch`, `repeatOrder`) zeravam ou trocavam o carrinho e atualizavam só o
resumo/badge (`updateCartUI()`), mas nunca re-renderizavam o cardápio (`renderMenu()`). Resultado:
o cartão do produto continuava mostrando os botões −/+ com a quantidade antiga mesmo com o
carrinho já vazio por dentro — e como `changeQty()` ignora chaves que não existem mais em
`cart{}`, o botão − ficava sem fazer nada pra sempre. Corrigido nos três pontos, chamando
`renderMenu()` sempre que o carrinho muda por fora da interação direta do cliente. Também
sincronizamos a gaveta do carrinho quando ela já está aberta e um item novo é adicionado pelo
cardápio.

**Tela "Pedido Recebido" — botão ❤️ Favoritar.** A tela de confirmação já existia com a
identidade visual do cardápio (mesmas cores, tipografia, ícones e cards), mas faltava o botão de
favoritar do mockup. Adicionado ao grid de ações (agora 2x2), com estado salvo em localStorage.

**Novo: pré-cadastro de motoboys.** Nova aba "🛵 Motoboys" no painel (nível admin+): cadastra
nome, telefone, placa e observações, com ativar/desativar e remover. Os dados entram no backup
automático do Supabase, igual pedidos/clientes/config. Na hora de marcar "saiu para entrega", o
antigo `prompt()` de texto livre virou um seletor visual com os motoboys cadastrados (chips),
mantendo a opção de digitar um nome avulso ou deixar em branco.

**Novo: Excluir Pedido do Sistema (ADM → Pedidos).** Botão 🗑️ visível só pra admin/master.
Diferente de cancelar (que mantém o pedido no histórico com motivo), isso apaga o registro por
completo — por isso exige a senha de administrador de novo, num modal separado, mesmo com a
sessão já logada. Toda exclusão fica registrada num histórico de auditoria
(`data/delete-log.json`, também salvo no Supabase) com o pedido, data/hora e usuário responsável.
Testado de ponta a ponta: senha errada → bloqueado com "❌ Senha inválida. Pedido não foi
removido."; usuário nível "vendas" tentando excluir → bloqueado com 403; admin/master com senha
certa → "✅ Pedido removido do sistema com sucesso." e o pedido some do arquivo.

# v35 — Cardápio de rodízio (QR), link único pra bio, instalar como app, excluir reservas

**Novo: Cardápio do Rodízio (`/cardapio-rodizio.html`).** Página pra QR code na mesa — o cliente
já sentado escaneia e vê o cardápio do rodízio, com um banner "✨ Liberado hoje" pros itens
extras que só saem em certos dias da semana. No editor de prato (painel → Cardápio), novo campo
"📅 Dias do Rodízio" com os 7 dias da semana — item sem nenhum dia marcado aparece como fixo
("sempre disponível"); com dias marcados, só aparece destacado no banner "liberado hoje" nesses
dias. Em Configurações → 🔗 Links Úteis, o QR code já vem pronto pra copiar/imprimir.

**Novo: link único pra bio do Instagram/Facebook (`/pedir-agora.html`).** Uma tela com botões
pra "Fazer Pedido", "Cardápio do Rodízio", "Falar no WhatsApp" e "Como Chegar" — busca os dados
reais da loja (nome, whatsapp, endereço) direto do painel, então fica sempre sincronizado.

**Novo: banner "Instalar como App".** Aparece depois de alguns segundos de navegação no
cardápio — no Android/Chrome usa o instalador nativo do navegador (1 toque); no iPhone mostra o
passo a passo (Compartilhar → Adicionar à Tela de Início, já que a Apple não permite instalar
em 1 clique). Não aparece de novo se o cliente já instalou ou já fechou o banner antes.

**Senha master pra excluir reservas de mesa.** A tela "Excluir Dados" (Configurações → ⚠️ Zona
de Perigo) ganhou uma terceira opção: além de Cardápio e Pedidos, agora também dá pra apagar
todo o histórico de Reservas de Mesa — mesmo fluxo de sempre (pergunta qual, avisa o que vai
acontecer, pede a senha master, registra no histórico de auditoria).

# v34 — Rastreamento GPS do motoboy, botões invisíveis, tempo estimado, excluir dados

**Novo: rastreamento GPS ao vivo do motoboy.** Nova página `entregador.html` que o motoboy abre
no celular (link gerado automaticamente e mostrado num modal assim que o pedido é marcado como
"saiu para entrega") — ele só toca em "Compartilhar localização" e o cliente passa a ver o
🛵 se movendo no mapa da tela de acompanhamento, em tempo real. A localização só fica ativa
durante a entrega — é apagada automaticamente assim que o pedido é marcado como entregue ou
cancelado, e o link do motoboy para de funcionar sozinho nesse momento.

**Bug real corrigido: botões quase invisíveis.** Os botões de editar/excluir categoria só
apareciam ao passar o mouse (quebrado em celular/tablet, que não tem hover) e eram cinza sem
nenhuma cor — quase impossível de enxergar. Os botões de Imprimir e WhatsApp na lista de pedidos
não tinham nenhuma cor de destaque (ficavam cinza-sobre-cinza). Corrigido: todos os botões agora
são sempre visíveis, maiores, e cada ação tem sua cor própria (imprimir=azul,
WhatsApp=verde-WhatsApp, marcar pago=dourado, editar=azul, excluir=vermelho).

**Bug do tempo estimado — corrigido de verdade.** Existia um único campo "Tempo Estimado" usado
tanto pra Delivery quanto pra Retirada. Separado em dois campos configuráveis, e corrigido em
todos os lugares que usavam o valor errado (contador regressivo, widget flutuante, chip do topo
do cardápio, mensagem de WhatsApp). De bônus: o card "Tempo Médio" do Dashboard nunca calculava
nada de verdade (só ecoava o texto configurado) — agora calcula a média real a partir dos
pedidos entregues no dia.

**"Reset de Dados" renomeado pra "Excluir Dados", com pergunta de qual antes de agir.** A
funcionalidade agora fica em Configurações → ⚠️ Zona de Perigo (só master): um único botão
"Excluir Dados..." abre um modal que primeiro pergunta **o que** excluir (Cardápio ou Pedidos),
mostra um aviso específico pra escolha, só then pede a senha master. Cada exclusão fica
registrada no histórico de auditoria.

**Botão "Continuar navegando pelo cardápio"** — era um link de texto sublinhado sem nada a ver
com o resto da tela. Agora é um botão "🛍️ Continuar Comprando" com o mesmo design dos outros.

# v33 — Senha MASTER, destaque duplicado, foto/fonte ajustáveis, Pedidos unificado, reserva com status

**Senha MASTER pra excluir pedido.** Antes o endpoint aceitava a senha de qualquer admin ou
usuário; agora `DELETE /api/admin/orders/:id` exige especificamente `cfg.masterPass` e só libera
pra quem está logado como **master** — no backend e escondendo o botão no painel pra quem não é
master.

**Bug real corrigido: destaque duplicado.** Todo prato com "Badge (destaque)" preenchido estava
sendo mostrado com o MESMO texto **duas vezes** no cartão — uma vez num selo no topo, de novo
numa tag dourada perto do preço. Unificado num único selo, mais visível (gradiente dourado).

**Foto do prato — enquadramento ajustável.** No cadastro de prato, dois sliders (Horizontal /
Vertical) deixam escolher qual parte da foto aparece dentro do quadro — útil quando a foto não é
quadrada ou o prato não está centralizado. Salvo por prato (`imagePos`), aplicado tanto na
prévia do admin quanto no cardápio do cliente.

**Tamanho da foto do prato e fonte do cardápio — ajustáveis.** Nova seção em Configurações →
🎨 Aparência do Cardápio: slider de tamanho da foto (56–140px) e seletor de tamanho de fonte
(Pequena/Normal/Grande/Extra Grande), aplicados ao vivo no cardápio do cliente.

**Dashboard + Gerenciar Pedidos + Kanban — unificados.** Os três viraram uma única aba "📊
Pedidos" com sub-abas internas (Visão Geral / Lista / Kanban), sem recarregar nada ao trocar.
De quebra, corrigido um bug de fundo: o destaque do item ativo no menu lateral usava uma
comparação de texto frágil que nunca funcionava direito pro item "Pedidos" — trocado por
atributos `data-page` explícitos, mais confiável.

**Ícones em caixa colorida no seletor de modo.** 🛵 Delivery / 🏪 Retirada / 📅 Reservar Mesa
agora aparecem como cartões com ícone destacado e cor própria (vermelho/azul/dourado) quando
selecionados, em vez de botões de texto simples.

**Tela de Reserva de Mesa do cliente — reconstruída** seguindo o modelo enviado: depois de
solicitar, a mesma tela mostra um card "ℹ️ Status da Reserva" com o andamento (⏳ Aguardando
confirmação / ✅ Confirmada / ✕ Recusada), a "💬 Resposta da Loja" quando o restaurante escreve
uma, e atualiza sozinha (tempo real via SSE + polling de reforço a cada 15s) — sem precisar
recarregar a página. No painel, a tela de reservas ganhou um campo pra loja escrever essa
resposta ao confirmar/recusar.

**Motoboys e Excluir do Sistema — confirmados presentes.** Essas duas features já tinham sido
implementadas na v32 (aba 🛵 Motoboys e botão 🗑️ Excluir do Sistema) — testamos de novo de ponta
a ponta nesta versão pra garantir que continuam funcionando. Se elas não aparecerem no seu
Render, o mais provável é que o deploy ainda esteja rodando uma versão anterior — vale conferir
se esse zip (v33) foi mesmo o que subiu.

**Bug do carrinho — reconfirmado corrigido.** Revisamos de novo todos os pontos onde o carrinho
é zerado (fim de pedido, troca de conta, repetir pedido) — todos já chamam `renderMenu()`
corretamente (corrigido na v32), então o produto não deve mais ficar "preso" com os botões −/+
travados.

# v28 — Impressão automática, foto do modal, dashboard sem dado falso, reserva visível, botão voltar

**1.2 — Impressão automática no recebimento do pedido.** Como o servidor na nuvem (Render) não
tem impressora física conectada — isso vale pra qualquer sistema do tipo, não só este — criei um
agente local (`print-agent/`) que roda num computador dentro da loja, escuta os pedidos em tempo
real e imprime sozinho, sem abrir navegador/PDF/diálogo. Testado de ponta a ponta: pedido criado →
detectado e "impresso" (modo teste) em 32ms. Erros ficam registrados em `print-agent.log`; sucesso
retorna sem travar nada. Ver `print-agent/README.md` pra instalar.

**1.1 — Bug real corrigido: placeholder da foto no modal de item.** A causa era usar `display:flex`
numa tag `<img>` vazia tentando centralizar um emoji — `<img>` não tem conteúdo interno pra
centralizar, então sem foto aparecia só uma caixa cinza, sem ícone nenhum. Trocado por um elemento
separado que aparece/some corretamente. Upload, substituição e salvamento já estavam certos.

**Bug real corrigido: nota "4.8" do Dashboard era fixa no código**, nunca refletia as avaliações
reais dos clientes. Agora é calculada ao vivo a partir das avaliações de verdade (testado: avaliação
de 5 estrelas → dashboard mostra 5.0; sem nenhuma avaliação → mostra "—" em vez de inventar um
número).

**Banner (itens 1 e 4):** já existia rolagem automática e tela cheia — faltava zoom suave (efeito
Ken Burns) e deslizar com o dedo no celular. Adicionado os dois, sem mexer no resto do banner.

**Botão de Reserva de Mesa (item 8) agora visível direto na tela principal** do cardápio do
cliente (ao lado de Delivery/Retirada), em vez de escondido dentro do menu "Falar com o
restaurante". Só aparece se reservas estiverem ativadas nas Configurações.

**Botão voltar do navegador evoluído** (em vez de removido, que não é tecnicamente possível):
agora fecha a tela ou modal aberta (carrinho, checkout, conta, avaliação, reserva, personalização
de item) em vez de sair do site — implementado de forma genérica com um observador de mudanças de
classe, sem precisar alterar cada uma das ~27 telas manualmente. **Importante:** essa parte mexe
com navegação do navegador e não dá pra testar 100% sem abrir num navegador de verdade — testei a
lógica e a sintaxe, mas peço que você confirme o comportamento depois de publicar.

**Itens ainda pendentes de mais detalhes** (2, 3, 5, 6, 7 completo, 10, cor "destaque"): pedem
"corrigir bugs" de forma genérica num sistema já grande e funcionando — preferi não arriscar
alterações às cegas. Muitos sub-itens já existem (reserva, agendamento, categoria fixa ao rolar,
sincronização em tempo real via SSE). Me manda um exemplo concreto do que está quebrado em cada um
e eu resolvo certeiro.

---



**Nova tela de acompanhamento** (aparece depois de confirmar o pedido), com tema próprio
mantendo a paleta de cores do Shogatsu:
- Cabeçalho em Playfair Display, corpo em Inter, botões em Poppins SemiBold (só nessa tela —
  o resto do site continua em Cormorant Garamond + Jost).
- Check verde desenhado com animação de traço + cards entrando em fade-in sequencial.
- Barra de progresso animada com 4 etapas (Recebido → Em preparo → Saiu para entrega →
  Entregue) + contagem regressiva do tempo estimado.
- Barra de status fixa no topo ao rolar a tela, e indicador "atualizado há Xs" mostrando que
  o acompanhamento é mesmo em tempo real.
- Mapa com OpenStreetMap (gratuito, sem chave de API) mostrando o endereço da loja e do
  cliente — geocodificado automaticamente na hora do pedido.
- Nome do entregador aparece quando o pedido sai pra entrega (o painel agora pergunta o nome
  ao avançar o status).
- Pagamento mostra só o método escolhido (em vez de listar os que não foram usados) + PIX com
  QR code, copiar chave e selo de "pago" / "a receber".
- Itens e total do pedido visíveis na própria tela (antes só iam pela mensagem de WhatsApp).
- Confete e som de confirmação — só na primeira abertura de cada pedido, não repete se
  minimizar e voltar.
- Avaliação por estrelas, repetir pedido com 1 clique, e compartilhar (Web Share API, com
  fallback pro WhatsApp).
- Notificação push automática pro cliente sempre que o status do pedido muda (reaproveitando
  a infraestrutura de push da v26), além do WhatsApp que já existia.
- Responsivo: as colunas do layout empilham sozinhas em telas pequenas.

**⚠️ Sobre o mapa:** a geocodificação do endereço (transformar texto em coordenadas) usa o
Nominatim/OpenStreetMap, que exige acesso à internet — funciona normal assim que publicado
num servidor com internet; num ambiente sem rede o pedido continua funcionando 100%, só sem
o marcador do cliente no mapa (a loja aparece de qualquer forma se a loja já foi geocodificada
nas Configurações).

---

# v26 — Bug do carrinho, botão de WhatsApp sumido, push, reservas e agendamento

**Bugs reais encontrados e corrigidos:**
- **Carrinho não esvaziava ao trocar de conta**: `doLogin`, `doRegister` e `doLogout` nunca
  limpavam o `cart`. Em aparelho compartilhado (tablet da loja, celular da família), os itens
  de uma conta continuavam aparecendo pro próximo cliente que entrasse com outra conta no
  mesmo navegador. Agora toda troca de identidade esvazia o carrinho, com aviso visual.
- **Botão de WhatsApp sumido na tela principal de Pedidos**: existia só no card do Dashboard
  (`miniOrderCard`), mas nunca foi adicionado na tela "Pedidos" (`renderOrdersList`) — só
  tinha o botão de Imprimir lá. Adicionado.
- **Botões sem estilo (Imprimir/WhatsApp)**: a classe `.oa-btn` base não tinha nenhum
  `background`/`border` definido — esses botões ficavam "soltos" na tela, sem parecer
  clicáveis. Agora têm contorno e fundo consistentes com os outros.
- **Estrelas de avaliação sem cor**: `.star-picker .star.on` só tinha `filter:grayscale(0)`, e
  sem uma cor de base as estrelas "selecionadas" apareciam na cor do texto padrão, não
  douradas. Corrigido com cor vibrante (`#FFC300`) e brilho.

**Novidades:**
- Notificações push de verdade (Web Push + VAPID), implementadas do zero em `webpush.js` só
  com o `crypto` nativo do Node — sem dependência paga nem serviço de terceiros. Composer de
  campanha segmentada em Configurações → 🔔 Notificações Push.
- Reserva de Mesas: tela no cardápio (via 📞 Falar com o restaurante → Reservar uma mesa) +
  aba "📅 Reservas" no painel pra confirmar/recusar.
- Agendamento de Pedidos: opção no checkout pra escolher data/hora futura em vez de "o quanto
  antes", respeitando janela mínima/máxima configurável.
- Minha Conta: histórico de pedidos ("📦 Meus Pedidos") e edição de cadastro ("✏️ Editar
  Cadastro"), ambos protegidos por confirmação de senha (a senha nunca fica salva no
  navegador).
- Banner do cardápio virou hero em tela cheia (88vh) com transição mais suave.
- Selo de promoção/benefício abaixo do preço nos cards de produto.

**⚠️ Importante pra notificação push funcionar:** o navegador só permite inscrição em push
num site com HTTPS (exceto `localhost`). Teste isso só depois de publicar no domínio real —
localmente ele carrega, mas o navegador bloqueia a inscrição.

---

# v25 — Backup automático no Supabase (persistência gratuita no Render)

Como o Disco Persistente do Render só existe em plano pago, adicionei sincronização
automática com uma tabela no Supabase (plano gratuito permanente): toda escrita local
(pedido, config, cliente) dispara um backup assíncrono pro Supabase, sem travar a
resposta; e ao ligar, o servidor busca lá o último estado antes de aceitar pedidos —
o que resolve o problema de perder tudo a cada deploy, de graça. Testado: com Supabase
mal configurado ou fora do ar, o servidor sobe normal e os pedidos continuam sendo
criados em milissegundos (erro fica só no log, nunca trava nada). Ver `README.md` pra
configurar (leva uns 5 minutos) e `supabase-setup.sql` pra criar a tabela.

---



## v19 — Bugs reais encontrados e corrigidos
- **XSS armazenado no painel**: nome/telefone/endereço/observação do pedido eram inseridos
  direto no HTML sem escapar. Um pedido malicioso podia rodar script no navegador de quem
  opera o painel. Corrigido com uma função `esc()`.
- **XSS armazenado nas avaliações públicas** (mais grave): o comentário de uma avaliação
  aparecia sem escapar pra QUALQUER visitante do site, não só pro admin. Corrigido.
- **Preço de item adulterável pelo cliente**: o servidor aceitava sem checar o preço que o
  navegador mandava ao criar o pedido — bastava editar a requisição pra "pagar" R$0,01 em
  qualquer prato. Agora o servidor valida contra o cardápio real antes de aceitar.
- **Rota duplicada** `GET /api/admin/customers` (a segunda nunca era executada — código morto).
  Mesclada numa só, mais completa.
- **Configuração de chave PIX inexistente no painel**: o servidor já suportava PIX, mas não
  havia NENHUM campo na interface pra cadastrar a chave — PIX nunca funcionava de verdade.
  Adicionado o card "💠 PIX" em Configurações.

## v20 — Programa de Fidelidade (pontos)
Cliente ganha pontos a cada pedido **entregue** (configurável, padrão 1 ponto por R$1) e troca
por desconto no próximo pedido. Calculado ao vivo a partir do histórico de pedidos (sem contador
que possa dessincronizar). Testado ponta a ponta: ganhar pontos → resgatar → desconto aplicado
corretamente → saldo atualizado.

## v21 — Notificações por WhatsApp
Duas camadas: (1) botão manual "💬" em cada pedido, que abre uma conversa no WhatsApp já com a
mensagem de status pronta — funciona sempre, de graça, sem depender de nada; (2) envio automático
opcional via Twilio (mesma conta usada pro SMS), configurável em Configurações → SMS.

## v22 — Confirmação de Pagamento PIX
Botão "✅ Marcar pago" no painel pra confirmação manual (funciona sempre). Estrutura opcional de
webhook `/api/webhook/pix` pronta pra integrar com Mercado Pago (confirmação 100% automática) —
exige conta própria e Access Token de produção, configurável em Configurações → PIX.

## v23 — Favoritos no cardápio do cliente
Cliente marca pratos favoritos (coração no card) e filtra o cardápio só pelos favoritos.
Guardado no navegador do próprio cliente, sem precisar de conta.

## v24 — Relatórios evoluídos
Página de Relatórios ganhou: cards de KPI (faturamento, pedidos e ticket médio dos últimos 7
dias), faturamento por forma de pagamento e ranking dos pratos mais pedidos — além do que já
existia (gráfico de barras, histórico e exportação CSV). De brinde, corrigi mais um XSS
(nome do cliente sem escapar na tabela de histórico).

---



## 🐛 Bug real encontrado e corrigido: fechamento automático da impressão
Ao mexer na correção do bloqueio de pop-up (atualização anterior), acabei
introduzindo sem querer um bug onde o texto `</script>` dentro do ticket
impresso quebrava a página por trás — o tipo de bug que só aparece de
verdade no navegador. Peguei isso numa checagem de sintaxe antes de
liberar, corrigi, e aproveitei pra deixar o fechamento automático da
janela de impressão **mais confiável**: agora tem um evento principal
("depois de imprimir" fecha sozinho) e um limite de segurança de 45s caso
o navegador não dispare esse evento — nunca mais deve ficar uma janela de
impressão aberta pra sempre.

## ⚡ Avaliação abre mais rápido quando o restaurante marca "Entregue"
O aplicativo do cliente verifica o status do pedido a cada 2 segundos
agora (era a cada 5). Isso deixa a abertura automática da avaliação —
seja pelo cliente clicando "Recebi" ou pelo restaurante marcando
"Entregue" — bem mais parecida com "no mesmo momento", já que o atraso
máximo cai de 5s pra 2s.

## 🔢 Dois pedidos não podem mais ter o mesmo número
Se o caixa digitar manualmente um número de pedido que **já está sendo
usado por outro pedido ainda em andamento** (não entregue, não
cancelado), o sistema recusa com uma mensagem clara dizendo qual pedido
já está com aquele número, e pede pra escolher outro. Pedidos já
entregues ou cancelados liberam o número de novo pro ciclo normal.
Também blindei a atribuição automática (quando você aceita sem digitar
nada) pra pular qualquer número já em uso, mesmo em cenários raros de
muitos pedidos simultâneos.

Testei os dois cenários rodando o servidor: número repetido → recusado
com mensagem clara; número diferente → aceito normalmente.

## Como aplicar
`server.js` e `public/painel.html` mudaram — `public/index.html` também
mudou (intervalo de verificação). Os três: substitua e dê push.
