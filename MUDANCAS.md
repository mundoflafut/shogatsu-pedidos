# Shogatsu — Banco de dados persistente (Postgres)

## 🗄️ Os dados agora podem ficar salvos num banco de verdade, não só em arquivo
Até agora, pedidos, cardápio e clientes ficavam só em arquivos JSON dentro da
pasta `data/`. Isso é simples, mas em hospedagens como o Render esse disco é
apagado a cada novo deploy — os pedidos somem.

Agora o servidor também sabe conversar com um banco **Postgres** externo
(ex: Neon ou Supabase, ambos com plano grátis permanente):

- Se a variável de ambiente `DATABASE_URL` estiver configurada: toda vez que
  algo é salvo (pedido novo, mudança no cardápio, cliente cadastrado, etc.),
  a mesma informação vai automaticamente pro banco em segundo plano, sem
  deixar o site mais lento. E toda vez que o servidor liga, ele busca a
  versão mais recente do banco antes de começar a aceitar pedidos — assim, se
  o Render apagar o disco local num deploy, tudo volta sozinho.
- Se `DATABASE_URL` **não** estiver configurada: nada muda, o sistema roda
  exatamente como antes, só com o arquivo local.
- Se o banco cair ou ficar fora do ar num momento: o site continua
  funcionando normal com o arquivo local (o banco é uma cópia de segurança,
  não uma dependência obrigatória do dia a dia) — só aparece um aviso no log.

Passo a passo completo (criar o banco grátis, pegar a connection string,
configurar no Render) está no `README.md`, na seção "Banco de dados".

## Como aplicar
`server.js` e `package.json` mudaram (nova dependência: `pg`, o driver do
Postgres). Substitua os dois arquivos, rode `npm install` e dê push. Se você
não quiser usar banco de dados por enquanto, não precisa fazer nada além
disso — continua tudo funcionando como antes.
