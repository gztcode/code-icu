/**
 * Code ICU · Service Worker
 *
 * 目标只有一个：装成桌面应用后，断网也能打开。
 *
 * 策略选 network-first 而不是 cache-first —— 这是个会频繁改动的作品站，
 * 评委随时可能打开，缓存优先会把旧版本发给新访客。联网时永远拿最新的，
 * 只有网络失败才回退到缓存。
 *
 * 缓存版本号改动即触发全量更新（install 时预缓存新资源，activate 时清旧）。
 */

const CACHE = 'icu:sw:v1';

/** 需要预缓存的站点资源。全部为同源相对路径，部署在任意子目录都能用。 */
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/app.css',
  './css/app-flow.css',
  './css/app-report.css',
  './css/app-notice.css',
  './js/main.js',
  './js/config.js',
  './js/copy.js',
  './js/dom.js',
  './js/router.js',
  './js/http.js',
  './js/cache.js',
  './js/session.js',
  './js/metrics.js',
  './js/vitals.js',
  './js/advice.js',
  './js/github.js',
  './js/views/home.js',
  './js/views/report.js',
  './js/views/notice.js',
  './js/components/patient.js',
  './js/components/vital-card.js',
  './js/components/score-ring.js',
  './js/components/ecg.js',
  './js/components/ecg-screen.js',
  './js/components/monitor.js',
  './js/components/timeline.js',
  './js/share/stamp.js',
  './js/share/notice-card.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 只接管同源 GET。api.github.com 是跨域，让它直连，缓存会毁掉实时数据。
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // 顺手更新缓存（只存成功的响应）
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // 导航请求（任意路径）离线时回首页
        if (request.mode === 'navigate') {
          const home = await caches.match('./index.html');
          if (home) return home;
        }
        return new Response('离线，且没有缓存可用的副本。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }),
  );
});
