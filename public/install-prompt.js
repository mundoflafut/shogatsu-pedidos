// ═══════════════════════════════════════════════════════════════════════════
// install-prompt.js — Popup premium de instalação do PWA (v71)
// Shogatsu Culinária Oriental
//
// Componente auto-contido (vanilla JS, sem build/React/Vite — este projeto é
// servido direto como HTML/JS estático pelo server.js, então o componente
// injeta seu próprio CSS/HTML no DOM). Basta incluir:
//
//   <link rel="stylesheet" href="/install-prompt.css">
//   <script src="/install-prompt.js" defer></script>
//
// em qualquer página do site (index.html, pedir-agora.html etc). Ele sozinho
// decide quando aparecer, lê o benefício configurado no painel
// (cfg.installPromo, salvo em /api/config) e cuida de todo o fluxo.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  const LS_INSTALLED = 'shogatsu_installed';
  const LS_LAST_SHOWN = 'shogatsu_install_popup_last_shown';
  const SNOOZE_DAYS = 15;
  const FIRST_SHOW_DELAY_MS = 2000;

  // ── já instalado, ou já rodando como app (modo standalone)? nunca mostra ──
  if (localStorage.getItem(LS_INSTALLED) === 'true') return;
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
    localStorage.setItem(LS_INSTALLED, 'true');
    return;
  }

  // ── ainda dentro dos 15 dias de espera desde a última vez que apareceu? ──
  const lastShown = Number(localStorage.getItem(LS_LAST_SHOWN) || 0);
  if (lastShown && (Date.now() - lastShown) < SNOOZE_DAYS * 24 * 60 * 60 * 1000) return;

  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  const isAndroid = /Android/.test(ua);

  // Popup é pra celular (Android/iPhone), como pedido — em desktop não faz
  // sentido oferecer "tela inicial do celular", então nem inicializa.
  if (!isIOS && !isAndroid) return;

  let deferredPrompt = null;
  let overlay = null;
  let modal = null;

  function injectCSSFallbackIfMissing() {
    // Se a página esqueceu de linkar o install-prompt.css, carrega sozinho.
    const already = document.querySelector('link[href*="install-prompt.css"]');
    if (already) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/install-prompt.css';
    document.head.appendChild(link);
  }

  async function fetchInstallPromoConfig() {
    try {
      const r = await fetch('/api/config');
      const data = await r.json();
      const cfg = (data && data.cfg) || {};
      return Object.assign({
        enabled: true,
        type: 'cupom',
        cupomCode: '',
        bonusValue: '',
        benefitCode: ''
      }, cfg.installPromo || {});
    } catch (e) {
      // sem config disponível (offline, etc) — usa um padrão neutro, sem benefício
      return { enabled: true, type: '', cupomCode: '', bonusValue: '', benefitCode: '' };
    }
  }

  function benefitMessageHTML(promo) {
    if (promo.type === 'cupom' && promo.cupomCode) {
      return `🎁 Use o cupom <b>${escapeHTML(promo.cupomCode)}</b> e ganhe desconto no primeiro pedido.`;
    }
    if (promo.type === 'bonus' && promo.bonusValue) {
      return `🎁 Ganhe <b>R$ ${escapeHTML(String(promo.bonusValue))}</b> de crédito ao instalar o app e fazer seu primeiro pedido.`;
    }
    return '';
  }

  function escapeHTML(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function benefitCode(promo) {
    return (promo.benefitCode && promo.benefitCode.trim()) || promo.cupomCode || '';
  }

  function buildModal(promo) {
    const benefitMsg = benefitMessageHTML(promo);
    const code = benefitCode(promo);

    overlay = document.createElement('div');
    overlay.id = 'shogatsu-install-overlay';

    const iosStepsHTML = isIOS ? `
      <div class="ip-ios-steps">
        <div class="ip-ios-steps-title">Como instalar no iPhone:</div>
        <div class="ip-ios-step"><span class="ip-step-num">1</span><span class="ip-step-ico">📤</span> Toque em <b>Compartilhar</b></div>
        <div class="ip-ios-step"><span class="ip-step-num">2</span><span class="ip-step-ico">➕</span> Escolha <b>Adicionar à Tela de Início</b></div>
        <div class="ip-ios-step"><span class="ip-step-num">3</span><span class="ip-step-ico">✅</span> Toque em <b>Adicionar</b></div>
      </div>
    ` : '';

    modal = document.createElement('div');
    modal.id = 'shogatsu-install-modal';
    modal.innerHTML = `
      <button type="button" class="ip-close" aria-label="Fechar" id="ip-close-btn">✕</button>
      <div class="ip-icon-wrap">📲</div>
      <h2 class="ip-title">Instale o App do Shogatsu</h2>
      <p class="ip-subtitle">Peça mais rápido, acompanhe seus pedidos e receba promoções exclusivas direto da tela inicial do celular.</p>

      <div class="ip-benefits">
        <div class="ip-benefit"><span class="ip-benefit-ico">⚡</span> Abertura instantânea</div>
        <div class="ip-benefit"><span class="ip-benefit-ico">🎁</span> Promoções exclusivas</div>
        <div class="ip-benefit"><span class="ip-benefit-ico">🚚</span> Pedido mais rápido</div>
        <div class="ip-benefit"><span class="ip-benefit-ico">🔔</span> Novidades e cupons</div>
      </div>

      <div class="ip-highlight">🎉 Instale agora e ganhe um benefício no primeiro pedido!</div>
      ${benefitMsg ? `<p class="ip-benefit-msg">${benefitMsg}</p>` : ''}
      ${code ? `<div class="ip-code-box"><span class="ip-code-ico">🏷️</span> ${escapeHTML(code)}</div>` : ''}

      ${iosStepsHTML}

      <div class="ip-actions">
        <button type="button" class="ip-btn-primary" id="ip-install-btn">📲 Instalar App</button>
        <button type="button" class="ip-btn-secondary" id="ip-later-btn">Agora não</button>
      </div>
      <div id="ip-success-slot"></div>
      <div class="ip-footnote">Shogatsu Culinária Oriental</div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // fecha ao clicar fora do modal
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePopup(true);
    });
    modal.querySelector('#ip-close-btn').addEventListener('click', () => closePopup(true));
    modal.querySelector('#ip-later-btn').addEventListener('click', () => closePopup(true));
    modal.querySelector('#ip-install-btn').addEventListener('click', () => handleInstallClick(code));

    requestAnimationFrame(() => overlay.classList.add('ip-open'));
  }

  function copyBenefitCode(code) {
    if (!code) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
  }

  async function handleInstallClick(code) {
    const btn = modal.querySelector('#ip-install-btn');

    if (isIOS) {
      // iOS não tem instalação automática — só reforça o passo a passo já visível
      copyBenefitCode(code);
      showSuccess('Copiamos seu código do benefício! Agora é só seguir os passos acima. ✨', false);
      return;
    }

    if (!deferredPrompt) {
      // Evento ainda não disparou (ou navegador não suporta) — não trava o usuário
      showSuccess('Seu navegador vai liberar a instalação em instantes. Se preferir, use o menu do navegador e escolha "Instalar app".', false);
      return;
    }

    btn.disabled = true;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.disabled = false;

    if (choice && choice.outcome === 'accepted') {
      copyBenefitCode(code);
      localStorage.setItem(LS_INSTALLED, 'true');
      showSuccess('✅ App instalado com sucesso! Seu benefício foi ativado automaticamente.', true);
    }
    // se recusado, deixa o popup aberto pra ele decidir com calma (sem insistir feio)
  }

  function showSuccess(text, autoClose) {
    const slot = modal.querySelector('#ip-success-slot');
    slot.innerHTML = `<div class="ip-success">${text}</div>`;
    if (autoClose) setTimeout(() => closePopup(false), 2600);
  }

  function closePopup(recordSnooze) {
    if (!overlay) return;
    if (recordSnooze) localStorage.setItem(LS_LAST_SHOWN, String(Date.now()));
    overlay.classList.remove('ip-open');
    setTimeout(() => {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null; modal = null;
    }, 350);
  }

  async function init() {
    injectCSSFallbackIfMissing();
    const promo = await fetchInstallPromoConfig();
    if (promo.enabled === false) return; // desligado no painel admin

    let shown = false;
    const tryShow = () => {
      if (shown) return;
      shown = true;
      buildModal(promo);
    };

    if (isIOS) {
      // Safari não dispara beforeinstallprompt — só espera o tempo e mostra
      setTimeout(tryShow, FIRST_SHOW_DELAY_MS);
    } else {
      // Android/Chrome/Edge: intercepta o prompt nativo pra não deixar a
      // barrinha automática aparecer, e guarda o evento pro clique do botão.
      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        setTimeout(tryShow, FIRST_SHOW_DELAY_MS);
      });
      // fallback: se depois de um tempo o evento não chegou (ex: já era
      // instalável antes do script carregar), ainda assim mostra o popup —
      // o botão vai orientar o uso do menu do navegador nesse caso raro.
      setTimeout(tryShow, FIRST_SHOW_DELAY_MS + 3000);
    }

    window.addEventListener('appinstalled', () => {
      localStorage.setItem(LS_INSTALLED, 'true');
      closePopup(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
