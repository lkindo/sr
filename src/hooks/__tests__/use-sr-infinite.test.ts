import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSRActivitiesAction, getSRCommentsAction } from '@/actions/sr.actions';
import { PAGINATION } from '@/lib/constants';

import { useSRActivitiesInfinite, useSRCommentsInfinite } from '../use-sr-infinite';

vi.mock('@/actions/sr.actions', () => ({
  getSRActivitiesAction: vi.fn(),
  getSRCommentsAction: vi.fn(),
}));

/**
 * 무한 스크롤 훅의 계약.
 *
 * 이 훅들은 서버 액션의 `Result` 를 react-query 가 이해하는 형태로 옮긴다. 그 변환에
 * 실수가 나기 쉬운 지점이 셋이다.
 *
 * 1. **실패를 던지지 않으면 조용히 성공이 된다.** 액션은 `{ success: false }` 를 돌려주지
 *    던지지 않는다. 훅이 그대로 반환하면 react-query 는 성공으로 보고 `isError` 가 false 인
 *    채 화면에 빈 목록이 뜬다 — 사용자는 "댓글이 없다" 로 오해한다.
 * 2. **다음 페이지 커서.** `nextCursor` 가 null 인데 undefined 로 바꾸지 않으면 react-query 는
 *    "다음 페이지가 있다" 로 판단해 마지막 페이지를 무한히 다시 부른다.
 * 3. **srId 가 비었을 때.** `enabled` 가 없으면 상세 페이지 진입 직후 빈 id 로 요청이 나간다.
 */

/** react-query 훅을 격리해 렌더한다. 재시도는 끈다 — 실패 단언이 3회 재시도를 기다리게 된다. */
function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

/**
 * 두 액션은 페이지의 항목 키 이름이 서로 다르다(활동은 activities, 댓글은 comments).
 * 목을 실제 반환 형태에 맞춰야 테스트가 거짓 안심을 주지 않는다.
 */
const page = (key: 'activities' | 'comments', rows: unknown[], nextCursor: string | null) => ({
  success: true as const,
  data: { [key]: rows, nextCursor },
});

describe('useSRActivitiesInfinite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('첫 페이지를 커서 없이 요청하고 결과를 그대로 싣는다', async () => {
    vi.mocked(getSRActivitiesAction).mockResolvedValue(
      page('activities', [{ id: 'a1' }], null) as never
    );

    const { result } = renderHook(() => useSRActivitiesInfinite('sr-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getSRActivitiesAction).toHaveBeenCalledWith('sr-1', {
      cursor: undefined,
      limit: PAGINATION.DEFAULT_LIMIT,
    });
    expect(result.current.data?.pages[0]?.activities).toEqual([{ id: 'a1' }]);
  });

  // nextCursor 가 null 이면 "끝" 이다. undefined 로 바꾸지 않으면 react-query 가
  // 마지막 페이지를 계속 다시 부른다.
  it('nextCursor 가 null 이면 다음 페이지가 없다고 본다', async () => {
    vi.mocked(getSRActivitiesAction).mockResolvedValue(page('activities', [], null) as never);

    const { result } = renderHook(() => useSRActivitiesInfinite('sr-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('nextCursor 가 있으면 그 값으로 다음 페이지를 부른다', async () => {
    vi.mocked(getSRActivitiesAction)
      .mockResolvedValueOnce(page('activities', [{ id: 'a1' }], 'cursor-1') as never)
      .mockResolvedValueOnce(page('activities', [{ id: 'a2' }], null) as never);

    const { result } = renderHook(() => useSRActivitiesInfinite('sr-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await result.current.fetchNextPage();

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(getSRActivitiesAction).toHaveBeenLastCalledWith('sr-1', {
      cursor: 'cursor-1',
      limit: PAGINATION.DEFAULT_LIMIT,
    });
  });

  // 이것이 이 훅에서 가장 중요한 계약이다. 던지지 않으면 실패가 "빈 목록" 으로 보인다.
  it('액션이 실패를 돌려주면 에러로 만든다', async () => {
    vi.mocked(getSRActivitiesAction).mockResolvedValue({
      success: false,
      error: '권한이 없습니다.',
    } as never);

    const { result } = renderHook(() => useSRActivitiesInfinite('sr-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('권한이 없습니다.');
  });

  it('실패에 메시지가 없어도 기본 문구로 에러를 만든다', async () => {
    vi.mocked(getSRActivitiesAction).mockResolvedValue({ success: false } as never);

    const { result } = renderHook(() => useSRActivitiesInfinite('sr-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('활동 내역을 불러올 수 없습니다.');
  });

  it('srId 가 비면 요청하지 않는다', () => {
    renderHook(() => useSRActivitiesInfinite(''), { wrapper: createWrapper() });

    expect(getSRActivitiesAction).not.toHaveBeenCalled();
  });
});

describe('useSRCommentsInfinite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('댓글 액션을 부르고 결과를 싣는다', async () => {
    vi.mocked(getSRCommentsAction).mockResolvedValue(
      page('comments', [{ id: 'c1' }], null) as never
    );

    const { result } = renderHook(() => useSRCommentsInfinite('sr-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getSRCommentsAction).toHaveBeenCalledWith('sr-1', {
      cursor: undefined,
      limit: PAGINATION.DEFAULT_LIMIT,
    });
    expect(result.current.data?.pages[0]?.comments).toEqual([{ id: 'c1' }]);
  });

  it('액션이 실패를 돌려주면 에러로 만든다', async () => {
    vi.mocked(getSRCommentsAction).mockResolvedValue({ success: false } as never);

    const { result } = renderHook(() => useSRCommentsInfinite('sr-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('댓글을 불러올 수 없습니다.');
  });

  it('srId 가 비면 요청하지 않는다', () => {
    renderHook(() => useSRCommentsInfinite(''), { wrapper: createWrapper() });

    expect(getSRCommentsAction).not.toHaveBeenCalled();
  });
});
