'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiDelete, ApiError, apiGet, apiPost } from '@/lib/api-client';

/**
 * ⚠️ 이 훅은 의도적으로 React Query 를 쓰지 않는다.
 *
 * 네 번의 서버 왕복이 전부 브라우저 권한 API 와 한 흐름으로 엮여 있다:
 * `Notification.requestPermission()` → `serviceWorker.register()` →
 * `pushManager.subscribe()` → 그 결과를 서버에 저장. 중간 단계가 사용자 제스처와
 * 권한 프롬프트에 묶여 있어 선언적 쿼리로 쪼개면 순서 보장이 오히려 어려워지고,
 * 훅의 반환 계약(`subscribe(): Promise<boolean>`)도 바뀐다. 호출부(알림 설정 화면)는
 * 그 boolean 으로 분기한다.
 *
 * 그래서 여기서 통일한 것은 **에러 언랩뿐**이다 — 네 곳 모두 `api-client` 를 지나므로
 * 실패가 `ApiError`(status/code/body 를 실은)로 올라온다. 상태 기계는 그대로다.
 */

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
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

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
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }, []);

  // Get current subscription status from API
  const checkSubscriptionStatus = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ isSubscribed?: boolean }>('/api/push/subscribe');
      return data?.isSubscribed ?? false;
    } catch {
      // 조회 실패(401·5xx·네트워크 단절)를 미구독과 같게 다룬다. 푸시는 부가 기능이라
      // 여기서 던지면 알림 설정 화면 전체가 로딩에 갇힌다.
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

      // Get VAPID public key from API (빌드 시 환경 변수가 주입되지 않은 경우 대비)
      let vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!vapidPublicKey || vapidPublicKey.length < 20) {
        // Fallback: API에서 가져오기
        try {
          const vapidData = await apiGet<{ vapidPublicKey?: string }>('/api/push/vapid-key');
          vapidPublicKey = vapidData?.vapidPublicKey;
        } catch (error) {
          // 서버에 푸시가 설정되지 않은 경우(503 등). 사용자에게 상태로 알린다.
          //
          // `ApiError` 일 때만 이 안내로 바꾼다 — 그래야 "서버가 응답은 했는데 푸시 설정이
          // 없다" 와 "네트워크가 끊겼다/본문이 깨졌다" 가 구분된다. 후자는 아래 catch 가
          // 원래 메시지를 그대로 error 에 싣던 동작을 유지해야 한다.
          if (!(error instanceof ApiError)) throw error;
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: '서버에 푸시 알림이 설정되어 있지 않습니다. 관리자에게 문의해주세요.',
          }));
          return false;
        }
      }

      if (!vapidPublicKey || vapidPublicKey.length < 20) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: '푸시 알림 키가 올바르게 설정되지 않았습니다. 관리자에게 문의해주세요.',
        }));
        return false;
      }

      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      // Send subscription to server.
      // 서버가 이유를 주면 그것을 쓰고, 없을 때만 이 문구로 떨어진다(예전에는 항상 이 문구였다).
      await apiPost('/api/push/subscribe', subscription.toJSON(), {
        fallbackMessage: 'Failed to save subscription on server',
      });

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
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

      // Remove from server.
      //
      // ⚠️ 응답을 보지 않는다 — fetch 를 직접 쓰던 시절부터의 동작을 유지한 것이다.
      // 이 시점에 브라우저 구독은 이미 해제됐으므로 서버 삭제가 실패해도 사용자에게는
      // 알림이 오지 않는다. 여기서 던지면 "해제 실패" 라고 말하면서 실제로는 해제된
      // 모순된 상태가 되고, 사용자가 다시 눌러도 지울 구독이 없어 나아지지 않는다.
      // (서버에 남은 유령 구독은 발송 시 410 으로 정리된다.)
      await apiDelete('/api/push/subscribe').catch(() => undefined);

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (error) {
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
