# Shogatsu — v53 — Notas desta versão

## 1. 🐛 Corrigido — ícones se misturando na caixa de fotos do prato (Painel → Cardápio)
Na tela de editar um item do cardápio ("Foto do Prato"), a caixinha de prévia tinha dois
elementos empilhados: a imagem enviada e um emoji de prato 🍽️ usado como placeholder quando
ainda não tem foto. O `<img>` só ficava escondido depois que o JavaScript rodava — no CSS ele
não tinha `display:none` por padrão. Isso deixava uma brecha: em qualquer carregamento um
pouco mais lento, o navegador chegava a desenhar o ícone de "imagem quebrada" (sem `src`) por
cima do emoji do placeholder, os dois se misturando na mesma caixinha.

**O que mudou** (`public/painel.html`): a prévia (`.photo-preview`) agora começa escondida por
CSS e só aparece quando o JavaScript confirma que existe uma foto de verdade pra mostrar —
nunca mais os dois ícones aparecem juntos.

## 2. 📐 Caixa de foto do prato com tamanho igual no celular
A caixa de foto do prato no cardápio do cliente (`public/index.html`) tinha só `width`/`height`
fixos — em containers flexíveis (`display:flex`) isso pode encolher de forma inconsistente
dependendo do conteúdo ao lado (nome do prato mais longo, badge de indisponível, etc.), fazendo
a foto de um prato ficar visualmente menor que a de outro na mesma lista, principalmente em
telas de celular mais estreitas. Agora a caixa também tem `min-width`/`min-height`, travando o
tamanho — todas as fotos do cardápio ficam com o mesmo tamanho, sem depender do que tem do lado.

## 3. 🕐 Agendamento de Delivery/Retirada agora usa o mesmo formato de horário da Reserva de Mesa
Antes, "Agendar Pedido" (delivery/retirada) usava o seletor de hora **nativo** do navegador
(`<input type="time">`) — cada celular mostra isso de um jeito diferente (relógio giratório,
teclado numérico, etc.), enquanto a Reserva de Mesa já usava botões de horário prontos pra
tocar, só com os horários realmente dentro do funcionamento da loja.

**O que mudou** (`public/index.html`): o campo de horário do agendamento de delivery/retirada
foi trocado pelos mesmos botões de horário clicáveis da Reserva de Mesa — de 30 em 30 minutos,
já calculados a partir do horário mínimo de antecedência e do funcionamento de hoje. As duas
telas agora têm exatamente a mesma cara e o mesmo jeito de escolher horário.

## 4. ✨ Animação premium ao passar o mouse (desktop) ou tocar (celular)
Criada uma classe compartilhada (`.time-slot-btn`) usada tanto na Reserva de Mesa quanto no
Agendamento de Delivery — ao passar o mouse ou tocar num horário, o botão sobe levemente com
uma pequena "molinha" (easing tipo bounce) e ganha um brilho dourado; o horário escolhido fica
destacado em dourado sólido. O mesmo tipo de animação (elevação + sombra + leve zoom) também foi
aplicado nos botões Delivery / Retirada / Reservar Mesa e no botão "+" de adicionar item ao
carrinho, pra dar uma sensação mais "premium" (tipo iFood/Uber Eats) ao tocar nesses elementos.

## 5. 🎬 Splash Screen (Tela de Abertura) — duração maior, Live Photo e novo jeito de entrar
- **Duração**: o limite máximo subiu de 5 para **15 segundos** (tanto no campo do Painel quanto
  no comportamento real da tela) — dá pra deixar a sequência de fotos rodar bem mais tempo antes
  de cair no cardápio.
- **Foto Fixa ou Live Photo**: cada foto da sequência agora pode ser uma **Foto Fixa** (imagem
  parada, como já era) ou uma **Live Photo** — um vídeo curto em loop, mudo, tocando por trás,
  dando o efeito de "foto viva" (tipo iPhone). O upload aceita tanto imagem (PNG/JPG/WEBP) quanto
  vídeo (MP4/WEBM/MOV) dependendo do tipo escolhido pra aquele slide.
- **Botão "Pular" removido**: não existe mais um botãozinho isolado no canto da tela. Agora a
  splash inteira funciona como gatilho — **um toque (ou clique) em qualquer ponto da tela** já
  entra direto no cardápio/tela de pedidos, com uma dica sutil piscando embaixo ("👆 Toque para
  entrar") no lugar do botão antigo.

**Suporte técnico pra vídeo** (`server.js`): o endpoint de upload (`/api/upload`) agora aceita
arquivos de vídeo (MP4/WEBM/MOV) além de imagem, com limite de 15MB pra vídeo (contra 4MB de
imagem) e o limite de tamanho do corpo da requisição foi ajustado pra caber isso. De brinde,
corrigido também que arquivos `.jpg` e `.webp` enviados não tinham o `Content-Type` certo ao
serem servidos (ficavam como `application/octet-stream`) — o que impedia vídeos de tocarem
corretamente dentro da tag `<video>`, principalmente no Safari/iOS.

## O que testar antes de publicar
1. Painel → Cardápio → editar um item → abrir a caixa "Foto do Prato" várias vezes seguidas
   (com e sem foto salva) — nunca deve aparecer ícone de imagem quebrada por cima do prato 🍽️.
2. No celular, abrir o cardápio e conferir que todas as fotos dos pratos aparecem do mesmo
   tamanho, mesmo com nomes de prato de tamanhos bem diferentes.
3. Marcar "Quero agendar" tanto no Delivery/Retirada quanto abrir "Reservar Mesa" — os dois
   devem mostrar a mesma grade de botões de horário, com o mesmo visual e a mesma animação ao
   tocar/passar o mouse.
4. Painel → Splash Screen: aumentar a duração até 15s, adicionar uma foto como "Live Photo"
   enviando um vídeo curto, salvar, e abrir o site pra conferir que o vídeo toca em loop mudo.
5. Na Splash Screen, tocar em qualquer ponto da tela (não só num botão) e confirmar que entra
   direto no cardápio — e que não existe mais nenhum botão "Pular" no canto.
