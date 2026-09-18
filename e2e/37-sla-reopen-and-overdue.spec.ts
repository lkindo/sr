import { type Browser, expect, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from './fixtures/sr';
import { PERSONA_AUTH_FILES, type PersonaKey } from './helpers/auth-helpers';

/**
 * 한 번 완료된 SR 의 마감일(결정 D9)과 '지연 중' 지표(결정 D10) — 화면·API 에서 끝까지 확인한다.
 *
 * - D9: 재오픈된 SR 의 마감일은 재작업 당사자(배정 ENGINEER)가 옮길 수 없고, 운영 관리자가 사유와 함께
 *   조정하면 활동에 남되 사유는 고객에게 보이지 않는다.
 * - D10: 마감을 넘긴 진행 중 SR 이 대시보드 '지연 중' 카드와 /srs?overdue=1 목록에 같은 범위로 나온다.
 *
 * 세션은 chromium 프로젝트의 기본 storageState(ADMIN)다.
 */

const HOUR = 60 * 60 * 1000;

let reopened: SeededSR | undefined;
let overdue: SeededSR | undefined;

async function asPersona<T>(
  browser: Browser,
  persona: PersonaKey,
  run: (request: import('@playwright/test').APIRequestContext) => Promise<T>
): Promise<T> {
  const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES[persona] });
  try {
    return await run(context.request);
  } finally {
    await context.close();
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);

  reopened = await seedSR(browser, { stage: 'COMPLETED', title: 'D9 재오픈 마감일 E2E' });
  await asPersona(browser, 'admin', async (request) => {
    const response = await request.patch(`/api/srs/${reopened!.id}/status`, {
      data: { action: 'reopen', reason: 'E2E: 재작업 필요' },
    });
    expect(response.status(), `재오픈 준비 실패: ${await response.text()}`).toBe(200);
  });

  overdue = await seedSR(browser, { stage: 'IN_PROGRESS', title: 'D10 지연 중 E2E' });
  await asPersona(browser, 'admin', async (request) => {
    const response = await request.patch(`/api/srs/${overdue!.id}`, {
      data: {
        dueDate: new Date(Date.now() - 2 * HOUR).toISOString(),
        changeReason: 'E2E: 지연 상태 재현',
      },
    });
    expect(response.status(), `지연 준비 실패: ${await response.text()}`).toBe(200);
  });
});

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, [reopened?.id, overdue?.id]);
});

test.describe('한 번 완료된 SR 의 마감일(D9)', () => {
  test('재작업 당사자(배정 엔지니어)는 재오픈된 SR 의 마감일을 조정할 수 없다', async ({
    browser,
  }) => {
    // 본문은 컨텍스트를 닫기 전에 읽는다 — 닫힌 뒤에는 응답이 폐기된다.
    const { status, body } = await asPersona(browser, 'engineer', async (request) => {
      const response = await request.patch(`/api/srs/${reopened!.id}`, {
        data: {
          dueDate: new Date(Date.now() + 72 * HOUR).toISOString(),
          changeReason: '시간이 더 필요합니다',
        },
      });
      return { status: response.status(), body: await response.text() };
    });

    expect(status).toBe(403);
    expect(body).toContain('운영 관리자(ADMIN·MANAGER)만 조정할 수 있습니다');
  });

  test('운영 관리자가 조정하면 활동에 남고, 사유는 고객에게 보이지 않는다', async ({
    browser,
    request,
  }) => {
    const reason = 'E2E: 고객 요구 범위 확대';
    const response = await request.patch(`/api/srs/${reopened!.id}`, {
      data: { dueDate: new Date(Date.now() + 96 * HOUR).toISOString(), changeReason: reason },
    });
    expect(response.status(), `조정 실패: ${await response.text()}`).toBe(200);

    type Activity = { description: string; metadata?: { internalReason?: string } | null };
    const adjusted = (list: Activity[]) =>
      list.find((activity) => activity.description.startsWith('SLA 마감일 조정'));

    const internal = (await (
      await request.get(`/api/srs/${reopened!.id}/activities`)
    ).json()) as Activity[];
    expect(adjusted(internal)?.metadata?.internalReason).toBe(reason);

    const customerView = await asPersona(browser, 'client', async (clientRequest) => {
      const res = await clientRequest.get(`/api/srs/${reopened!.id}/activities`);
      expect(res.status()).toBe(200);
      return (await res.json()) as Activity[];
    });
    const seenByCustomer = adjusted(customerView);
    expect(seenByCustomer, '고객도 조정 사실은 본다').toBeTruthy();
    expect(seenByCustomer?.metadata?.internalReason).toBeUndefined();
  });
});

test.describe("'지연 중' 지표(D10)", () => {
  test('/srs?overdue=1 은 마감을 넘긴 진행 중 SR 을 보여 준다', async ({ page }) => {
    await page.goto('/srs?overdue=1');

    await expect(page.getByText(overdue!.srNumber).first()).toBeVisible({ timeout: 15_000 });
    // 빠른 필터가 켜진 상태로 보인다(같은 범위의 숫자).
    await expect(page.getByRole('button', { name: /^지연\s*\d+$/ })).toBeVisible();
  });

  test('대시보드의 지연 중 카드를 누르면 같은 범위의 목록으로 간다', async ({ page }) => {
    await page.goto('/dashboard');

    const card = page.getByRole('link', { name: '지연 중인 SR 목록 보기' });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();

    await expect(page).toHaveURL(/\/srs\?overdue=1/);
    await expect(page.getByText(overdue!.srNumber).first()).toBeVisible({ timeout: 15_000 });
  });
});
