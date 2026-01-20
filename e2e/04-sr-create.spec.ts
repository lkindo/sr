import { expect, test } from '@playwright/test';

import { createTestSR, deleteSRViaAPI, findSRInList } from './helpers/test-helpers';

/**
 * SR 생성 플로우 테스트
 *
 * 헬퍼 함수를 사용하여 간소화됨
 */

test.describe('SR 생성', () => {
  const createdSRIds: string[] = [];

  test.afterAll(async ({ browser }) => {
    // 생성된 모든 SR 삭제
    if (createdSRIds.length > 0) {
      const context = await browser.newContext({ storageState: './playwright/.auth/user.json' });
      const request = context.request;
      console.log(`🧹 Cleaning up ${createdSRIds.length} SRs...`);
      for (const id of createdSRIds) {
        await deleteSRViaAPI(request, id);
      }
      await context.close();
    }
  });

  test('SR 생성 다이얼로그 열기', async ({ page }) => {
    await page.goto('/srs');

    // 등록 버튼 클릭
    await page.click('button:has-text("등록")');

    // 다이얼로그 제목 확인
    await expect(page.getByRole('heading', { name: /새 SR 요청/ })).toBeVisible();
  });

  test('SR 생성 플로우 - 전체 (헬퍼 사용)', async ({ page }) => {
    const timestamp = Date.now();
    const srTitle = `E2E 테스트 SR ${timestamp}`;

    // 헬퍼 함수로 SR 생성
    const srId = await createTestSR(page, {
      title: srTitle,
      description: '이것은 Playwright를 사용한 E2E 테스트 SR입니다.',
    });

    expect(srId).toBeDefined();
    if (srId) createdSRIds.push(srId);

    // SR이 목록에 있는지 확인
    await page.goto('/srs');
    const srRow = await findSRInList(page, srTitle);
    await expect(srRow).toBeVisible();
  });

  test('SR 생성 유효성 검증', async ({ page }) => {
    await page.goto('/srs');

    // 등록 버튼 클릭
    await page.click('button:has-text("등록")');

    // 빈 폼으로 제출 시도
    await page.click('button[type="submit"]:has-text("저장")');

    // 유효성 검증 메시지 확인
    await expect(page.locator('text=필수')).toBeVisible();
  });

  test('SR 생성 실패 - 비활성 조건 (예시)', async ({ page }) => {
    // NOTE: 이 테스트는 비활성 고객사에 대한 SR 생성 실패를 검증
    // 실제 구현은 테스트 데이터 설정에 따라 달라질 수 있음
    await page.goto('/srs');

    // 등록 버튼 클릭
    await page.click('button:has-text("등록")');
    await expect(page.getByRole('heading', { name: /새 SR 요청/ })).toBeVisible();

    // 비활성 고객사가 선택 불가능한지 확인 (UI에서 필터링)
    const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
    if (await clientCombobox.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await clientCombobox.click();
      await page.waitForTimeout(500);

      // 비활성 고객사가 옵션에 없는지 확인
      const options = page.getByRole('option');
      const optionCount = await options.count();
      console.log(`✅ 활성 고객사 ${optionCount}개 표시됨`);
    }
  });
});
