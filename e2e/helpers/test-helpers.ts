import { Page, Locator, Response, expect } from '@playwright/test';

/**
 * E2E 테스트 헬퍼 함수
 * 
 * 재사용 가능한 테스트 유틸리티를 제공하여 안정적이고 유지보수하기 쉬운 테스트 작성을 지원합니다.
 */

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
        await page.reload({ waitUntil: 'networkidle' });
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

    return page.waitForResponse(
        resp => {
            const urlMatches = typeof urlPattern === 'string'
                ? resp.url().includes(urlPattern)
                : urlPattern.test(resp.url());

            return urlMatches && resp.request().method() === method;
        },
        { timeout }
    ).then(async response => {
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

        console.log(`✅ API response received: ${method} ${response.url().split('?')[0]} (${response.status()})`);
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

    const listResponsePromise = page.waitForResponse(resp => resp.url().includes('/api/srs') && resp.request().method() === 'GET', { timeout: 10000 }).catch(() => null);
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

    const response = await createPromise;

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
    const navigatePromise = page.goto(url, { waitUntil: 'networkidle' });

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
import { Browser, BrowserContext } from '@playwright/test';

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
export async function createAuthContext(
    browser: Browser,
    role: AuthRole
): Promise<BrowserContext> {
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
    let srId: string;

    // Step 1: CLIENT로 SR 생성
    srId = await withAuthContext(browser, 'client', async (page) => {
        return await createTestSR(page, data);
    });

    console.log(`📋 SR 생성 완료: ${srId}`);

    // Step 2: MANAGER로 접수 처리
    await withAuthContext(browser, 'manager', async (page) => {
        await page.goto(`/srs/${srId}/intake`, { waitUntil: 'networkidle', timeout: 30000 });

        // 담당자 선택
        const assigneeSelect = page.locator('[role="combobox"]').filter({ hasText: /담당자|Assignee/i }).first();
        if (await assigneeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
            await assigneeSelect.click();
            await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 5000 });
            await page.getByRole('option').first().click();
        }

        // 저장
        await page.getByRole('button', { name: /저장/i }).click();
        await page.waitForTimeout(2000);
    });

    console.log(`✅ SR 접수 완료: ${srId} (상태: INTAKE)`);
    return srId;
}

/**
 * SR 상태 변경 헬퍼
 * 
 * @param page - Playwright Page 객체
 * @param srId - SR ID
 * @param action - 상태 변경 액션 (start, complete, hold, resume, reject, confirm, reopen)
 * @param options - 추가 옵션 (reason, resolutionDescription)
 */
export async function changeSRStatus(
    page: Page,
    srId: string,
    action: 'start' | 'complete' | 'hold' | 'resume' | 'reject' | 'confirm' | 'reopen',
    options?: { reason?: string; resolutionDescription?: string }
): Promise<void> {
    await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

    const actionButtons: Record<string, RegExp> = {
        start: /진행 시작|Start/i,
        complete: /완료 처리|Complete/i,
        hold: /보류|Hold/i,
        resume: /진행 재개|Resume/i,
        reject: /거절|Reject/i,
        confirm: /확인 완료|Confirm/i,
        reopen: /재오픈|Reopen/i,
    };

    const button = page.getByRole('button', { name: actionButtons[action] });

    if (await button.isVisible({ timeout: 5000 }).catch(() => false)) {
        await button.click();

        // 다이얼로그가 나타나면 입력 처리
        const dialog = page.locator('[role="dialog"]').first();
        if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
            if (options?.reason) {
                const reasonInput = dialog.locator('textarea').first();
                await reasonInput.fill(options.reason);
            }
            if (options?.resolutionDescription) {
                const descInput = dialog.locator('textarea').first();
                await descInput.fill(options.resolutionDescription);
            }

            // 확인 버튼 클릭
            const confirmButton = dialog.getByRole('button', { name: /확인|저장|완료|Submit/i });
            await confirmButton.click();
        }

        await page.waitForTimeout(2000);
        console.log(`✅ SR 상태 변경: ${action}`);
    } else {
        console.log(`⚠️ ${action} 버튼을 찾을 수 없습니다`);
    }
}

