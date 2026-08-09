import { type Browser, expect, type Page, test } from '@playwright/test';

import { deleteSeededSRs, type SeededSR, seedSR } from './fixtures/sr';
import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * SR 활동 이력 · 상태 변경 이력.
 *
 * ── 이 파일의 내력 ───────────────────────────────────────────────────────
 * 예전의 이 스펙은 세 테스트 전부가 "있으면 확인, 없으면 로그" 였다:
 *   - 활동 항목 수를 세고 `toBeGreaterThanOrEqual(0)` — 개수는 언제나 0 이상이라 항상 참
 *   - 타임라인이 안 보이면 else 로 빠져 통과
 *   - 필터가 없으면 통과 (그리고 **필터는 애초에 존재하지 않는다**)
 * 즉 활동 이력 기능이 통째로 사라져도 세 테스트가 모두 초록불이었다. 실제로
 * 라벨 매핑이 깨져 화면에 "ATTACHMENT_ADDED" 같은 영문 enum 이 찍히고 있었는데도
 * 아무것도 잡지 못했다.
 *
 * ── 무엇을 계약으로 삼는가 ────────────────────────────────────────────────
 * 활동은 **행위의 결과로 생긴다.** 목록 첫 행을 클릭해 "뭐가 있나" 보는 대신,
 * 상태를 아는 SR 을 시드로 만들어(REQUESTED → INTAKE 로 전이) 그 전이가 남긴
 * 활동과 상태 이력을 정확히 단언한다. 그래야 개수와 라벨을 숫자로 못박을 수 있다.
 *
 * ⚠️ networkidle 금지 — 로그인 상태에서는 /api/realtime SSE 가 계속 열려 있어
 * "500ms 동안 요청 0건" 이 영원히 성립하지 않는다.
 */

/** 활동 API 응답에서 이 스펙이 쓰는 필드. */
interface ActivityRow {
  id: string;
  type: string;
  description: string;
}

const seededSRIds: string[] = [];

async function seed(browser: Browser, stage: 'REQUESTED' | 'INTAKE'): Promise<SeededSR> {
  const sr = await seedSR(browser, { stage, title: `활동 이력 SR ${Date.now()}` });
  seededSRIds.push(sr.id);
  return sr;
}

test.afterAll(async ({ browser }) => {
  await deleteSeededSRs(browser, seededSRIds);
});

/** 상세를 열고 활동 이력 탭까지 이동한다. 탭 콘텐츠는 선택될 때 마운트된다. */
async function openActivityTab(page: Page, sr: SeededSR): Promise<void> {
  await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
  // 엉뚱한 SR 을 보고 있지 않은지부터 확정한다.
  await expect(page.getByTestId('sr-title')).toHaveText(sr.title);
  await page.getByRole('tab', { name: /활동 이력/ }).click();
}

/** 활성 탭패널. 같은 문구의 TabsTrigger 와 충돌하지 않도록 스코프한다. */
function activePanel(page: Page) {
  return page.locator('[role="tabpanel"][data-state="active"]');
}

