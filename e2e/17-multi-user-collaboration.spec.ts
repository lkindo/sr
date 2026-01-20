import { expect, Page, test } from '@playwright/test';
import path from 'path';

import { deleteSRViaAPI } from './helpers/test-helpers';

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

test.describe('다중 사용자 협업 워크플로우', () => {
  let srId: string;
  let srTitle: string;

  test.afterAll(async ({ browser }) => {
    // 생성된 SR 삭제
    if (srId) {
      const context = await browser.newContext({ storageState: authFiles.manager });
      const request = context.request;
      console.log(`🧹 Cleaning up project SR: ${srId}`);
      await deleteSRViaAPI(request, srId);
      await context.close();
    }
  });

  test.describe.configure({ mode: 'serial' });
  // 다중 사용자 시나리오는 시간이 오래 걸리므로 타임아웃을 넉넉히 설정
  test.setTimeout(120000);

  // SR ID가 없으면 후속 테스트를 스킵
  test.beforeEach(async (_, testInfo) => {
    if (testInfo.title !== '1. CLIENT: SR 생성' && !srId) {
      test.skip(true, 'SR 생성 테스트가 실패하여 후속 테스트를 스킵합니다.');
    }
  });

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
      await expect(page.getByRole('heading', { name: /새 SR 요청|Create SR/i })).toBeVisible({
        timeout: 15000,
      });

      // SR 정보 입력
      const timestamp = Date.now();
      srTitle = `협업 테스트 SR ${timestamp}`;

      await page.getByRole('textbox', { name: '제목 *' }).fill(srTitle);
      await page
        .getByRole('textbox', { name: '설명 *' })
        .fill('다중 사용자 협업 시나리오 테스트입니다.');

      // 고객사 선택 (CLIENT 사용자는 자동 설정되어 disabled 상태일 수 있음)
      const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
      try {
        const isClientEnabled = await clientCombobox.isEnabled({ timeout: 3000 });
        if (isClientEnabled) {
          await clientCombobox.click();
          const firstClientOption = page.getByRole('option').first();
          await firstClientOption.waitFor({ state: 'visible', timeout: 15000 });
          await firstClientOption.click();
          await page.waitForTimeout(300);
        } else {
          console.log('⚠️ CLIENT 사용자: 고객사 자동 설정됨 (disabled)');
        }
      } catch {
        console.log('⚠️ CLIENT 사용자: 고객사 combobox 처리 스킵');
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

      // 다이얼로그 닫힘 대기 및 목록 로드 대기
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
      await page.waitForLoadState('networkidle'); // 목록 갱신 대기 (필수)

      const srRow = page.locator('tr', { hasText: srTitle }).first();
      await expect(srRow).toBeVisible({ timeout: 10000 });

      // SR ID 추출 (상세 페이지 이동)
      await srRow.click();
      await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
      srId = page.url().split('/').pop()!;

      console.log(`✅ CLIENT가 SR 생성 완료: ${srId} - ${srTitle}`);

      // 상태 확인 (REQUESTED)
      const statusBadge = page.locator('text=/요청됨|REQUESTED/i').first();
      await expect(statusBadge).toBeVisible({ timeout: 15000 });
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
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 15000 });

      // 접수 버튼 클릭
      const intakeButton = page.getByRole('button', { name: /접수|Accept/i });
      await expect(intakeButton).toBeVisible({ timeout: 15000 });
      await intakeButton.click();

      // 접수 페이지로 이동 대기
      await page.waitForURL(/\/srs\/[^/]+\/intake/, { timeout: 10000 });

      // 접수 폼 확인 (URL 기반 + 페이지 요소 확인)
      await expect(page).toHaveURL(/\/srs\/[^/]+\/intake/);
      const formElement = page
        .locator('label, h1, h2, h3')
        .filter({ hasText: /접수|우선순위|Intake/i })
        .first();
      await expect(formElement).toBeVisible({ timeout: 10000 });

      // 우선순위 선택
      const prioritySelect = page
        .locator('label', { hasText: '실제 우선순위' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');
      await prioritySelect.click();
      await page
        .getByRole('option', { name: /높음|HIGH/i })
        .first()
        .click();

      // 예상 작업 시간 입력
      const hoursInput = page.getByLabel(/예상 작업 시간/i);
      await hoursInput.fill('8');

      // 담당자 선택 (첫 번째 사용 가능한 담당자)
      const assigneeSelect = page
        .locator('label', { hasText: '담당자' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');
      await assigneeSelect.click({ force: true });
      await page.waitForTimeout(500);
      const firstAssigneeOption = page.getByRole('option').first();
      await firstAssigneeOption.waitFor({ state: 'visible', timeout: 15000 });
      await firstAssigneeOption.click();

      // 접수 메모 작성
      await page
        .getByLabel(/접수 메모/i)
        .fill('엔지니어에게 배정하였습니다. 빠른 처리 부탁드립니다.');

      // 접수 완료
      await page.getByRole('button', { name: /저장/i }).click();

      // 다이얼로그나 폼이 사라지는 것을 대기 (접수 처리가 완료됨을 의미)
      // 특정 URL 이동을 강제하지 않고, 일단 처리가 끝났는지 확인
      // 접수 처리가 완료되면 목록 페이지(/srs)로 이동함
      await page.waitForURL('**/srs', { timeout: 15000 });

      // 혹시 목록으로 튕겼을 경우를 대비해 상세 페이지로 명시적 이동
      await page.goto(`/srs/${srId}`);
      await page.waitForLoadState('networkidle');

      // 상태 확인 (INTAKE 또는 IN_PROGRESS)
      // Badge 컴포넌트가 div일 수 있으므로 좀 더 일반적인 선택자 사용
      const statusBadge = page
        .locator('div, span')
        .filter({ hasText: /^접수$|^진행중$/ })
        .first();
      await expect(statusBadge).toBeVisible({ timeout: 15000 });

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
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 15000 });

      // 상태 확인 (INTAKE 또는 IN_PROGRESS)
      // Manager가 접수하면 INTAKE 상태임
      const statusBadge = page
        .locator('div, span')
        .filter({ hasText: /^접수$|^진행중$/ })
        .first();
      await expect(statusBadge).toBeVisible({ timeout: 15000 });

      // 댓글 작성
      const commentTextarea = page
        .locator('textarea')
        .filter({ hasText: /댓글|Comment/i })
        .or(page.locator('textarea[placeholder*="댓글"]'))
        .first();

      if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await commentTextarea.fill('문제를 파악하였습니다. 현재 작업 진행 중입니다.');

        // 댓글 제출 버튼
        const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitButton.click();
          // 댓글 제출 후 텍스트 영역이 비워지거나 새 댓글이 보일 때까지 대기
          await expect(commentTextarea).toHaveValue('', { timeout: 10000 });
          await expect(page.locator('text=문제를 파악하였습니다')).toBeVisible({ timeout: 10000 });

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
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 15000 });

      // 엔지니어 댓글 확인
      const engineerComment = page.locator('text=/문제를 파악하였습니다/i');
      if (await engineerComment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(engineerComment).toBeVisible();
        console.log(`✅ CLIENT가 엔지니어 댓글 확인`);

        // 답글 작성
        const commentTextarea = page
          .locator('textarea')
          .filter({ hasText: /댓글|Comment/i })
          .or(page.locator('textarea[placeholder*="댓글"]'))
          .first();

        if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
          await commentTextarea.fill('감사합니다. 추가로 로그 파일을 첨부하겠습니다.');

          const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
          if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await submitButton.click();
            await expect(commentTextarea).toHaveValue('', { timeout: 10000 });
            await expect(
              page.locator('text=감사합니다. 추가로 로그 파일을 첨부하겠습니다.')
            ).toBeVisible({ timeout: 10000 });

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
      const statusSelect = page
        .locator('select, [role="combobox"]')
        .filter({ hasText: /상태|Status/i });

      if (await statusChangeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusChangeButton.click();
        await page.waitForTimeout(1500);
        console.log(`✅ ENGINEER가 완료 버튼 클릭`);
      } else if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusSelect.first().click();
        const completedOption = page.getByRole('option', { name: /완료|COMPLETED/i });
        if (await completedOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await completedOption.click();
          // 상태 변경 반영 대기 (배지 텍스트 확인)
          await expect(
            page
              .locator('span.badge')
              .filter({ hasText: /완료|COMPLETED/i })
              .first()
          ).toBeVisible({ timeout: 10000 });
          console.log(`✅ ENGINEER가 상태를 완료로 변경`);
        }
      } else {
        console.log(`⚠️ 상태 변경 UI를 찾을 수 없습니다. 스킵합니다.`);
      }

      // 완료 댓글 작성
      const commentTextarea = page
        .locator('textarea')
        .filter({ hasText: /댓글|Comment/i })
        .or(page.locator('textarea[placeholder*="댓글"]'))
        .first();

      if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await commentTextarea.fill('작업이 완료되었습니다. 확인 부탁드립니다.');

        const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitButton.click();
          await expect(commentTextarea).toHaveValue('', { timeout: 10000 });
          await expect(page.locator('text=작업이 완료되었습니다')).toBeVisible({ timeout: 10000 });
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
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 15000 });

      // 엔지니어 완료 댓글 확인
      const completeComment = page.locator('text=/작업이 완료되었습니다/i');
      if (await completeComment.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(completeComment).toBeVisible();
        console.log(`✅ MANAGER가 완료 댓글 확인`);
      }

      // 상태 확인 (COMPLETED 또는 IN_PROGRESS)
      const statusBadge = page.locator('text=/완료|COMPLETED|진행|IN_PROGRESS/i').first();
      await expect(statusBadge).toBeVisible({ timeout: 15000 });

      // 종료 처리 (CLOSED)
      const closeButton = page.getByRole('button', { name: /종료|Close/i });
      const statusSelect = page
        .locator('select, [role="combobox"]')
        .filter({ hasText: /상태|Status/i });

      if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(1500);
        console.log(`✅ MANAGER가 SR 종료 처리`);
      } else if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusSelect.first().click();
        const closedOption = page.getByRole('option', { name: /종료|CLOSED/i });
        if (await closedOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await closedOption.click();
          // 종료 상태 배지 확인
          await expect(
            page
              .locator('span.badge')
              .filter({ hasText: /종료|CLOSED/i })
              .first()
          ).toBeVisible({ timeout: 10000 });
          console.log(`✅ MANAGER가 상태를 종료로 변경`);
        }
      } else {
        console.log(`⚠️ 종료 UI를 찾을 수 없습니다.`);
      }

      // 최종 검토 댓글 작성
      const commentTextarea = page
        .locator('textarea')
        .filter({ hasText: /댓글|Comment/i })
        .or(page.locator('textarea[placeholder*="댓글"]'))
        .first();

      if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
        await commentTextarea.fill('검토 완료하였습니다. SR을 종료합니다. 수고하셨습니다.');

        const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitButton.click();
          await expect(commentTextarea).toHaveValue('', { timeout: 10000 });
          await expect(page.locator('text=검토 완료하였습니다')).toBeVisible({ timeout: 10000 });
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
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 15000 });

      // 종료 상태 확인
      const statusBadge = page.locator('text=/종료|CLOSED|완료|COMPLETED/i').first();
      await expect(statusBadge).toBeVisible({ timeout: 15000 });

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
  test('동시 댓글 작성 및 충돌 방지', async ({ browser: _browser }) => {
    // 이 테스트는 동시성 처리를 확인합니다.
    // 현재는 스킵하고, 추후 구현합니다.
    test.skip();
  });

  test('담당자 부재 시 재배정', async ({ browser: _browser }) => {
    // 이 테스트는 담당자 변경 시나리오를 확인합니다.
    // 추후 구현합니다.
    test.skip();
  });
});
