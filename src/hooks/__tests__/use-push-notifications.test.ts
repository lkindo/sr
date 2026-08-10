import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePushNotifications } from '../use-push-notifications';

/**
 * 웹 푸시 구독 훅.
 *
 * 이 훅은 브라우저 API 세 개(Notification / serviceWorker / PushManager)와 서버 API
 * 두 개(vapid-key / subscribe)를 엮는다. 그 중 어느 하나가 없거나 거절해도 **화면이
 * 깨지지 않고 이유가 사용자에게 도달해야 한다** — 푸시는 부가 기능이므로 실패가 다른
 * 기능을 막으면 안 된다.
 *
 * 그래서 여기서 단언하는 것은 대부분 "실패했을 때 무엇이 남는가" 다:
 * isLoading 이 반드시 풀리는지(안 풀리면 버튼이 영구 비활성), error 에 사람이 읽을 수
 * 있는 문장이 담기는지, 그리고 지원하지 않는 브라우저에서 조용히 넘어가는지.
 */

/** 구독 객체 대역. */
const subscription = {
  toJSON: () => ({ endpoint: 'https://push.example/abc' }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

const pushManager = {
  subscribe: vi.fn().mockResolvedValue(subscription),
  getSubscription: vi.fn().mockResolvedValue(subscription),
};

const registration = { pushManager };

/** 브라우저가 푸시를 완전히 지원하는 상태로 만든다. */
function supportPush(permission: NotificationPermission = 'granted') {
  const serviceWorker = {
    register: vi.fn().mockResolvedValue(registration),
    getRegistration: vi.fn().mockResolvedValue(registration),
    ready: Promise.resolve(registration),
  };
  vi.stubGlobal('navigator', { serviceWorker });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission),
  });
  return serviceWorker;
}

/** 32바이트 이상이면 urlBase64ToUint8Array 가 정상 동작한다. */
const VAPID = 'B'.repeat(88);

/**
 * 성공 응답 대역.
 *
 * ⚠️ `text` 를 반드시 함께 준다. 훅이 `@/lib/api-client` 를 거치면서 성공 본문을
 * `response.text()` 로 읽기 때문이다 — 그래야 204 와 빈 본문을 구분 없이 다룰 수 있다.
 * `json` 만 있는 목은 성공 경로에서 "text is not a function" 으로 죽고, 그 TypeError 는
 * 훅의 catch 에 걸려 **엉뚱한 실패 케이스처럼 보이는 통과/실패**를 만든다.
 *
 * 실패 응답은 일부러 `text`·`json` 없이 둔 곳이 있다(503·본문 없는 실패). api-client 가
 * 본문 파싱 실패를 삼키고 상태코드만으로 ApiError 를 만드는 경로를 그대로 태우기 위함이다.
 */
const okRes = (data?: unknown) => ({
  ok: true,
  status: 200,
  text: async () => (data === undefined ? '' : JSON.stringify(data)),
  json: async () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
  // 로컬 .env 에 키가 있으면 훅이 API 폴백을 건너뛴다. 테스트가 실행 환경에 따라
  // 다른 경로를 타지 않도록, 기본은 '빌드 시 주입되지 않음' 으로 고정한다.
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
  subscription.unsubscribe.mockResolvedValue(true);
  pushManager.subscribe.mockResolvedValue(subscription);
  pushManager.getSubscription.mockResolvedValue(subscription);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('usePushNotifications — 초기화', () => {
  // 지원하지 않는 브라우저(구형 사파리 등)에서 훅이 던지면 그 화면 전체가 죽는다.
  it('지원하지 않는 브라우저에서는 조용히 미지원으로 끝낸다', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', vi.fn());

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSupported).toBe(false);
    // 미지원이면 서버에 물어볼 이유도 없다.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('지원하면 서버에서 현재 구독 여부를 읽어 온다', async () => {
    supportPush('granted');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes({ isSubscribed: true })));

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSupported).toBe(true);
    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.permission).toBe('granted');
  });

  it('구독 조회가 실패해도 미구독으로 보고 계속 진행한다', async () => {
    supportPush('default');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('네트워크 오류')));

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSubscribed).toBe(false);
  });
});

