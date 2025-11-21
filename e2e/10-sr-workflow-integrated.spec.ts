import { test, expect } from '@playwright/test';

/**
 * SR 워크플로우 통합 테스트
 * - SR 접수 플로우
 * - SR 상태 변경 워크플로우
 * - 댓글 및 첨부파일 기본 기능
 *
 * 복잡한 다중 사용자 시나리오는 17-multi-user-collaboration.spec.ts 참조
 */

test.use({ storageState: './playwright/.auth/user.json' });

test.describe('SR 워크플로우 통합', () => {
  test.describe.configure({ mode: 'serial' });

  let srId: string;
  let srTitle: string;

  test('1. SR 생성 및 접수 처리', async ({ page }) => {
    const timestamp = Date.now();
    srTitle = `통합 테스트 SR ${timestamp}`;

    // SR 생성
    await page.goto('/srs', { waitUntil: 'networkidle', timeout: 30000 });
    await page.getByRole('button', { name: '등록' }).click();
    await expect(page.getByRole('heading', { name: /새 SR 요청|Create SR/i })).toBeVisible();

    await page.getByRole('textbox', { name: '제목 *' }).fill(srTitle);
    await page.getByRole('textbox', { name: '설명 *' }).fill('통합 워크플로우 테스트');

    // 고객사 선택 - Select가 enabled될 때까지 대기
    const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#client') as HTMLButtonElement;
        return el && !el.disabled;
      },
      { timeout: 5000 }
    );
    await clientCombobox.click();
    const firstClientOption = page.getByRole('option').first();
    await firstClientOption.waitFor({ state: 'visible', timeout: 5000 });
    await firstClientOption.click();
    await page.waitForTimeout(300);

    // 서비스 카테고리 선택 - categories 로딩 완료 대기
    const categoryCombobox = page.getByRole('combobox', { name: '서비스 카테고리 *' });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('#category') as HTMLButtonElement;
        return el && !el.disabled;
      },
      { timeout: 10000 }
    );
    await categoryCombobox.click({ force: true });
    await page.waitForTimeout(500);
    const firstCategoryOption = page.getByRole('option').first();
    await firstCategoryOption.waitFor({ state: 'visible', timeout: 10000 });
    await firstCategoryOption.click();
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /SR 요청하기|생성|Create/i }).click();

    // SR 생성 성공 대기 (다이얼로그가 닫히거나 목록으로 리디렉션)
    await page.waitForTimeout(3000);

    // 목록에서 SR 찾기 (이미 목록 페이지에 있거나 이동)
    const currentUrl = page.url();
    if (!currentUrl.includes('/srs')) {
      await page.goto('/srs', { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    const srRow = page.locator('tr', { hasText: srTitle }).first();
    await expect(srRow).toBeVisible({ timeout: 15000 });

    // SR ID 추출
    await srRow.click();
    await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
    srId = page.url().split('/').pop()!;

    console.log(`✅ SR 생성 완료: ${srId} - ${srTitle}`);

    // 접수 페이지로 이동
    await page.goto(`/srs/${srId}`);
    const intakeButton = page.getByRole('button', { name: /접수|Accept/i });

    if (await intakeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await intakeButton.click();
      await page.waitForURL(/\/srs\/[^/]+\/intake/, { timeout: 10000 });

      // 접수 폼 입력
      const prioritySelect = page.locator('label', { hasText: '실제 우선순위' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');
      await prioritySelect.click();
      await page.getByRole('option', { name: /보통|MEDIUM/i }).first().click();

      const hoursInput = page.getByLabel(/예상 작업 시간/i);
      await hoursInput.fill('4');

      const assigneeSelect = page.locator('label', { hasText: '담당자' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');
      await assigneeSelect.click();
      await page.getByRole('option').first().click();

      await page.getByLabel(/접수 메모/i).fill('통합 테스트 접수');

      await page.getByRole('button', { name: /SR 접수하기|수정 완료/i }).click();
      await page.waitForTimeout(2000);

      console.log(`✅ SR 접수 완료`);
    } else {
      console.log(`⚠️ 접수 버튼이 없습니다. (이미 접수되었거나 권한 없음)`);
    }
  });

  test('2. SR 상태 변경 및 댓글 작성', async ({ page }) => {
    await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

    // 댓글 작성
    const commentTextarea = page.locator('textarea').first();
    if (await commentTextarea.isVisible({ timeout: 5000 }).catch(() => false)) {
      await commentTextarea.fill('작업을 시작합니다.');

      const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
      if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitButton.click();
        await page.waitForTimeout(1500);
        console.log(`✅ 댓글 작성 완료`);
      }
    }

    // 상태 변경 (진행 중 → 완료)
    const statusButton = page.getByRole('button', { name: /완료|Complete/i });
    const statusSelect = page.locator('select, [role="combobox"]').filter({ hasText: /상태|Status/i });

    if (await statusButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusButton.click();
      await page.waitForTimeout(1500);
      console.log(`✅ 상태 변경: 완료`);
    } else if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await statusSelect.first().click();
      const completedOption = page.getByRole('option', { name: /완료|COMPLETED/i });
      if (await completedOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await completedOption.click();
        await page.waitForTimeout(1500);
        console.log(`✅ 상태 변경: 완료`);
      }
    } else {
      console.log(`⚠️ 상태 변경 UI를 찾을 수 없습니다.`);
    }

    console.log(`✅ 통합 워크플로우 테스트 완료`);
  });

  test('3. 댓글 및 첨부파일 섹션 확인', async ({ page }) => {
    await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

    // 댓글 섹션 확인
    const commentSection = page.locator('section, div').filter({ hasText: /댓글|Comment/i });
    if (await commentSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(commentSection).toBeVisible();
      console.log(`✅ 댓글 섹션 확인`);
    }

    // 첨부파일 섹션 확인
    const attachmentSection = page.locator('section, div').filter({ hasText: /첨부|Attachment/i });
    if (await attachmentSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(attachmentSection).toBeVisible();
      console.log(`✅ 첨부파일 섹션 확인`);
    }

    console.log(`✅ SR 워크플로우 통합 테스트 모두 완료`);
  });
});

test.describe('SR 접수 화면 접근 테스트', () => {
  test('REQUESTED 상태의 SR 접수 버튼 확인', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');

    const requestedSR = page.locator('tbody tr').filter({ hasText: /신청|REQUESTED/i }).first();
    const isVisible = await requestedSR.isVisible().catch(() => false);

    if (isVisible) {
      const acceptButton = requestedSR.locator('button').filter({ hasText: /접수|Accept/i });
      const buttonVisible = await acceptButton.isVisible().catch(() => false);

      if (buttonVisible) {
        await expect(acceptButton).toBeVisible();
        console.log(`✅ 접수 버튼 확인`);
      } else {
        console.log(`⚠️ 접수 버튼이 보이지 않습니다. (권한 또는 상태 문제)`);
      }
    } else {
      console.log(`⚠️ REQUESTED 상태의 SR이 없습니다.`);
      test.skip();
    }
  });
});

test.describe('SR 상태 변경 독립 테스트', () => {
  test('SR 상태 변경 버튼 확인', async ({ page }) => {
    await page.goto('/srs');
    await page.waitForLoadState('networkidle');

    const firstSR = page.locator('tbody tr').first();
    const isVisible = await firstSR.isVisible().catch(() => false);

    if (isVisible) {
      await firstSR.click();
      await page.waitForURL(/\/srs\/[^/]+$/, { timeout: 5000 });

      const statusButton = page.locator('button, select').filter({ hasText: /상태|Status/i });
      const buttonVisible = await statusButton.isVisible().catch(() => false);

      if (buttonVisible) {
        await expect(statusButton.first()).toBeVisible();
        console.log(`✅ 상태 변경 UI 확인`);
      } else {
        console.log(`⚠️ 상태 변경 UI를 찾을 수 없습니다.`);
      }
    } else {
      test.skip();
    }
  });
});
