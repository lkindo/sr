import { createElement, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRealtimeStatus } from '../use-realtime-status';

vi.mock('next-auth/react', () => ({ useSession: vi.fn() }));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * SSE 실시간 갱신 훅.
 *
 * 이 훅의 계약은 "이벤트가 오면 화면이 갱신된다" 하나로 보이지만, 실제로는 **어느 것을
 * 갱신하느냐**가 핵심이다. 목록·대시보드는 서버 컴포넌트가 렌더하므로 React Query 캐시에
 * 데이터가 아예 없다. 그래서 예전에는 `invalidateQueries({ queryKey: ['srs'] })` 가
 * 어떤 쿼리와도 매칭되지 않는 **무동작**이었고, 실시간 갱신이 토스트만 띄우고 목록은
 * 그대로였다(감사 3.26). 지금은 클라이언트 쿼리만 무효화하고 SSR 화면은
 * `router.refresh()` 로 다시 받는다.
 *
 * 그래서 여기서 단언하는 것은 토스트가 아니라 **무효화 대상과 refresh 호출**이다.
 */

/** 테스트가 이벤트를 직접 쏠 수 있는 EventSource 대역. */
class FakeEventSource {
  static last: FakeEventSource | null = null;
  /** 몇 번 생성됐는지. 재연결이 실제로 새 연결을 만드는지 확인하는 데 쓴다. */
  static createdCount = 0;
  listeners = new Map<string, (e: MessageEvent) => void>();
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.last = this;
    FakeEventSource.createdCount++;
  }

  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    this.listeners.set(type, cb);
  }

  close() {
    this.closed = true;
  }

  /** 서버가 이벤트를 보낸 것처럼 만든다. */
  emit(type: string, data: unknown) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    this.listeners.get(type)?.({ data: payload } as MessageEvent);
  }
}

const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn() };

function setup() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

const authenticated = () =>
  vi.mocked(useSession).mockReturnValue({ status: 'authenticated' } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  FakeEventSource.last = null;
  FakeEventSource.createdCount = 0;
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.mocked(useRouter).mockReturnValue(router as never);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 디바운스(300ms)를 통과시킨다. */
const flushRefresh = () => act(() => void vi.advanceTimersByTime(300));

describe('useRealtimeStatus', () => {
  // 익명 사용자가 SSE 를 열면 서버는 인증 실패 응답을 반복해서 내보내게 된다.
  it('인증되지 않았으면 연결하지 않는다', () => {
    vi.mocked(useSession).mockReturnValue({ status: 'unauthenticated' } as never);
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });

    expect(FakeEventSource.last).toBeNull();
  });

  it('인증되면 /api/realtime 에 연결한다', () => {
    authenticated();
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });

    expect(FakeEventSource.last?.url).toBe('/api/realtime');
  });

  it('언마운트하면 연결을 닫는다', () => {
    authenticated();
    const { wrapper } = setup();

    const { unmount } = renderHook(() => useRealtimeStatus(), { wrapper });
    const es = FakeEventSource.last!;
    unmount();

    // 닫지 않으면 페이지를 옮길 때마다 연결이 쌓인다.
    expect(es.closed).toBe(true);
  });

  it('sr:updated 는 해당 SR 캐시를 무효화하고 서버 렌더를 다시 받는다', () => {
    authenticated();
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() =>
      FakeEventSource.last!.emit('sr:updated', { id: 'sr-1', srNumber: 'SR-1', status: '완료' })
    );

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sr', 'sr-1'] });
    flushRefresh();
    expect(router.refresh).toHaveBeenCalled();
  });

  it('sr:created 는 서버 렌더를 다시 받고 알린다', () => {
    authenticated();
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => FakeEventSource.last!.emit('sr:created', { srNumber: 'SR-9' }));

    flushRefresh();
    expect(router.refresh).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '새로운 SR 등록' }));
  });

  // 남의 화면에서 삭제된 SR 의 캐시가 남아 있으면 유령 데이터가 보인다.
  it('sr:deleted 는 해당 캐시를 제거한다', () => {
    authenticated();
    const { client, wrapper } = setup();
    const remove = vi.spyOn(client, 'removeQueries');

    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => FakeEventSource.last!.emit('sr:deleted', { id: 'sr-1', srNumber: 'SR-1' }));

    expect(remove).toHaveBeenCalledWith({ queryKey: ['sr', 'sr-1'] });
  });

  it('sr:commented 는 댓글·활동 캐시를 무효화한다', () => {
    authenticated();
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => FakeEventSource.last!.emit('sr:commented', { srId: 'sr-1' }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sr', 'sr-1', 'comments'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['sr', 'sr-1', 'activities'] });
  });

  // 이벤트가 몰아칠 때 매번 서버를 때리면 실시간 갱신이 곧 부하가 된다.
  it('연달아 온 이벤트는 한 번의 refresh 로 묶는다', () => {
    authenticated();
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => {
      const es = FakeEventSource.last!;
      es.emit('sr:created', { srNumber: 'SR-1' });
      es.emit('sr:created', { srNumber: 'SR-2' });
      es.emit('sr:updated', { id: 'sr-3', srNumber: 'SR-3', status: '진행' });
    });

    flushRefresh();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  // 깨진 페이로드 하나가 리스너를 죽이면 그 뒤 이벤트가 전부 사라진다.
  it('깨진 JSON 이 와도 다음 이벤트를 계속 처리한다', () => {
    authenticated();
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });
    const es = FakeEventSource.last!;

    expect(() => act(() => es.emit('sr:updated', '{깨진'))).not.toThrow();

    act(() => es.emit('sr:created', { srNumber: 'SR-2' }));
    flushRefresh();
    expect(router.refresh).toHaveBeenCalled();
  });

  it('id 가 없는 sr:updated 는 캐시를 건드리지 않는다', () => {
    authenticated();
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => FakeEventSource.last!.emit('sr:updated', { srNumber: 'SR-1', status: '완료' }));

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('연결 오류 핸들러가 던지지 않는다', () => {
    authenticated();
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });

    expect(() => FakeEventSource.last!.onerror?.()).not.toThrow();
    expect(() => FakeEventSource.last!.onopen?.()).not.toThrow();
  });
});

