// v36: CORRIGIDO — antes, TUDO (inclusive painel.html) usava "cache primeiro": uma vez que o
// navegador guardava uma cópia, ele nunca mais buscava a versão nova no servidor sozinho — por
// isso o painel do master continuava mostrando botões antigos mesmo depois de uma atualização.
// Agora: páginas HTML (navegação) usam "rede primeiro" — sempre tenta buscar a versão mais nova;
// só usa o cache guardado se estiver sem internet. Arquivos que raramente mudam (ícones, fontes,
// manifest) continuam em cache primeiro, que é mais rápido e não tem esse risco.
// v44: versão do cache subiu (v4 -> v5) junto com o sistema de atualização automática
// (ver public/version-check.js) — isso já faz o próprio evento "activate" abaixo apagar o
// cache antigo sozinho, sem tocar em IndexedDB/localStorage/cookies (dados do cliente).
const CACHE = 'shogatsu-v5';
const ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Jost:wght@300;400;500;600&display=swap'
];
// BUG CORRIGIDO (v43 — "notificação push não chega"): o `cache.addAll(ASSETS)` falha por
// inteiro se UM ÚNICO item da lista não puder ser buscado — e o CSS do Google Fonts é
// cross-origin, então qualquer instabilidade de rede/CORS nele derruba a instalação inteira
// do Service Worker. Quando isso acontece, o Service Worker fica travado pra sempre em
// "installing" e nunca chega a "activated" — e como o botão de notificações espera
// `navigator.serviceWorker.ready` (que só resolve depois de "activated"), o clique em
// "Ativar notificações" ficava preso sem nunca terminar, sem erro nenhum. Agora cada arquivo
// é cacheado individualmente: se um falhar, os outros continuam normalmente e a instalação
// sempre termina.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(ASSETS.map(url => c.add(url).catch(err => console.warn('[sw] não consegui cachear', url, err))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// v44: permite que public/version-check.js peça pro Service Worker assumir na hora, sem
// esperar todas as abas fecharem — parte do sistema de atualização automática.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isHtmlRequest(request){
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

self.addEventListener('fetch', e => {
  // Pedidos, status e config sempre direto da rede — nunca cachear
  if (e.request.url.includes('/api/')) return;

  // Páginas HTML (index, painel, cardápios, etc.): rede primeiro, sempre. Isso garante que
  // qualquer atualização publicada no servidor aparece na próxima vez que a página recarregar,
  // sem precisar limpar cache manualmente. Só cai pro cache se estiver realmente offline.
  if (isHtmlRequest(e.request)) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // Resto (ícones, fontes, css/js estático): cache primeiro, mais rápido e raramente muda.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// ─── Notificações Push (promoções, cupons, novidades, status do pedido) ───
// v44: reforçado o alerta sonoro/tátil dessas notificações. O navegador não deixa a gente
// anexar um arquivo de áudio próprio numa Notification (isso é decidido pelo sistema
// operacional) — o que dá pra garantir é NÃO silenciar (silent:false, que já é o padrão, mas
// deixamos explícito) e adicionar vibração no celular, que funciona junto com o som do sistema.
self.addEventListener('push', e => {
  let data = { title: 'Shogatsu', body: 'Você tem uma novidade!', url: '/' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (err) { /* usa os valores padrão acima */ }
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        image: data.image || undefined, // v45: banner grande, estilo apps de delivery (iFood etc)
        badge: '/icon-72.png',
        data: { url: data.url || '/' },
        silent: false,
        vibrate: [200, 100, 200, 100, 200],
        requireInteraction: false,
        tag: data.tag || 'shogatsu-update'
      }),
      // v45: quem já está com o site/painel aberto na hora não depende só do som do sistema —
      // avisa a página pra tocar o sino oriental sintetizado (ver index.html/painel.html).
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
        list.forEach(c => c.postMessage({ type: 'shogatsu-push-sound', sound: data.sound || 'oriental' }));
      })
    ])
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if (c.url.includes(url) && 'focus' in c) return c.focus(); }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
