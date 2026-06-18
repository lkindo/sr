import { expect, test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  // 로그인 페이지로 이동
  await page.goto('/login');

  // 로그인 폼 입력
  await page.fill('input[name="email"]', process.env.TEST_USER_EMAIL || 'admin@example.com');
  await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD || 'admin123');

  // 로그인 버튼 클릭
  await page.click('button[type="submit"]');

  // 로그인 성공 후 대시보드로 리디렉션 대기
  await page.waitForURL('/dashboard');

  // 로그인 상태 확인
  await expect(page.locator('text=대시보드')).toBeVisible();

  // 인증 상태 저장
  await page.context().storageState({ path: authFile });
});
