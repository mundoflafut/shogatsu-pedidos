# Shogatsu — Nome do restaurante, modo claro no cliente, contato

## ✅ Confirmação: nenhuma configuração anterior foi perdida
Testei carregando a configuração do zero e contei: **39 campos** de config,
todos presentes (impressoras, fontes, taxa de entrega, cupons, usuários,
labels, tudo). As atualizações anteriores continuam funcionando juntas.

## 🐛 Bug grave encontrado: nome do restaurante não aparecia em lugar nenhum
Configurações tinha um campo "Nome do Restaurante" desde a primeira
reorganização — mas ele **nunca teve efeito em nada**. O cabeçalho do site
sempre mostrava "SHOGATSU" fixo no código, os comprovantes impressos
(navegador e térmica) e a mensagem do WhatsApp também. Corrigido em todos
os lugares:
- Cabeçalho do site do cliente
- Comprovantes impressos (Caixa, Cozinha, Sushibar, Bar — navegador e impressora térmica)
- Mensagem enviada pelo WhatsApp ao finalizar o pedido

Também adicionei o campo de telefone (pra ligação/SMS) que já existia no
sistema mas não tinha onde ser editado.

## 🌙☀️ Modo Escuro/Claro no site do cliente (mobile)
Igual ao que já tinha no painel, agora o site que o cliente usa no celular
também tem o alternador de tema — ícone 🌙/☀️ no topo, do lado do carrinho.
A preferência fica salva no celular da pessoa.

## 📞 Fale Conosco — Ligar, SMS ou WhatsApp
Novo botão no topo do site (e também tocando no telefone mostrado no
cabeçalho) abre uma folha com 3 opções pra falar com o restaurante:
- **📞 Ligar** — abre o discador do celular
- **✉️ SMS** — abre o app de mensagens com um texto inicial pronto
- **💬 WhatsApp** — abre a conversa com uma mensagem inicial pronta

Tudo client-side, sem custo nenhum — são só links `tel:`, `sms:` e
`wa.me` que abrem os próprios apps do celular do cliente. (Isso é
diferente de mandar SMS/WhatsApp automático do restaurante pro cliente,
que aí sim precisaria de um serviço pago, como já conversamos.)

## Como aplicar
`server.js`, `public/index.html` e `public/painel.html` — os três
mudaram. Substitua e dê push.
