import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import { ADMIN_PERSONA, LEGACY_PERSONAS, ROLE_PERSONAS } from '../helpers/auth-helpers';

import { assertLocalMobileDatabase, cleanupMobileOutbox, findMobileRunRequests } from './cleanup';
import { assertDialogFits, assertViewport, login } from './helpers';

const clientPersona = LEGACY_PERSONAS.find((persona) => persona.name === 'client')!;
const managerPersona = ROLE_PERSONAS.find((persona) => persona.name === 'manager')!;
const engineerPersona = LEGACY_PERSONAS.find((persona) => persona.name === 'engineer')!;

function nextMonthDate(day: number) {
  const nowInKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(nowInKst.getUTCFullYear(), nowInKst.getUTCMonth() + 1, day));
  return {
    iso: date.toISOString().slice(0, 10),
    label: `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${day}일`,
  };
}

async function chooseCompletionDate(page: Page, day: number) {
  const target = nextMonthDate(day);
  const trigger = page.getByLabel('예상 완료일 *', { exact: true });
  await trigger.click();
  const calendar = page.locator('[data-slot="calendar"]');
  await assertDialogFits(page, calendar);
  await calendar.getByRole('button', { name: 'Go to the Next Month', exact: true }).click();
  const dateCell = calendar.locator(`[role="gridcell"][data-day="${target.iso}"]`);
  await dateCell.getByRole('button').click();
  await expect(dateCell).toHaveAttribute('aria-selected', 'true');
  await assertViewport(page);
  await page.getByRole('heading', { name: '접수 정보 입력', exact: true }).click();
  await expect(calendar).toBeHidden();
  await expect(trigger).toHaveText(target.label);
  return target;
}

