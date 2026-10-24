// Service Worker for Web Push Notifications
// This file must be placed in the public directory to be accessible at /sw.js

const SW_VERSION = '1.0.5';
const CACHE_PREFIX = 'sr-mgt-cache-';
const CACHE_NAME = `${CACHE_PREFIX}v5`;

// Assets to cache immediately on install
const PRECACHE_ASSETS = ['/favicon.ico', '/icons/icon-192x192.png', '/icons/icon-512x512.png'];
const STATIC_ASSETS = new Set(PRECACHE_ASSETS);

// Install event - cache assets if needed
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker version:', SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual adds to prevent a single failure from blocking the entire install
      return Promise.allSettled(PRECACHE_ASSETS.map((asset) => cache.add(asset))).then(
        (results) => {
          const failed = results.filter((r) => r.status === 'rejected');
          if (failed.length > 0) {
            console.warn(`[SW] Some assets failed to precache:`, failed);
          }
        }
      );
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker version:', SW_VERSION);
  event.waitUntil(
    Promise.all([
      // 기존 캐시 정리
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // HTML은 브라우저가 직접 조회한다. 이전 버전이 켠 preload도 해제한다.
      self.registration.navigationPreload
        ? self.registration.navigationPreload.disable()
        : Promise.resolve(),
    ]).then(() => self.clients.claim())
  );
});

// Next RSC 응답은 라우터 상태에 종속된다. 재사용하면 두 번째 화면 이동이 멈출 수 있다.
// 인증 HTML·API·개발 번들·동적 manifest는 건드리지 않고 공개 이미지 목록만 캐시한다.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (
    url.origin !== self.location.origin ||
    event.request.mode === 'navigate' ||
    event.request.headers.get('accept')?.includes('text/html') ||
    event.request.headers.get('RSC') === '1' ||
    url.searchParams.has('_rsc') ||
    !STATIC_ASSETS.has(url.pathname)
  )
    return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) return cachedResponse;

      const response = await fetch(event.request);
      if (
        response.ok &&
        response.type === 'basic' &&
        !response.redirected &&
        response.headers.get('content-type')?.startsWith('image/') &&
        !/no-store|private/i.test(response.headers.get('cache-control') || '')
      ) {
        event.waitUntil(cache.put(event.request, response.clone()).catch(() => undefined));
      }
      return response;
    })()
  );
});

// Push event - receive push notifications
self.addEventListener('push', (event) => {
  console.log(`[SW ${SW_VERSION}] Push received:`, event);

  let data = {
    title: 'SR 알림',
    body: '새로운 알림이 있습니다.',
    icon: null,
    badge: null,
    url: '/dashboard',
    tag: 'sr-notification',
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      console.log(`[SW ${SW_VERSION}] Push payload:`, payload);
      data = { ...data, ...payload };
    }
  } catch (error) {
    console.error(`[SW ${SW_VERSION}] Error parsing push data:`, error);
  }

  const options = {
    body: data.body,
    // icon: data.icon, // 아이콘 파일 없음으로 주석 처리
    // badge: data.badge,
    tag: data.tag || 'sr-notification',
    data: {
      url: data.url || '/dashboard',
      timestamp: Date.now(),
    },
    requireInteraction: true, // 사용자가 닫을 때까지 유지
    // vibrate: [200, 100, 200],
    actions: [
      {
        action: 'open',
        title: '열기',
      },
      {
        action: 'close',
        title: '닫기',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click event - handle user clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already an open window with the same origin
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // If no matching window, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event);
});
