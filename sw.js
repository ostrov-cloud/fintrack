// FinTrack Service Worker — PWA
const CACHE='fintrack-v2';
const ASSETS=[
  './',
  './index.html',
  './firebase.js',
  './users.js',
  './rates.json',
  './libs/chart.umd.min.js',
  './libs/pdfmake.min.js',
  './libs/vfs_fonts.js',
  './libs/tabler-icons.min.css',
  './libs/fonts/tabler-icons.ttf',
  './libs/fonts/tabler-icons.woff',
  './libs/fonts/tabler-icons.woff2',
  './libs/Roboto-Regular.ttf'
];

// Install: кешуємо статичні ресурси
self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: очищаємо старі кеші
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch: Network First → Cache Fallback
self.addEventListener('fetch',e=>{
  // Пропускаємо не-GET запити та chrome-extension
  if(e.request.method!=='GET')return;
  
  e.respondWith(
    fetch(e.request).then(response=>{
      // Кешуємо успішні відповіді
      if(response.ok&&response.type==='basic'){
        const clone=response.clone();
        caches.open(CACHE).then(cache=>cache.put(e.request,clone));
      }
      return response;
    }).catch(()=>{
      // Офлайн: повертаємо з кешу
      return caches.match(e.request).then(cached=>{
        return cached||caches.match('./index.html');
      });
    })
  );
});