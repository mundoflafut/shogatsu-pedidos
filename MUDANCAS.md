# v108 — Notificação de pedido "estilo iFood/99Food": toque contínuo até aceitar + varredura de bugs

**Pedido:** notificação de pedido novo parecida com iFood/99Food (5 tipos de alerta, som alto,
tocando ao mesmo tempo em todos os aparelhos conectados) + varredura geral de bugs.

**O que já existia (v106) e foi conferido, não recriado:** os 5 sons de alerta sintetizados
(Configurações → 🔊 Alertas), volume ajustável, e o fato de **todo** Painel aberto (qualquer
computador/celular, ao mesmo tempo) já recebe o pedido novo pelo mesmo evento em tempo real
(SSE `new-order`, `server.js`) e toca o som sozinho — ou seja, o "toca simultâneo em todos os
app conectados" pedido já acontecia de verdade nessa parte; só era testado e confirmado agora.

**NOVO: toque contínuo até alguém aceitar (o que faltava pra ficar igual iFood/99Food).** Antes,
o alerta sonoro de pedido novo tocava **uma única vez** no instante em que ele chegava — se
ninguém estivesse olhando a tela naquele segundo exato, o pedido podia passar despercebido até
alguém notar visualmente. Agora, em Configurações → 🚨 Toque contínuo (estilo iFood/99Food): com
a opção ligada (padrão), **enquanto o pedido continuar na coluna "Novos"** (não aceito), o alerta
repete sozinho a cada 3/5/8/12 segundos (configurável), no volume e som já escolhidos em 🔊
Alertas — e para automaticamente assim que o pedido é aceito. O card do pedido no Kanban mostra
"🚨 Tocando até aceitar…" pulsando enquanto isso, com um botão 🔕 pra silenciar só aquele pedido
específico (sem afetar os outros), igual ao padrão já usado no alerta de atraso.

**Por que isso conta como "simultâneo em todos os apps":** como o toque contínuo é reavaliado a
cada segundo em cada Painel aberto, com a mesma configuração (salva pra loja toda) e a mesma
lista de pedidos (sincronizada em tempo real), todo computador/celular com o Painel aberto toca
junto, de forma independente — não existe um "aparelho mestre" enviando o toque pros outros, e
por isso nenhum aparelho pode travar ou atrasar o alerta dos demais.

**Varredura de bugs feita nesta rodada:** checagem de sintaxe de `server.js`, `webpush.js`,
`print-agent/print-agent.js` e de todo bloco `<script>` de `public/*.html` (painel, cardápio,
entregador, nota fiscal, pedir agora, divulgação/avaliação/cardápio do rodízio) — todos sem erro
de sintaxe. Servidor testado de ponta a ponta depois da mudança: sobe normal, `/`, `/painel.html`
e `/api/orders` respondem com os códigos esperados (200, 200 e 401 sem token, respectivamente).
Nenhum bug novo encontrado nesta varredura além do que já foi corrigido nas rodadas anteriores
(v100–v107).

**Arquivo alterado:** só `public/painel.html` (novo bloco de configuração, 3 funções novas,
um `@keyframes pulse` e o indicador no card do Kanban). `server.js` e o restante do sistema não
foram tocados.

---

# v107 — Sistema de permissões por função: Caixa, Cozinha e Entrega

**Terceira rodada da auditoria**, item de usuários/permissões pedido nos prompts. A base de
autenticação (sessão com token, hash de senha desde a v106) já existia com 3 níveis
administrativos (master/admin/vendas) — esta rodada adiciona os **3 papéis operacionais**
pedidos, cada um só com acesso ao que a função precisa, com a permissão checada no
**backend** (não só escondendo botão na tela).

**Papéis novos:**
- **🧑‍🍳 Cozinha** — só pode mudar pedido de NOVO → EM PREPARO e de EM PREPARO → PRONTO (saiu). Não cancela, não mexe em cardápio/preço/configuração/usuários.
- **🛵 Entrega** — só pode mudar pedido de SAIU → ENTREGUE. Mesmas restrições de resto.
- **🧾 Caixa** — recebe, aceita e finaliza pedidos (inclusive retirada, sem etapa de entrega) e cancela a pedido do cliente; não mexe em cardápio, preço, configuração nem usuários.
- master/admin/vendas continuam exatamente como sempre — sem nenhuma restrição nova nesses três, pra não quebrar o uso normal de quem já usa o sistema.

**Onde a permissão é checada de verdade:** `canChangeOrderStatus()` em `server.js`, chamada
dentro do `PATCH /api/orders/:id` — quem não tem permissão pra aquela transição específica
recebe `403` e uma mensagem clara, mesmo que chame a API direto sem passar pela tela. O painel
(`public/painel.html`) também: esconde da navegação tudo que exige `admin`/`master` (Cardápio,
Configurações, Relatórios, Usuários etc. — os 3 papéis novos entram com nível 0, abaixo de
"vendas", então tudo isso já fica escondido de graça) e some com o botão "Cancelar" pra
Cozinha/Entrega. A tela de Pedidos (Kanban + lista) continua visível — é o que essas 3 funções
precisam ver.

**Criação de usuário:** Configurações → 👥 Usuários (só Master acessa) agora tem os 3 papéis
novos no seletor, com uma explicação curta do que cada um pode fazer.

**Ainda pendente:** celular pareado como dispositivo de alerta separado (QR code/pareamento) —
segue de fora, é infraestrutura nova (registro de dispositivo + push dirigido por aparelho) que
não existe nada parecido ainda no projeto.

---

# v106 — Segurança de login do painel + 5 sons de alerta + alerta de pedido atrasado

**Continuação da auditoria v105**, itens seguintes da lista pedida (sons, atraso e um problema
de segurança encontrado no caminho — usuários e permissões completas ficam pra próxima rodada,
ver nota no fim).

**1) BUG DE SEGURANÇA CORRIGIDO — senha de usuário do painel em texto puro.** `POST
/api/admin/users` (server.js) gravava a senha dos usuários (master/admin/vendas) direto em
`config.json`, sem nenhum hash — diferente dos PINs de cliente, que já usavam hash desde sempre.
Quem tivesse acesso ao arquivo de configuração (backup, export, cópia no Supabase) via a senha
de qualquer usuário do painel diretamente. **Correção:** novo campo `passwordHash` (sha256 +
salt do app, mesmo padrão do hash de PIN), usado em toda criação/alteração de usuário daqui pra
frente; contas antigas que só têm a senha em texto puro são migradas pro hash automaticamente no
próximo login bem-sucedido, sem pedir nada a mais do usuário.

**2) 5 sons de alerta originais, com seletor e "Testar som" (`public/painel.html`).**
Sintetizados na hora via Web Audio (nenhum áudio de terceiros envolvido, então nada de risco de
usar som de app de delivery de verdade): Som 1 curto/chamativo, Som 2 dois tons, Som 3 urgente
(repetição rápida), Som 4 três notas em arpejo, Som 5 duplo/contínuo. Escolha salva por
aparelho/navegador (localStorage), igual ao volume que já existia — cada computador da loja pode
preferir um som diferente. Configurações → 🔊 Alertas.

**3) Alerta de pedido atrasado.** Configurável em Configurações → ⏱️ Alerta de pedido atrasado:
tempo pra considerar atrasado (10/15/20/30 min ou desativado) e intervalo de repetição (1/3/5/10
min), salvos no `config.json` (vale pra loja toda). Pedido "novo" ou "preparando" que passa do
tempo fica destacado em vermelho no card do Kanban com o tempo de espera, toca o Som 3 (urgente)
e repete no intervalo configurado até ser resolvido. Botão 🔕 no próprio card silencia só aquele
pedido (não silencia os outros, e volta ao normal se a página for recarregada).

**Ainda pendente da lista original** (fica pra próxima rodada, avisar quando quiser seguir):
sistema completo de usuários/permissões por função (a base já existe — 3 níveis master/admin/
vendas com sessão e `requireRole` — mas não os 5 papéis granulares pedidos: caixa/cozinha/
entrega separados, nem a lista de permissões individuais) e o celular pareado como dispositivo
de alerta (QR code/pareamento — infraestrutura nova, ainda não existe nada parecido no projeto).

---

# v105 — AUDITORIA CRÍTICA: pedido podia SUMIR de verdade (race condition), duplicar em retry, e painel não recuperava pedido perdido por queda de conexão

**Pedido de auditoria completo do fluxo de pedidos** (cliente → checkout → API → banco →
painel). Três bugs reais confirmados no código (não apenas hipóteses da lista de verificação
pedida):

**1) BUG CRÍTICO — pedido real podia desaparecer de verdade.** Em `POST /api/orders`
(server.js), o array de pedidos era lido de `orders.json` (`readJSON`) e só era regravado
(`writeJSON`) bem mais abaixo, com um `await geocodeAddress(...)` (chamada de rede) NO MEIO dos
dois. Nessa janela, o Node fica livre pra atender outra requisição de pedido em paralelo, que lê
o mesmo arquivo (ainda sem o primeiro pedido), grava o SEU pedido normalmente e responde
"sucesso" ao cliente. Quando a primeira requisição termina o geocode e grava sua cópia antiga do
array, ela sobrescreve o arquivo inteiro — apagando o segundo pedido, que o cliente já tinha
certeza de ter feito. Bastava dois pedidos reais chegando perto um do outro, com pelo menos um
em modo delivery. **Correção:** geocodificar o endereço ANTES de tocar em `orders.json`, e fazer
a leitura + gravação do arquivo como um bloco 100% síncrono, sem nenhum `await` no meio — o Node
nunca troca de requisição no meio de um trecho síncrono, então essa corrida deixou de existir.

**2) Pedido podia duplicar em clique duplo ou retry após queda de conexão.** Não havia nenhuma
chave de idempotência — se a resposta do servidor se perdesse (internet caiu logo depois do
envio) e o cliente tentasse de novo, nascia um SEGUNDO pedido idêntico. **Correção:** o
front (`public/index.html`) gera um `idempotencyKey` único por tentativa de checkout (mantido
entre retries, descartado quando o carrinho muda de verdade); o backend reconhece a chave já
usada e devolve o pedido existente em vez de criar outro, checado duas vezes (assim que a
requisição chega e de novo, sem nenhum `await` no meio, bem antes da gravação final).

