import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { qk } from '@/lib/query-keys';

import {
  useAssignClient,
  type UseAssignClientOptions,
  useRemoveClient,
} from '../use-client-assignment';

/**
 * 사용자 고객사 소속 변이 훅.
 *
 * 이 훅의 위험은 성공 경로가 아니라 **409 다.** 서버는 "진행 중인 SR 이 있다" 를
 * `409 + code:'ONGOING_SRS'` 로 알리는데, 이것은 실패가 아니라 확인을 요구하는
 * 중간 상태다. 이걸 react-query 의 에러로 흘리면 확인 다이얼로그와 함께 **빨간
 * 토스트가 뜬다** — 사용자는 "실패했다" 고 읽고 확인 버튼을 누르지 않는다.
 * 그래서 아래 테스트는 409 에서 **토스트가 뜨지 않는 것**을 명시적으로 단언한다.
 *
 * 나머지 하나는 강제 재시도의 본문이다. `force` 가 아닐 때 플래그를 아예 보내지
 * 않는 것이 서버와의 계약이라(보내면 항상 강제 할당이 된다) 본문을 직접 확인한다.
 */

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

/** api-client 는 성공 시 `text()`, 실패 시 `json()` 을 읽는다. 둘 다 채워 둔다. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const TARGET = { clientId: 'client-1', clientName: '아크로' };

/** 진행 중인 SR 때문에 서버가 거부한 응답. */
const ONGOING_SRS_409 = jsonResponse(409, {
  error: '진행 중인 SR 이 있습니다.',
  code: 'ONGOING_SRS',
  data: { ongoingSRCount: 3 },
});

function assignOptions(overrides: Partial<UseAssignClientOptions> = {}): UseAssignClientOptions {
  return {
    userId: 'user-1',
    fallbackMessage: 'Failed to assign client',
    successDescription: (target, handled) => `${target.clientName}/${handled}`,
    errorDescription: '고객사 할당에 실패했습니다.',
    ...overrides,
  };
}

/** 마지막 fetch 호출의 URL 과 옵션. 요청 본문이 계약이라 직접 들여다본다. */
function lastRequest(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit] | undefined;
  if (!call) throw new Error('fetch 가 호출되지 않았다');
  return { url: call[0], init: call[1] };
}

