import { expect, test } from '@playwright/test';

import { createTestSR } from './helpers/test-helpers';

/**
 * SR 수정 플로우 테스트
 */

test.describe('SR 수정', () => {
  // 레이트 리미트 정책이 로컬 메모리 기반(MemoryRateLimiter)으로 전면 통합되어 쿼터 제한 없이 안전하게 구동됨
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
    // 이 단언은 `h1, h2, h3` 안에서 제목을 찾고 있었는데, 상세 페이지의 헤딩은 SR 번호이고
    // 제목은 <p> 로 렌더된다(src/app/(dashboard)/srs/[id]/page.tsx). 즉 구조적으로 절대
    // 매칭되지 않는 셀렉터였다 — 수정 자체는 성공하는데 검증만 실패하고 있었다.
    // 마크업 변경에 흔들리지 않도록 testid 로 겨냥한다.
    const titleLocator = page.getByTestId('sr-title').filter({ hasText: newTitle });

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