**3) Painel não recuperava pedido sozinho depois de perder a conexão em tempo real.** O SSE
(`/api/stream`) já tinha indicador visual de conexão perdida (evento anterior), mas nenhum
código buscava a lista de pedidos de novo ao reconectar — um pedido criado durante a queda
nunca chegava ao painel até alguém dar F5 por conta própria. **Correção** (`public/painel.html`):
nova função `resyncOrders()`, chamada (a) sempre que o SSE reconecta (`evtSource.onopen`) e (b)
a cada 45s como rede de segurança independente do tempo real — busca `GET /api/orders`, compara
com o que o painel já conhece e dispara o alerta sonoro/visual normal de "novo pedido" pra
qualquer pedido "novo" que tinha ficado de fora.

**Não confirmado no código:** a suspeita de "pedido novo pulando automaticamente pra PRONTO" —
o fluxo de status (`novo → preparando → saiu → entregue`, com "pronto" sendo só o nome que o
painel dá visualmente ao status "saiu") já exige uma chamada autenticada e explícita em
`PATCH /api/orders/:id` pra qualquer mudança; não há nenhum caminho no código que pule etapa
sozinho. Se isso ainda acontecer na prática, precisamos do passo a passo exato de quando
acontece pra investigar further (pode ser confusão visual entre "aceite automático" que já
nasce como "preparando" e o rótulo "Prontos" da coluna).

---

# v104 — BUG CORRIGIDO: quadro "⚠️ Últimas falhas de impressão" sempre dizia "Não consegui carregar."

**Achado enquanto conferíamos o v103, não relacionado a ele.** `apiGet()` devolve o JSON puro da
resposta do servidor, mas o código desse quadro esperava um envelope `{ok, data}` (formato usado
só em `apiPost`/`apiPatch`) — e `GET /api/print-log` devolve `{ log: [...] }`, sem nenhum campo
`ok`. Resultado: `res.ok` era sempre `undefined` (falso), então a mensagem de erro aparecia
sempre, mesmo quando o log carregava certinho (ou estava vazio, "🎉").

**Correção em `public/painel.html`:** lê `res.log` diretamente, com uma checagem simples de que é
uma lista válida. Nenhuma mudança em `server.js` — o endpoint já estava certo, só quem lia a
resposta é que esperava o formato errado.

---

# v103 — BUG CORRIGIDO: "Modo Teste" (v102) não impedia a impressão local no modo Navegador

**Problema relatado:** mesmo com "🧪 Modo Teste" marcado, o pedido continuava imprimindo na
máquina de teste (em casa) em vez de só na loja.

**Causa raiz:** o Modo Teste (v102) parou de chamar `register`/`heartbeat` de propósito — mas
isso também parou de atualizar `activeStationInfo` (a variável que guarda "este computador é a
Estação Ativa?"). O código do modo Navegador (impressão sem Agente Local, via
`print-order-remote`) só CANCELA a impressão quando tem certeza de que este computador não é a
Estação Ativa; sem nunca consultar nada, `activeStationInfo` ficava travado num valor antigo (às
vezes nem sabia ainda), e a impressão passava direto na máquina de teste mesmo assim.

**Correção em `public/painel.html`:** em Modo Teste, o Painel agora consulta periodicamente (a
cada 15s, mesmo intervalo do heartbeat normal) o endpoint `GET /api/print-station/status` — que é
**somente leitura, nunca reivindica nada** — só pra manter `activeStationInfo` sempre correto e
atualizado. Assim o modo Navegador sabe com certeza que não deve imprimir ali. Nenhuma mudança em
`server.js` ou `print-agent.js`.

---

# v102 — NOVO: "Modo Teste" no Painel — testar em outro computador sem roubar a Estação Ativa de Impressão da loja

**Problema relatado:** abrir o Painel numa máquina só de teste (em casa, via AnyDesk) sempre
assumia a Estação Ativa de Impressão sozinho — mesmo depois de renomear a estação (v100) — porque
a regra "o mais recente a abrir o Painel assume" vale pra QUALQUER nome de estação, não só pra
"PC-CAIXA". Resultado: testar em casa deixava a loja bloqueada de imprimir de verdade, e vice-versa.

**Correção em `public/painel.html`:** novo checkbox "🧪 Modo Teste" na Central de Impressão
(Configurações → 🔔 Impressão Automática). Quando ligado, **este navegador específico nunca chama
`register`/`heartbeat` de Estação Ativa** — só consulta o status pra mostrar o indicador 🟢/🔴,
nunca disputa a estação com ninguém. Fica salvo em `localStorage` daquele computador
(`shogatsu_print_test_mode`), então uma máquina só de teste pode deixar isso sempre ligado. Não
mexe em nada mais: se o checkbox estiver desligado (padrão, comportamento de sempre), tudo
funciona exatamente como antes — nenhuma outra estação é afetada.

**Nenhuma mudança em `server.js` ou `print-agent.js`** — a trava e `isAuthorizedToPrint()`
continuam intactas; o Modo Teste só evita que o Painel de teste ENTRE na disputa pela estação.

---

# v101 — BUG CORRIGIDO: Agente Local travava com "Unexpected token" ao editar config.json no Bloco de Notas (BOM invisível)

**Corrigido só isso.** Nenhuma outra função do sistema foi tocada.

**Causa raiz:** ao salvar `config.json` num editor de texto comum (ex.: Bloco de Notas do
Windows salvando como "UTF-8" em vez de "UTF-8 sem BOM"), o Windows às vezes grava um caracter
invisível (BOM, `\uFEFF`) bem no início do arquivo. Esse caracter não aparece na tela, mas
quebrava `JSON.parse()` com `SyntaxError: Unexpected token '﻿'` mesmo com o JSON em si
perfeitamente correto — e a janela do Agente Local fechava sozinha (`.bat` fecha ao terminar o
processo), dando a impressão de "abre e fecha" sem explicação.

**Correção em `print-agent/print-agent.js`:** a leitura do `config.json` agora remove esse
caracter automaticamente antes de interpretar o arquivo, se ele existir. Também passou a mostrar
uma mensagem de erro clara (em vez do stack trace cru do Node) se o JSON estiver mesmo inválido
por outro motivo (vírgula/chave faltando), facilitando o diagnóstico da próxima vez.

---

# v100 — BUG CORRIGIDO: "PC-CAIXA não é a Estação Ativa de Impressão" (sincronização Painel → servidor → Print Agent)

**Corrigido só o bug pedido, nada mais.** Estoque, cardápio, pedidos, reservas, motoboys, IA,
Custos e a própria impressora continuam exatamente como estavam — a trava da Estação Ativa de
Impressão (v90) **não foi removida** e `isAuthorizedToPrint()` **não sofreu bypass**.

**Causa raiz encontrada:** o Painel gera um código aleatório único por navegador
(`getOrCreateStationId()`, ex.: `st1a2b3c4d5e6f`) e é ESSE código que ele manda pro servidor em
`POST /api/print-station/register`/`heartbeat` como estação ativa. O campo `"stationId"` do
`config.json` do Agente Local precisa ser **exatamente igual** a esse código pra
`isAuthorizedToPrint()` bater (`stationStatus.activeStationId === STATION_ID`). Quando alguém
digita um nome escolhido à mão no `config.json` (ex.: `"PC-CAIXA"`) em vez de copiar o código
gerado, o Painel continua reivindicando a estação com o código aleatório — que nunca é igual a
`"PC-CAIXA"` — e o Agente Local fica bloqueado pra sempre, mesmo com o Painel aberto e conectado
no computador certo.

**Correção em `public/painel.html`:** a Central de Impressão (Configurações → 🔔 Impressão
Automática) agora tem um campo pra **renomear a estação deste computador** pra qualquer nome
escolhido (função nova `renameStationId()`) — o nome digitado substitui o código aleatório no
mesmo `localStorage('shogatsu_station_id')` e o Painel se reregistra na hora como Estação Ativa
com esse nome. Assim, digitando `PC-CAIXA` no Painel (o mesmo valor já usado no `config.json` do
Agente Local), a sincronização passa a bater. O código aleatório original continua existindo e
funcionando normalmente pra quem não mexer em nada (comportamento padrão inalterado).

**Correção defensiva em `server.js`:** `claimActiveStation()` e os endpoints
`POST /api/print-station/register`, `POST /api/print-station/heartbeat` e a comparação em
`isStationAuthorized()` agora aplicam `.trim()` no `stationId` recebido — um espaço a mais/menos
(copy-paste do `config.json` ou digitado no campo novo do Painel) não quebra mais a comparação
exata. O endpoint `GET /api/print-station/status` e a lógica de failover (estação anterior cai →
outra assume sozinha) não mudaram.

**Fluxo confirmado:** Painel conectado (com o nome certo, igual ao `config.json`) → estação ativa
registrada no servidor com esse nome → Agente Local consulta `/api/print-station/status`,
reconhece `activeStationId === STATION_ID` → impressão liberada. Só 1 estação ativa por vez
continua valendo; Painel fechado/desconectado continua deixando nenhuma estação autorizada
(depois de `ACTIVE_STATION_TIMEOUT_MS` sem heartbeat).

---

# v99 — Ferramenta isolada "📷 Ler Nota Fiscal" (módulo independente, não altera nenhuma função existente)

**Zero alteração em qualquer função pré-existente.** Esta versão adiciona só a ferramenta pedida,
como módulo isolado — pedidos, cardápio, reservas, estoque, impressão, Print Agent, login,
banco de dados (arquivos JSON em `data/`) e a tela de Custos existente (com seu próprio fluxo de
foto → ingrediente, `/api/custos/ler-imagem`) continuam **exatamente** como estavam.

