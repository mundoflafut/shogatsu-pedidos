# Shogatsu — v50 — Notas desta versão

## 1. 📠 Impressoras por Estação — opção de desativar
Cada via agora tem um checkbox **"Ativa"** em Configurações → 📠 Impressoras por Estação.
Desligando, o sistema pula essa impressão de propósito (sem tentar imprimir, sem erro nenhum) —
útil quando uma impressora quebra ou fica fora do ar por um tempo, sem precisar excluir a via
nem desmarcar ela de todos os itens do cardápio que a usam. Botão "🖨 Testar" fica desabilitado
enquanto a via estiver desativada, e a linha aparece esmaecida com um aviso vermelho.

## 2. 🐛 Bug corrigido — impressão automática com erro persistente
Achei a causa raiz: a **extensão do Chrome** (`chrome-extension/options.js`) só oferecia 5 vias
fixas pra configurar impressora (Padrão/Caixa/Cozinha/Sushibar/Bar) — herdadas de antes da v49
ter tornado as estações dinâmicas. Qualquer via nova (Delivery, Expedição, ou qualquer via
customizada criada depois) **nunca tinha como ganhar uma impressora configurada ali**, então
sempre dava o erro "Nenhuma impressora configurada pra via X", sem jeito de corrigir pela
extensão — um erro persistente de verdade. Reescrevi a tela de opções da extensão pra aceitar
qualquer via (digita a chave, escolhe a impressora, adiciona quantas linhas quiser) — corrige
o problema agora e continua funcionando pra vias que forem criadas no futuro, sem precisar
atualizar a extensão de novo.

## 3. 📷 Upload de foto no cadastro de motoboy
Formulário de novo motoboy (página Motoboys) ganhou campo de foto com upload direto do
celular/computador (mesma compressão automática já usada nas outras fotos do sistema). Motoboys
já cadastrados também podem trocar a foto (botão 📷 na lista), e a foto aparece como avatar
redondo na listagem.

## 4. Ferramentas duplicadas — consolidação
Encontrei `admin-cardapio.html`: um protótipo em React **sem nenhuma chamada real de API** (todo
salvamento era só um comentário "// TODO API: ...") — duplicava exatamente o "Editar Cardápio"
que já funciona de verdade dentro do painel principal. Virou um redirecionamento automático pro
painel (`/painel.html#cardapio`), pra ninguém correr o risco de editar cardápio numa tela que
parece salvar mas não salva nada de verdade.

Conferi as outras páginas "extras" do sistema e elas **não são duplicadas** — têm propósito e
fonte de dados diferentes:
- `cardapio-rodizio.html` — mostra o que está liberado HOJE no cardápio real de delivery
  (usa `cfg.menu` + campo `days` dos itens).
- `cardapio-rodizio-popular.html` — página de marketing/institucional do Rodízio Popular, com
  preços e fotos próprias (usa `cfg.rodizioPopular`, editável em Editar Cardápio Popular).
- `pedir-agora.html` — atalho simples pra pedir direto pelo WhatsApp, sem carrinho.
- `entregador.html` — rastreio/atualização de localização pro motoboy durante uma entrega.

## O que ainda ficou de fora
- **Ajuste geral de mobile em todo o app** (cliente e admin/master) — pedido muito amplo pra
  cobrir com segurança numa única passada; já existe bastante trabalho de responsividade
  acumulado nas versões anteriores. Se puder listar telas específicas com problema no celular,
  eu foco exatamente nelas.
- Não encontrei um bug adicional de "checkbox que não salva a preferência" além do que o item 1
  já resolve — testei o modal 📠 Estações de Impressão a fundo (inclusive o proteção
  `pointer-events:none` no checkbox, que já existia) e ele salva corretamente. Se tinha um
  checkbox específico diferente em mente, me diga qual tela que eu vou direto nele.

## O que testar antes de publicar
1. Desativar uma via em Impressoras por Estação, fazer um pedido de teste com item marcado pra
   essa via, e conferir que não sai nada nem dá erro — depois reativar e conferir que volta a
   funcionar.
2. Reinstalar/atualizar a extensão do Chrome (recarregar em `chrome://extensions`), abrir as
   opções, e configurar uma via nova (ex: `delivery`) que antes não aparecia.
3. Cadastrar um motoboy novo com foto, e trocar a foto de um já existente.
4. Acessar `/admin-cardapio.html` direto e confirmar que redireciona pro painel.
