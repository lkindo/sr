// Service Worker for Web Push Notifications
// This file must be placed in the public directory to be accessible at /sw.js

const SW_VERSION = '1.0.1';

// Install event - cache assets if needed
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker version:', SW_VERSION);
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker version:', SW_VERSION);
    event.waitUntil(self.clients.claim());
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

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
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
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
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
