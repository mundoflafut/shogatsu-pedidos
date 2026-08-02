# Shogatsu — v66

## 🐞 Bug corrigido: painel de login "atualizando e apagando o que digito"

Causa raiz (herdada do fallback de versão do build, em `server.js`):
quando o servidor não tinha acesso ao Git, a versão usada pra decidir se
existia "atualização nova" era `'boot-' + Date.now()` — um valor que muda
sozinho a cada reinício do processo, mesmo sem nenhum deploy novo (cold
start do plano grátis do Render, queda e retorno, múltiplas instâncias
sobrepostas por alguns segundos). Isso fazia `public/version-check.js`
achar que sempre existia versão nova e recarregar a página sozinha —
inclusive no meio da digitação de usuário/senha.

**Correção:** a versão agora é calculada a partir do commit do Git
(`RENDER_GIT_COMMIT`/`git rev-parse`) e, só na ausência dele, da data de
modificação do próprio `server.js` — um valor estável entre reinícios sem
deploy novo. `APP_VERSION` deixou de incluir o horário de boot do
processo na comparação. Reinícios sem código novo passam a gerar sempre
o mesmo valor → sem reload à toa, login nunca mais é apagado sozinho.

> ⚠️ Essa correção só tem efeito depois de você publicar (deploy) este
> código no Render — editar o arquivo aqui não muda o que já está no ar.

## 🎨 Novo visual: painel de Mensagens (Chat Express)

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

Arquivo alterado: `public/painel.html` (bloco de CSS `.wa-*`).
