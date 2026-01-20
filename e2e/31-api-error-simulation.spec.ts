import { expect, test } from '@playwright/test';

import { withAuthContext } from './helpers/test-helpers';

test.describe('API 에러 시뮬레이션 및 UI 대응 검증', () => {
  test('API 500 에러 발생 시 데이터 테이블 에러 대응', async ({ browser }) => {
    await withAuthContext(browser, 'manager', async (page) => {
      // /api/srs 요청을 가로채서 500 에러 반환 (클라이언트 사이드 페치인 경우)
      // 현재 프로젝트는 서버 사이드 페치이므로, 클라이언트 사이드에서 호출하는 API를 타겟팅

      await page.goto('/srs');

      // SR 생성 다이얼로그를 열 때 호출되는 카테고리 조회 API 실패 시뮬레이션
      await page.route('**/api/service-categories*', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Internal Server Error',
            message: '카테고리를 불러올 수 없습니다.',
          }),
        });
      });

      // SR 생성 버튼 클릭
      const createButton = page.getByRole('button', { name: /등록/ }).first();
      await createButton.click();

      // 토스트 메시지 또는 에러 알림 확인
      const errorToast = page.getByText('서비스 카테고리 목록을 불러오지 못했습니다.');
      await expect(errorToast).toBeVisible({ timeout: 10000 });

      console.log('✅ API 500 에러 시 UI 토스트 노출 확인 완료');
    });
  });

  test('서버 액션 실패 시 UI 대응 검증', async ({ browser }) => {
    await withAuthContext(browser, 'manager', async (page) => {
      await page.goto('/srs');

      // SR 생성 버튼 클릭
      const createButton = page.getByRole('button', { name: /등록/ }).first();
      await createButton.click();

      // 폼 입력
      await page.getByLabel('제목 *').fill('에러 테스트용 SR');
      await page.getByLabel('설명 *').fill('서버 액션 실패를 테스트하기 위한 설명입니다.');

      // 서버 액션(/srs) 요청 가로채기
      await page.route('**/srs', (route, request) => {
        if (request.method() === 'POST') {
          route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({
              success: false,
              error: '권한이 없거나 서버 오류가 발생했습니다.',
            }),
          });
        } else {
          route.continue();
        }
      });

      // 저장 버튼 클릭
      const saveButton = page.getByRole('button', { name: '저장' });
      await saveButton.click();

      // 에러 토스트 확인
      const errorToast = page.getByText('권한이 없거나 서버 오류가 발생했습니다.');
      await expect(errorToast).toBeVisible({ timeout: 10000 });

      console.log('✅ 서버 액션 실패 시 UI 에러 대응 확인 완료');
    });
  });
});
