'use client';

import { useState, useEffect, useCallback } from 'react';

interface PushNotificationState {
    isSupported: boolean;
    isSubscribed: boolean;
    permission: NotificationPermission;
    isLoading: boolean;
    error: string | null;
}

interface UsePushNotificationsReturn extends PushNotificationState {
    subscribe: () => Promise<boolean>;
    unsubscribe: () => Promise<boolean>;
    requestPermission: () => Promise<NotificationPermission>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function usePushNotifications(): UsePushNotificationsReturn {
    const [state, setState] = useState<PushNotificationState>({
        isSupported: false,
        isSubscribed: false,
        permission: 'default',
        isLoading: true,
        error: null,
    });

    // Check if push notifications are supported
    const checkSupport = useCallback(() => {
        return (
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window
        );
    }, []);

    // Get current subscription status from API
    const checkSubscriptionStatus = useCallback(async (): Promise<boolean> => {
        try {
            const response = await fetch('/api/push/subscribe');
            if (response.ok) {
                const data = await response.json();
                return data.isSubscribed;
            }
            return false;
        } catch {
            return false;
        }
    }, []);

    // Initialize state
    useEffect(() => {
        const init = async () => {
            const supported = checkSupport();

            if (!supported) {
                setState((prev) => ({
                    ...prev,
                    isSupported: false,
                    isLoading: false,
                }));
                return;
            }

            const permission = Notification.permission;
            const isSubscribed = await checkSubscriptionStatus();

            setState((prev) => ({
                ...prev,
                isSupported: true,
                isSubscribed,
                permission,
                isLoading: false,
            }));
        };

        init();
    }, [checkSupport, checkSubscriptionStatus]);

    // Request notification permission
    const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
        if (!state.isSupported) {
            return 'denied';
        }

        const permission = await Notification.requestPermission();
        setState((prev) => ({ ...prev, permission }));
        return permission;
    }, [state.isSupported]);

    // Subscribe to push notifications
    const subscribe = useCallback(async (): Promise<boolean> => {
        if (!state.isSupported) {
            setState((prev) => ({ ...prev, error: '푸시 알림이 지원되지 않습니다.' }));
            return false;
        }

        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            // Request permission if not granted
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await requestPermission();
            }

            if (permission !== 'granted') {
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    error: '알림 권한이 거부되었습니다.',
                }));
                return false;
            }

            // Register service worker
            const registration = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;

            // Get VAPID public key from API (Vercel 환경 변수 문제 우회)
            let vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

            if (!vapidPublicKey || vapidPublicKey.length < 20) {
                // Fallback: API에서 가져오기
                const vapidResponse = await fetch('/api/push/vapid-key');
                if (vapidResponse.ok) {
                    const vapidData = await vapidResponse.json();
                    vapidPublicKey = vapidData.vapidPublicKey;
                }
            }

            if (!vapidPublicKey || vapidPublicKey.length < 20) {
                throw new Error('VAPID public key is not configured. Please check your environment variables.');
            }

            // Subscribe to push
            const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
            });

            // Send subscription to server
            const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subscription.toJSON()),
            });

            if (!response.ok) {
                throw new Error('Failed to save subscription on server');
            }

            setState((prev) => ({
                ...prev,
                isSubscribed: true,
                isLoading: false,
                error: null,
            }));

            return true;
        } catch (error) {
            console.error('[usePushNotifications] Subscribe error:', error);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : '구독에 실패했습니다.',
            }));
            return false;
        }
    }, [state.isSupported, requestPermission]);

    // Unsubscribe from push notifications
    const unsubscribe = useCallback(async (): Promise<boolean> => {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            // Get current subscription
            const registration = await navigator.serviceWorker.getRegistration('/sw.js');
            if (registration) {
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await subscription.unsubscribe();
                }
            }

            // Remove from server
            await fetch('/api/push/subscribe', { method: 'DELETE' });

            setState((prev) => ({
                ...prev,
                isSubscribed: false,
                isLoading: false,
                error: null,
            }));

            return true;
        } catch (error) {
            console.error('[usePushNotifications] Unsubscribe error:', error);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: error instanceof Error ? error.message : '구독 해제에 실패했습니다.',
            }));
            return false;
        }
    }, []);

    return {
        ...state,
        subscribe,
        unsubscribe,
        requestPermission,
    };
}