describe('usePushNotifications — 구독', () => {
  const ready = async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    return result;
  };

  it('권한이 있으면 구독하고 서버에 저장한다', async () => {
    supportPush('granted');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okRes({ isSubscribed: false }))
      .mockResolvedValueOnce(okRes({ vapidPublicKey: VAPID }))
      .mockResolvedValueOnce(okRes());
    vi.stubGlobal('fetch', fetchMock);

    const result = await ready();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    expect(ok).toBe(true);
    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('사용자가 권한을 거부하면 이유를 남기고 멈춘다', async () => {
    supportPush('denied');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes({ isSubscribed: false })));

    const result = await ready();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('알림 권한이 거부되었습니다.');
    // 실패해도 로딩은 반드시 풀려야 한다. 안 그러면 버튼이 영구히 비활성이다.
    expect(result.current.isLoading).toBe(false);
  });

  // 서버에 VAPID 키가 없으면(503) 사용자가 아무리 눌러도 되지 않는다.
  // 그 사실이 "실패했습니다" 가 아니라 관리자 문의로 안내되어야 한다.
  it('서버에 푸시가 설정되어 있지 않으면 그렇게 안내한다', async () => {
    supportPush('granted');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(okRes({ isSubscribed: false }))
        // 본문 없는 503. api-client 는 파싱 실패를 삼키고 상태코드만 실은 ApiError 를 낸다.
        .mockResolvedValueOnce({ ok: false, status: 503 })
    );

    const result = await ready();
    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.error).toContain('설정되어 있지 않습니다');
    expect(result.current.isLoading).toBe(false);
  });

  // "서버가 응답은 했는데 푸시 설정이 없다" 와 "서버까지 닿지도 못했다" 는 다른 사건이다.
  // 후자를 관리자 문의로 안내하면 사용자는 되지도 않을 문의를 하게 되고, 정작 해야 할
  // 재시도는 하지 않는다. 그래서 훅은 ApiError 일 때만 설정 안내로 바꾼다.
  it('VAPID 키 조회가 네트워크 오류면 설정 문제로 오인하지 않는다', async () => {
    supportPush('granted');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(okRes({ isSubscribed: false }))
        .mockRejectedValueOnce(new Error('Failed to fetch'))
    );

    const result = await ready();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('Failed to fetch');
    expect(result.current.isLoading).toBe(false);
  });

  it('VAPID 키가 비정상적으로 짧으면 거부한다', async () => {
    supportPush('granted');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(okRes({ isSubscribed: false }))
        .mockResolvedValueOnce(okRes({ vapidPublicKey: 'short' }))
    );

    const result = await ready();
    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.error).toContain('키가 올바르게 설정되지 않았습니다');
  });

  it('서버 저장이 실패하면 구독 상태로 바꾸지 않는다', async () => {
    supportPush('granted');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(okRes({ isSubscribed: false }))
        .mockResolvedValueOnce(okRes({ vapidPublicKey: VAPID }))
        // 이유를 주지 않는 실패. 서버 메시지가 없으므로 fallbackMessage 가 그대로 남는다.
        .mockResolvedValueOnce({ ok: false })
    );

    const result = await ready();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    // 서버가 모르는 구독은 알림이 오지 않는다. 켜졌다고 표시하면 거짓말이 된다.
    expect(ok).toBe(false);
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.error).toBe('Failed to save subscription on server');
  });

  // 빌드 시 키가 주입돼 있으면 API 를 부르지 않는다. 이 경로가 깨지면 매 구독마다
  // 불필요한 왕복이 하나 늘어난다.
  it('환경 변수에 키가 있으면 API 를 부르지 않는다', async () => {
    supportPush('granted');
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', VAPID);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okRes({ isSubscribed: false }))
      .mockResolvedValueOnce(okRes());
    vi.stubGlobal('fetch', fetchMock);

    const result = await ready();
    await act(async () => {
      await result.current.subscribe();
    });

    expect(result.current.isSubscribed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/push/vapid-key');
  });

  it('미지원 브라우저에서 구독을 시도하면 이유를 남긴다', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', vi.fn());

    const result = await ready();
    let ok!: boolean;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('푸시 알림이 지원되지 않습니다.');
  });
});

describe('usePushNotifications — 구독 해제 / 권한 요청', () => {
  it('브라우저 구독을 해제하고 서버에서도 지운다', async () => {
    supportPush('granted');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okRes({ isSubscribed: true }))
      .mockResolvedValueOnce(okRes());
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok!: boolean;
    await act(async () => {
      ok = await result.current.unsubscribe();
    });

    expect(ok).toBe(true);
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/push/subscribe',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(result.current.isSubscribed).toBe(false);
  });

  it('해제 중 오류가 나도 로딩을 풀고 이유를 남긴다', async () => {
    supportPush('granted');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes({ isSubscribed: true })));
    subscription.unsubscribe.mockRejectedValue(new Error('해제 실패'));

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let ok!: boolean;
    await act(async () => {
      ok = await result.current.unsubscribe();
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('해제 실패');
    expect(result.current.isLoading).toBe(false);
  });

  it('미지원 브라우저에서는 권한 요청이 곧바로 denied 다', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', vi.fn());

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let permission!: NotificationPermission;
    await act(async () => {
      permission = await result.current.requestPermission();
    });

    expect(permission).toBe('denied');
  });

  it('지원하면 브라우저 권한 요청 결과를 상태에 반영한다', async () => {
    supportPush('default');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes({ isSubscribed: false })));

    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.mocked(Notification.requestPermission).mockResolvedValue('granted');

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(result.current.permission).toBe('granted');
  });
});
