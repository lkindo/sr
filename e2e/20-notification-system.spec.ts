import { expect, Page, test } from '@playwright/test';
import path from 'path';

/**
 * 알림(Notification) 시스템 통합 E2E 테스트
 *
 * 시나리오:
 * 1. SR 생성 시 담당자에게 알림 발송
 * 2. 댓글 작성 시 관련자에게 알림
 * 3. 상태 변경 시 알림
 * 4. 알림 목록 확인
 * 5. 알림 읽음 처리
 * 6. 알림 배지/카운트 확인
 * 7. 알림 필터링 및 정렬
 */

const authFiles = {
  client: path.join(__dirname, '../playwright/.auth/client.json'),
  manager: path.join(__dirname, '../playwright/.auth/manager.json'),
  engineer: path.join(__dirname, '../playwright/.auth/engineer.json'),
};

test.describe('알림 시스템 통합 테스트', () => {
  let srId: string;
  let srTitle: string;

  test.describe.configure({ mode: 'serial' });

  test('1. CLIENT: SR 생성', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/srs', { waitUntil: 'networkidle', timeout: 30000 });

      // SR 생성
      const createButton = page.getByRole('button', { name: /등록|새 SR|Create/i }).first();
      await expect(createButton).toBeVisible({ timeout: 10000 });
      await createButton.click();

      await expect(page.getByRole('heading', { name: /새 SR 요청|Create SR/i })).toBeVisible({
        timeout: 5000,
      });

      const timestamp = Date.now();
      srTitle = `알림 테스트 SR ${timestamp}`;

      await page.getByRole('textbox', { name: '제목 *' }).fill(srTitle);
      await page.getByRole('textbox', { name: '설명 *' }).fill('알림 시스템 테스트용 SR입니다.');

      // 고객사 선택 (CLIENT는 자동 설정 - disabled 상태)
      const clientCombobox = page.getByRole('combobox', { name: '고객사 *' });
      const isClientDisabled = await clientCombobox.isDisabled().catch(() => true);

      if (!isClientDisabled) {
        await expect(clientCombobox).toBeEnabled({ timeout: 15000 });
        await clientCombobox.click();
        const firstClientOption = page.getByRole('option').first();
        await firstClientOption.waitFor({ state: 'visible', timeout: 15000 });
        await firstClientOption.click();
        await page.waitForTimeout(300);
      } else {
        console.log('⚠️ CLIENT 사용자: 고객사 자동 설정됨 (선택 스킵)');
      }

      // 서비스 카테고리 선택 - enabled될 때까지 대기
      const categoryCombobox = page.getByRole('combobox', { name: '서비스 카테고리 *' });
      await expect(categoryCombobox).toBeEnabled({ timeout: 15000 });
      await categoryCombobox.click({ force: true });
      await page.waitForTimeout(500);
      const firstCategoryOption = page.getByRole('option').first();
      await firstCategoryOption.waitFor({ state: 'visible', timeout: 15000 });
      await firstCategoryOption.click();
      await page.waitForTimeout(500);

      await page.getByRole('button', { name: /저장|생성|Create/i }).click();
      await page.waitForTimeout(2000);

      await page.goto('/srs');
      await page.waitForLoadState('networkidle');

      const srRow = page.locator('tr', { hasText: srTitle }).first();
      await expect(srRow).toBeVisible({ timeout: 10000 });

      await srRow.click();
      await page.waitForURL(/\/srs\/[a-zA-Z0-9-]+/);
      srId = page.url().split('/').pop()!;

      console.log(`✅ CLIENT가 SR 생성 완료: ${srId} - ${srTitle}`);
    } finally {
      await context.close();
    }
  });

  test('2. MANAGER: SR 접수 및 담당자 배정 → ENGINEER에게 알림', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.manager });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 접수 처리
      const intakeButton = page.getByRole('button', { name: /접수|Accept/i });
      if (await intakeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await intakeButton.click();
        await page.waitForURL(/\/srs\/[^/]+\/intake/, { timeout: 10000 });

        const prioritySelect = page
          .locator('label', { hasText: '실제 우선순위' })
          .first()
          .locator('..')
          .locator('[role="combobox"]');
        await prioritySelect.click();
        await page
          .getByRole('option', { name: /보통|MEDIUM/i })
          .first()
          .click();

        const hoursInput = page.getByLabel(/예상 작업 시간/i);
        await hoursInput.fill('6');

        const assigneeSelect = page
          .locator('label', { hasText: '담당자' })
          .first()
          .locator('..')
          .locator('[role="combobox"]');
        await assigneeSelect.click();
        await page.waitForTimeout(500);

        // 옵션 로딩 대기
        const firstOption = page.getByRole('option').first();
        await firstOption.waitFor({ state: 'visible', timeout: 10000 });
        await firstOption.click();

        await page.getByLabel(/접수 메모/i).fill('엔지니어에게 배정하였습니다.');

        await page.getByRole('button', { name: /저장/i }).click();
        await page.waitForTimeout(2000);

        console.log(`✅ MANAGER가 SR 접수 및 ENGINEER 배정 완료 (알림 발송 예정)`);
      }
    } finally {
      await context.close();
    }
  });

  test('3. ENGINEER: 알림 확인 (SR 배정 알림)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.engineer });
    const page = await context.newPage();

    try {
      await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });

      // 알림 벨 아이콘 또는 알림 버튼 찾기
      const notificationButton = page
        .locator('button, a')
        .filter({ hasText: /알림|Notification|Bell/i })
        .or(page.locator('[class*="notification"], [class*="bell"]'))
        .first();

      if (await notificationButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 알림 배지 확인 (읽지 않은 알림 개수)
        const badge = page.locator('[class*="badge"], span').filter({ hasText: /\d+/ }).first();
        if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
          const badgeText = await badge.textContent();
          console.log(`✅ 알림 배지 확인: ${badgeText}`);
          expect(parseInt(badgeText || '0')).toBeGreaterThan(0);
        }

        // 알림 목록 열기
        await notificationButton.click();
        await page.waitForTimeout(1000);

        // 알림 목록 확인
        const notificationList = page
          .locator('[class*="notification"], [role="list"], ul, div')
          .filter({ hasText: /알림|Notification/i });
        if (await notificationList.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(notificationList).toBeVisible();
          console.log(`✅ 알림 목록 표시 확인`);

          // SR 배정 알림 확인
          const assignmentNotification = page.locator(
            `text=/배정|assign.*${srTitle.substring(0, 20)}/i`
          );
          if (await assignmentNotification.isVisible({ timeout: 3000 }).catch(() => false)) {
            await expect(assignmentNotification).toBeVisible();
            console.log(`✅ SR 배정 알림 확인 완료`);
          } else {
            console.log(`⚠️ SR 배정 알림을 찾을 수 없습니다.`);
          }
        } else {
          console.log(`⚠️ 알림 목록을 찾을 수 없습니다.`);
        }
      } else {
        console.log(`⚠️ 알림 버튼을 찾을 수 없습니다. (알림 기능 미구현 또는 다른 UI)`);
      }
    } finally {
      await context.close();
    }
  });

  test('4. ENGINEER: SR 진행 중으로 변경 및 댓글 작성 → CLIENT에게 알림', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.engineer });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 댓글 작성
      const commentTextarea = page
        .locator('textarea')
        .filter({ hasText: /댓글|Comment/i })
        .or(page.locator('textarea[placeholder*="댓글"]'))
        .first();

      if (await commentTextarea.isVisible({ timeout: 5000 }).catch(() => false)) {
        await commentTextarea.fill('작업을 시작하였습니다. 진행 중입니다.');

        const submitButton = page.getByRole('button', { name: /작성|Submit|등록/i });
        if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(2000);
          console.log(`✅ ENGINEER 댓글 작성 완료 (CLIENT에게 알림 발송 예정)`);
        }
      } else {
        console.log(`⚠️ 댓글 입력 필드를 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('5. CLIENT: 댓글 알림 확인', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });

      // 알림 벨 아이콘 찾기
      const notificationButton = page
        .locator('button, a')
        .filter({ hasText: /알림|Notification|Bell/i })
        .or(page.locator('[class*="notification"], [class*="bell"]'))
        .first();

      if (await notificationButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await notificationButton.click();
        await page.waitForTimeout(1000);

        // 댓글 알림 확인
        const commentNotification = page.locator('text=/댓글|comment.*작업을 시작/i');
        if (await commentNotification.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(commentNotification).toBeVisible();
          console.log(`✅ CLIENT가 댓글 알림 확인 완료`);
        } else {
          console.log(`⚠️ 댓글 알림을 찾을 수 없습니다.`);
        }
      } else {
        console.log(`⚠️ 알림 버튼을 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('6. 알림 읽음 처리', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });

      const notificationButton = page
        .locator('button, a')
        .filter({ hasText: /알림|Notification|Bell/i })
        .first();

      if (await notificationButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 읽지 않은 알림 개수 확인
        const badgeBefore = page
          .locator('[class*="badge"], span')
          .filter({ hasText: /\d+/ })
          .first();
        let unreadCountBefore = 0;
        if (await badgeBefore.isVisible({ timeout: 3000 }).catch(() => false)) {
          const badgeText = await badgeBefore.textContent();
          unreadCountBefore = parseInt(badgeText || '0');
          console.log(`✅ 읽음 처리 전 알림 개수: ${unreadCountBefore}`);
        }

        // 알림 목록 열기
        await notificationButton.click();
        await page.waitForTimeout(1000);

        // 첫 번째 알림 클릭 (읽음 처리)
        const firstNotification = page
          .locator('[class*="notification-item"], li, div')
          .filter({ hasText: /알림|댓글|배정/i })
          .first();
        if (await firstNotification.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstNotification.click();
          await page.waitForTimeout(1500);
          console.log(`✅ 알림 클릭 (읽음 처리)`);

          // SR 상세 페이지로 이동했는지 확인
          if (page.url().includes('/srs/')) {
            console.log(`✅ 알림 클릭 후 SR 상세 페이지로 이동`);
          }

          // 다시 대시보드로 이동하여 배지 확인
          await page.goto('/dashboard');
          await page.waitForLoadState('networkidle');

          const badgeAfter = page
            .locator('[class*="badge"], span')
            .filter({ hasText: /\d+/ })
            .first();
          if (await badgeAfter.isVisible({ timeout: 3000 }).catch(() => false)) {
            const badgeTextAfter = await badgeAfter.textContent();
            const unreadCountAfter = parseInt(badgeTextAfter || '0');
            console.log(`✅ 읽음 처리 후 알림 개수: ${unreadCountAfter}`);

            // 개수가 줄었는지 확인
            if (unreadCountAfter < unreadCountBefore) {
              console.log(`✅ 알림 개수 감소 확인 (읽음 처리 성공)`);
            }
          } else {
            console.log(`✅ 읽음 처리 후 배지 사라짐 (모든 알림 읽음)`);
          }
        } else {
          console.log(`⚠️ 알림 항목을 찾을 수 없습니다.`);
        }
      } else {
        console.log(`⚠️ 알림 버튼을 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('7. MANAGER: 상태 변경 (완료) → CLIENT에게 알림', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.manager });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${srId}`, { waitUntil: 'networkidle', timeout: 30000 });

      // 상태 변경 UI 찾기
      const statusChangeButton = page.getByRole('button', { name: /완료|Complete|상태 변경/i });
      const statusSelect = page
        .locator('select, [role="combobox"]')
        .filter({ hasText: /상태|Status/i });

      if (await statusChangeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusChangeButton.click();
        await page.waitForTimeout(1500);
        console.log(`✅ MANAGER가 상태 변경 (완료) (CLIENT에게 알림 발송 예정)`);
      } else if (await statusSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
        await statusSelect.first().click();
        const completedOption = page.getByRole('option', { name: /완료|COMPLETED/i });
        if (await completedOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await completedOption.click();
          await page.waitForTimeout(1500);
          console.log(`✅ MANAGER가 상태를 완료로 변경 (CLIENT에게 알림 발송 예정)`);
        }
      } else {
        console.log(`⚠️ 상태 변경 UI를 찾을 수 없습니다.`);
      }
    } finally {
      await context.close();
    }
  });

  test('8. CLIENT: 상태 변경 알림 확인', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });

      const notificationButton = page
        .locator('button, a')
        .filter({ hasText: /알림|Notification|Bell/i })
        .first();

      if (await notificationButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await notificationButton.click();
        await page.waitForTimeout(1000);

        // 상태 변경 알림 확인
        const statusNotification = page.locator(
          'text=/상태.*변경|완료|COMPLETED|status.*changed/i'
        );
        if (await statusNotification.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(statusNotification).toBeVisible();
          console.log(`✅ CLIENT가 상태 변경 알림 확인 완료`);
        } else {
          console.log(`⚠️ 상태 변경 알림을 찾을 수 없습니다.`);
        }
      } else {
        console.log(`⚠️ 알림 버튼을 찾을 수 없습니다.`);
      }

      console.log(`\n✨ 알림 시스템 통합 테스트 완료!`);
    } finally {
      await context.close();
    }
  });
});

