import { expect, type Locator, type Page, test } from '@playwright/test';

import { ADMIN_PERSONA, fetchSession } from '../helpers/auth-helpers';

import { assertViewport, chooseTheme, login } from './helpers';

const themes = ['light', 'dark'] as const;
const viewports = [
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  // A reduced viewport checks available space; it does not emulate an iOS keyboard.
  { width: 390, height: 360 },
];

async function reachControl(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect(control).toBeInViewport({ ratio: 1 });
}

async function openMobilePage(
  page: Page,
  section: string,
  label: string,
  path: string,
  heading: string
) {
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'SR Management', exact: true });
  await expect(menu).toBeVisible();
  const sectionToggle = menu.getByRole('button', { name: section, exact: true });
  await expect(sectionToggle).toBeVisible();
  if ((await sectionToggle.getAttribute('aria-expanded')) === 'false') {
    await sectionToggle.click();
  }
  await menu.getByRole('link', { name: label, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}(?:\\?|$)`));
  await expect(menu).toBeHidden();
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await assertViewport(page);
}

async function assertDialogFits(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () =>
      dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left >= -1,
          right: bounds.right <= window.innerWidth + 1,
          top: bounds.top >= -1,
          bottom: bounds.bottom <= window.innerHeight + 1,
          contentWidth: element.scrollWidth <= element.clientWidth + 1,
        };
      })
    )
    .toEqual({ left: true, right: true, top: true, bottom: true, contentWidth: true });
  await assertViewport(page);
}

test('모바일 로그인 필수값 검증과 가입 입력은 양 테마의 작은 화면·가로·축소 높이에서 접근 가능하다', async ({
  page,
}) => {
  const submittedPaths: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') submittedPaths.push(new URL(request.url()).pathname);
  });

  for (const theme of themes) {
    await page.goto('/login');
    await chooseTheme(page, theme);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    expect(
      await page
        .locator('#email')
        .evaluate((input: HTMLInputElement) => input.validity.valueMissing)
    ).toBe(true);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('이메일', { exact: true }).fill('invalid-email');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    expect(
      await page
        .locator('#email')
        .evaluate((input: HTMLInputElement) => input.validity.typeMismatch)
    ).toBe(true);
    await expect(page).toHaveURL(/\/login$/);

    await page.getByRole('link', { name: '회원가입', exact: true }).click();
    await expect(page.getByRole('heading', { name: '회원가입', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByLabel('이름', { exact: true }).fill('모바일 입력 검증');
    await page.getByLabel('이메일', { exact: true }).fill('mobile-form@example.invalid');

    for (const viewport of viewports) {
      await test.step(`${theme} 가입 폼 ${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await assertViewport(page);
        const name = page.getByLabel('이름', { exact: true });
        await reachControl(name);
        await name.click();
        await expect(name).toBeFocused();
        await expect(name).toHaveValue('모바일 입력 검증');
        const confirmPassword = page.locator('#confirmPassword');
        await reachControl(confirmPassword);
        await confirmPassword.click();
        await expect(confirmPassword).toBeFocused();
        await page.getByText('기술 지원팀', { exact: true }).click();
        await expect(page.getByText('관리자 승인', { exact: true })).toBeVisible();
        const submit = page.getByRole('button', { name: '회원가입', exact: true });
        await reachControl(submit);
        await expect(submit).toBeEnabled();
        await page.getByText('고객사 담당자', { exact: true }).click();
        await expect(submit).toBeDisabled();
        await reachControl(page.getByRole('link', { name: '로그인', exact: true }));
        await assertViewport(page);
      });
    }
    await page.getByRole('link', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  }
  // Native invalid forms and registration browsing must not reach login throttling or send mail.
  expect(submittedPaths).toEqual([]);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  const cachedPaths = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith('sr-mgt-cache-'));
    const requests = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return requests.flat().map((request) => new URL(request.url).pathname);
  });
  // Keep the actual mobile service worker enabled: cached router responses caused repeat visits to hang.
  expect(cachedPaths.length).toBeGreaterThan(0);
  expect(
    cachedPaths.every((path) =>
      ['/favicon.ico', '/icons/icon-192x192.png', '/icons/icon-512x512.png'].includes(path)
    )
  ).toBe(true);
});

