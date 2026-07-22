# Shogatsu — Notificações automáticas unificadas (push grátis + 20 mensagens pré-programadas)

## O que mudou
Criei um novo arquivo `notifications.js` que unifica o disparo de mensagens
pro cliente em um só lugar:

- **Push notification (Web Push, grátis)** direto no app instalado (PWA) —
  usa o pacote `web-push` com chaves VAPID (geradas com um clique no painel).
- **SMS (pago) como fallback automático**, só quando o cliente não tem push
  cadastrado — reaproveita a mesma conta Twilio que já existia em
  Configurações → SMS, sem precisar cadastrar nada de novo.
- **20 mensagens pré-programadas** para o restaurante japonês (desconto,
  aniversário do cliente, reserva, novidades, fidelidade, reengajamento,
  datas comemorativas), ativáveis/desativáveis uma a uma no painel.
- **Disparo automático algumas vezes por dia**, em horários configuráveis
  (ex: 11h, 15h30, 19h) — o sistema dispara sozinho, em rodízio entre as
  mensagens ativas, todo dia, sem precisar de nenhuma ação manual.

Também passou a notificar automaticamente o cliente (push, com fallback SMS)
quando: o pedido é recebido, entra em preparo, e fica pronto/sai para
entrega — sem precisar mexer em nada na tela de pedidos.

## Onde mexer
- Painel → Configurações → **🔔 Notificações Automáticas**: gerar chaves
  VAPID, marcar as mensagens ativas, e configurar os horários de disparo.
- `notifications.js`: lógica de envio e as 20 mensagens padrão.
- `public/sw.js`: agora sabe exibir notificações push e abrir o app ao clicar.
- `public/index.html`: pede permissão de notificação automaticamente após
  login, cadastro ou finalizar um pedido.

## Atenção
Isso adiciona uma dependência nova (`web-push`) — rode `npm install` antes de
subir essa versão. Sem isso instalado, o sistema continua funcionando
normalmente, só sem as notificações grátis (cai direto pro SMS, se
configurado, ou fica sem notificar).

---

# Shogatsu — Clientes agora em banco de dados de verdade (Postgres)

## O que mudou
Criei um novo arquivo `db.js` que passa a cuidar dos dados de clientes.
Se a variável de ambiente `DATABASE_URL` estiver configurada, os clientes
(cadastro, login, senha, endereço salvo, recuperação de senha) passam a
ser lidos e gravados **direto no seu banco Postgres** — que sobrevive a
qualquer reinício do servidor, diferente do arquivo `customers.json` de
antes.

Se você não configurar `DATABASE_URL`, o sistema continua funcionando
exatamente como até agora (arquivo local) — nada quebra.

## 🐛 Bug encontrado de brinde
Havia duas rotas iguais (`GET /api/admin/customers`) no código — uma
delas nunca era usada (a primeira sempre "ganhava"), então a versão mais
completa (com endereço salvo, status de recuperação de senha pendente)
nunca rodava de verdade. Corrigido — a rota que sobrou é a completa, e
agora também exige nível admin (era só "logado", incluindo Vendas, o que
não fazia sentido pra dados de clientes).

## ⚠️ 3 passos pra ativar — sem isso, nada muda no ar

**1) Adicione a variável de ambiente no seu serviço WEB do Render**
(não no banco — no serviço que roda o `server.js`):
- Vá em [dashboard.render.com](https://dashboard.render.com) → seu serviço
  web (não o banco) → aba **Environment**
- Clique em **Add Environment Variable**
- **Key**: `DATABASE_URL`
- **Value**: (a URL interna do banco que você me passou)
- Salve

**2) Substitua os arquivos e faça o deploy**
Suba os arquivos deste zip pro seu repositório (`server.js`, `db.js` — o
`db.js` é novo, não existia antes — e o `package.json` atualizado) e dê
push. O Render vai instalar a dependência nova (`pg`) sozinho durante o
deploy, não precisa fazer nada manual pra isso.

**3) Confira o log do primeiro início**
Depois do deploy, em **Logs** no Render, procure por uma dessas duas
linhas logo no início:
- `🗄️ Conectado ao Postgres — clientes armazenados no banco...` → deu
  certo, e se você já tinha clientes cadastrados, eles foram migrados
  automaticamente pro banco nesse primeiro início (só acontece uma vez).
- `⚠️ Erro ao conectar/preparar o banco de dados: ...` → alguma coisa
  errada na `DATABASE_URL` ou o banco ainda não terminou de ficar
  disponível — nesse caso o sistema continua rodando normalmente com o
  arquivo local até você corrigir e reiniciar.

## Testes que fiz
Não consigo conectar de verdade no seu banco a partir daqui (a URL
interna só existe dentro da rede do Render, o que é esperado e correto),
mas testei tudo que consigo testar sem essa conexão:
- Fluxo completo (cadastro → login → pedido salva endereço → login de
  novo já mostra o endereço) rodando **sem** banco configurado — continua
  funcionando 100% como antes.
- Servidor com `DATABASE_URL` configurada mas o banco inacessível (minha
  situação aqui) — confirma que o servidor **não cai**, cada rota afetada
  retorna um erro controlado, e o resto do sistema continua no ar normal.

## O que ainda fica em arquivo (por enquanto)
Só clientes foram pro banco por serem o pedido mais urgente. Pedidos e
configurações do cardápio continuam em JSON local — se quiser migrar
esses também mais pra frente, é só pedir.

## Como aplicar
Três arquivos: `server.js` (mudou), `db.js` (novo) e `package.json`
(mudou, agora lista `pg` como dependência). `public/index.html` e
`public/painel.html` **não mudaram** nesta atualização.