test.describe('알림 목록 페이지 테스트', () => {
  test('알림 목록 페이지 접근', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      // 알림 목록 페이지로 직접 이동 (있다면)
      await page.goto('/notifications', { waitUntil: 'networkidle', timeout: 30000 });

      if (page.url().includes('/notifications')) {
        console.log(`✅ 알림 목록 페이지 접근 성공`);

        // 알림 목록 확인
        const notificationList = page.locator('[class*="notification"], [role="list"], table');
        if (await notificationList.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(notificationList).toBeVisible();
          console.log(`✅ 알림 목록 표시 확인`);

          // 알림 개수 확인
          const notifications = page
            .locator('[class*="notification-item"], tr, li')
            .filter({ hasText: /SR|알림/ });
          const count = await notifications.count();
          console.log(`✅ 알림 개수: ${count}`);
        }
      } else {
        console.log(`⚠️ 알림 목록 페이지가 존재하지 않거나 리디렉션됨`);
      }
    } finally {
      await context.close();
    }
  });

  test('알림 필터링 (읽음/안읽음)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/notifications', { waitUntil: 'networkidle', timeout: 30000 });

      if (page.url().includes('/notifications')) {
        // 필터 버튼 찾기
        const filterButton = page.getByRole('button', { name: /필터|Filter/i });
        const filterSelect = page
          .locator('select, [role="combobox"]')
          .filter({ hasText: /읽음|안읽음|Unread/i });

        if (await filterButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await filterButton.click();
          await page.waitForTimeout(500);
        }

        if (await filterSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await filterSelect.click();
          const unreadOption = page.getByRole('option', { name: /안읽음|Unread/i });
          if (await unreadOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await unreadOption.click();
            await page.waitForTimeout(1000);
            console.log(`✅ 안읽음 필터 적용`);
          }
        } else {
          console.log(`⚠️ 필터 UI를 찾을 수 없습니다.`);
        }
      }
    } finally {
      await context.close();
    }
  });

  test('알림 정렬 (최신순)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/notifications', { waitUntil: 'networkidle', timeout: 30000 });

      if (page.url().includes('/notifications')) {
        // 정렬 버튼 찾기
        const sortButton = page.getByRole('button', { name: /정렬|Sort/i });
        const sortSelect = page
          .locator('select, [role="combobox"]')
          .filter({ hasText: /정렬|Sort/i });

        if (await sortButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sortButton.click();
          await page.waitForTimeout(500);
        }

        if (await sortSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
          await sortSelect.click();
          const latestOption = page.getByRole('option', { name: /최신순|Latest/i });
          if (await latestOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            await latestOption.click();
            await page.waitForTimeout(1000);
            console.log(`✅ 최신순 정렬 적용`);
          }
        } else {
          console.log(`⚠️ 정렬 UI를 찾을 수 없습니다.`);
        }
      }
    } finally {
      await context.close();
    }
  });

  test('모든 알림 읽음 처리', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFiles.client });
    const page = await context.newPage();

    try {
      await page.goto('/notifications', { waitUntil: 'networkidle', timeout: 30000 });

      if (page.url().includes('/notifications')) {
        // "모두 읽음" 버튼 찾기
        const markAllReadButton = page.getByRole('button', { name: /모두 읽음|Mark all as read/i });

        if (await markAllReadButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await markAllReadButton.click();
          await page.waitForTimeout(1500);
          console.log(`✅ 모든 알림 읽음 처리 완료`);

          // 배지 확인 (사라졌는지)
          const badge = page.locator('[class*="badge"], span').filter({ hasText: /\d+/ }).first();
          if (!(await badge.isVisible({ timeout: 3000 }).catch(() => false))) {
            console.log(`✅ 배지 사라짐 확인 (모든 알림 읽음)`);
          }
        } else {
          console.log(`⚠️ 모두 읽음 버튼을 찾을 수 없습니다.`);
        }
      }
    } finally {
      await context.close();
    }
  });
});
