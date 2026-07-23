# Shogatsu — Refatoração completa: cardápio, config, pedidos e clientes 100% em PostgreSQL

## O que mudou
Esta era a causa dos bugs "cardápio não fica salvo", "produtos voltam ao
padrão" e "configurações desaparecem": tudo isso vivia em arquivos JSON
(`data/config.json`, `data/orders.json`) no disco do servidor. Em serviços
como o Render (plano gratuito), esse disco **não é persistente** — ele é
recriado a cada novo deploy ou reinício, apagando tudo que não estava no
código-fonte original.

Criei um módulo único, `database.js`, que agora concentra **todo** o SQL do
projeto (o `server.js` e o `notifications.js` só chamam funções dele, nunca
rodam consulta direto). A partir desta versão:

- **Cardápio** — normalizado de verdade em tabelas relacionais
  (`menu_categories`, `menu_items`; `menu_extras` já existe pronta pra
  adicionais no futuro, hoje coberta pelo campo "variações" de cada item).
- **Configurações** (taxa, horário, PIX, impressoras, usuários, cupons,
  zonas de entrega, anúncios, etc.) — tabela `settings`.
- **Pedidos** — tabela `orders` (guarda o pedido completo, pra nunca quebrar
  nada que o painel já espera) + `order_items` normalizada em paralelo, pra
  permitir relatórios em SQL puro no futuro.
- **Clientes** — continuam na tabela `customers` (já existia desde a versão
  anterior, só que o código de acesso migrou de `db.js` pra dentro do
  `database.js` único).
- **Campanhas de notificação e assinaturas de push** — que também viviam em
  `data/campaigns.json` e `data/push-subs.json` — agora em `settings` e
  `push_subscriptions`.

Os arquivos `data/*.json` e `default-menu.json` continuam no projeto, mas
só servem de **seed inicial**: na primeiríssima vez que o servidor roda com
`DATABASE_URL` configurada, se esses arquivos existirem, o conteúdo deles é
copiado pro banco automaticamente. Depois disso, o sistema nunca mais olha
pra eles — pode até apagá-los.

## 🐛 Bugs encontrados e corrigidos
1. **Causa raiz do "cardápio não persiste"**: tudo ficava em
   `data/config.json`, que some em discos não-persistentes (Render free
   tier). Corrigido migrando pra Postgres.
2. **Criar pedido regravava o arquivo inteiro de pedidos** a cada novo
   pedido (lia todos, dava `unshift`, gravava todos de novo) — funcionava,
   mas ficava mais lento e mais arriscado (corrida entre dois pedidos
   simultâneos) à medida que o histórico crescesse. Troquei por uma
   inserção direta (`db.createOrder`) só do pedido novo.
3. **Bug de precedência de operador** que eu mesmo teria introduzido na
   migração (`await db.getOrders().filter(...)` — o `.filter()` acabava
   grudado no resultado errado): pego e corrigido antes de entregar
   (`(await db.getOrders()).filter(...)`).
4. Removi código morto que sobrou da versão em arquivo: `readJSON`,
   `writeJSON`, `isWithinSchedule` e `normalizeMenu` duplicados dentro do
   `server.js` (a mesma lógica já mora dentro do `database.js` agora).

## ⚠️ Passos pra ativar — sem isso, o servidor não sobe
Diferente da migração anterior (só clientes), **desta vez o banco é
obrigatório** — pedido explícito seu foi eliminar o JSON como
armazenamento operacional. Sem `DATABASE_URL`, o servidor recusa-se a
iniciar e mostra uma mensagem explicando o que falta (em vez de subir
"quase funcionando" e voltar a perder dados silenciosamente).

**1) Garanta que existe um banco Postgres** (Render Postgres, Supabase ou
Neon — todos têm plano gratuito).

**2) Configure `DATABASE_URL` no serviço que roda o `server.js`** (Render →
seu serviço **Web**, não o banco → aba **Environment**).

