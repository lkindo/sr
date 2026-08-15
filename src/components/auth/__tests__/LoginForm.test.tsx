import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger';

import LoginForm from '../LoginForm';

/**
 * 로그인 폼.
 *
 * 여기서 조용히 깨질 수 있는 계약들:
 *  - **실패는 반드시 보여야 한다.** `signIn` 이 `{ error }` 를 돌려주든, `error` 없이
 *    `{ ok: false }` 만 돌려주든, 예외를 던지든 사용자는 문구를 봐야 하고 그 상태에서
 *    `/dashboard` 로 넘어가서는 안 된다. (`redirect: false` 라 NextAuth 는 예외 대신
 *    결과 객체를 준다)
 *  - **성공 판정은 보수적이다.** `ok` 가 **명시적으로 false** 일 때만 실패로 본다.
 *    `signIn` 이 `undefined` 를 돌려주거나 `{ error: null }` 만 돌려주는 경로가 실제로
 *    있고, 그걸 실패로 뒤집으면 정상 로그인이 막힌다. 양쪽 경로를 모두 고정한다.
 *  - **저장 실패가 로그인을 실패시켜서는 안 된다.** "이메일 저장" 은 부가 기능인데,
 *    스토리지가 막힌 환경(사파리 프라이빗, 서드파티 iframe, 기업 정책)에서
 *    `localStorage` 는 던진다. 마운트에서 던지면 로그인 화면이 아예 안 뜨고,
 *    제출 성공 경로에서 던지면 인증에 성공했는데도 "로그인 중 오류" 가 뜨고
 *    `router.push` 가 안 된다 — 로그인은 복구 불가 지점이라 둘 다 치명적이다.
 *  - **비밀번호는 절대 저장하지 않는다.** 과거 버전이 평문으로 남긴 키를 마운트마다
 *    지우는 것이 이 컴포넌트의 유일한 정리 경로다.
 *  - **"이메일 저장" 체크를 푼 상태로 로그인하면 저장된 이메일이 지워져야 한다.**
 *    지우지 않으면 공용 PC 에서 이전 사용자의 이메일이 계속 남는다.
 */

const signIn = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/logger', () => ({
  logger: {
    logError: vi.fn(),
    logRequest: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

/** Radix Checkbox 가 내부에서 크기를 재는데 jsdom 에는 ResizeObserver 가 없다. */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const EMAIL_KEY = 'sr-remembered-email';
const PASSWORD_KEY = 'sr-remembered-password';
const CREDENTIAL_ERROR = '이메일 또는 비밀번호가 올바르지 않습니다.';
const UNEXPECTED_ERROR = '로그인 중 오류가 발생했습니다.';

const emailInput = () => screen.getByLabelText('이메일');
const passwordInput = () => screen.getByLabelText('비밀번호');
const rememberCheckbox = () => screen.getByRole('checkbox', { name: '이메일 저장' });
const submitButton = () => screen.getByRole('button', { name: '로그인' });

function fillCredentials(email = 'hong@example.com', password = 'pw1234!') {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.change(passwordInput(), { target: { value: password } });
}

async function submit() {
  await act(async () => {
    fireEvent.click(submitButton());
  });
}

/**
 * 스토리지가 막힌 브라우저를 재현한다. 사파리 프라이빗 일부 버전·서드파티 iframe·
 * 기업 정책에서는 `localStorage` 의 **모든** 접근이 SecurityError 로 터진다.
 */
function blockStorage(...methods: ('getItem' | 'setItem' | 'removeItem')[]) {
  const boom = new DOMException('The operation is insecure.', 'SecurityError');
  for (const method of methods) {
    vi.spyOn(Storage.prototype, method).mockImplementation(() => {
      throw boom;
    });
  }
  return boom;
}

/**
 * 실패가 삼켜졌는지는 "로그가 남았는가" 로 확인한다.
 * 던진 값의 동일성까지는 보지 않는다 — jsdom 의 `DOMException` 은 realm 이 달라
 * `instanceof Error` 가 false 라 컴포넌트가 Error 로 감싸기 때문이다(브라우저에서는
 * 그대로 통과한다). 어느 쪽이든 Error 한 개가 로거로 가는 것이 계약이다.
 */
function expectStorageFailureLogged(what: 'read' | 'write') {
  const expected = `[Login] localStorage ${what} failed`;
  const call = vi.mocked(logger.error).mock.calls.find((c) => c[0] === expected);
  expect(call, `${expected} 로그가 없다`).toBeDefined();
  expect(call?.[1]).toBeInstanceOf(Error);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  signIn.mockResolvedValue({ ok: true, error: null });
});

afterEach(() => {
  // Storage.prototype 스파이가 다음 테스트로 새면 전부 무너진다.
  vi.restoreAllMocks();
});

