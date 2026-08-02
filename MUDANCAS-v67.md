# v67 — Fundo do Chat (Chat Express)

## Novidade
O restaurante agora pode personalizar o fundo das conversas do Chat Express — igual ao "papel
de parede" do WhatsApp — direto pelo painel administrativo, sem mexer em código.

## Painel Administrativo
**Configurações → Aparência → 🖼️ Fundo do Chat (Chat Express)**

- Enviar imagem própria (PNG, JPG ou WEBP, até 5MB)
- Trocar a imagem quantas vezes quiser
- Remover e voltar ao fundo padrão do sistema
- Ativar/Desativar o fundo sem perder a imagem já enviada
- Ajustar a intensidade do escurecido aplicado sobre a foto (controla a legibilidade das
  mensagens)
- Pré-visualização em tempo real, com uma bolha de mensagem de exemplo por cima
- Galeria com 10 fundos prontos (vetoriais, ficam nítidos em qualquer tela): Sushi Premium,
  Restaurante Japonês, Bambu, Madeira Escura, Dragão Japonês, Monte Fuji, Flores de Cerejeira,
  Onda Japonesa, Preto Texturizado e Minimalista Escuro — em `public/images/chat-backgrounds/`

## Exibição pro cliente
- A imagem preenche toda a área de mensagens (`background-size:cover`), sem nunca deformar,
  em qualquer resolução — celular, tablet ou computador
- Overlay escuro automático (opacidade ajustável, padrão `rgba(0,0,0,0.45)`) garante que o texto
  das mensagens continue sempre legível em cima de qualquer foto
- Sincroniza sozinho entre os dispositivos do cliente: o fundo é aplicado assim que o Chat
  Express carrega, e atualiza em tempo real (via SSE) se o restaurante trocar a foto com o chat
  já aberto
- Cores e tipografia do chat (fundo #121212, bolha enviada #D32F2F, bolha recebida #2A2F3A,
  texto #FFFFFF, fonte Inter) permanecem intactas — a imagem só entra por trás das mensagens

## APIs novas
```
GET    /api/chat/background   → devolve o fundo atual (público — sem informação sensível)
POST   /api/chat/background   → admin. Body: { dataUrl } ou { presetUrl, presetName }
                                  e/ou { enabled } e/ou { overlay }
DELETE /api/chat/background   → admin. Remove a imagem e restaura o padrão
```

## Banco de dados
Guardado dentro de `cfg.chatBackground` (mesmo arquivo `data/config.json` de sempre — sincroniza
com o backup do Supabase que já existia, sem precisar de tabela nova):
```json
{ "enabled": false, "url": "", "name": "", "size": 0, "width": 0, "height": 0, "date": "", "overlay": 0.45 }
```
`width`/`height` são lidos direto dos bytes da imagem (PNG/JPEG/WEBP), sem depender de nenhuma
biblioteca externa — o projeto continua 100% vanilla Node, sem dependências novas.

## Segurança e performance
- Só aceita imagem de verdade: valida assinatura/MIME type (PNG, JPG, WEBP), nunca confia só na
  extensão do arquivo
- Limite de 5MB, endpoints de escrita exigem login de admin
- Upload antigo é apagado do disco automaticamente ao trocar de foto (não acumula lixo em
  `uploads/`)
- Arquivos em `/uploads/` agora têm `Cache-Control: public, max-age=31536000, immutable` — a
  imagem do fundo é baixada uma única vez pelo navegador do cliente e fica em cache depois disso
- Nenhuma funcionalidade existente (pedidos, mensagens, áudio, notificações, splash screen) foi
  alterada
