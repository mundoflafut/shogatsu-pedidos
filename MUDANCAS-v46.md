# Shogatsu — v46 — Notas desta versão

## 🐛 Impressora — nova opção "Automática" (zero clique, zero confirmação)

**O que estava acontecendo:** o método "Navegador" pede sempre a caixa de diálogo de impressão
do sistema. Isso NÃO é um bug do código — é uma trava de segurança de qualquer navegador (Chrome,
Firefox, Edge, Safari): nenhum site, de nenhum sistema, consegue mandar algo pra impressora sem
abrir alguma janela/confirmação. É assim no Shogatsu, no iFood, no Anota AI, em qualquer um.

**A solução real:** novo método de impressão **"🤖 Automática"** em Configurações → Impressoras.
Quando uma via está configurada assim:
- O painel **nunca abre janela nenhuma** pra essa via (nem um popup em branco por um instante).
- Quem imprime de verdade é o **Agente Local de Impressão** (pasta `print-agent/`) — um
  programinha que roda num computador dentro da loja, ligado na impressora, e imprime sozinho
  assim que o pedido chega, sem qualquer participação do navegador.

### O que mudou pra fazer isso funcionar:
- `server.js` — `POST /api/print`: via com método `automatica` responde na hora sem tentar
  imprimir nada (só entrega pro Agente Local via tempo real) e sem devolver `method:'navegador'`
  (que era o gatilho que abria janela).
- `server.js` — `POST /api/print-test`: teste de impressão numa via "Automática" agora manda um
  evento em tempo real (`print-test`) que o próprio Agente Local escuta e imprime — o botão
  "🖨 Testar" volta a funcionar de ponta a ponta, não só nas vias por rede/USB.
- `painel.html`: nova opção no seletor de método + textos explicando a diferença; loop de
  impressão (`printOrder`) tratando `automatica` à parte, sem abrir/fechar nenhuma janela.
- `print-agent/print-agent.js`: reescrito pra imprimir **por via** (Caixa/Cozinha/Sushibar/Bar,
  cada uma com o layout unificado igual ao resto do sistema — CLIENTE/ITENS/RESUMO no comprovante,
  ITENS DA <SETOR> + observações na produção), respeitando um novo campo `stations` no
  `config.json` (pra rodar mais de um agente, um por impressora, se a loja tiver mais de uma).
  Também passou a escutar o evento de teste de impressão.
- `print-agent/config.example.json` e `README.md` atualizados com o campo `stations` e a
  explicação de como combinar com o método "Automática" no painel.

### Importante — isso exige configurar o Agente Local
A opção "Automática" só imprime de verdade se o Agente Local estiver rodando. Sem ele, marcar
"Automática" só faz a via não imprimir nada (sem travar nem abrir janela — mas também sem sair
papel). Passo a passo completo em `print-agent/README.md`. Pra quem não quiser configurar o
agente agora, o método "Navegador" continua funcionando normalmente (só que sempre com a
confirmação do navegador — isso é inevitável nesse método).

## O que testar antes de publicar
1. Configurar uma via como "🤖 Automática", rodar `node print-agent.js` (pode usar
   `TEST_MODE=1` primeiro pra conferir no log sem gastar papel) e clicar em "🖨 Testar" no painel
   — deve aparecer no log do agente.
2. Fazer um pedido de teste e conferir que a via automática imprime sozinha, sem nenhuma janela
   abrindo no navegador do painel.
3. Conferir que as vias que continuam em "Navegador" seguem funcionando como antes (pedem
   confirmação, mas imprimem certinho).
