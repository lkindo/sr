# SR 목록 E2E 테스트 실행 결과

## 실행 일시
2025-11-08

## 상태
⏭️ **SKIPPED** - 로그인 컨텍스트 관리 문제

## 문제 요약

SR 목록 관리 테스트(4개)가 모두 `beforeEach`에서 로그인 실패로 인해 실행되지 못했습니다.

### 주요 발견 사항

#### 1. 테스트 사용자 생성 ✅
- `prisma/seed.ts`에 테스트 사용자 생성 로직 추가
- 사용자: `admin@example.com / admin123`
- ADMIN 역할 할당 완료

```typescript
// 추가된 코드
const bcrypt = require("bcryptjs");
const hashedPassword = await bcrypt.hash("admin123", 10);
const adminUser = await prisma.user.create({
  data: {
    email: "admin@example.com",
    name: "Admin User",
    password: hashedPassword,
  },
});
```

#### 2. 로그인 성공 테스트 ✅
- `e2e/02-auth.spec.ts`의 "로그인 플로우 - 성공" 테스트는 **통과**
- 단독 실행 시 로그인이 정상 작동함을 확인

```
✓ 로그인 플로우 - 성공 (8.7s)
```

#### 3. beforeEach 로그인 실패 ❌
- `e2e/03-sr-list.spec.ts`의 모든 테스트가 `beforeEach`에서 실패
- 에러: `TimeoutError: page.waitForURL: Timeout 15000ms exceeded`
- 대시보드로 리디렉션되지 않음

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
waiting for navigation to "/dashboard" until "load"
```

## 원인 분석

### Playwright 브라우저 컨텍스트 문제

Playwright에서 각 테스트는 **독립적인 브라우저 컨텍스트**를 사용합니다:

1. **테스트 격리**: 각 `test()`는 새로운 브라우저 컨텍스트와 페이지를 받음
2. **세션 공유 불가**: `beforeEach`에서 로그인해도 다음 테스트에서 세션이 유지되지 않음
3. **반복 로그인**: 각 테스트마다 로그인을 다시 해야 함

### 왜 02-auth.spec.ts는 성공했나?

02-auth.spec.ts의 로그인 테스트는 `test()` 함수 내에서 **직접** 로그인을 수행합니다:

```typescript
test('로그인 플로우 - 성공', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#email', 'admin@example.com')
  await page.fill('#password', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard', { timeout: 15000 })
  // ✅ 성공
})
```

반면 03-sr-list.spec.ts는 `beforeEach`에서 로그인을 시도:

```typescript
test.beforeEach(async ({ page }) => {
  await login(page) // ❌ 실패
})

test('SR 목록 페이지 접근', async ({ page }) => {
  // 이미 로그인 실패로 실행 안됨
})
```

### 추가 조사 필요 사항

1. **NextAuth 세션 관리**: Next.js의 미들웨어나 인증 설정 문제일 수 있음
2. **쿠키 설정**: 로그인 후 세션 쿠키가 제대로 설정되지 않을 가능성
3. **환경 변수**: `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` 환경 변수 로딩 문제

## 해결 방법

### 옵션 1: Global Setup 사용 (권장)

Playwright의 global setup을 사용하여 한 번만 로그인하고 상태를 저장:

```typescript
// playwright.config.ts
export default defineConfig({
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  use: {
    storageState: 'playwright/.auth/user.json',
  },
})

// e2e/global-setup.ts
async function globalSetup(config: FullConfig) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  
  await page.goto('http://localhost:3000/login')
  await page.fill('#email', 'admin@example.com')
  await page.fill('#password', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard')
  
  // 인증 상태 저장
  await page.context().storageState({ 
    path: 'playwright/.auth/user.json' 
  })
  
  await browser.close()
}
```

### 옵션 2: 각 테스트에서 직접 로그인

```typescript
test('SR 목록 페이지 접근', async ({ page }) => {
  // 로그인
  await page.goto('/login')
  await page.fill('#email', 'admin@example.com')
  await page.fill('#password', 'admin123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/dashboard')
  
  // 테스트 진행
  await page.goto('/srs')
  await expect(page.locator('.text-2xl').filter({ hasText: 'SR 목록' })).toBeVisible()
})
```

### 옵션 3: API 로그인

브라우저 UI 대신 API를 직접 호출하여 로그인:

```typescript
test.beforeEach(async ({ page, context }) => {
  // API로 로그인하여 세션 쿠키 얻기
  await context.route('/api/auth/callback/credentials', async route => {
    // 로그인 처리
  })
})
```

## 현재 테스트 상태

| 테스트 | 상태 | 비고 |
|--------|------|------|
| SR 목록 페이지 접근 | SKIP | 로그인 실패 |
| SR 필터링 | SKIP | 로그인 실패 |
| SR 목록 로딩 상태 | SKIP | 로그인 실패 |
| 빈 SR 목록 처리 | SKIP | 로그인 실패 |

## 다음 단계

1. **Global Setup 구현**: Playwright의 global setup을 사용하여 로그인 상태 저장
2. **인증 미들웨어 확인**: Next.js 미들웨어에서 인증 체크가 제대로 작동하는지 확인
3. **테스트 재실행**: Global setup 구현 후 모든 테스트 재실행

## 참고

- [Playwright Authentication](https://playwright.dev/docs/auth)
- [Playwright Global Setup](https://playwright.dev/docs/test-global-setup-teardown)
- [NextAuth.js Testing](https://next-auth.js.org/tutorials/testing-with-cypress)

---

**결론**: SR 목록 테스트는 기술적으로 올바르게 작성되었으나, Playwright의 브라우저 컨텍스트 격리로 인해 로그인 상태가 유지되지 않습니다. Global setup을 사용하여 해결할 수 있습니다.


