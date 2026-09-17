import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { qk } from '@/lib/query-keys';
import { formatISODateInAppZone } from '@/lib/timezone';

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
const failFetch = (message: string, status = 400) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status, json: async () => ({ error: message }) }))
  );

/** 마지막 요청의 URL·메서드·본문. */
const sent = () => {
  const [url, init] = vi.mocked(fetch).mock.calls[0]!;
  return { url, method: init!.method, body: JSON.parse(init!.body as string) };
};

const field = () => screen.getByRole('textbox');
const write = (value: string) => fireEvent.change(field(), { target: { value } });
/**
 * 보류의 예상 해제일 입력. 헌법 §2 는 보류에 사유 **와** 예상 해제일을 모두 요구하므로
 * hold 다이얼로그는 사유만으로 제출되지 않는다.
 *
 * 고정 날짜를 쓰면 안 된다. 입력의 `min` 이 실행 시점의 KST 오늘이라, 그 날이 지나면
 * 값이 min 아래로 떨어져 jsdom 의 폼 검증(rangeUnderflow)이 버튼 제출을 조용히 막는다
 * — '2026-09-01' 이 실제로 그렇게 시한폭탄이 됐다. 그래서 컴포넌트와 같은 헬퍼로
 * 실행 시점 기준 30일 뒤를 만든다(KST 는 DST 가 없어 30×24h 가 곧 30 달력일이다).
 */
const HOLD_RELEASE_DATE = formatISODateInAppZone(Date.now() + 30 * 24 * 60 * 60 * 1000);
const writeHoldDate = (value: string = HOLD_RELEASE_DATE) =>
  fireEvent.change(screen.getByLabelText(/예상 해제일/), { target: { value } });
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
    if (action === 'hold') writeHoldDate();
    submit(/보류 처리|거절 처리|재오픈/);

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // 앞뒤 공백은 잘라서 보낸다. 보류만 예상 해제일이 함께 실린다.
    expect(sent().body).toEqual({
      action,
      reason: '사유 본문',
      ...(action === 'hold' ? { expectedHoldReleaseDate: HOLD_RELEASE_DATE } : {}),
    });
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

  /**
   * 입력 상한은 서버 스키마(statusActionSchema)와 같은 상수다. 사유는 255자 —
   * 막지 않으면 긴 사유를 다 쓴 뒤에야 서버 400 으로 알게 된다.
   */
  it.each([
    ['hold', 255],
    ['reject', 255],
    ['reopen', 255],
    ['complete', 5000],
  ] as const)('%s 입력은 최대 %i 자로 제한한다', (action, max) => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action={action} />, { wrapper });

    expect(field()).toHaveAttribute('maxlength', String(max));
  });

  it('Ctrl+Enter 로도 제출한다', async () => {
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="hold" />, { wrapper });

    write('자재 대기');
    writeHoldDate();
    fireEvent.keyDown(field(), { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().body).toEqual({
      action: 'hold',
      reason: '자재 대기',
      expectedHoldReleaseDate: HOLD_RELEASE_DATE,
    });
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
    writeHoldDate();
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

    // 이유는 다이얼로그 안에 남고, 토스트는 실패 사실만 짧게 알린다(중복 낭독 방지).
    expect(await screen.findByRole('alert')).toHaveTextContent('허용되지 않는 상태 전이입니다.');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '완료 처리하지 못했습니다', variant: 'destructive' })
    );
    expect(toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ description: '허용되지 않는 상태 전이입니다.' })
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

  /**
   * 토스트는 몇 초 뒤 사라진다. 재오픈 창 만료·권한 없음처럼 다시 눌러도 같은 답이 나오는
   * 거부는 이유가 다이얼로그 안에 남아 있어야 사용자가 다음 행동을 정할 수 있다.
   */
  it.each([
    [
      400,
      '완료 후 7일이 지나 재오픈할 수 없습니다. (완료 2026. 09. 01. 14:00 · 재오픈 기한 2026. 09. 08. 14:00) 추가 작업이 필요하면 새 SR을 등록해주세요.',
    ],
    [403, 'SR 수정 권한이 없습니다.'],
  ] as const)(
    '서버가 %i 으로 거부하면 그 이유를 다이얼로그 안에 남긴다',
    async (status, message) => {
      failFetch(message, status);
      const { wrapper } = setup();
      render(<SRStatusChangeDialog {...baseProps} action="reopen" />, { wrapper });

      // 거부 전에는 오류 영역이 없다.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      write('같은 문제가 재발했습니다');
      submit('재오픈');

      const inline = await screen.findByRole('alert');
      expect(inline).toHaveTextContent(message);
      // 토스트는 짧은 제목만 맡는다 — 같은 긴 문장을 인라인과 토스트가 동시에 말하면
      // 낭독기가 두 번 읽고 390px 에서는 토스트가 헤더를 덮는다.
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '재오픈하지 못했습니다', variant: 'destructive' })
      );
      expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: message }));
      expect(onOpenChange).not.toHaveBeenCalled();
    }
  );

  it('다시 제출하거나 닫으면 남겨 둔 서버 오류를 지운다', async () => {
    failFetch('다른 사용자가 먼저 이 SR을 변경했습니다.');
    const { wrapper } = setup();
    render(<SRStatusChangeDialog {...baseProps} action="reopen" />, { wrapper });

    write('재작업 필요');
    submit('재오픈');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    // 다시 제출하면 새 판정을 기다리는 동안 지난 오류를 보이지 않는다.
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
    submit('재오픈');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    release({ ok: false, status: 400, json: async () => ({ error: '또 실패' }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('또 실패');

    // 취소로 닫으면 지운다 — 다음에 열었을 때 지난 오류가 남아 있으면 안 된다.
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

    // 본문이 없으면 기본 문구가 인라인 오류로 남고, 토스트는 실패 사실만 알린다.
    expect(await screen.findByRole('alert')).toHaveTextContent('상태 변경에 실패했습니다.');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '거절 처리하지 못했습니다', variant: 'destructive' })
    );
  });
});
