import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NotificationsPage from '../page';

/**
 * 알림 설정 화면의 데이터 계층.
 *
 * 이 화면을 React Query 로 옮길 때 깨지기 쉬운 계약이 세 개 있고, 셋 다 조용히 깨진다:
 *
 *   1. **조회 실패는 침묵해야 한다.** 옛 코드의 빈 `catch` 에 적혀 있던 "실패 시 기본값 유지"
 *      가 그 계약이었다. useQuery 의 `error` 를 화면이나 토스트로 흘리면 회귀다.
 *   2. **재조회가 사용자의 편집을 되돌리면 안 된다.** "데이터 도착 → 폼 초기화" 를
 *      `useEffect(..., [data])` 로 무조건 걸면, 저장 후 무효화로 도는 재조회가 방금
 *      만진 스위치를 서버 값으로 덮어쓴다.
 *   3. **저장 실패 문구는 서버 메시지가 아니라 고정 문구다.** 400 이든 500 이든
 *      사용자에게는 같은 안내를 보여 주던 동작을 유지해야 한다.
 */

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

// 이 테스트의 관심사는 알림 "설정 폼" 이지 브라우저 푸시 구독이 아니다.
// 실물 훅은 serviceWorker/Notification 을 건드리므로 통째로 대체한다.
vi.mock('@/hooks/use-push-notifications', () => ({
  usePushNotifications: () => ({
    isSupported: true,
    isSubscribed: true,
    permission: 'granted' as NotificationPermission,
    isLoading: false,
    error: null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    requestPermission: vi.fn(),
  }),
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** 서버가 실제로 돌려주는 모양(전 필드 boolean). 기본값과 일부러 다르게 잡는다. */
const SERVER_PREFS = {
  emailSRCreated: false,
  emailSRAssigned: false,
  emailSRStatusChanged: false,
  emailCommentAdded: true,
  pushSRCreated: false,
  pushSRAssigned: false,
  pushSRStatusChanged: true,
  pushCommentAdded: true,
};

/**
 * `retry: false` 와 `gcTime: 0` 이 없으면 실패 케이스가 재시도로 타임아웃난다.
 */
function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return render(createElement(NotificationsPage), { wrapper });
}

function switchState(id: string) {
  return document.getElementById(id)?.getAttribute('aria-checked');
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotificationsPage — 설정 조회', () => {
  it('서버 값으로 폼을 초기화한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERVER_PREFS));

    renderPage();

    await waitFor(() => expect(switchState('email-sr-created')).toBe('false'));
    expect(switchState('email-comment')).toBe('true');
    expect(switchState('push-comment')).toBe('true');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/settings/notifications');
  });

  it('조회가 실패해도 토스트를 띄우지 않고 기본값을 그대로 보여 준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '알림 설정 조회에 실패했습니다.' }, 500));

    renderPage();

    // 스피너가 걷히고 폼이 보이는 것 자체가 "기본값 유지" 의 관찰 가능한 형태다.
    await waitFor(() => expect(switchState('email-sr-created')).toBe('true'));
    expect(switchState('email-comment')).toBe('false');
    expect(switchState('push-sr-status')).toBe('false');
    expect(toast).not.toHaveBeenCalled();
    expect(screen.queryByText('알림 설정 조회에 실패했습니다.')).toBeNull();
  });

  it('서버가 일부 키를 빠뜨리면 그 키만 기본값으로 남는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ emailSRCreated: false }));

    renderPage();

    await waitFor(() => expect(switchState('email-sr-created')).toBe('false'));
    expect(switchState('email-sr-assigned')).toBe('true');
    expect(switchState('email-comment')).toBe('false');
  });
});

describe('NotificationsPage — 설정 저장', () => {
  it('현재 폼 값을 PUT 으로 보내고 성공 토스트를 띄운다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERVER_PREFS));

    renderPage();
    await waitFor(() => expect(switchState('email-sr-created')).toBe('false'));

    fetchMock.mockResolvedValue(
      jsonResponse({ message: '알림 설정이 저장되었습니다.', preferences: SERVER_PREFS })
    );
    fireEvent.click(document.getElementById('email-sr-created')!);
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '성공',
        description: '알림 설정이 저장되었습니다.',
      })
    );

    const put = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(put).toBeDefined();
    expect(JSON.parse(put![1].body)).toEqual({ ...SERVER_PREFS, emailSRCreated: true });
  });

  it('저장이 실패하면 서버 문구가 아니라 고정 문구로 알린다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERVER_PREFS));

    renderPage();
    await waitFor(() => expect(switchState('email-sr-created')).toBe('false'));

    fetchMock.mockResolvedValue(jsonResponse({ error: '잘못된 설정 데이터입니다.' }, 400));
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '알림 설정 저장에 실패했습니다.',
        variant: 'destructive',
      })
    );
  });

  it('저장 후 재조회가 사용자가 만진 스위치를 되돌리지 않는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SERVER_PREFS));

    renderPage();
    await waitFor(() => expect(switchState('email-sr-created')).toBe('false'));

    // 사용자가 켠 뒤 저장. onSettled 무효화로 GET 이 한 번 더 돈다.
    fireEvent.click(document.getElementById('email-sr-created')!);
    expect(switchState('email-sr-created')).toBe('true');

    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === 'PUT'
          ? jsonResponse({ message: 'ok', preferences: SERVER_PREFS })
          : // 재조회는 아직 옛 값을 준다(복제 지연·다른 탭 등). 이 값이 폼을 덮으면 회귀다.
            jsonResponse(SERVER_PREFS)
      )
    );
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'GET').length).toBe(2)
    );
    expect(switchState('email-sr-created')).toBe('true');
  });
});
