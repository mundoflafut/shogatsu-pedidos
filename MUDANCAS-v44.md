# Shogatsu — v44 — Notas desta versão

## 1. Bug corrigido: Bar e Sushibar não imprimiam
Quando um item do cardápio não tinha via de impressão própria salva, o sistema deveria herdar
a via marcada na categoria (Cozinha/Sushibar/Bar) — mas no cliente (`index.html`) e no pedido
manual do painel (`painel.html`) havia um atalho que ignorava a categoria e caía direto em
"cozinha". Corrigido nos dois lugares: `stationsForItemKey()` em `index.html` e
`addManualItemFromMenu()` em `painel.html`.

**Importante:** pra bar/sushibar realmente imprimirem, a categoria do item precisa estar
marcada com a via certa em **Editar Cardápio → categoria → Cozinha/Sushibar/Bar**. Vale a pena
conferir isso depois de publicar, categoria por categoria.

## 2. Layout das impressoras redesenhado (58mm/80mm)
Comprovante (Caixa) e vias de produção (Cozinha/Sushibar/Bar — agora com **layout idêntico**
entre as três) foram redesenhados: cabeçalho centralizado, blocos com título (CLIENTE / ITENS /
RESUMO no comprovante; HORÁRIOS / ITENS na via de produção), valores alinhados, TOTAL em
destaque, ícones só onde ajudam (🛵📞📍⏰), espaço pra observações da cozinha. Alterado em dois
lugares que precisavam ficar consistentes entre si:
- `public/painel.html` → `openBrowserTicket()` (impressão via navegador/USB comum)
- `server.js` → rota `POST /api/print` (impressão ESC/POS via rede/USB direto)

## 3. Nova aba: Editar Cardápio Popular
Em **QR Code & Links**, agora tem um painel **"✏️ Editar Cardápio Popular"** pra editar direto
pelo painel: preços por grupo de dias, observação do preço, destaques, categorias/itens, frases
que giram no topo e dados de rodapé (endereço, WhatsApp, Instagram, link de delivery, aviso de
desperdício). Isso já existia parcialmente pronto no servidor (`cfg.rodizioPopular`), mas nunca
tinha ganhado uma tela — a página pública `cardapio-rodizio-popular.html` ainda usava um bloco
de dados fixo no próprio arquivo. Agora essa página busca os dados salvos em
`GET /api/config` e só cai no conteúdo padrão do arquivo se o admin nunca tiver editado nada
(zero risco de quebrar quem já está no ar sem ter mexido nisso).

## 4. Atualização automática de versão (GitHub + Render + Supabase)
- Novo endpoint `GET /api/version`, calculado uma vez no boot do servidor (usa o commit do Git
  quando disponível — no Render vem de `RENDER_GIT_COMMIT` automaticamente — senão cai num
  identificador por horário de início).
- Novo `public/version-check.js`: verifica a versão a cada 30s (e ao voltar pra aba). Se mudou,
  mostra "Atualizando aplicativo…", pede pro Service Worker assumir a versão nova
  (`skipWaiting`/`clients.claim`, que o `sw.js` já fazia) e recarrega a página sozinha.
- **Nunca toca** em cookies, `localStorage`, `sessionStorage` ou IndexedDB — login, carrinho e
  pedidos salvos continuam intactos.
- `server.js` agora envia `Cache-Control: no-cache, no-store, must-revalidate` pra HTML e pro
  `sw.js`, e `Cache-Control: public, max-age=31536000, immutable` pro resto (ícones, manifest) —
  como o sistema é feito de páginas HTML únicas (sem `app.js`/`style.css` separados), esse é o
  ponto que garante que a versão nova sempre chega.
- `sw.js` subiu de `shogatsu-v4` pra `shogatsu-v5` (o próprio Service Worker já limpa o cache
  antigo sozinho no evento `activate`, sem mexer nos dados do cliente).
- Incluído `<script src="/version-check.js">` em `index.html` e `painel.html`.

Login, impressão, painel admin, kanban, dashboard, checkout, cardápio, integração Supabase,
deploy Render e as demais APIs não foram alterados — só foram adicionados os pontos acima.

## O que testar antes de publicar
1. Marcar categorias de bebidas/drinks como **Bar** e categorias de sushi como **Sushibar** em
   Editar Cardápio, fazer um pedido de teste com item de cada via e conferir que as 3 janelas
   de impressão abrem.
2. Conferir o layout novo das comandas numa impressora térmica real (58mm e 80mm) — o texto foi
   ajustado pra 32 colunas, mas vale confirmar visualmente.
3. Abrir QR Code & Links → Editar Cardápio Popular, editar algo e conferir que aparece em
   `/cardapio-rodizio-popular.html`.
4. Depois de um deploy novo, deixar uma aba do painel aberta e confirmar que ela mesma se
   atualiza sozinha em até 30s (aparece "Atualizando aplicativo…" e recarrega).

## 5. Notificação push com áudio/vibração reforçados
- `sw.js`: notificações push agora saem explicitamente com `silent:false` (som padrão do
  aparelho garantido) + `vibrate:[200,100,200,100,200]` (celular vibra junto com o som — o
  navegador não permite anexar um arquivo de áudio próprio numa notificação do sistema, essa é
  uma restrição da própria plataforma, não do código).
- O alerta sonoro *dentro* do site (cliente acompanhando o pedido com a aba aberta) já existia
  e continua funcionando — toca automaticamente a cada mudança de status (`playConfirmSound()`
  em `index.html`).

## 6. Alerta de instalar o app agora é contínuo
Antes, fechar o banner "Instalar o app" (✕) escondia ele **pra sempre** (uma flag fixa no
localStorage). Agora fechar só adia por 3 dias — o banner volta a aparecer depois disso, até o
cliente instalar de verdade. Assim que instala (ou o navegador detecta que já está rodando como
app), o alerta some de vez e nunca mais aparece.
