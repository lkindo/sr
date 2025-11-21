import { test, expect } from '@playwright/test';

test.use({ storageState: './playwright/.auth/user.json' });

test.describe.configure({ mode: 'serial' });

test.describe('SR 접수 및 상태 전환', () => {
  test('신규 SR을 접수하고 진행중 상태로 전환', async ({ page }) => {
    const timestamp = Date.now();
    const srTitle = `E2E Intake SR ${timestamp}`;

    const log = (msg: string) => {
      console.log(`[SR-INTAKE] ${msg}`);
    };

    // 1. SR 생성
    log('SR 목록 페이지 이동');
    await page.goto('/srs', { waitUntil: 'networkidle', timeout: 60000 });
    await expect(page).toHaveURL(/\/srs/);

    log('SR 생성 다이얼로그 열기');
    await page.getByRole('button', { name: '등록' }).click();
    await expect(page.getByRole('heading', { name: /새 SR 요청|Create SR/i })).toBeVisible();

    log('SR 생성 폼 입력');
    await page.getByRole('textbox', { name: '제목' }).fill(srTitle);
    await page.getByRole('textbox', { name: '설명' }).fill('E2E 테스트용 SR 접수 플로우');

    log('고객사 / 서비스 카테고리 선택');
    await page.getByRole('combobox', { name: '고객사' }).click();
    await page.getByRole('option', { name: /테스트 고객사 A/i }).click();

    await page.getByRole('combobox', { name: '서비스 카테고리' }).click();
    await page.getByRole('option', { name: /기술 지원/i }).click();

    log('SR 생성 제출');
    await page.getByRole('button', { name: /SR 요청하기|생성|Create/i }).click();
    await page.waitForTimeout(2000);

    // 2. 목록에서 새 SR 찾기
    log('목록 새로고침 후 신규 SR 확인');
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');
    const srRow = page.locator('tr', { hasText: srTitle }).first();
    await expect(srRow).toBeVisible({ timeout: 10000 });

    // 3. 접수 페이지로 이동
    log('접수 페이지 이동');
    await srRow.getByRole('button', { name: '접수' }).click();
    await expect(page).toHaveURL(/\/srs\/[a-zA-Z0-9-]+\/intake/);

    // 4. 접수 폼 입력
    log('접수 폼 - 실제 우선순위 선택');
    const prioritySelect = page.locator('label', { hasText: '실제 우선순위' }).first().locator('..').locator('[role="combobox"]');
    await prioritySelect.click();
    await page.getByRole('option', { name: /높음 \(HIGH\)/ }).click();

    log('접수 폼 - 예상 작업 시간 입력');
    const hoursInput = page.getByLabel('예상 작업 시간 (시간) *');
    await hoursInput.fill('');
    await hoursInput.fill('6');

    log('접수 폼 - 담당자 선택');
    const assigneeSelect = page.locator('label', { hasText: '담당자 *' }).first().locator('..').locator('[role="combobox"]');
    await assigneeSelect.click();
    await page.getByRole('option', { name: /Admin User/i }).first().click();

    log('접수 폼 - 메모 입력');
    await page.getByLabel('접수 메모 (선택)').fill('자동화 테스트로 접수 완료');

    log('SR 접수 제출');
    await page.getByRole('button', { name: /SR 접수하기|수정 완료/ }).click();

    // 5. 접수 완료 후 목록 검증
    await page.waitForURL(/\/srs$/);
    await page.waitForLoadState('networkidle');

    log('목록에서 상태/버튼 확인');
    const updatedRow = page.locator('tr', { hasText: srTitle }).first();
    await expect(updatedRow).toContainText('진행중');
    await expect(updatedRow.getByRole('button', { name: '접수 정보 수정' })).toBeVisible();
  });
});

