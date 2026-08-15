import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToast } from '@/hooks/use-toast';

import { UserDialog } from '../UserDialog';

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * UI 프리미티브는 벤더링된 shadcn 이라 여기서 검증할 대상이 아니다. Radix 의 Select 는
 * jsdom 에서 포털·포인터 이벤트를 요구해 테스트를 그쪽 구현에 묶어 버리므로, 기존
 * 다이얼로그 테스트(RoleDialog)와 같은 방식으로 최소 대역으로 바꾼다.
 * 여기서 보려는 것은 **폼의 판정 로직**이다.
 */
vi.mock('@/components/ui', async () => (await import('@/__tests__/mocks/ui-primitives')).uiMock());

/**
 * 사용자 생성·수정 다이얼로그.
 *
 * 이 폼에는 제출 전에 걸러 내는 게이트가 넷 있고, 각각 이유가 다르다.
 *
 * - **이름 2자**: 서버 스키마와 맞춘다.
 * - **비밀번호 규칙**: 서버 `passwordSchema` 와 **같은 스키마**로 검사한다. 예전에는
 *   여기서 "최소 8자" 만 보고 통과시켜, 서버가 거절해도 사용자는 이유를 알 수 없었다.
 * - **확인 일치**: 오타로 로그인 불가 계정이 만들어지는 것을 막는다.
 * - **고객사 필수**: 소속 없는 고객사 사용자는 아무 SR 도 볼 수 없는 미아가 된다.
 *
 * 그리고 수정 모드에서는 **비밀번호를 비워 두면 검사하지 않는다** — 이름만 고치려는데
 * 비밀번호를 다시 입력하라고 요구하면 못 쓴다. 이 분기가 이 폼에서 가장 헷갈리는 곳이라
 * 양쪽 모두 단언한다.
 *
 * 조회·저장이 React Query 로 옮겨졌으므로 렌더는 `QueryClientProvider` 를 요구한다.
 * 단언은 그대로다 — `fetch` 스텁의 호출 인자(url·method·body)를 보는 방식이 유효한 것은
 * `apiPost`/`apiPatch` 가 결국 같은 인자로 `fetch` 를 부르기 때문이다.
 */

const toast = vi.fn();

const CLIENTS = [
  { id: 'c-1', name: '테스트 고객사 A', code: 'C001' },
  { id: 'c-2', name: '테스트 고객사 B', code: 'C002' },
];

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  user: null,
  onSaved: vi.fn(),
  clients: CLIENTS,
};

/** 유효한 비밀번호(서버 규칙: 8자 이상, 대/소문자·숫자·특수문자). */
const GOOD_PW = 'Abcdef1!';

const fill = (id: string, value: string) => {
  fireEvent.change(document.getElementById(id)!, { target: { value } });
};

const submit = () => fireEvent.click(screen.getByRole('button', { name: '저장' }));

/**
 * 실제 `Response` 를 돌려준다.
 *
 * 손으로 만든 `{ ok, json }` 리터럴로는 부족하다 — `api-client` 는 성공 응답에서 `status`
 * (204 판별)와 `text()`(빈 본문 허용)를 함께 읽기 때문이다. 대역이 진짜 계약보다 좁으면
 * 컴포넌트가 아니라 대역이 통과 여부를 정하게 된다.
 */
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stubFetch = (respond: () => Response | Promise<Response>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => respond())
  );

const okFetch = () => stubFetch(() => jsonResponse({ id: 'u-9' }));

/**
 * `retry: false` / `gcTime: 0` 은 저장소의 훅 테스트 관례를 따른다. 재시도를 켜 두면
 * 실패 케이스가 타임아웃난다.
 *
 * ⚠️ `queries.retry` 는 컴포넌트가 쿼리별로 `retryUnlessClientError` 를 지정하므로 여기서
 * 꺼도 덮이지 않는다. 아래 고객사 조회 실패 테스트가 4xx 를 쓰는 이유다 — 4xx 는 그 함수가
 * 재시도하지 않는다.
 */
const renderDialog = (ui: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useToast).mockReturnValue({ toast } as never);
  okFetch();
});

