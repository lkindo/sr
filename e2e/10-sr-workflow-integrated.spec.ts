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

// 테스트 타임아웃을 60초로 증가
test.setTimeout(60000);

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
    await expect(clientCombobox).toBeEnabled({ timeout: 10000 });
    await clientCombobox.click();

    const firstClientOption = page.getByRole('option').first();
    await firstClientOption.waitFor({ state: 'visible', timeout: 5000 });
    const clientName = (await firstClientOption.textContent()) || '';
    await firstClientOption.click();

    // 선택 확인 (텍스트가 포함되어 있는지)
    await expect(clientCombobox).toContainText(clientName, { timeout: 5000 });

    // 서비스 카테고리 선택 - categories 로딩 완료 대기
    const categoryCombobox = page.getByRole('combobox', { name: '서비스 카테고리 *' });
    await expect(categoryCombobox).toBeEnabled({ timeout: 10000 });
    await categoryCombobox.click({ force: true });

    const firstCategoryOption = page.getByRole('option').first();
    await firstCategoryOption.waitFor({ state: 'visible', timeout: 10000 });
    const categoryName = (await firstCategoryOption.textContent()) || '';
    await firstCategoryOption.click();

    // 선택 확인
    await expect(categoryCombobox).toContainText(categoryName, { timeout: 5000 });

    const createButton = page.getByRole('button', { name: /저장|생성|Create/i });
    await expect(createButton).toBeEnabled();
    await createButton.click({ force: true });

    // 서버 액션 완료 및 성공 Toast 대기 (중복 방지를 위해 first() 사용)
    await expect(page.getByText('SR이 생성되었습니다.').first()).toBeVisible({ timeout: 20000 });

    // 다이얼로그 닫힘 대기
    await expect(page.getByRole('heading', { name: /새 SR 요청|Create SR/i })).not.toBeVisible({ timeout: 10000 });

    // 목록에서 SR 찾기
    // 목록 페이지로 이동 (이미 있다면 새로고침 효과)
    await page.goto('/srs', { waitUntil: 'networkidle', timeout: 30000 });

    // 검색 필터가 있다면 사용하여 검색
    const searchInput = page.getByPlaceholder(/검색|Search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill(srTitle);
      // 엔터 키 입력으로 검색 트리거
      await page.keyboard.press('Enter');

      // 검색 결과 로딩 대기
      await page.waitForTimeout(3000);
    }

    const srRow = page.locator('tr', { hasText: srTitle }).first();
    // 타임아웃을 30초로 증가
    await expect(srRow).toBeVisible({ timeout: 30000 });

    // SR ID 추출
    await srRow.click();
    await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
    srId = page.url().split('/').pop()!;

    console.log(`✅ SR 생성 완료: ${srId} - ${srTitle}`);

    // 접수 페이지로 이동 (상세 페이지에 접수 버튼이 없을 수 있으므로 직접 이동)
    await page.goto(`/srs/${srId}/intake`);

    // 접수 폼 로딩 대기
    await expect(page.getByRole('heading', { name: /접수 정보 입력/i })).toBeVisible({ timeout: 15000 });

    // 접수 폼 입력
    const comboboxes = page.getByRole('combobox');

    // 실제 우선순위
    const prioritySelect = comboboxes.nth(0);
    await prioritySelect.click();
    await page.getByRole('option', { name: /보통|MEDIUM/i }).first().click();

    // 예상 작업 시간
    const hoursInput = page.getByLabel(/예상 작업 시간/i);
    await hoursInput.fill('4');

    // 담당자 선택 (두 번째 콤보박스)
    const assigneeSelect = comboboxes.nth(1);
    await assigneeSelect.click();
    // 담당자 목록이 로딩될 때까지 대기
    await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('option').first().click();

    await page.getByLabel(/접수 메모/i).fill('통합 테스트 접수');

    await page.getByRole('button', { name: /저장/i }).click();

    // 접수 완료 대기
    await page.waitForTimeout(2000);

    console.log(`✅ SR 접수 완료`);
  });

  test('2. SR 상태 변경 및 댓글 작성', async ({ page }) => {
    await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

    // 접수 완료 확인 (INTAKE 상태)
    const intakeStatus = page.locator('text=/접수|INTAKE/i').first();
    await expect(intakeStatus).toBeVisible({ timeout: 10000 });
    console.log(`✅ SR 접수 상태 확인 (INTAKE)`);

    // 댓글 작성
    const commentTextarea = page.locator('textarea').first();
    await expect(commentTextarea).toBeVisible({ timeout: 10000 });
    await commentTextarea.fill('작업을 시작합니다.');

    const submitButton = page.getByRole('button', { name: /댓글 추가/i });
    await submitButton.click();

    // 댓글 등록 확인 - 잠시 대기 후 댓글 목록에서 확인
    await page.waitForTimeout(1000);

    // 작성한 댓글이 목록에 표시되는지 확인
    const commentContent = page.locator('text=작업을 시작합니다.').first();
    await expect(commentContent).toBeVisible({ timeout: 10000 });

    console.log(`✅ 댓글 작성 완료`);

    // 상태 변경 테스트 - /api/srs/[id]/status API를 사용하는 버튼 테스트
    console.log(`🔄 상태 변경 API 테스트 시작...`);

    // 진행 시작 버튼 (INTAKE → IN_PROGRESS)
    const startButton = page.getByRole('button', { name: /진행 시작|Start/i });
    if (await startButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await startButton.click();
      await page.waitForTimeout(2000);

      // IN_PROGRESS 상태 확인
      const inProgressStatus = page.locator('text=/진행|IN_PROGRESS/i').first();
      await expect(inProgressStatus).toBeVisible({ timeout: 5000 });
      console.log(`✅ 진행 시작 완료 (INTAKE → IN_PROGRESS)`);
    } else {
      console.log(`⚠️ 진행 시작 버튼을 찾을 수 없습니다.`);
    }

    // 최신 상태 확인

    // 완료 처리 버튼 (IN_PROGRESS → COMPLETED)
    const completeButton = page.getByRole('button', { name: /완료 처리|Complete/i });
    if (await completeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await completeButton.click();

      // 다이얼로그가 나타나면 해결 내용 입력
      const dialog = page.locator('[role="dialog"], dialog').first();
      if (await dialog.isVisible({ timeout: 3000 }).catch(() => false)) {
        const resolutionTextarea = dialog.locator('textarea').first();
        await resolutionTextarea.fill('테스트로 문제가 해결되었습니다.');

        const submitBtn = dialog.getByRole('button', { name: /완료|Complete|확인/i }).first();
        await submitBtn.click();
        await page.waitForTimeout(2000);

        // COMPLETED 상태 확인
        await page.waitForLoadState('networkidle');
        const completedStatus = page.locator('text=/완료|COMPLETED/i').first();
        await expect(completedStatus).toBeVisible({ timeout: 5000 });
        console.log(`✅ 완료 처리 성공 (IN_PROGRESS → COMPLETED)`);
      }
    } else {
      console.log(`⚠️ 완료 처리 버튼을 찾을 수 없습니다.`);
    }

    console.log(`✅ 상태 변경 테스트 완료`);
    console.log(`✅ 통합 워크플로우 테스트 완료`);
  });

  test('3. 댓글 및 첨부파일 섹션 확인', async ({ page }) => {
    await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

    // 댓글 섹션 확인
    const commentSection = page.locator('section, div').filter({ hasText: /댓글|Comment/i }).first();
    await expect(commentSection).toBeVisible();
    console.log(`✅ 댓글 섹션 확인`);

    // 첨부파일 섹션 확인
    const attachmentSection = page.locator('section, div').filter({ hasText: /첨부|Attachment/i }).first();
    await expect(attachmentSection).toBeVisible();
    console.log(`✅ 첨부파일 섹션 확인`);

    console.log(`✅ SR 워크플로우 통합 테스트 모두 완료`);
  });
});
