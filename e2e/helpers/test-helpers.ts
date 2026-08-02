import AxeBuilder from '@axe-core/playwright';
import {
  APIRequestContext,
  APIResponse,
  Browser,
  BrowserContext,
  expect,
  Locator,
  Page,
  Response,
} from '@playwright/test';

/**
 * E2E 테스트 헬퍼 함수
 *
 * 재사용 가능한 테스트 유틸리티를 제공하여 안정적이고 유지보수하기 쉬운 테스트 작성을 지원합니다.
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건이 영원히
 * 성립하지 않으므로 waitForLoadState('networkidle') / waitUntil: 'networkidle' 은
 * 항상 타임아웃난다(비인증 페이지에서만 우연히 통과한다).
 * 대기는 항상 (1) load / domcontentloaded 같은 확정 가능한 로드 상태나
 * (2) 실제로 필요한 응답·요소(expect().toBeVisible() 는 자동 재시도)로 표현한다.
 */

/**
 * 페이지의 접근성을 검사합니다.
 * @param page - Playwright Page 객체
 * @param name - 테스트 단계 이름 (로그용)
 */
export async function checkA11y(page: Page, name: string, readySelector?: string): Promise<void> {
  console.log(`♿ Accessibility Check: ${name}`);
  // 'load' 를 쓴다: networkidle 은 SSE 때문에 절대 발생하지 않아 인증된 페이지에서
  // 무조건 30초 타임아웃이었다. 'load' 는 async 청크 실행까지 포함하므로
  // axe 가 빈 DOM 을 검사해 위반 0건으로 통과하는 일도 막는다.
  await page.waitForLoadState('load');

  // 클라이언트 사이드 내비게이션에서는 'load' 가 즉시 resolve 되어 로딩 스켈레톤을 검사하게
  // 된다. 그러면 실제 콘텐츠의 h1·랜드마크가 아직 없어 "h1 부재" 같은 가짜 위반이 나오고,
  // 반대로 진짜 위반은 놓친다. 호출부가 "이게 보이면 콘텐츠가 렌더된 것"을 알려 줄 수 있다.
  if (readySelector) {
    await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 15000 });
  }

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

  if (accessibilityScanResults.violations.length > 0) {
    console.log(
      `❌ Accessibility violations found in ${name}:`,
      JSON.stringify(accessibilityScanResults.violations, null, 2)
    );
  }

  expect(accessibilityScanResults.violations).toEqual([]);
}

/**
 * 페이지 로드 성능을 측정하고 검증합니다.
 * @param page - Playwright Page 객체
 * @param thresholdMs - 허용되는 최대 로딩 시간 (ms), 기본 3000ms
 */
export async function checkPerformance(page: Page, thresholdMs: number = 3000): Promise<void> {
  const duration = await page.evaluate(() => {
    const entries = performance.getEntriesByType('navigation');
    if (entries.length > 0) {
      return (entries[0] as PerformanceNavigationTiming).duration;
    }
    return 0;
  });

  console.log(
    `⏱️ Performance Check: ${page.url()} loaded in ${duration.toFixed(2)}ms (Threshold: ${thresholdMs}ms)`
  );

  if (duration > thresholdMs) {
    console.warn(`⚠️ Performance threshold exceeded! ${duration.toFixed(2)}ms > ${thresholdMs}ms`);
  }

  expect(duration).toBeLessThan(thresholdMs);
}

/**
 * SR을 목록에서 찾기 (재시도 로직 포함)
 *
 * React Query 캐시 문제로 인해 SR이 즉시 목록에 나타나지 않을 수 있으므로
 * 재시도 로직을 포함하여 안정성을 높입니다.
 *
 * @param page - Playwright Page 객체
 * @param title - 찾을 SR의 제목
 * @param options - 옵션 (maxRetries, timeout)
 * @returns SR 행의 Locator
 */
export async function findSRInList(
  page: Page,
  title: string,
  options: { maxRetries?: number; timeout?: number } = {}
): Promise<Locator> {
  const { maxRetries = 3, timeout = 3000 } = options;

  for (let i = 0; i < maxRetries; i++) {
    const srRow = page.locator('tr', { hasText: title }).first();
    const isVisible = await srRow.isVisible({ timeout }).catch(() => false);

    if (isVisible) {
      console.log(`✅ SR found: "${title}"`);
      return srRow;
    }

    console.log(`⚠️  Retry ${i + 1}/${maxRetries}: SR not found, reloading page...`);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
  }

  throw new Error(`❌ SR "${title}" not found after ${maxRetries} retries`);
}