test.describe('SR 활동 이력', () => {
  test.use({ storageState: PERSONA_AUTH_FILES.admin });

  test('접수하면 그 전이가 활동과 상태 이력에 남는다', async ({ browser, page }) => {
    // INTAKE 시드는 REQUESTED 로 만든 뒤 접수 API 를 태운다 — 즉 생성과 상태 전이가
    // 둘 다 일어난 SR 이다. 그래서 활동이 최소 2건(CREATED + 접수) 있어야 한다.
    const sr = await seed(browser, 'INTAKE');

    // ── 서버가 무엇을 남겼는지 먼저 확정한다 ────────────────────────────
    const response = await page.request.get(`/api/srs/${sr.id}/activities`);
    expect(response.status(), '활동 조회가 200 이 아닙니다.').toBe(200);
    // REST 경로는 배열을 그대로 내려준다(서버 액션의 커서 페이지네이션 형태가 아니다).
    const activities = (await response.json()) as ActivityRow[];
    const types = activities.map((a) => a.type);

    expect(types, 'SR 생성 활동이 없습니다.').toContain('CREATED');
    expect(
      types.length,
      `접수를 거친 SR 인데 활동이 ${types.length}건뿐입니다: ${types.join(', ')}`
    ).toBeGreaterThanOrEqual(2);

    // ── 화면이 그것을 그대로 보여주는가 ─────────────────────────────────
    await openActivityTab(page, sr);
    const panel = activePanel(page);

    // 제목의 괄호 안 숫자는 서버가 센 전체 개수다. 앵커를 걸어 CardDescription 과 구분한다.
    await expect(panel.getByText(new RegExp(`^활동 이력 \\(${types.length}\\)$`))).toBeVisible();

    // 항목 수가 실제로 그만큼 그려져야 한다. 예전에는 `toBeGreaterThanOrEqual(0)` 이라
    // 0개가 그려져도 통과했다.
    await expect(panel.locator('.relative.flex.gap-4')).toHaveCount(types.length);
  });

  test('활동 유형이 한국어 라벨로 표시된다 — 영문 enum 이 새지 않는다', async ({
    browser,
    page,
  }) => {
    /**
     * 서버 enum → 화면 라벨. src/components/srs/SRActivities.tsx 의 activityTypeLabels
     * 와 같아야 한다. 여기에 복제해 두는 이유는, 한쪽이 조용히 바뀌면 이 테스트가
     * 깨져서 알려 주기를 바라기 때문이다(컴포넌트에서 import 하면 함께 틀린다).
     */
    const EXPECTED_LABELS: Record<string, string> = {
      CREATED: '생성',
      STATUS_CHANGED: '상태 변경',
      PRIORITY_CHANGED: '우선순위 변경',
      ASSIGNED: '담당자 지정',
      REASSIGNED: '담당자 변경',
      COMMENTED: '댓글',
      ATTACHMENT_ADDED: '첨부 추가',
      ATTACHMENT_REMOVED: '첨부 삭제',
      REOPENED: '재요청',
      COMPLETED: '완료',
      REJECTED: '반려',
      INTAKE_UPDATED: '접수 정보 수정',
    };

    const sr = await seed(browser, 'INTAKE');

    const response = await page.request.get(`/api/srs/${sr.id}/activities`);
    const activities = (await response.json()) as ActivityRow[];
    const types = [...new Set(activities.map((a) => a.type))];
    expect(types.length, '활동이 하나도 없습니다.').toBeGreaterThan(0);

    await openActivityTab(page, sr);
    const panel = activePanel(page);
    await expect(panel.getByText(/^활동 이력 \(\d+\)$/)).toBeVisible();

    // ── 여기가 결함이었다 ────────────────────────────────────────────────
    // SRActivities 의 activityTypeLabels 는 `Record<string, string>` 이라 키가
    // 스키마와 어긋나도 타입 검사가 통과했고, 실제로 6개 중 4개가 존재하지 않는
    // 키였다(UPDATED / STATUS_CHANGE / COMMENT / ATTACHMENT). prisma enum 은
    // STATUS_CHANGED / COMMENTED / ATTACHMENT_ADDED 라 12개 유형 중 10개가
    // `|| activity.type` 폴백으로 떨어져, 한국어 화면에 영문 enum 이 그대로 찍혔다.
    //
    // 서버가 내려준 유형마다 그 한국어 라벨이 실제로 화면에 있어야 하고,
    // 영문 enum 은 어디에도 남아 있으면 안 된다.
    for (const type of types) {
      const label = EXPECTED_LABELS[type];
      expect(label, `라벨이 정의되지 않은 활동 유형입니다: ${type}`).toBeDefined();
      await expect(
        panel.getByText(label!, { exact: true }).first(),
        `${type} 의 한국어 라벨 "${label}" 이 화면에 없습니다.`
      ).toBeVisible();
      await expect(
        panel.getByText(type, { exact: true }),
        `활동 배지에 영문 enum "${type}" 이 그대로 보입니다.`
      ).toHaveCount(0);
    }
  });

  test('상태 변경 이력 타임라인이 전이를 기록한다', async ({ browser, page }) => {
    const sr = await seed(browser, 'INTAKE');

    await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('sr-title')).toHaveText(sr.title);

    // 타임라인은 상세 본문에 항상 렌더된다. 예전에는 카드가 안 보이면 else 로 빠져
    // 통과했다 — 카드가 통째로 사라져도 초록불이었다.
    const timeline = page.locator('.border.bg-card').filter({ hasText: '상태 변경 이력' }).first();
    await expect(timeline).toBeVisible();

    // 생성 시 `null → REQUESTED` 한 줄이 먼저 쌓이고(sr.service.ts 의 statusHistory.create),
    // 접수가 `REQUESTED → INTAKE` 를 더한다. 둘 다 있어야 한다.
    await expect(timeline.getByText('요청됨', { exact: true })).toBeVisible();
    await expect(timeline.getByText('접수', { exact: true })).toBeVisible();
  });

  test('접수 전 SR 의 이력에는 요청됨만 있다', async ({ browser, page }) => {
    // 음성 대조. 위 테스트가 "무슨 상태든 다 보인다" 로 통과하는 것을 막는다.
    const sr = await seed(browser, 'REQUESTED');

    await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('sr-title')).toHaveText(sr.title);

    const timeline = page.locator('.border.bg-card').filter({ hasText: '상태 변경 이력' }).first();
    await expect(timeline).toBeVisible();
    await expect(timeline.getByText('요청됨', { exact: true })).toBeVisible();
    await expect(
      timeline.getByText('접수', { exact: true }),
      '접수하지 않은 SR 에 접수 이력이 있습니다.'
    ).toHaveCount(0);
  });

  // 활동 유형 필터는 **구현되어 있지 않다.** SRActivities 에는 select 도 combobox 도 없다.
  // 예전 스펙에는 '활동 유형별 필터링' 테스트가 있었지만, 필터를 못 찾으면 로그만 찍고
  // 통과해서 "없는 기능을 검증하는 초록불" 이었다. 통과로 위장하지 않고 fixme 로 남긴다.
  test.fixme('활동 유형별 필터링', async () => {
    // 구현되면: 유형 셀렉트에서 '댓글' 을 고르면 COMMENTED 활동만 남아야 한다.
  });
});
