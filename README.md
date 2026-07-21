# 🍣 Shogatsu — Pedidos Online

Sistema de pedidos com cardápio (`/`), pedido enviado direto para a cozinha em
tempo real, PIX com valor automático e painel do restaurante (`/painel.html`).

Não usa nenhuma dependência externa (só Node.js puro), então não precisa
rodar `npm install` — basta ter Node instalado.

## Rodando localmente

```bash
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
2. Configure o comando de start como `node server.js`.
3. Aponte seu domínio (ex: `pedido.shogatsu.com.br`) para o serviço.
4. Acesse `/painel.html` no domínio e troque a senha do restaurante (arquivo
   `data/config.json`, campo `adminPass` — ou peça para eu adicionar uma tela
   de troca de senha pelo próprio painel).

⚠️ Importante: a pasta `data/` guarda os pedidos e o cardápio em arquivos
JSON. Ela precisa estar num disco **persistente** do seu servidor (não use
serviços "serverless" que apagam o disco a cada deploy, como Vercel/Netlify
functions puras) — senão os pedidos e o cardápio somem a cada reinício.

## Banco de dados (evita perder pedidos entre deploys)

Por padrão, os dados (pedidos, cardápio, clientes) ficam salvos em arquivos
JSON dentro da pasta `data/`. Isso funciona bem, mas em hospedagens como o
**Render**, esse disco é apagado toda vez que você faz um novo deploy (ou às
vezes num reinício) — ou seja, os pedidos e o cardápio somem.

Pra resolver isso, o servidor agora também sabe salvar uma cópia de tudo num
banco de dados **Postgres** externo, que é permanente. É opcional: sem
configurar nada, o sistema continua funcionando exatamente como antes (só com
o arquivo local).

### Passo a passo (grátis, sem depender do banco pago do Render)

1. Crie uma conta grátis em **[neon.com](https://neon.com)** (ou
   [supabase.com](https://supabase.com), ambos têm plano gratuito
   permanente — diferente do banco do próprio Render, que apaga os dados
   grátis depois de 30 dias).
2. Crie um projeto/banco novo. Copie a **connection string** (algo como
   `postgresql://usuario:senha@host/nomedobanco?sslmode=require`).
3. No painel do Render, vá em **Environment** (do seu Web Service) e adicione
   uma variável:
   - Nome: `DATABASE_URL`
   - Valor: a connection string que você copiou
4. Salve — o Render faz o redeploy automático. No log vai aparecer:
   `✅ Banco de dados conectado`.
5. Rode `npm install` (localmente, ou deixe o Render rodar sozinho no deploy)
   pra instalar o driver do Postgres (`pg`), que agora é a única dependência
   do projeto.

A partir daí, toda vez que um pedido, o cardápio ou um cliente for
salvo, a mesma informação vai automaticamente pro banco em segundo plano
(sem deixar o site mais lento). E toda vez que o servidor ligar, ele busca a
versão mais recente no banco antes de aceitar pedidos — então mesmo que o
Render apague o disco local num deploy, os dados voltam sozinhos.

⚠️ Se o banco cair ou ficar fora do ar por algum motivo, o site **continua
funcionando normalmente** com o arquivo local (o banco é só uma cópia de
segurança, não uma dependência obrigatória pro dia a dia) — só aparece um
aviso no log até a conexão voltar.

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
