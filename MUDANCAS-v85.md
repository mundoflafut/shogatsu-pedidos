# Shogatsu v85 — Diagnóstico "Terminal de Impressão" + causa raiz do Sushibar não imprimir

## 🔎 O problema relatado
"Impressora do Sushibar não abre, não imprime."

## 🕵️ Auditoria feita antes de mexer em qualquer coisa
Antes de alterar código, foi feita uma varredura automatizada no projeto inteiro (v84 enviado):
sintaxe de todos os JS (`node --check`), funções duplicadas, rotas de API duplicadas, botões
(`onclick`) chamando função inexistente, imagens/scripts referenciados que não existem no disco,
e integridade de todos os JSONs em `data/`. **Nada disso apontou problema** — o projeto está
limpo (sem código morto, sem duplicidade, sem referência quebrada).

## 🎯 Causa raiz encontrada (não é bug de código — é configuração ao vivo)
Comparando `data/config.json` (config real de produção) com `print-agent/config.json` (o Agente
Local instalado no computador da loja):

- **Todas as vias** (Caixa, Cozinha, Sushibar, Bar, Delivery, Expedição) estão configuradas com
  método **"🖥 Navegador"** — nenhuma em **"🤖 Automática"**.
- No modo Navegador, a impressão só acontece se ALGUM computador estiver com a caixinha
  "🖥️ Este computador é o Terminal de Impressão" marcada **e** com o painel aberto — é ele
  quem recebe o aviso (SSE) e abre a janela de impressão sozinho.
- O Agente Local (`print-agent/config.json`) já está configurado corretamente, com a impressora
  USB cobrindo `caixa`, `cozinha` **e** `sushibar` — só que isso só é usado pelas vias em modo
  Automática. Como o Sushibar está em Navegador, o Agente Local nunca é acionado pra essa via.
- Se nenhum computador perto do Sushibar tiver a caixinha de Terminal marcada (ou o painel tiver
  sido fechado nele), a comanda do Sushibar nunca vai abrir — exatamente o sintoma relatado.

**Correção recomendada (feita direto no painel, não precisa de deploy):** Configurações → 🖨
Central de Impressão → via Sushibar → trocar método de "🖥 Navegador" para "🤖 Automática", já
que o Agente Local já está pronto pra cobrir essa via.

## 🛠️ O que essa versão corrige de fato (pra isso nunca mais passar em silêncio)
Até aqui, o painel só avisava quando uma via em modo **Automática** ficava sem nenhum Agente
Local cobrindo ela (diagnóstico da v83). Não existia nenhum aviso equivalente pro modo
**Navegador** — o admin só descobria que "nenhum terminal está marcado" quando um cliente
reclamava, igual aconteceu agora.

- **Servidor (`server.js`)**: novo rastreio `printTerminals`, no mesmo padrão de "sinal de
  vida" já usado pro Agente Local (`printAgents`/`PRINT_AGENT_TTL_MS`). Novo endpoint
  `POST /api/print-terminal/announce`, chamado pelo painel a cada ~45s enquanto a caixinha de
  Terminal estiver marcada. `GET /api/print-agent/status` agora também devolve
  `terminalsOnline` (quantos terminais estão de fato ativos agora).
- **Painel (`painel.html`)**: `updatePrintTerminalHeartbeat()` liga/desliga esse aviso
  automaticamente — ao marcar/desmarcar a caixinha, e também ao abrir o painel (se já estava
  marcada). Reaproveita o `DEVICE_SESSION_ID` que cada aba já gera sozinha.
- **Diagnóstico da Central de Impressão**: `refreshPrintAgentStatus()` agora também avisa, em
  vermelho, quando existe via ativa em modo Navegador mas **0 terminais conectados** — com o
  nome exato da(s) via(s) afetada(s) e o caminho pra corrigir (marcar um terminal, ou trocar pra
  Automática).

Nenhuma lógica de impressão em si foi alterada — é só um diagnóstico novo, aditivo, no mesmo
lugar onde já existia o aviso equivalente do Agente Local. Nada que já funcionava foi tocado.

## ✅ Testes feitos
- `node --check` em `server.js` e no bloco de script de `painel.html` — sem erro de sintaxe.
- Conferido que todos os `onclick`/`onchange` novos apontam pra função de fato definida.
- Rotas novas (`/api/print-terminal/announce`) não colidem com nenhuma rota existente.

## ⚠️ O que NÃO foi mexido (por segurança)
- Nenhum dado existente (pedidos, clientes, config) foi alterado — o problema do Sushibar é uma
  troca de método que só você faz pelo painel, com o dado ao vivo em produção; não está no
  código que sobe no deploy.
- Nenhuma função de impressão existente (Automática, Navegador, Rede, USB) foi reescrita.
- Se depois de trocar o Sushibar pra Automática ainda não imprimir, a Central de Impressão vai
  mostrar exatamente qual diagnóstico se aplica (agente offline, via não coberta por nenhuma
  impressora, ou terminal não conectado) em vez de falhar em silêncio.
