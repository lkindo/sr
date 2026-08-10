import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { qk } from '@/lib/query-keys';

import { SRStatusChangeDialog } from '../SRStatusChangeDialog';

/**
 * SR 상태 변경 다이얼로그(완료/보류/거절/재오픈 공용).
 *
 * 이 컴포넌트에서 가장 비싼 계약은 폼 검증이 아니라 **성공 후 순서**다:
 * 다이얼로그를 먼저 닫고 그다음에 갱신해야 한다. 순서를 뒤집으면 이미 처리된
 * 다이얼로그가 갱신이 끝날 때까지 열려 있어 사용자가 같은 전이를 두 번 제출한다.
 * `useMutation` 으로 옮기면서 `await mutateAsync()` 뒤에 닫기를 두거나
 * `use-sr.ts` 의 `useChangeSRStatus`(onSettled 에서 갱신) 를 재사용하면 정확히
 * 그 순서가 된다 — 그래서 아래 "무효화가 끝나기 전에 닫힌다" 테스트가 있다.
 *
 * Radix Dialog 는 포털·포인터 이벤트 때문에 jsdom 에서 라이브러리 구현에 묶인다.
 * 확인하려는 것은 폼의 판정과 후처리 순서이므로 프리미티브는 공용 대역을 쓴다.
 */

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

const onOpenChange = vi.fn();

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

const baseProps = {
  open: true,
  onOpenChange,
  srId: 'sr-1',
  srNumber: 'SR-2026-001',
};

const okFetch = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"success":true}' }))
  );

/** 실패는 4xx 로 만든다 — 5xx 는 재시도 백오프 때문에 대기가 늘어진다. */
const failFetch = (message: string) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: message }) }))
  );

/** 마지막 요청의 URL·메서드·본문. */
const sent = () => {
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  return { url, method: init!.method, body: JSON.parse(init!.body as string) };
};

const field = () => screen.getByRole('textbox');
const write = (value: string) => fireEvent.change(field(), { target: { value } });
const submit = (label: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name: label }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue(router as never);
  okFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SRStatusChangeDialog — 액션별 설정', () => {
  it('닫혀 있으면 렌더하지 않는다', () => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="complete" open={false} />, { wrapper });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  /**
   * 제출 버튼 문구는 글자 그대로여야 한다 — e2e 헬퍼의 `SR_ACTION_DIALOG_SUBMIT` 이
   * `/^완료 처리$/` 같은 정규식으로 이 버튼을 찾는다.
   */
  it.each([
    ['complete', 'SR 완료 처리', '완료 처리'],
    ['hold', 'SR 보류 처리', '보류 처리'],
    ['reject', 'SR 거절 처리', '거절 처리'],
    ['reopen', 'SR 재오픈', '재오픈'],
  ] as const)('%s 는 제목 "%s" 와 버튼 "%s" 를 쓴다', (action, title, label) => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action={action} />, { wrapper });

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  // complete 만 본문 키가 다르다. 여기가 어긋나면 서버는 해결 내용을 못 받는다.
  it('complete 는 resolutionDescription 으로 보낸다', async () => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="complete" />, { wrapper });

    write('원인 조치 후 재기동');
    submit('완료 처리');

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent()).toEqual({
      url: '/api/srs/sr-1/status',
      method: 'PATCH',
      body: { action: 'complete', resolutionDescription: '원인 조치 후 재기동' },
    });
  });

  it.each(['hold', 'reject', 'reopen'] as const)('%s 는 reason 으로 보낸다', async (action) => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action={action} />, { wrapper });

    write('  사유 본문  ');
    submit(/보류 처리|거절 처리|재오픈/);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // 앞뒤 공백은 잘라서 보낸다.
    expect(sent().body).toEqual({ action, reason: '사유 본문' });
  });
});

