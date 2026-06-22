import { chromium, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const manualDir = path.join(__dirname, '../public/images/manual');
const authDir = path.join(__dirname, '../playwright/.auth');

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 세션 파일 존재 여부와 상관없이 '무조건' 새로 로그인하여 최신 세션을 갱신 저장하는 헬퍼 함수
async function forceLoginAndSave(role: 'manager' | 'client', email: string, pass: string) {
  const authFile = path.join(authDir, `${role}.json`);
  console.log(`🔑 ${role} 세션을 새롭게 발급 중... (계정: ${email})`);

  const browser = await chromium.launch();
  // 로그인 리디렉션 간섭 방지를 위해 쿠키가 완전히 비어있는 깨끗한 컨텍스트 생성
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();

  try {
    await page.goto('/login');
    await page.waitForSelector('#email', { timeout: 15000 });
    await page.fill('#email', email);
    await page.fill('#password', pass);
    await page.locator('button[type="submit"]').click();

    // 로그인이 정상 완료되어 대시보드나 목록으로 넘어가는지 엄격히 대기
    await page.waitForURL(/\/(dashboard|srs)/, { timeout: 30000 });

    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    // 최신 유효 세션을 덮어쓰기
    await context.storageState({ path: authFile });
    console.log(`✅ ${role} 세션 갱신 완료: ${authFile}`);
  } catch (e) {
    console.error(`❌ ${role} 로그인 세션 갱신 실패! 상세 에러:`, e);
    throw e; // 세션 생성 실패 시 전체 테스트 빌드를 멈추도록 예외 전파
  } finally {
    await context.close();
    await browser.close();
  }
}

test.describe('Manual Screen Captures', () => {
  test.beforeAll(async () => {
    // 캡처본 저장 디렉토리 생성
    if (!fs.existsSync(manualDir)) {
      fs.mkdirSync(manualDir, { recursive: true });
    }

    const managerEmail = process.env.TEST_MANAGER_EMAIL || 'admin@example.com';
    const managerPass = process.env.TEST_MANAGER_PASSWORD || 'admin123';
    const clientEmail = process.env.TEST_CLIENT_EMAIL || 'clientuser@example.com';
    const clientPass = process.env.TEST_CLIENT_PASSWORD || 'client123';

    // 만료된 구 세션을 회피하기 위해 강제 재로그인 프로세스 실행
    await forceLoginAndSave('manager', managerEmail, managerPass);
    await forceLoginAndSave('client', clientEmail, clientPass);
  });

  // 1. 비로그인 페이지 캡처 (로그인 세션 없이 깨끗하게 접속)
  test('Capture Unauthenticated Pages', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // 01_login.png
    try {
      console.log('📸 01_login 캡처 중...');
      await page.goto('/login');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('#email', { timeout: 10000 });
      await wait(1000);
      await page.screenshot({ path: path.join(manualDir, '01_login.png') });
      console.log('✓ 01_login.png 저장 완료');
    } catch (e) {
      console.error('✗ 01_login 캡처 실패:', e);
    }

    // 02_register.png
    try {
      console.log('📸 02_register 캡처 중...');
      await page.goto('/register');
      await page.waitForLoadState('domcontentloaded');
      await page
        .waitForSelector('input[name="username"], #username, #email', { timeout: 10000 })
        .catch(() => null);
      await wait(1000);
      await page.screenshot({ path: path.join(manualDir, '02_register.png') });
      console.log('✓ 02_register.png 저장 완료');
    } catch (e) {
      console.error('✗ 02_register 캡처 실패:', e);
    }

    await context.close();
  });

  // 2. Manager 권한 페이지들 캡처
  test('Capture Manager Auth Pages', async ({ browser }) => {
    const managerAuthFile = path.join(authDir, 'manager.json');
    const context = await browser.newContext({
      storageState: managerAuthFile,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // 03_dashboard.png
    try {
      console.log('📸 03_dashboard 캡처 중...');
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');
      await wait(2000);
      await page.screenshot({ path: path.join(manualDir, '03_dashboard.png') });
      console.log('✓ 03_dashboard.png 저장 완료');
    } catch (e) {
      console.error('✗ 03_dashboard 캡처 실패:', e);
    }

    // 04_sr_list.png
    try {
      console.log('📸 04_sr_list 캡처 중...');
      await page.goto('/srs');
      await page.waitForLoadState('domcontentloaded');
      await wait(1500);
      await page.screenshot({ path: path.join(manualDir, '04_sr_list.png') });
      console.log('✓ 04_sr_list.png 저장 완료');
    } catch (e) {
      console.error('✗ 04_sr_list 캡처 실패:', e);
    }

    // 05_sr_detail.png
    try {
      console.log('📸 05_sr_detail 캡처 중...');
      const rowLink = page.locator('table tbody tr a').first();
      if (await rowLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await rowLink.click();
        await page.waitForURL(/\/srs\/.+/, { timeout: 10000 });
        await page.waitForLoadState('domcontentloaded');
        await wait(2000);
        await page.screenshot({ path: path.join(manualDir, '05_sr_detail.png') });
        console.log('✓ 05_sr_detail.png 저장 완료');
      } else {
        console.log('⚠️ 목록에 클릭할 SR 건이 없어 /srs/1 주소로 직접 캡처를 시도합니다.');
        await page.goto('/srs/1');
        await page.waitForLoadState('domcontentloaded');
        await wait(2000);
        await page.screenshot({ path: path.join(manualDir, '05_sr_detail.png') });
        console.log('✓ 05_sr_detail.png 저장 완료 (직접 접근)');
      }
    } catch (e) {
      console.error('✗ 05_sr_detail 캡처 실패:', e);
    }

    // 07_clients.png
    try {
      console.log('📸 07_clients 캡처 중...');
      await page.goto('/clients');
      await page.waitForLoadState('domcontentloaded');
      await wait(1500);
      await page.screenshot({ path: path.join(manualDir, '07_clients.png') });
      console.log('✓ 07_clients.png 저장 완료');
    } catch (e) {
      console.error('✗ 07_clients 캡처 실패:', e);
    }

    // 08_users.png
    try {
      console.log('📸 08_users 캡처 중...');
      await page.goto('/users');
      await page.waitForLoadState('domcontentloaded');
      await wait(1500);
      await page.screenshot({ path: path.join(manualDir, '08_users.png') });
      console.log('✓ 08_users.png 저장 완료');
    } catch (e) {
      console.error('✗ 08_users 캡처 실패:', e);
    }

    // 09_organization.png
    try {
      console.log('📸 09_organization 캡처 중...');
      await page.goto('/organization');
      await page.waitForLoadState('domcontentloaded');
      await wait(1500);
      await page.screenshot({ path: path.join(manualDir, '09_organization.png') });
      console.log('✓ 09_organization.png 저장 완료');
    } catch (e) {
      console.error('✗ 09_organization 캡처 실패:', e);
    }

    // 10_roles.png
    try {
      console.log('📸 10_roles 캡처 중...');
      await page.goto('/roles');
      await page.waitForLoadState('domcontentloaded');
      await wait(1500);
      await page.screenshot({ path: path.join(manualDir, '10_roles.png') });
      console.log('✓ 10_roles.png 저장 완료');
    } catch (e) {
      console.error('✗ 10_roles 캡처 실패:', e);
    }

    // 11_settings.png
    try {
      console.log('📸 11_settings 캡처 중...');
      await page.goto('/settings');
      await page.waitForLoadState('domcontentloaded');
      await wait(1500);
      await page.screenshot({ path: path.join(manualDir, '11_settings.png') });
      console.log('✓ 11_settings.png 저장 완료');
    } catch (e) {
      console.error('✗ 11_settings 캡처 실패:', e);
    }

    await context.close();
  });

  // 3. Client 권한 페이지들 캡처
  test('Capture Client Auth Pages', async ({ browser }) => {
    const clientAuthFile = path.join(authDir, 'client.json');
    const context = await browser.newContext({
      storageState: clientAuthFile,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // 06_my_requests.png
    try {
      console.log('📸 06_my_requests 캡처 중...');
      await page.goto('/my-requests');
      await page.waitForLoadState('domcontentloaded');
      await wait(2000);
      await page.screenshot({ path: path.join(manualDir, '06_my_requests.png') });
      console.log('✓ 06_my_requests.png 저장 완료');
    } catch (e) {
      console.error('✗ 06_my_requests 캡처 실패:', e);
    }

    await context.close();
  });
});
