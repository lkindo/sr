// Service Worker for Web Push Notifications
// This file must be placed in the public directory to be accessible at /sw.js

const SW_VERSION = '1.0.2';
const CACHE_NAME = 'sr-mgt-cache-v1';

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
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker version:', SW_VERSION);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serving cached content
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for now
  if (event.request.method !== 'GET') return;

  // Skip API requests and external resources for basic precaching
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        // Only cache successful dynamic requests
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Generic offline fallback could be added here
        return caches.match('/dashboard');
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
