import {
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';

import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * 인증 세션의 생명주기 — 로그아웃 / 익명 차단 / 비밀번호 변경.
 *
 * ── 이 파일이 생긴 이유 ───────────────────────────────────────────────────
 * 스위트 전체에서 **로그아웃을 실제로 수행하는 테스트가 0건**이었다. 익명 사용자가
 * API 를 호출했을 때 401 이 오는지 확인하는 테스트도 0건이었고(00-smoke 는 화면
 * 리다이렉트만 본다), 비밀번호를 실제로 바꿔 보는 테스트도 0건이었다.
 * 즉 "세션을 얻는 경로"만 검증되고 "세션을 잃는 경로"와 "세션 없이 두드리는 경로"는
 * 통째로 비어 있었다. 세션 파기가 조용히 깨지면 로그아웃 버튼이 아무것도 안 해도
 * 아무 테스트도 빨개지지 않는다.
 *
 * ── 세션 오염 방지 ───────────────────────────────────────────────────────
 * 로그아웃 테스트는 세션을 파기한다. `test.use({ storageState })` 만 써도 컨텍스트는
 * 테스트마다 새로 만들어지므로 디스크의 playwright/.auth/user.json 은 바뀌지 않지만,
 * 여기서는 한 걸음 더 나아가 `browser.newContext({ storageState })` 로 컨텍스트를
 * 직접 열고 finally 에서 닫는다. 파기 대상이 "이 테스트가 만든 컨텍스트뿐" 이라는 것이
 * 코드에 드러나야 다른 스펙과의 간섭을 두고 다시 고민하지 않는다.
 *
 * ── 데이터 규칙 ──────────────────────────────────────────────────────────
 * 시드 계정의 비밀번호는 절대 바꾸지 않는다 — 다른 모든 스펙이 그 값으로 로그인한다.
 * 비밀번호 관련 테스트는 매번 전용 계정을 만들고 afterAll 에서 완전 삭제한다.
 */

const ADMIN_EMAIL = process.env.TEST_USER_EMAIL || 'admin@example.com';

/** 존재하지 않는 리소스 id. 익명 쓰기가 인가 이전에 막히는지 보기 위한 값이다. */
const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000';

/** `{ error, code }` — src/lib/api-error-handler.ts 의 표준 에러 본문. */
interface ApiErrorBody {
  error?: string;
  code?: string;
}

/** `/api/auth/session` 의 본문. 익명이면 200 + `null` 이다(빈 객체가 아니다). */
type SessionBody = { user?: { email?: string } } | null;

// ============================================================================
// 1) 로그아웃
// ============================================================================

test.describe('로그아웃', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.admin });

  test('사용자 메뉴에 프로필·설정·로그아웃이 노출된다', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // src/components/layout/UserNav.tsx — 트리거는 aria-label="사용자 메뉴" 버튼이다.
    // Header 가 UserNav 를 dynamic import 하므로 청크 로드까지 expect 의 재시도로 기다린다.
    const trigger = page.getByRole('button', { name: '사용자 메뉴' });
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(page.getByRole('menuitem', { name: '프로필' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '설정' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: '로그아웃' })).toBeVisible();
  });

  test('로그아웃하면 세션이 파기되고 보호 라우트가 로그인으로 튕긴다', async ({ browser }) => {
    // 세션을 실제로 파기하는 유일한 테스트다. 컨텍스트를 직접 열어 격리한다(파일 상단 주석 참조).
    const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES.admin });
    const page = await context.newPage();

    try {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

      // 로그아웃 "전" 에 세션이 있었음을 먼저 확정한다. 이게 없으면 아래 null 단언이
      // "원래부터 세션이 없었다" 로도 통과해 아무것도 검증하지 못한다.
      const before = await page.request.get('/api/auth/session');
      expect(before.status()).toBe(200);
      expect(((await before.json()) as SessionBody)?.user?.email).toBe(ADMIN_EMAIL);

      await page.getByRole('button', { name: '사용자 메뉴' }).click();
      const signOutItem = page.getByRole('menuitem', { name: '로그아웃' });
      await expect(signOutItem).toBeVisible();
      await signOutItem.click();

      // (a) UserNav.handleSignOut 은 signOut({ redirect: false }) 후 window.location.href='/'.
      //     익명 상태의 '/' 는 src/proxy.ts 가 /login 으로 보낸다.
      await page.waitForURL(/\/login/, { timeout: 30000 });

      // (b) 세션 응답은 200 + 본문 null 이다. 빈 객체가 아니다.
      const after = await page.request.get('/api/auth/session');
      expect(after.status()).toBe(200);
      expect(await after.json()).toBeNull();

      // 쿠키가 정말로 파기됐는지는 API 로 확인하는 편이 확실하다.
      // 화면 리다이렉트는 클라이언트 라우팅만으로도 일어날 수 있다.
      const srs = await page.request.get('/api/srs');
      expect(srs.status()).toBe(401);

      // (c) 보호 라우트로 돌아가려 하면 로그인으로 튕긴다.
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  });
});

