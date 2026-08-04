# v71 — Popup Premium de Instalação do PWA

## 📲 Novo popup de instalação (substitui o banner simples antigo)
Modal central grande, fundo escuro (`#0B0B0B`), detalhes em vermelho (`#E53935`) e dourado,
com animações de abertura (fade + scale), brilho no botão principal e visual de app
profissional — em vez do banner fino que ficava no rodapé da tela.

- **Android/Chrome:** intercepta o evento `beforeinstallprompt` (impede a barrinha automática
  do navegador) e mostra o popup 2s após a primeira visita. Clique em "Instalar App" abre o
  prompt nativo; se aceito, mostra "✅ App instalado com sucesso!" e ativa o benefício.
- **iPhone/iPad:** como o Safari não instala em 1 toque, mostra o passo a passo (Compartilhar →
  Adicionar à Tela de Início → Adicionar), com o mesmo benefício exibido.
- Reaparece só depois de **15 dias** (`localStorage`) pra quem não instalou; nunca mais aparece
  pra quem já instalou (`shogatsu_installed = true`, detecta também modo standalone).

## 🎁 Benefício configurável no painel (Configurações → 📱 WhatsApp & Atendimento)
Novo card **"📲 Popup de Instalação do App"**:
- Ativar/desativar o popup inteiro
- Tipo de benefício: **cupom de desconto** (usa um código já cadastrado em 🎟️ Cupons — ex:
  `PRIMEIRO10`, 10% OFF) ou **bônus em reais** (texto livre, só informativo no popup)
- Código do benefício exibido/copiado automaticamente pro cliente ao clicar em instalar

O cupom `PRIMEIRO10` (10% OFF) já vem cadastrado e funcionando no checkout.

## 🧩 Arquivos novos
- `public/install-prompt.js` — componente vanilla JS, auto-contido (o projeto não usa
  React/Vite, então segue o mesmo padrão de `version-check.js`)
- `public/install-prompt.css` — visual do popup

## 🔧 Arquivos alterados
- `server.js` — novo `cfg.installPromo` (default + merge em `POST /api/config`)
- `data/config.json` — `installPromo` preenchido + cupom `PRIMEIRO10` cadastrado
- `public/index.html` e `public/pedir-agora.html` — removido o banner antigo, incluído o
  novo componente
- `public/painel.html` — card de configuração do popup + coleta no "💾 Salvar Tudo"
