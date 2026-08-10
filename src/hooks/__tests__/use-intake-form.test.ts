import { createElement, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSRHandlersForSelection } from '@/actions/user.actions';

import { useIntakeForm } from '../use-intake-form';

vi.mock('@/actions/user.actions', () => ({
  getSRHandlersForSelection: vi.fn(),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

/**
 * SR 접수 폼 훅.
 *
 * 이 훅은 한 화면에서 **접수(POST)와 수정(PATCH) 두 모드**를 겸한다. 모드는 사용자가
 * 고르는 게 아니라 SR 의 상태에서 파생되고, 그에 따라 HTTP 메서드·기본값·성공 문구가
 * 전부 달라진다. 그래서 여기서 가장 중요한 단언은 **상태 → 모드 판정**이다.
 * 잘못 판정하면 접수해야 할 SR 을 수정하거나(또는 그 반대) 조용히 엉뚱한 값이 들어간다.
 *
 * 수정 불가 상태(완료·반려 등)에서 폼을 열어 주면 사용자가 다 채운 뒤에야 서버가
 * 거절한다. 그래서 훅이 진입 시점에 막고 목록으로 되돌린다.
 */

const router = { push: vi.fn(), refresh: vi.fn(), replace: vi.fn() };

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children);
}

/** `/api/srs/:id/intake` 가 돌려주는 최소 형태. */
const srPayload = (over: Record<string, unknown> = {}) => ({
  id: 'sr-1',
  status: 'REQUESTED',
  requestedPriority: 'HIGH',
  serviceCategory: { slaHours: 24, handler: { id: 'u-handler' } },
  ...over,
});

/** fetch 대역. 첫 호출은 SR 조회, 이후는 제출이다. */
function stubFetch(responses: Array<Partial<Response> & { json?: () => Promise<unknown> }>) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

/**
 * 성공 응답 대역.
 *
 * ⚠️ `text` 를 함께 준다. SR 조회가 `@/lib/api-client` 를 거치면서 성공 본문을
 * `response.text()` 로 읽기 때문이다(204·빈 본문을 함께 다루려는 설계). `json` 만 있는
 * 목은 성공 경로에서 "text is not a function" 으로 죽고, 그 TypeError 는 훅의 catch 에
 * 걸려 **조회 실패 케이스처럼 위장된 통과**를 만든다.
 *
 * 제출(POST/PATCH)은 아직 `fetch` 를 직접 쓰므로 `json` 만으로도 동작하지만, 두 경로가
 * 같은 대역을 공유하도록 여기서 한 번에 준다.
 */
const okSR = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
  text: async () => JSON.stringify(data),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue(router as never);
  vi.mocked(getSRHandlersForSelection).mockResolvedValue({
    success: true,
    data: [{ id: 'u-1', name: '엔지니어', email: 'e@example.com' }],
  } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIntakeForm — 모드 판정', () => {
  it('REQUESTED 는 접수 모드이고 카테고리 담당자를 미리 채운다', async () => {
    stubFetch([okSR(srPayload())]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isEditMode).toBe(false);
    // 접수 모드의 기본값은 "요청자가 희망한 우선순위" 와 카테고리 SLA 에서 온다.
    expect(result.current.form.getValues('actualPriority')).toBe('HIGH');
    expect(result.current.form.getValues('estimatedHours')).toBe(24);
    expect(result.current.form.getValues('assigneeId')).toBe('u-handler');
  });

  it.each(['INTAKE', 'IN_PROGRESS'])('%s 는 수정 모드이고 기존 값을 싣는다', async (status) => {
    stubFetch([
      okSR(
        srPayload({
          status,
          actualPriority: 'CRITICAL',
          estimatedHours: 8,
          intakeNotes: '기존 메모',
          assignee: { id: 'u-9' },
        })
      ),
    ]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isEditMode).toBe(true);
    expect(result.current.form.getValues('actualPriority')).toBe('CRITICAL');
    expect(result.current.form.getValues('estimatedHours')).toBe(8);
    expect(result.current.form.getValues('intakeNotes')).toBe('기존 메모');
    expect(result.current.form.getValues('assigneeId')).toBe('u-9');
  });

  // 다 채운 뒤에 서버가 거절하는 것보다, 들어오는 순간 막는 편이 낫다.
  it.each(['COMPLETED', 'CONFIRMED', 'REJECTED', 'ON_HOLD'])(
    '%s 는 수정할 수 없으므로 목록으로 되돌린다',
    async (status) => {
      stubFetch([okSR(srPayload({ status }))]);

      renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });

      await waitFor(() => expect(router.push).toHaveBeenCalledWith('/srs'));
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringContaining('수정할 수 없습니다') })
      );
    }
  );

  it('SR 조회가 실패하면 알리고 로딩을 끝낸다', async () => {
    stubFetch([{ ok: false, status: 404, json: async () => ({}) }]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: '데이터를 불러오는데 실패했습니다.',
      })
    );
  });
});