// ============================================================================
// 2) 익명 요청 차단
// ============================================================================

/**
 * 익명 GET 이 401 이어야 하는 엔드포인트.
 * 2026-08-09 익명 curl 실측값이며, 이 목록이 곧 "인증 없이 읽히면 안 되는 것" 의 계약이다.
 */
const ANONYMOUS_READ_ENDPOINTS = [
  '/api/srs',
  '/api/users',
  '/api/clients',
  '/api/dashboard/stats',
  '/api/roles',
  '/api/permissions',
  '/api/service-categories',
  '/api/srs/my-requests',
  '/api/settings/system',
  '/api/reports/export',
] as const;

/**
 * 익명 쓰기도 같은 자리에서 막혀야 한다.
 *
 * 읽기만 검증하면 "인증 래퍼가 GET 에만 붙어 있다" 는 형태의 회귀를 놓친다.
 * 각 항목은 실제로 존재하는 메서드만 고른다 — 핸들러가 없는 메서드는 인증과 무관하게
 * 405 라서 401 을 단언하면 인가가 아니라 라우팅을 검사하게 된다.
 * (실측: POST /api/roles, POST /api/service-categories, PATCH /api/settings/system 은 405)
 */
const ANONYMOUS_WRITE_REQUESTS: Array<{
  label: string;
  send: (request: APIRequestContext) => Promise<APIResponse>;
}> = [
  {
    label: 'POST /api/srs',
    send: (request) =>
      request.post('/api/srs', {
        data: {
          title: '익명 쓰기 시도',
          description: '인증 없이 생성되면 안 된다.',
          clientId: NONEXISTENT_ID,
          serviceCategoryId: NONEXISTENT_ID,
          requestedPriority: 'MEDIUM',
        },
      }),
  },
  {
    label: 'POST /api/users',
    send: (request) =>
      request.post('/api/users', {
        data: {
          name: '익명 생성 시도',
          email: 'anonymous-must-fail@example.com',
          password: 'Anon!Pass1',
        },
      }),
  },
  {
    label: 'POST /api/clients',
    send: (request) =>
      request.post('/api/clients', { data: { code: 'ANONFAIL', name: '익명 생성 시도' } }),
  },
  {
    label: 'PUT /api/settings/system',
    send: (request) => request.put('/api/settings/system', { data: {} }),
  },
  {
    label: 'POST /api/profile/password',
    send: (request) =>
      request.post('/api/profile/password', {
        data: {
          currentPassword: 'Anon!Pass1',
          newPassword: 'Anon!Pass2',
          confirmPassword: 'Anon!Pass2',
        },
      }),
  },
  {
    label: `PATCH /api/srs/{id}/status`,
    send: (request) =>
      request.patch(`/api/srs/${NONEXISTENT_ID}/status`, { data: { action: 'start' } }),
  },
  {
    label: `DELETE /api/users/{id}`,
    send: (request) => request.delete(`/api/users/${NONEXISTENT_ID}`),
  },
];

