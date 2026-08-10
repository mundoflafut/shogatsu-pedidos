# Shogatsu v82.1 — bug real do push encontrado e corrigido + diagnóstico visível do Agente de Impressão

## 🔔 Notificação push não chega no celular (regressão da v81) — CORRIGIDO
Achei a causa: a API de notificações do navegador **proíbe** combinar `silent:true` com
`vibrate` — chamar `showNotification()` com os dois juntos lança um erro (`TypeError`) na hora,
por especificação, não é bug de um navegador só. Isso é documentado assim na própria MDN:
"the silent option is true and the vibrate option is specified" → throw.

A v81 passou a mandar `silent` de verdade (por aparelho, respeitando o checkbox "🔇 Silenciar
som do sistema neste aparelho"), mas manteve `vibrate` fixo em toda notificação — então, pra
qualquer aparelho com esse checkbox ativado, o `showNotification()` passou a explodir, e como
esse erro acontece **fora** de qualquer Promise (síncrono, dentro do próprio evento `push`),
nenhum `catch` pegava — o Service Worker falhava o evento inteiro e a notificação simplesmente
não aparecia. Antes da v81 isso não existia porque `silent` era sempre `false` (nunca colidia
com `vibrate`).

Corrigido em `public/sw.js`: agora só manda `vibrate` quando `silent` for `false` (faz sentido
mesmo — não tem por que vibrar num aparelho que o admin pediu pra não alertar).

**Se o problema era esse**: assim que essa versão publicar e o celular recarregar o app uma vez
(o Service Worker se atualiza sozinho, sem precisar reinstalar nada), as notificações devem
voltar a chegar normalmente nesse aparelho. Se **não** tinha o checkbox de silenciar ativado em
nenhum aparelho, esse não era o motivo — nesse caso ainda preciso saber: o celular aparece na
lista de Configurações → 🔔 Notificações Push? Android ou iPhone, instalado como app ou só
aberto no navegador?

## 🖨️ Diagnóstico visível do Agente Local de Impressão (novo)
Antes disso era impossível saber, olhando só pro painel, se o `print-agent.js` estava rodando
de verdade no computador da loja — a única forma era abrir o `print-agent.log` fisicamente lá.
Isso tornava "sushibar não imprime nem manual" um mistério sem pista nenhuma daqui.

Agora, em **Configurações → 🖨 Central de Impressão**, logo abaixo de "Imprimir ao Receber
Pedido", aparece um aviso ao vivo:
- ✅ **verde** — "N Agente(s) Local(is) conectado(s)", com a lista de impressoras e quais vias
  (Caixa/Cozinha/Sushibar/Bar) cada uma cobre agora mesmo;
- ❌ **vermelho** — "Nenhum Agente Local de Impressão conectado agora", deixando claro que
  NENHUMA via automática vai imprimir sozinha (nem no botão "🖨 Testar") até o programa estar
  rodando de verdade.

Como funciona: o `print-agent.js` agora avisa o servidor "estou vivo" assim que loga, e de novo
a cada ~45s (`POST /api/print-agent/announce`); o painel consulta isso a cada 30s
(`GET /api/print-agent/status`). Se o agente cair (processo morto, computador desligado, queda
de luz) sem avisar, o aviso vira ❌ sozinho em até 90s — não depende do agente "avisar que caiu"
(o que nunca ia acontecer numa queda de luz de verdade).

**Isso explica de cara** se "sushibar não imprime nem manual" é porque o agente nem está rodando
(❌ aparece pra TODAS as vias, não só sushibar) ou se é algo mais específico daquela impressora
(✅ aparece, mas listando as vias SEM incluir "Sushibar" — nesse caso é o `config.json` do
agente que não tem o sushibar em nenhuma impressora, ou tem endereço/IP errado).

**Arquivos alterados:**
- `public/sw.js` — não manda mais `vibrate` junto com `silent:true`.
- `server.js` — novo `POST /api/print-agent/announce` e `GET /api/print-agent/status`
  (rastreio em memória, expira sozinho em 90s sem novo aviso).
- `print-agent/print-agent.js` — manda o aviso de presença ao logar e a cada 45s.
- `public/painel.html` — caixa de status ao vivo em Central de Impressão, atualiza a cada 30s.

**Testes feitos:** `node --check` em `server.js`, `print-agent.js` e no JS inline de
`painel.html`/`index.html`/`sw.js` — sem erro de sintaxe. Testado ao vivo via API: status parte
"offline" sem nenhum agente anunciado → `announce` → status vira "online" com as vias certas
listadas, batendo com o que foi mandado.

## Ainda em aberto (preciso do seu retorno)
- **Sushibar sem imprimir nem manual**: depois de atualizar, olha o que aparece na caixa ✅/❌
  de Central de Impressão. Se der ✅ mas sem "Sushibar" na lista de vias cobertas, o problema
  está no `print-agent/config.json` daquele computador (a impressora do sushibar não está em
  nenhuma entrada de `printers`, ou o `interface`/IP dela está errado) — me manda esse arquivo
  sem a senha que eu confiro certinho.
- **Pedido aceito automático mas não imprime automático**: isso também deve estar ligado ao
  agente estar offline (o aviso ❌ vai deixar isso claro). Se o aviso disser ✅ e mesmo assim não
  imprimir sozinho ao chegar pedido novo, me manda as últimas linhas do `print-agent.log` logo
  depois de um pedido de teste — aí eu vejo se o agente RECEBEU o pedido (e travou na
  impressora) ou nem chegou a receber.

---

## 🔔 v82.2 — segundo bug real de push encontrado: telefone da inscrição nunca sincronizava
Achei mais uma causa concreta pra "cliente não recebe notificação push de status do pedido"
(diferente do bug do `silent`+`vibrate` da v82.1 — esse é sobre o aviso automático de status,
tipo "seu pedido está pronto"):

O aviso de status só é enviado pra quem tem, na inscrição push, um telefone **igual** ao do
pedido (`server.js`, comparação exata de string). Só que o telefone da inscrição só era
gravado no exato momento em que o cliente clicava em "Ativar Notificações" — se nesse momento
ele ainda não tinha telefone salvo (visitante na primeira visita, ativou antes de fazer login
ou de completar o cadastro), a inscrição ficava com telefone vazio **pra sempre**. Depois disso,
mesmo fazendo pedidos com telefone preenchido normalmente, o telefone da inscrição nunca era
atualizado — então "notificações ativadas" no aparelho, mas nenhum aviso de status jamais
chegava, silenciosamente, sem erro nenhum em lugar nenhum.

Corrigido em `public/index.html`: agora, toda vez que um pedido é enviado com sucesso E toda
vez que o cliente loga numa conta existente, o telefone da inscrição push (se houver uma ativa
nesse aparelho) é ressincronizado automaticamente com o telefone atual — silencioso, não
interrompe nem avisa nada se falhar.

**Isso, somado à correção do `silent`+`vibrate` da v82.1, cobre as duas causas mais prováveis**
de "cliente não recebe notificação": a v82.1 resolve pra quem tinha o som do sistema
silenciado; essa aqui resolve pra quem ativou notificações antes de ter telefone associado
(o caso mais comum, na prática, já que muita gente clica em "Ativar Notificações" assim que o
navegador pergunta, antes de preencher qualquer dado).

**Teste recomendado:** um cliente que JÁ tem notificações "ativadas" só passa a receber depois
de fazer UM pedido novo (é isso que dispara a sincronização) — pedidos antigos, feitos antes
dessa correção, não retroagem.
