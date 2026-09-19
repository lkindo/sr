import { expect, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from './fixtures/sr';

/**
 * SLA 마감일 수동 조정 — 화면의 '마감일 조정' 다이얼로그부터 DB 까지 (헌법 §3, 소유자 결정 D8).
 *
 * ── 왜 이 파일이 필요한가 ────────────────────────────────────────────────
 * D8 을 구현할 때 서비스 테스트는 `srService.updateSR` 를 직접 불렀고, 다이얼로그 테스트는 fetch 를
 * 목으로 바꿨다. 둘 다 초록불이었는데 실제로는 **어느 경로로도 조정이 되지 않았다** — 일반 PATCH
 * 스키마(`srPatchSchema`)가 `changeReason` 을 빼고 `.strict()` 라서 다이얼로그의 `{dueDate, changeReason}`
 * 이 알 수 없는 키로 400 이 됐고, 사유를 빼면 서비스가 "사유 필수" 로 거부했다. 층마다 따로 검증하면
 * 층 사이의 계약이 비어 있어도 모른다. 이 파일은 버튼 → 다이얼로그 → 라우트 → 서비스 → DB 를 한 번에 본다.
 *
 * 세션은 chromium 프로젝트의 기본 storageState(ADMIN)다.
 */

/** 실행 시점 기준 `daysAhead` 일 뒤 09:00(KST)의 datetime-local 값. 다이얼로그는 KST 로 받는다. */
function kstDateTimeLocal(daysAhead: number): string {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  kstNow.setUTCDate(kstNow.getUTCDate() + daysAhead);
  return `${kstNow.toISOString().slice(0, 10)}T09:00`;
}

let sr: SeededSR | undefined;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  sr = await seedSR(browser, { stage: 'IN_PROGRESS', title: '마감일 수동 조정 E2E' });
});

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, [sr?.id]);
});

test.describe('SLA 마감일 수동 조정', () => {
  test('사유 없이 마감일만 보내면 거부되고 마감일은 그대로다', async ({ request }) => {
    const before = (await (await request.get(`/api/srs/${sr!.id}`)).json()) as { dueDate: string };

    const response = await request.patch(`/api/srs/${sr!.id}`, {
      data: { dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() },
    });
    expect(response.ok(), `사유 없는 조정이 통과했습니다. 응답: ${await response.text()}`).toBe(
      false
    );
    expect(await response.text()).toContain('조정 사유를 입력해야 합니다');

    const after = (await (await request.get(`/api/srs/${sr!.id}`)).json()) as { dueDate: string };
    expect(after.dueDate, '거부됐는데 마감일이 바뀌었습니다.').toBe(before.dueDate);
  });

  test('다이얼로그로 조정하면 마감일이 바뀌고 직접 지정 표식이 붙는다', async ({
    page,
    request,
  }) => {
    const target = kstDateTimeLocal(10);
    const reason = 'E2E: 고객 요청으로 일정 협의';

    await page.goto(`/srs/${sr!.id}`);
    await page.getByRole('button', { name: '조정', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '마감일 조정' })).toBeVisible();

    await page.locator('#sr-due-date').fill(target);
    await page.locator('#sr-due-date-reason').fill(reason);

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith(`/api/srs/${sr!.id}`) && res.request().method() === 'PATCH'
      ),
      page.getByRole('button', { name: '마감일 조정' }).click(),
    ]);
    expect(response.status(), `조정 요청이 거부됐습니다. 응답: ${await response.text()}`).toBe(200);
    await expect(page.getByRole('dialog', { name: '마감일 조정' })).toBeHidden();

    const saved = (await (await request.get(`/api/srs/${sr!.id}`)).json()) as {
      dueDate: string;
      dueDateManual: boolean;
    };
    expect(saved.dueDateManual, '직접 지정 표식(due_date_manual)이 붙지 않았습니다.').toBe(true);
    expect(
      new Date(saved.dueDate).getTime(),
      '입력한 시각(KST)이 그대로 저장되지 않았습니다.'
    ).toBe(new Date(`${target}:00+09:00`).getTime());
  });
});