describe('useIntakeForm — 담당자 목록', () => {
  it('담당자 조회가 실패해도 폼은 계속 쓸 수 있다', async () => {
    stubFetch([okSR(srPayload())]);
    vi.mocked(getSRHandlersForSelection).mockResolvedValue({
      success: false,
      error: '권한이 없습니다.',
    } as never);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // 목록을 못 불러왔다고 접수 화면 전체가 막히면 안 된다. 대신 반드시 알린다.
    expect(result.current.users).toEqual([]);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', description: '권한이 없습니다.' })
    );
  });

  it('담당자 조회가 던져도 폼은 계속 쓸 수 있다', async () => {
    stubFetch([okSR(srPayload())]);
    vi.mocked(getSRHandlersForSelection).mockRejectedValue(new Error('네트워크 오류'));

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});

describe('useIntakeForm — 제출', () => {
  const values = {
    actualPriority: 'HIGH' as const,
    estimatedHours: 8,
    estimatedCompletionDate: new Date('2026-08-20T00:00:00Z'),
    intakeNotes: '메모',
    assigneeId: 'u-1',
  };

  it('접수 모드는 POST 로 보내고 목록으로 이동한다', async () => {
    const fetchMock = stubFetch([okSR(srPayload()), okSR({ ok: true })]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.onSubmit(values);
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/srs/sr-1/intake',
      expect.objectContaining({ method: 'POST' })
    );
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'SR이 접수되었습니다.' })
    );
    expect(router.push).toHaveBeenCalledWith('/srs');
  });

  it('수정 모드는 PATCH 로 보낸다', async () => {
    const fetchMock = stubFetch([
      okSR(srPayload({ status: 'INTAKE', serviceCategory: { slaHours: 24, handler: null } })),
      okSR({ ok: true }),
    ]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });
    await waitFor(() => expect(result.current.isEditMode).toBe(true));

    await act(async () => {
      await result.current.onSubmit(values);
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/srs/sr-1/intake',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: '접수 정보가 수정되었습니다.' })
    );
  });

  // 서버가 주는 이유를 그대로 보여 줘야 사용자가 다음 행동을 정할 수 있다.
  it('서버가 JSON 으로 이유를 주면 그대로 알린다', async () => {
    stubFetch([
      okSR(srPayload()),
      {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ error: '담당자가 비활성 상태입니다.' }),
      } as never,
    ]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.onSubmit(values);
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: '담당자가 비활성 상태입니다.',
      })
    );
    // 실패했으면 화면에 남아야 한다 — 이동하면 사용자가 입력을 잃는다.
    expect(router.push).not.toHaveBeenCalled();
  });

  it('본문이 JSON 이 아니면 텍스트를 그대로 쓴다', async () => {
    stubFetch([
      okSR(srPayload()),
      {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () => '게이트웨이 오류',
      } as never,
    ]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.onSubmit(values);
    });

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: '게이트웨이 오류' }));
  });

  it('본문이 비어 있으면 상태 코드로 메시지를 만든다', async () => {
    stubFetch([
      okSR(srPayload()),
      {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      } as never,
    ]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.onSubmit(values);
    });

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('500') })
    );
  });

  it('제출이 끝나면 submitting 이 풀린다', async () => {
    stubFetch([
      okSR(srPayload()),
      { ok: false, status: 500, statusText: 'x', text: async () => '' } as never,
    ]);

    const { result } = renderHook(() => useIntakeForm({ srId: 'sr-1' }), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.onSubmit(values);
    });

    // 풀리지 않으면 버튼이 영구히 비활성이 되어 재시도할 수 없다.
    expect(result.current.submitting).toBe(false);
  });
});