describe('LoginForm — 마운트 시 저장된 이메일', () => {
  it('저장된 이메일이 없으면 빈 폼에 체크가 풀린 상태로 시작한다', () => {
    render(<LoginForm />);

    expect(emailInput()).toHaveValue('');
    expect(rememberCheckbox()).toHaveAttribute('aria-checked', 'false');
  });

  it('저장된 이메일이 있으면 채워 넣고 "이메일 저장" 을 켠 상태로 시작한다', () => {
    localStorage.setItem(EMAIL_KEY, 'saved@example.com');

    render(<LoginForm />);

    expect(emailInput()).toHaveValue('saved@example.com');
    expect(rememberCheckbox()).toHaveAttribute('aria-checked', 'true');
  });

  it('과거 버전이 평문으로 남긴 비밀번호는 마운트 즉시 지운다', () => {
    localStorage.setItem(PASSWORD_KEY, 'plain-text-secret');
    localStorage.setItem(EMAIL_KEY, 'saved@example.com');

    render(<LoginForm />);

    expect(localStorage.getItem(PASSWORD_KEY)).toBeNull();
    // 이메일은 지우지 않는다 — 지우면 "이메일 저장" 기능 자체가 사라진다.
    expect(localStorage.getItem(EMAIL_KEY)).toBe('saved@example.com');
  });
});