/**
 * API 응답 대기 (타입 안전)
 *
 * 특정 API 호출이 완료될 때까지 대기합니다.
 * 단순한 타임아웃 대신 명확한 대기 조건을 사용하여 안정성을 높입니다.
 *
 * @param page - Playwright Page 객체
 * @param urlPattern - URL 패턴 (문자열 또는 정규식)
 * @param method - HTTP 메서드
 * @param options - 옵션 (timeout, expectStatus)
 * @returns API Response 객체
 */
export function waitForAPIResponse(
  page: Page,
  urlPattern: string | RegExp,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  options: { timeout?: number; expectStatus?: number } = {}
): Promise<Response> {
  const { timeout = 10000, expectStatus = 200 } = options;
  console.log(`Waiting for API response: ${method} ${urlPattern}`);

  if (!urlPattern) {
    throw new Error('urlPattern is required for waitForAPIResponse');
  }

  return page
    .waitForResponse(
      (resp) => {
        const urlMatches =
          typeof urlPattern === 'string'
            ? resp.url().includes(urlPattern)
            : urlPattern.test(resp.url());

        return urlMatches && resp.request().method() === method;
      },
      { timeout }
    )
    .then(async (response) => {
      if (response.status() !== expectStatus) {
        const responseBody = await response.text().catch(() => '(unable to read response body)');
        throw new Error(
          `API response status mismatch:\n` +
            `  Expected: ${expectStatus}\n` +
            `  Got: ${response.status()}\n` +
            `  URL: ${response.url()}\n` +
            `  Response: ${responseBody.substring(0, 200)}`
        );
      }

      console.log(
        `✅ API response received: ${method} ${response.url().split('?')[0]} (${response.status()})`
      );
      return response;
    });
}

/**
 * 테스트용 SR 생성 (재사용 가능)
 *
 * 여러 테스트에서 SR 생성 로직을 재사용할 수 있도록 헬퍼 함수로 제공합니다.
 * API 응답을 기다려 SR ID를 확실하게 반환합니다.
 *
 * @param page - Playwright Page 객체
 * @param data - SR 데이터 (title, description)
 * @returns 생성된 SR의 ID
 */
export async function createTestSR(
  page: Page,
  data: { title: string; description: string }
): Promise<string> {
  console.log('Creating test SR...');

  const listResponsePromise = page
    .waitForResponse(
      (resp) => resp.url().includes('/api/srs') && resp.request().method() === 'GET',
      { timeout: 10000 }
    )
    .catch(() => null);
  await page.goto('/srs');
  await listResponsePromise;
  console.log('Navigated to /srs');

  const createButton = page.getByRole('button', { name: /등록|새 SR|Create/i }).first();
  await createButton.click();
  console.log('Clicked Create button');
  await page.waitForTimeout(1000); // 다이얼로그 애니메이션 대기

  await page.getByRole('textbox', { name: '제목 *' }).fill(data.title);
  await page.getByRole('textbox', { name: '설명 *' }).fill(data.description);
  console.log('Filled title and description');

  // 고객사 선택
  const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
  const isClientEnabled = await clientCombobox.isEnabled().catch(() => false);
  if (isClientEnabled) {
    await clientCombobox.click();
    await page.waitForTimeout(500);
    await page.getByRole('option').first().click();
    console.log('Selected client');
  }

  // 서비스 카테고리 선택
  const categoryCombobox = page.getByRole('combobox', { name: '서비스 카테고리 *' });
  await categoryCombobox.click();
  await page.waitForTimeout(500);
  await page.getByRole('option').first().click();
  await page.waitForTimeout(300);
  console.log('Selected category');

  // SR 생성 API 응답 대기 (Server Action 사용 시 /srs로 요청됨)
  console.log('Waiting for POST /srs...');
  const createPromise = waitForAPIResponse(page, '/srs', 'POST', { timeout: 30000 });

  const saveButton = page.getByRole('button', { name: /저장|생성|Create/i });
  await expect(saveButton).toBeEnabled(); // 버튼 활성화 확인
  await saveButton.click();
  console.log('Clicked Save button');

  // waitForAPIResponse 가 상태 코드를 검증하므로 응답 객체 자체는 사용하지 않는다.
  await createPromise;

  // Server Action 응답은 HTML일 수 있으므로 JSON 파싱 생략
  // ID 추출: 리디렉션된 URL 또는 목록에서 찾기

  let srId: string | undefined;

  // 1. 상세 페이지로 리디렉션된 경우
  const currentUrl = page.url();
  if (currentUrl.match(/\/srs\/[^/]+$/)) {
    srId = currentUrl.split('/').pop();
  }
  // 2. 목록 페이지에 있는 경우 (제목으로 찾기)
  else {
    try {
      // findSRInList를 사용하여 재시도 및 새로고침 지원
      const srRow = await findSRInList(page, data.title, { maxRetries: 3, timeout: 3000 });
      const srLink = srRow.locator('a').first();
      const href = await srLink.getAttribute('href');
      srId = href?.split('/').pop();
    } catch (e) {
      console.log('Failed to find SR in list:', e);
    }
  }

  if (!srId) {
    throw new Error('Failed to extract SR ID after creation');
  }

  console.log(`✅ SR created: ${srId} - "${data.title}"`);
  return srId;
}

