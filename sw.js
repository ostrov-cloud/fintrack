// FinTrack Service Worker — PWA
const CACHE='fintrack-v3';
const ASSETS=[
  './',
  './index.html',
  './fintrack_v2_38.html',
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

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  
  e.respondWith(
    fetch(e.request).then(response=>{
      if(response.ok&&response.type==='basic'){
        const clone=response.clone();
        caches.open(CACHE).then(cache=>cache.put(e.request,clone));
      }
      return response;
    }).catch(()=>{
      return caches.match(e.request).then(cached=>{
        return cached||caches.match('./fintrack_v2_38.html');
      });
    })
  );
});