describe('LoginForm — 제출', () => {
  it('credentials 프로바이더를 redirect:false 로 호출한다', async () => {
    render(<LoginForm />);
    fillCredentials('hong@example.com', 'pw1234!');

    await submit();

    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'hong@example.com',
      password: 'pw1234!',
      redirect: false,
    });
  });

  it('성공하고 "이메일 저장" 이 켜져 있으면 이메일만 저장하고 대시보드로 보낸다', async () => {
    render(<LoginForm />);
    fillCredentials('hong@example.com', 'pw1234!');
    fireEvent.click(rememberCheckbox());

    await submit();

    expect(localStorage.getItem(EMAIL_KEY)).toBe('hong@example.com');
    // 비밀번호는 어떤 키로도 저장되지 않아야 한다.
    expect(Object.values(localStorage)).not.toContain('pw1234!');
    expect(push).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
  });

  it('성공했지만 "이메일 저장" 이 꺼져 있으면 이전에 저장된 이메일을 지운다', async () => {
    localStorage.setItem(EMAIL_KEY, 'previous@example.com');
    render(<LoginForm />);
    // 저장된 이메일 때문에 체크가 켜진 채로 시작하므로 눌러서 끈다.
    fireEvent.click(rememberCheckbox());
    fillCredentials('other@example.com', 'pw1234!');

    await submit();

    expect(localStorage.getItem(EMAIL_KEY)).toBeNull();
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('signIn 이 아무것도 돌려주지 않아도 성공으로 본다', async () => {
    // NextAuth 는 조건에 따라 undefined 를 돌려준다 — `result?.error` 의 옵셔널 경로.
    // `ok` 판정을 넣은 뒤에도 이 경로는 성공이어야 한다: 실패 신호는 `error` 가 있거나
    // `ok` 가 **명시적으로 false** 일 때뿐이고, 없는 `ok` 를 실패로 읽으면 여기서
    // 정상 로그인이 막힌다.
    signIn.mockResolvedValue(undefined);
    render(<LoginForm />);
    fillCredentials();

    await submit();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('ok 필드 없이 error 만 null 이면 성공으로 본다', async () => {
    // 구버전 NextAuth 응답 형태. `ok` 부재를 실패로 읽지 않는다는 계약.
    signIn.mockResolvedValue({ error: null });
    render(<LoginForm />);
    fillCredentials();

    await submit();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});

describe('LoginForm — 실패 처리', () => {
  it('signIn 이 error 를 돌려주면 문구를 띄우고 이동하지 않는다', async () => {
    signIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin' });
    localStorage.setItem(EMAIL_KEY, 'previous@example.com');
    render(<LoginForm />);
    fillCredentials('hong@example.com', 'wrong');

    await submit();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(CREDENTIAL_ERROR);
    // 서버가 준 원문(CredentialsSignin)이 그대로 새면 안 된다.
    expect(alert).not.toHaveTextContent('CredentialsSignin');
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    // 실패했는데 이메일 저장 상태를 건드리면 안 된다.
    expect(localStorage.getItem(EMAIL_KEY)).toBe('previous@example.com');
  });

  it('ok:false 는 error 가 null 이어도 실패다 — 대시보드로 넘기지 않는다', async () => {
    // NextAuth 가 `{ ok: false, error: null }` 을 돌려주는 경우가 있다.
    // `error` 만 보던 시절에는 인증에 실패했는데도 /dashboard 로 push 했다.
    signIn.mockResolvedValue({ ok: false, error: null, status: 401, url: null });
    localStorage.setItem(EMAIL_KEY, 'previous@example.com');
    render(<LoginForm />);
    fillCredentials('hong@example.com', 'wrong');

    await submit();

    expect(screen.getByRole('alert')).toHaveTextContent(CREDENTIAL_ERROR);
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(EMAIL_KEY)).toBe('previous@example.com');
  });

  it('signIn 이 예외를 던지면 일반 오류 문구를 띄우고 폼을 다시 쓸 수 있게 둔다', async () => {
    signIn.mockRejectedValue(new Error('network down'));
    render(<LoginForm />);
    fillCredentials();

    await submit();

    expect(screen.getByRole('alert')).toHaveTextContent(UNEXPECTED_ERROR);
    expect(push).not.toHaveBeenCalled();
    // finally 가 잠금을 풀어야 재시도가 가능하다.
    expect(submitButton()).toBeEnabled();
    expect(emailInput()).toBeEnabled();
  });

  it('에러 상태에서는 입력에 aria-invalid 가 붙고, 재제출하면 즉시 걷힌다', async () => {
    signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    render(<LoginForm />);
    fillCredentials();
    await submit();

    expect(emailInput()).toHaveAttribute('aria-invalid', 'true');
    expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');

    signIn.mockResolvedValue({ error: null });
    await submit();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'false');
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('에러가 없으면 alert 영역 자체가 렌더되지 않는다', () => {
    render(<LoginForm />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(emailInput()).toHaveAttribute('aria-invalid', 'false');
  });
});

describe('LoginForm — 제출 중 잠금', () => {
  it('응답을 기다리는 동안 입력과 버튼을 잠갔다가 끝나면 되돌린다', async () => {
    let resolveSignIn: (value: { error: null }) => void = () => undefined;
    signIn.mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          resolveSignIn = resolve;
        })
    );

    render(<LoginForm />);
    fillCredentials();

    await act(async () => {
      fireEvent.click(submitButton());
    });

    expect(submitButton()).toBeDisabled();
    expect(emailInput()).toBeDisabled();
    expect(passwordInput()).toBeDisabled();
    expect(rememberCheckbox()).toBeDisabled();

    await act(async () => {
      resolveSignIn({ error: null });
    });

    await waitFor(() => expect(submitButton()).toBeEnabled());
    expect(emailInput()).toBeEnabled();
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('제출 중 버튼을 다시 눌러도 요청이 한 번만 나간다', async () => {
    signIn.mockImplementation(() => new Promise(() => undefined));

    render(<LoginForm />);
    fillCredentials();

    await submit();
    await submit();

    expect(signIn).toHaveBeenCalledTimes(1);
  });
});

describe('LoginForm — 스토리지가 막힌 브라우저', () => {
  it('마운트 시 localStorage 가 던져도 로그인 화면은 그대로 렌더된다', () => {
    blockStorage('getItem', 'removeItem', 'setItem');

    render(<LoginForm />);

    // 던지는 effect 는 렌더를 통째로 날린다 — 로그인은 복구 불가 지점이라 치명적이다.
    expect(submitButton()).toBeInTheDocument();
    expect(emailInput()).toHaveValue('');
    expect(rememberCheckbox()).toHaveAttribute('aria-checked', 'false');
    expectStorageFailureLogged('read');
  });

  it('"이메일 저장" 저장이 실패해도 대시보드로 이동한다', async () => {
    render(<LoginForm />);
    fillCredentials('hong@example.com', 'pw1234!');
    fireEvent.click(rememberCheckbox());
    blockStorage('setItem');

    await submit();

    // 저장 실패는 부가 기능의 실패일 뿐이다. 예전에는 handleSubmit 의 catch 로 떨어져
    // 인증에 성공했는데도 오류 문구가 뜨고 이동이 막혔다.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/dashboard');
    expect(refresh).toHaveBeenCalled();
    expectStorageFailureLogged('write');
  });

  it('"이메일 저장" 해제 시 삭제가 실패해도 대시보드로 이동한다', async () => {
    render(<LoginForm />);
    fillCredentials('hong@example.com', 'pw1234!');
    blockStorage('removeItem');

    await submit();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/dashboard');
    expectStorageFailureLogged('write');
  });

  it('스토리지가 완전히 막혀 있어도 인증 실패는 그대로 실패로 보인다', async () => {
    signIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin' });
    blockStorage('getItem', 'setItem', 'removeItem');

    render(<LoginForm />);
    fillCredentials('hong@example.com', 'wrong');
    await submit();

    expect(screen.getByRole('alert')).toHaveTextContent(CREDENTIAL_ERROR);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('LoginForm — 접근성·유효성', () => {
  it('이메일/비밀번호는 필수이고 이메일은 타입 검증을 받는다', () => {
    render(<LoginForm />);

    expect(emailInput()).toBeRequired();
    expect(emailInput()).toHaveAttribute('type', 'email');
    expect(passwordInput()).toBeRequired();
    expect(passwordInput()).toHaveAttribute('type', 'password');
  });

  it('에러 문구는 스크린리더에 알려지는 live region 이다', async () => {
    signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    render(<LoginForm />);
    fillCredentials();

    await submit();

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
  });

  it('페이지에 h1 이 있고 재설정 안내 경로를 알려 준다', () => {
    render(<LoginForm />);

    expect(screen.getByRole('heading', { level: 1, name: '로그인' })).toBeInTheDocument();
    expect(screen.getByText(/시스템 관리자에게 재설정을 요청하세요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/register');
  });
});
