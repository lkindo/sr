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

### 기본 테스트 (01-16)
- `01-basic.spec.ts` - 기본 페이지 로딩 테스트
- `02-auth.spec.ts` - 인증 기능 테스트
- `03-sr-list.spec.ts` - SR 목록 테스트
- `04-sr-create.spec.ts` - SR 생성 테스트
- `05-sr-detail.spec.ts` - SR 상세 조회 테스트
- `06-sr-update.spec.ts` - SR 수정 테스트
- `07-sr-filter-search.spec.ts` - SR 필터링 및 검색 테스트
- `08-user-management.spec.ts` - 사용자 관리 테스트
- `09-client-management.spec.ts` - 고객사 관리 테스트
- `10-sr-workflow-integrated.spec.ts` - **SR 워크플로우 통합 테스트** (접수 + 상태 변경 + 댓글)
- `12-role-management.spec.ts` - 역할 관리 테스트
- `14-dashboard-overview.spec.ts` - 대시보드 개요 테스트
- `15-pagination-sorting.spec.ts` - 페이지네이션 및 정렬 테스트
- `16-user-profile-management.spec.ts` - 사용자 프로필 관리 테스트

### 권한 테스트

- `sr-permissions.spec.ts` - **역할별 권한 검증 테스트**

### 🆕 고도화 테스트 (17-23)

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

#### 20. 알림 시스템 통합 (`20-notification-system.spec.ts`)
실시간 알림 기능의 전체 플로우 테스트:
- SR 생성 시 담당자에게 알림 발송
- 댓글 작성 시 관련자에게 알림
- 상태 변경 시 알림
- 알림 목록 확인
- 알림 읽음 처리
- 알림 배지/카운트 확인
- 알림 필터링 및 정렬

**실행:**
```bash
pnpm test:e2e e2e/20-notification-system.spec.ts
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

고도화 테스트(17-20)는 다중 사용자 시나리오를 테스트하기 위해 세 가지 역할의 인증 상태를 사용합니다:

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

1. **serial 모드 사용**: 다중 사용자 워크플로우는 순차 실행이 필요합니다.
```typescript
test.describe.configure({ mode: 'serial' });
```

2. **컨텍스트 정리**: 테스트 후 반드시 브라우저 컨텍스트를 닫습니다.
```typescript
try {
  // 테스트 로직
} finally {
  await context.close();
}
```

3. **명시적 대기**: `waitForLoadState`, `waitForTimeout` 사용
```typescript
await page.goto('/srs', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
```

4. **에러 처리**: UI 요소가 없을 수 있는 경우 안전하게 처리
```typescript
if (await button.isVisible({ timeout: 3000 }).catch(() => false)) {
  await button.click();
} else {
  console.log('⚠️ 버튼을 찾을 수 없습니다.');
}
```

5. **로깅**: 테스트 진행 상황을 콘솔에 출력
```typescript
console.log(`✅ SR 생성 완료: ${srId}`);
```

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
