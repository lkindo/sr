const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('🔐 로그인 테스트 시작...');

    // 로그인 페이지로 이동
    await page.goto('http://localhost:3000/login');
    console.log('✓ 로그인 페이지 접근');

    // 폼 입력
    await page.fill('#email', 'admin@example.com');
    await page.fill('#password', 'admin123');
    console.log('✓ 폼 입력 완료');

    // 스크린샷 찍기
    await page.screenshot({ path: 'login-before.png' });

    // 로그인 버튼 클릭
    await page.click('button[type="submit"]');
    console.log('✓ 로그인 버튼 클릭');

    // 응답 대기
    await page.waitForTimeout(3000);

    // 현재 URL 확인
    const currentURL = page.url();
    console.log('현재 URL:', currentURL);

    // 스크린샷 찍기
    await page.screenshot({ path: 'login-after.png' });

    if (currentURL.includes('/dashboard') || currentURL.includes('/srs')) {
      console.log('✅ 로그인 성공!');
    } else if (currentURL.includes('/error')) {
      console.log('❌ 로그인 실패 - 에러 페이지로 리디렉션');

      // 에러 메시지 확인
      const bodyText = await page.textContent('body');
      console.log('페이지 내용:', bodyText.substring(0, 500));
    } else {
      console.log('⚠️ 알 수 없는 상태:', currentURL);
    }

  } catch (error) {
    console.error('❌ 테스트 실패:', error.message);
  } finally {
    await browser.close();
  }
})();
