import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToast } from '@/hooks/use-toast';

import { UserDialog } from '../UserDialog';

vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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

const okFetch = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ id: 'u-9' }) }))
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useToast).mockReturnValue({ toast } as never);
  okFetch();
});

describe('UserDialog — 모드', () => {
  it('user 가 없으면 생성 모드로 연다', () => {
    render(<UserDialog {...baseProps} />);

    expect(screen.getByText('새 사용자 추가')).toBeInTheDocument();
  });

  it('user 가 있으면 수정 모드로 열고 기존 값을 채운다', () => {
    render(
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
    render(<UserDialog {...baseProps} open={false} />);

    expect(screen.queryByText('새 사용자 추가')).not.toBeInTheDocument();
  });

  // 역할에서 유형을 추론한다. 고객사가 붙어 있는데 ENGINEER 로 열리면 소속이 날아간다.
  it('고객사 역할을 가진 사용자는 고객사 담당자 유형으로 연다', () => {
    render(
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
    render(<UserDialog {...baseProps} defaultClientId="c-1" />);

    expect(screen.getByText('소속 고객사 *')).toBeInTheDocument();
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
    render(<UserDialog {...baseProps} />);
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
    render(<UserDialog {...baseProps} />);
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
    render(<UserDialog {...baseProps} />);
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', 'Abcdef2!');

    submit();

    await expectRejected(/일치하지 않습니다/);
  });

  // 소속 없는 고객사 사용자는 아무 SR 도 볼 수 없는 계정이 된다.
  it('고객사 담당자인데 고객사를 고르지 않으면 보내지 않는다', async () => {
    render(<UserDialog {...baseProps} />);
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
    render(
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
    render(
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
    render(<UserDialog {...baseProps} />);
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
    render(
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
    render(<UserDialog {...baseProps} onSaved={onSaved} onOpenChange={onOpenChange} />);
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: '이미 사용 중인 이메일입니다.' }),
      }))
    );
    const onOpenChange = vi.fn();
    render(<UserDialog {...baseProps} onOpenChange={onOpenChange} />);
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
    render(<UserDialog {...baseProps} />);
    fill('name', '홍길동');
    fill('email', 'a@example.com');
    fill('password', GOOD_PW);
    fill('confirmPassword', GOOD_PW);

    submit();

    // loading 이 안 풀리면 버튼이 영구 비활성이 되어 재시도할 수 없다.
    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).not.toBeDisabled());
  });
});
