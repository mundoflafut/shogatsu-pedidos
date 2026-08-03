# v68 — Chat Express estilo WhatsApp, Logo da Marca e Foto Provisória dos Pratos

## Chat Express — rodapé redesenhado (estilo WhatsApp)
- Caixa de digitação bem maior (like o WhatsApp): mais alta, fonte 16px (evita o zoom automático
  do iPhone ao tocar no campo), cantos mais arredondados
- Botão **"+"** novo, que agrupa Emoji e Anexar foto num menuzinho — gira e vira um "×" quando
  abre, com transição de 200ms
- Botão de **enviar** e de **áudio** continuam sempre visíveis e em destaque, do lado da caixa de
  texto — só o que era usado com menos frequência (emoji, anexo) foi pro "+"
- Rodapé ficou mais limpo — 3 botões + caixa de texto, em vez de 4 ícones + caixa, no celular e
  no PC
- **Bug corrigido:** todos os ícones do rodapé (➤ enviar, 🎤 áudio, + , 😊 emoji, 📎 anexo) agora
  são desenhados em SVG, em vez de depender de emoji do sistema operacional — corrige o problema
  de ícone aparecendo como "▯"/"?" em navegadores ou fontes sem aquele emoji instalado

## Logo da Marca (novo)
- Nova seção **Painel → Configurações → Aparência → 🏷️ Logo da Marca**: enviar, trocar e remover
  a logo, escolher formato (redondo/quadrado/retangular) e tamanho — tudo salva na hora
- A logo enviada aparece automaticamente no cabeçalho do cardápio **e** como foto de perfil do
  Chat Express (antes era um ícone fixo) — trocando a logo no painel, atualiza nos dois lugares
- **Bug corrigido:** a logo agora sempre usa `object-fit:contain` (nunca `cover`) — a imagem
  inteira sempre aparece, sem cortar nenhuma borda, em qualquer formato de moldura
- A logo enviada nessa conversa já foi configurada como logo oficial da loja (redonda, 44px) —
  o restaurante pode trocar quando quiser, direto pelo painel, sem precisar de suporte técnico

## Foto provisória dos pratos
- Pratos que ainda não têm foto cadastrada agora mostram a **logo da loja como imagem
  provisória** (em vez do ícone genérico da categoria) — assim que o prato ganha uma foto de
  verdade no painel, ela substitui isso automaticamente, prato por prato
- Nenhuma ação manual necessária: já vale pros pratos existentes

## Arquivos novos
- `public/images/logo-shogatsu.png` — logo oficial da loja, otimizada (1.6MB → ~112KB) para
  carregar rápido em qualquer aparelho

## Nada foi alterado em:
Pedidos, pagamento, notificações, splash screen, fundo do chat (v67), e nenhuma outra
funcionalidade existente do sistema.
