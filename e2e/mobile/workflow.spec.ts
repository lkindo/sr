import { type BrowserContext, expect, type Page, test } from '@playwright/test';

import { ADMIN_PERSONA, LEGACY_PERSONAS, ROLE_PERSONAS } from '../helpers/auth-helpers';

import { cleanupMobileOutbox, findMobileRunRequests } from './cleanup';
import { assertDialogFits, assertViewport, chooseTheme, login } from './helpers';

const clientPersona = LEGACY_PERSONAS.find((persona) => persona.name === 'client')!;
const engineerPersona = LEGACY_PERSONAS.find((persona) => persona.name === 'engineer')!;
const managerPersona = ROLE_PERSONAS.find((persona) => persona.name === 'manager')!;
const attachmentName = 'mobile-workflow-evidence.txt';
const attachmentBody = 'Mobile workflow attachment: synthetic test content only.';

async function detail(page: Page, id: string, status: string) {
  // An open detail screen receives real SSE updates. A second document navigation can
  // race that refresh in WebKit; observe the user-visible update instead.
  if (new URL(page.url()).pathname !== `/srs/${id}`) await page.goto(`/srs/${id}`);
  await expect(page.getByTestId('sr-status-badge')).toHaveText(status);
  const states: Record<string, string> = {
    요청됨: 'REQUESTED',
    접수: 'INTAKE',
    진행중: 'IN_PROGRESS',
    보류: 'ON_HOLD',
    완료: 'COMPLETED',
    확인완료: 'CONFIRMED',
    거절: 'REJECTED',
  };
  const persisted = await page.request.get(`/api/srs/${id}`);
  expect(persisted.ok()).toBe(true);
  expect((await persisted.json()).status).toBe(states[status]);
  await assertViewport(page);
}