/**
 * API를 통해 테스트 SR을 생성합니다 (UI를 거치지 않아 빠름)
 * @param request - Playwright APIRequestContext 객체
 * @param data - SR 데이터
 * @returns 생성된 SR 정보
 */
export async function createSRViaAPI(
  request: APIRequestContext,
  data: {
    title: string;
    description: string;
    clientId: string;
    serviceCategoryId: string;
    requestedPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  }
) {
  console.log(`🚀 Creating SR via API: "${data.title}"`);
  const response = await request.post('/api/srs', {
    data,
  });

  if (response.status() !== 201) {
    const errorBody = await response.text();
    throw new Error(
      `Failed to create SR via API. Status: ${response.status()}, Body: ${errorBody}`
    );
  }

  const result = await response.json();
  console.log(`✅ SR created via API: ${result.id}`);
  return result;
}

/**
 * API를 통해 SR을 삭제합니다.
 * @param request - Playwright APIRequestContext
 * @param srId - 삭제할 SR ID
 */
export async function deleteSRViaAPI(request: APIRequestContext, srId: string): Promise<void> {
  const response = await request.delete(`/api/srs/${srId}`);

  if (response.status() !== 200) {
    const errorBody = await response.text();
    console.error(
      `❌ Failed to delete SR ${srId} via API. Status: ${response.status()}, Body: ${errorBody}`
    );
  } else {
    console.log(`🗑️ SR ${srId} deleted via API`);
  }
}

/**
 * Rate Limit(429) 를 만나면 윈도우가 끝날 때까지 기다렸다가 재시도하는 API 요청 헬퍼.
 *
 * 보안 단정(assertion)을 지키기 위한 장치다. 민감 라우트는 STRICT 프리셋(1분당 5회,
 * src/lib/rate-limiter.ts 의 RateLimitPresets.STRICT)을 쓰고 그 버킷은 IP 단위로
 * 모든 STRICT 라우트가 공유한다. 429 를 그대로 통과시키면 "인가 거부(400/403)"와
 * "요청 과다(429)"를 구분할 수 없어, 보안 통제가 사라져도 테스트가 초록으로 남는다.
 *
 * X-RateLimit-Reset 헤더는 남은 윈도우 시간(ms)이다 (rate-limiter.ts 의 resetTime).
 *
 * @param request - Playwright APIRequestContext
 * @param method - HTTP 메서드
 * @param url - 요청 URL
 * @param options - 요청 바디(data) 및 최대 시도 횟수(maxAttempts, 기본 3)
 * @returns 429 가 아닌 최종 응답
 */
