import { expect, test as setup } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * 다중 사용자 인증 설정
 * CLIENT, MANAGER, ENGINEER 역할별 인증 상태 저장
 */

const authDir = path.join(__dirname, '../playwright/.auth');

// 인증 디렉토리 생성
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

// 사용자별 인증 정보
const users = [
  {
    name: 'client',
    email: process.env.TEST_CLIENT_EMAIL || 'clientuser@example.com',
    password: process.env.TEST_CLIENT_PASSWORD || 'client123',
    authFile: path.join(authDir, 'client.json'),
  },
  {
    name: 'manager',
    email: process.env.TEST_MANAGER_EMAIL || 'admin@example.com',
    password: process.env.TEST_MANAGER_PASSWORD || 'admin123',
    authFile: path.join(authDir, 'manager.json'),
  },
  {
    name: 'engineer',
    email: process.env.TEST_ENGINEER_EMAIL || 'engineeruser@example.com',
    password: process.env.TEST_ENGINEER_PASSWORD || 'engineer123',
    authFile: path.join(authDir, 'engineer.json'),
  },
];

for (const user of users) {
  setup(`authenticate as ${user.name}`, async ({ page }) => {
    console.log(`🔐 ${user.name} 로그인 중...`);

    // 로그인 페이지로 이동
    await page.goto('/login');

    // 로그인 폼 입력
    await page.fill('#email', user.email);
    await page.fill('#password', user.password);

    // 로그인 버튼 클릭
    await page.locator('button[type="submit"]').click();

    // 로그인 성공 대기 (dashboard, srs, 또는 기타 인증된 페이지로 리디렉션)
    // URL 변경 대기에 더 유연하게 대응
    try {
      await page.waitForURL(/\/(dashboard|srs|clients|users|settings)/, { timeout: 60000 });
    } catch (e) {
      // URL 변경이 안됐으면 로그인 에러 메시지 확인
      const currentUrl = page.url();
      const errorAlert = page.locator('[role="alert"]');
      if (await errorAlert.isVisible({ timeout: 2000 }).catch(() => false)) {
        const errorText = await errorAlert.textContent();
        throw new Error(`${user.name} 로그인 실패: ${errorText} (URL: ${currentUrl})`);
      }
      // 그래도 dashboard 진입 확인
      if (!currentUrl.includes('login')) {
        console.log(`⚠️ ${user.name} URL 변경 감지됨 (예상치 못한 URL): ${currentUrl}`);
      } else {
        throw new Error(
          `${user.name} 로그인 실패: 여전히 로그인 페이지에 있음 (URL: ${currentUrl})`
        );
      }
    }

    console.log(`✅ ${user.name} 로그인 성공!!`);

    // 주요 페이지 워밍업 (manager만)
    if (user.name === 'manager') {
      console.log(`🔥 ${user.name} 페이지 워밍업 중...`);
      const warmupPages = ['/dashboard'];
      for (const pagePath of warmupPages) {
        try {
          await page.goto(pagePath, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(500);
          console.log(`  ✓ ${pagePath} 워밍업 완료`);
        } catch (err) {
          console.log(`  ⚠ ${pagePath} 워밍업 실패 (무시)`);
        }
      }
    }

    // 인증 상태 저장
    await page.context().storageState({ path: user.authFile });

    console.log(`✅ ${user.name} 인증 상태 저장 완료: ${user.authFile}`);
  });
}