**3) Suba os arquivos e faça o deploy**: `server.js`, `database.js` (novo),
`notifications.js` (mudou), `package.json` (sem mudança de dependências —
`pg` já estava listado) e `README.md`. O arquivo `db.js` antigo foi
removido — não é mais usado.

**4) Confira o log do primeiro início.** Deve aparecer:
`✅ Banco inicializado (dados migrados de data/*.json)` (se já havia dados
no arquivo) ou `(seed padrão)` (instalação nova), seguido de
`🗄️ Conectado ao Postgres — cardápio, configurações, pedidos e clientes
100% no banco (persistem entre reinícios).`

## Testes que fiz
Não tenho acesso à internet neste ambiente, então não consegui testar
contra um Postgres real (Supabase/Render/Neon). O que testei:
- `node --check` em `server.js`, `database.js` e `notifications.js` (sem
  erro de sintaxe).
- Simulei o driver `pg` com um stub local só pra validar toda a cadeia de
  `await`/lógica de bootstrap sem depender de rede — subi o servidor de
  ponta a ponta e testei via HTTP: `GET /api/config`, `POST /api/login`,
  `POST /api/orders` (criar pedido), `GET /api/orders`, `GET
  /api/admin/campaigns`, `GET /api/admin/customers`, `GET /api/reports` e
  `GET /api/admin/backup`. Todas responderam sem erro de runtime.
- Confirmei que, sem `DATABASE_URL`, o processo encerra imediatamente com
  a mensagem de erro explicando o que fazer (em vez de travar em outro
  ponto qualquer com um erro confuso).

**Isso não substitui testar com um banco de verdade.** Recomendo fortemente
rodar localmente com uma `DATABASE_URL` real antes de ir pra produção —
veja "Testes recomendados antes do deploy" no final deste arquivo.

## O que optei por manter como estava (e por quê)
- **Cupons, zonas de entrega, usuários, impressoras** continuam dentro do
  objeto de configurações (tabela `settings`, coluna `value` em JSONB), em
  vez de virar uma tabela relacional própria pra cada um. O painel já lê e
  grava esses dados como sub-objetos de `cfg` em bloco (ex: salva o array
  de cupons inteiro de uma vez) — quebrar isso em tabelas separadas exigiria
  reescrever toda essa parte do painel sem eu conseguir testar contra um
  banco de verdade primeiro. As tabelas `delivery_zones`, `printers`,
  `users` e `coupons` já existem no banco, prontas pra essa evolução futura
  sem precisar mexer no schema de novo.
- Pedidos guardam o objeto completo numa coluna `JSONB` (além das colunas
  típicas e da tabela `order_items`, já preenchidas em paralelo) — isso
  preserva 100% do formato que o painel já espera, sem risco de esquecer um
  campo na tradução.

## Testes recomendados antes do deploy
1. Suba um Postgres de teste (gratuito) e configure `DATABASE_URL` local.
2. Rode `node server.js` e confira a mensagem de banco inicializado no log.
3. Teste o fluxo completo: abrir o cardápio, editar um produto no painel,
   **reiniciar o servidor** (`Ctrl+C` e rodar de novo) e confirmar que a
   edição continua lá — esse é o teste que prova que o bug original foi
   corrigido.
4. Fazer um pedido de teste, aceitar/mudar status no painel, imprimir uma
   via, e conferir que aparece em Relatórios.
5. Cadastrar um cliente, sair, entrar de novo, confirmar que os dados
   persistem.
6. Rodar `GET /api/admin/backup` e conferir que o JSON exportado tem
   `cfg`, `menu`, `orders` e `customers` preenchidos.
7. Só depois disso, apontar o domínio de produção e migrar de vez.

## Como aplicar
Arquivos novos/alterados: `database.js` (novo — substitui `db.js`, que foi
removido), `server.js` (mudou), `notifications.js` (mudou),
`README.md` (mudou, seção de deploy). `public/*.html` **não mudaram**
nesta atualização — nenhuma tela, rota ou funcionalidade foi removida.

---



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