export async function apiRequestWithRateLimitRetry(
  request: APIRequestContext,
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  options: { data?: unknown; maxAttempts?: number } = {}
): Promise<APIResponse> {
  const { data, maxAttempts = 3 } = options;
  const send = () => request[method](url, data === undefined ? undefined : { data });

  let response = await send();

  for (let attempt = 1; attempt < maxAttempts && response.status() === 429; attempt++) {
    const resetMs = Number(response.headers()['x-ratelimit-reset']);
    const waitMs = Math.min(
      Math.max(Number.isFinite(resetMs) ? resetMs : 60_000, 1000) + 1000,
      65_000
    );
    console.log(
      `⏳ 429 수신 (${method.toUpperCase()} ${url}) - ${waitMs}ms 대기 후 재시도 ${attempt}/${maxAttempts - 1}`
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await send();
  }

  // 429 로 끝났다면 검증 자체가 성립하지 않으므로 침묵하지 않고 실패시킨다.
  expect(
    response.status(),
    `${method.toUpperCase()} ${url} 가 rate limit(429)에 막혀 권한 검증을 수행할 수 없었습니다. ` +
      `RATE_LIMIT_STRICT_MAX_REQUESTS 를 올리거나 테스트를 분리하세요.`
  ).not.toBe(429);

  return response;
}

/**
 * 폼 제출 후 API 응답 대기
 *
 * 폼을 제출하고 관련 API 호출이 완료될 때까지 대기합니다.
 *
 * @param page - Playwright Page 객체
 * @param submitButton - 제출 버튼 Locator
 * @param apiUrl - 대기할 API URL 패턴
 * @param method - HTTP 메서드
 */
export async function submitFormAndWait(
  page: Page,
  submitButton: Locator,
  apiUrl: string | RegExp,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' = 'POST'
): Promise<Response> {
  const responsePromise = waitForAPIResponse(page, apiUrl, method);
  await submitButton.click();
  return await responsePromise;
}

/**
 * 페이지 이동 후 데이터 로드 대기
 *
 * 페이지로 이동하고 관련 API 호출이 완료될 때까지 대기합니다.
 * React Query가 데이터를 fetch할 시간을 확보합니다.
 *
 * @param page - Playwright Page 객체
 * @param url - 이동할 URL
 * @param apiPattern - 대기할 API URL 패턴 (선택사항)
 */
export async function gotoAndWaitForData(
  page: Page,
  url: string,
  apiPattern?: string | RegExp
): Promise<void> {
  const navigatePromise = page.goto(url, { waitUntil: 'domcontentloaded' });

  if (apiPattern) {
    const apiPromise = waitForAPIResponse(page, apiPattern, 'GET', { timeout: 15000 });
    await Promise.all([navigatePromise, apiPromise]);
  } else {
    await navigatePromise;
  }

  // React 컴포넌트 렌더링 완료 대기
  await page.waitForTimeout(500);
}

// ============================================================================
// 인증 컨텍스트 헬퍼
// ============================================================================

import path from 'path';

/**
 * 인증 파일 경로
 */
export const AUTH_FILES = {
  admin: path.join(process.cwd(), 'playwright/.auth/user.json'),
  manager: path.join(process.cwd(), 'playwright/.auth/manager.json'),
  engineer: path.join(process.cwd(), 'playwright/.auth/engineer.json'),
  client: path.join(process.cwd(), 'playwright/.auth/client.json'),
} as const;

export type AuthRole = keyof typeof AUTH_FILES;

/**
 * 인증된 브라우저 컨텍스트 생성
 *
 * @param browser - Playwright Browser 객체
 * @param role - 사용자 역할 (admin, manager, engineer, client)
 * @returns 인증된 BrowserContext
 */
export async function createAuthContext(browser: Browser, role: AuthRole): Promise<BrowserContext> {
  const storageState = AUTH_FILES[role];
  console.log(`🔑 Creating ${role} context from ${storageState}`);
  return browser.newContext({ storageState });
}

/**
 * 컨텍스트로 작업 후 자동 정리
 *
 * @param browser - Playwright Browser 객체
 * @param role - 사용자 역할
 * @param action - 실행할 비동기 함수
 */
export async function withAuthContext<T>(
  browser: Browser,
  role: AuthRole,
  action: (page: Page) => Promise<T>
): Promise<T> {
  const context = await createAuthContext(browser, role);
  const page = await context.newPage();

  try {
    return await action(page);
  } finally {
    await context.close();
  }
}

// ============================================================================
// SR 워크플로우 헬퍼
// ============================================================================

/**
 * SR 생성 및 접수 통합 헬퍼
 *
 * CLIENT로 SR 생성 후 MANAGER로 접수 처리까지 수행합니다.
 *
 * @param browser - Playwright Browser 객체
 * @param data - SR 데이터
 * @returns 생성된 SR ID
 */
export async function createAndIntakeSR(
  browser: Browser,
  data: { title: string; description: string }
): Promise<string> {
  // Step 1: CLIENT로 SR 생성
  const srId = await withAuthContext(browser, 'client', async (page) => {
    return await createTestSR(page, data);
  });

  console.log(`📋 SR 생성 완료: ${srId}`);

  // Step 2: MANAGER로 접수 처리
  await withAuthContext(browser, 'manager', async (page) => {
    await page.goto(`/srs/${srId}/intake`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 접수 폼이 실제로 렌더링되어야 한다. (권한이 없거나 상태가 맞지 않으면 여기서 실패)
    await expect(
      page.getByRole('heading', { name: 'SR 접수 처리' }),
      `SR ${srId}: MANAGER 로 접수 폼을 열지 못했습니다.`
    ).toBeVisible({ timeout: 15000 });

    // 담당자 선택 (필수 입력이므로 건너뛰면 접수가 성립하지 않는다)
    const assigneeSelect = page.getByRole('combobox', { name: '담당자 *' });
    await expect(assigneeSelect, `SR ${srId}: 담당자 선택 콤보박스를 찾지 못했습니다.`).toBeVisible(
      { timeout: 10000 }
    );
    await assigneeSelect.click();
    await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('option').first().click();

    // 저장 → POST /api/srs/{id}/intake 응답을 반드시 확인한다.
    const intakeResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/srs/${srId}/intake`) && resp.request().method() === 'POST',
      { timeout: 20000 }
    );
    await page.getByRole('button', { name: /저장/i }).click();

    const intakeResponse = await intakeResponsePromise;
    const body = await intakeResponse.text().catch(() => '(본문 없음)');
    expect(
      intakeResponse.ok(),
      `SR ${srId}: 접수 처리가 실패했습니다 (${intakeResponse.status()}). 응답: ${body.substring(0, 200)}`
    ).toBeTruthy();
  });

  console.log(`✅ SR 접수 완료: ${srId} (상태: INTAKE)`);
  return srId;
}

export type SRStatusAction =
  | 'start'
  | 'complete'
  | 'hold'
  | 'resume'
  | 'reject'
  | 'confirm'
  | 'reopen';

/**
 * SR 상세 화면의 액션 트리거 버튼 이름 (src/components/srs/SRStatusActions.tsx 의 aria-label)
 */
const SR_ACTION_TRIGGERS: Record<SRStatusAction, RegExp> = {
  start: /^진행 시작$/,
  complete: /^완료 처리$/,
  hold: /^보류$/,
  resume: /^진행 재개$/,
  reject: /^거절$/,
  confirm: /^확인 완료$/,
  reopen: /^재오픈$/,
};

/**
 * 다이얼로그가 열리는 액션의 제출 버튼 이름
 * (CompleteSRDialog / HoldSRDialog / RejectSRDialog / ReopenSRDialog 의 submit 버튼 라벨)
 * 여기에 없는 액션(start / resume / confirm)은 다이얼로그 없이 즉시 전환된다.
 */
const SR_ACTION_DIALOG_SUBMIT: Partial<Record<SRStatusAction, RegExp>> = {
  complete: /^완료 처리$/,
  hold: /^보류 처리$/,
  reject: /^거절 처리$/,
  reopen: /^재오픈$/,
};

/**
 * SR 상태 변경 헬퍼
 *
 * 계약: 이 함수가 정상 반환하면 상태 전환이 **실제로 서버에 반영된 것**이다.
 * 액션 버튼이 없거나(권한/현재 상태상 불가), 다이얼로그가 뜨지 않거나,
 * PATCH /api/srs/{id}/status 가 200 이 아니면 예외를 던져 테스트를 실패시킨다.
 * (이전 구현은 버튼이 없으면 console.log 만 남기고 성공으로 반환했기 때문에,
 *  전환이 전혀 일어나지 않아도 상태 전환 테스트가 통과했다.)
 *
 * @param page - Playwright Page 객체
 * @param srId - SR ID
 * @param action - 상태 변경 액션 (start, complete, hold, resume, reject, confirm, reopen)
 * @param options - 추가 옵션 (reason, resolutionDescription)
 */
export async function changeSRStatus(
  page: Page,
  srId: string,
  action: SRStatusAction,
  options?: { reason?: string; resolutionDescription?: string }
): Promise<void> {
  await page.goto(`/srs/${srId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const trigger = page.getByRole('button', { name: SR_ACTION_TRIGGERS[action] });

  await expect(
    trigger,
    `SR ${srId}: '${action}' 액션 버튼이 없습니다. ` +
      `현재 상태 또는 로그인 사용자의 권한으로는 이 전환이 불가능합니다.`
  ).toBeVisible({ timeout: 10000 });

  // 상태 변경은 반드시 PATCH /api/srs/{id}/status 를 거친다 (src/hooks/use-sr.ts).
  // 응답을 관찰해야 "버튼만 눌리고 아무 일도 없었다"를 성공으로 오인하지 않는다.
  const statusResponsePromise = page.waitForResponse(
    (resp) => resp.url().includes(`/api/srs/${srId}/status`) && resp.request().method() === 'PATCH',
    { timeout: 20000 }
  );

  await trigger.click();

  const submitPattern = SR_ACTION_DIALOG_SUBMIT[action];
  if (submitPattern) {
    const dialog = page.getByRole('dialog');
    await expect(dialog, `SR ${srId}: '${action}' 다이얼로그가 열리지 않았습니다.`).toBeVisible({
      timeout: 5000,
    });

    const reasonText = options?.resolutionDescription ?? options?.reason;
    if (reasonText) {
      await dialog.locator('textarea').first().fill(reasonText);
    }

    const submitButton = dialog.getByRole('button', { name: submitPattern });
    await expect(
      submitButton,
      `SR ${srId}: '${action}' 다이얼로그의 제출 버튼이 비활성 상태입니다.`
    ).toBeEnabled({ timeout: 5000 });
    await submitButton.click();
  }

  const response = await statusResponsePromise;
  const body = await response.text().catch(() => '(본문 없음)');
  expect(
    response.status(),
    `SR ${srId}: '${action}' 상태 전환이 서버에서 거부되었습니다. 응답: ${body.substring(0, 200)}`
  ).toBe(200);

  console.log(`✅ SR 상태 변경 완료: ${action} (${srId})`);
}

/**
 * 담당자 배정 시 쓸 계정. `auth-helpers.ts` 의 engineer 페르소나와 반드시 같아야 한다.
 * 다르면 그 SR 은 engineer 세션에서 403 이 되어(정책상 ENGINEER 는 자기 배정 SR 만 읽는다)
 * 뒤따르는 단계가 전부 "요소 없음"으로 실패한다.
 */
export const ENGINEER_ASSIGNEE_EMAIL =
  process.env.TEST_ENGINEER_EMAIL || 'engineeruser@example.com';

/**
 * 담당자를 **이메일로** 고른다.
 *
 * 예전에는 `getByRole('option').first()` 로 위치를 골랐는데, 그 목록은
 * `getUsersWithSRHandlingPermission()` 의 findMany 결과이고 순서가 보장되지 않았다.
 * 실제로 첫 옵션은 Admin User 였고, 그래서 ENGINEER 페르소나가 아닌 사람에게 배정된 SR 을
 * engineer 세션이 열다가 403 을 받아 17·19·21 스펙이 줄줄이 실패했다.
 * 앱은 정책대로 동작했고, 잘못된 것은 "첫 번째가 엔지니어일 것"이라는 테스트의 가정이었다.
 */
export async function selectAssignee(page: Page, email: string = ENGINEER_ASSIGNEE_EMAIL) {
  const trigger = page
    .locator('label', { hasText: '담당자' })
    .first()
    .locator('..')
    .locator('[role="combobox"]');
  await trigger.click({ force: true });

  // 옵션 라벨은 `{name} ({email})` 형태다(IntakeFormCard).
  // 정규식 대신 부분 문자열 매칭을 쓴다(getByRole 의 name 은 기본이 부분일치가 아니라
  // 완전일치이므로 exact: false 를 명시한다). 이메일에 정규식 특수문자가 있어도 안전하다.
  const option = page.getByRole('option', { name: email, exact: false });
  await option.waitFor({ state: 'visible', timeout: 15000 });
  await option.click();
}
