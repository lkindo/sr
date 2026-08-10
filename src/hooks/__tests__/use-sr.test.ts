import { createElement, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteSRAction, getSRDetailsAction, updateSRAction } from '@/actions/sr.actions';

import { useChangeSRStatus, useDeleteSR, useSRDetails, useUpdateSR } from '../use-sr';

vi.mock('@/actions/sr.actions', () => ({
  getSRDetailsAction: vi.fn(),
  updateSRAction: vi.fn(),
  deleteSRAction: vi.fn(),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

/**
 * SR 상세 화면의 데이터 훅.
 *
 * 이 훅들의 위험은 조회가 아니라 **낙관적 업데이트(optimistic update)** 에 있다.
 * 요청을 보내기 전에 캐시를 먼저 고쳐 화면을 바꾸므로, 실패했을 때 되돌리지 못하면
 * 사용자는 **서버에 반영되지 않은 상태를 반영된 것으로 믿는다.** 그래서 여기서는
 * "성공했을 때 잘 보인다" 보다 **"실패했을 때 원래대로 돌아온다"** 를 더 촘촘히 단언한다.
 *
 * 또 하나: 서버 액션은 실패를 `{ success: false }` 로 돌려주지 던지지 않는다. 훅이 그걸
 * 던지지 않으면 react-query 는 성공으로 보고, 화면은 빈 데이터를 정상처럼 그린다.
 */

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

/** 훅과 캐시를 함께 다뤄야 해서 QueryClient 를 밖으로 꺼낸다. */
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

const SR = {
  id: 'sr-1',
  title: '원래 제목',
  description: '원래 설명',
  status: 'REQUESTED',
  priority: 'MEDIUM',
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue(router as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSRDetails', () => {
  it('성공하면 데이터를 싣는다', async () => {
    vi.mocked(getSRDetailsAction).mockResolvedValue({ success: true, data: SR } as never);

    const { wrapper } = setup();
    const { result } = renderHook(() => useSRDetails('sr-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(SR);
  });

  // 던지지 않으면 실패가 "데이터 없음" 으로 보인다.
  it('액션이 실패를 돌려주면 에러로 만든다', async () => {
    vi.mocked(getSRDetailsAction).mockResolvedValue({
      success: false,
      error: '접근 권한이 없습니다.',
    } as never);

    const { wrapper } = setup();
    const { result } = renderHook(() => useSRDetails('sr-1'), { wrapper });

    // 이 훅은 자체 retry: 2 를 갖는다(지연 1s → 2s). 기본 대기 시간으로는 부족하다.
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 10000 });
    expect(result.current.error?.message).toBe('접근 권한이 없습니다.');
  });

  it('srId 가 비면 요청하지 않는다', () => {
    const { wrapper } = setup();
    renderHook(() => useSRDetails(''), { wrapper });

    expect(getSRDetailsAction).not.toHaveBeenCalled();
  });
});

describe('useUpdateSR', () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };

  it('요청 전에 캐시를 먼저 고쳐 화면을 즉시 바꾼다', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['sr', 'sr-1'], SR);
    // 응답을 붙잡아 두고 낙관적 상태만 관찰한다.
    let release!: (v: unknown) => void;
    vi.mocked(updateSRAction).mockReturnValue(
      new Promise((res) => {
        release = res;
      }) as never
    );

    const { result } = renderHook(() => useUpdateSR('sr-1'), { wrapper });
    result.current.mutate(form({ title: '바뀐 제목', priority: 'HIGH' }));

    await waitFor(() =>
      expect(client.getQueryData(['sr', 'sr-1'])).toMatchObject({
        title: '바뀐 제목',
        priority: 'HIGH',
        description: '원래 설명', // 폼에 없는 값은 건드리지 않는다
      })
    );

    release({ success: true, data: SR });
  });

  // 낙관적 업데이트의 값어치는 전부 이 롤백에 달려 있다.
  it('실패하면 이전 데이터로 되돌리고 오류를 알린다', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['sr', 'sr-1'], SR);
    vi.mocked(updateSRAction).mockResolvedValue({
      success: false,
      error: '수정 권한이 없습니다.',
    } as never);

    const { result } = renderHook(() => useUpdateSR('sr-1'), { wrapper });
    result.current.mutate(form({ title: '바뀐 제목' }));

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(client.getQueryData(['sr', 'sr-1'])).toEqual(SR);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', description: '수정 권한이 없습니다.' })
    );
  });

  it('성공하면 성공 토스트를 띄운다', async () => {
    const { wrapper } = setup();
    vi.mocked(updateSRAction).mockResolvedValue({ success: true, data: SR } as never);

    const { result } = renderHook(() => useUpdateSR('sr-1'), { wrapper });
    result.current.mutate(form({ title: '바뀐 제목' }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '성공', description: 'SR이 수정되었습니다.' })
    );
  });

  // 캐시에 이전 데이터가 없으면 되돌릴 것도 없다. 그 경로에서 죽지 않아야 한다.
  it('캐시가 비어 있어도 안전하게 동작한다', async () => {
    const { wrapper } = setup();
    vi.mocked(updateSRAction).mockResolvedValue({ success: false } as never);

    const { result } = renderHook(() => useUpdateSR('sr-1'), { wrapper });
    result.current.mutate(form({ title: 'x' }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('SR 수정에 실패했습니다.');
  });
});