**Arquivo novo:** `public/nota-fiscal.html` — página independente e autocontida (HTML+CSS+JS tudo
num arquivo só, sem importar nada do painel.html). Reaproveita o token de login já salvo em
`localStorage('shog_token')`, sem precisar logar de novo. Fluxo: **Tirar/selecionar foto → Groq
Vision (via backend) → Conferência → Confirmar / Editar / Cancelar.** Não grava nada em
banco/estoque/ingredientes — ao confirmar, só mostra o JSON conferido pra copiar pra onde for
preciso (nenhuma tabela nova foi criada, porque não houve necessidade real de persistir nada).

**Alteração mínima e isolada em `server.js`:** ampliado o schema/prompt de
`lerNotaFiscalEstruturadaIA()` — função criada na v98, sem nenhuma outra tela usando — pra extrair
também chave de acesso, série, inscrição estadual, endereço do emitente, destinatário+CNPJ, e por
produto NCM/CST/CFOP, além de base ICMS/valor ICMS/desconto/frete/valor total da nota. A rota já
existente `POST /api/custos/ler-nota-fiscal` (v98) continua com o mesmo nome e mesmo formato de
entrada; só o JSON de saída (`nota`) ficou mais completo. Nenhuma outra função do sistema chama
essa rota ou essa função — ampliar o schema aqui não tem como afetar nada além da nova tela.
A chave `GROQ_API_KEY`/chave configurada em Configurações → Atendimento continua só no backend,
nunca exposta ao navegador — reaproveita o mesmo `chamarIA()` com fallback automático da v98.

**Alteração de uma linha em `public/painel.html`:** um botão novo `📷 Ler Nota Fiscal` na barra
lateral (ao lado de "Custos"), que abre `nota-fiscal.html` numa aba nova — não usa o roteamento
`goPage()` do SPA, não mexe em nenhum outro botão/página/CSS/JS já existente. Some da tela pra
quem não é admin, do mesmo jeito que os outros botões de gestão (usa o mesmo mecanismo já
existente de `data-min-role`).

**Testado:** `/painel.html`, `/nota-fiscal.html` e `/` respondendo 200; rota nova
`/api/custos/ler-nota-fiscal` funcionando (falha graciosamente no ambiente de teste sem internet,
sem travar, com a mesma mensagem clara da v98); rota antiga `/api/custos/ler-imagem` **inalterada**
no contrato; pedidos, reservas, motoboys e config respondendo normalmente depois da mudança.

---

# v98 — AI ROUTER: Groq passa a ler fotos sozinho, fallback automático, modo básico e leitura estruturada de nota fiscal

**Evolução da IA de Atendimento — sem remover nenhum provedor, tela ou botão que já existia.**
Tudo abaixo é ADITIVO em cima do que a v57/v95 já tinham: Anthropic, OpenRouter, Hugging Face e
Google Gemini continuam disponíveis exatamente como antes, com a mesma tela em Configurações →
Atendimento (só com campos novos, opcionais).

**NOVO: Groq agora lê foto sozinho (nota fiscal, catálogo, cardápio).** Antes (v95), quando o
provedor era Groq e chegava uma imagem, o sistema recusava de propósito com um aviso claro
("esse provedor não lê fotos"), porque o modelo padrão configurado (`openai/gpt-oss-120b`) só lê
texto. Agora o AI ROUTER detecta sozinho se a mensagem tem imagem: se tiver, usa
`qwen/qwen3.6-27b` (modelo multimodal da Groq, texto + visão); se não tiver, continua usando
`openai/gpt-oss-120b` pra texto, do jeito de sempre. Ninguém precisa trocar nada em
Configurações — quem já usava Groq só ganhou a função de ler foto de graça. OpenRouter e Hugging
Face continuam avisando que não leem foto (função de visão desses dois provedores nunca existiu).

**NOVO: fallback automático.** Se o modelo/provedor principal responder com limite atingido
(429), quota estourada, tempo esgotado ou indisponibilidade temporária (502/503/504), o sistema
tenta sozinho a próxima opção disponível — nunca fica preso em loop, nunca derruba o servidor,
nunca exige reiniciar nada. Ordem: Groq (texto ou visão, conforme o caso) → Google Gemini, SE e
somente se a variável de ambiente `GEMINI_API_KEY` estiver configurada no servidor (opcional,
nunca obrigatório — sem ela, tudo continua funcionando normalmente só com Groq). Pode ser
desligado em Configurações → Atendimento → "Fallback automático" (padrão: ligado).

**NOVO: modo básico no chat de atendimento.** Se nenhuma IA responder (não configurada, ou todo
o fallback já foi tentado e falhou), o cliente deixa de receber só um aviso genérico — agora
recebe uma orientação local simples (horário de funcionamento, como fazer pedido, sugestão de
falar com atendente), sempre sem inventar informação que o sistema não tem de verdade. Pode ser
desligado em Configurações → Atendimento → "Modo básico" (padrão: ligado; desligado, volta ao
aviso genérico de sempre).

**NOVO: cache de leitura de imagem.** A mesma foto de nota fiscal/catálogo enviada duas vezes não
é reanalisada pela IA de novo — o sistema guarda um hash da imagem e reaproveita o resultado
anterior, mais rápido e sem gastar limite de API à toa.

**NOVO: log de uso da IA** (provedor, modelo, tempo de resposta, erro, se usou fallback) — fica
em `data/ia-log.json`, nunca grava a chave de API. Alimenta um status real em Configurações →
Atendimento: 🟢 IA online / 🟡 IA com fallback / 🟠 IA limitada / IA desativada.

**NOVO (aditivo): leitura ESTRUTURADA de nota fiscal.** Rota nova `/api/custos/ler-nota-fiscal`
devolve fornecedor, CNPJ, número, série, data, valor total e a lista de produtos (código,
quantidade, unidade, preço unitário, preço total) num único JSON. Não troca nem remove a rota
antiga `/api/custos/ler-imagem`, que continua exatamente como estava (mesmo formato de resposta),
usada pela tela de Custos & Ficha Técnica.

**Preservado, testado e confirmado intacto nesta versão:** pedidos, clientes, cardápio,
categorias, preços, reservas, impressão/impressoras/vias, painel, motoboys, notificações push,
sons, autenticação/permissões, responsividade mobile/desktop, layout de Configurações →
Atendimento (só campos novos adicionados, nada removido/reposicionado). Testado: texto normal,
foto simulada (bloqueio de rede do ambiente de teste confirma que o roteador falha rápido e limpo,
sem loop, sem travar a interface, com mensagem clara "leitura visual temporariamente
indisponível" quando nenhuma opção responde), fallback OpenRouter/Hugging Face + imagem (aviso
mantido), modo básico respondendo com dado real do restaurante, log sem API key, e todas as rotas
já existentes (pedidos, motoboys, painel, config) respondendo normalmente.

---

# v95 — Bug corrigido (impressão automática indevida) + investigação/reforço de barra fixa mobile e fonte de impressão + modelo padrão da IA (Groq) atualizado

**BUG CORRIGIDO: impressão automática pelo Painel (navegador) disparava mesmo com o pedido NÃO
automático.** O Agente Local (print-agent.js) já respeitava desde a v92 a regra "só imprime
sozinho se o aceite automático estiver ligado" — mas esse mesmo gatilho dentro do Painel (usado
pelas vias com método "Navegador" ou "Automática com a Extensão"), disparado ao chegar o evento
"new-order", só checava se "imprimir automaticamente" (cfg.print) estava ligado, sem olhar se o
pedido realmente nasceu aceito sozinho. Resultado: com aceite automático desligado, um pedido
ainda pendente podia sair impresso sozinho pelo navegador do Painel mesmo assim — desperdiçando
papel de pedidos que ainda nem foram aceitos e podem ser recusados. Agora o Painel também só
imprime sozinho quando o pedido nasceu automático (`o._autoAcceptOn`), igual o Agente Local. A
impressão MANUAL (botão "🖨 Imprimir") continua funcionando sempre, com ou sem aceite automático.

**Investigado: barra de categorias/busca fixa no topo (celular).** Revisão completa do CSS/HTML/
JS não encontrou nenhuma remoção dessa função — `position:sticky`, a hierarquia dos elementos
(sem nenhum ancestral com overflow/transform escondido no meio) e o cálculo de offset
(`updateStickyOffsets()`) continuam intactos e consistentes com as correções documentadas em
v52/v63/v83. Por segurança, foi adicionado o prefixo `-webkit-sticky` (compatibilidade com iOS
mais antigo) — sem qualquer mudança visual em aparelhos atuais. Se o problema persistir depois
desta atualização, é importante testar em aba anônima/navegador atualizado (pra descartar cache
antigo do Service Worker) e informar: aparelho, versão do iOS/Android e navegador exatos.

**Investigado: tamanho da fonte da impressão não aumenta.** As três correções anteriores sobre
esse exato sintoma (v92: rede/USB direta e Agente Local; v93: botão "🖨 Testar") continuam
presentes e ativas no código — não foi encontrada nenhuma regressão nova. Pra localizar o que
ainda falha, preciso de mais detalhes: isso acontece em qual via de impressão (Rede/USB,
Agente Local/Automática, ou Navegador)? E acontece ao aumentar o campo "Tamanho da fonte" em
Configurações → Central de Impressão, ou depois de editar um item do cardápio o tamanho volta
sozinho pro padrão?

**Atualizado: modelo padrão da IA de atendimento (provedor Groq).** A Groq descontinuou o
`llama-3.3-70b-versatile` (aviso oficial em 17/06/2026) — quem estava usando Groq com o campo
"Modelo" em branco (padrão) parava de receber resposta da IA sem nenhum aviso claro na tela. O
padrão agora é `openai/gpt-oss-120b`, o substituto oficial recomendado pela própria Groq: mesma
faixa de qualidade, gratuito, com bom limite no plano free e mantido ativamente (evita cair de
novo num modelo descontinuado tão cedo). Se seu restaurante já tinha um modelo específico
digitado nesse campo, nada muda sozinho — só o texto de ajuda foi atualizado; troque manualmente
em Configurações → Atendimento se for o seu caso.

