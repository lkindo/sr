import { expect, test } from '@playwright/test';

import { ADMIN_PERSONA, ROLE_PERSONAS } from '../helpers/auth-helpers';

import { assertViewport, chooseTheme, login } from './helpers';

test('운영 화면과 고객사·사용자 상세는 양 테마의 320px 화면에서 조회 가능하다', async ({
  page,
}) => {
  await login(page, ADMIN_PERSONA);
  const paths = [
    ['/organization', '조직 트리'],
    ['/roles', '역할 목록'],
    ['/settings/notifications', '알림 설정'],
    ['/settings/system', '시스템 설정'],
    ['/settings/outbox', '알림 발송 이력'],
    ['/settings/audit', '감사 로그'],
  ];
  for (const theme of ['light', 'dark'] as const) {
    await chooseTheme(page, theme);
    await page.setViewportSize({ width: 320, height: 568 });
    for (const [path, heading] of paths) {
      await test.step(`${theme} ${path}`, async () => {
        await page.goto(path!);
        await expect(page.getByRole('heading', { name: heading!, exact: true })).toBeVisible();
        await assertViewport(page);
      });
    }
    for (const resource of ['clients', 'users']) {
      await test.step(`${theme} ${resource} 목록 → 상세 → 목록`, async () => {
        await page.goto(`/${resource}`);
        const link = page.locator(`a[href^="/${resource}/"]`).filter({ visible: true }).first();
        await expect(link).toBeVisible();
        const href = await link.getAttribute('href');
        await link.click();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await assertViewport(page);
        await page.goBack();
        await expect(page).toHaveURL(new RegExp(`/${resource}$`));
        await expect(
          page.getByRole('heading', {
            name: resource === 'clients' ? '고객사 목록' : '사용자 목록',
            exact: true,
          })
        ).toBeVisible();
      });
    }
  }
});

test('고객사 관리자는 모바일 자사 사용자 목록에 접근한다', async ({ page }) => {
  const persona = ROLE_PERSONAS.find((candidate) => candidate.name === 'client-admin')!;
  await login(page, persona);
  for (const theme of ['light', 'dark'] as const) {
    await chooseTheme(page, theme);
    await page.goto('/company/users');
    await expect(page.getByRole('heading', { name: '자사 사용자', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 568 });
    await assertViewport(page);
    await expect(page.getByRole('button', { name: '사용자 등록', exact: true })).toHaveCount(0);
  }
});
