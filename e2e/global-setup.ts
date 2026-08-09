import { chromium, FullConfig } from '@playwright/test';
import path from 'path';

async function globalSetup(config: FullConfig) {
  console.log('🔐 Global Setup: 로그인 상태 저장 중...');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 개발 서버 URL.
    //
    // `config.projects[0].use.baseURL` 만 보면 안 된다 — baseURL 은 playwright.config 의
    // **최상위** `use` 에 있고 프로젝트별 `use` 에는 없어서 항상 undefined 로 떨어졌다.
    // 그 결과 BASE_URL=http://localhost:3100 으로 돌려도 글로벌 셋업만 3000 번(다른 서버)에
    // 로그인해서 엉뚱한 인증 상태를 user.json 에 덮어썼다. BASE_URL 을 1순위로 본다.
    const baseURL =
      process.env.BASE_URL || config.projects[0]?.use.baseURL || 'http://localhost:3000';

    // 로그인 페이지로 이동
    await page.goto(`${baseURL}/login`);

    // 로그인 폼 입력
    await page.fill('#email', process.env.TEST_USER_EMAIL || 'admin@example.com');
    await page.fill('#password', process.env.TEST_USER_PASSWORD || 'admin123');

    // 로그인 버튼 클릭
    await page.click('button[type="submit"]');

    // 로그인 성공 대기 (dashboard 또는 srs 페이지로 리디렉션)
    try {
      await page.waitForURL(/\/(dashboard|srs)/, { timeout: 15000 });
      console.log('✅ 로그인 성공! (URL 확인됨)');
    } catch (e) {
      console.log(`⚠️ 로그인 리디렉션 대기 시간 초과. 현재 URL: ${page.url()}`);
      // 타임아웃되더라도 쿠키가 설정되었을 수 있으므로 진행 시도
    }

    // 주요 페이지 워밍업 (Next.js 사전 컴파일)
    //
    // ⚠️ networkidle 금지
    // 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
    // RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
    // 계속 열어 둔다. 따라서 networkidle 은 성립하지 않는다.
    // 여기서는 try/catch 가 실패를 삼켰기 때문에 조용히 4 × 30초 = 120초를
    // 매 실행마다 태우고 있었다(로그에 '워밍업 실패 (무시)' 가 항상 찍힌다).
    // 워밍업 목적은 Next.js 컴파일 유발이므로 요청이 도달하면 충분하다.
    console.log('🔥 페이지 워밍업 중...');
    const warmupPages = ['/dashboard', '/srs', '/clients', '/users'];
    for (const pagePath of warmupPages) {
      try {
        await page.goto(`${baseURL}${pagePath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        // allow-fixed-wait -- 워밍업의 목적은 Next.js 사전 컴파일 유발이지 화면 확인이 아니다.
        // 기다릴 응답도 단정할 요소도 없고, 컴파일이 끝났음을 알려 주는 신호도 없다.
        await page.waitForTimeout(1000);
        console.log(`  ✓ ${pagePath}`);
      } catch (err) {
        console.log(`  ⚠ ${pagePath} 워밍업 실패 (무시)`);
      }
    }
    console.log('✅ 페이지 워밍업 완료');

    // 인증 상태를 파일로 저장
    const authFile = path.join(__dirname, '../playwright/.auth/user.json');
    await context.storageState({ path: authFile });

    console.log('✅ 인증 상태 저장 완료:', authFile);
  } catch (error) {
    console.error('❌ Global Setup 실패:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
