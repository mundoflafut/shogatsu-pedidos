# v32 — Motoboys, exclusão de pedidos, bug do carrinho preso e tela de pedido

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