**BUG CORRIGIDO: erro cru "messages[0].content must be a string" ao ler foto de nota
fiscal/catálogo (Custos & Ficha Técnica).** Causa real: os modelos padrão do Groq/OpenRouter/
Hugging Face configurados no sistema (ex.: `openai/gpt-oss-120b`) só leem texto, sem visão — a
leitura de foto manda o conteúdo como lista [texto, imagem], formato que esses modelos/provedores
rejeitam com esse erro confuso. Agora o sistema avisa com clareza, em português, que essa função
específica (ler foto) só funciona com Anthropic (Claude) ou Google Gemini, e sugere trocar o
provedor em Configurações → Atendimento — sem tentar mais a chamada fadada a falhar. O chat de
atendimento por texto com o cliente continua funcionando normalmente em qualquer provedor (nunca
manda foto pra IA, mesmo antes dessa correção).

**REFORÇO: barra de categorias/busca do cardápio no celular agora tem uma segurança extra.**
Além do `position:sticky` nativo (que continua sendo o método principal, sem mudar nada — Desktop
inclusive), foi adicionado um watchdog em JS que só entra em ação no celular (abaixo de 900px) e
só SE detectar, de verdade, que o navegador não está segurando a barra no lugar certo enquanto
o usuário rola o cardápio (ex.: Android/PWA em modo standalone que não posiciona certo um 3º
nível de sticky aninhado). Quando isso acontece, a MESMA barra (sem duplicar) passa a usar
`position:fixed`, com um espaçador do mesmo tamanho no lugar dela pra não pular o conteúdo — e
volta pro comportamento normal assim que a rolagem sobe de novo. Desktop/PC nunca aciona esse
reforço.

**Reformulação da área do cliente (Meus Pedidos / Reserva de Mesas), seguindo imagem de
referência.** Reorganização visual, sem criar nenhuma função nova ou fictícia:
- Removido o "← Minha Conta" fixo do cabeçalho — o título agora é dinâmico: mostra "Meus
  Pedidos" com o histórico aberto, "Reserva de Mesas" com os agendamentos abertos, "Minha
  Conta" no estado inicial/repouso.
- Botão "Fazer Pedido" renomeado pra "🍽️ Pedir aqui" (mesma função — fecha a tela e volta pro
  cardápio).
- Novo botão "Minha Conta" no grid de opções, formando o par "[Minhas Reservas] [Minha Conta]"
  — sua função real é resetar a tela pro estado inicial (fecha qualquer painel aberto).
- Cards de navegação da conta trocaram o fundo em degradê colorido por fundo escuro uniforme
  com ícone colorido (igual à imagem de referência) — texto/seções renomeados pra "📦 HISTÓRICO
  DE PEDIDOS" / "📅 AGENDAMENTOS", reaproveitando o mesmo componente visual de sempre.
- Não foi criado o botão "Ver todos os pedidos/agendamentos" da imagem, porque a lista já
  mostra tudo que existe — não haveria nenhuma função real pra conectar nele.

**Diagnóstico de build desatualizado do Agente Local (print-agent.js).** O Agente roda como
processo persistente (Tarefa Agendada do Windows) que NÃO recarrega sozinho quando os arquivos
do sistema são atualizados — é bem provável que seja essa a causa de correções (como a de
tamanho de fonte) parecerem "não funcionar" mesmo depois de aplicadas: o processo antigo
continua rodando até alguém rodar `REINICIAR-AGENTE.bat`. Agora o Agente informa seu número de
build no log e pro painel a cada heartbeat, e a Central de Impressão (Configurações) mostra um
aviso vermelho claro quando o Agente conectado está rodando código mais antigo que o do
servidor — apontando exatamente pra rodar `REINICIAR-AGENTE.bat`.



**Novo: tela "Minhas Reservas" no app do cliente.** Antes só existia a tela pra *criar* uma
reserva — não tinha como o cliente ver as próprias reservas depois. Agora, em "Minha Conta", tem
um botão "📅 Minhas Reservas" (mesmo padrão do "📦 Meus Pedidos" — telefone + senha de 4 dígitos)
que lista as reservas com ícone de calendário, badge de status (Confirmado/Pendente/Cancelado) e
botão "Ver reserva" com os detalhes.

**Botão "🎛 Personalizar" removido — agora é sempre "+ Pedir aqui".** Pratos com variação (ex:
escolha de acompanhamento) usavam um botão diferente do resto do cardápio; agora usam exatamente
o mesmo botão/ícone/estilo — só muda o que acontece ao tocar (abre o seletor de variação).

**Responsividade (iPhone notch/Dynamic Island/home indicator + toque confortável):**
- `viewport-fit=cover` + `env(safe-area-inset-*)` aplicado no cabeçalho, botão de finalizar
  pedido, flutuantes de carrinho/acompanhamento, toast e a gaveta (drawer) — nada mais fica
  escondido atrás do notch ou da barra de gestos do iPhone.
- **Bug corrigido:** as classes `.btn`, `.secondary` e `.sm` (usadas em vários botões — Aplicar
  cupom, Ver meus pedidos, Fazer nova reserva) nunca tiveram CSS de verdade nesse arquivo —
  viravam botões sem nenhum estilo do navegador, com área de toque pequena demais pro celular.
  Agora têm uma base consistente com a identidade visual do app e altura mínima de toque de 44px.

# v93 — IA gera fichas do cardápio existente, reserva imprime, correções de impressão e cardápio do cliente

**BUG CRÍTICO CORRIGIDO (regressão da v92): impressão automática ficava sempre bloqueada.** A
checagem "o Painel está aberto em algum lugar?" (criada na v92) só era preenchida quando
`stationId` estava configurado no Agente Local — sem isso configurado (o caso mais comum), o
status nunca era consultado, e a nova trava bloqueava a impressão automática pra sempre, em
silêncio. Corrigido: a consulta ao servidor agora roda sempre, com ou sem stationId.

**Bug corrigido: botão "🖨 Testar" sempre imprimia no tamanho padrão**, ignorando por completo a
configuração de tamanho de fonte — provavelmente era o botão usado pra conferir se o ajuste da
v92 tinha funcionado, e por isso parecia que nunca funcionava. Agora respeita o tamanho
configurado, igual as vias de pedido de verdade.

**Novo: reserva de mesa também imprime.** Mesma lógica/trava da impressão automática de pedido —
funciona nos três métodos (rede/USB direto, Agente Local, navegador), usando a impressora
configurada pra via "caixa".

**Novo: IA gera ficha técnica dos pratos que já estão no cardápio.** Botão em "🤖 IA do Cardápio"
→ "🧮 Gerar fichas dos pratos sem ficha" — varre o cardápio, acha os itens sem ficha técnica
cadastrada e pede uma estimativa (ingredientes + custo) pra IA, em lotes de 5. ⚠️ Mesma ressalva
de sempre: é estimativa do modelo, sem pesquisa real na internet — cada ficha nasce 🟡 Estimada e
só é criada de verdade depois que você aprovar na Central de Aprovações.

**Cardápio do cliente — mais ajustes:**
- Marcadores ⚪/🔘 das opções de variação agora têm destaque real (brilho dourado) na opção
  selecionada, em vez do filtro cinza de antes.
- Botão "Quero agendar pra outro horário" redesenhado no mesmo formato/tamanho do botão de
  Finalizar Pedido, em dourado (pra não confundir com "finalizar").
- Botão "Ver meus pedidos" (histórico) agora ocupa a largura toda da tela, como o resto dos
  elementos.
- **BUG CORRIGIDO:** fechar a tela de acompanhamento do pedido pelo botão "voltar" do
  celular/navegador não mostrava o ícone flutuante de acompanhamento (só aparecia se fechasse
  pelo botão "Continuar Comprando" de propósito) — agora os dois caminhos sempre levam ao mesmo
  lugar: o ícone flutuante aparece sempre que o pedido ainda está em andamento.

# v92 — Bugs de impressão corrigidos + visual novo das opções de variação

**Bug real corrigido: tamanho da fonte na impressão não ajustava.** A impressora de rede/USB
direta só tinha DOIS estados (normal ou "dobrado" a partir de 18px) — mudar o campo de
Configurações → Impressão de, por exemplo, 14 pra 17px não tinha efeito nenhum. Agora tem
degraus reais (usando o comando ESC/POS `GS ! n` de altura/largura) cobrindo toda a faixa de
10 a 28px. Mesma correção aplicada no Agente Local (print-agent.js/node-thermal-printer), que
antes ignorava essa configuração por completo.

**Bug real corrigido: impressão automática saía mesmo com "Aceite automático" desligado.** A
impressão automática nasceu pra andar junto do aceite automático (o pedido já sai com número de
ficha atribuído) — sem isso ligado, um pedido ainda pendente de aceite podia gastar papel de via
antes de alguém sequer olhar pra ele. Agora o Agente Local só imprime sozinho quando o aceite
automático está ligado; o botão manual "🖨 Imprimir" continua funcionando sempre, do jeito que
sempre funcionou.

**Bug real corrigido: agente imprimia mesmo com o Painel fechado em todo lugar.** A checagem de
"Estação Ativa de Impressão" (criada na v90) só entrava em ação quando um `stationId` opcional
estava configurado — no caso mais comum (sem isso configurado), o Agente sempre se considerava
autorizado a imprimir, mesmo que ninguém tivesse o Painel aberto em computador nenhum. Agora essa
checagem (reaproveitando o mesmo heartbeat que já existia) é obrigatória sempre: sem o Painel
aberto/conectado em algum lugar, o Agente não imprime nada sozinho. ⚠️ Isso NÃO muda como o
Agente liga (continua como Tarefa Agendada do Windows, ligando sozinho no boot) — só impede ele
de imprimir enquanto ninguém estiver de fato usando o sistema.

**Visual novo das opções de variação no cardápio do cliente** (só aparência, lógica intacta):
cards maiores com toda a área clicável, marcadores grandes ⚪ (não selecionado) / 🔘
(selecionado), "INCLUSO NO VALOR" pra opções sem custo extra, "+ R$ X,XX" bem visível nos
adicionais, bordas arredondadas e destaque elegante em dourado na opção escolhida. Grupos de
escolha única e obrigatórios agora mostram "Obrigatório • escolha 1" embaixo do nome do grupo.

