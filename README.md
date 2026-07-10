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