test.describe('익명 API 차단', () => {
  // 쿠키 없는 상태. chromium 프로젝트 기본값(playwright/.auth/user.json)을 반드시 덮어야 한다.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('익명 세션 조회는 200 + 본문 null 이다', async ({ request }) => {
    // 이 계약을 모르면 `session.user` 접근에서 TypeError 가 난다.
    // 로그아웃 테스트와 e2e/roles/navigation.spec.ts 의 route.fulfill 이 이 형태에 의존한다.
    const response = await request.get('/api/auth/session');
    expect(response.status()).toBe(200);
    expect(await response.json()).toBeNull();
  });

  for (const path of ANONYMOUS_READ_ENDPOINTS) {
    test(`익명 GET ${path} 는 401`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status(), `${path} 응답 상태`).toBe(401);
      expect((await response.json()) as ApiErrorBody).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  }

  for (const { label, send } of ANONYMOUS_WRITE_REQUESTS) {
    test(`익명 ${label} 는 401`, async ({ request }) => {
      const response = await send(request);
      expect(response.status(), `${label} 응답 상태`).toBe(401);
      expect((await response.json()) as ApiErrorBody).toMatchObject({ code: 'UNAUTHORIZED' });
    });
  }
});

// ============================================================================
// 3) 비밀번호 변경 → 재로그인
// ============================================================================

/**
 * 비밀번호 값은 src/lib/schemas.ts 의 passwordSchema 를 만족해야 한다.
 * (8자 이상 · 대문자 · 소문자 · 숫자 · 특수문자 각 1개 이상)
 */
const INITIAL_PASSWORD = 'Init!Pass1';
const ROTATED_PASSWORD = 'Rotat3d!Pass';
const WRONG_PASSWORD = 'Wrong!Pass9';
/** 복잡도 규칙을 통과하지 못하는 값. */
const WEAK_PASSWORD = 'short';

/**
 * 이 스펙이 만드는 계정의 이메일 접두사.
 *
 * 정리를 "메모리에 모아 둔 id 목록" 이 아니라 이 접두사 검색으로 하는 이유:
 * Playwright 는 테스트가 실패하면 워커 프로세스를 버리고 재시도를 새 워커에서 돌린다.
 * 모듈 변수에 담아 둔 id 는 그때 함께 사라져, 실패한 시도가 만든 계정이 공유 DB 에
 * 영구히 남는다(실제로 두 건이 남았다). 접두사로 훑으면 그 유실분까지 회수된다.
 */
const DISPOSABLE_EMAIL_PREFIX = 'e2e-auth-session-';

/**
 * 비밀번호를 마음대로 바꿔도 되는 일회용 계정을 ADMIN 세션으로 만든다.
 *
 * 역할도 고객사도 주지 않는다 — 이 스펙이 확인하는 것은 인가가 아니라 자격 증명이고,
 * 권한 없는 계정이 오히려 부작용이 적다.
 *
 * 테스트 본문에서 부르는 이유(beforeAll 이 아니라): 재시도 시에도 매번 새 계정이 생겨
 * "앞선 시도가 이미 비밀번호를 바꿔 둔" 상태에 걸리지 않는다.
 */
async function createDisposableUser(browser: Browser): Promise<{ id: string; email: string }> {
  const admin = await browser.newContext({ storageState: PERSONA_AUTH_FILES.admin });
  try {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const email = `${DISPOSABLE_EMAIL_PREFIX}${stamp}@example.com`;

    const response = await admin.request.post('/api/users', {
      data: { name: 'E2E 세션 테스트', email, password: INITIAL_PASSWORD },
    });
    const status = response.status();
    const raw = await response.text();
    expect(status, `전용 계정 생성 실패 (${status}): ${raw.slice(0, 300)}`).toBe(201);

    const user = JSON.parse(raw) as { id: string };
    return { id: user.id, email };
  } finally {
    await admin.close();
  }
}

