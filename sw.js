// Service worker: guarda o jogo no aparelho para ele abrir até sem internet.
// Com internet, sempre busca a versão mais nova primeiro (e guarda a cópia);
// sem internet, usa a cópia guardada.

const GAVETA = 'pontinho-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', evento => evento.waitUntil(self.clients.claim()));

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  const doJogo = url.origin === self.location.origin;
  const daFonte = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!doJogo && !daFonte) return;
  evento.respondWith((async () => {
    const gaveta = await caches.open(GAVETA);
    try {
      // no-cache: confere com o servidor se há versão nova (sem esperar o cache do GitHub vencer).
      const resposta = await fetch(pedido, doJogo ? { cache: 'no-cache' } : {});
      if (resposta.ok) gaveta.put(pedido, resposta.clone());
      return resposta;
    } catch {
      const guardada = await gaveta.match(pedido, { ignoreSearch: true });
      if (guardada) return guardada;
      throw new Error('Sem internet e sem cópia guardada.');
    }
  })());
});
