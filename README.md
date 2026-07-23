# 🍣 Shogatsu — Pedidos Online

Sistema de pedidos com cardápio (`/`), pedido enviado direto para a cozinha em
tempo real, PIX com valor automático, painel do restaurante (`/painel.html`)
e notificações automáticas pro app do cliente (push grátis + SMS como
fallback pago).

Usa só duas dependências externas: `pg` (conexão com o banco PostgreSQL,
**obrigatória**) e `web-push` (notificações grátis no app). Rode
`npm install` antes de `node server.js` na primeira vez.

## Banco de dados (obrigatório)

Cardápio, configurações, pedidos, clientes, campanhas e assinaturas de push
são gravados **exclusivamente em PostgreSQL** — o sistema não usa mais
arquivos JSON como armazenamento (isso é o que causava cardápio/config
"voltando ao padrão" depois de um redeploy em serviços com disco não
persistente, como o Render no plano gratuito).

1. Crie um banco Postgres gratuito em [Render Postgres](https://render.com),
   [Supabase](https://supabase.com) ou [Neon](https://neon.tech).
2. Copie a **connection string** (algo como
   `postgresql://usuario:senha@host:5432/banco`).
3. Configure a variável de ambiente `DATABASE_URL` com essa string, tanto
   localmente quanto no serviço onde for hospedar.
4. Rode `node server.js` — na primeira vez, as tabelas são criadas
   automaticamente e, se existir uma pasta `data/` com os arquivos antigos
   (`config.json`, `orders.json`, `customers.json`, `campaigns.json`,
   `push-subs.json`), os dados são **migrados automaticamente** pro banco
   nessa primeira execução. Depois disso, esses arquivos não são mais lidos.

Sem `DATABASE_URL` configurada, o servidor recusa-se a iniciar e mostra uma
mensagem explicando o que falta — isso é proposital, pra nunca mais rodar
"quase funcionando" perdendo dados silenciosamente.

## Rodando localmente

```bash
npm install
export DATABASE_URL="postgresql://usuario:senha@host:5432/banco"
node server.js
```

Depois acesse:
- Cliente: http://localhost:3000
- Painel do restaurante: http://localhost:3000/painel.html
  - Senha do painel: `shogatsu2026`
  - Senha master (só pra apagar pedidos antigos): `shogatsuMaster2026`
  - **Troque as duas na aba "Cardápio & Config" assim que possível.**

## Colocando no ar (link online de verdade)

Qualquer serviço que rode um app Node.js persistente funciona. Os mais simples
para começar:

- **Railway** ou **Render** (planos gratuitos/baratos, deploy direto do zip ou de um repositório Git)
- **VPS próprio** (ex: um droplet da DigitalOcean/Hostinger) rodando `node server.js` atrás de um `pm2` ou `systemd`, com um domínio apontado via Nginx

Passo geral:
1. Suba esta pasta inteira para o serviço escolhido (ou um repositório Git).
2. Configure a variável de ambiente `DATABASE_URL` no serviço (veja a seção
   "Banco de dados" acima) — sem ela o servidor não inicia.
3. Configure o comando de start como `node server.js`.
4. Aponte seu domínio (ex: `pedido.shogatsu.com.br`) para o serviço.
5. Acesse `/painel.html` no domínio e troque a senha do restaurante na aba
   "Cardápio & Config" (ou "Configurações → Usuários", se estiver usando
   login por usuário).

✅ Como cardápio, configurações, pedidos e clientes agora ficam 100% no
banco PostgreSQL (e não mais em arquivos JSON no disco), você pode usar
tranquilamente serviços que apagam o disco a cada deploy (Render free tier,
por exemplo) — nada se perde, porque nada fica no disco local depois da
primeira migração.

## Como funciona o pagamento por PIX

Configure sua chave PIX no painel (aba "Cardápio & Config"). O sistema já
gera o QR Code e o código "copia e cola" com o **valor exato do pedido**
automaticamente — isso não depende de nenhum serviço externo pago.

O que ele **não** faz sozinho: confirmar automaticamente que o cliente pagou
(isso exige integrar um gateway como Mercado Pago, Asaas ou PagSeguro, que
cobra uma taxa por transação e exige conta empresarial). Por enquanto, o
recebimento deve ser conferido manualmente pelo restaurante — o que já é como
a maioria das lanchonetes locais funciona hoje. Se quiser, dá para evoluir
depois para confirmação automática.

## Taxa de entrega automática por distância

Na aba "Cardápio & Config" → "Taxa de Entrega", dá pra escolher entre:

- **Taxa única (fixa)** — como era antes, o mesmo valor para qualquer endereço.
- **Automática por distância (km)** — o sistema calcula a distância entre a loja
  e o endereço que o cliente digitar (CEP, rua e bairro) na tela de checkout, e
  aplica a fórmula: **taxa base** (até X km) + **R$ por km** excedente,
  arredondada para o valor que você definir. Também dá pra configurar um
  **raio máximo de entrega** — endereços além dele ficam bloqueados no
  checkout, com uma mensagem pedindo para falar pelo WhatsApp.

Para ativar o modo por distância:
1. Preencha o campo "Endereço" da loja (na mesma aba, mais acima) corretamente.
2. Clique em "📍 Localizar pelo endereço acima" para o sistema achar as
   coordenadas da loja automaticamente (usa OpenStreetMap, sem custo).
3. Ajuste os campos de km incluso, valor base, R$/km extra e raio máximo.
4. Salve.

O cálculo usa dois serviços públicos e gratuitos (ViaCEP para CEP → endereço,
e OpenStreetMap/Nominatim para endereço → coordenadas). Se o CEP for
inválido, o endereço não for encontrado, ou esses serviços estiverem fora do
ar, o sistema cai automaticamente para a **taxa padrão** configurada (o mesmo
campo "Taxa de entrega" de antes) — o pedido nunca fica travado por causa
disso, e você ainda pode ajustar o valor manualmente ao aceitar o pedido no
painel, como já era possível.

⚠️ Como esses serviços são gratuitos, evite trocar de endereço repetidamente
em sequência muito rápida (o app já espera meio segundo depois que o cliente
para de digitar antes de calcular, pra não sobrecarregar).

## Impressão dos pedidos (vias separadas por setor)

Cada pedido pode ser impresso em até 4 "vias" diferentes, uma para cada setor:
**Cozinha**, **Sushibar**, **Bar** e **Caixa** (comprovante completo, com preços e pagamento).

No painel, aba "Pedidos", cada pedido tem um botão 🖨️ que abre um menuzinho:
- Clique na via que quiser imprimir (só sai o que é daquele setor).
- Ou clique em "Imprimir todas as vias" pra mandar tudo de uma vez.

Cada prato do cardápio (aba "Cardápio & Config") tem um campo **"Via de impressão"**
(Cozinha/Sushibar/Bar) — é isso que decide em qual via aquele item aparece. A via
"Caixa" sempre mostra o pedido inteiro, com preços e forma de pagamento.

### Conectando impressoras de verdade

Na aba "Cardápio & Config" → "🖨️ Impressoras por Via", cada uma das 4 vias pode usar:

- **Navegador** (padrão, recomendado): abre a tela de impressão do navegador,
  usando a impressora já instalada no computador ou celular (USB ou rede, tanto
  faz — quem cuida disso é o sistema operacional). Funciona sempre, sem
  configuração nenhuma.
- **Rede (IP)**: manda os dados direto para uma impressora térmica de rede
  (porta `9100`, padrão da maioria), sem abrir tela nenhuma — ideal pra
  imprimir do celular com um toque só. Peça o IP da impressora pra quem
  instalou ela (geralmente aparece no próprio visor/etiqueta ou no roteador).
- **USB (avançado)**: para impressora ligada por cabo USB direto no
  computador/Raspberry Pi que roda o `server.js`, indicando o caminho do
  dispositivo (ex: `/dev/usb/lp0`, só existe em Linux).

Use o botão "🖨️ Testar" ao lado de cada via pra conferir se a impressora
está respondendo antes de confiar nela num dia de movimento.

⚠️ **Aviso importante**: os modos Rede e USB enviam comandos no padrão ESC/POS,
que é o mais comum entre impressoras térmicas de cupom (Epson, Elgin, Bematech,
etc.), mas pequenos detalhes (corte de papel, acentuação) podem variar de
modelo pra modelo. Teste bem antes de contar 100% com isso no dia a dia — o
modo "Navegador" é a opção mais confiável e não exige nenhuma configuração.

### Fonte do comprovante

Dá pra ajustar o tipo de letra, tamanho e cor do texto impresso em dois
lugares: no botão "🔤 Fonte" no topo do painel (acesso rápido, de qualquer
aba) ou na aba "Cardápio & Config" → "🖨️ Impressão do Comprovante" (mesma
configuração, com botão de pré-visualização).

## Ativar/desativar itens do cardápio

Em cada prato (aba "Cardápio & Config"), o botão "✅ Disponível" /
"🚫 Indisponível" no canto superior direito marca o item como esgotado sem
precisar apagar ele do cardápio. A mudança é salva na hora (não precisa clicar
em "Salvar tudo"). No site do cliente, o item indisponível aparece esmaecido,
sem o botão de adicionar ao carrinho.

## Logotipo (formato e tamanho)

Além de enviar a imagem do logo, dá pra escolher o formato que ele aparece no
site do cliente — **Redondo**, **Quadrado** ou **Retangular** — e o tamanho em
pixels, com uma prévia ao vivo no painel antes de salvar.

## Fotos dos produtos

Na aba "Cardápio & Config" do painel, cada item tem um quadrado "+ foto" — clique,
escolha uma imagem (PNG, JPG ou WEBP, até 4MB) e ela já sobe pro servidor e
aparece pros clientes na hora. As imagens ficam salvas em `public/uploads/`.

## Relatórios e exclusão de pedidos antigos

Na aba "Relatórios": faturamento, ticket médio, itens mais vendidos e receita
por dia/forma de pagamento, filtrando por período.

Pra apagar pedidos antigos do histórico (ex: depois de alguns meses), tem uma
segunda senha — a **senha master** — separada da senha normal do painel. Ela
só é pedida nessa ação de exclusão, como uma trava extra pra ninguém apagar
vendas sem querer. A exclusão é permanente.

## Notificações automáticas (push grátis + 20 mensagens pré-programadas)

O sistema agora avisa o cliente sozinho em 3 momentos, direto no app instalado
(PWA), **sem custo**: pedido recebido, pedido em preparo, e pedido pronto/saiu
para entrega. Se o cliente não tiver o app com notificações ativadas, o
sistema cai automaticamente para SMS (usa a mesma conta Twilio configurada em
Configurações → SMS acima — isso sim é pago).

### Ativando pela primeira vez

1. Rode `npm install` (instala o pacote `web-push`).
2. No painel, aba **Configurações → 🔔 Notificações Automáticas**, clique em
   **"🔑 Gerar chaves automaticamente"** e depois em **"💾 Salvar Tudo"** no
   topo da página. Isso é só uma vez.
3. Pronto — quando um cliente fizer login/cadastro ou finalizar um pedido no
   site, o navegador vai pedir permissão de notificação automaticamente.

### 20 mensagens pré-programadas

Na mesma seção do painel, marque quais das 20 mensagens (descontos,
aniversário do cliente, reserva, novidades, fidelidade, reengajamento, etc)
podem ser disparadas automaticamente — isso é a sua **pré-configuração**.
Mensagens desmarcadas nunca entram no rodízio automático.

### Disparo automático (algumas vezes por dia)

No campo **"Horários de disparo automático"**, defina os horários do dia
(ex: `11:00, 15:30, 19:00`) e clique em **"💾 Salvar Horários"**. A cada
horário configurado, o sistema dispara sozinho — todo dia, sem precisar de
nenhuma ação sua — a próxima mensagem ativa da lista (em rodízio, pra não
repetir sempre a mesma) para todos os clientes com push cadastrado.

Use o botão **"📤 Disparar Agora"** pra testar manualmente a qualquer momento,
sem esperar o horário configurado.

## O que mudou em relação ao arquivo original

- O pedido agora vai direto para um **painel do restaurante em tempo real**
  (`/painel.html`), com colunas Novo → Preparando → A caminho → Concluído,
  som de alerta e notificação do navegador a cada pedido novo.
- O cliente recebe um número de pedido e acompanha o status ao vivo na tela
  de sucesso.
- O cardápio e as configurações (taxa, horário, endereço, etc.) agora ficam
  no servidor — qualquer pessoa que acessar o link vê a mesma informação
  (antes ficava só salvo no navegador de cada um).
- PIX com QR Code e copia-e-cola gerados automaticamente com o valor do
  pedido.
- O botão de WhatsApp continua disponível na tela de sucesso, como um canal
  extra de contato.