/** 접두사에 해당하는 일회용 계정을 모두 완전 삭제하고, 남은 개수를 0 으로 확정한다. */
async function purgeDisposableUsers(browser: Browser): Promise<void> {
  const admin = await browser.newContext({ storageState: PERSONA_AUTH_FILES.admin });
  try {
    const listUrl = `/api/users?search=${encodeURIComponent(DISPOSABLE_EMAIL_PREFIX)}&pageSize=100`;

    const listed = await admin.request.get(listUrl);
    expect(listed.status(), '일회용 계정 조회 실패').toBe(200);
    const { data = [] } = (await listed.json()) as { data?: Array<{ id: string; email: string }> };

    for (const user of data.filter((u) => u.email.startsWith(DISPOSABLE_EMAIL_PREFIX))) {
      const deleted = await admin.request.delete(`/api/users/${user.id}?hard=true`);
      // 공유 DB 다. 정리가 실패하면 다음 실행의 사용자 수가 어긋나므로 조용히 넘기지 않는다.
      expect(deleted.status(), `전용 계정 정리 실패: ${user.email}`).toBe(200);
    }

    // 정리 후 0 건임을 확인한다 — 목록 API 가 조용히 빈 배열을 주는 경우와 구분된다.
    const remaining = await admin.request.get(listUrl);
    const { data: rest = [] } = (await remaining.json()) as {
      data?: Array<{ id: string; email: string }>;
    };
    expect(
      rest.filter((u) => u.email.startsWith(DISPOSABLE_EMAIL_PREFIX)),
      '일회용 계정이 남았다'
    ).toHaveLength(0);
  } finally {
    await admin.close();
  }
}

interface LoginAttempt {
  context: BrowserContext;
  page: Page;
  /**
   * NextAuth 자격 증명 검증의 결과 URL.
   *
   * `signIn('credentials', { redirect: false })` 는 `/api/auth/callback/credentials` 에
   * POST 하고 200 + `{"url": "..."}` 를 받는다. 실패하면 그 URL 에
   * `?error=CredentialsSignin&code=credentials` 가 붙는다(실측). 즉 이 값 하나로
   * "자격 증명이 통과했는가" 가 확정된다.
   */
  callbackUrl: string;
}

/**
 * 로그인 폼이 하이드레이션될 때까지 기다린다.
 *
 * ── 왜 필요한가 (실측으로 확인한 경합) ─────────────────────────────────────
 * 서버는 로그인 폼을 이미 "완성된 모습" 으로 내려준다. 그래서 하이드레이션 전에도 입력과
 * 버튼이 보이고 클릭도 되지만, 그 시점에는
 *   1) `page.fill` 이 발생시킨 input 이벤트를 React 가 받지 못해 `useState` 의
 *      email/password 가 빈 문자열로 남고,
 *   2) `<form>` 의 onSubmit 이 아직 없어 브라우저가 네이티브 제출을 해 버린다.
 * 입력에 name 속성이 없어(LoginForm.tsx 는 id 만 준다) 네이티브 제출의 URL 도 `/login`
 * 그대로라, 화면상으로는 **아무 일도 일어나지 않은 것처럼** 보인다. 실제로 이 경합이
 * 재현됐다 — 자격 증명 콜백이 30초 동안 오지 않았고, 리포트에는 "로그인 후에도 /login" 이라는
 * 원인을 알 수 없는 실패만 남았다.
 *
 * 기다릴 이벤트가 네트워크에 없으므로(하이드레이션은 이미 받은 청크로 일어난다) 대기 조건은
 * DOM 에서 관측한다. React 는 하이드레이션하면서 호스트 노드에 `__reactProps$*` 를 붙이고
 * 거기에 실제 핸들러가 들어간다. 즉 `form.__reactProps$*.onSubmit` 이 함수라는 것이
 * "이 폼의 제출이 이제 React 로 간다" 의 직접적인 증거다.
 */
async function waitForLoginFormHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const form = document.querySelector('form') as
        (HTMLFormElement & Record<string, unknown>) | null;
      const propsKey = form ? Object.keys(form).find((key) => key.startsWith('__reactProps$')) : '';
      const props = propsKey ? (form![propsKey] as { onSubmit?: unknown }) : undefined;
      return typeof props?.onSubmit === 'function';
    },
    undefined,
    { timeout: 30000 }
  );
}

