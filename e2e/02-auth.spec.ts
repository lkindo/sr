import { expect, type Page, test } from '@playwright/test';

import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * 인증 플로우 — 회원가입과 로그인이 **정말로** 무엇을 만들고 무엇을 막는가.
 *
 * 이 스펙은 **익명 상태**여야 한다.
 * `chromium` 프로젝트는 `storageState: './playwright/.auth/user.json'` 로 로그인된 ADMIN
 * 세션을 들고 시작한다(playwright.config.ts). 그 상태로 `/register` 나 `/login` 에 가면
 * `src/auth.config.ts` 의 `authorized()` 가 `/dashboard` 로 리다이렉트하므로, 회원가입
 * 폼이 영영 나타나지 않고 단언이 타임아웃난다.
 *
 * ── 예전 문제 ────────────────────────────────────────────────────────────
 * '잘못된 자격 증명' 은 `expect(errorVisible || stillOnLogin).toBeTruthy()` 였다.
 * 로그인 페이지에 그냥 머물러 있기만 해도 통과하므로, 인증이 통째로 망가져도 초록불이다.
 * 회원가입 성공 판정은 `if (successVisible) {...} else { console.log('⚠️ ...') }` 였다.
 * 그리고 고정 대기가 10회 15초. 셋 다 걷어냈다.
 *
 * ── 지금 검증하는 계약 (src/app/(auth)/register/actions.ts) ─────────────
 *  CLIENT   가입 → 계정은 활성, 고객사 소속은 PENDING (승인 전에는 데이터 접근 불가)
 *  ENGINEER 가입 → 계정 자체가 비활성 (관리자 승인 전에는 로그인 불가)
 * 이 둘이 셀프 가입의 보안 경계다. 예전 스펙은 "로그인 페이지로 이동했는가" 까지만 봤다.
 */

test.use({ storageState: { cookies: [], origins: [] } });

/** 이 스펙이 만든 계정. afterAll 에서 지운다 — 공유 DB 라 매 실행 쌓이면 안 된다. */
const registeredEmails: string[] = [];

test.afterAll(async ({ browser }) => {
  if (registeredEmails.length === 0) return;
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES.admin });
  try {
    for (const email of registeredEmails) {
      const lookup = await context.request.get(
        `/api/users?search=${encodeURIComponent(email)}&pageSize=5`
      );
      if (!lookup.ok()) continue;
      const found = ((await lookup.json()) as { data?: Array<{ id: string; email: string }> }).data;
      const user = (found ?? []).find((candidate) => candidate.email === email);
      if (!user) continue;
      const removed = await context.request.delete(`/api/users/${user.id}?hard=true`);
      if (!removed.ok()) {
        console.warn(`가입 계정 정리 실패: ${email} → ${removed.status()}`);
      }
    }
  } finally {
    await context.close();
  }
});

const PASSWORD = 'TestPassword123!';

