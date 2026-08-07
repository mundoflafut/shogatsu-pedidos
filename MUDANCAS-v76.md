# Shogatsu v76

## 📋 Relatório de Auditoria de Encoding (UTF-8)

Varredura completa em **todos os arquivos de texto do projeto** (HTML, JS, JSON, CSS, MD, SQL) —
`server.js`, `public/*`, `data/*.json`, `chrome-extension/*`, `print-agent/*`, raiz do projeto.

Testes aplicados em cada arquivo:
- Padrões clássicos de mojibake (`Ã©`, `ðŸ`, `Â`, caractere de substituição `�`/`\ufffd`)
- Decodificação UTF-8 estrita (sem fallback silencioso)
- Validade de todo JSON (`data/*.json`, `default-menu.json`)
- Presença de `<meta charset="utf-8">` em todos os HTMLs
- BOM (byte-order mark) indevido no início dos arquivos
- Caracteres de "área de uso privado" do Unicode (sintoma comum de ícone de fonte quebrado)

**Resultado: nenhum problema de encoding encontrado em nenhum arquivo.** O projeto já estava
100% em UTF-8 válido, sem mojibake, sem BOM, com todos os JSONs válidos e todos os HTMLs com
charset declarado corretamente. Nenhuma alteração foi necessária nos arquivos.

## 🎨 Editor de Cardápio modernizado (estilo iFood)

Mesma paleta de cores do sistema — só reorganização visual, sem tocar em banco de dados, API ou
lógica de negócio.

- **Cards modernos**: cantos arredondados, sombra suave, foto em destaque, hover com elevação —
  no lugar das linhas antigas.
- **Categorias em chip no topo** pra navegação rápida (além da barra lateral, que continua com
  todas as funções de sempre: criar, editar, excluir, reordenar).
- **Filtros rápidos**: 🍽️ Todos · ✅ Disponível · 🚫 Indisponível · 🏷️ Promoção · ⭐ Destaque.
  "Promoção" detecta automaticamente pratos com desconto ativo (anúncios vinculados, v75).
  "Destaque" detecta pratos com badge (global ou próprio).
- **Busca instantânea** (já existia, agora respeita os filtros ativos também).
- **Arrastar e soltar** pra reordenar categorias e pratos — testado de ponta a ponta arrastando
  de verdade. Os botões ▲/▼ continuam funcionando normalmente como alternativa.
- **Edição rápida de foto** direto no card (📷 Trocar foto), sem precisar abrir a edição completa.
- **Botão "👁 Ver como cliente"** — abre o cardápio público numa aba nova.
- **Indicadores visuais**: esgotado (cinza + tag), promoção, badges, número de opções/variações.
- **Grid responsivo**: se adapta ao tamanho da tela (desktop, tablet, celular).

### 🐛 Bug real encontrado e corrigido durante o trabalho
No celular, a barra de categorias e o painel de pratos ficavam lado a lado (layout de duas
colunas fixas) mesmo em telas pequenas, cortando o conteúdo. Corrigido: abaixo de 760px de
largura, o editor empilha em uma coluna só, com as categorias virando uma tira horizontal
rolável no topo — sem nenhuma rolagem horizontal indevida (confirmado por teste automatizado).

## Testes feitos antes de fechar (Playwright, navegador real)
✓ Todas as páginas do painel abrem sem erro de console ✓ Grid de cards renderiza corretamente
com 1 e com 10 itens ✓ Filtros rápidos funcionam ✓ Arrastar-e-soltar de itens dentro da
categoria funciona e persiste a nova ordem ✓ Arrastar-e-soltar de categorias funciona e persiste
✓ Responsividade mobile sem overflow horizontal (confirmado por medição de scrollWidth) ✓
Nenhuma funcionalidade existente foi removida.

## Arquivos alterados
- `public/painel.html` — editor de cardápio (CSS + HTML + JS dos cards, filtros, chips,
  drag-and-drop, correção de responsividade mobile).
