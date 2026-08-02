import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn(async () => undefined);
const useSession = vi.fn(() => ({ status: 'authenticated' }) as { status: string });
const routerPush = vi.fn();
const usePathname = vi.fn(() => '/srs');

vi.mock('next-auth/react', () => ({
  signOut: (...args: unknown[]) => signOut(...(args as [])),
  useSession: () => useSession(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => usePathname(),
}));

// Radix AlertDialog 는 포털·포커스 트랩을 쓰므로 렌더 가능한 최소 형태로 대체한다.
vi.mock('@/components/ui', () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="idle-warning">{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

const { IdleTimeoutProvider } = await import('../IdleTimeoutProvider');

const IDLE_TIMEOUT = 30 * 60 * 1000;
const WARNING_TIMEOUT = 60 * 1000;

describe('IdleTimeoutProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signOut.mockClear();
    routerPush.mockClear();
    useSession.mockReturnValue({ status: 'authenticated' });
    usePathname.mockReturnValue('/srs');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderProvider = () =>
    render(
      <IdleTimeoutProvider>
        <div>내용</div>
      </IdleTimeoutProvider>
    );

  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it('유휴 29분에는 경고 모달만 띄우고 로그아웃하지 않는다', async () => {
    renderProvider();

    await advance(IDLE_TIMEOUT - WARNING_TIMEOUT);

    expect(screen.getByTestId('idle-warning')).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  /**
   * 감사 3.24 회귀 테스트 — 이 프로바이더의 핵심 결함.
   *
   * `resetTimer` 가 `showWarning` state 에 의존하던 시절에는, 경고가 뜨는 순간
   * 콜백 신원이 바뀌어 리스너 effect 가 재실행되고 그 cleanup 이 방금 예약한
   * 로그아웃 타이머를 지웠다. 모달은 뜨지만 signOut 은 영원히 호출되지 않았다.
   */
  it('경고 후 1분간 반응이 없으면 실제로 로그아웃한다', async () => {
    renderProvider();

    await advance(IDLE_TIMEOUT - WARNING_TIMEOUT);
    expect(screen.getByTestId('idle-warning')).toBeInTheDocument();

    await advance(WARNING_TIMEOUT);

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(routerPush).toHaveBeenCalledWith('/login?reason=timeout');
  });

  it('경고 모달이 떠 있는 동안의 마우스 활동은 로그아웃을 연기시키지 못한다', async () => {
    renderProvider();

    await advance(IDLE_TIMEOUT - WARNING_TIMEOUT);
    expect(screen.getByTestId('idle-warning')).toBeInTheDocument();

    // 모달이 뜬 뒤 계속 마우스를 움직여도 카운트다운은 계속되어야 한다.
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        window.dispatchEvent(new Event('mousemove'));
      });
      await advance(10_000);
    }

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
  });

  it('경고 전 활동이 있으면 유휴 타이머가 초기화된다', async () => {
    renderProvider();

    // 20분 경과 후 활동 → 경고까지 다시 29분이 필요하다.
    await advance(20 * 60 * 1000);
    await act(async () => {
      window.dispatchEvent(new Event('keydown'));
    });
    await advance(20 * 60 * 1000);

    expect(screen.queryByTestId('idle-warning')).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('"계속 유지"를 누르면 로그아웃이 취소되고 타이머가 재시작된다', async () => {
    renderProvider();

    await advance(IDLE_TIMEOUT - WARNING_TIMEOUT);
    await act(async () => {
      screen.getByText('계속 유지').click();
    });

    expect(screen.queryByTestId('idle-warning')).not.toBeInTheDocument();

    // 취소했으므로 원래 로그아웃 시점이 지나도 로그아웃되지 않는다.
    await advance(WARNING_TIMEOUT * 2);
    expect(signOut).not.toHaveBeenCalled();

    // 그리고 타이머는 처음부터 다시 흐른다.
    await advance(IDLE_TIMEOUT);
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
  });

  it('경고 모달 중 페이지를 이동해도 예약된 로그아웃은 유지된다', async () => {
    const { rerender } = renderProvider();

    await advance(IDLE_TIMEOUT - WARNING_TIMEOUT);
    expect(screen.getByTestId('idle-warning')).toBeInTheDocument();

    // 라우트 변경으로 리스너 effect 가 재실행되는 상황을 재현한다.
    usePathname.mockReturnValue('/dashboard');
    rerender(
      <IdleTimeoutProvider>
        <div>내용</div>
      </IdleTimeoutProvider>
    );

    await advance(WARNING_TIMEOUT);

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
  });

  it('로그인 페이지에서는 타이머가 동작하지 않는다', async () => {
    usePathname.mockReturnValue('/login');
    renderProvider();

    await advance(IDLE_TIMEOUT * 2);

    expect(screen.queryByTestId('idle-warning')).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('비인증 상태에서는 타이머가 동작하지 않는다', async () => {
    useSession.mockReturnValue({ status: 'unauthenticated' });
    renderProvider();

    await advance(IDLE_TIMEOUT * 2);

    expect(screen.queryByTestId('idle-warning')).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('언마운트 후에는 로그아웃이 실행되지 않는다', async () => {
    const { unmount } = renderProvider();

    await advance(IDLE_TIMEOUT - WARNING_TIMEOUT);
    unmount();
    await advance(WARNING_TIMEOUT * 2);

    expect(signOut).not.toHaveBeenCalled();
  });
});
