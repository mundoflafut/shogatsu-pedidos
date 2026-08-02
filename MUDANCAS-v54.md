# Shogatsu — v54 — Notas desta versão

## 1. 📲 Sistema inteiro agora é PWA (instalável), não só a tela de pedidos
Até a v53, só o `index.html` (tela de pedido do cliente) era um PWA completo — tinha
manifesto ligado, ícones, e virava um "app" de verdade quando instalado no celular/PC. O
`painel.html` registrava o service worker mas nunca tinha manifesto próprio (não dava pra
instalar). As demais páginas (rastreio de entrega, cardápios de rodízio, avaliação,
divulgação, "peça agora") não tinham nada de PWA.

**O que mudou:** todas as páginas do sistema (exceto `admin-cardapio.html`, que é só um
redirecionamento automático pro painel — não faz sentido "instalar" uma página que nunca
fica na tela) agora são instaláveis, cada uma com seu próprio manifesto
(`manifest-*.json`), nome e ícone, abrindo direto naquela página quando instalada (em vez
de sempre cair em "/"):

| Página | Manifesto | Abre em |
|---|---|---|
| `index.html` | `manifest.json` (já existia) | `/` |
| `painel.html` | `manifest-painel.json` **(novo)** | `/painel.html` |
| `entregador.html` | `manifest-entregador.json` | `/entregador.html` |
| `cardapio-rodizio.html` | `manifest-rodizio.json` | `/cardapio-rodizio.html` |
| `cardapio-rodizio-popular.html` | `manifest-rodizio-popular.json` | `/cardapio-rodizio-popular.html` |
| `avaliar-rodizio.html` | `manifest-avaliar-rodizio.json` | `/avaliar-rodizio.html` |
| `divulgacao-rodizio.html` | `manifest-divulgacao-rodizio.json` | `/divulgacao-rodizio.html` |
| `pedir-agora.html` | `manifest-pedir-agora.json` | `/pedir-agora.html` |

Também **corrigido um bug** no `painel.html`: ele nunca chamava
`navigator.serviceWorker.register(...)` de verdade — só funcionava "de carona" se alguém
tivesse aberto o `index.html` antes no mesmo navegador. Agora registra o próprio service
worker, então abrir o painel direto (sem passar pelo site do cliente antes) já funciona
como PWA desde o primeiro acesso.

O `sw.js` (service worker) subiu de cache `v5` para `v6`, incluindo os novos manifestos na
lista de arquivos pré-carregados — isso também já dispara a atualização automática pra
quem já tinha o app instalado antes dessa versão.

## 2. 🖨️ Impressão sob demanda agora funciona de verdade entre celular e PC
Bug encontrado: clicar em "🖨 Imprimir" (pra reimprimir uma via, ou imprimir de novo) numa
via configurada como **Automática** sempre mostrava a mensagem "Enviado pro Agente Local",
mas isso não era verdade — o servidor só respondia `delegated:true` pro navegador, sem
avisar o Agente Local de nenhum jeito. Só a impressão automática do pedido **assim que ele
chega** (`new-order`) e o teste de impressão (`print-test`) realmente chegavam no Agente
Local; qualquer clique manual depois disso não tinha efeito nenhum na impressora física,
independente de ter sido feito no celular ou no PC.

**O que mudou:**
- `server.js`: ao clicar em "Imprimir" numa via Automática, o servidor agora também
  transmite um evento `print-order` (por SSE, o mesmo canal em tempo real que já existe)
  pra todos os clientes conectados.
- `print-agent/print-agent.js`: o Agente Local (o programinha que roda no computador
  ligado na impressora física, dentro da loja) passou a escutar esse evento novo e imprime
  na hora, só a via pedida — sem precisar reimprimir as outras vias desse pedido de novo.

Na prática: agora **qualquer aparelho logado no painel — celular ou computador —** pode
pedir pra imprimir/reimprimir uma via, e é o Agente Local rodando no PC ligado na
impressora térmica que executa de verdade. O servidor (na nuvem) é só o intermediário que
repassa o pedido em tempo real; continua sendo fisicamente impossível o servidor imprimir
sozinho (nenhum sistema do tipo, nem concorrentes, consegue isso — sempre precisa de um
programinha local ligado na impressora).

**Nada muda pra quem usa impressão pelo método "Navegador"** (sem Agente Local) — esse
fluxo continua exatamente igual, abrindo o diálogo de impressão do próprio navegador.