describe('SRStatusChangeDialog — 검증', () => {
  it('내용이 비면 서버를 부르지 않는다', () => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="hold" />, { wrapper });

    submit('보류 처리');

    expect(fetch).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '오류', description: '보류 사유를 입력해주세요.' })
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('공백만 입력해도 막는다', () => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="reject" />, { wrapper });

    write('   ');
    submit('거절 처리');

    expect(fetch).not.toHaveBeenCalled();
  });

  /**
   * `disabledReason` 은 재오픈의 "완료 후 7일" 창이 들어오는 자리다. 경고만 띄우고
   * 제출이 열려 있으면 서버가 어차피 거부하는 요청을 사용자가 계속 보내게 된다.
   */
  it('disabledReason 이 있으면 경고를 띄우고 제출을 막는다', () => {
    const { wrapper } = setup();
    render(
      <SRStatusChangeDialog
        {...baseProps}
        action="reopen"
        disabledReason="완료 후 7일이 지나 재오픈할 수 없습니다."
      />,
      { wrapper }
    );

    expect(screen.getByText('완료 후 7일이 지나 재오픈할 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재오픈' })).toBeDisabled();
    expect(field()).toBeDisabled();

    // 버튼이 막혀도 Ctrl+Enter 경로가 열려 있으면 우회된다.
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('Ctrl+Enter 로도 제출한다', async () => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="hold" />, { wrapper });

    write('자재 대기');
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().body).toEqual({ action: 'hold', reason: '자재 대기' });
  });
});

describe('SRStatusChangeDialog — 성공 후 순서', () => {
  /**
   * 이 저장소가 한 번 겪은 실패 양식: 갱신을 먼저 기다리면 다이얼로그가 그동안
   * 열린 채 남아 사용자가 두 번 제출한다. 무효화를 붙잡아 두고, **그 사이에**
   * 다이얼로그가 이미 닫혀 있는지 본다.
   */
  it('무효화가 끝나기 전에 다이얼로그를 먼저 닫는다', async () => {
    const { client, wrapper } = setup();
    let release!: () => void;
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );

    render(<SRStatusChangeDialog {...baseProps} action="complete" />, { wrapper });

    write('처리 완료');
    submit('완료 처리');

    // 갱신은 아직 진행 중인데 닫기와 성공 토스트는 이미 끝나 있어야 한다.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '성공', description: 'SR이 완료 처리되었습니다.' })
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.sr.detail('sr-1') });
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();

    release();

    // 갱신이 끝나면 그때 서버 컴포넌트를 새로 고치고 목록으로 이동한다.
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/srs'));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('전송 중에는 입력과 버튼을 잠근다', async () => {
    let release!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      )
    );

    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="hold" />, { wrapper });

    write('자재 대기');
    submit('보류 처리');

    await waitFor(() => expect(screen.getByRole('button', { name: '처리 중...' })).toBeDisabled());
    expect(field()).toBeDisabled();
    // 취소 버튼도 함께 잠겨야 처리 중 이탈이 막힌다.
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();

    release({ ok: true, status: 200, text: async () => '{}' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe('SRStatusChangeDialog — 실패', () => {
  /**
   * 실패했는데 닫히거나 입력이 지워지면 사용자는 방금 쓴 사유를 잃고, 성공했는지
   * 실패했는지도 알 수 없게 된다.
   */
  it('서버 메시지를 띄우고 다이얼로그를 열어 둔 채 입력을 유지한다', async () => {
    failFetch('허용되지 않는 상태 전이입니다.');
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    render(<SRStatusChangeDialog {...baseProps} action="complete" />, { wrapper });

    write('처리 완료');
    submit('완료 처리');

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '오류',
          description: '허용되지 않는 상태 전이입니다.',
          variant: 'destructive',
        })
      )
    );

    expect(onOpenChange).not.toHaveBeenCalled();
    expect((field() as HTMLTextAreaElement).value).toBe('처리 완료');
    expect(invalidate).not.toHaveBeenCalled();
    // 실패는 아무것도 갱신하지 않는다 — 화면은 그대로 있어야 한다.
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    // 다시 시도할 수 있어야 한다.
    expect(screen.getByRole('button', { name: '완료 처리' })).toBeEnabled();
  });

  // 서버가 에러 본문을 주지 않아도(프록시 502, 빈 본문 등) 사용자에게 뭔가는 보여야 한다.
  it('에러 본문이 비어도 기본 문구로 알린다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }))
    );

    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="reject" />, { wrapper });

    write('중복 요청');
    submit('거절 처리');

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '오류',
          description: '상태 변경에 실패했습니다.',
          variant: 'destructive',
        })
      )
    );
  });
});
