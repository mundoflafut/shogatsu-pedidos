// ═══════════════════════════════════════════════════════════
// SHOGATSU v44 — ATUALIZAÇÃO AUTOMÁTICA DE VERSÃO
// ═══════════════════════════════════════════════════════════
// Objetivo: depois de um novo deploy no GitHub/Render, todo cliente aberto (celular, tablet,
// desktop, PWA instalado) recebe a versão nova sozinho — sem precisar limpar cache, limpar
// histórico nem reinstalar nada.
//
// Como funciona:
//   1. Ao carregar a página, guarda a versão atual (vinda de GET /api/version).
//   2. A cada 30s, pergunta de novo pro servidor qual é a versão publicada.
//   3. Se mudou, mostra um aviso curto ("Atualizando aplicativo..."), manda o Service Worker
//      buscar a versão nova dele mesmo, espera ele assumir e recarrega a página sozinha.
//
// O que NUNCA é tocado por este script: cookies, localStorage, sessionStorage, IndexedDB —
// ou seja, login, carrinho, pedidos salvos e preferências do cliente continuam intactos.
// O único cache mexido é o de arquivos estáticos do Service Worker (public/sw.js já cuida de
// abrir o cache novo e apagar só os antigos sozinho, no evento "activate").
(function () {
  const CHECK_INTERVAL_MS = 30000;
  const STORAGE_KEY_SEEN = null; // nunca gravamos nada em storage — comparação fica só em memória
  let currentVersion = null;
  let updating = false;

  function showUpdatingOverlay() {
    if (document.getElementById('shogatsu-update-overlay')) return;
    const el = document.createElement('div');
    el.id = 'shogatsu-update-overlay';
    el.setAttribute('role', 'status');
    el.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999999',
      'background:rgba(10,10,12,.92)', 'display:flex', 'align-items:center', 'justify-content:center',
      'flex-direction:column', 'gap:14px', 'color:#f5f1ea', 'font-family:system-ui,-apple-system,sans-serif',
      'text-align:center', 'padding:24px'
    ].join(';');
    el.innerHTML = `
      <div style="width:34px;height:34px;border:3px solid rgba(245,241,234,.25);border-top-color:#e3bd6a;border-radius:50%;animation:shogatsu-spin 0.8s linear infinite;"></div>
      <div style="font-size:15px;font-weight:600;">Atualizando aplicativo…</div>
      <div style="font-size:12px;opacity:.7;max-width:280px;">Uma nova versão foi publicada. Isso leva só alguns segundos — seus dados e seu login continuam salvos.</div>
      <style>@keyframes shogatsu-spin{to{transform:rotate(360deg);}}</style>
    `;
    document.body.appendChild(el);
  }

  async function fetchVersion() {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.version ? data.version : null;
    } catch (e) { return null; } // offline ou servidor fora do ar — só tenta de novo no próximo ciclo
  }

  async function applyUpdate() {
    if (updating) return;
    updating = true;
    showUpdatingOverlay();
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update().catch(() => {});
          // Se já existe um SW novo esperando (waiting), pede pra ele assumir imediatamente —
          // o próprio public/sw.js já chama skipWaiting()/clients.claim() nos eventos dele.
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } catch (e) { /* segue pro reload mesmo assim — o servidor já está servindo a versão nova */ }
    // Pequeno atraso só pra o aviso não "piscar" rápido demais em conexões muito velozes.
    setTimeout(() => { window.location.reload(); }, 700);
  }

  async function checkForUpdate() {
    if (updating) return;
    const v = await fetchVersion();
    if (!v) return;
    if (currentVersion === null) { currentVersion = v; return; } // primeira leitura só define a base
    if (v !== currentVersion) applyUpdate();
  }

  // Primeira checagem logo na carga da página, depois a cada 30s.
  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);

  // Também revalida ao voltar pra aba — pega quem deixou o painel aberto em segundo plano
  // por horas e só volta a olhar de vez em quando.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
})();
