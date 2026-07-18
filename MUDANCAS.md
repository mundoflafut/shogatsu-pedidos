# Shogatsu — CEP automático, endereço separado, frases de avaliação

## 📍 CEP preenche o endereço sozinho
Ao digitar o CEP e sair do campo, o site busca automaticamente **Rua** e
**Bairro** (usando a mesma base de CEPs dos Correios que já era usada por
trás dos panos). O cliente só confirma o número da casa. Se o CEP não for
encontrado, avisa claramente e deixa preencher manualmente — nunca trava.

## 🏠 Rua e Número agora são campos separados
Antes era um campo só ("Rua e número"). Agora:
- **Rua** (preenchida automaticamente pelo CEP)
- **Número** (sempre digitado pelo cliente, campo curto do lado do Complemento)

O endereço final enviado pro pedido continua completo, só que montado a
partir dos campos certos — inclusive quando vem do GPS (usar minha
localização), que também já retorna o número separado agora.

## ⭐ Frases prontas na avaliação
Configurações → Dados do Restaurante → agora tem uma lista de **frases
prontas** que você cadastra (ex: "Comida deliciosa! 😋", "Entrega rápida!
🛵"). Elas aparecem como botõezinhos na tela de avaliação do cliente — ele
toca e a frase é adicionada ao comentário na hora, sem precisar digitar
nada (mas ainda pode escrever livremente também). Vem com 5 frases de
exemplo já cadastradas, e você adiciona/remove quantas quiser.

## ✅ Confirmado: avaliação abre sozinha
O botão "Recebi meu pedido" já abria a avaliação automaticamente — conferi
de novo e está correto, sem precisar de nenhum clique extra.

## 🐛 Bugs
Nova varredura no fluxo de endereço/checkout depois da mudança de campos —
sem bugs novos encontrados; os pontos de atenção (pré-preenchimento do
último endereço salvo, mensagem do WhatsApp, validação de campos
obrigatórios) foram conferidos e continuam funcionando com os campos
separados.

## Como aplicar
`server.js`, `public/index.html` e `public/painel.html` — os três
mudaram. Substitua e dê push.