/**
 * 로그인 폼으로 실제 로그인을 시도하고, 결과 판정은 호출자에게 맡긴다.
 *
 * 성공/실패를 여기서 단언하지 않는 이유: 이 스펙은 "옛 비밀번호로는 로그인되지 않는다" 를
 * 확인해야 하므로 실패도 정상 경로다. 성공 여부를 헬퍼가 판단하면 그 경로를 쓸 수 없다.
 *
 * 대기는 URL 변화가 아니라 자격 증명 콜백 **응답**으로 표현한다. 실패 시에는 URL 이
 * 아예 바뀌지 않으므로 내비게이션을 기다릴 수 없고, 성공 시에도 클라이언트 라우팅이라
 * URL 만 보면 "아직 안 눌린 것" 과 "눌렸는데 거부된 것" 이 구분되지 않는다.
 */
async function submitLoginForm(
  browser: Browser,
  email: string,
  password: string
): Promise<LoginAttempt> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await waitForLoginFormHydration(page);

  // 로그인 폼 입력에는 name 속성이 없고 id 만 있다 (helpers/auth-helpers.ts 와 동일).
  await page.fill('#email', email);
  await page.fill('#password', password);

  const verified = page.waitForResponse((r) => r.url().includes('/api/auth/callback/credentials'), {
    timeout: 30000,
  });
  await page.locator('button[type="submit"]').click();
  const response = await verified;
  const body = (await response.json()) as { url?: string };

  return { context, page, callbackUrl: body.url ?? '' };
}

/** 로그인 성공을 자격 증명 콜백 결과로 확정한다. */
function expectCredentialsAccepted(attempt: LoginAttempt): void {
  expect(attempt.callbackUrl, `자격 증명이 거부되었다: ${attempt.callbackUrl}`).not.toContain(
    'error='
  );
}