function uniqueEmail(prefix: string): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 10000)}@example.com`;
}

/** 회원가입 폼의 공통 입력. 계정 유형 선택과 제출은 호출부가 한다. */
async function fillRegistrationBasics(page: Page, name: string, email: string) {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: '회원가입' })).toBeVisible({ timeout: 20000 });

  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.fill('#confirmPassword', PASSWORD);
}

/** 로그인 폼을 채우고 제출한다. 결과 판정은 호출부가 한다. */
async function submitLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.locator('button[type="submit"]').click();
}

test.describe('회원가입', () => {
  test('CLIENT 가입 계정은 활성이지만 고객사 소속은 승인 대기다', async ({ page }) => {
    const email = uniqueEmail('client');
    await fillRegistrationBasics(page, 'E2E Test Client User', email);

    // CLIENT 가 기본값이다 — 기본값이 바뀌면 이 단언이 먼저 알려 준다.
    await expect(page.locator('#client')).toBeChecked();

    // 고객사 선택 드롭다운은 /api/clients/public 응답 뒤에 채워진다(RegisterForm.tsx:144).
    // 고정 대기 대신 그 응답을 기다린다.
    const clientSelect = page.locator('#client-select');
    await expect(clientSelect).toBeVisible({ timeout: 15000 });
    await clientSelect.click();
    const firstClient = page.getByRole('option').first();
    await expect(firstClient).toBeVisible({ timeout: 10000 });
    await firstClient.click();

    await page.click('button[type="submit"]');
    registeredEmails.push(email);

    // 안내 문구가 계약이다. CLIENT 는 "고객사 관리자 승인" 을 안내받아야 한다
    // (register/actions.ts:123). 이게 사라지면 사용자는 왜 데이터가 안 보이는지 알 수 없다.
    await expect(page.getByText('고객사 관리자 승인 후 이용할 수 있습니다.')).toBeVisible({
      timeout: 15000,
    });
    await page.waitForURL('/login', { timeout: 20000 });

    // 여기서부터가 예전 스펙이 보지 않던 부분이다.
    // 계정은 활성이므로 로그인은 되지만, 소속이 PENDING 이라 clientIds 는 비어 있어야 한다.
    await submitLogin(page, email, PASSWORD);
    await page.waitForURL(/\/(dashboard|srs)/, { timeout: 30000 });

    const session = await page.request.get('/api/auth/session');
    expect(session.status()).toBe(200);
    const body = (await session.json()) as { user?: { email?: string; clientIds?: string[] } };
    expect(body.user?.email).toBe(email);
    expect(
      body.user?.clientIds ?? [],
      '승인 전인데 고객사 소속이 세션에 들어갔다 — 승인 전 크로스테넌트 접근이 열린다'
    ).toEqual([]);
  });

  test('ENGINEER 가입 계정은 승인 전까지 로그인할 수 없다', async ({ page }) => {
    const email = uniqueEmail('engineer');
    await fillRegistrationBasics(page, 'E2E Test Engineer', email);

    await page.locator('label[for="engineer"]').click();
    await expect(page.locator('#engineer')).toBeChecked();

    // 폼이 승인 필요를 미리 알려 줘야 한다.
    await expect(page.getByText(/관리자 승인/).first()).toBeVisible();

    await page.click('button[type="submit"]');
    registeredEmails.push(email);

    await expect(page.getByText('관리자 승인 후 사용 가능합니다.')).toBeVisible({ timeout: 15000 });
    await page.waitForURL('/login', { timeout: 20000 });

    // 계정은 isActive: false 로 만들어진다(register/actions.ts:93).
    // 따라서 승인 전 로그인은 반드시 막혀야 한다 — 이게 이 경로의 보안 경계다.
    await submitLogin(page, email, PASSWORD);

    await expect(
      page.locator('[role="alert"]').first(),
      '비활성 계정으로 로그인했는데 오류 안내가 없다'
    ).toBeVisible({ timeout: 20000 });
    await expect(page, '승인 전 ENGINEER 계정이 로그인에 성공했다').toHaveURL(/\/login/);

    // 세션이 없으면 이 엔드포인트는 200 과 함께 **본문 null** 을 준다(빈 객체가 아니다).
    const session = await page.request.get('/api/auth/session');
    const body = (await session.json()) as { user?: unknown } | null;
    expect(body?.user, '로그인이 실패했는데 세션이 만들어졌다').toBeFalsy();
  });
});

test.describe('로그인', () => {
  test('잘못된 자격 증명은 세션을 만들지 않는다', async ({ page }) => {
    await submitLogin(page, 'invalid@example.com', 'wrongpassword');

    // 예전에는 `errorVisible || stillOnLogin` 이라 그냥 머물러 있기만 해도 통과했다.
    // 오류 안내와 "세션이 없다" 를 **둘 다** 단언한다. 후자가 진짜 보안 계약이다.
    await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/\/login/);

    // 세션이 없으면 이 엔드포인트는 200 과 함께 **본문 null** 을 준다(빈 객체가 아니다).
    const session = await page.request.get('/api/auth/session');
    expect(session.status()).toBe(200);
    const body = (await session.json()) as { user?: unknown } | null;
    expect(body?.user, '자격 증명이 틀렸는데 세션이 만들어졌다').toBeFalsy();
  });

  test('시드 관리자 계정으로 로그인하면 대시보드에 도달한다', async ({ page }) => {
    // 예전에는 이 테스트가 회원가입부터 다시 하고, 리디렉션이 안 되면 수동으로 goto 한 뒤
    // 그 결과를 판정했다. 즉 로그인이 리디렉션을 못 해도 통과할 여지가 있었다.
    const email = process.env.TEST_USER_EMAIL || 'admin@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'admin123';

    await submitLogin(page, email, password);
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });

    await expect(page.getByRole('heading', { name: '대시보드', exact: true })).toBeVisible({
      timeout: 20000,
    });

    const session = await page.request.get('/api/auth/session');
    const body = (await session.json()) as { user?: { email?: string; roles?: string[] } };
    expect(body.user?.email).toBe(email);
    expect(body.user?.roles).toContain('ADMIN');
  });
});
