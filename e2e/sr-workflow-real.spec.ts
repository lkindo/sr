import { test, expect } from '@playwright/test';
import * as fs from 'fs';

// Use the authentication state saved by global-setup
test.use({ storageState: './playwright/.auth/user.json' });

test.describe.configure({ mode: 'serial' });

test.describe('SR 전체 워크플로우', () => {
    // 실패 시 스크린샷 자동 저장
    test.afterEach(async ({ page }, testInfo) => {
        if (testInfo.status !== testInfo.expectedStatus) {
            const screenshotPath = `e2e-failure-${testInfo.title.replace(/\s+/g, '_')}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });
            testInfo.attachments.push({
                name: 'failure-screenshot',
                path: screenshotPath,
                contentType: 'image/png',
            });
        }
    });

    test('SR 생성부터 상세 페이지까지', async ({ page }) => {
        fs.writeFileSync('e2e_progress.txt', 'START\n');
        const log = (msg: string) => {
            console.log(msg);
            fs.appendFileSync('e2e_progress.txt', msg + '\n');
        };

        log('STEP 1: SR 목록 페이지 이동');
        await page.goto('/srs', { waitUntil: 'networkidle', timeout: 60000 });
        await expect(page).toHaveURL(/\/srs/);

        log('STEP 2: 새 SR 버튼 찾기');
        const newSrButton = page
            .locator('button')
            .filter({ hasText: /등록|새 SR|Create|Add/i })
            .first();
        await expect(newSrButton).toBeVisible({ timeout: 5000 });
        await newSrButton.click();

        log('STEP 3: 다이얼로그 확인');
        await expect(
            page.getByRole('heading', { name: /새 SR 요청|Create SR/i })
        ).toBeVisible({ timeout: 5000 });

        log('STEP 4: 폼 필드 존재 확인');
        await expect(page.getByRole('textbox', { name: '제목' })).toBeVisible();

        const timestamp = Date.now();
        const srTitle = `E2E Test SR ${timestamp}`;

        log('STEP 5: 폼 입력');
        await page.getByRole('textbox', { name: '제목' }).fill(srTitle);
        await page.getByRole('textbox', { name: '설명' }).fill('자동화 테스트로 만든 SR');

        log('STEP 6: 고객사 선택');
        await page.getByRole('combobox', { name: '고객사' }).click();
        await page.waitForSelector('[role="option"]', { state: 'visible', timeout: 5000 });
        await page.getByRole('option').first().click({ force: true });

        log('STEP 7: 서비스 카테고리 선택');
        await page.getByRole('combobox', { name: '서비스 카테고리' }).click();
        await page.waitForSelector('[role="option"]', { state: 'visible', timeout: 5000 });
        await page.getByRole('option').first().click({ force: true });

        log('STEP 8: 제출');
        await page.getByRole('button', { name: /SR 요청하기|생성|Create/i }).click();
        await page.waitForTimeout(2000);

        log('STEP 9: 목록 새로고침 및 SR 확인');
        await page.goto('/srs');
        await page.waitForLoadState('networkidle');
        const srLink = page.locator(`text="${srTitle}"`);
        await expect(srLink).toBeVisible({ timeout: 10000 });

        log('STEP 10: 상세 페이지 이동');
        await srLink.click();
        await expect(page).toHaveURL(/\/srs\/[a-zA-Z0-9-]+/);
        await expect(
            page.locator('h1, h2').filter({ hasText: srTitle })
        ).toBeVisible({ timeout: 5000 });

        log('DONE');
    });
});