describe('UserDialog — 모드', () => {
  it('user 가 없으면 생성 모드로 연다', () => {
    renderDialog(<UserDialog {...baseProps} />);

    expect(screen.getByText('새 사용자 추가')).toBeInTheDocument();
  });

  it('user 가 있으면 수정 모드로 열고 기존 값을 채운다', () => {
    renderDialog(
      <UserDialog
        {...baseProps}
        user={{ id: 'u-1', name: '홍길동', email: 'hong@example.com', isActive: true }}
      />
    );

    expect(screen.getByText('사용자 수정')).toBeInTheDocument();
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('홍길동');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('hong@example.com');
  });

  it('닫혀 있으면 아무것도 렌더하지 않는다', () => {
    renderDialog(<UserDialog {...baseProps} open={false} />);

    expect(screen.queryByText('새 사용자 추가')).not.toBeInTheDocument();
  });

  // 역할에서 유형을 추론한다. 고객사가 붙어 있는데 ENGINEER 로 열리면 소속이 날아간다.
  it('고객사 역할을 가진 사용자는 고객사 담당자 유형으로 연다', () => {
    renderDialog(
      <UserDialog
        {...baseProps}
        user={{
          id: 'u-1',
          name: '김고객',
          email: 'k@example.com',
          isActive: true,
          roles: [{ role: { id: 'r-1', name: 'CLIENT_USER' } }],
          clients: [{ client: CLIENTS[0]! }],
        }}
      />
    );

    expect(screen.getByText('소속 고객사 *')).toBeInTheDocument();
  });

  it('defaultClientId 를 주면 고객사 담당자로 시작한다', () => {
    renderDialog(<UserDialog {...baseProps} defaultClientId="c-1" />);

    expect(screen.getByText('소속 고객사 *')).toBeInTheDocument();
  });
});

/**
 * 고객사 목록 조회.
 *
 * prop 으로 목록을 받으면 **조회하지 않는다**. 예전에는 `if (propClients) return` 가드와
 * `loadingClients` state 가 그 계약을 지켰고, 지금은 쿼리의 `enabled` 가 지킨다. 가드가
 * 사라졌으니 계약이 그대로인지는 여기서 확인해야 한다.
 */
describe('UserDialog — 고객사 목록 조회', () => {
  const LOADING = '고객사 목록 로딩 중...';
  const EMPTY = '등록된 고객사가 없습니다.';

  /** clients prop 없이 여는 경우. baseProps 는 목록을 넘기므로 따로 만든다. */
  const propsWithoutClients = {
    open: true,
    onOpenChange: vi.fn(),
    user: null,
    onSaved: vi.fn(),
  };

  /**
   * 고객사 선택 UI 는 **CLIENT 유형에서만** 렌더된다.
   *
   * 기본 유형은 ENGINEER 인데, 예전에는 ENGINEER 에게도 "할당 고객사" 다중 선택이
   * 있어서 이 문구들이 기본 상태에서 보였다. 헌법 §1.3(시스템 역할과 고객사 소속의
   * 배타성)을 서버가 강제하게 되면서 그 입력은 누르면 반드시 실패하는 죽은 UI 가 되어
   * 제거했다(감사 D-12). 그래서 목록 조회 계약을 보려면 유형을 CLIENT 로 바꿔야 한다.
   */
  const switchToClientType = () => {
    fireEvent.change(screen.getAllByTestId('select')[0]!, { target: { value: 'CLIENT' } });
  };

  it('clients prop 이 있으면 조회하지 않는다', () => {
    renderDialog(<UserDialog {...baseProps} />);

    expect(screen.queryByText(LOADING)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('clients prop 이 없으면 목록을 부르고 그동안 로딩을 보여준다', async () => {
    stubFetch(() => jsonResponse(CLIENTS));
    renderDialog(<UserDialog {...propsWithoutClients} />);
    switchToClientType();

    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText(LOADING)).not.toBeInTheDocument());
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/api/clients?pageSize=100');
    expect(screen.getByText('테스트 고객사 A (C001)')).toBeInTheDocument();
  });

  // 예전에는 호출부에서 `Array.isArray(result) ? result : result.data || []` 로 갈랐다.
  // 그 분기는 apiList 로 옮겨졌으므로 봉투 응답이 여전히 읽히는지 여기서 지킨다.
  it('{data, meta} 봉투로 와도 목록으로 읽는다', async () => {
    stubFetch(() =>
      jsonResponse({
        data: CLIENTS,
        meta: {
          currentPage: 1,
          pageSize: 2,
          totalItems: 2,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      })
    );
    renderDialog(<UserDialog {...propsWithoutClients} />);
    switchToClientType();

    await waitFor(() => expect(screen.getByText('테스트 고객사 B (C002)')).toBeInTheDocument());
  });

  // 실패해도 로딩이 걸린 채로 남으면 폼을 아예 쓸 수 없다. 목록은 비고, 토스트만 뜬다.
  it('조회에 실패하면 토스트를 띄우고 빈 목록 안내로 넘어간다', async () => {
    stubFetch(() => jsonResponse({ error: '권한이 없습니다.' }, 403));
    renderDialog(<UserDialog {...propsWithoutClients} />);
    switchToClientType();

    await waitFor(() => expect(screen.getByText(EMPTY)).toBeInTheDocument());
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
        description: '고객사 목록을 불러오는데 실패했습니다.',
      })
    );
    // 서버가 준 문구는 새지 않는다 — 이 조회는 실패 원인을 구분해 보여 주지 않는다.
    expect(screen.queryByText('권한이 없습니다.')).not.toBeInTheDocument();
  });
});