/**
 * 감사 D-7 회귀 방어 — 조용한 실시간 갱신 상실.
 *
 * EventSource 는 스펙상 non-200 응답을 받으면 **영구 CLOSED** 가 된다. 예전에는
 * `onerror` 가 로그만 남기고 끝났고, `eventSourceRef` 가 남아 재연결 가드에 막혔다.
 * 그래서 배포 중 nginx 가 잠깐 502 를 주면 열려 있던 모든 탭이 새로고침 전까지
 * 실시간 갱신을 잃었다 — 화면에 아무 표시가 없어 아무도 알아채지 못했다.
 */
describe('useRealtimeStatus — 재연결', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('연결이 끊기면 죽은 EventSource 를 닫고 다시 연결한다', () => {
    authenticated();
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });
    expect(FakeEventSource.createdCount).toBe(1);
    const dead = FakeEventSource.last!;

    act(() => {
      dead.onerror?.();
    });

    // 죽은 연결은 반드시 닫아야 한다. 열어 둔 채로 두면 ref 가 남아 재연결이 막힌다.
    expect(dead.closed).toBe(true);

    // 백오프가 지나면 새 연결이 생긴다.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(FakeEventSource.createdCount).toBe(2);
    expect(FakeEventSource.last).not.toBe(dead);
  });

  it('재연결 간격은 실패가 이어질수록 늘어난다', () => {
    authenticated();
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });

    // 1차 실패 → 약 1초 뒤 재연결
    act(() => FakeEventSource.last!.onerror?.());
    act(() => vi.advanceTimersByTime(2_100));
    expect(FakeEventSource.createdCount).toBe(2);

    // 2차 실패 → 1초로는 부족하다(백오프가 늘어났다)
    act(() => FakeEventSource.last!.onerror?.());
    act(() => vi.advanceTimersByTime(900));
    expect(FakeEventSource.createdCount).toBe(2);

    act(() => vi.advanceTimersByTime(2_200));
    expect(FakeEventSource.createdCount).toBe(3);
  });

  it('연결에 성공하면 백오프가 초기화된다', () => {
    authenticated();
    const { wrapper } = setup();

    renderHook(() => useRealtimeStatus(), { wrapper });

    // 두 번 실패시켜 백오프를 키운다.
    act(() => FakeEventSource.last!.onerror?.());
    act(() => vi.advanceTimersByTime(2_100));
    act(() => FakeEventSource.last!.onerror?.());
    act(() => vi.advanceTimersByTime(3_100));
    expect(FakeEventSource.createdCount).toBe(3);

    // 성공. 이후 실패는 다시 첫 간격부터 시작해야 한다 —
    // 그러지 않으면 한 번 끊긴 세션이 이후 재연결마다 30초를 기다리게 된다.
    act(() => FakeEventSource.last!.onopen?.());
    act(() => FakeEventSource.last!.onerror?.());
    act(() => vi.advanceTimersByTime(2_100));
    expect(FakeEventSource.createdCount).toBe(4);
  });

  it('언마운트 뒤에는 예약된 재연결이 살아나지 않는다', () => {
    authenticated();
    const { wrapper } = setup();

    const { unmount } = renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => FakeEventSource.last!.onerror?.());

    unmount();

    act(() => vi.advanceTimersByTime(60_000));
    // 언마운트 시점의 연결 수(2 = 최초 + 실패 직후 예약분 없음)에서 늘지 않아야 한다.
    expect(FakeEventSource.createdCount).toBe(1);
  });
});
