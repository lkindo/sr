# E2E 테스트 가이드

이 디렉토리에는 SR 관리 시스템의 E2E (End-to-End) 테스트가 포함되어 있습니다.

## 📋 목차

- [테스트 구조](#테스트-구조)
- [테스트 실행](#테스트-실행)
- [새로 추가된 고도화 테스트](#새로-추가된-고도화-테스트)
- [다중 사용자 테스트](#다중-사용자-테스트)
- [환경 변수 설정](#환경-변수-설정)
- [문제 해결](#문제-해결)

## 테스트 구조

### 기본 테스트 (00-15)

- `00-smoke.spec.ts` - **라우트 스모크**. 모든 화면이 콘텐츠(앵커 heading)까지 렌더되는가.
  "페이지가 열리는가" 를 확인하던 21개의 중복 단언을 여기로 모았다.
- `01-basic.spec.ts` - 로그인/회원가입 화면 요소
- `02-auth.spec.ts` - 인증 기능 테스트
- `04-sr-create.spec.ts` - SR 생성 테스트 (SR 등록 **UI 플로우**를 검증하는 유일한 곳)
- `05-sr-detail.spec.ts` - SR 상세 조회 테스트
- `06-sr-update.spec.ts` - SR 수정 테스트
- `07-sr-filter-search.spec.ts` - SR 검색·필터. 필터 적용 후 **목록이 실제로 좁혀지는지**까지 확인
- `08-user-management.spec.ts` - 사용자 관리 테스트
- `09-client-management.spec.ts` - 고객사 관리 테스트
- `10-sr-workflow-integrated.spec.ts` - **SR 워크플로우 통합 테스트** (접수 + 상태 변경 + 댓글)
- `12-role-management.spec.ts` - 역할 관리 테스트
- `14-dashboard-overview.spec.ts` - 대시보드. 화면의 숫자가 API 값과 일치하는지 대조
- `15-pagination-sorting.spec.ts` - 정렬·페이지네이션. URL·aria-sort·행 순서를 함께 확인

삭제된 파일과 사유:

- `03-sr-list.spec.ts` — 목록 열림 확인은 `00-smoke`, 필터/빈 상태는 `07` 로 흡수했다.
- `16-user-profile-management.spec.ts` — 5개 테스트 전부 "요소가 없으면 로그만 남기고 통과" 였고,
  검증 내용은 `26-settings-pages.spec.ts` 와 겹쳤다.
- `20-notification-system.spec.ts` — 앱에 `/notifications` 라우트도 알림 벨 UI 도 없다
  (알림은 서버 사이드 outbox/listener 뿐). 12개 테스트가 존재하지 않는 화면을 찾다가
  전부 통과하고 있었다. 회귀는 `notification-outbox.test.ts` 와
  `sr-notification.listener.test.ts` 가 덮는다.

### 권한 테스트

- `sr-permissions.spec.ts` - **역할별 권한 검증 테스트**

### 고도화 테스트 (17-23)

#### 17. 다중 사용자 협업 시나리오 (`17-multi-user-collaboration.spec.ts`)

실제 현업 워크플로우를 시뮬레이션하는 통합 테스트:

- CLIENT → SR 생성
- MANAGER → 접수 처리 및 담당자 배정
- ENGINEER → 진행 중 상태 변경 및 댓글 작성
- CLIENT → 댓글 확인 및 회신
- ENGINEER → 완료 처리
- MANAGER → 검토 및 종료
- CLIENT → 종료된 SR 확인

**실행:**

```bash
pnpm test:e2e e2e/17-multi-user-collaboration.spec.ts
```

#### 18. SR 재배정 및 에스컬레이션 (`18-sr-reassignment-escalation.spec.ts`)

담당자 변경 및 우선순위 상향 조정 워크플로우:

- SR 생성 및 초기 담당자 배정 (Engineer A)
- 담당자 재배정 (Engineer A → Engineer B)
- 우선순위 상향 조정 (LOW → HIGH)
- 긴급 에스컬레이션 (HIGH → CRITICAL)
- 엔지니어의 에스컬레이션된 SR 확인 및 우선 처리

**실행:**

```bash
pnpm test:e2e e2e/18-sr-reassignment-escalation.spec.ts
```

#### 19. 파일 업로드/다운로드 (`19-file-upload-download.spec.ts`)

파일 첨부 기능의 전체 플로우 테스트:

- SR 생성 시 첨부파일 업로드
- SR 상세에서 첨부파일 섹션 확인
- 댓글에 첨부파일 추가
- 첨부파일 다운로드
- 첨부파일 삭제 (권한 확인)
- 대용량 파일 업로드 에러 핸들링
- 허용되지 않은 파일 형식 업로드 차단

**실행:**

```bash
pnpm test:e2e e2e/19-file-upload-download.spec.ts
```

#### 21. SR 상태 전이 (`21-sr-status-transitions.spec.ts`) 🆕

SR 상태 전이 규칙 및 제약 조건 검증:

- INTAKE → IN_PROGRESS (start 액션)
- IN_PROGRESS → ON_HOLD (hold 액션 - 보류 사유 필수)
- ON_HOLD → IN_PROGRESS (resume 액션)
- IN_PROGRESS → COMPLETED (complete 액션 - 해결 내용 필수)
- COMPLETED → CONFIRMED (confirm 액션 - 신청자만 가능)
- REQUESTED → REJECTED (reject 액션 - 거절 사유 필수)
- 잘못된 상태 전이 차단 검증
- 상태 이력(Status History) 생성 확인

**API:** `PATCH /api/srs/[id]/status`

**실행:**

```bash
pnpm test:e2e e2e/21-sr-status-transitions.spec.ts
```

#### 22. SR 접수 프로세스 (`22-sr-intake-process.spec.ts`) 🆕

SR 접수 관련 완전한 워크플로우 테스트:

- SR 접수 처리 (POST) - REQUESTED → INTAKE 전이
- 우선순위, 예상 작업 시간, 담당자 배정
- SLA 기반 마감일 자동 계산
- 접수 정보 조회 (GET)
- 접수 정보 수정 (PATCH) - 우선순위/담당자 변경
- Activity 로그 생성 확인 (STATUS_CHANGED, ASSIGNED, INTAKE_UPDATED)
- 권한 테스트 (CLIENT는 접수 불가)

**API:** `POST/GET/PATCH /api/srs/[id]/intake`

**실행:**

```bash
pnpm test:e2e e2e/22-sr-intake-process.spec.ts
```

#### 23. 역할 상호 배타성 (`23-role-exclusivity.spec.ts`) 🆕

역할 할당 시 비즈니스 규칙 준수 검증:

- 시스템 운영팀(ADMIN/MANAGER/ENGINEER) vs 고객사 팀(CLIENT_ADMIN/CLIENT_USER) 동시 부여 차단
- 시스템 운영팀 역할은 고객사 미할당 사용자에게만
- 고객사 팀 역할은 고객사 할당 사용자에게만
- 역할 변경 시 고객사 할당 정합성 검증
- 에러 메시지 명확성 확인 (error, details, suggestion)

**API:** `POST /api/users/[id]/roles`

**실행:**

```bash
pnpm test:e2e e2e/23-role-exclusivity.spec.ts
```

## 테스트 실행

### 모든 테스트 실행

```bash
pnpm test:e2e
```

### 특정 테스트만 실행

```bash
# 단일 파일
pnpm test:e2e e2e/17-multi-user-collaboration.spec.ts

# 다중 사용자 테스트만 실행
pnpm exec playwright test --project=multi-user
```

### UI 모드로 실행 (디버깅)

```bash
pnpm exec playwright test --ui
```

### 특정 브라우저로 실행

```bash
# Chromium
pnpm exec playwright test --project=chromium

# Multi-user 테스트
pnpm exec playwright test --project=multi-user
```

### 헤드리스 모드 해제 (브라우저 보기)

```bash
pnpm exec playwright test --headed
```

### 리포트 보기

```bash
pnpm exec playwright show-report
```

## 다중 사용자 테스트

고도화 테스트(17-23)는 다중 사용자 시나리오를 테스트하기 위해 세 가지 역할의 인증 상태를 사용합니다:

- **CLIENT** (`clientuser@example.com`)
- **MANAGER** (`admin@example.com`)
- **ENGINEER** (`engineeruser@example.com`)

### 인증 상태 파일

테스트 실행 전, 다음 인증 상태 파일이 자동으로 생성됩니다:

- `playwright/.auth/client.json`
- `playwright/.auth/manager.json`
- `playwright/.auth/engineer.json`

### 수동 인증 상태 생성

```bash
pnpm exec playwright test --project=multi-user-setup
```

## 환경 변수 설정

`.env` 파일에 테스트 사용자 계정 정보를 설정할 수 있습니다:

```env
# 기본 관리자 계정 (단일 사용자 테스트)
TEST_USER_EMAIL=admin@example.com
TEST_USER_PASSWORD=admin123

# 다중 사용자 계정 (고도화 테스트)
TEST_CLIENT_EMAIL=clientuser@example.com
TEST_CLIENT_PASSWORD=client123

TEST_MANAGER_EMAIL=admin@example.com
TEST_MANAGER_PASSWORD=admin123

TEST_ENGINEER_EMAIL=engineeruser@example.com
TEST_ENGINEER_PASSWORD=engineer123

# 개발 서버 URL
BASE_URL=http://localhost:3000

# 개발 서버 자동 시작 스킵 (수동으로 실행하는 경우)
SKIP_WEBSERVER=true
```

## 테스트 파일 구조

### 다중 사용자 테스트 예시

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

const authFiles = {
  client: path.join(__dirname, '../playwright/.auth/client.json'),
  manager: path.join(__dirname, '../playwright/.auth/manager.json'),
  engineer: path.join(__dirname, '../playwright/.auth/engineer.json'),
};

test('CLIENT: SR 생성', async ({ browser }) => {
  const context = await browser.newContext({ storageState: authFiles.client });
  const page = await context.newPage();

  try {
    // 테스트 로직...
  } finally {
    await context.close();
  }
});
```

## 문제 해결

### 1. 인증 상태 파일이 없음

**에러:** `ENOENT: no such file or directory, open 'playwright/.auth/client.json'`

**해결:**

```bash
# 인증 상태 생성
pnpm exec playwright test --project=multi-user-setup
```

### 2. 테스트 사용자 계정이 DB에 없음

**에러:** 로그인 실패 또는 404 에러

**해결:**

1. 데이터베이스 시드 실행:

```bash
pnpm db:seed
```

2. 또는 `.env` 파일의 사용자 정보를 실제 DB 계정과 일치시키기

### 3. 개발 서버가 실행되지 않음

**에러:** `net::ERR_CONNECTION_REFUSED at http://localhost:3000`

**해결:**

```bash
# 개발 서버 수동 실행
pnpm dev

# 또는 .env에 SKIP_WEBSERVER=false 설정
```

### 4. 테스트가 타임아웃됨

**해결:**

- `playwright.config.ts`에서 타임아웃 증가:

```typescript
timeout: 60 * 1000, // 60초
```

### 5. 파일 업로드 테스트 실패

**에러:** 테스트 파일을 찾을 수 없음

**해결:**
테스트 파일은 자동으로 `playwright/.test-files/` 디렉토리에 생성됩니다.
수동 생성이 필요한 경우:

```bash
mkdir -p playwright/.test-files
echo "Test content" > playwright/.test-files/test-document.txt
```

## 테스트 작성 가이드

### Best Practices

이 절은 한동안 정확히 반대를 가르치고 있었다 — `networkidle`, `waitForTimeout`,
그리고 "요소가 없으면 로그만 남기고 통과" 를 모범 사례로 실어 두었다. 그 결과가
관용 분기 96건과 고정 대기 167회다. 게이트(`pnpm check:e2e-assertions`)가 이제
그 셋을 막으므로, 문서도 같은 방향을 가리켜야 한다.

#### 1. 대기는 "관측 가능한 결과" 로 표현한다

`networkidle` 은 **쓰지 않는다.** 로그인 상태의 모든 페이지는 루트 레이아웃
(`src/app/layout.tsx` → `ClientLayout` → `RealtimeProvider` → `use-realtime-status.ts`)에서
`/api/realtime` SSE 스트림을 계속 열어 둔다. "500ms 동안 네트워크 요청 0건" 이라는
조건이 영원히 성립하지 않아 항상 타임아웃난다.

`waitForTimeout` 도 쓰지 않는다. 느린 CI 에서는 모자라고 빠른 로컬에서는 남는다 —
어느 쪽이든 검증이 아니라 도박이다.

```typescript
// ❌ 하지 말 것
await page.goto('/srs', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// ✅ 내비게이션은 domcontentloaded 로 확정하고,
//    실제로 필요한 것은 응답이나 요소로 기다린다 (expect 는 자동 재시도한다)
const listLoaded = page.waitForResponse(
  (r) => r.url().includes('/api/srs') && r.request().method() === 'GET'
);
await page.goto('/srs', { waitUntil: 'domcontentloaded' });
await listLoaded;
await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible();
```

기다릴 이벤트가 **존재하지 않는** 경우에만 고정 대기를 쓰고, 바로 윗줄에 사유를 남긴다.
사유 없는 예외는 게이트가 거부한다.

```typescript
// allow-fixed-wait -- Next.js 사전 컴파일 유발이 목적이라 기다릴 응답이 없다
await page.waitForTimeout(1000);
```

#### 2. 요소가 없을 수 있는 자리에서도 "통과" 로 빠지지 않는다

`isVisible()` 은 **재시도하지 않는다.** 렌더 전에 물어보면 요소가 있어도 `false` 다.
그래서 아래 형태는 화면이 통째로 망가져도 초록불이 된다.

```typescript
// ❌ 하지 말 것 — 이 테스트는 실패할 줄 모른다
if (await button.isVisible({ timeout: 3000 }).catch(() => false)) {
  await button.click();
} else {
  console.log('⚠️ 버튼을 찾을 수 없습니다.');
}
```

셋 중 하나를 고른다.

```typescript
// ✅ 있어야 정상이면 — 없으면 실패하게 둔다
await expect(button).toBeVisible();
await button.click();

// ✅ 없어야 정상이면 — 부재 자체를 단언한다 (화면이 렌더된 뒤에!)
await expect(page.getByRole('heading', { name: '상세 정보' })).toBeVisible();
await expect(page.getByRole('button', { name: '삭제' })).toHaveCount(0);

// ✅ 아직 없는 기능이면 — 통과로 위장하지 말고 미구현이라고 적는다
test.fixme('첨부파일 미리보기', async ({ page }) => {
  /* … */
});
```

#### 3. 준비(arrange)는 API 로, 검증(assert)은 UI 로

SR 생성 다이얼로그와 접수 폼을 **검증하는** 스펙은 각각 하나면 충분하다
(`04-sr-create`, `22-sr-intake-process`). 다른 스펙이 SR 이 필요할 뿐이라면
`e2e/fixtures/` 의 헬퍼로 API 를 통해 만든다 — UI 로 만들면 한 번에 20~40초가 들고,
그 시간은 검증이 아니라 준비에 쓰인다.

#### 4. 단언은 상태를 겨냥한다

`text=/완료|COMPLETED/i` 같은 넓은 텍스트 매칭은 '완료 처리' **버튼** 에도 걸린다.
상태가 바뀌지 않아도 통과하므로 상태 검증으로서 의미가 없다. `data-testid` 나
`getByRole` 로 대상을 특정한다.

#### 5. 컨텍스트는 반드시 정리한다

```typescript
try {
  // 테스트 로직
} finally {
  await context.close();
}
```

생성한 데이터도 마찬가지다. 공유 DB 를 쓰므로 `afterAll` 에서 API 로 지운다.
남의 행(특히 시드 데이터)을 수정·비활성화하지 않는다 — 다른 스펙이 그 값을 계약으로
단언하고 있을 수 있다.

#### 6. serial 은 최후의 수단이다

`test.describe.configure({ mode: 'serial' })` 는 1번이 실패하면 나머지가 skip 되고,
리포트에는 "실패 1건" 으로만 보인다. 실제로는 그 뒤 전부가 미검증이다.
준비를 API 픽스처로 옮기면 대부분의 serial 은 필요 없어진다.

## CI/CD 통합

### GitHub Actions 예시

```yaml
name: E2E Tests

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright
        run: pnpm exec playwright install --with-deps

      - name: Run E2E tests
        run: pnpm test:e2e
        env:
          CI: true
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NEXTAUTH_SECRET: ${{ secrets.NEXTAUTH_SECRET }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## 추가 리소스

- [Playwright 공식 문서](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)

---

**문의:** 테스트 관련 문제가 있으면 프로젝트 이슈 트래커에 등록해주세요.
