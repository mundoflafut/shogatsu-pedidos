# v69-a — Configurações reorganizada (accordion + busca + favoritos)

Esta entrega segue **só** o escopo aprovado: reorganizar a página **⚙️ Configurações**. Nenhuma
outra página do painel, nenhuma API, nenhum arquivo de dados e nenhuma função existente foram
alterados.

## O que mudou

### Reagrupamento em 9 categorias (accordion)
Os mesmos 27 cards que já existiam (nenhum foi criado, removido ou teve campo alterado) agora
estão organizados em grupos que abrem/fecham, exatamente como você pediu:

- 🏪 **Restaurante** — Dados do Restaurante, Contato e Pedido Mínimo, Links Úteis
- 🎨 **Aparência** — Aparência do Cardápio, Logo da Marca, Fundo do Chat, Splash Screen
- 🕒 **Funcionamento** — Auto-Abertura / Fechamento
- 🚚 **Delivery** — Taxa de Entrega, Cupons, Fidelidade, Anúncios no Cardápio
- 💳 **Pagamentos** — PIX
- 🖨 **Impressoras** — Impressoras por Estação, Fonte de Impressão, Impressão Automática, Aviso Sonoro
- 📱 **WhatsApp & Atendimento** — Redes Sociais, Importar Contatos, SMS, Notificações Push
- 🤖 **Inteligência Artificial** — Atendimento IA e Perguntas Frequentes (Groq/OpenRouter/Gemini/Anthropic)
- ⚙️ **Sistema** — Textos de Status, Alertas, Segurança, Backup, Zona de Perigo

Cada grupo lembra se você deixou aberto ou fechado (fica salvo no navegador).

### Pesquisa inteligente
Campo "Pesquisar configuração..." no topo — digitar "PIX" abre Pagamentos, "fonte" abre os cards
com esse termo, etc. Abre automaticamente os grupos com resultado e avisa quando não encontra nada.

### ⭐ Favoritos (novo)
Cada card ganhou um botão ⭐ (junto dos que já existiam: ➖ minimizar, 📌 fixar, ⚙️ ir pro campo,
👁️ ocultar, ✖ fechar — nenhum desses foi alterado). Marcar como favorito move o card pra uma
seção "⭐ Favoritos" fixada no topo da página; desmarcar devolve ele pro lugar de origem.

### Grade responsiva corrigida (bug real, corrigido)
Antes, os cards ficavam sempre em 2 colunas fixas, mesmo no celular — sendo espremidos numa tela
pequena. Agora: **3 colunas** em telas grandes (>1200px), **2 colunas** em notebook/tablet, **1
coluna** no celular (<620px), do jeito que o padrão original pedia.

## Verificações de segurança feitas antes de aplicar
- Extração programática dos 27 cards originais (não foram retdigitados — apenas movidos), com
  checagem automática de que nenhum `id`, `onclick`, `onchange` ou `oninput` foi perdido
- Contagem de `<div>`/`</div>` balanceada no arquivo inteiro (942/942)
- Sintaxe JavaScript validada
- Confirmado que a Zona de Perigo continua restrita a usuários `master`
- Confirmado que nenhuma outra página do painel (Pedidos, Cardápio, Mensagens, Avaliações etc.)
  foi tocada — comparado card por card com a versão anterior
- Testado rodando o servidor local: todas as 9 seções, a busca, os favoritos e o atalho de
  impressora responderam corretamente

## O que NÃO mudou (de propósito)
Todas as demais páginas do painel (Pedidos, Reservas, Mensagens, Motoboys, Cardápio, Custos, QR
Code & Links, Relatórios, Avaliações, Usuários), todas as 73 rotas de API, o cardápio do cliente,
o Chat Express, a impressão, o WhatsApp/SMS, o sistema de login e todos os dados salvos.

## Próximos passos (aguardando aprovação, como combinado)
- v69-b: aplicar o mesmo tratamento de "menos rolagem" nas páginas mais longas (Pedidos, Cardápio)
- v69-c: polimento visual geral
