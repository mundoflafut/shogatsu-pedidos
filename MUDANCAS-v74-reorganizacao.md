# Shogatsu v74 — Auditoria e Reorganização Inteligente do Painel (Fase 1)

Escopo desta rodada: auditoria completa + duas centrais novas (Impressão e Mensagens), 100%
estrutural/visual — nenhuma regra de negócio, API, autenticação, permissão ou fluxo de pedido
foi alterada. Cada etapa foi testada de verdade (Playwright, navegador real) antes de fechar.

## 🔎 Auditoria realizada
- Ícones quebrados (❓ ou ausentes): **nenhum encontrado**.
- Funções JavaScript duplicadas: **nenhuma encontrada**.
- IDs duplicados de verdade: **nenhum** (um alarme falso do meu primeiro grep — `data-reorder-id`
  contém a substring `id="..."` por coincidência de regex — descartado depois de checar à mão).
- **Bug crítico real encontrado no processo**: já corrigido na v73.1 (comentário HTML quebrado
  que apagava a página inteira de Relatórios) — mantido corrigido aqui.

## 🖨 Central de Impressão (página própria, antes era um acordeão dentro de Configurações)
Consolidei ali, sem duplicar:
- 📠 Impressoras por Estação (com prioridade ▲/▼ da v73.1)
- 🔤 Fonte de Impressão
- 🔔 Impressão Automática
- 🎋 Aviso Sonoro do Cliente

Item de menu próprio "🖨 Central de Impressão", com botão de salvar independente do "Salvar
Tudo" de Configurações. "Estação de Impressão" por prato continua só na edição do Cardápio, como
pedido — não existe mais em nenhum outro lugar.

## 💬 Central de Mensagens (abas dentro da própria página Mensagens — sem criar item de menu novo)
A página "Mensagens" agora tem duas abas:
- **💬 Conversas** — o inbox ao vivo (Chat Express), sem nenhuma alteração.
- **📣 Central de Mensagens** — consolidei ali, sem duplicar, o que antes estava espalhado em 3
  acordeões diferentes de Configurações:
  - 📱 Redes Sociais — Pedido Direto
  - 📲 Popup de Instalação do App
  - 📥 Importar Contatos Externos
  - 📢 SMS para Clientes (com "Enviar Promoção por SMS")
  - 🔔 Notificações Push (com "Enviar Notificação Push")
  - 🤖 Atendimento — IA e Perguntas Frequentes
  - 🎟️ Cupons de Desconto
  - 📣 Anúncios no Cardápio

Botão de salvar próprio ("💾 Salvar Central de Mensagens"), independente do "Salvar Tudo".

## Configurações — o que sobrou (mais enxuto)
Restaram só os acordeões que são mesmo "configuração de loja": 🏪 Restaurante, 🎨 Aparência,
🕒 Funcionamento, 🚚 Delivery, 💳 Pagamentos, ⚙️ Sistema (+ ⭐ Favoritos, dinâmico). O atalho de
busca "🖨 Impressoras" virou "🖨 Central de Impressão" e leva direto pra página nova.

## Testes feitos antes de fechar (Playwright, navegador real, login incluso)
✓ Todas as 11 páginas do menu abrem sem erro de console (login, Pedidos, Reservas, Mensagens,
Motoboys, Cardápio, Custos, QR Code & Links, Relatórios, Central de Impressão, Configurações,
Avaliações) ✓ Central de Impressão: reordenar via ▲/▼ funciona e **persiste depois de recarregar
a página** ✓ "Salvar Tudo" em Configurações continua funcionando sem os campos que saíram de lá
✓ Central de Mensagens: os 8 cards aparecem certos, salva sem erro, alternar de volta pra
Conversas não quebra nada ✓ Nenhuma funcionalidade existente foi removida — só reorganizada.

## O que ainda falta (próximas fases, combinadas com o usuário)
- Design System / padronização visual global (espaçamentos, tipografia, botões, tabelas, modais
  — hoje já são consistentes na maior parte, mas não foi feita uma varredura formal).
- Reorganização do Painel de Pedidos (hierarquia visual, ações rápidas).
- Passo dedicado de acessibilidade (foco de teclado, contraste) e performance (lazy loading,
  cache).

## Arquivos alterados
- `public/painel.html` — Central de Impressão e Central de Mensagens extraídas de Configurações
  sem duplicação; `loadSettings()`/`saveAllSettings()` enxutos (só o que realmente é
  "configuração de loja"); novas funções `loadPrinterCentral()`/`savePrinterCentral()`/
  `loadMensagensCentral()`/`saveMensagensCentral()`/`switchMensagensTab()`.
