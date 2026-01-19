import { expect, test } from '@playwright/test';

test.describe('Error Handling', () => {
  test('should show 404 page for non-existent routes', async ({ page }) => {
    // 존재하지 않는 페이지로 이동
    await page.goto('/dashboard/non-existent-page-12345');

    // 404 페이지 내용 확인
    await expect(page.getByText('페이지를 찾을 수 없습니다')).toBeVisible();
    await expect(
      page.getByText('요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.')
    ).toBeVisible();

    // 대시보드로 돌아가기 버튼 확인 및 클릭
    const backButton = page.getByRole('link', { name: '대시보드로 돌아가기' });
    await expect(backButton).toBeVisible();
    await backButton.click();

    // 대시보드(또는 로그인 페이지)로 이동 확인
    // 인증 상태에 따라 다를 수 있으므로 URL 패턴으로 확인
    await expect(page).toHaveURL(/\/dashboard|\/login/);
  });
});