# v91 — IA de Gestão do Cardápio (fichas técnicas com multiplicador, Central de Aprovações, badges inteligentes)

**Fichas técnicas com ficha base + fator de multiplicação.** Agora dá pra criar "Hot Filadélfia
— base por peça" com a receita normal, e depois "Hot Filadélfia — 10 peças" e "— 15 peças" como
variações vinculadas à base com um multiplicador — a quantidade de cada ingrediente é calculada
sozinha, sem duplicar a receita. Cada ficha agora tem um status: 🟢 Oficial / 🟡 Estimada / 🔴
Precisa revisão, com botão "Confirmar como oficial".

**Nova página "🤖 IA do Cardápio"** com dois recursos:
- **Sugestão de prato novo** — pede pra IA de Atendimento (já configurada em Configurações)
  imaginar um prato novo com ficha técnica, custo e preço estimados. ⚠️ Sempre nasce como 🟡
  Estimada — essa IA não pesquisa preços reais na internet, é estimativa do próprio modelo.
- **Central de Aprovações** — toda sugestão (produto novo, badge) fica pendente até um admin
  aprovar (publicar ou salvar como rascunho), rejeitar, ou editar antes de aprovar. Nada é
  publicado, tem preço alterado ou fica visível pro cliente sem aprovação explícita.

**Badges inteligentes baseados em vendas reais** (não estimativa da IA) — analisa
`data/orders.json` dos últimos N dias e sugere 🔥 "Mais Pedido" pros itens mais vendidos.
Configurações → IA tem um toggle opcional "Permitir alteração automática de badges" — só afeta
badges, nunca produto/preço/estoque, que continuam sempre exigindo aprovação manual.

# v43 — Notificação push, Custos integrado, reserva e limpeza do modal de prato

**Bug real corrigido: notificação push não chegava no app do cliente.** A causa: o Service
Worker tentava pré-cachear o CSS do Google Fonts (um arquivo de outro domínio) usando
`cache.addAll`, que falha por inteiro se UM ÚNICO item da lista não puder ser baixado — qualquer
instabilidade de rede ou bloqueio de CORS nesse arquivo específico derrubava a instalação inteira
do Service Worker. Quando isso acontecia, o Service Worker ficava travado pra sempre em
"installing" e nunca chegava a "activated" — e como o botão "Ativar notificações" espera
`navigator.serviceWorker.ready` (que só resolve depois de "activated"), o clique ficava preso sem
nunca terminar, sem erro nenhum, e a notificação nunca era registrada de verdade. Agora cada
arquivo é cacheado individualmente: se um falhar, os outros continuam normalmente e a instalação
sempre termina.

**Shogatsu Custos integrado no painel.** O que antes era um programa separado agora é a aba
"💰 Custos" dentro do painel principal — mesmo login, mesma sessão, mesma pasta de dados (com
backup automático no Supabase, igual o resto do sistema). Cadastro de ingredientes, fichas
técnicas com cálculo de custo/porção/preço sugerido/CMV, aviso de preço defasado e importação de
fichas em branco a partir do cardápio atual — tudo dentro do painel agora.

**Bug real corrigido: botão de cancelar reserva continuava ativo depois da reserva confirmada.**
Reserva confirmada agora é estado final (só sobra o WhatsApp pra contato), igual ao padrão do
resto do sistema — um pedido "entregue" também não tem mais botão de ação.

**Removido o bloco de "Extra do rodízio" e "Imprime na(s) via(s) de" do modal de editar prato,**
como pedido. A escolha de via de impressão (Cozinha/Sushibar/Bar) passou pra dentro da modal de
**categoria** — é definida uma vez por categoria em vez de repetida em cada prato, o que também
deixa o cadastro mais rápido. Pratos que já tinham uma via configurada manualmente continuam
exatamente como estavam. ⚠️ Como consequência, a opção de marcar um prato como "extra do rodízio
em dias específicos" não está mais disponível pela interface (pratos que já usavam isso
continuam funcionando, só não dá mais pra criar/editar essa configuração pela tela) — avise se
ainda precisar disso, dá pra reintroduzir de outro jeito.

# v42 — Correção de bugs (categorias, reserva, fotos, impressão duplicada, edição de prato)

**Bug real corrigido: janela de categorias cortada.** A coluna de categorias do editor de
cardápio tinha 200px fixos, e cada item de categoria colocava ícone + nome + contador + setas de
reordenar + botões "✏️ Editar"/"🗑" tudo numa única linha sem quebra — e o container ao redor
usava `overflow:hidden`, então qualquer coisa que não coubesse nos 200px era simplesmente cortada
da tela. Agora a coluna é mais larga (260px), cada item de categoria quebra em duas linhas (nome
em cima, ações embaixo), os botões de editar/excluir viraram só ícone (sem o texto "Editar") e
não existe mais `overflow:hidden` escondendo conteúdo.

**Bug real corrigido: botão de reserva não indicava a mesa como reservada.** Depois de confirmar
uma reserva no painel, o status mostrado era "✅ Confirmada" — só dizia que o pedido de reserva
tinha sido aceito, mas não deixava claro que a mesa já está reservada de fato. Agora, assim que
confirmada, o status exibido passa a ser "🪑 Reservada".

**Bug real corrigido: caixa de fotos travava com fotos de celular.** Duas causas juntas: (1) no
servidor, quando o corpo da requisição passava do limite de tamanho, o código só derrubava a
conexão (`req.destroy()`) sem nunca resolver nem rejeitar a Promise — o navegador ficava esperando
pra sempre, preso em "Enviando...", sem erro nenhum; (2) o app enviava a foto do jeito que ela
saía da câmera do celular, muitas vezes 3–8MB, o que ficava perto ou passava do limite. Agora: (a)
o `readBody` do servidor sempre rejeita direito quando o limite estoura, então a requisição nunca
mais fica pendurada pra sempre; (b) a foto é redimensionada/comprimida no navegador (máx. 1600px,
JPEG 82%) antes do envio, então quase sempre fica abaixo de 1MB e sobe rápido e sem erro.

**Ajuste: duas ferramentas de impressão fazendo a mesma coisa.** Os botões "🖨 Imprimir" (imprime
todas as vias configuradas) e "🖨▾" (escolher em quais vias imprimir) apareciam soltos, lado a
lado, parecendo duas ferramentas diferentes. Agora estão visualmente unidos num único controle
(botão principal + seta grudada), lendo como uma ferramenta só com uma opção extra — sem perder
nenhuma das duas funções.

**Ajuste: caixa de editar prato não deve ter caixinhas de dia da semana por padrão.** As 7
caixinhas de "Dias do Rodízio" apareciam sempre, mesmo pra pratos comuns que não têm nada a ver
com o cardápio de rodízio — poluindo a edição da maioria dos itens. Agora existe um único checkbox
"📅 Extra do rodízio (só em dias específicos)", e as 7 caixinhas de dia só aparecem quando ele é
marcado. Pratos que já usavam essa função continuam funcionando normalmente (o checkbox já vem
marcado neles ao abrir a edição).

# v39 — Bug da reserva, impressão de todas as vias, e ferramenta de QR Code & Links

**Bug real corrigido: botão "Solicitar Reserva" continuava ativo depois da reserva já feita.**
Depois de enviar uma reserva, a tela passava a mostrar o card de acompanhamento (status), mas o
formulário com o botão "✅ Solicitar Reserva" continuava visível e clicável logo acima — dava pra
clicar de novo (ou várias vezes seguidas) e criar reservas duplicadas pro mesmo cliente. Agora o
botão é desabilitado assim que clicado (evita duplo clique enquanto a requisição está no ar) e o
formulário inteiro some assim que a reserva é confirmada com sucesso, sobrando só o card de status
e o botão "+ Fazer nova reserva" pra quando o cliente realmente quiser reservar de novo. O mesmo
vale ao reabrir a tela com uma reserva já em aberto salva no navegador.

**Bug real corrigido: nem toda via imprimia.** O botão "🖨 Imprimir" no painel abre uma janela por
via (Caixa/Cozinha/Sushibar/Bar) usando a impressão do navegador. Como cada via só é confirmada
depois de um `await` na rede, a partir da segunda via o navegador podia bloquear a janela como
pop-up — e isso só era evitado quando o pedido já estava carregado na lista local em memória; se
vinha de outro lugar (card do dashboard, lista filtrada, etc.) essa proteção falhava e só a
primeira via imprimia de verdade. Agora as 4 janelas são sempre pré-abertas de forma síncrona,
ainda dentro do clique do usuário, então nenhuma consegue ser bloqueada — as que acabam sem uso
(via sem itens desse pedido, ou impressora de rede/USB configurada) são fechadas automaticamente.

**Novo: aba "🔗 QR Code & Links" no painel.** Ferramenta dedicada (antes só existiam 2 links
enterrados dentro de Configurações) com uma aba própria pra cada página pública do sistema —
**Cardápio** tem a sua aba separada, além de Delivery/Pedir Agora, Cardápio Rodízio Popular,
Divulgação, Avaliação Rodízio e Painel do Entregador. Cada aba mostra o link (com botão de copiar)
e o QR Code correspondente, com botões de baixar, imprimir (abre uma janela só com o QR pra colar
na mesa/conta) e abrir a página. Também tem um gerador personalizado: cola qualquer link ou texto
e gera um QR na hora, com os mesmos botões de baixar/imprimir — útil pra promoções e cupons.

**Corrigido: aviso de depreciação `DEP0169` do Node (`url.parse()`).** O servidor usava a API
antiga `url.parse()` pra ler a rota e os parâmetros de cada requisição — o Node já marca essa
função como obsoleta (não padronizada, com implicações de segurança). Troquei pela API padrão
`URL`/`URLSearchParams` do próprio JavaScript, mantendo `query` como o mesmo objeto simples de
sempre (`query.algumaCoisa`), então nada mais no código precisou mudar. O aviso não volta a
aparecer no log do servidor.

## Como aplicar
`server.js`, `public/index.html` e `public/painel.html` mudaram. Substitua os três arquivos e dê push (o
Service Worker já busca a versão nova sozinho, mas se quiser garantir, force um recarregamento
sem cache — Ctrl+Shift+R — na primeira vez que abrir).

