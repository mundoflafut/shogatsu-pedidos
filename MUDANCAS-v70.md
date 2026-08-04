# v70 — Avatar do Chat Express, Cliente Cadastrado nas Conversas e Correções

## 🤖 Avatar do Chat Express (novo, editável)
- Campo separado da Logo da Marca: `chatAvatarUrl` — o chat pode ter um mascote/ícone diferente
  da logo do cabeçalho, sem misturar as duas coisas
- Nova seção no painel: **Configurações → Aparência → 🤖 Avatar do Chat Express** — enviar,
  remover (volta a usar a logo da marca), com pré-visualização
- A imagem do mascote enviada nesta conversa já está configurada como avatar padrão
- Aparece automaticamente: no chat do cliente, no cabeçalho da página Mensagens do painel, e na
  lista de conversas — tudo puxando do mesmo lugar
- Se a imagem configurada falhar por qualquer motivo, cai sozinho pro ícone padrão do sistema em
  vez de mostrar ícone quebrado

## 👤 Nome do cliente cadastrado nas conversas
**Bug real corrigido:** o campo que deveria mostrar o nome do cliente nunca era preenchido pelo
servidor — por isso toda conversa aparecia como "Cliente a1b2c..." mesmo pra quem já tinha pedido
antes. Agora, quando o cliente já tem cadastro (pediu antes / fez login no cardápio), o nome e
telefone dele são enviados e salvos na conversa — e aparecem certinho na lista do painel.

## 🔍 Buscar cliente cadastrado e iniciar conversa
Novo botão **"🔍 Nova conversa com cliente cadastrado"** na página Mensagens: busca por nome ou
telefone na base de clientes (a mesma usada em SMS/Relatórios) e manda a primeira mensagem sem
precisar esperar o cliente escrever primeiro. Se esse cliente depois abrir o Chat Express pelo
celular dele usando o mesmo telefone, a conversa é reaproveitada automaticamente — ele já vê a
mensagem esperando, em vez de nascer uma conversa duplicada.

## 🗑️ Excluir histórico de mensagens
Botão 🗑️ no cabeçalho de cada conversa aberta no painel — apaga o histórico por completo, com
confirmação antes (ação sem volta). Restrito a usuários `admin` ou `master` (vendas não pode
excluir, só responder).

## 🐛 Bugs corrigidos
- **Requisições HEAD devolviam 404** mesmo com o arquivo existindo — só `GET` era tratado pelo
  servidor de arquivos estáticos. Corrigido (afeta qualquer ferramenta/monitoramento que
  verifica se uma imagem existe antes de carregar).
- **Galeria de fundos prontos do Chat Express** — os fundos mais escuros (Preto Texturizado,
  Minimalista Escuro, Madeira Escura, Dragão Japonês) tinham contraste baixo demais e praticamente
  não apareciam nas miniaturas pequenas da galeria. Contraste reforçado em todos.
- Miniaturas da galeria agora usam `<img>` de verdade (com `loading="lazy"` e aviso visível se
  uma imagem específica falhar ao carregar), em vez de fundo CSS — mais fácil de diagnosticar se
  algo quebrar no futuro.

## Verificação feita antes de entregar
- Sintaxe JS e do servidor validada
- `<div>`/`</div>` balanceados nos dois arquivos principais
- Testado ao vivo, no servidor local: HEAD nos SVGs, avatar carregando, nome de cliente
  aparecendo na conversa, conversa iniciada pelo painel sendo adotada pelo cliente com o mesmo
  telefone, exclusão de histórico funcionando e bloqueada corretamente pra usuário sem permissão
- Dados de teste removidos antes do empacotamento final

## Nada mais foi alterado
Pedidos, cardápio, impressão, splash screen, fundo do chat (v67), Configurações reorganizada
(v69-a) — tudo como estava.