test('모바일 메뉴로 업무 목록과 프로필에 접근하고 테마를 유지한 채 로그아웃한다', async ({
  page,
}) => {
  await login(page, ADMIN_PERSONA);
  for (const theme of themes) {
    await chooseTheme(page, theme);
    await openMobilePage(page, 'SR 관리', 'SR 전체 목록', '/srs', 'SR 목록');
    await openMobilePage(page, 'SR 관리', '내 요청 SR', '/my-requests', '내 요청 SR');
    await openMobilePage(page, '조직 관리', '사용자 목록', '/users', '사용자 목록');
    await openMobilePage(page, '조직 관리', '고객사 목록', '/clients', '고객사 목록');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

    await page.getByRole('button', { name: '사용자 메뉴', exact: true }).click();
    await page.getByRole('menuitem', { name: '프로필', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole('heading', { name: '프로필', exact: true })).toBeVisible();
    await expect(page.getByLabel('이메일', { exact: true })).toBeDisabled();
    await page.getByRole('tab', { name: '보안', exact: true }).click();
    const currentPassword = page.getByLabel('현재 비밀번호', { exact: true });
    await reachControl(currentPassword);
    await currentPassword.click();
    await expect(currentPassword).toBeFocused();
    await expect(page.getByRole('button', { name: '비밀번호 변경', exact: true })).toBeDisabled();
    await assertViewport(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: '프로필', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }
  await page.getByRole('button', { name: '사용자 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  expect(await fetchSession(page)).toBeNull();
  await page.goto('/srs');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('모바일 사용자·고객사 등록 창은 작은 화면·가로·축소 높이에서 입력과 취소에 접근 가능하다', async ({
  page,
}) => {
  await login(page, ADMIN_PERSONA);
  const writes: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method()) &&
      /^\/api\/(users|clients)(?:\/|$)/.test(path)
    ) {
      writes.push(`${request.method()} ${path}`);
    }
  });

  for (const theme of themes) {
    await chooseTheme(page, theme);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await test.step(`${theme} 사용자·고객사 등록 창 ${viewport.width}×${viewport.height}`, async () => {
        await openMobilePage(page, '조직 관리', '사용자 목록', '/users', '사용자 목록');
        await page.getByRole('button', { name: '사용자 등록', exact: true }).click();
        const userDialog = page.getByRole('dialog', { name: '새 사용자 추가', exact: true });
        await assertDialogFits(page, userDialog);
        await reachControl(userDialog.getByLabel('이름 *', { exact: true }));
        await userDialog.getByLabel('이름 *', { exact: true }).fill('모바일 취소 검증');
        await reachControl(userDialog.getByLabel('비밀번호 확인 *', { exact: true }));
        const userCancel = userDialog.getByRole('button', { name: '취소', exact: true });
        await reachControl(userCancel);
        await userCancel.click();
        await expect(userDialog).toBeHidden();

        await openMobilePage(page, '조직 관리', '고객사 목록', '/clients', '고객사 목록');
        await page.getByRole('button', { name: '등록', exact: true }).click();
        const clientDialog = page.getByRole('dialog', { name: '새 고객사 추가', exact: true });
        await assertDialogFits(page, clientDialog);
        await reachControl(clientDialog.getByLabel('고객사 코드 *', { exact: true }));
        await clientDialog.getByLabel('고객사 코드 *', { exact: true }).fill('MOBILE-CANCEL');
        await reachControl(clientDialog.getByLabel('계약 종료일', { exact: true }));
        const clientCancel = clientDialog.getByRole('button', { name: '취소', exact: true });
        await reachControl(clientCancel);
        await clientCancel.click();
        await expect(clientDialog).toBeHidden();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      });
    }
  }
  expect(writes).toEqual([]);
});