---

# v38 — Barra de categorias padrão iFood/Uber Eats, legibilidade dos pratos e revisão do PWA

**Barra de categorias + busca, unificadas num só bloco fixo com blur e sombra.** Antes a barra
de busca ficava solta, abaixo da barra de categorias (que já era fixa). Agora as duas vivem
dentro de um único painel "vidro fosco" (glassmorphism) que gruda no topo junto, como no
iFood/Uber Eats.

**Indicador animado deslizante.** Em vez de só trocar a cor da categoria ativa, agora tem uma
"trilha" dourada/vermelha que desliza suavemente (280ms) até a categoria selecionada — tanto ao
clicar quanto ao rolar a página.

**Trocado o cálculo de categoria ativa por `IntersectionObserver`.** Antes, a cada pixel rolado
a página recalculava manualmente a posição de cada seção (`offsetTop`) pra saber qual categoria
estava visível — funcionava, mas gastava processamento à toa. Agora o navegador avisa sozinho
quando uma seção entra na área visível, o que é mais preciso e mais leve (ajuda a manter os
60 FPS pedidos). A rolagem horizontal com o mouse (arrastar) e a centralização automática da
categoria ativa, adicionadas na v37, continuam funcionando do mesmo jeito.

**Legibilidade dos pratos melhorada.** Nome, descrição e preço com mais peso de fonte, melhor
contraste de cor e espaçamento — mesma identidade visual (mesmas fontes e cores), só mais fácil
de ler.

**PWA revisado (instalação e fotos).** Conferido o fluxo de "Instalar App": ele já usa o prompt
nativo do navegador direto (sem etapa extra) e já não aparece de novo depois de instalado —
nenhuma mudança necessária aí, só validado. Revisadas todas as fotos de prato do cardápio (lista
principal, miniaturas do editor, cardápios do rodízio): todas já usam `object-fit: cover` com
proporção fixa e cantos preservados — não foi encontrado nenhum ponto com distorção ativa no
código atual; se o problema aparecer de novo com uma foto específica, me manda o print que eu
reproduzo e conserto pontualmente.

**Ficou de fora desta rodada, por serem funcionalidades grandes e novas (não ajustes visuais):**
- **Ícone do app editável pelo painel** (upload, recorte e atualização automática do
  `manifest.json`/favicons) — é um recurso novo de verdade (processamento de imagem, geração de
  vários tamanhos de ícone), não um bug a corrigir.
- **Módulo do Rodízio Presencial 100% separado do Delivery**, com editor próprio no painel,
  QR Code automático sempre atualizado, e envio automático do link/QR junto da confirmação de
  reserva — isso é um sistema novo inteiro (categorias/produtos próprios, endpoints novos,
  geração de QR, integração com WhatsApp/e-mail na confirmação da reserva).

Ambos valem a pena, mas são grandes o bastante pra merecerem uma rodada só deles, testada com
calma, em vez de entrar de última hora numa lista já cheia de mudanças visuais.

---



**Bug real corrigido: no celular não dava pra reabrir o menu lateral.** O botão de
recolher/expandir a sidebar (criado na v36) ficava *dentro* da própria sidebar — em tela
pequena ela já começa escondida por padrão, então o botão de abrir sumia junto. Corrigido com
um ☰ sempre visível na barra superior em telas pequenas, mais um fundo escurecido atrás da
sidebar (toca fora pra fechar).

**Fontes aumentadas em todo o painel.** Todo tamanho de fonte do `painel.html` subiu ~1px
(o texto base foi de 13px pra 14px, e assim por diante em cascata) — mantém a hierarquia
visual, só fica mais legível.

**Modernização visual do painel** (só aparência — nenhuma lógica, API ou regra de negócio
mudou): cantos mais arredondados (12–16px) em cards e botões, sombras mais suaves com
elevação ao passar o mouse, efeito glassmorphism discreto na barra superior e nos modais,
animação de entrada suave ao trocar de aba, efeito ripple (ondinha) ao clicar em qualquer
botão, e ícones da barra lateral com uma leve animação ao selecionar. Como a maioria dos
elementos (cards, botões, barra lateral) é compartilhada entre as abas, o efeito já aparece
em Pedidos, Reservas, Motoboys, Cardápio, Relatórios, Avaliações, Configurações, Impressoras
e Usuários sem precisar mexer aba por aba.

*Não incluído nesta rodada, por escopo*: troca completa dos emojis por ícones Lucide/Heroicons
e um redesenho estrutural (não só visual) de cada tela individualmente — isso é bem mais
arriscado de fazer de uma vez só num sistema em produção; prefiro fazer aba por aba, testando
cada uma, se for do interesse continuar.

**Cardápio (index.html): barra de categorias — Sticky Scrollable Category Bar completa.**
A barra já existia fixa no topo com rolagem horizontal; adicionado o que faltava do pedido:
arrastar com o mouse no desktop (o toque no celular já funcionava nativamente), a categoria
ativa agora se centraliza sozinha dentro da barra conforme a rolagem da página muda de seção,
brilho e ícone com bounce na categoria ativa, e glassmorphism com sombra na barra. A lógica de
detectar a seção visível e rolar suavemente até ela já existia e não foi alterada.

---



