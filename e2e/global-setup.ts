import { chromium, FullConfig } from '@playwright/test'
import path from 'path'

async function globalSetup(config: FullConfig) {
  console.log('🔐 Global Setup: 로그인 상태 저장 중...')

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // 개발 서버 URL
    const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000'

    // 로그인 페이지로 이동
    await page.goto(`${baseURL}/login`)

    // 로그인 폼 입력
    await page.fill('#email', process.env.TEST_USER_EMAIL || 'admin@example.com')
    await page.fill('#password', process.env.TEST_USER_PASSWORD || 'admin123')

    // 로그인 버튼 클릭
    await page.click('button[type="submit"]')

    // 로그인 성공 대기 (dashboard 또는 srs 페이지로 리디렉션)
    await page.waitForURL(/\/(dashboard|srs)/, { timeout: 30000 })

    console.log('✅ 로그인 성공!')

    // 주요 페이지 워밍업 (Next.js 사전 컴파일)
    console.log('🔥 페이지 워밍업 중...')
    const warmupPages = ['/dashboard', '/srs', '/clients', '/users']
    for (const pagePath of warmupPages) {
      try {
        await page.goto(`${baseURL}${pagePath}`, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(1000) // 컴파일 완료 대기
        console.log(`  ✓ ${pagePath}`)
      } catch (err) {
        console.log(`  ⚠ ${pagePath} 워밍업 실패 (무시)`)
      }
    }
    console.log('✅ 페이지 워밍업 완료')

    // 인증 상태를 파일로 저장
    const authFile = path.join(__dirname, '../playwright/.auth/user.json')
    await context.storageState({ path: authFile })

    console.log('✅ 인증 상태 저장 완료:', authFile)
  } catch (error) {
    console.error('❌ Global Setup 실패:', error)
    throw error
  } finally {
    await context.close()
    await browser.close()
  }
}

export default globalSetup


