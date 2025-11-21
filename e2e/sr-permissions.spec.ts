import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.TEST_USER_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

const CLIENT_EMAIL = 'clientuser@example.com';
const CLIENT_PASSWORD = 'client123';

const ENGINEER_EMAIL = 'engineeruser@example.com';
const ENGINEER_PASSWORD = 'engineer123';

async function loginAs(page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.getByRole('button', { name: /로그인|sign in/i }).click();
  await page.waitForURL(/\/(dashboard|srs)/, { timeout: 60000 });
}

async function createSrAsAdmin(page) {
  await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  const srTitle = `SR Permissions ${Date.now()}`;

  await page.goto('/srs', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '등록' }).click();
  await expect(page.getByRole('heading', { name: /새 SR 요청|Create SR/i })).toBeVisible();

  await page.getByRole('textbox', { name: '제목' }).fill(srTitle);
  await page.getByRole('textbox', { name: '설명' }).fill('권한 테스트용 SR');

  await page.getByRole('combobox', { name: '고객사' }).click();
  await page.getByRole('option', { name: /테스트 고객사 A/i }).click();
  await page.getByRole('combobox', { name: '서비스 카테고리' }).click();
  await page.getByRole('option', { name: /기술 지원/i }).click();
  await page.getByRole('button', { name: /SR 요청하기|생성|Create/i }).click();

  await page.waitForTimeout(1500);
  await page.goto('/srs');
  await page.waitForLoadState('networkidle');

  const srRow = page.locator('tr', { hasText: srTitle }).first();
  await expect(srRow).toBeVisible({ timeout: 10000 });

  const srLink = srRow.getByRole('link').first();
  await srLink.click();
  await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
  const srId = page.url().split('/').pop()!;

  await page.goto('/srs');

  return { srId, srTitle };
}

async function fillIntakeForm(page, overrides?: { hours?: string; assignee?: string }) {
  const prioritySelect = page
    .locator('label', { hasText: '실제 우선순위' })
    .first()
    .locator('..')
    .locator('[role="combobox"]');
  await prioritySelect.click();
  await page.getByRole('option', { name: /보통 \(MEDIUM\)|높음 \(HIGH\)|긴급 \(CRITICAL\)/ }).first().click();

  const hoursInput = page.getByLabel('예상 작업 시간 (시간) *');
  await hoursInput.fill('');
  await hoursInput.fill(overrides?.hours ?? '6');

  const assigneeSelect = page
    .locator('label', { hasText: '담당자' })
    .first()
    .locator('..')
    .locator('[role="combobox"]');
  await assigneeSelect.click();
  await page.getByRole('option', { name: overrides?.assignee ?? /Admin User/i }).first().click();

  await page.getByLabel('접수 메모 (선택)').fill('권한 테스트 자동화 메모');
}

test.describe('SR 권한 기반 UI/액션', () => {
  test('CLIENT_USER는 접수 버튼이 숨겨지고 접수 페이지 접근이 차단된다', async ({ page }) => {
    const { srId, srTitle } = await createSrAsAdmin(page);

    await loginAs(page, CLIENT_EMAIL, CLIENT_PASSWORD);
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');

    const srRow = page.locator('tr', { hasText: srTitle }).first();
    await expect(srRow).toBeVisible({ timeout: 10000 });
    await expect(srRow.getByRole('button', { name: '접수' })).toHaveCount(0);

    await page.goto(`/srs/${srId}/intake`);
    await fillIntakeForm(page);
    await page.getByRole('button', { name: /SR 접수하기|수정 완료/ }).click();
    await expect(page.getByText(/SR 접수 권한이 없습니다/)).toBeVisible({ timeout: 10000 });
  });

  test('ENGINEER는 접수 페이지를 열어 폼을 확인할 수 있다', async ({ page }) => {
    const { srId } = await createSrAsAdmin(page);

    await loginAs(page, ENGINEER_EMAIL, ENGINEER_PASSWORD);
    await page.goto(`/srs/${srId}/intake`);

    await expect(page.getByRole('heading', { name: /SR 접수 처리|SR 접수 정보 수정/ })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('label', { hasText: '실제 우선순위' })).toBeVisible();
    await expect(page.getByRole('button', { name: /SR 접수하기|수정 완료/ })).toBeVisible();
  });
});

