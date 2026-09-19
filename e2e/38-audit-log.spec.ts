import { expect, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from './fixtures/sr';
import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * 감사 로그 조회 화면(ADMIN 전용, 2026-09-18 소유자 결정 D11).
 *
 * 예전에는 감사 로그를 읽는 코드가 없어 서버에 SSH 로 들어가 SQL 을 쳐야 했다. 여기서는 마감일 조정으로 감사
 * 기록을 하나 만들고, 화면에서 조건으로 찾아 변경 내용(사유)까지 펼쳐 본다. ADMIN 이 아니면 API 는 403,
 * 화면은 존재 자체를 드러내지 않는다(not-found 화면).
 *
 * 세션은 chromium 프로젝트의 기본 storageState(ADMIN)다.
 */

let sr: SeededSR | undefined;
const REASON = `E2E 감사 로그 확인 ${Date.now()}`;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  sr = await seedSR(browser, { stage: 'IN_PROGRESS', title: 'D11 감사 로그 E2E' });
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES.admin });
  try {
    const response = await context.request.patch(`/api/srs/${sr.id}`, {
      data: {
        dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        changeReason: REASON,
      },
    });
    expect(response.status(), `감사 기록 준비 실패: ${await response.text()}`).toBe(200);
  } finally {
    await context.close();
  }
});

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, [sr?.id]);
});

test.describe('감사 로그(D11)', () => {
  test('ADMIN 은 조건으로 기록을 찾고 변경 내용을 펼쳐 본다', async ({ page }) => {
    await page.goto('/settings/audit');
    await expect(page.getByRole('heading', { name: '감사 로그' })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel('대상 종류').click();
    await page.getByRole('option', { name: 'SR 마감일 (SR_DUE_DATE)' }).click();
    await page.getByRole('button', { name: '조회' }).click();

    const row = page.locator('tr', { hasText: sr!.id }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: '펼치기' }).click();
    await expect(page.getByText(REASON)).toBeVisible();
  });

  test('ADMIN 이 아니면(엔지니어) API 는 403, 화면은 찾을 수 없음으로 보인다', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES.engineer });
    try {
      const response = await context.request.get('/api/audit-logs');
      expect(response.status()).toBe(403);

      // 대시보드 레이아웃은 스트리밍이라 레이아웃의 notFound() 는 HTTP 200 에 not-found 화면으로 온다
      // (34-user-detail 과 같은 이유). 화면이 존재를 드러내지 않는지를 본다.
      const page = await context.newPage();
      await page.goto('/settings/audit', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('페이지를 찾을 수 없습니다')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('heading', { name: '감사 로그' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