async function saveIntake(page: Page, id: string, method: 'POST' | 'PATCH') {
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/srs/${id}/intake`) && response.request().method() === method
  );
  await page.getByRole('button', { name: '저장', exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page).toHaveURL(/\/srs$/);
}

async function readSR(page: Page, id: string) {
  const response = await page.request.get(`/api/srs/${id}`, { maxRetries: 2 }).catch(() => {
    // APIRequestContext network errors include request headers; keep credentials out of reports.
    throw new Error('The saved mobile test request could not be read after connection retries.');
  });
  expect(response.status()).toBe(200);
  return response.json();
}

test('light: 모바일 접수 달력 선택·접수 수정·마감일 조정과 고객 권한', async ({
  browser,
}, testInfo) => {
  assertLocalMobileDatabase();
  const contexts: BrowserContext[] = [];
  const created: string[] = [];
  const prefix = `MOBILE-E2E-${Date.now()}-${testInfo.project.name}-intake-light`;
  const use = testInfo.project.use;
  async function actor(persona: typeof ADMIN_PERSONA) {
    const context = await browser.newContext({
      baseURL: use.baseURL,
      viewport: use.viewport,
      userAgent: use.userAgent,
      deviceScaleFactor: use.deviceScaleFactor,
      isMobile: use.isMobile,
      hasTouch: use.hasTouch,
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
    });
    contexts.push(context);
    const page = await context.newPage();
    await login(page, persona);
    return page;
  }

  const admin = await actor(ADMIN_PERSONA);
  try {
    const client = await actor(clientPersona);
    const manager = await actor(managerPersona);
    let id = '';

    await test.step('고객이 새 요청을 등록한다', async () => {
      await client.goto('/srs');
      await client.getByRole('button', { name: /등록/ }).first().click();
      const dialog = client.getByRole('dialog', { name: '새 SR 요청' });
      await assertDialogFits(client, dialog);
      await dialog.getByLabel('제목 *', { exact: true }).fill(prefix);
      await dialog
        .getByLabel('설명 *', { exact: true })
        .fill('모바일 일정 변경 검증만을 위한 신규 요청입니다. 기존 업무 자료와 관계없습니다.');
      await dialog.getByRole('combobox', { name: '서비스 카테고리 *', exact: true }).click();
      await client.getByRole('option').first().click();
      await dialog.getByRole('button', { name: '저장', exact: true }).click();
      await expect
        .poll(async () => {
          const response = await client.request.get(
            '/api/srs?pageSize=100&sortBy=createdAt&sortOrder=desc'
          );
          expect(response.ok()).toBe(true);
          const body = await response.json();
          const row = body.data.find((sr: { title: string }) => sr.title === prefix);
          if (row && !created.includes(row.id)) created.push(row.id);
          return Boolean(row);
        })
        .toBe(true);
      id = created[0]!;
      await expect(dialog).toBeHidden();
    });

    await test.step('관리자가 달력으로 예상 완료일을 선택하고 접수한다', async () => {
      await manager.goto(`/srs/${id}`);
      await expect(manager.getByTestId('sr-status-badge')).toHaveText('요청됨');
      await manager.getByRole('button', { name: '접수하기', exact: true }).click();
      await expect(
        manager.getByRole('heading', { name: 'SR 접수 처리', exact: true })
      ).toBeVisible();
      await assertViewport(manager);
      await manager.getByLabel(/예상 작업 시간/).fill('0');
      await manager.getByRole('button', { name: '저장', exact: true }).click();
      await expect(
        manager.getByText('예상 작업 시간은 0보다 커야 합니다', { exact: true })
      ).toBeVisible();
      await manager.getByLabel(/예상 작업 시간/).fill('8');
      await expect(manager.getByLabel(/예상 작업 시간/)).toHaveValue('8');
      const selected = await chooseCompletionDate(manager, 15);
      await expect(manager.getByLabel(/예상 작업 시간/)).toHaveValue('8');
      await manager.getByRole('combobox', { name: '담당자 *', exact: true }).click();
      await manager.getByRole('option').filter({ hasText: engineerPersona.email }).click();
      await expect(manager.getByLabel(/예상 작업 시간/)).toHaveValue('8');
      await manager
        .getByLabel(/접수 메모/)
        .fill('모바일 달력에서 고객과 협의한 예상 완료일을 선택했습니다.');
      await expect(manager.getByLabel(/예상 작업 시간/)).toHaveValue('8');
      await saveIntake(manager, id, 'POST');
      const saved = await readSR(manager, id);
      expect(saved.status).toBe('INTAKE');
      expect(new Date(saved.estimatedCompletionDate).getTime()).toBe(
        new Date(`${selected.iso}T00:00:00+09:00`).getTime()
      );
      expect(Number(saved.estimatedHours)).toBe(8);
    });

    await test.step('상세에서 접수 정보를 다시 열어 예정일·시간·메모를 수정한다', async () => {
      await manager.goto(`/srs/${id}`);
      await manager.getByRole('button', { name: '접수 정보 수정', exact: true }).click();
      await expect(
        manager.getByRole('heading', { name: 'SR 접수 정보 수정', exact: true })
      ).toBeVisible();
      await expect(manager.getByLabel('예상 완료일 *', { exact: true })).toHaveText(
        nextMonthDate(15).label
      );
      await expect(manager.getByLabel(/예상 작업 시간/)).toHaveValue('8');
      const selected = await chooseCompletionDate(manager, 20);
      await manager.getByLabel(/예상 작업 시간/).fill('12.5');
      await manager
        .getByLabel(/접수 메모/)
        .fill('모바일에서 협의한 일정과 예상 작업 시간을 다시 반영했습니다.');
      await saveIntake(manager, id, 'PATCH');
      const saved = await readSR(manager, id);
      expect(new Date(saved.estimatedCompletionDate).getTime()).toBe(
        new Date(`${selected.iso}T00:00:00+09:00`).getTime()
      );
      expect(Number(saved.estimatedHours)).toBe(12.5);
      expect(saved.intakeNotes).toBe(
        '모바일에서 협의한 일정과 예상 작업 시간을 다시 반영했습니다.'
      );
    });

    const adjusted = `${nextMonthDate(25).iso}T09:30`;
    const expectedDueDate = new Date(`${adjusted}:00+09:00`).toISOString();
    await test.step('고객은 운영 일정 수정이 차단되고 기존 마감일이 유지된다', async () => {
      await client.goto(`/srs/${id}`);
      await expect(client.getByTestId('sr-status-badge')).toHaveText('접수');
      await expect(client.getByRole('button', { name: '접수 정보 수정', exact: true })).toHaveCount(
        0
      );
      await expect(client.getByRole('button', { name: '조정', exact: true })).toHaveCount(0);
      const before = await readSR(client, id);
      const denied = await client.request.patch(`/api/srs/${id}`, {
        data: { dueDate: expectedDueDate, changeReason: '모바일 권한 차단 검증' },
      });
      expect(denied.status()).toBe(403);
      expect((await readSR(client, id)).dueDate).toBe(before.dueDate);
      // Probe the forbidden URL in the same authenticated context without replacing
      // the customer's live detail page with a route they cannot use.
      const forbiddenPage = await client.context().newPage();
      try {
        await forbiddenPage.goto(`/srs/${id}/intake`);
        await expect(
          forbiddenPage.getByText('SR 접수 처리 권한이 없습니다.', { exact: true })
        ).toBeVisible();
        await expect(forbiddenPage.getByRole('button', { name: '저장', exact: true })).toHaveCount(
          0
        );
        await assertViewport(forbiddenPage);
      } finally {
        await forbiddenPage.close();
      }
    });

    await test.step('관리자가 사유를 입력하여 마감일을 조정하고 우선순위 변경 후에도 유지한다', async () => {
      await manager.goto(`/srs/${id}`);
      await manager.getByRole('button', { name: '조정', exact: true }).click();
      const dialog = manager.getByRole('dialog', { name: '마감일 조정', exact: true });
      await assertDialogFits(manager, dialog);
      await dialog.locator('#sr-due-date').fill(adjusted);
      await expect(dialog.getByRole('button', { name: '마감일 조정', exact: true })).toBeDisabled();
      await dialog
        .locator('#sr-due-date-reason')
        .fill('모바일 일정 검증: 고객과 협의한 마감 시각으로 조정합니다.');
      const changed = manager.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/srs/${id}`) && response.request().method() === 'PATCH'
      );
      await dialog.getByRole('button', { name: '마감일 조정', exact: true }).click();
      expect((await changed).status()).toBe(200);
      await expect(dialog).toBeHidden();
      await expect(manager.getByText('직접 지정', { exact: true })).toBeVisible();
      const saved = await readSR(manager, id);
      expect(saved.dueDate).toBe(expectedDueDate);
      expect(saved.dueDateManual).toBe(true);

      await manager.getByRole('button', { name: '접수 정보 수정', exact: true }).click();
      await expect(
        manager.getByRole('heading', { name: 'SR 접수 정보 수정', exact: true })
      ).toBeVisible();
      await manager.getByRole('combobox', { name: '실제 우선순위 *', exact: true }).click();
      await manager.getByRole('option', { name: /긴급 \(CRITICAL\)/ }).click();
      await saveIntake(manager, id, 'PATCH');
      const after = await readSR(manager, id);
      expect(after.actualPriority).toBe('CRITICAL');
      expect(after.dueDate).toBe(expectedDueDate);
      expect(after.dueDateManual).toBe(true);
      // Keep the customer's detail open and observe SSE updates. A document navigation
      // here races the refresh triggered by the manager's update in WebKit.
      await expect(client.getByText('직접 지정', { exact: true })).toBeVisible();
      await expect(client.getByTestId('sr-due-date')).toContainText('09:30');
      await assertViewport(client);
    });
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      for (const record of await findMobileRunRequests(prefix)) {
        if (!created.includes(record.id)) created.push(record.id);
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    for (const id of created) {
      try {
        const record = await readSR(admin, id);
        expect(record.title).toBe(prefix);
        expect((await admin.request.delete(`/api/srs/${id}`)).ok()).toBe(true);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await cleanupMobileOutbox(created, prefix);
    } catch (error) {
      cleanupErrors.push(error);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
    expect(cleanupErrors, 'Synthetic requests and their unsent emails must be cleaned').toEqual([]);
  }
});