describe('useDeleteSR', () => {
  it('성공하면 캐시를 비우고 목록으로 이동한다', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['sr', 'sr-1'], SR);
    vi.mocked(deleteSRAction).mockResolvedValue({ success: true } as never);

    const { result } = renderHook(() => useDeleteSR(), { wrapper });
    result.current.mutate('sr-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 삭제된 SR 의 캐시가 남아 있으면 뒤로가기로 유령 데이터가 보인다.
    expect(client.getQueryData(['sr', 'sr-1'])).toBeUndefined();
    expect(router.push).toHaveBeenCalledWith('/srs');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'SR이 삭제되었습니다.' })
    );
  });

  it('실패하면 이전 데이터를 복구하고 오류를 알린다', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['sr', 'sr-1'], SR);
    vi.mocked(deleteSRAction).mockResolvedValue({
      success: false,
      error: '진행 중인 SR 은 삭제할 수 없습니다.',
    } as never);

    const { result } = renderHook(() => useDeleteSR(), { wrapper });
    result.current.mutate('sr-1');

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(client.getQueryData(['sr', 'sr-1'])).toEqual(SR);
    expect(router.push).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: '진행 중인 SR 은 삭제할 수 없습니다.',
      })
    );
  });
});

describe('useChangeSRStatus', () => {
  // `status` 와 `text` 를 함께 준다. `useChangeSRStatus` 는 이제 api-client 를 거치는데,
  // 그쪽은 204 와 빈 본문을 구분하려고 성공 경로에서 `response.text()` 를 읽는다.
  // `json` 만 있는 목은 TypeError 로 실패 경로에 빠진다.
  const okFetch = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
        text: async () => JSON.stringify({ success: true }),
      }))
    );

  it('상태 변경 요청을 action 과 payload 로 보낸다', async () => {
    okFetch();
    const { wrapper } = setup();

    const { result } = renderHook(() => useChangeSRStatus('sr-1'), { wrapper });
    result.current.mutate({ action: 'hold', payload: { reason: '자재 대기' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetch).toHaveBeenCalledWith(
      '/api/srs/sr-1/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'hold', reason: '자재 대기' }),
      })
    );
  });

  // 액션마다 낙관적으로 찍는 상태가 다르다. 잘못 찍으면 화면이 잠깐 거짓말을 한다.
  it.each([
    ['start', 'IN_PROGRESS'],
    ['resume', 'IN_PROGRESS'],
    ['reopen', 'IN_PROGRESS'],
    ['hold', 'ON_HOLD'],
    ['reject', 'REJECTED'],
    ['complete', 'COMPLETED'],
    ['confirm', 'CONFIRMED'],
  ])('%s 는 낙관적으로 %s 로 바꾼다', async (action, expected) => {
    const { client, wrapper } = setup();
    client.setQueryData(['sr', 'sr-1'], SR);
    let release!: (v: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((res) => {
            release = res;
          })
      )
    );

    const { result } = renderHook(() => useChangeSRStatus('sr-1'), { wrapper });
    result.current.mutate({ action });

    await waitFor(() =>
      expect(client.getQueryData(['sr', 'sr-1'])).toMatchObject({ status: expected })
    );

    release({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
  });

  it('모르는 액션이면 상태를 바꾸지 않는다', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['sr', 'sr-1'], SR);
    okFetch();

    const { result } = renderHook(() => useChangeSRStatus('sr-1'), { wrapper });
    result.current.mutate({ action: '없는액션' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(['sr', 'sr-1'])).toMatchObject({ status: 'REQUESTED' });
  });

  it('응답이 실패면 서버 메시지로 롤백하고 알린다', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['sr', 'sr-1'], SR);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: '허용되지 않는 상태 전이입니다.' }),
      }))
    );

    const { result } = renderHook(() => useChangeSRStatus('sr-1'), { wrapper });
    result.current.mutate({ action: 'complete' });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(client.getQueryData(['sr', 'sr-1'])).toEqual(SR);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: '허용되지 않는 상태 전이입니다.',
      })
    );
  });

  // 서버가 에러 본문을 안 주는 경우(502 등)에도 사용자에게 뭔가는 보여야 한다.
  it('에러 본문이 비어도 기본 문구로 알린다', async () => {
    const { wrapper } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    );

    const { result } = renderHook(() => useChangeSRStatus('sr-1'), { wrapper });
    result.current.mutate({ action: 'complete' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('상태 변경에 실패했습니다.');
  });

  it('끝나면 서버 컴포넌트도 새로 고친다', async () => {
    okFetch();
    const { wrapper } = setup();

    const { result } = renderHook(() => useChangeSRStatus('sr-1'), { wrapper });
    result.current.mutate({ action: 'start' });

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });
});