async function createRequest(page: Page, title: string, created: string[]) {
  await page.goto('/srs');
  await page.getByRole('button', { name: /등록/ }).first().click();
  const dialog = page.getByRole('dialog', { name: '새 SR 요청' });
  await assertDialogFits(page, dialog);
  await dialog.getByLabel('제목 *', { exact: true }).fill(title);
  await dialog
    .getByLabel('설명 *', { exact: true })
    .fill('모바일에서 등록한 검증 전용 요청입니다. 기존 업무 데이터와 관계없습니다.');
  await dialog.getByRole('combobox', { name: '서비스 카테고리 *', exact: true }).click();
  await page.getByRole('option').first().click();
  await dialog
    .getByLabel('희망 완료일 (선택)', { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  await dialog.locator('input[type="file"]').setInputFiles({
    name: attachmentName,
    mimeType: 'text/plain',
    buffer: Buffer.from(attachmentBody),
  });
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  // SR creation uses a Server Action. Resolve its persisted ID without bypassing the UI.
  await expect
    .poll(async () => {
      const response = await page.request.get(
        '/api/srs?pageSize=100&sortBy=createdAt&sortOrder=desc'
      );
      expect(response.ok()).toBe(true);
      const body = await response.json();
      const record = body.data.find((sr: { title: string }) => sr.title === title);
      if (record && !created.includes(record.id)) created.push(record.id);
      return Boolean(record);
    })
    .toBe(true);
  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: title, exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/srs/${created.at(-1)}$`));
  return created.at(-1)!;
}

async function statusDialog(
  page: Page,
  id: string,
  action: string,
  submit: string,
  reason: string,
  date?: string
) {
  await page.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await assertDialogFits(page, dialog);
  await dialog.locator('#sr-status-reason').fill(reason);
  if (date) await dialog.locator('#sr-status-date').fill(date);
  const response = page.waitForResponse(
    (result) =>
      result.url().endsWith(`/api/srs/${id}/status`) && result.request().method() === 'PATCH'
  );
  await dialog.getByRole('button', { name: submit, exact: true }).click();
  expect((await response).ok()).toBe(true);
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/srs$/);
}

async function directStatus(page: Page, id: string, action: string) {
  const response = page.waitForResponse(
    (result) =>
      result.url().endsWith(`/api/srs/${id}/status`) && result.request().method() === 'PATCH'
  );
  await page.getByRole('button', { name: action, exact: true }).click();
  expect((await response).ok()).toBe(true);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: 고객 등록부터 접수·작업·보류·완료 확인·재오픈 및 거절까지 모바일 업무 흐름`, async ({
    browser,
  }, testInfo) => {
    const contexts: BrowserContext[] = [];
    const created: string[] = [];
    const prefix = `MOBILE-E2E-${Date.now()}-${testInfo.project.name}-${theme}`;
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
      page.setDefaultTimeout(15_000);
      page.setDefaultNavigationTimeout(60_000);
      await login(page, persona);
      await chooseTheme(page, theme);
      return page;
    }
    const admin = await actor(ADMIN_PERSONA);
    try {
      const client = await actor(clientPersona);
      const manager = await actor(managerPersona);
      const engineer = await actor(engineerPersona);
      let id = '';
      await test.step('고객: 파일 첨부 등록 → 목록 → 상세 → 접수 전 수정', async () => {
        id = await createRequest(client, prefix, created);
        await detail(client, id, '요청됨');
        await expect(client.getByRole('button', { name: '접수하기', exact: true })).toHaveCount(0);
        await client.getByRole('button', { name: '수정', exact: true }).click();
        const dialog = client.getByRole('dialog');
        await dialog
          .getByLabel('설명 *', { exact: true })
          .fill('모바일 고객이 접수 전에 요청 상세 내용을 수정했습니다. 첨부파일도 확인해주세요.');
        await dialog.getByRole('button', { name: '저장', exact: true }).click();
        await expect(dialog).toBeHidden();
        await expect(
          client.getByText(
            '모바일 고객이 접수 전에 요청 상세 내용을 수정했습니다. 첨부파일도 확인해주세요.',
            { exact: true }
          )
        ).toBeVisible();
        await client.getByRole('tab', { name: /첨부파일/ }).click();
        const downloaded = client.waitForEvent('download');
        await client
          .getByRole('button', { name: `${attachmentName} 다운로드`, exact: true })
          .click();
        const download = await downloaded;
        expect(download.suggestedFilename()).toBe(attachmentName);
        expect(await download.failure()).toBeNull();
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks).toString()).toBe(attachmentBody);
        const extraFile = 'mobile-added-then-removed.txt';
        const upload = client.waitForResponse(
          (response) =>
            response.url().endsWith('/api/attachments') && response.request().method() === 'POST'
        );
        await client.locator('#file-upload').setInputFiles({
          name: extraFile,
          mimeType: 'text/plain',
          buffer: Buffer.from('Temporary mobile attachment'),
        });
        expect((await upload).ok()).toBe(true);
        await client.getByRole('button', { name: `${extraFile} 삭제`, exact: true }).click();
        const confirmation = client.getByRole('alertdialog');
        await assertDialogFits(client, confirmation);
        await confirmation.getByRole('button', { name: '삭제', exact: true }).click();
        await expect(
          client.getByRole('button', { name: `${extraFile} 다운로드`, exact: true })
        ).toHaveCount(0);
        await expect(
          client.getByRole('button', { name: `${attachmentName} 다운로드`, exact: true })
        ).toBeVisible();
      });
      await test.step('MANAGER: 우선순위·예정일·작업 시간·엔지니어 배정 후 접수', async () => {
        await detail(manager, id, '요청됨');
        await manager.getByRole('button', { name: '접수하기', exact: true }).click();
        await expect(
          manager.getByRole('heading', { name: 'SR 접수 처리', exact: true })
        ).toBeVisible();
        await assertViewport(manager);
        await manager.getByRole('combobox', { name: '실제 우선순위 *', exact: true }).click();
        await manager.getByRole('option', { name: /높음 \(HIGH\)/ }).click();
        await manager.getByLabel(/예상 작업 시간/).fill('8');
        await manager.getByRole('combobox', { name: '담당자 *', exact: true }).click();
        await manager.getByRole('option').filter({ hasText: engineerPersona.email }).click();
        await manager
          .getByLabel(/접수 메모/)
          .fill('모바일 접수 검증: 고객 영향과 조치 순서를 확인했습니다.');
        const intake = manager.waitForResponse(
          (result) =>
            result.url().endsWith(`/api/srs/${id}/intake`) && result.request().method() === 'POST'
        );
        await manager.getByRole('button', { name: '저장', exact: true }).click();
        expect((await intake).ok()).toBe(true);
        await expect(manager).toHaveURL(/\/srs$/);
        const savedIntake = await manager.request.get(`/api/srs/${id}`);
        expect(savedIntake.ok()).toBe(true);
        const intakeValues = await savedIntake.json();
        expect(intakeValues.actualPriority).toBe('HIGH');
        expect(Number(intakeValues.estimatedHours)).toBe(8);
        expect(intakeValues.estimatedCompletionDate).toBeTruthy();
        expect(intakeValues.assignee.email).toBe(engineerPersona.email);
        await detail(client, id, '접수');
        await expect(client.getByRole('button', { name: '수정', exact: true })).toBeDisabled();
      });
      await test.step('ENGINEER: 공개 댓글·내부 노트·오류 후 재시도·진행 시작', async () => {
        await detail(engineer, id, '접수');
        await engineer
          .getByRole('textbox', { name: '댓글 작성', exact: true })
          .fill('모바일에서 접수 내역을 확인했습니다. 작업을 시작합니다.');
        await engineer.getByRole('button', { name: '댓글 추가', exact: true }).click();
        await expect(
          engineer.getByRole('listitem').filter({ hasText: '모바일에서 접수 내역을 확인했습니다.' })
        ).toBeVisible();
        await engineer.locator('#sr-comment-internal').check();
        await engineer
          .getByRole('textbox', { name: '댓글 작성', exact: true })
          .fill(`${prefix} 내부 검토 내용`);
        await engineer.getByRole('button', { name: '내부 노트 추가', exact: true }).click();
        await expect(
          engineer.getByRole('listitem').filter({ hasText: `${prefix} 내부 검토 내용` })
        ).toBeVisible();
        await engineer.setViewportSize({ width: 320, height: 568 });
        await assertViewport(engineer);
        await engineer.setViewportSize(use.viewport!);
        await detail(client, id, '접수');
        await client.getByRole('tab', { name: /댓글/ }).click();
        await expect(
          client.getByRole('listitem').filter({ hasText: '모바일에서 접수 내역을 확인했습니다.' })
        ).toBeVisible();
        await expect(client.getByText(`${prefix} 내부 검토 내용`, { exact: true })).toHaveCount(0);
        await expect(client.locator('#sr-comment-internal')).toHaveCount(0);
        // WebKit requests controlled by a service worker bypass Playwright routing.
        // Inject one failed fetch response while keeping the real service worker active.
        await client.evaluate((srId) => {
          const originalFetch = window.fetch;
          window.fetch = async (input, init) => {
            const path = new URL(
              input instanceof Request ? input.url : String(input),
              location.href
            ).pathname;
            const method = init?.method || (input instanceof Request ? input.method : 'GET');
            if (path === `/api/srs/${srId}/comments` && method === 'POST') {
              window.fetch = originalFetch;
              return new Response(JSON.stringify({ error: '모바일 테스트: 일시적 연결 오류' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              });
            }
            return originalFetch(input, init);
          };
        }, id);
        const comment = client.getByRole('textbox', { name: '댓글 작성', exact: true });
        await comment.fill('고객 확인 요청입니다. 연결 오류 이후에도 입력을 유지해주세요.');
        await client.getByRole('button', { name: '댓글 추가', exact: true }).click();
        await expect(
          client.getByText('모바일 테스트: 일시적 연결 오류', { exact: true })
        ).toBeVisible();
        await expect(comment).toHaveValue(
          '고객 확인 요청입니다. 연결 오류 이후에도 입력을 유지해주세요.'
        );
        await expect(client.getByRole('button', { name: '댓글 추가', exact: true })).toBeEnabled();
        await expect(
          client
            .getByRole('listitem')
            .filter({ hasText: '고객 확인 요청입니다. 연결 오류 이후에도 입력을 유지해주세요.' })
        ).toHaveCount(0);
        await client.getByRole('button', { name: '댓글 추가', exact: true }).click();
        await expect(
          client
            .getByRole('listitem')
            .filter({ hasText: '고객 확인 요청입니다. 연결 오류 이후에도 입력을 유지해주세요.' })
        ).toBeVisible();
        await directStatus(engineer, id, '진행 시작');
      });
      await test.step('보류 필수값 차단 → 낮은 화면 높이에서 보류 저장 → 재개', async () => {
        await detail(engineer, id, '진행중');
        await engineer.setViewportSize({ width: 390, height: 360 });
        await engineer.getByRole('button', { name: '보류', exact: true }).click();
        const dialog = engineer.getByRole('dialog');
        await assertDialogFits(engineer, dialog);
        await dialog.getByRole('button', { name: '보류 처리', exact: true }).click();
        await expect(dialog).toBeVisible();
        await expect(engineer.getByTestId('sr-status-badge')).toHaveText('진행중');
        await dialog.locator('#sr-status-reason').fill('고객의 추가 자료 확인을 기다립니다.');
        const release = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
        await dialog.locator('#sr-status-date').fill(release);
        const held = engineer.waitForResponse(
          (result) =>
            result.url().endsWith(`/api/srs/${id}/status`) && result.request().method() === 'PATCH'
        );
        await dialog.getByRole('button', { name: '보류 처리', exact: true }).click();
        expect((await held).ok()).toBe(true);
        await expect(engineer).toHaveURL(/\/srs$/);
        await engineer.setViewportSize(use.viewport!);
        await detail(engineer, id, '보류');
        await directStatus(engineer, id, '진행 재개');
      });
      await test.step('엔지니어 완료 → 고객 해결 내용 확인 → 고객 인수 → 재오픈 → 재완료', async () => {
        await detail(engineer, id, '진행중');
        const resolution =
          '모바일 검증: 장애 원인을 수정하고 고객 화면에서 정상 동작을 확인했습니다.';
        await statusDialog(engineer, id, '완료 처리', '완료 처리', resolution);
        await detail(engineer, id, '완료');
        await expect(engineer.getByRole('button', { name: '확인 완료', exact: true })).toHaveCount(
          0
        );
        await detail(client, id, '완료');
        await expect(client.getByText(resolution, { exact: true }).first()).toBeVisible();
        await directStatus(client, id, '확인 완료');
        await detail(client, id, '확인완료');
        await statusDialog(
          client,
          id,
          '재오픈',
          '재오픈',
          '모바일 재확인 중 추가 문제가 발견되어 재작업을 요청합니다.'
        );
        await detail(engineer, id, '진행중');
        await statusDialog(
          engineer,
          id,
          '완료 처리',
          '완료 처리',
          '추가 문제를 해결하고 재작업 결과를 확인했습니다.'
        );
        await detail(client, id, '완료');
        await directStatus(client, id, '확인 완료');
        await detail(client, id, '확인완료');
        await client.getByRole('tab', { name: /활동 이력/ }).click();
        await expect(client.getByRole('tabpanel')).toContainText('재오픈');
        await assertViewport(client);
        await client.screenshot({
          path: testInfo.outputPath(`workflow-${theme}-confirmed.png`),
          fullPage: true,
        });
      });
      await test.step('별도 고객 요청 → 관리자 거절 → 고객에게 거절 사유 전달', async () => {
        const rejectedId = await createRequest(client, `${prefix}-REJECT`, created);
        await detail(manager, rejectedId, '요청됨');
        const rejection = '모바일 검증용 거절: 중복 접수 건이므로 원래 요청에서 처리합니다.';
        await statusDialog(manager, rejectedId, '거절', '거절 처리', rejection);
        await detail(client, rejectedId, '거절');
        await expect(client.getByText(rejection, { exact: true }).first()).toBeVisible();
      });
    } catch (error) {
      for (const [index, context] of contexts.entries()) {
        const page = context.pages()[0];
        if (page && !page.isClosed()) {
          await page
            .screenshot({
              path: testInfo.outputPath(`before-cleanup-${index}.png`),
              fullPage: true,
            })
            .catch(() => undefined);
        }
      }
      throw error;
    } finally {
      // Delete only records created by this run, after verifying their unique marker.
      const cleanupErrors: unknown[] = [];
      try {
        // Creation can succeed even when its following list request fails. Recover that ID
        // from this run's exact marker and creation window before cleaning its records.
        for (const record of await findMobileRunRequests(prefix)) {
          if (!created.includes(record.id)) created.push(record.id);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
      for (const id of created) {
        try {
          const response = await admin.request.get(`/api/srs/${id}`);
          expect(response.ok()).toBe(true);
          const sr = await response.json();
          expect(sr.title === prefix || sr.title === `${prefix}-REJECT`).toBe(true);
          const removed = await admin.request.delete(`/api/srs/${id}`);
          expect(removed.ok(), 'Cleanup of the newly created mobile test SR').toBe(true);
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
      expect(
        cleanupErrors,
        'All synthetic SRs and unsent test notifications must be cleaned'
      ).toEqual([]);
    }
  });
}
