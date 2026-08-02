# Shogatsu — v66

## 🐞 Bug corrigido (causa real): painel de login "atualizando e apagando o que digito"

A correção anterior (fallback de versão instável em `server.js`) era real e
válida, mas **não era a causa principal** do problema que continuou
acontecendo mesmo depois do deploy. A causa raiz de verdade estava em
`public/painel.html`:

- `iniciarPollingAtendimento()` roda sozinha assim que a página carrega —
  **antes de qualquer login** — porque o elemento `#wa-admin-list` já existe
  no HTML desde o início (só fica escondido atrás da tela de login).
- A cada 5 segundos, essa rotina tentava buscar as conversas do Chat
  Express **sem estar logada**. O servidor respondia `401 Unauthorized`.
- `apiGet()` reage a qualquer `401` chamando `doLogout()`, que faz
  `location.reload()` — recarregando a tela de login (e apagando
  usuário/senha digitados) **a cada 5 segundos, indefinidamente**, enquanto
  ninguém estivesse logado.

**Correção:**
1. `loadAtendimentoConversas()` agora só executa se já existir uma sessão
   (`token`) salva — sem login, nem tenta buscar nada.
2. `apiGet`/`apiPost`/`apiPatch` só chamam `doLogout()` (e recarregam a
   página) em resposta a um `401` se já existia uma sessão ativa antes —
   protege contra qualquer chamada futura feita por engano antes do login.

> ⚠️ Como sempre: essa correção só tem efeito depois de publicada (deploy)
> no Render.

## 🎨 Cores do chat atualizadas em TODO o sistema

Da vez passada a paleta nova (fundo `#0F1115`, enviada `#D32F2F`, recebida
`#1F2937`, texto `#FFFFFF`, detalhes `#BDBDBD`, Inter, bolhas 18px) só
tinha sido aplicada no **painel do admin** (`public/painel.html`). Agora
também foi aplicada no **Chat Express que o cliente vê** no site
(`public/index.html`) — celular, tablet e desktop —, que tinha seu
próprio bloco de CSS separado e continuava com o visual antigo (dourado).
Os dois chats agora têm exatamente a mesma identidade visual.

## 🎨 Novo visual: painel de Mensagens (Chat Express) — admin

Layout de chat redesenhado com identidade própria, mantendo a
familiaridade do WhatsApp:

- Fundo `#0F1115` · bolha enviada `#D32F2F` · bolha recebida `#1F2937`
- Texto `#FFFFFF` · detalhes/horário `#BDBDBD`
- Fonte **Inter** — 15px nas mensagens, 17px no nome do contato, 11px nos horários
- Bolhas com `border-radius: 18px`
- Animação suave de entrada de mensagens e no indicador de "digitando"
- Caixa de digitação em formato pílula, com destaque vermelho no foco,
  botão de enviar circular com sombra — mesmo padrão de interação do
  WhatsApp, cores e acabamento exclusivos do sistema
- 100% responsivo (mobile / tablet / desktop), sem alterar nenhuma
  função (envio de foto, áudio, emoji, digitando... continuam iguais)

Arquivos alterados: `public/painel.html`, `public/index.html`.

