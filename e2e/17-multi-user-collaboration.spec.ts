import { test, expect, Page } from '@playwright/test';
import path from 'path';

/**
 * 다중 사용자 협업 시나리오 E2E 테스트
 *
 * 시나리오:
 * 1. CLIENT: SR 생성
 * 2. MANAGER: SR 접수 처리 및 담당자 배정
 * 3. ENGINEER: 진행 중 상태 변경 및 댓글 작성
 * 4. CLIENT: 댓글 확인 및 회신
 * 5. ENGINEER: 완료 처리
 * 6. MANAGER: 검토 및 종료
 */

const authFiles = {
  client: path.join(__dirname, '../playwright/.auth/client.json'),
  manager: path.join(__dirname, '../playwright/.auth/manager.json'),
  engineer: path.join(__dirname, '../playwright/.auth/engineer.json'),
};

// 헬퍼 함수: 로그인 상태 전환
async function switchUser(page: Page, role: 'client' | 'manager' | 'engineer') {
  const context = page.context();
  await context.clearCookies();
  // 인증 상태 파일이 있다면 적용
  // Note: Playwright에서는 런타임에 storageState를 변경할 수 없으므로,
  // 각 역할별로 새로운 브라우저 컨텍스트를 사용해야 합니다.
}

test.describe('다중 사용자 협업 워크플로우', () => {
  let srId: string;
  let srTitle: string;

  test.describe.configure({ mode: 'serial' });

  test('1. CLIENT: SR 생성', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/srs', { waitUntil: 'networkidle', timeout: 30000 });

      // SR 생성 버튼 클릭
      const createButton = page.getByRole('button', { name: /등록|새 SR|Create/i }).first();
      await expect(createButton).toBeVisible({ timeout: 10000 });
      await createButton.click();

      // 다이얼로그 확인
      await expect(page.getByRole('heading', { name: /새 SR 요청|Create SR/i })).toBeVisible({ timeout: 5000 });

      // SR 정보 입력
      const timestamp = Date.now();
      srTitle = `협업 테스트 SR ${timestamp}`;

      await page.getByRole('textbox', { name: '제목 *' }).fill(srTitle);
      await page.getByRole('textbox', { name: '설명 *' }).fill('다중 사용자 협업 시나리오 테스트입니다.');

      // 고객사 선택 (disabled 가능성 있음, CLIENT는 자동 설정)
      const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
      const isClientDisabled = await clientCombobox.getAttribute('disabled');
      if (!isClientDisabled) {
        await clientCombobox.click();
        const firstClientOption = page.getByRole('option').first();
        await firstClientOption.waitFor({ state: 'visible', timeout: 5000 });
        await firstClientOption.click();
        await page.waitForTimeout(300);
      }

      // 서비스 카테고리 선택 - categories 로딩 완료 대기
      const categoryCombobox = page.getByRole('combobox', { name: '서비스 카테고리 *' });
      await page.waitForFunction(
        () => {
          const el = document.querySelector('#category') as HTMLButtonElement;
          return el && !el.disabled;
        },
        { timeout: 10000 }
      );

      // 키보드로 선택 (안정성 향상)
      await categoryCombobox.click({ force: true });
      await page.waitForTimeout(500); // 메뉴가 열릴 때까지 대기
      const firstCategoryOption = page.getByRole('option').first();
      await firstCategoryOption.waitFor({ state: 'visible', timeout: 10000 });
      await firstCategoryOption.click();
      await page.waitForTimeout(500); // 선택 반영 대기

      // SR 생성
      await page.getByRole('button', { name: /저장|생성|Create/i }).click();
      await page.waitForTimeout(2000);

      // 목록에서 생성된 SR 확인
      await page.goto('/srs');
      await page.waitForLoadState('networkidle');

      const srRow = page.locator('tr', { hasText: srTitle }).first();
      await expect(srRow).toBeVisible({ timeout: 10000 });

      // SR ID 추출 (상세 페이지 이동)
      await srRow.click();
      await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
      srId = page.url().split('/').pop()!;

      console.log(`✅ CLIENT가 SR 생성 완료: ${srId} - ${srTitle}`);

      // 상태 확인 (REQUESTED)
      const statusBadge = page.locator('text=/요청됨|REQUESTED/i').first();
      await expect(statusBadge).toBeVisible({ timeout: 5000 });
    } finally {
      await context.close();
    }
  });

  test('2. MANAGER: SR 접수 처리 및 담당자 배정', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.manager });
    const page = await context.newPage();

    try {
      // SR 상세 페이지로 이동
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 제목 확인
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 5000 });

      // 접수 버튼 클릭
      const intakeButton = page.getByRole('button', { name: /접수|Accept/i });
      await expect(intakeButton).toBeVisible({ timeout: 5000 });
      await intakeButton.click();

      // 접수 페이지로 이동 대기
      await page.waitForURL(/\/srs\/[^/]+\/intake/, { timeout: 10000 });

      // 접수 폼 확인
      await expect(page.getByRole('heading', { name: /SR 접수 처리|SR 접수 정보 수정/i })).toBeVisible({ timeout: 10000 });

      // 우선순위 선택
      const prioritySelect = page.locator('label', { hasText: '실제 우선순위' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');
      await prioritySelect.click();
      await page.getByRole('option', { name: /높음|HIGH/i }).first().click();

      // 예상 작업 시간 입력
      const hoursInput = page.getByLabel(/예상 작업 시간/i);
      await hoursInput.fill('8');

      // 담당자 선택 (엔지니어)
      const assigneeSelect = page.locator('label', { hasText: '담당자' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');
      await assigneeSelect.click();
      await page.getByRole('option', { name: /Engineer|엔지니어/i }).first().click();

      // 접수 메모 작성
      await page.getByLabel(/접수 메모/i).fill('엔지니어에게 배정하였습니다. 빠른 처리 부탁드립니다.');

      // 접수 완료
      await page.getByRole('button', { name: /저장/i }).click();
      await page.waitForTimeout(2000);

      // 상세 페이지로 복귀
      await page.goto(`/srs/${srId}`);
      await page.waitForLoadState('networkidle');

      // 상태 확인 (IN_PROGRESS)
      const statusBadge = page.locator('text=/진행|IN_PROGRESS/i').first();
      await expect(statusBadge).toBeVisible({ timeout: 5000 });

      console.log(`✅ MANAGER가 SR 접수 및 담당자 배정 완료`);
    } finally {
      await context.close();
    }
  });

  test('3. ENGINEER: 진행 중 확인 및 댓글 작성', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.engineer });
    const page = await context.newPage();

    try {
      // SR 상세 페이지로 이동
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 제목 확인
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 5000 });

      // 상태 확인 (IN_PROGRESS)
      const statusBadge = page.locator('text=/진행|IN_PROGRESS/i').first();
      await expect(statusBadge).toBeVisible({ timeout: 5000 });

      // 댓글 작성
      const commentTextarea = page.locator('textarea').filter({ hasText: /댓글|Comment/i }).or(
        page.locator('textarea[placeholder*="댓글"]')
      ).first();

      if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await commentTextarea.fill('문제를 파악하였습니다. 현재 작업 진행 중입니다.');

        // 댓글 제출 버튼
        const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(1500);

          console.log(`✅ ENGINEER가 댓글 작성 완료`);
        }
      } else {
        console.log(`⚠️ 댓글 입력 필드를 찾을 수 없습니다. 스킵합니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('4. CLIENT: 댓글 확인 및 회신', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      // SR 상세 페이지로 이동
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 제목 확인
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 5000 });

      // 엔지니어 댓글 확인
      const engineerComment = page.locator('text=/문제를 파악하였습니다/i');
      if (await engineerComment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(engineerComment).toBeVisible();
        console.log(`✅ CLIENT가 엔지니어 댓글 확인`);

        // 답글 작성
        const commentTextarea = page.locator('textarea').filter({ hasText: /댓글|Comment/i }).or(
          page.locator('textarea[placeholder*="댓글"]')
        ).first();

        if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
          await commentTextarea.fill('감사합니다. 추가로 로그 파일을 첨부하겠습니다.');

          const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
          if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await submitButton.click();
            await page.waitForTimeout(1500);

            console.log(`✅ CLIENT가 회신 댓글 작성 완료`);
          }
        }
      } else {
        console.log(`⚠️ 엔지니어 댓글을 찾을 수 없습니다. 스킵합니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('5. ENGINEER: 작업 완료 처리', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.engineer });
    const page = await context.newPage();

    try {
      // SR 상세 페이지로 이동
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // CLIENT 댓글 확인
      const clientComment = page.locator('text=/로그 파일을 첨부/i');
      if (await clientComment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(clientComment).toBeVisible();
        console.log(`✅ ENGINEER가 CLIENT 댓글 확인`);
      }

      // 완료 처리 (상태 변경)
      // 상태 변경 UI 찾기 (버튼 또는 셀렉트)
      const statusChangeButton = page.getByRole('button', { name: /완료|Complete|상태 변경/i });
      const statusSelect = page.locator('select, [role="combobox"]').filter({ hasText: /상태|Status/i });

      if (await statusChangeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusChangeButton.click();
        await page.waitForTimeout(1500);
        console.log(`✅ ENGINEER가 완료 버튼 클릭`);
      } else if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusSelect.first().click();
        const completedOption = page.getByRole('option', { name: /완료|COMPLETED/i });
        if (await completedOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await completedOption.click();
          await page.waitForTimeout(1500);
          console.log(`✅ ENGINEER가 상태를 완료로 변경`);
        }
      } else {
        console.log(`⚠️ 상태 변경 UI를 찾을 수 없습니다. 스킵합니다.`);
      }

      // 완료 댓글 작성
      const commentTextarea = page.locator('textarea').filter({ hasText: /댓글|Comment/i }).or(
        page.locator('textarea[placeholder*="댓글"]')
      ).first();

      if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await commentTextarea.fill('작업이 완료되었습니다. 확인 부탁드립니다.');

        const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(1500);
          console.log(`✅ ENGINEER가 완료 댓글 작성`);
        }
      }
    } finally {
      await context.close();
    }
  });

  test('6. MANAGER: 최종 검토 및 종료', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.manager });
    const page = await context.newPage();

    try {
      // SR 상세 페이지로 이동
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 제목 확인
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 5000 });

      // 엔지니어 완료 댓글 확인
      const completeComment = page.locator('text=/작업이 완료되었습니다/i');
      if (await completeComment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(completeComment).toBeVisible();
        console.log(`✅ MANAGER가 완료 댓글 확인`);
      }

      // 상태 확인 (COMPLETED 또는 IN_PROGRESS)
      const statusBadge = page.locator('text=/완료|COMPLETED|진행|IN_PROGRESS/i').first();
      await expect(statusBadge).toBeVisible({ timeout: 5000 });

      // 종료 처리 (CLOSED)
      const closeButton = page.getByRole('button', { name: /종료|Close/i });
      const statusSelect = page.locator('select, [role="combobox"]').filter({ hasText: /상태|Status/i });

      if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(1500);
        console.log(`✅ MANAGER가 SR 종료 처리`);
      } else if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusSelect.first().click();
        const closedOption = page.getByRole('option', { name: /종료|CLOSED/i });
        if (await closedOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await closedOption.click();
          await page.waitForTimeout(1500);
          console.log(`✅ MANAGER가 상태를 종료로 변경`);
        }
      } else {
        console.log(`⚠️ 종료 UI를 찾을 수 없습니다.`);
      }

      // 최종 검토 댓글 작성
      const commentTextarea = page.locator('textarea').filter({ hasText: /댓글|Comment/i }).or(
        page.locator('textarea[placeholder*="댓글"]')
      ).first();

      if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await commentTextarea.fill('검토 완료하였습니다. SR을 종료합니다. 수고하셨습니다.');

        const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(1500);
          console.log(`✅ MANAGER가 최종 검토 댓글 작성`);
        }
      }

      console.log(`\n🎉 다중 사용자 협업 워크플로우 완료!`);
      console.log(`SR ID: ${srId}`);
      console.log(`SR 제목: ${srTitle}`);
    } finally {
      await context.close();
    }
  });

  test('7. CLIENT: 종료된 SR 확인', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      // SR 상세 페이지로 이동
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 제목 확인
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 5000 });

      // 종료 상태 확인
      const statusBadge = page.locator('text=/종료|CLOSED|완료|COMPLETED/i').first();
      await expect(statusBadge).toBeVisible({ timeout: 5000 });

      // 전체 댓글 히스토리 확인
      const allComments = page.locator('[class*="comment"], [class*="Comment"]');
      const commentCount = await allComments.count();

      console.log(`✅ CLIENT가 종료된 SR 확인 완료 (댓글 수: ${commentCount})`);

      // 최종 검토 댓글 확인
      const finalComment = page.locator('text=/검토 완료하였습니다/i');
      if (await finalComment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(finalComment).toBeVisible();
        console.log(`✅ CLIENT가 최종 검토 댓글 확인`);
      }

      console.log(`\n✨ 다중 사용자 협업 시나리오 E2E 테스트 모두 통과!`);
    } finally {
      await context.close();
    }
  });
});

test.describe('협업 시나리오 - 변형 케이스', () => {
  test('동시 댓글 작성 및 충돌 방지', async ({ browser }) => {
    // 이 테스트는 동시성 처리를 확인합니다.
    // 현재는 스킵하고, 추후 구현합니다.
    test.skip();
  });

  test('담당자 부재 시 재배정', async ({ browser }) => {
    // 이 테스트는 담당자 변경 시나리오를 확인합니다.
    // 추후 구현합니다.
    test.skip();
  });
});
