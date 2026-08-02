# Shogatsu — v59 — Notas desta versão (completa)

## ✋ 1) Botões com posição editável — Gerenciar Pedidos e Reserva de Mesas
Nos grupos de botões **Visão Geral / Lista / Kanban**, filtros da **Lista** e filtros de
**Reserva de Mesas**, apareceu um botão **✏️ Editar posição**. Ativa o "modo edição" (moldura
pontilhada dourada + ícone ⠿), arrasta e solta na ordem que quiser, clica em **✅ Concluir**.
A ordem fica salva no navegador de quem está usando o painel.

## 🍱 2) Editar Cardápio — mais fácil, estilo iFood
Arrastar e soltar pra reordenar categorias e itens (além das setas ▲▼), e edição rápida de
preço clicando direto no valor da lista — sem abrir o formulário completo.

## ⚙️ 3) Configurações — menos abas, com moldura
6 seções soltas viraram **4 abas de verdade**, cada uma com moldura: 🏪 Restaurante,
🛵 Entrega/Marketing/Atendimento, 🎨 Aparência & Operação (Splash Screen + Impressão + Painel
e Fluxo de Trabalho, juntas porque cuidam do mesmo tipo de coisa), ⚠️ Zona de Perigo. A última
aba aberta fica lembrada.

## 🚚 4) Previsão de entrega real — na nota, no caixa e na tela do motoboy
- **Nota/cupom**: a via de delivery/expedição também mostra "Previsão cliente: HH:MM–HH:MM".
- **Caixa** (Gerenciar Pedidos): cada pedido mostra a previsão real prometida ao cliente, além
  da previsão de saída da cozinha. Também aparece como selo no Kanban.
- **Delivery** (tela do motoboy): mostra a previsão de entrega prometida ao cliente.

## 📌 5) Categorias fixas no cardápio do cliente
Já estava implementado (v52) — barra de categorias fica fixa no topo, com indicador animado e
detecção automática da categoria visível. Conferido e funcionando, nada precisou mudar.

## 💬 6) Conversas com Clientes — caixa de mensagem estilo WhatsApp + mensagem de voz
- Caixa de mensagens bem maior (320px), balões arredondados no estilo WhatsApp.
- Campo de resposta virou uma **textarea que cresce sozinha** enquanto digita (até 120px de
  altura) — Enter envia, Shift+Enter quebra linha, facilitando escrever mensagens mais longas.
- **Mensagem de voz**: botão de microfone grava (fica vermelho pulsando, mostra o tempo),
  clica de novo pra parar — o áudio é enviado automaticamente e toca com um player, tanto no
  painel quanto na tela do cliente.
- Botão **🗑️ Apagar todas as conversas** no topo do card (pede confirmação, apaga o histórico
  inteiro — ação sem volta).

## 🛵 7) Motoboys — removido de QR Code & Links, tudo junto na página Motoboys
O item "Motoboys" saiu da lista de QR Code & Links (era um QR genérico sem o código do
pedido, que não funcionava sozinho). No lugar, a página **Motoboys** agora tem um card
explicando que o link de rastreio é gerado automaticamente a cada entrega — assim que você
marca "🛵 Saiu para Entrega" — ficando tudo relacionado a motoboy numa página só.

## 🔔 8) Notificações Push — upload de imagem + mensagem pré-determinada
- **Upload de imagem**: além de colar um link, agora dá pra enviar uma foto do computador/
  celular direto (botão "📤 Enviar foto", com preview em miniatura).
- **Mensagem pré-determinada**: salva o título + mensagem + imagem atuais como um modelo
  nomeado ("💾 Salvar modelo"), escolhe um modelo salvo numa lista pra preencher tudo de novo
  na hora de mandar outra campanha parecida, ou exclui um modelo que não usa mais.
- 🐛 **Bug corrigido de brinde**: a foto do motoboy (página Motoboys) chamava uma função de
  upload que nunca tinha sido criada — o upload ficava travado em "Enviando..." pra sempre.
  Corrigido junto (a mesma função nova é usada nos dois lugares agora).

---

## Arquivos alterados
- `public/painel.html` — reordenação de botões, Cardápio estilo iFood, abas de Configurações,
  previsão real de entrega, chat estilo WhatsApp + voz, remoção do Motoboys de QR Code &
  Links + card explicativo na página Motoboys, upload de imagem e modelos pra Push.
- `server.js` — previsão real de entrega na via delivery/expedição e no endpoint do motoboy,
  suporte a mensagem de voz e apagar-todas-as-conversas no atendimento, endpoints de modelos
  de mensagem pré-determinada pra Push.
- `public/entregador.html` — mostra a previsão de entrega prometida ao cliente.
- `public/index.html` — toca mensagens de voz recebidas do atendente no chat do cliente.

## Testes feitos antes de fechar
- `node --check` em `server.js`: sem erro.
- Checagem de sintaxe de todos os `<script>` de `painel.html`, `index.html` e
  `entregador.html`: sem erro.
- Balanceamento de `<div>`/`</div>` no `painel.html` inteiro (887/887).
- Conferido que todas as novas funções chamadas nos botões (apagarTodasConversas,
  toggleVoiceRecording, aplicarPushPreset, salvarPushPreset, excluirPushPreset,
  uploadPushImage, uploadImageAndGetUrl etc.) estão de fato definidas uma única vez cada, e
  que os IDs de elementos referenciados existem no HTML.

## Observação sobre permissões do navegador
A gravação de voz usa o microfone do computador/celular de quem está no painel — na primeira
vez, o navegador vai pedir permissão de microfone. Sem permitir, aparece um aviso claro em vez
de travar.