test.describe('비밀번호 변경', () => {
  // 앞선(실패한) 워커가 남긴 계정까지 함께 회수하려면 시작 전에도 한 번 훑어야 한다.
  test.beforeAll(async ({ browser }) => {
    await purgeDisposableUsers(browser);
  });

  test.afterAll(async ({ browser }) => {
    await purgeDisposableUsers(browser);
  });

  test('현재 비밀번호가 틀리거나 새 비밀번호가 규칙을 어기면 변경을 거부한다', async ({
    browser,
  }) => {
    const account = await createDisposableUser(browser);
    const session = await submitLoginForm(browser, account.email, INITIAL_PASSWORD);

    try {
      expectCredentialsAccepted(session);
      await expect(session.page).toHaveURL(/\/dashboard/);

      // 이 엔드포인트의 핵심 통제: 현재 비밀번호를 모르면 바꿀 수 없다.
      // (src/app/api/profile/password/route.ts 의 bcrypt.compare → UnauthorizedError)
      const wrongCurrent = await session.page.request.post('/api/profile/password', {
        data: {
          currentPassword: WRONG_PASSWORD,
          newPassword: ROTATED_PASSWORD,
          confirmPassword: ROTATED_PASSWORD,
        },
      });
      expect(wrongCurrent.status()).toBe(401);
      expect((await wrongCurrent.json()) as ApiErrorBody).toMatchObject({
        error: '현재 비밀번호가 올바르지 않습니다.',
      });

      // 확인 값 불일치 — changePasswordSchema 의 refine.
      const mismatched = await session.page.request.post('/api/profile/password', {
        data: {
          currentPassword: INITIAL_PASSWORD,
          newPassword: ROTATED_PASSWORD,
          confirmPassword: `${ROTATED_PASSWORD}X`,
        },
      });
      expect(mismatched.status()).toBe(400);
      expect((await mismatched.json()) as ApiErrorBody).toMatchObject({
        error: '새 비밀번호가 일치하지 않습니다.',
      });

      // 복잡도 미달 — passwordSchema.
      const weak = await session.page.request.post('/api/profile/password', {
        data: {
          currentPassword: INITIAL_PASSWORD,
          newPassword: WEAK_PASSWORD,
          confirmPassword: WEAK_PASSWORD,
        },
      });
      expect(weak.status()).toBe(400);
      expect((await weak.json()) as ApiErrorBody).toMatchObject({ code: 'VALIDATION_ERROR' });
    } finally {
      await session.context.close();
    }

    // 거부는 "응답이 4xx" 로 끝나지 않는다. 실제로 비밀번호가 그대로여야 한다.
    const retry = await submitLoginForm(browser, account.email, INITIAL_PASSWORD);
    try {
      expectCredentialsAccepted(retry);
      await expect(retry.page).toHaveURL(/\/dashboard/);
      const session2 = await retry.page.request.get('/api/auth/session');
      expect(((await session2.json()) as SessionBody)?.user?.email).toBe(account.email);
    } finally {
      await retry.context.close();
    }
  });

  test('비밀번호를 바꾸면 새 비밀번호로만 로그인된다', async ({ browser }) => {
    const account = await createDisposableUser(browser);
    const session = await submitLoginForm(browser, account.email, INITIAL_PASSWORD);

    try {
      expectCredentialsAccepted(session);
      await expect(session.page).toHaveURL(/\/dashboard/);

      const changed = await session.page.request.post('/api/profile/password', {
        data: {
          currentPassword: INITIAL_PASSWORD,
          newPassword: ROTATED_PASSWORD,
          confirmPassword: ROTATED_PASSWORD,
        },
      });
      const raw = await changed.text();
      expect(changed.status(), `비밀번호 변경 실패: ${raw.slice(0, 300)}`).toBe(200);
      expect(JSON.parse(raw) as { success?: boolean }).toMatchObject({ success: true });
    } finally {
      await session.context.close();
    }

    // 옛 비밀번호는 더 이상 통하지 않는다 — 이 단언이 없으면 "새 비밀번호도 되고 옛 것도 되는"
    // (즉 해시가 갱신되지 않은) 상태를 통과시킨다.
    const stale = await submitLoginForm(browser, account.email, INITIAL_PASSWORD);
    try {
      expect(stale.callbackUrl).toContain('error=CredentialsSignin');
      // Next.js 는 라우트 안내용 `#__next-route-announcer__` 에도 role="alert" 를 붙인다.
      // 역할만으로 집으면 strict 모드 위반이 나므로 문구로 좁힌다.
      await expect(
        stale.page
          .getByRole('alert')
          .filter({ hasText: '이메일 또는 비밀번호가 올바르지 않습니다.' })
      ).toBeVisible();
      await expect(stale.page).toHaveURL(/\/login/);
      const staleSession = await stale.page.request.get('/api/auth/session');
      expect(await staleSession.json()).toBeNull();
    } finally {
      await stale.context.close();
    }

    // 새 비밀번호로는 로그인된다.
    const fresh = await submitLoginForm(browser, account.email, ROTATED_PASSWORD);
    try {
      expectCredentialsAccepted(fresh);
      await expect(fresh.page).toHaveURL(/\/dashboard/);
      const freshSession = await fresh.page.request.get('/api/auth/session');
      expect(((await freshSession.json()) as SessionBody)?.user?.email).toBe(account.email);
    } finally {
      await fresh.context.close();
    }
  });

  /**
   * 셀프 서비스 비밀번호 재설정은 앱에 존재하지 않는다.
   *
   * 근거:
   *  - src/app/(auth)/ 에는 login / register 뿐이다 (forgot-password 라우트 없음).
   *  - src/components/auth/LoginForm.tsx 는 링크 대신 "시스템 관리자에게 재설정을
   *    요청하세요" 라는 안내 문구만 두고, 주석으로 "셀프 서비스 재설정 플로우는 아직 없다" 고
   *    명시한다.
   *  - 재설정 토큰을 발급/검증하는 API 도 없다 (src/app/api 아래 reset/forgot 라우트 부재).
   * 구현되면 이 fixme 를 실제 테스트로 바꾼다.
   */
  test.fixme('비밀번호를 잊은 사용자가 스스로 재설정할 수 있다', async () => {
    // 미구현: /forgot-password 라우트와 재설정 토큰 API 가 생기면 작성한다.
  });
});