**Bug real corrigido: painel ficava preso numa versão antiga (cache do Service Worker).**
O `sw.js` usava "cache primeiro" pra **todo** arquivo HTML, inclusive o `painel.html` — uma vez
que o navegador guardava uma cópia, ele nunca mais buscava a versão nova sozinho no servidor,
mesmo pra quem era master. Corrigido: páginas HTML agora usam "rede primeiro" (sempre busca a
versão mais nova; só cai pro cache se estiver offline de verdade); ícones/fontes continuam em
cache primeiro, que é mais rápido e não tem esse risco. Versão do cache subiu pra limpar o que
já estava guardado em todo mundo. O painel também ganhou um aviso automático ("🔄 Nova versão
disponível") quando detecta uma atualização, já que costuma ficar aberto numa aba o dia todo.

**Painel: sidebar recolhível e redimensionável por arraste.** Primeiro passo da modernização
visual pedida — feito só em CSS/JS de layout, sem tocar em nenhuma lógica de pedidos/config.
Botão ◀ recolhe a barra lateral pra só ícones; a borda direita dá pra arrastar pra redimensionar;
largura e estado (recolhida ou não) ficam salvos e voltam do jeito que a pessoa deixou da última
vez. Também entraram ajustes de responsividade — em telas menores nada corta mais, a sidebar
vira um menu por cima e as grades se reorganizam sozinhas.

**Novo: cardápio do Rodízio Popular, avaliação específica e página de divulgação.** Três páginas
novas e independentes em `/public`: `cardapio-rodizio-popular.html` (cardápio completo do rodízio
de terça a domingo, com preços por grupo de dias, destaques do dia e espaços de foto editáveis),
`avaliar-rodizio.html` (avaliação específica pro rodízio presencial — estrelas por categoria,
manda formatado pro WhatsApp da loja) e `divulgacao-rodizio.html` (o link único pra colocar na
bio do Instagram/Facebook, com frases chamativas e botões de ação).

---



**Bug real corrigido: produto ficava "preso" no carrinho.** Três lugares (`placeOrder`,
`clearCartOnAccountSwitch`, `repeatOrder`) zeravam ou trocavam o carrinho e atualizavam só o
resumo/badge (`updateCartUI()`), mas nunca re-renderizavam o cardápio (`renderMenu()`). Resultado:
o cartão do produto continuava mostrando os botões −/+ com a quantidade antiga mesmo com o
carrinho já vazio por dentro — e como `changeQty()` ignora chaves que não existem mais em
`cart{}`, o botão − ficava sem fazer nada pra sempre. Corrigido nos três pontos, chamando
`renderMenu()` sempre que o carrinho muda por fora da interação direta do cliente. Também
sincronizamos a gaveta do carrinho quando ela já está aberta e um item novo é adicionado pelo
cardápio.

**Tela "Pedido Recebido" — botão ❤️ Favoritar.** A tela de confirmação já existia com a
identidade visual do cardápio (mesmas cores, tipografia, ícones e cards), mas faltava o botão de
favoritar do mockup. Adicionado ao grid de ações (agora 2x2), com estado salvo em localStorage.

**Novo: pré-cadastro de motoboys.** Nova aba "🛵 Motoboys" no painel (nível admin+): cadastra
nome, telefone, placa e observações, com ativar/desativar e remover. Os dados entram no backup
automático do Supabase, igual pedidos/clientes/config. Na hora de marcar "saiu para entrega", o
antigo `prompt()` de texto livre virou um seletor visual com os motoboys cadastrados (chips),
mantendo a opção de digitar um nome avulso ou deixar em branco.

**Novo: Excluir Pedido do Sistema (ADM → Pedidos).** Botão 🗑️ visível só pra admin/master.
Diferente de cancelar (que mantém o pedido no histórico com motivo), isso apaga o registro por
completo — por isso exige a senha de administrador de novo, num modal separado, mesmo com a
sessão já logada. Toda exclusão fica registrada num histórico de auditoria
(`data/delete-log.json`, também salvo no Supabase) com o pedido, data/hora e usuário responsável.
Testado de ponta a ponta: senha errada → bloqueado com "❌ Senha inválida. Pedido não foi
removido."; usuário nível "vendas" tentando excluir → bloqueado com 403; admin/master com senha
certa → "✅ Pedido removido do sistema com sucesso." e o pedido some do arquivo.

# v35 — Cardápio de rodízio (QR), link único pra bio, instalar como app, excluir reservas

**Novo: Cardápio do Rodízio (`/cardapio-rodizio.html`).** Página pra QR code na mesa — o cliente
já sentado escaneia e vê o cardápio do rodízio, com um banner "✨ Liberado hoje" pros itens
extras que só saem em certos dias da semana. No editor de prato (painel → Cardápio), novo campo
"📅 Dias do Rodízio" com os 7 dias da semana — item sem nenhum dia marcado aparece como fixo
("sempre disponível"); com dias marcados, só aparece destacado no banner "liberado hoje" nesses
dias. Em Configurações → 🔗 Links Úteis, o QR code já vem pronto pra copiar/imprimir.

**Novo: link único pra bio do Instagram/Facebook (`/pedir-agora.html`).** Uma tela com botões
pra "Fazer Pedido", "Cardápio do Rodízio", "Falar no WhatsApp" e "Como Chegar" — busca os dados
reais da loja (nome, whatsapp, endereço) direto do painel, então fica sempre sincronizado.

**Novo: banner "Instalar como App".** Aparece depois de alguns segundos de navegação no
cardápio — no Android/Chrome usa o instalador nativo do navegador (1 toque); no iPhone mostra o
passo a passo (Compartilhar → Adicionar à Tela de Início, já que a Apple não permite instalar
em 1 clique). Não aparece de novo se o cliente já instalou ou já fechou o banner antes.

**Senha master pra excluir reservas de mesa.** A tela "Excluir Dados" (Configurações → ⚠️ Zona
de Perigo) ganhou uma terceira opção: além de Cardápio e Pedidos, agora também dá pra apagar
todo o histórico de Reservas de Mesa — mesmo fluxo de sempre (pergunta qual, avisa o que vai
acontecer, pede a senha master, registra no histórico de auditoria).

# v34 — Rastreamento GPS do motoboy, botões invisíveis, tempo estimado, excluir dados

**Novo: rastreamento GPS ao vivo do motoboy.** Nova página `entregador.html` que o motoboy abre
no celular (link gerado automaticamente e mostrado num modal assim que o pedido é marcado como
"saiu para entrega") — ele só toca em "Compartilhar localização" e o cliente passa a ver o
🛵 se movendo no mapa da tela de acompanhamento, em tempo real. A localização só fica ativa
durante a entrega — é apagada automaticamente assim que o pedido é marcado como entregue ou
cancelado, e o link do motoboy para de funcionar sozinho nesse momento.

**Bug real corrigido: botões quase invisíveis.** Os botões de editar/excluir categoria só
apareciam ao passar o mouse (quebrado em celular/tablet, que não tem hover) e eram cinza sem
nenhuma cor — quase impossível de enxergar. Os botões de Imprimir e WhatsApp na lista de pedidos
não tinham nenhuma cor de destaque (ficavam cinza-sobre-cinza). Corrigido: todos os botões agora
são sempre visíveis, maiores, e cada ação tem sua cor própria (imprimir=azul,
WhatsApp=verde-WhatsApp, marcar pago=dourado, editar=azul, excluir=vermelho).

**Bug do tempo estimado — corrigido de verdade.** Existia um único campo "Tempo Estimado" usado
tanto pra Delivery quanto pra Retirada. Separado em dois campos configuráveis, e corrigido em
todos os lugares que usavam o valor errado (contador regressivo, widget flutuante, chip do topo
do cardápio, mensagem de WhatsApp). De bônus: o card "Tempo Médio" do Dashboard nunca calculava
nada de verdade (só ecoava o texto configurado) — agora calcula a média real a partir dos
pedidos entregues no dia.

**"Reset de Dados" renomeado pra "Excluir Dados", com pergunta de qual antes de agir.** A
funcionalidade agora fica em Configurações → ⚠️ Zona de Perigo (só master): um único botão
"Excluir Dados..." abre um modal que primeiro pergunta **o que** excluir (Cardápio ou Pedidos),
mostra um aviso específico pra escolha, só then pede a senha master. Cada exclusão fica
registrada no histórico de auditoria.

**Botão "Continuar navegando pelo cardápio"** — era um link de texto sublinhado sem nada a ver
com o resto da tela. Agora é um botão "🛍️ Continuar Comprando" com o mesmo design dos outros.

# v33 — Senha MASTER, destaque duplicado, foto/fonte ajustáveis, Pedidos unificado, reserva com status

**Senha MASTER pra excluir pedido.** Antes o endpoint aceitava a senha de qualquer admin ou
usuário; agora `DELETE /api/admin/orders/:id` exige especificamente `cfg.masterPass` e só libera
pra quem está logado como **master** — no backend e escondendo o botão no painel pra quem não é
master.

**Bug real corrigido: destaque duplicado.** Todo prato com "Badge (destaque)" preenchido estava
sendo mostrado com o MESMO texto **duas vezes** no cartão — uma vez num selo no topo, de novo
numa tag dourada perto do preço. Unificado num único selo, mais visível (gradiente dourado).

**Foto do prato — enquadramento ajustável.** No cadastro de prato, dois sliders (Horizontal /
Vertical) deixam escolher qual parte da foto aparece dentro do quadro — útil quando a foto não é
quadrada ou o prato não está centralizado. Salvo por prato (`imagePos`), aplicado tanto na
prévia do admin quanto no cardápio do cliente.

**Tamanho da foto do prato e fonte do cardápio — ajustáveis.** Nova seção em Configurações →
🎨 Aparência do Cardápio: slider de tamanho da foto (56–140px) e seletor de tamanho de fonte
(Pequena/Normal/Grande/Extra Grande), aplicados ao vivo no cardápio do cliente.

**Dashboard + Gerenciar Pedidos + Kanban — unificados.** Os três viraram uma única aba "📊
Pedidos" com sub-abas internas (Visão Geral / Lista / Kanban), sem recarregar nada ao trocar.
De quebra, corrigido um bug de fundo: o destaque do item ativo no menu lateral usava uma
comparação de texto frágil que nunca funcionava direito pro item "Pedidos" — trocado por
atributos `data-page` explícitos, mais confiável.

**Ícones em caixa colorida no seletor de modo.** 🛵 Delivery / 🏪 Retirada / 📅 Reservar Mesa
agora aparecem como cartões com ícone destacado e cor própria (vermelho/azul/dourado) quando
selecionados, em vez de botões de texto simples.

**Tela de Reserva de Mesa do cliente — reconstruída** seguindo o modelo enviado: depois de
solicitar, a mesma tela mostra um card "ℹ️ Status da Reserva" com o andamento (⏳ Aguardando
confirmação / ✅ Confirmada / ✕ Recusada), a "💬 Resposta da Loja" quando o restaurante escreve
uma, e atualiza sozinha (tempo real via SSE + polling de reforço a cada 15s) — sem precisar
recarregar a página. No painel, a tela de reservas ganhou um campo pra loja escrever essa
resposta ao confirmar/recusar.

**Motoboys e Excluir do Sistema — confirmados presentes.** Essas duas features já tinham sido
implementadas na v32 (aba 🛵 Motoboys e botão 🗑️ Excluir do Sistema) — testamos de novo de ponta
a ponta nesta versão pra garantir que continuam funcionando. Se elas não aparecerem no seu
Render, o mais provável é que o deploy ainda esteja rodando uma versão anterior — vale conferir
se esse zip (v33) foi mesmo o que subiu.

**Bug do carrinho — reconfirmado corrigido.** Revisamos de novo todos os pontos onde o carrinho
é zerado (fim de pedido, troca de conta, repetir pedido) — todos já chamam `renderMenu()`
corretamente (corrigido na v32), então o produto não deve mais ficar "preso" com os botões −/+
travados.

# v28 — Impressão automática, foto do modal, dashboard sem dado falso, reserva visível, botão voltar

**1.2 — Impressão automática no recebimento do pedido.** Como o servidor na nuvem (Render) não
tem impressora física conectada — isso vale pra qualquer sistema do tipo, não só este — criei um
agente local (`print-agent/`) que roda num computador dentro da loja, escuta os pedidos em tempo
real e imprime sozinho, sem abrir navegador/PDF/diálogo. Testado de ponta a ponta: pedido criado →
detectado e "impresso" (modo teste) em 32ms. Erros ficam registrados em `print-agent.log`; sucesso
retorna sem travar nada. Ver `print-agent/README.md` pra instalar.

**1.1 — Bug real corrigido: placeholder da foto no modal de item.** A causa era usar `display:flex`
numa tag `<img>` vazia tentando centralizar um emoji — `<img>` não tem conteúdo interno pra
centralizar, então sem foto aparecia só uma caixa cinza, sem ícone nenhum. Trocado por um elemento
separado que aparece/some corretamente. Upload, substituição e salvamento já estavam certos.

**Bug real corrigido: nota "4.8" do Dashboard era fixa no código**, nunca refletia as avaliações
reais dos clientes. Agora é calculada ao vivo a partir das avaliações de verdade (testado: avaliação
de 5 estrelas → dashboard mostra 5.0; sem nenhuma avaliação → mostra "—" em vez de inventar um
número).

**Banner (itens 1 e 4):** já existia rolagem automática e tela cheia — faltava zoom suave (efeito
Ken Burns) e deslizar com o dedo no celular. Adicionado os dois, sem mexer no resto do banner.

**Botão de Reserva de Mesa (item 8) agora visível direto na tela principal** do cardápio do
cliente (ao lado de Delivery/Retirada), em vez de escondido dentro do menu "Falar com o
restaurante". Só aparece se reservas estiverem ativadas nas Configurações.

**Botão voltar do navegador evoluído** (em vez de removido, que não é tecnicamente possível):
agora fecha a tela ou modal aberta (carrinho, checkout, conta, avaliação, reserva, personalização
de item) em vez de sair do site — implementado de forma genérica com um observador de mudanças de
classe, sem precisar alterar cada uma das ~27 telas manualmente. **Importante:** essa parte mexe
com navegação do navegador e não dá pra testar 100% sem abrir num navegador de verdade — testei a
lógica e a sintaxe, mas peço que você confirme o comportamento depois de publicar.

**Itens ainda pendentes de mais detalhes** (2, 3, 5, 6, 7 completo, 10, cor "destaque"): pedem
"corrigir bugs" de forma genérica num sistema já grande e funcionando — preferi não arriscar
alterações às cegas. Muitos sub-itens já existem (reserva, agendamento, categoria fixa ao rolar,
sincronização em tempo real via SSE). Me manda um exemplo concreto do que está quebrado em cada um
e eu resolvo certeiro.

---



**Nova tela de acompanhamento** (aparece depois de confirmar o pedido), com tema próprio
mantendo a paleta de cores do Shogatsu:
- Cabeçalho em Playfair Display, corpo em Inter, botões em Poppins SemiBold (só nessa tela —
  o resto do site continua em Cormorant Garamond + Jost).
- Check verde desenhado com animação de traço + cards entrando em fade-in sequencial.
- Barra de progresso animada com 4 etapas (Recebido → Em preparo → Saiu para entrega →
  Entregue) + contagem regressiva do tempo estimado.
- Barra de status fixa no topo ao rolar a tela, e indicador "atualizado há Xs" mostrando que
  o acompanhamento é mesmo em tempo real.
- Mapa com OpenStreetMap (gratuito, sem chave de API) mostrando o endereço da loja e do
  cliente — geocodificado automaticamente na hora do pedido.
- Nome do entregador aparece quando o pedido sai pra entrega (o painel agora pergunta o nome
  ao avançar o status).
- Pagamento mostra só o método escolhido (em vez de listar os que não foram usados) + PIX com
  QR code, copiar chave e selo de "pago" / "a receber".
- Itens e total do pedido visíveis na própria tela (antes só iam pela mensagem de WhatsApp).
- Confete e som de confirmação — só na primeira abertura de cada pedido, não repete se
  minimizar e voltar.
- Avaliação por estrelas, repetir pedido com 1 clique, e compartilhar (Web Share API, com
  fallback pro WhatsApp).
- Notificação push automática pro cliente sempre que o status do pedido muda (reaproveitando
  a infraestrutura de push da v26), além do WhatsApp que já existia.
- Responsivo: as colunas do layout empilham sozinhas em telas pequenas.

**⚠️ Sobre o mapa:** a geocodificação do endereço (transformar texto em coordenadas) usa o
Nominatim/OpenStreetMap, que exige acesso à internet — funciona normal assim que publicado
num servidor com internet; num ambiente sem rede o pedido continua funcionando 100%, só sem
o marcador do cliente no mapa (a loja aparece de qualquer forma se a loja já foi geocodificada
nas Configurações).

---

# v26 — Bug do carrinho, botão de WhatsApp sumido, push, reservas e agendamento

**Bugs reais encontrados e corrigidos:**
- **Carrinho não esvaziava ao trocar de conta**: `doLogin`, `doRegister` e `doLogout` nunca
  limpavam o `cart`. Em aparelho compartilhado (tablet da loja, celular da família), os itens
  de uma conta continuavam aparecendo pro próximo cliente que entrasse com outra conta no
  mesmo navegador. Agora toda troca de identidade esvazia o carrinho, com aviso visual.
- **Botão de WhatsApp sumido na tela principal de Pedidos**: existia só no card do Dashboard
  (`miniOrderCard`), mas nunca foi adicionado na tela "Pedidos" (`renderOrdersList`) — só
  tinha o botão de Imprimir lá. Adicionado.
- **Botões sem estilo (Imprimir/WhatsApp)**: a classe `.oa-btn` base não tinha nenhum
  `background`/`border` definido — esses botões ficavam "soltos" na tela, sem parecer
  clicáveis. Agora têm contorno e fundo consistentes com os outros.
- **Estrelas de avaliação sem cor**: `.star-picker .star.on` só tinha `filter:grayscale(0)`, e
  sem uma cor de base as estrelas "selecionadas" apareciam na cor do texto padrão, não
  douradas. Corrigido com cor vibrante (`#FFC300`) e brilho.

**Novidades:**
- Notificações push de verdade (Web Push + VAPID), implementadas do zero em `webpush.js` só
  com o `crypto` nativo do Node — sem dependência paga nem serviço de terceiros. Composer de
  campanha segmentada em Configurações → 🔔 Notificações Push.
- Reserva de Mesas: tela no cardápio (via 📞 Falar com o restaurante → Reservar uma mesa) +
  aba "📅 Reservas" no painel pra confirmar/recusar.
- Agendamento de Pedidos: opção no checkout pra escolher data/hora futura em vez de "o quanto
  antes", respeitando janela mínima/máxima configurável.
- Minha Conta: histórico de pedidos ("📦 Meus Pedidos") e edição de cadastro ("✏️ Editar
  Cadastro"), ambos protegidos por confirmação de senha (a senha nunca fica salva no
  navegador).
- Banner do cardápio virou hero em tela cheia (88vh) com transição mais suave.
- Selo de promoção/benefício abaixo do preço nos cards de produto.

**⚠️ Importante pra notificação push funcionar:** o navegador só permite inscrição em push
num site com HTTPS (exceto `localhost`). Teste isso só depois de publicar no domínio real —
localmente ele carrega, mas o navegador bloqueia a inscrição.

---

# v25 — Backup automático no Supabase (persistência gratuita no Render)

Como o Disco Persistente do Render só existe em plano pago, adicionei sincronização
automática com uma tabela no Supabase (plano gratuito permanente): toda escrita local
(pedido, config, cliente) dispara um backup assíncrono pro Supabase, sem travar a
resposta; e ao ligar, o servidor busca lá o último estado antes de aceitar pedidos —
o que resolve o problema de perder tudo a cada deploy, de graça. Testado: com Supabase
mal configurado ou fora do ar, o servidor sobe normal e os pedidos continuam sendo
criados em milissegundos (erro fica só no log, nunca trava nada). Ver `README.md` pra
configurar (leva uns 5 minutos) e `supabase-setup.sql` pra criar a tabela.

---



## v19 — Bugs reais encontrados e corrigidos
- **XSS armazenado no painel**: nome/telefone/endereço/observação do pedido eram inseridos
  direto no HTML sem escapar. Um pedido malicioso podia rodar script no navegador de quem
  opera o painel. Corrigido com uma função `esc()`.
- **XSS armazenado nas avaliações públicas** (mais grave): o comentário de uma avaliação
  aparecia sem escapar pra QUALQUER visitante do site, não só pro admin. Corrigido.
- **Preço de item adulterável pelo cliente**: o servidor aceitava sem checar o preço que o
  navegador mandava ao criar o pedido — bastava editar a requisição pra "pagar" R$0,01 em
  qualquer prato. Agora o servidor valida contra o cardápio real antes de aceitar.
- **Rota duplicada** `GET /api/admin/customers` (a segunda nunca era executada — código morto).
  Mesclada numa só, mais completa.
- **Configuração de chave PIX inexistente no painel**: o servidor já suportava PIX, mas não
  havia NENHUM campo na interface pra cadastrar a chave — PIX nunca funcionava de verdade.
  Adicionado o card "💠 PIX" em Configurações.

## v20 — Programa de Fidelidade (pontos)
Cliente ganha pontos a cada pedido **entregue** (configurável, padrão 1 ponto por R$1) e troca
por desconto no próximo pedido. Calculado ao vivo a partir do histórico de pedidos (sem contador
que possa dessincronizar). Testado ponta a ponta: ganhar pontos → resgatar → desconto aplicado
corretamente → saldo atualizado.

## v21 — Notificações por WhatsApp
Duas camadas: (1) botão manual "💬" em cada pedido, que abre uma conversa no WhatsApp já com a
mensagem de status pronta — funciona sempre, de graça, sem depender de nada; (2) envio automático
opcional via Twilio (mesma conta usada pro SMS), configurável em Configurações → SMS.

## v22 — Confirmação de Pagamento PIX
Botão "✅ Marcar pago" no painel pra confirmação manual (funciona sempre). Estrutura opcional de
webhook `/api/webhook/pix` pronta pra integrar com Mercado Pago (confirmação 100% automática) —
exige conta própria e Access Token de produção, configurável em Configurações → PIX.

## v23 — Favoritos no cardápio do cliente
Cliente marca pratos favoritos (coração no card) e filtra o cardápio só pelos favoritos.
Guardado no navegador do próprio cliente, sem precisar de conta.

## v24 — Relatórios evoluídos
Página de Relatórios ganhou: cards de KPI (faturamento, pedidos e ticket médio dos últimos 7
dias), faturamento por forma de pagamento e ranking dos pratos mais pedidos — além do que já
existia (gráfico de barras, histórico e exportação CSV). De brinde, corrigi mais um XSS
(nome do cliente sem escapar na tabela de histórico).

---



## 🐛 Bug real encontrado e corrigido: fechamento automático da impressão
Ao mexer na correção do bloqueio de pop-up (atualização anterior), acabei
introduzindo sem querer um bug onde o texto `</script>` dentro do ticket
impresso quebrava a página por trás — o tipo de bug que só aparece de
verdade no navegador. Peguei isso numa checagem de sintaxe antes de
liberar, corrigi, e aproveitei pra deixar o fechamento automático da
janela de impressão **mais confiável**: agora tem um evento principal
("depois de imprimir" fecha sozinho) e um limite de segurança de 45s caso
o navegador não dispare esse evento — nunca mais deve ficar uma janela de
impressão aberta pra sempre.

## ⚡ Avaliação abre mais rápido quando o restaurante marca "Entregue"
O aplicativo do cliente verifica o status do pedido a cada 2 segundos
agora (era a cada 5). Isso deixa a abertura automática da avaliação —
seja pelo cliente clicando "Recebi" ou pelo restaurante marcando
"Entregue" — bem mais parecida com "no mesmo momento", já que o atraso
máximo cai de 5s pra 2s.

## 🔢 Dois pedidos não podem mais ter o mesmo número
Se o caixa digitar manualmente um número de pedido que **já está sendo
usado por outro pedido ainda em andamento** (não entregue, não
cancelado), o sistema recusa com uma mensagem clara dizendo qual pedido
já está com aquele número, e pede pra escolher outro. Pedidos já
entregues ou cancelados liberam o número de novo pro ciclo normal.
Também blindei a atribuição automática (quando você aceita sem digitar
nada) pra pular qualquer número já em uso, mesmo em cenários raros de
muitos pedidos simultâneos.

Testei os dois cenários rodando o servidor: número repetido → recusado
com mensagem clara; número diferente → aceito normalmente.

## Como aplicar
`server.js` e `public/painel.html` mudaram — `public/index.html` também
mudou (intervalo de verificação). Os três: substitua e dê push.
