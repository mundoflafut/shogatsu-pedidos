# Shogatsu — v60 — Chat estilo WhatsApp Web, impressão remota com confirmação e correção de bugs

## 💬 1. Módulo de mensagens redesenhado (estilo WhatsApp Web, responsivo)
Tanto o chat do cliente (cardápio) quanto a aba "Conversas com Clientes" do painel foram
refeitos do zero visualmente, mantendo toda a lógica/API por baixo:
- Cabeçalho com avatar, nome/status e indicador de "digitando..." em tempo real.
- Balões de conversa com horário em cada mensagem e separador de "Hoje / Ontem / data".
- Rodapé fixo com emoji 😊, anexar foto 📎, gravar áudio 🎤 e enviar ➤.
- **Foto**: anexa e manda como mensagem, aparece como balão de imagem (clique pra abrir grande).
- **Áudio**: grava pelo microfone do navegador (MediaRecorder) e manda como mensagem de voz com
  player de áudio no balão.
- No painel: virou um layout de duas colunas (lista de conversas + chat aberto) — no celular,
  a lista ocupa a tela toda e abrir uma conversa desliza pra ela com botão de voltar (←),
  como o WhatsApp Web se comporta num celular.
- Mensagens de foto/áudio pulam a IA automaticamente e já avisam que um atendente vai ver (a IA
  não sabe "olhar" pra imagem/áudio).

## 🖨 2. Impressão remota — celular como controle remoto, com confirmação de verdade
O sistema já tinha impressão automática sem diálogo de navegador (Agente Local + Extensão
Chrome, desde a v46/v52) — faltava o **retorno da confirmação**. Agora:
- Ao tocar em Imprimir numa via "Automática" (painel no PC OU no celular), o pedido é enviado ao
  servidor, que repassa pro Agente Local instalado no PC ligado na impressora — sem abrir
  navegador, PDF ou diálogo nenhum (isso já funcionava).
- **Novidade**: o Agente Local avisa o servidor se imprimiu com sucesso ou se falhou
  (`POST /api/print-ack`), e o servidor repassa isso pra todos os painéis conectados em tempo
  real (SSE) — quem tocou em Imprimir vê "🖨 Impresso!" ou "⚠️ Falha ao imprimir" de verdade.
- Falhas ficam registradas em `data/print-log.json` (últimas 500), consultável em
  `GET /api/print-log`.
- Se ninguém confirmar em 15s (Agente Local desligado, por exemplo), avisa isso também.
- Nada mudou no formato do pedido nem no banco de dados — só o retorno da confirmação.

## 🐛 Bug corrigido: ícone/título errado na caixa de mensagens
Quando a IA está desligada, o servidor já cria a conversa direto em modo "atendente humano", mas
o título ficava travado no ícone/texto padrão porque só era atualizado numa função que não era
chamada nesse caminho (conversa nova). Corrigido.

## 🐛 Bug corrigido: cliente não recebia a resposta do atendente sozinho
Mesma causa acima: o polling que verifica novas mensagens só ligava no caminho de conversa já
existente. Corrigido.

## 🐛 Bug corrigido: janela vazia "piscando" na impressão simultânea
O botão de imprimir sempre pré-abria uma janela em branco, mesmo sem nenhuma via "Navegador".
Agora só abre quando pode realmente precisar dela, sem reintroduzir o bug de pop-up bloqueado
das v39/v51 (decisão continua síncrona, antes de qualquer `await`).

## 🐛 Bug corrigido (causa raiz): login e senha "apagados" ao entrar no sistema
Achado: sessões viviam só em memória. Como o Render reinicia o processo a cada deploy/sleep, todo
login virava inválido do nada — a primeira chamada de API batia 401 e o painel chamava
`doLogout()` sozinho, apagando usuário/senha salvos no navegador.
**Correção:** sessões agora são espelhadas em `data/sessions.json` + Supabase e recarregadas no
boot — reiniciar o processo não derruba mais quem já estava logado (continua expirando em 12h).

## 🐛 Bug investigado (causa raiz) e mitigado: fotos que somem/não carregam
Achado: `public/uploads/` mora no mesmo disco que o Render apaga a cada deploy, a menos que
`UPLOADS_DIR` aponte pra um Disco Persistente pago. Diferente de pedidos/config/clientes, fotos
nunca tinham backup nenhum.
**Mitigação no código:** toda foto enviada (cardápio, ingredientes, motoboy, chat) agora também é
guardada em base64 no Supabase (se configurado) e restaurada automaticamente pra `uploads/` no
boot — sem precisar de Disco Persistente pago. Vídeos (Live Photo) ficam de fora (grandes demais
pro banco); pra esses o Disco Persistente continua sendo necessário. Se nem `UPLOADS_DIR` nem
Supabase estiverem configurados, o servidor avisa isso no log ao ligar. Balões de foto no chat
agora também mostram um aviso amigável se a imagem não carregar, em vez do ícone quebrado do
navegador.

## ⏳ Sobre a "auditoria completa" pedida
Revisei e corrigi a fundo mensagens, impressão, login e upload de fotos — os sintomas concretos
descritos. Não seria honesto dizer que revisei linha por linha as mais de 9 mil linhas do sistema
numa única leva garantindo "zero erros" — isso é trabalho pra revisar por partes. Se algo
específico ainda parecer estranho, me diga o quê e vou direto nele.

## Arquivos alterados
- `server.js` — sessões persistidas (login), backup/restauração de fotos via Supabase, rotas de
  chat estendidas (foto/áudio/digitando), `/api/print-ack` e `/api/print-log`.
- `public/index.html` — chat do cliente redesenhado (WhatsApp Web), upload de foto/áudio, emoji,
  indicador de digitação.
- `public/painel.html` — aba "Conversas com Clientes" redesenhada (duas colunas, responsiva),
  listener SSE `print-result`, janela de impressão só abre quando necessário.
- `print-agent/print-agent.js` — reporta resultado de cada impressão de volta ao servidor.
- `package.json` — versão `59.0.0-etapa1` → `60.0.0`.

## Testes feitos antes de fechar
- `node --check` em `server.js`, `print-agent/print-agent.js` e em todos os blocos `<script>` de
  `index.html`/`painel.html`: sem erro de sintaxe.
- Contagem de `<div>`/`</div>` conferida em ambos os HTML: balanceada.
- Rotas novas de upload público do chat (`/api/atendimento/:id/upload`) não passam por
  `checkAuth` (cliente não tem login); as do painel (`/api/admin/atendimento/:id/upload`) exigem.
- Decisão de pré-abrir a janela de impressão continua síncrona, preservando a correção de v39/v51.
- Nada foi alterado no formato de `orders.json`, `config.json`, `customers.json` etc. — só campos
  novos e opcionais em `atendimento.json` (`tipo`, `url`, `clienteDigitandoAte`,
  `atendenteDigitandoAte`), que não quebram nada que já lia esse arquivo.

## O que ainda depende de configuração de infraestrutura (fora do código)
- Pra fotos NUNCA sumirem mesmo sem Supabase: configurar um Disco Persistente no Render e
  apontar `UPLOADS_DIR` pra ele.
- Pra vídeos (Live Photo) sobreviverem a deploys: o mesmo Disco Persistente é necessário (ou um
  serviço de storage de arquivos como Supabase Storage/S3 — posso implementar numa próxima
  rodada se quiser).
