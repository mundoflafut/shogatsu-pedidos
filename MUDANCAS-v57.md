# Shogatsu — v57 — Notas desta versão (Fase 1 de 2)

Como combinado, a v57 saiu **por etapas**. Esta primeira etapa resolve de vez o Atendimento.
As próximas (botões arrastáveis em Reservas/Pedidos, edição do cardápio estilo iFood, redução de
abas em Configurações, previsão de entrega na nota/caixa/delivery, categorias fixas no cardápio
do cliente) ficam pra próxima leva, testadas em separado. Nada do que já existia foi alterado.

## 🤖 Atendimento — agora com provedores gratuitos de IA
Em **Configurações → Atendimento** dá pra escolher entre:
- **Groq** (grátis), **OpenRouter** (grátis), **Hugging Face** (grátis), **Google Gemini** (grátis)
- Anthropic/Claude (paga, como era antes)

Cada provedor tem um modelo padrão já preenchido, mas dá pra trocar o modelo manualmente se quiser
(campo "Modelo", opcional). A chave de API continua nunca voltando pro painel depois de salva —
só um "🔑 já existe uma chave cadastrada".

## ❓ Perguntas frequentes (FAQ) pré-definidas
Nova lista em Configurações → Atendimento: cadastre pergunta + resposta prontas (ex: "Vocês têm
opção vegetariana?"). Elas aparecem como botões de resposta rápida na janela de chat do cliente, e
também entram como contexto pra IA responder com mais precisão.

## 💬 Janela de chat estilo WhatsApp, com atendente humano
A antiga caixinha de pergunta única virou uma conversa de verdade:
- Balões de mensagem, indo e voltando, com histórico salvo (o cliente pode fechar e reabrir o
  cardápio que a conversa continua de onde parou).
- Botão **"Falar com atendente"** a qualquer momento — a conversa passa a aparecer em
  **Configurações → Conversas com Clientes**, pro caixa responder na hora (atualiza sozinho a
  cada poucos segundos, dos dois lados).
- Se a IA não estiver configurada ou ativada, a conversa já começa direto em modo atendente —
  ninguém fica sem resposta.
- **O ícone de dúvida só aparece pro cliente quando a IA está ativada** (confirmado testando com
  IA desligada: a opção some do menu "Fale com a gente").

## 📍 QR Code & Links
"Painel do Entregador" renomeado pra **"Motoboys"**, pra ficar consistente com o resto do sistema
(o item do menu lateral do painel já se chama assim).

---

## Arquivos alterados
- `server.js` — `chamarIA` agora despacha pra 5 provedores diferentes; novo arquivo de dados
  `data/atendimento.json` (conversas); rotas novas `/api/atendimento/*` e
  `/api/admin/atendimento/*`; `/api/ia/settings` ganhou `provider`, `modelo` e `faq`.
- `public/painel.html` — card de Atendimento reformulado (provedor/modelo/FAQ) + novo card
  "Conversas com Clientes"; renomeação em QR Code & Links.
- `public/index.html` — drawer de dúvida virou janela de chat completa.

## Testes feitos antes de fechar (rodando o servidor de verdade, não só sintaxe)
- Conversa iniciando em modo atendente quando IA está desligada (comportamento correto: ninguém
  fica esperando IA que não vai responder).
- Chave de API salva, nunca reaparece em `/api/config` nem em `/api/ia/settings` (só `hasKey`).
- FAQ aparece no `/api/config` público (pro cliente ver os botões), sem vazar chave/provedor/modelo.
- Chave inválida: degrada bem, sem travar, e sugere "Falar com atendente" — nunca deixa o cliente
  sem caminho.
- Caixa vendo a conversa pendente, respondendo, e o cliente recebendo via polling — ponta a ponta.
- `node --check` no `server.js` e checagem de sintaxe de todos os `<script>` de `index.html` e
  `painel.html`: sem erro.
- Dados de teste (chave falsa, FAQ de teste, conversas de teste) removidos antes de gerar o zip.
