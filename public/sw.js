// Service Worker for Web Push Notifications
// This file must be placed in the public directory to be accessible at /sw.js

const SW_VERSION = '1.0.4';
const CACHE_NAME = 'sr-mgt-cache-v4';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/manifest.json',
  '/dashboard',
  '/login',
  // Note: Next.js has complex hashed assets, so we usually rely on dynamic caching for them
];

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
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Navigation Preload 활성화
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable()
        : Promise.resolve(),
    ]).then(() => self.clients.claim())
  );
});

// Fetch event - serving cached content
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for now
  if (event.request.method !== 'GET') return;

  // Skip API requests and external resources for basic precaching
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.origin !== self.location.origin) return;

  // Document (HTML) requests: Network First + Navigation Preload
  if (
    event.request.mode === 'navigate' ||
    event.request.headers.get('accept')?.includes('text/html')
  ) {
    event.respondWith(
      (async () => {
        try {
          // Preload된 응답 사용 시도
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) return preloadResponse;

          // 네트워크 요청
          const networkResponse = await fetch(event.request);

          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseToCache = networkResponse.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, responseToCache);
          }

          return networkResponse;
        } catch (error) {
          // 오프라인 시 캐시 확인
          const cache = await caches.open(CACHE_NAME);
          const cachedResponse = await cache.match(event.request);
          return cachedResponse || cache.match('/dashboard') || cache.match('/login');
        }
      })()
    );
    return;
  }

  // Other assets (static files): Cache First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // Only cache successful dynamic requests
        if (
          !response ||
          response.status !== 200 ||
          response.type === 'error' ||
          response.type === 'opaque'
        ) {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
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
