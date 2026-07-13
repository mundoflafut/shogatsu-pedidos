# 🍣 Shogatsu — Pedidos Online

Sistema de pedidos com cardápio (`/`), pedido enviado direto para a cozinha em
tempo real, PIX com valor automático e painel do restaurante (`/painel.html`).

**Persistência**: todos os dados (pedidos, clientes, cardápio, categorias,
configurações e imagens enviadas) ficam gravados em um banco **PostgreSQL** —
nada é salvo em arquivo local. Isso significa que reiniciar o servidor, fazer
um novo deploy ou atualizar o código **nunca apaga nada**.

## Dependências

Usa uma única dependência: o driver oficial do PostgreSQL (`pg`). Antes de
rodar pela primeira vez:

```bash
npm install
```

## Configurando o banco de dados

1. Crie um banco PostgreSQL (no Render: "New +" → "PostgreSQL" — o plano
   gratuito serve pra começar).
2. Copie a "Internal Database URL" (se o site também for rodar no Render) ou
   a "External Database URL" (se for rodar de outro lugar).
3. Configure a variável de ambiente `DATABASE_URL` com essa connection string
   — veja `.env.example`.

Na primeira vez que o servidor conectar num banco **totalmente vazio**, ele
cria as tabelas automaticamente (rodando a migration em `migrations/`) e
grava a configuração e o cardápio padrão, só essa vez. Depois disso, ele
nunca mais recria tabelas nem sobrescreve dados — só conecta e usa o que já
existe. Se preferir desligar até essa criação inicial, defina `AUTO_SEED=false`.

## Rodando localmente

```bash
npm install
DATABASE_URL="postgresql://usuario:senha@localhost:5432/shogatsu" node server.js
```

Depois acesse:
- Cliente: http://localhost:3000
- Painel do restaurante: http://localhost:3000/painel.html
  - Senha do painel: `shogatsu2026`
  - Senha master (só pra apagar pedidos antigos): `shogatsuMaster2026`
  - **Troque as duas na aba "Cardápio & Config" assim que possível.**

## Colocando no ar no Render

1. Suba este projeto para um repositório Git (GitHub/GitLab).
2. No Render: "New +" → "Web Service", conecte o repositório.
3. Build Command: `npm install` — Start Command: `node server.js`.
4. Crie (ou já tenha criado) um banco PostgreSQL no Render e copie a "Internal
   Database URL".
5. No seu Web Service → "Environment", adicione a variável `DATABASE_URL` com
   essa connection string.
6. Deploy. Acompanhe os logs — você deve ver:
   ```
   🔌 Conectando ao PostgreSQL...
   ✅ Conectado ao PostgreSQL com sucesso.
   📦 Verificando migrations...
   ✅ Migration aplicada com sucesso: 001_init.sql
   🌱 Nenhuma configuração encontrada (primeiro boot) — gravando valores padrão...
   ✅ Banco de dados pronto.
   🍣 Shogatsu rodando em http://localhost:10000
   ```
7. Acesse `/painel.html` no domínio que o Render deu e troque as senhas.

✅ A partir daqui, qualquer novo deploy (push no Git, restart manual, etc.)
só reconecta no mesmo banco — pedidos, clientes, cardápio e configurações
continuam exatamente como estavam.

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
aparece pros clientes na hora. As imagens ficam salvas **dentro do PostgreSQL**
(tabela `uploads`), não em disco — então também não se perdem em um redeploy.

## Relatórios e exclusão de pedidos antigos

Na aba "Relatórios": faturamento, ticket médio, itens mais vendidos e receita
por dia/forma de pagamento, filtrando por período.

Pra apagar pedidos antigos do histórico (ex: depois de alguns meses), tem uma
segunda senha — a **senha master** — separada da senha normal do painel. Ela
só é pedida nessa ação de exclusão, como uma trava extra pra ninguém apagar
vendas sem querer. A exclusão é permanente.

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
- **Persistência migrada de arquivos JSON para PostgreSQL** — pedidos,
  clientes, cardápio/categorias, configurações e imagens enviadas agora
  vivem no banco de dados (veja "Configurando o banco de dados" no topo
  deste arquivo). Nada é mais salvo em disco local, então nada se perde em
  restart, redeploy ou atualização do código no Render.
