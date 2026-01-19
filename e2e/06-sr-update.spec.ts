import { expect, test } from '@playwright/test';

import { createTestSR } from './helpers/test-helpers';

/**
 * SR 수정 플로우 테스트
 */

test.describe.skip('SR 수정', () => {
  // UpstashError: ERR max requests limit exceeded 오류로 인해 스킵 (2025-11-30)
  // Redis 쿼터 확보 후 다시 활성화 필요
  test.use({ storageState: './playwright/.auth/manager.json' });

  test('SR 생성 후 수정 플로우', async ({ page }) => {
    // 1. 테스트용 SR 생성 (Helper 함수 사용)
    const srId = await createTestSR(page, {
      title: `수정 테스트용 SR ${Date.now()}`,
      description: '이 SR은 수정 테스트를 위해 생성되었습니다.',
    });

    // 2. 상세 페이지로 이동
    const detailResponsePromise = page
      .waitForResponse(
        (resp) => resp.url().includes(`/api/srs/${srId}`) && resp.request().method() === 'GET',
        { timeout: 10000 }
      )
      .catch(() => null);
    await page.goto(`/srs/${srId}`);
    await detailResponsePromise;

    // 3. 수정 버튼 확인 및 클릭
    const editButton = page
      .locator('button')
      .filter({ hasText: /수정|Edit/ })
      .first();
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    // 4. 수정 다이얼로그 확인
    await expect(page.getByRole('heading', { name: /SR 수정|Edit SR/ })).toBeVisible({
      timeout: 5000,
    });

    // 5. 내용 수정
    const newTitle = `수정된 제목 ${Date.now()}`;
    await page.getByRole('textbox', { name: '제목' }).fill(newTitle);
    // 설명이 비어있을 수 있으므로 다시 채움 (유효성 검사 통과 보장)
    await page
      .getByRole('textbox', { name: '설명' })
      .fill('수정된 설명입니다. 길이를 10자 이상으로 맞춥니다.');

    // 6. 저장
    // Server Action을 사용하므로 PATCH 요청이 아닌 POST 요청이 발생함
    // 다이얼로그가 닫히는 것을 기다림
    await page.getByRole('button', { name: /저장|Save/ }).click();

    // 다이얼로그가 닫히는지 확인 (타임아웃 20초)
    await expect(page.getByRole('heading', { name: /SR 수정|Edit SR/ })).not.toBeVisible({
      timeout: 20000,
    });

    // 7. 수정 결과 확인 (제목이 변경되었는지)
    // 페이지가 리로드되거나 UI가 갱신될 수 있음. 제목 요소가 새로운 텍스트를 포함하는지 확인
    const titleLocator = page.locator('h1, h2, h3').filter({ hasText: newTitle });

    try {
      await expect(titleLocator).toBeVisible({ timeout: 5000 });
    } catch {
      console.log('Title not updated immediately, reloading...');
      await page.reload();
      await expect(titleLocator).toBeVisible({ timeout: 10000 });
    }

    console.log(`✅ SR 수정 완료: ${srId} -> ${newTitle}`);
  });
});