describe('UserDialog — 제출 전 검증', () => {
  const expectRejected = async (message: string | RegExp) => {
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: expect.stringMatching(message),
        })
      )
    );
    // 거부는 "토스트를 띄웠다" 가 아니라 "요청이 안 나갔다" 로 확인해야 의미가 있다.
    expect(fetch).not.toHaveBeenCalled();
  };

  it('이름이 2자 미만이면 보내지 않는다', async () => {
    renderDialog(<UserDialog {...baseProps} />);
    fill('name', '홍');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', GOOD_PW);

    submit();

    await expectRejected(/최소 2자/);
  });

  // 서버와 같은 스키마를 쓰는 것이 핵심이다. 규칙이 어긋나면 사용자는 서버 거절
  // 사유를 알 수 없는 채로 계속 실패한다.
  it.each([
    ['짧은 비밀번호', 'Ab1!'],
    ['특수문자 없음', 'Abcdefg1'],
    ['숫자 없음', 'Abcdefg!'],
    ['대문자 없음', 'abcdefg1!'],
  ])('%s 는 서버 규칙으로 걸러 낸다', async (_label, pw) => {
    renderDialog(<UserDialog {...baseProps} />);
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', pw);
    fill('confirmPassword', pw);

    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('비밀번호와 확인이 다르면 보내지 않는다', async () => {
    renderDialog(<UserDialog {...baseProps} />);
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', 'Abcdef2!');

    submit();

    await expectRejected(/일치하지 않습니다/);
  });

  // 소속 없는 고객사 사용자는 아무 SR 도 볼 수 없는 계정이 된다.
  it('고객사 담당자인데 고객사를 고르지 않으면 보내지 않는다', async () => {
    renderDialog(<UserDialog {...baseProps} />);
    fireEvent.change(screen.getAllByTestId('select')[0]!, { target: { value: 'CLIENT' } });
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', GOOD_PW);

    submit();

    await expectRejected(/소속 고객사를 선택/);
  });

  // 이름만 고치려는데 비밀번호를 다시 입력하라고 하면 쓸 수 없는 폼이 된다.
  it('수정 모드에서 비밀번호를 비워 두면 검사하지 않는다', async () => {
    renderDialog(
      <UserDialog
        {...baseProps}
        user={{ id: 'u-1', name: '홍길동', email: 'hong@example.com', isActive: true }}
      />
    );
    fill('name', '홍길순');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string);
    // 빈 비밀번호를 실어 보내면 서버가 그것으로 덮어쓸 수 있다.
    expect(body.password).toBeUndefined();
  });

  it('수정 모드에서도 비밀번호를 입력하면 규칙을 검사한다', async () => {
    renderDialog(
      <UserDialog
        {...baseProps}
        user={{ id: 'u-1', name: '홍길동', email: 'hong@example.com', isActive: true }}
      />
    );
    fill('password', 'weak');
    fill('confirmPassword', 'weak');

    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('UserDialog — 저장', () => {
  it('생성은 POST /api/users 로 보낸다', async () => {
    renderDialog(<UserDialog {...baseProps} />);
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', GOOD_PW);

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/users');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toMatchObject({
      name: '홍길동',
      email: 'a@example.com',
      userType: 'ENGINEER',
    });
  });

  it('수정은 PATCH /api/users/:id 로 보낸다', async () => {
    renderDialog(
      <UserDialog
        {...baseProps}
        user={{ id: 'u-1', name: '홍길동', email: 'hong@example.com', isActive: true }}
      />
    );
    fill('name', '홍길순');

    submit();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/users/u-1');
    expect(init!.method).toBe('PATCH');
  });

  it('성공하면 onSaved 와 닫기를 부른다', async () => {
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog(<UserDialog {...baseProps} onSaved={onSaved} onOpenChange={onOpenChange} />);
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', GOOD_PW);

    submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // 서버가 주는 이유(중복 이메일 등)를 그대로 보여 줘야 사용자가 고칠 수 있다.
  it('서버가 거절하면 그 사유를 보여 주고 닫지 않는다', async () => {
    stubFetch(() => jsonResponse({ error: '이미 사용 중인 이메일입니다.' }, 400));
    const onOpenChange = vi.fn();
    renderDialog(<UserDialog {...baseProps} onOpenChange={onOpenChange} />);
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', GOOD_PW);

    submit();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: '이미 사용 중인 이메일입니다.',
        })
      )
    );
    // 닫아 버리면 사용자가 입력한 내용을 잃는다.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('네트워크가 끊겨도 저장 버튼이 다시 눌린다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network error');
      })
    );
    renderDialog(<UserDialog {...baseProps} />);
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', GOOD_PW);

    submit();

    // pending 이 안 풀리면 버튼이 영구 비활성이 되어 재시도할 수 없다.
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled());
  });
});