function lastRequestBody(fetchMock: ReturnType<typeof vi.fn>): unknown {
  return JSON.parse(String(lastRequest(fetchMock).init.body));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useAssignClient', () => {
  it('성공하면 성공 토스트를 띄우고 onApplied 를 부르며 users 캐시를 무효화한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const onApplied = vi.fn();
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useAssignClient(assignOptions({ onApplied })), { wrapper });

    act(() => result.current.assign(TARGET));

    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith({ title: '성공', description: '아크로/0' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.users.all });
    expect(result.current.pending).toBeNull();
  });

  it('force 가 아니면 본문에 force 플래그를 넣지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = setup();
    const { result } = renderHook(() => useAssignClient(assignOptions()), { wrapper });

    act(() => result.current.assign(TARGET));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastRequest(fetchMock).url).toBe('/api/users/user-1/client');
    expect(lastRequest(fetchMock).init.method).toBe('PATCH');
    expect(lastRequestBody(fetchMock)).toEqual({ clientId: 'client-1' });
  });

  it('서버가 처리한 진행 중 SR 건수를 성공 문구에 넘긴다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { data: { ongoingSRsHandled: 2 } }))
    );

    const { wrapper } = setup();
    const { result } = renderHook(() => useAssignClient(assignOptions()), { wrapper });

    act(() => result.current.assign(TARGET));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({ title: '성공', description: '아크로/2' })
    );
  });

  it('409 ONGOING_SRS 는 에러가 아니라 확인 대기 상태다 — 토스트를 띄우지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ONGOING_SRS_409));

    const onBlocked = vi.fn();
    const onApplied = vi.fn();
    const { wrapper } = setup();
    const { result } = renderHook(() => useAssignClient(assignOptions({ onBlocked, onApplied })), {
      wrapper,
    });

    act(() => result.current.assign(TARGET));

    await waitFor(() => expect(result.current.pending).not.toBeNull());
    expect(result.current.pending).toEqual({ ...TARGET, ongoingSRCount: 3 });
    expect(onBlocked).toHaveBeenCalledTimes(1);
    // 이것이 이 훅의 존재 이유다. 회귀하면 확인 다이얼로그 옆에 빨간 토스트가 뜬다.
    expect(toast).not.toHaveBeenCalled();
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('확인 후 강제 재시도는 force:true 를 실어 보내고 대기 상태를 지운다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ONGOING_SRS_409)
      .mockResolvedValueOnce(jsonResponse(200, { data: { ongoingSRsHandled: 3 } }));
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = setup();
    const { result } = renderHook(() => useAssignClient(assignOptions()), { wrapper });

    act(() => result.current.assign(TARGET));
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    // 확인 다이얼로그의 "계속 할당" 이 하는 일.
    act(() => result.current.assign(result.current.pending!, true));

    await waitFor(() => expect(result.current.pending).toBeNull());
    expect(lastRequestBody(fetchMock)).toEqual({ clientId: 'client-1', force: true });
    expect(toast).toHaveBeenCalledWith({ title: '성공', description: '아크로/3' });
  });

  it('409 가 아닌 실패는 에러 토스트를 띄우고 대기 상태를 지운다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ONGOING_SRS_409)
      .mockResolvedValueOnce(jsonResponse(403, { error: '권한이 없습니다.' }));
    vi.stubGlobal('fetch', fetchMock);

    const { wrapper } = setup();
    const { result } = renderHook(() => useAssignClient(assignOptions()), { wrapper });

    act(() => result.current.assign(TARGET));
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    act(() => result.current.assign(result.current.pending!, true));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '권한이 없습니다.',
        variant: 'destructive',
      })
    );
    expect(result.current.pending).toBeNull();
  });

  it('서버가 메시지를 주지 않으면 화면별 fallback 문구를 쓴다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, {})));

    const { wrapper } = setup();
    const { result } = renderHook(
      () => useAssignClient(assignOptions({ fallbackMessage: 'Failed to change client' })),
      { wrapper }
    );

    act(() => result.current.assign(TARGET));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: 'Failed to change client',
        variant: 'destructive',
      })
    );
  });

  it('clearPending 은 확인 다이얼로그를 닫는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ONGOING_SRS_409));

    const { wrapper } = setup();
    const { result } = renderHook(() => useAssignClient(assignOptions()), { wrapper });

    act(() => result.current.assign(TARGET));
    await waitFor(() => expect(result.current.pending).not.toBeNull());

    act(() => result.current.clearPending());
    expect(result.current.pending).toBeNull();
  });
});

describe('useRemoveClient', () => {
  const removeOptions = {
    userId: 'user-1',
    fallbackMessage: 'Failed to remove client',
    successDescription: '해제되었습니다.',
    errorDescription: '고객사 소속 해제에 실패했습니다.',
  };

  it('DELETE 를 보내고 성공하면 onRemoved 와 무효화를 부른다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const onRemoved = vi.fn();
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRemoveClient({ ...removeOptions, onRemoved }), {
      wrapper,
    });

    act(() => result.current.remove());

    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(lastRequest(fetchMock).url).toBe('/api/users/user-1/client');
    expect(lastRequest(fetchMock).init.method).toBe('DELETE');
    expect(toast).toHaveBeenCalledWith({ title: '성공', description: '해제되었습니다.' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.users.all });
  });

  it('실패하면 서버 메시지로 에러 토스트를 띄우고 onRemoved 를 부르지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: '권한 없음' })));

    const onRemoved = vi.fn();
    const { wrapper } = setup();
    const { result } = renderHook(() => useRemoveClient({ ...removeOptions, onRemoved }), {
      wrapper,
    });

    act(() => result.current.remove());

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith({
        title: '오류',
        description: '권한 없음',
        variant: 'destructive',
      })
    );
    expect(onRemoved).not.toHaveBeenCalled();
  });
});
