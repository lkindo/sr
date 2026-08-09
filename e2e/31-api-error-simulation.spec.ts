import { expect, test } from '@playwright/test';

import { withAuthContext } from './helpers/test-helpers';

/**
 * 이 스펙은 오랫동안 **발동하지 않는 인터셉트**를 걸고 있었다.
 *
 * `page.route('**\/api\/service-categories*')` 로 REST 를 가로챘지만, 브라우저는 그
 * 엔드포인트를 호출하지 않는다 — 카테고리는 Next 서버 액션(`getServiceCategoriesForSelection`)
 * 으로 오고, 서버 액션은 `next-action` 헤더를 달고 **현재 페이지 URL** 로 POST 된다.
 * 그래서 500 이 주입된 적이 없고, 기대하던 토스트도 뜬 적이 없다.
 *
 * 또 하나: 카테고리 조회는 고객사가 선택된 뒤에만 일어난다(감사 3.19 의 테넌트 스코핑).
 * 고객사를 고르지 않으면 요청 자체가 없다.
 *
 * 그래서 서버 액션 POST 를 `next-action` 헤더로 정확히 겨냥하고, 등록 시점도 맞춘다.
 */
test.describe('API 에러 시뮬레이션 및 UI 대응 검증', () => {
  /** 서버 액션 POST 만 가로챈다(일반 내비게이션·정적 요청은 통과). */
  const failServerActions = (page: import('@playwright/test').Page) =>
    page.route('**/srs', (route, request) => {
      if (request.method() === 'POST' && request.headers()['next-action']) {
        return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
      }
      return route.continue();
    });

  test('카테고리 조회가 실패하면 사용자에게 알린다', async ({ browser }) => {
    await withAuthContext(browser, 'manager', async (page) => {
      await page.goto('/srs');

      await page.getByRole('button', { name: /등록/ }).first().click();
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 10000 });

      // 고객사 목록도 서버 액션으로 온다. 그것까지 죽이지 않도록, 목록이 채워진 뒤에
      // 인터셉트를 건다. 그 다음 고객사를 고르면 카테고리 조회만 실패한다.
      const clientCombobox = dialog.getByRole('combobox', { name: /고객사/ });
      await expect(clientCombobox).toBeEnabled({ timeout: 10000 });

      await failServerActions(page);

      await clientCombobox.click();
      await page.getByRole('option').first().click();

      // exact 를 붙이는 이유: Radix Toast 는 같은 문구를 스크린리더용
      // `<span role="status" aria-live="assertive">` 에 한 번 더 심는다. 그쪽 텍스트는
      // "Notification 오류<본문>" 이라 부분 일치로는 둘 다 걸려 strict mode 위반이 난다.
      await expect(
        page.getByText('서비스 카테고리 목록을 불러오지 못했습니다.', { exact: true })
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test('필수 항목이 비어 있으면 저장 전에 막는다', async ({ browser }) => {
    await withAuthContext(browser, 'manager', async (page) => {
      await page.goto('/srs');

      await page.getByRole('button', { name: /등록/ }).first().click();
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible({ timeout: 10000 });

      await page.getByLabel('제목 *').fill('에러 테스트용 SR');
      await page.getByLabel('설명 *').fill('서버 액션 실패를 테스트하기 위한 설명입니다.');

      // 고객사·카테고리를 비운 채 저장하면 서버까지 가지 않고 앱이 먼저 막는다.
      // 예전 이 테스트는 응답 body 의 error 문자열이 화면에 뜰 것을 기대했는데,
      // 앱은 그 필드를 읽지 않으므로 나올 수 없는 단언이었다.
      await page.getByRole('button', { name: '저장' }).click();

      await expect(
        page.getByText('고객사와 카테고리를 모두 선택해주세요.', { exact: true })
      ).toBeVisible({ timeout: 10000 });
    });
  });
});
