# Shogatsu — v55 — Notas desta versão

## 1. 👤 Tela "Minha Conta" com novo visual
A tela de conta do cliente (dentro do `index.html`, aberta pelo ícone de perfil) ganhou um
visual novo — cartão de perfil com avatar, badge "👑 Cliente Gold", grid de estatísticas e
botões de navegação em gradiente — baseado no modelo enviado. **Todos os dados são reais**,
vindos do sistema já existente (nada foi inventado nem trocado por texto fixo):

- Nome e telefone → conta logada de verdade (`customer.name`/`customer.phone`)
- Pontos → saldo real e atualizado na hora, buscado do mesmo `/api/loyalty` que o checkout
  já usa (mostra o valor salvo localmente primeiro, e corrige na tela assim que a resposta do
  servidor chega, sem a pessoa perceber nenhum "pulo" chamativo)
- Pedidos → `customer.orderCount`, o mesmo contador de sempre
- Badge "👑 Cliente Gold" → aparece **só quando o cliente já tem pontos suficientes pra
  trocar por desconto agora** (usa o mesmo limite configurado em Fidelidade) — não é um nível
  fixo nem decorativo, reflete a fidelidade de verdade
- Botões "Meus Pedidos", "Editar Cadastro", "Notificações" → exatamente as mesmas funções e
  fluxos de sempre (senha de 4 dígitos, histórico, edição de cadastro/endereço, push), só
  com aparência nova

### Novidade: painel "❤️ Fidelidade" de verdade
Antes só existia uma linha de texto solta ("⭐ Você tem X pontos"). Agora é uma seção própria
com:
- Saldo de pontos em destaque
- Barra de progresso até o próximo resgate
- Quanto falta pra próxima troca por desconto, e o valor real em R$
- Quantos pontos o cliente ganha por real gasto (se configurado)

Tudo calculado a partir das mesmas configurações de Fidelidade (pontos por real, pontos pro
resgate, valor do resgate) já usadas no checkout — sem número inventado.

## 2. 🖨️ Impressoras — múltiplas impressoras (USB + Rede 1 + Rede 2) num único agente
Antes, o Agente Local (`print-agent/`) só suportava **uma impressora por agente/computador**
— pra ter USB + duas de rede, seria preciso três computadores rodando três agentes
separados. Agora um único agente aceita uma **lista de impressoras** no `config.json`, cada
uma cuidando das vias (estações) que você atribuir a ela:

```json
"printers": [
  { "label": "Caixa (USB)",       "interface": "printer:NOME", "stations": ["caixa"] },
  { "label": "Cozinha (Rede 1)",  "interface": "tcp://192.168.1.51:9100", "stations": ["cozinha"] },
  { "label": "Sushibar (Rede 2)", "interface": "tcp://192.168.1.52:9100", "stations": ["sushibar","bar"] }
]
```

Com isso, um único clique em "🖨 Imprimir" (ou o pedido chegando automaticamente) já manda
cada comanda pra impressora certa, no local certo — sem precisar de mais de um computador.
Continua funcionando com o `config.json` antigo (uma impressora só) sem precisar mudar nada
pra quem já usa assim. Veja `print-agent/config.example.json` e `print-agent/README.md`
atualizados.

### 🐛 Bug corrigido: impressão em dobro
Ao testar o fluxo completo, encontramos e corrigimos um efeito colateral do fix da v54: o
Agente Local já imprime cada pedido novo sozinho, assim que ele chega (evento em tempo real
"new-order") — mas quando o painel ficava aberto com "imprimir automaticamente" ligado, ou
quando alguém clicava em "Aceitar Pedido", um SEGUNDO aviso de impressão era mandado pro
mesmo agente, duplicando a comanda. Agora só um clique manual e explícito no botão
"🖨 Imprimir/Reimprimir" gera um novo aviso — os disparos automáticos (chegada do pedido,
aceite) não duplicam mais.

## 3. 🤖 Aceite automático de pedidos (liga/desliga)
Novo interruptor na barra lateral do painel, ao lado de "Restaurante Aberto/Fechado":
**"🤖 Aceite Automático"**.

- **Desligado** (padrão): continua exatamente como sempre — cada pedido novo cai em "Novos"
  e alguém da equipe clica em "Aceitar Pedido".
- **Ligado**: todo pedido novo já nasce **aceito** (direto pra "Preparando", com número de
  ficha já atribuído), sem precisar de nenhum clique. Combinado com uma via em modo
  "🤖 Automática", isso dá impressão de ponta a ponta sem ninguém tocar em nada — e como o
  número da ficha já é atribuído na hora da criação (em vez de só no aceite manual), a
  comanda impressa automaticamente já sai com o número certo desde a primeira impressão.

O estado fica salvo nas configurações do sistema (mesmo mecanismo do toggle de loja
aberta/fechada), então persiste entre sessões e aparelhos.
