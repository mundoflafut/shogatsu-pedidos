// v36: CORRIGIDO — antes, TUDO (inclusive painel.html) usava "cache primeiro": uma vez que o
// navegador guardava uma cópia, ele nunca mais buscava a versão nova no servidor sozinho — por
// isso o painel do master continuava mostrando botões antigos mesmo depois de uma atualização.
// Agora: páginas HTML (navegação) usam "rede primeiro" — sempre tenta buscar a versão mais nova;
// só usa o cache guardado se estiver sem internet. Arquivos que raramente mudam (ícones, fontes,
// manifest) continuam em cache primeiro, que é mais rápido e não tem esse risco.
const CACHE = 'shogatsu-v3';
const ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Jost:wght@300;400;500;600&display=swap'
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
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

// ─── Notificações Push (promoções, cupons, novidades) ───
self.addEventListener('push', e => {
  let data = { title: 'Shogatsu', body: 'Você tem uma novidade!', url: '/' };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch (err) { /* usa os valores padrão acima */ }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: '/icon-72.png',
      data: { url: data.url || '/' }
    })
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
