# Shogatsu — v56 — Notas desta versão

Esta versão só ADICIONA funcionalidade nova. Nenhuma tela, rota ou comportamento existente foi
alterado — Cardápio, Custos & Ficha Técnica, Pedidos, Reservas, Motoboys etc. continuam
exatamente como estavam na v55. Tudo abaixo segue o mesmo padrão visual (`settings-card`,
`drawer`/`drawer-overlay`, `btn`) e os mesmos helpers (`apiGet`/`apiPost`, `https.request` sem
dependências externas) já usados no resto do sistema.

## 1. 🤖 IA de Atendimento
Nova seção em **Configurações → IA de Atendimento**. Quando ativada e com uma chave de API da
Anthropic (Claude) cadastrada, o cardápio (`index.html`) passa a mostrar, no menu "Fale com a
gente", a opção **"Tirar uma dúvida"** — um chat simples onde o cliente pergunta algo (horário,
se tem prato vegetariano, taxa de entrega etc.) e recebe resposta automática, com o cardápio e
os dados da loja como contexto.

- Opcional: sem chave cadastrada, a opção simplesmente não aparece pro cliente.
- Segurança: a chave de API **nunca** é devolvida pelo endpoint público `/api/config` (nem pro
  próprio painel) — só um `enabled: true/false`. Ela é gerenciada por uma rota separada e
  autenticada (`/api/ia/settings`), no mesmo espírito de como senhas nunca voltam pro painel.
- Isso é atendimento automático **dentro do site**, não substitui nem altera o WhatsApp manual
  que já existia — o botão de WhatsApp continua do jeito que sempre foi.

## 2. 📷 Leitura automática de nota fiscal (Custos & Ficha Técnica → Ingredientes)
Novo campo de upload de foto na tela de "+ Novo ingrediente". Ao enviar uma foto ou print de uma
nota fiscal de compra, a IA lê os itens, quantidades e valores, e cadastra os ingredientes
sozinha (custo = valor total ÷ quantidade), sem precisar digitar nada. Usa a mesma chave/config
da IA de Atendimento (item 1) — se não estiver configurada, o botão avisa isso claramente.

## 3. 📱 Botão de pedido direto no Instagram/Facebook
Novos campos em **Configurações → Redes Sociais**. Se preenchidos, o menu "Fale com a gente" do
cardápio ganha as opções **Instagram** e **Facebook**, abrindo a conversa direto (`ig.me`/`m.me`).
Em branco, o botão correspondente simplesmente não aparece — igual ao WhatsApp de sempre.

## 4. 📥 Importação de contatos externos, agrupados por DDD
Nova seção em **Configurações → Importar Contatos Externos**. Aceita:
- CSV do Google Contatos
- CSV do Outlook
- vCard (`.vcf`) do Android/iOS
- Bloco de notas (`.txt`), um contato por linha

Cada telefone importado é agrupado automaticamente por DDD. Fica guardado num arquivo **separado**
de `customers.json` de propósito — `customers.json` é a lista de clientes reais, gerada sozinha a
partir de pedidos, e não devia se misturar com uma lista externa que ninguém confirmou que já
comprou algo. Serve pra ampliar o alcance de campanhas futuras de SMS/promoção por região.

---

## Arquivos alterados
- `server.js` — novos campos `cfg.ia`/`cfg.social`, novas rotas `/api/ia/*`,
  `/api/custos/ler-imagem`, `/api/admin/contatos*`; nenhuma rota existente foi removida ou teve
  sua assinatura alterada.
- `public/painel.html` — 3 novos `settings-card` em Configurações; novo botão de upload em
  Ingredientes.
- `public/index.html` — novo drawer "Tire sua dúvida" (reaproveita o CSS do drawer de contato já
  existente); novas opções no menu "Fale com a gente".
- Novo arquivo de dados: `data/contatos-importados.json` (criado vazio automaticamente).

## Varredura de bugs feita antes de fechar a versão
- `node --check server.js`: sem erros.
- Todos os blocos `<script>` de `index.html`, `painel.html`, `entregador.html`,
  `cardapio-rodizio.html`, `avaliar-rodizio.html`, `pedir-agora.html`, `divulgacao-rodizio.html`:
  sem erro de sintaxe. (`cardapio-rodizio-popular.html` reporta um falso positivo de extração
  por causa de um comentário HTML que contém o texto "<script>" dentro dele — o script real foi
  isolado manualmente e conferido: sem erro. Esse arquivo não foi alterado nesta versão.)
- Todos os `.json` em `data/` e `default-menu.json`: válidos.
- Servidor testado rodando de verdade: `/api/config` público confirma que a chave de IA nunca
  vaza (mesmo depois de configurada); login admin, salvar/ler config de IA, e importar contatos
  com agrupamento por DDD testados ponta a ponta com sucesso.
