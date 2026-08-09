# Shogatsu v82 — upload de novos sons + checklist de diagnóstico (impressão/push)

## 🎋 Aviso Sonoro do Cliente — upload de novos sons (feito)
Antes só existiam 5 sons prontos, todos sintetizados por código (Clássico, Suave, Nota Dupla,
Sino, Oriental) — não dava pra usar um som próprio.

Agora, em **Configurações → 🖨 Central de Impressão → 🎋 Aviso Sonoro do Cliente**, tem um botão
**📤 Escolher arquivo de áudio** (MP3, WAV, OGG ou M4A, até 6MB — reaproveita a mesma rota de
upload que já existia pra fotos/vídeos/áudio de voz). Cada som enviado:
- aparece numa lista logo abaixo, com botão ▶ pra ouvir e 🗑 pra excluir;
- entra automaticamente no menu "Estilo do som" como "🎤 <nome> (personalizado)";
- fica salvo assim que o upload termina (não depende de clicar em "Salvar" depois).

O app do cliente (`index.html`) e o painel (`painel.html`) tocam o arquivo de verdade (via
`<audio>`) quando o som escolhido é um personalizado — se ele for excluído depois, cai pro
Clássico sozinho, sem ficar mudo.

**Arquivos alterados:** `server.js` (novo campo `cfg.customCustomerAlertSounds`), `public/painel.html`
(UI de upload/lista + funções `uploadCustomerAlertSound`, `deleteCustomerAlertSound`,
`renderCustomerSoundCustomList`, `populateCustomerAlertSoundOptions`, `playCustomerAlertSoundByKind`),
`public/index.html` (`playConfirmSound` agora toca arquivo real quando `custom:<id>`).

**Testes feitos:** `node --check` em `server.js` e no JS inline de `painel.html`/`index.html` —
sem erro de sintaxe.

---

## 🖨️ Sushibar não imprime / impressão automática não funciona nem no teste
Não consegui reproduzir isso sem acesso ao computador da loja — o agente local
(`print-agent/`) roda dentro da rede do restaurante, então o log que importa
(`print-agent.log`, na pasta `print-agent/`) só existe lá. Antes de eu conseguir apontar a
causa, preciso desses dados (pode mandar aqui, sem usuário/senha):

1. As últimas ~30 linhas de `print-agent/print-agent.log` (mostra se o agente conectou,
   se o login funcionou, e se ele chegou a receber o evento de teste).
2. O `print-agent/config.json` **sem a senha** (só quero ver `serverUrl`, `printers` — labels,
   `interface`, `stations`).
3. Em Configurações → 📠 Impressoras por Estação: a via do sushibar está mesmo como
   **🤖 Automática** (não "Navegador")? E está **ativada** (não desligada)?
4. O agente está rodando nesse exato momento (janela/terminal aberto, ou serviço via PM2)?

Pontos que já sei que o código cobre (então não é aí que deve estar o problema, mas ajuda
descartar): a rota `/api/print-test` já delega corretamente pro agente quando o método é
"automatica" (`server.js` ~2925-2955); o agente só imprime uma via se ela estiver na lista
`stations` de alguma impressora do `config.json` dele (`print-agent.js` ~239); se a via do
sushibar estiver `"stations"` de uma impressora com `interface` errado/offline, o teste falha
silenciosamente pro painel (só aparece no `print-agent.log`, não na tela).

Assim que eu tiver o log e o config.json (sem senha), consigo dizer exatamente onde está
travando — se é login, conexão, via não coberta por nenhuma impressora, ou a impressora física
mesmo não respondendo no IP/porta configurado.

## 🔔 Notificação push não chega no celular
Também preciso de mais dado pra achar a causa certa — push falhando só no celular (e
funcionando no PC) geralmente é uma destas quatro coisas:

1. **Permissão de notificação do site foi negada** nesse celular (configuração do
   navegador/Android, não do app) — dá pra conferir em Configurações → 🔔 Notificações Push →
   a lista de aparelhos: o celular aparece cadastrado lá?
2. **Android com economia de bateria agressiva** (comum em Xiaomi/Samsung/etc) matando o
   navegador em segundo plano — a notificação chega no servidor mas o sistema operacional do
   celular descarta antes de mostrar.
3. **PWA não instalado** (só aberto no navegador, sem "Adicionar à tela inicial") — em alguns
   Androids o push é bem menos confiável assim.
4. Inscrição push expirada/inválida nesse aparelho (acontece se o site ficou muito tempo sem
   abrir, ou depois de limpar dados do navegador) — nesse caso o aparelho continua na lista mas
   os envios pra ele falham silenciosamente no servidor.

Se puder confirmar: o celular aparece na lista de Configurações → 🔔 Notificações Push? E é
Android ou iPhone — instalado como app (ícone na tela) ou só aberto no navegador? Com isso eu
já consigo restringir bem qual dos quatro é.
