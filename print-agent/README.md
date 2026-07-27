# 🖨️ Agente Local de Impressão Automática

Imprime o pedido sozinho, assim que ele chega — sem abrir navegador, sem diálogo de
impressão, sem gerar PDF. Roda como um programinha de fundo num computador **dentro
do restaurante**, ligado (por rede ou USB) na impressora térmica de cupom.

## Por que isso não roda "dentro" do site?

O site fica hospedado num servidor na nuvem (Render), que não tem nenhuma impressora
física conectada nele — não existe jeito de "o servidor" imprimir sozinho de verdade,
literalmente, em nenhum sistema do tipo (nem em concorrentes como iFood, Anota AI etc.
— todos usam esse mesmo modelo: um programinha local na loja). Este agente resolve
isso: ele se conecta no site como se fosse mais um "painel" logado, só que ao invés de
mostrar o pedido numa tela, manda direto pra impressora assim que ele chega — em tempo
real, automaticamente.

## Passo a passo

### 1. Escolha o computador
Precisa ser um computador (ou mini-PC tipo Raspberry Pi) que fique **ligado o dia
inteiro** durante o funcionamento da loja, conectado na mesma rede da impressora (ou
com a impressora ligada nele via USB).

### 2. Instale o Node.js
Baixe em [nodejs.org](https://nodejs.org) (versão 18 ou mais recente) se ainda não tiver.

### 3. Instale as dependências
Nesta pasta (`print-agent/`), abra um terminal e rode:
```bash
npm install
```

### 4. Configure
Copie `config.example.json` pra `config.json` e preencha:

- `serverUrl`: o endereço do seu site (ex: `https://shogatsu-pedidos.onrender.com`)
- `username` / `password`: um login do painel (recomendo criar um usuário próprio só
  pra isso em Configurações → Usuários, em vez de usar o do dono)
- `printerType`: `"epson"` ou `"star"` (a maioria das impressoras térmicas de cupom
  usa protocolo Epson, mesmo sendo de outra marca — se não souber, tente `epson`
  primeiro)
- `printerInterface`: como o agente encontra a impressora:
  - **Rede/Wi-Fi**: `"tcp://IP_DA_IMPRESSORA:9100"` (o IP você vê no menu de
    configuração da própria impressora, ou no roteador)
  - **USB (Windows)**: `"printer:NOME_DA_IMPRESSORA"` (o nome que aparece em
    "Dispositivos e Impressoras")
  - **USB (Linux)**: geralmente `"/dev/usb/lp0"`
- `printerWidth`: `42` pra impressora de 58mm, `48` pra 80mm (a mais comum)

### 5. Teste sem imprimir de verdade (opcional, mas recomendado)
```bash
# Windows (PowerShell):
$env:TEST_MODE="1"; node print-agent.js

# Linux/Mac:
TEST_MODE=1 node print-agent.js
```
Faça um pedido de teste no site — o agente vai mostrar no terminal exatamente o que
seria impresso, sem precisar da impressora ligada ainda. Confirme que os dados batem.

### 6. Rode de verdade
```bash
node print-agent.js
```
Deixe essa janela aberta (ou configure pra rodar em segundo plano, veja abaixo).
A partir daí, todo pedido novo imprime sozinho.

## Deixar rodando sempre, mesmo sem ninguém mexer no computador

**Windows** — mais simples usando [PM2](https://pm2.keymetrics.io/):
```bash
npm install -g pm2
pm2 start print-agent.js --name shogatsu-print
pm2 save
pm2-startup install
```

**Linux** — usando `systemd` (crie `/etc/systemd/system/shogatsu-print.service` apontando
pro `node print-agent.js` nesta pasta) ou também com PM2, igual acima.

## Se der problema

Todo evento (conexões, pedidos recebidos, sucesso ou falha de impressão) fica registrado
em `print-agent.log`, nesta mesma pasta, com data e hora. Esse arquivo é o primeiro lugar
pra olhar se algum pedido não imprimiu.

- **"Login falhou"**: confira usuário/senha no `config.json`
- **"Impressora não respondeu"**: confira se ela está ligada, no IP certo, e na mesma
  rede do computador que roda o agente
- **Conexão cai e volta sozinha**: normal, o agente reconecta automaticamente (e
  refaz login) sempre que a internet oscila ou o servidor reinicia

## O que NÃO muda

Este agente é só um "escuta e imprime" a mais. O botão "🖨 Imprimir" manual no painel
continua funcionando exatamente como antes, pra reimprimir uma via a qualquer momento
ou como alternativa se o agente estiver desligado num dia.
