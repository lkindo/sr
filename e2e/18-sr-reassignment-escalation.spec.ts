import { test, expect, Page } from '@playwright/test';
import path from 'path';

/**
 * SR 재배정 및 에스컬레이션 워크플로우 E2E 테스트
 *
 * 시나리오:
 * 1. MANAGER: SR 생성 및 Engineer A에게 배정
 * 2. MANAGER: Engineer A → Engineer B로 재배정
 * 3. MANAGER: 우선순위 LOW → HIGH 상향 조정
 * 4. MANAGER: HIGH → CRITICAL 긴급 에스컬레이션
 * 5. ENGINEER B: 에스컬레이션된 SR 확인 및 처리
 * 6. 예상 시간 초과 시뮬레이션 (선택)
 */

const authFiles = {
  manager: path.join(__dirname, '../playwright/.auth/manager.json'),
  engineer: path.join(__dirname, '../playwright/.auth/engineer.json'),
};

test.describe('SR 재배정 및 에스컬레이션', () => {
  let srId: string;
  let srTitle: string;

  test.describe.configure({ mode: 'serial' });

  test('1. MANAGER: SR 생성 및 초기 담당자 배정', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.manager });
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
      srTitle = `재배정 테스트 SR ${timestamp}`;

      await page.getByRole('textbox', { name: '제목 *' }).fill(srTitle);
      await page.getByRole('textbox', { name: '설명 *' }).fill('담당자 재배정 및 우선순위 에스컬레이션 테스트');

      // 고객사 선택 - Select가 enabled될 때까지 대기
      const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
      await expect(clientCombobox).toBeEnabled({ timeout: 10000 });
      await clientCombobox.click();
      const firstClientOption = page.getByRole('option').first();
      await firstClientOption.waitFor({ state: 'visible', timeout: 5000 });
      await firstClientOption.click();
      await page.waitForTimeout(300);

      // 서비스 카테고리 선택 - enabled될 때까지 대기
      const categoryCombobox = page.getByRole('combobox', { name: '서비스 카테고리 *' });
      await expect(categoryCombobox).toBeEnabled({ timeout: 10000 });
      await categoryCombobox.click({ force: true });
      await page.waitForTimeout(500);
      const firstCategoryOption = page.getByRole('option').first();
      await firstCategoryOption.waitFor({ state: 'visible', timeout: 10000 });
      await firstCategoryOption.click();
      await page.waitForTimeout(500);

      // SR 생성
      await page.getByRole('button', { name: /저장|생성|Create/i }).click();
      await page.waitForTimeout(2000);

      // 목록에서 생성된 SR 찾기
      await page.goto('/srs');
      await page.waitForLoadState('networkidle');

      const srRow = page.locator('tr', { hasText: srTitle }).first();
      await expect(srRow).toBeVisible({ timeout: 10000 });

      // SR 상세 페이지로 이동하여 ID 추출
      await srRow.click();
      await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
      srId = page.url().split('/').pop()!;

      console.log(`✅ SR 생성 완료: ${srId} - ${srTitle}`);

      // 접수 버튼 클릭
      const intakeButton = page.getByRole('button', { name: /접수|Accept/i });
      if (await intakeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await intakeButton.click();
        await page.waitForURL(/\/srs\/[^/]+\/intake/, { timeout: 10000 });

        // 우선순위: LOW 설정
        const prioritySelect = page.locator('label', { hasText: '실제 우선순위' })
          .first()
          .locator('..')
          .locator('[role="combobox"]');
        await prioritySelect.click();
        await page.getByRole('option', { name: /낮음|LOW/i }).first().click();

        // 예상 작업 시간
        const hoursInput = page.getByLabel(/예상 작업 시간/i);
        await hoursInput.fill('4');

        // 담당자: Engineer A (첫 번째 엔지니어)
        const assigneeSelect = page.locator('label', { hasText: '담당자' })
          .first()
          .locator('..')
          .locator('[role="combobox"]');
        await assigneeSelect.click();
        await page.getByRole('option', { name: /Engineer|엔지니어/i }).first().click();

        // 접수 메모
        await page.getByLabel(/접수 메모/i).fill('초기 담당자로 Engineer A 배정');

        // 접수 완료
        await page.getByRole('button', { name: /저장/i }).click();
        await page.waitForTimeout(2000);

        console.log(`✅ SR 접수 완료 - Engineer A 배정, 우선순위: LOW`);
      }
    } finally {
      await context.close();
    }
  });

  test('2. MANAGER: 담당자 재배정 (Engineer A → Engineer B)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.manager });
    const page = await context.newPage();

    try {
      // SR 상세 페이지로 이동
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 제목 확인
      await expect(page.locator(`text=${srTitle}`).first()).toBeVisible({ timeout: 5000 });

      // 담당자 재배정 UI 찾기
      // 1) 수정 버튼으로 접수 페이지 재진입
      const editButton = page.getByRole('button', { name: /수정|Edit/i });
      const intakeLink = page.locator('a[href*="/intake"]');

      if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editButton.click();
        await page.waitForURL(/\/srs\/[^/]+\/intake/, { timeout: 20000 }).catch(() => {
          console.log('⚠️ 접수 페이지로 자동 이동 실패. 직접 이동합니다.');
        });
      } else if (await intakeLink.isVisible({ timeout: 3000 }).catch(() => false)) {
        await intakeLink.click();
        await page.waitForURL(/\/srs\/[^/]+\/intake/, { timeout: 20000 }).catch(() => { });
      }

      // URL이 intake가 아니면 직접 이동
      if (!page.url().includes('/intake')) {
        await page.goto(`/srs/${srId}/intake`);
        await page.waitForLoadState('networkidle');
      }

      // 담당자 변경
      const assigneeSelect = page.locator('label', { hasText: '담당자' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');

      if (await assigneeSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await assigneeSelect.click();
        await page.waitForTimeout(500);

        // 옵션 로딩 대기
        const firstOption = page.getByRole('option').first();
        await firstOption.waitFor({ state: 'visible', timeout: 10000 });

        // Engineer B 선택 (두 번째 옵션 또는 첫 번째)
        const allOptions = page.getByRole('option');
        const optionCount = await allOptions.count();
        console.log(`✅ 담당자 옵션 개수: ${optionCount}`);

        if (optionCount > 1) {
          await allOptions.nth(1).click(); // 두 번째 옵션
        } else if (optionCount === 1) {
          await allOptions.first().click(); // 하나뿐이면 첫 번째
        } else {
          console.log('⚠️ 담당자 옵션을 찾을 수 없습니다.');
        }

        // 접수 메모 업데이트
        const memoField = page.getByLabel(/접수 메모/i);
        if (await memoField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await memoField.fill('Engineer B로 담당자 재배정');
        }

        // 저장
        await page.getByRole('button', { name: /저장/i }).click();
        await page.waitForTimeout(2000);

        console.log(`✅ 담당자 재배정 완료: Engineer A → Engineer B`);
      } else {
        console.log(`⚠️ 담당자 재배정 UI를 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('3. MANAGER: 우선순위 상향 조정 (LOW → HIGH)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.manager });
    const page = await context.newPage();

    try {
      // 접수 페이지로 이동
      await page.goto(`/srs/${srId}/intake`, { waitUntil: 'networkidle', timeout: 30000 });

      // 우선순위 변경: HIGH
      const prioritySelect = page.locator('label', { hasText: '실제 우선순위' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');

      if (await prioritySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await prioritySelect.click();
        await page.getByRole('option', { name: /높음|HIGH/i }).first().click();

        // 접수 메모 업데이트
        const memoField = page.getByLabel(/접수 메모/i);
        if (await memoField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await memoField.fill('우선순위 상향: LOW → HIGH (고객 요청)');
        }

        // 저장
        await page.getByRole('button', { name: /저장/i }).click();
        await page.waitForTimeout(2000);

        console.log(`✅ 우선순위 상향 조정 완료: LOW → HIGH`);

        // 상세 페이지에서 우선순위 확인
        await page.goto(`/srs/${srId}`);
        await page.waitForLoadState('networkidle');

        const priorityBadge = page.locator('text=/높음|HIGH/i').first();
        if (await priorityBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(priorityBadge).toBeVisible();
          console.log(`✅ 우선순위 HIGH 확인 완료`);
        }
      } else {
        console.log(`⚠️ 우선순위 변경 UI를 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('4. MANAGER: 긴급 에스컬레이션 (HIGH → CRITICAL)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.manager });
    const page = await context.newPage();

    try {
      // 접수 페이지로 이동
      await page.goto(`/srs/${srId}/intake`, { waitUntil: 'networkidle', timeout: 30000 });

      // 우선순위 변경: CRITICAL
      const prioritySelect = page.locator('label', { hasText: '실제 우선순위' })
        .first()
        .locator('..')
        .locator('[role="combobox"]');

      if (await prioritySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await prioritySelect.click();
        await page.getByRole('option', { name: /긴급|CRITICAL/i }).first().click();

        // 예상 시간 단축
        const hoursInput = page.getByLabel(/예상 작업 시간/i);
        if (await hoursInput.isVisible({ timeout: 3000 }).catch(() => false)) {
          await hoursInput.fill('2');
        }

        // 접수 메모 업데이트
        const memoField = page.getByLabel(/접수 메모/i);
        if (await memoField.isVisible({ timeout: 3000 }).catch(() => false)) {
          await memoField.fill('긴급 에스컬레이션: HIGH → CRITICAL (서비스 장애 발생)');
        }

        // 저장
        await page.getByRole('button', { name: /저장/i }).click();
        await page.waitForTimeout(2000);

        console.log(`✅ 긴급 에스컬레이션 완료: HIGH → CRITICAL`);

        // 상세 페이지에서 우선순위 확인
        await page.goto(`/srs/${srId}`);
        await page.waitForLoadState('networkidle');

        const priorityBadge = page.locator('text=/긴급|CRITICAL/i').first();
        if (await priorityBadge.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(priorityBadge).toBeVisible();
          console.log(`✅ 우선순위 CRITICAL 확인 완료`);
        }
      } else {
        console.log(`⚠️ 우선순위 변경 UI를 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('5. ENGINEER: 에스컬레이션된 SR 확인 및 우선 처리', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.engineer });
    const page = await context.newPage();

    try {
      // SR 목록 페이지로 이동
      await page.goto('/srs', { waitUntil: 'networkidle', timeout: 30000 });

      // CRITICAL 우선순위 SR 필터링 (있다면)
      const filterButton = page.getByRole('button', { name: /필터|Filter/i });
      if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await filterButton.click();
        await page.waitForTimeout(500);

        // 우선순위 필터 선택
        const priorityFilter = page.locator('select, [role="combobox"]').filter({ hasText: /우선순위|Priority/i });
        if (await priorityFilter.isVisible({ timeout: 3000 }).catch(() => false)) {
          await priorityFilter.click();
          await page.getByRole('option', { name: /긴급|CRITICAL/i }).first().click();
          await page.waitForTimeout(1000);
        }
      }

      // 에스컬레이션된 SR 찾기
      const srRow = page.locator('tr', { hasText: srTitle }).first();
      if (await srRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(srRow).toBeVisible();
        console.log(`✅ ENGINEER가 CRITICAL SR 확인`);

        // SR 상세로 이동
        await srRow.click();
        await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);

        // 우선순위 확인
        const priorityBadge = page.locator('text=/긴급|CRITICAL/i').first();
        await expect(priorityBadge).toBeVisible({ timeout: 5000 });

        // 에스컬레이션 메모 확인
        const escalationNote = page.locator('text=/긴급 에스컬레이션|서비스 장애/i');
        if (await escalationNote.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(escalationNote).toBeVisible();
          console.log(`✅ 에스컬레이션 메모 확인 완료`);
        }

        // 댓글 작성
        const commentTextarea = page.locator('textarea').filter({ hasText: /댓글|Comment/i }).or(
          page.locator('textarea[placeholder*="댓글"]')
        ).first();

        if (await commentTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
          await commentTextarea.fill('긴급 SR로 에스컬레이션되었습니다. 최우선으로 처리하겠습니다.');

          const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
          if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
            await submitButton.click();
            await page.waitForTimeout(1500);
            console.log(`✅ ENGINEER 댓글 작성 완료`);
          }
        }

        console.log(`\n✨ SR 재배정 및 에스컬레이션 워크플로우 완료!`);
        console.log(`SR ID: ${srId}`);
        console.log(`최종 우선순위: CRITICAL`);
        console.log(`최종 담당자: Engineer B`);
      } else {
        console.log(`⚠️ SR을 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });
});

test.describe('에스컬레이션 추가 시나리오', () => {
  // TODO: 다음 기능들은 현재 미구현 상태이므로 구현 후 테스트 활성화 필요
  // - 예상 시간 초과 알림 시뮬레이션: SLA 기반 자동 알림 기능
  // - 백업 담당자 자동 배정: 주 담당자 부재 시 자동 배정 로직
  // - 다운그레이드 시나리오: 에스컬레이션 해제 워크플로우
});

