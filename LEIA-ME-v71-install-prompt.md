# v71 — Popup Premium de Instalação do PWA

## ⚠️ Um ajuste em relação ao pedido

Você pediu "React/Vite", mas o Shogatsu **não usa React nem Vite** — é um projeto
Node/Express (`server.js`) servindo HTML/CSS/JS puro em `/public`, sem etapa de build.
Um componente React não teria como ser importado em nenhum `App.jsx`, porque esse
arquivo não existe no projeto.

Por isso montei o componente equivalente **no padrão real do seu projeto**: vanilla
JS/CSS, plug-and-play, do mesmo jeito que `version-check.js` e o antigo banner de
instalação já funcionavam. O resultado final é idêntico ao que você descreveu — só a
tecnologia por baixo é diferente.

## O que mudou

**Novos arquivos:**
- `public/install-prompt.js` — o componente (toda a lógica: detecção Android/iPhone,
  `beforeinstallprompt`, modal, animações, localStorage).
- `public/install-prompt.css` — o visual (fundo `#0B0B0B`, vermelho `#E53935`, dourado,
  `border-radius:24px`, animações).

**Arquivos alterados:**
- `public/index.html` — removi o banner simples antigo (linha ~4030) e coloquei no lugar:
  ```html
  <link rel="stylesheet" href="/install-prompt.css">
  <script src="/install-prompt.js" defer></script>
  ```
- `public/pedir-agora.html` — mesmas duas linhas adicionadas antes do `</body>`.
- `server.js` — novo campo `cfg.installPromo` (default) e incluído no merge do
  `POST /api/config`, pra o painel poder salvá-lo.
- `data/config.json` — já vem com `installPromo` preenchido e um cupom `PRIMEIRO10`
  (10% OFF) cadastrado em `cfg.coupons`, funcionando de verdade no checkout.
- `public/painel.html` — novo card **"📲 Popup de Instalação do App"** dentro de
  Configurações → 📱 WhatsApp & Atendimento, com os campos:
  - Exibir popup? (ativado/desativado)
  - Tipo de benefício: Cupom **ou** Bônus em reais
  - Código do cupom (precisa existir em 🎟️ Cupons pra aplicar desconto de verdade)
  - Valor do bônus (só texto exibido no popup — não debita nada sozinho)
  - Código do benefício exibido/copiado (opcional)

  Salva junto com o botão "💾 Salvar Tudo" de sempre.

## Como instalar no seu projeto

Copie os arquivos deste zip por cima da mesma estrutura de pastas do seu projeto
(`public/`, `server.js`, `data/config.json`) e reinicie o servidor (`node server.js`).

Se você já alterou `server.js`, `painel.html` ou `data/config.json` desde a v70, me
avise — posso gerar um diff certinho em vez de sobrescrever o arquivo inteiro.

## Comportamento implementado (conforme pedido)

- Detecta Android (evento `beforeinstallprompt`, com `preventDefault()` pra nunca deixar
  a barrinha automática do Chrome aparecer sozinha) e iPhone/iPad (mostra passo a passo,
  já que iOS não tem instalação em 1 toque).
- Aparece 2s depois da primeira visita, modal central grande, fundo escuro, vermelho e
  dourado, `border-radius:24px`, sombra forte, fade+scale ao abrir, fecha ao tocar fora.
- Reaparece só depois de 15 dias (`localStorage`) — e nunca mais depois que o app é
  instalado (`shogatsu_installed = true`, também detecta se já está rodando em modo
  standalone).
- Mostra dinamicamente a mensagem de cupom OU de bônus, conforme o que o admin configura
  no painel; o código do benefício é copiado automaticamente pro clipboard ao instalar.
- Ao aceitar a instalação no Android: mensagem de sucesso "✅ App instalado com sucesso!
  Seu benefício foi ativado automaticamente."
