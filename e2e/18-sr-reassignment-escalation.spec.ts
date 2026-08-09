import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test';

import {
  deleteSeededSRs,
  ENGINEER_EMAIL,
  type SeededSR,
  seedSR,
  type SeedSROptions,
} from './fixtures/sr';
import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';
import { selectAssignee } from './helpers/test-helpers';

/**
 * SR 재배정 및 우선순위 에스컬레이션 E2E
 *
 * 이 파일이 지키는 계약은 하나다: **담당자 재배정과 우선순위 상향이 서버에 반영되고
 * 화면에 나타나는가.**
 *
 * ── 왜 전부 다시 썼는가 ──────────────────────────────────────────────────
 * 이전 판의 테스트 2~5 는 전부 다음 형태였다.
 *
 *   if (await prioritySelect.isVisible().catch(() => false)) { …실제 검증… }
 *   else { console.log('⚠️ 우선순위 변경 UI를 찾을 수 없습니다.'); }
 *
 * `isVisible()` 은 재시도하지 않으므로 폼이 조금만 늦게 그려져도 else 로 떨어지고,
 * 그때 테스트는 **통과**했다. 즉 재배정과 에스컬레이션이 아예 동작하지 않아도 초록불이었다.
 * 담당자 선택도 `getByRole('option', { name: /Engineer|엔지니어/i }).first()` 로 이름에
 * 기대고 있어, 계정 이름이 바뀌면 조용히 다른 사람에게 배정됐다(그 목록은
 * getUsersWithSRHandlingPermission 의 결과이고 첫 항목이 엔지니어라는 보장이 없다).
 *
 * 지금은 셋을 모두 뒤집었다.
 *  1. 준비(SR 생성·접수)는 API 픽스처가 한다. 검증 대상은 등록/접수 UI 가 아니라 재배정이다.
 *     (등록 UI 는 04-sr-create, 접수 UI 는 22-sr-intake-process 가 각각 한 번 검증한다.)
 *  2. 변경은 UI 로 하되 **PATCH /api/srs/{id}/intake 응답을 관찰**하고, 이어서
 *     GET /api/srs/{id} 로 assigneeId·actualPriority 가 실제로 바뀌었는지 서버에 되묻는다.
 *     화면 단언만 하면 "화면이 안 그려진 것"과 "서버가 저장하지 않은 것"을 구분할 수 없다.
 *  3. 담당자는 이름이 아니라 **이메일**로 고른다(helpers/test-helpers.ts 의 selectAssignee).
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 를 계속
 * 열어 둔다. "500ms 동안 요청 0건"이 영원히 성립하지 않아 networkidle 은 항상 타임아웃난다.
 */

/**
 * 접수 정보 수정(PATCH /api/srs/[id]/intake)은 ADMIN 또는 MANAGER 만 가능하다
 * (src/app/api/srs/[id]/intake/route.ts 의 PATCH 권한 검사).
 *
 * legacyManager 는 이름과 달리 admin@example.com(ADMIN) 세션이다. 진짜 MANAGER 페르소나
 * (manager-role.json)는 role-persona-setup 프로젝트가 만들고 multi-user 프로젝트의
 * dependencies 에 없으므로, 이 파일에서 쓰면 인증 파일 생성 순서가 보장되지 않는다.
 */
const OPERATOR_AUTH = PERSONA_AUTH_FILES.legacyManager;

/**
 * 재배정의 **출발점**이 될 내부 담당자.
 *
 * 담당자가 될 수 있는 조건은 assertAssignable(src/services/sr.service.ts) → 내부 역할
 * (ADMIN/MANAGER/ENGINEER) + SR 처리 권한이다. 시드 계정 중 이 조건을 만족하는 것은
 * admin / manageruser / engineeruser 셋이고, 그중 도착점은 반드시 engineeruser 여야 한다
 * (ENGINEER 는 자기에게 배정된 SR 만 읽을 수 있으므로 마지막 테스트가 성립하려면 그렇다).
 * 출발점으로 admin 을 쓰지 않는 이유는 admin 이 이 파일의 조작 세션 본인이라
 * "자기 자신에게서 남에게로" 넘기는 부자연스러운 시나리오가 되기 때문이다.
 */
const INITIAL_ASSIGNEE_EMAIL = process.env.TEST_MANAGER_ROLE_EMAIL || 'manageruser@example.com';

/** 이 파일이 만든 SR. 공유 DB 를 쓰므로 정리는 선택이 아니다. */
const seededIds: string[] = [];

/** GET /api/srs/{id} 에서 이 스펙이 실제로 읽는 부분만. */
interface SRDetailPayload {
  actualPriority: string | null;
  dueDate: string | null;
  assignee: { id: string; name: string; email: string } | null;
}

/** 접수(INTAKE)까지 진행된 SR 을 API 로 만든다. UI 로 만들면 한 건에 20~40초가 든다. */
async function seedIntakeSR(browser: Browser, options: SeedSROptions = {}): Promise<SeededSR> {
  const sr = await seedSR(browser, { stage: 'INTAKE', ...options });
  seededIds.push(sr.id);
  return sr;
}

/** 서버가 실제로 무엇을 저장했는지 되묻는다 — 화면 단언의 기준점이다. */
async function fetchSRDetail(request: APIRequestContext, sr: SeededSR): Promise<SRDetailPayload> {
  const response = await request.get(`/api/srs/${sr.id}`);
  const body = await response.text().catch(() => '(본문 없음)');
  expect(
    response.status(),
    `SR ${sr.srNumber}: 상세 조회에 실패했습니다. 응답: ${body.slice(0, 300)}`
  ).toBe(200);
  return JSON.parse(body) as SRDetailPayload;
}

/**
 * 접수 폼을 **수정 모드**로 연다.
 *
 * use-intake-form.ts 는 상태가 INTAKE/IN_PROGRESS 일 때만 isEditMode 가 되고, 그때만
 * 저장이 PATCH 로 나간다(REQUESTED 면 POST). 제목으로 모드를 확정하지 않으면 엉뚱한
 * 경로를 검증하게 되므로 여기서 단언한다.
 */
async function openIntakeEditForm(page: Page, sr: SeededSR): Promise<void> {
  await page.goto(`/srs/${sr.id}/intake`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await expect(
    page.getByRole('heading', { name: 'SR 접수 정보 수정' }),
    `SR ${sr.srNumber}: 접수 정보 수정 폼이 열리지 않았습니다(권한 또는 상태 문제).`
  ).toBeVisible({ timeout: 20000 });
}

/** 실제 우선순위를 고르고, 트리거에 선택 결과가 반영된 것까지 확인한다. */
async function selectActualPriority(page: Page, optionLabel: string): Promise<void> {
  const trigger = page.getByRole('combobox', { name: '실제 우선순위' });
  await expect(trigger).toBeVisible({ timeout: 15000 });
  await trigger.click();

  const option = page.getByRole('option', { name: optionLabel });
  await option.waitFor({ state: 'visible', timeout: 15000 });
  await option.click();

  // 클릭이 '성공'해도 값이 안 바뀌는 경우(메뉴가 열리지 않은 채 이벤트만 도달)를 잡는다.
  await expect(trigger).toContainText(optionLabel);
}

/**
 * 예상 작업 시간을 같은 값으로 다시 입력한다.
 *
 * ⚠️ 앱 결함 우회다. 없으면 저장 버튼을 눌러도 PATCH 가 **한 번도** 나가지 않는다.
 * 프로덕션 빌드의 GET /api/srs/{id}/intake 는 estimatedHours 를 숫자가 아니라
 * 문자열("4")로 준다. serializeResponse(src/lib/serialization.ts)가 Decimal 을
 * `value.constructor.name === 'Decimal'` 로 판별하는데 프로덕션 번들에서는 클래스명이
 * 축약돼 그 조건이 빗나가고, 다음 분기인 `toJSON()`(= 문자열)으로 떨어지기 때문이다.
 * use-intake-form.ts 는 그 값을 그대로 form.setValue 하고 폼 스키마는 z.number() 라
 * "Invalid input" 에서 제출이 막힌다. 화면에서 값을 다시 넣으면 입력 핸들러가
 * Number() 로 변환하므로 통과한다.
 *
 * 값을 바꾸지 않고 **읽은 값 그대로** 넣는다 — 이 우회가 검증 대상(담당자·우선순위)에
 * 영향을 주지 않아야 한다. 결함 자체는 보고서에 남긴다.
 */
async function reenterEstimatedHours(page: Page): Promise<void> {
  const hoursInput = page.getByRole('spinbutton', { name: '예상 작업 시간' });
  await expect(hoursInput).toBeVisible({ timeout: 15000 });

  const current = Number(await hoursInput.inputValue());
  expect(current, '접수 폼에 예상 작업 시간이 채워져 있지 않습니다.').toBeGreaterThan(0);

  // 같은 문자열을 그대로 채우면 React 의 입력 추적기가 "값이 안 바뀌었다"고 보고 onChange 를
  // 삼켜서 폼 상태(문자열)가 그대로 남는다. 비웠다가 다시 넣어야 변환이 실제로 일어난다.
  await hoursInput.fill('');
  await hoursInput.fill(String(current));
}

/**
 * 저장 → PATCH 응답을 관찰한다.
 *
 * 버튼만 눌리고 아무 일도 일어나지 않은 것을 성공으로 오인하지 않기 위해, 응답을
 * 기다리는 약속을 클릭 **전에** 걸어 둔다.
 */
async function saveIntakeAndExpectPatch(page: Page, sr: SeededSR): Promise<void> {
  await reenterEstimatedHours(page);

  const patchPromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/srs/${sr.id}/intake`) &&
      response.request().method() === 'PATCH',
    { timeout: 20000 }
  );

  await page.getByRole('button', { name: '저장' }).click();

  const patch = await patchPromise;
  const body = await patch.text().catch(() => '(본문 없음)');
  expect(
    patch.status(),
    `SR ${sr.srNumber}: 접수 정보 수정이 서버에서 거부되었습니다. 응답: ${body.slice(0, 300)}`
  ).toBe(200);
}

/** SR 상세를 열고, 그 SR 이 맞는지까지 확인한다. */
async function openSRDetail(page: Page, sr: SeededSR): Promise<void> {
  await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await expect(
    page.getByTestId('sr-title'),
    `SR ${sr.srNumber}: 상세 화면이 렌더되지 않았습니다.`
  ).toHaveText(sr.title, { timeout: 20000 });
}

/**
 * 상세 화면의 "라벨 → 값" 한 쌍 (src/app/(dashboard)/srs/[id]/page.tsx 의 상세 정보 그리드).
 *
 * `text=/긴급|CRITICAL/i` 같은 넓은 매칭을 쓰지 않는 이유: 그 패턴은 '긴급' 배지뿐 아니라
 * 요청 우선순위·상태 배지·버튼 라벨에도 걸려서, 우선순위가 전혀 바뀌지 않아도 통과한다.
 * 라벨을 정확히 지목하고 그 옆의 값만 읽는다.
 */
function detailField(page: Page, label: string) {
  return page
    .getByRole('heading', { name: label, exact: true })
    .locator('xpath=following-sibling::p[1]');
}

test.describe('SR 재배정 및 에스컬레이션', () => {
  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, seededIds);
    seededIds.length = 0;
  });

  test('접수 직후: 지정한 담당자와 LOW 우선순위가 상세 화면에 그대로 나타난다', async ({
    browser,
  }) => {
    const sr = await seedIntakeSR(browser, {
      actualPriority: 'LOW',
      assigneeEmail: INITIAL_ASSIGNEE_EMAIL,
    });

    const context = await browser.newContext({ storageState: OPERATOR_AUTH });
    const page = await context.newPage();

    try {
      // 뒤따르는 재배정·에스컬레이션 테스트의 출발 상태가 정말 그 상태인지 먼저 못박는다.
      const detail = await fetchSRDetail(context.request, sr);
      expect(detail.actualPriority).toBe('LOW');
      expect(detail.assignee?.email).toBe(INITIAL_ASSIGNEE_EMAIL);

      await openSRDetail(page, sr);
      await expect(detailField(page, '담당자')).toHaveText(detail.assignee!.name);
      await expect(detailField(page, '실제 우선순위')).toHaveText('낮음');
    } finally {
      await context.close();
    }
  });

  test('담당자 재배정: 접수 폼에서 담당자를 바꾸면 서버의 assignee 가 바뀐다', async ({
    browser,
  }) => {
    const sr = await seedIntakeSR(browser, {
      actualPriority: 'LOW',
      assigneeEmail: INITIAL_ASSIGNEE_EMAIL,
    });

    const context = await browser.newContext({ storageState: OPERATOR_AUTH });
    const page = await context.newPage();

    try {
      await openIntakeEditForm(page, sr);
      // 이름이 아니라 이메일로 고른다. 옵션 라벨은 `{name} ({email})` 형태이므로
      // 계정 이름이 바뀌어도 겨냥이 흔들리지 않는다.
      await selectAssignee(page, ENGINEER_EMAIL);
      await saveIntakeAndExpectPatch(page, sr);

      const detail = await fetchSRDetail(context.request, sr);
      expect(detail.assignee?.email, '재배정이 서버에 반영되지 않았습니다.').toBe(ENGINEER_EMAIL);
      // 담당자만 바꿨으므로 우선순위는 그대로여야 한다 —
      // PATCH 가 폼의 다른 필드를 엉뚱한 값으로 덮어쓰지 않는지 함께 본다.
      expect(detail.actualPriority).toBe('LOW');

      await openSRDetail(page, sr);
      await expect(detailField(page, '담당자')).toHaveText(detail.assignee!.name);
    } finally {
      await context.close();
    }
  });

  test('우선순위 상향(LOW → HIGH): 실제 우선순위와 SLA 마감일이 함께 바뀐다', async ({
    browser,
  }) => {
    const sr = await seedIntakeSR(browser, { actualPriority: 'LOW' });

    const context = await browser.newContext({ storageState: OPERATOR_AUTH });
    const page = await context.newPage();

    try {
      const before = await fetchSRDetail(context.request, sr);
      expect(before.actualPriority).toBe('LOW');

      await openIntakeEditForm(page, sr);
      await selectActualPriority(page, '높음 (HIGH)');
      await saveIntakeAndExpectPatch(page, sr);

      const after = await fetchSRDetail(context.request, sr);
      expect(after.actualPriority, '우선순위 상향이 서버에 반영되지 않았습니다.').toBe('HIGH');

      // 우선순위가 바뀌면 SLA 마감일을 다시 계산한다(intake PATCH → calculateDueDateFromHours).
      // 배율은 LOW 1.5 → HIGH 0.75 이고 기준 시각은 intakeAt 으로 고정이므로,
      // 상향의 결과는 "마감일이 반드시 당겨진다" 로 결정적으로 나타난다.
      expect(new Date(after.dueDate!).getTime()).toBeLessThan(new Date(before.dueDate!).getTime());

      await openSRDetail(page, sr);
      await expect(detailField(page, '실제 우선순위')).toHaveText('높음');
    } finally {
      await context.close();
    }
  });

  test('긴급 에스컬레이션(HIGH → CRITICAL): 실제 우선순위와 SLA 마감일이 함께 바뀐다', async ({
    browser,
  }) => {
    const sr = await seedIntakeSR(browser, { actualPriority: 'HIGH' });

    const context = await browser.newContext({ storageState: OPERATOR_AUTH });
    const page = await context.newPage();

    try {
      const before = await fetchSRDetail(context.request, sr);
      expect(before.actualPriority).toBe('HIGH');

      await openIntakeEditForm(page, sr);
      await selectActualPriority(page, '긴급 (CRITICAL)');
      await saveIntakeAndExpectPatch(page, sr);

      const after = await fetchSRDetail(context.request, sr);
      expect(after.actualPriority, '에스컬레이션이 서버에 반영되지 않았습니다.').toBe('CRITICAL');
      // 배율 HIGH 0.75 → CRITICAL 0.5.
      expect(new Date(after.dueDate!).getTime()).toBeLessThan(new Date(before.dueDate!).getTime());

      await openSRDetail(page, sr);
      await expect(detailField(page, '실제 우선순위')).toHaveText('긴급');
    } finally {
      await context.close();
    }
  });

  test('ENGINEER: 자신에게 배정된 에스컬레이션 SR 을 목록에서 찾아 상세를 연다', async ({
    browser,
  }) => {
    // 담당자는 픽스처 기본값(ENGINEER)이다. ENGINEER 는 자기에게 배정된 SR 만 읽을 수 있으므로
    // (src/lib/policies.ts canReadSR), 이 배정이 곧 이 테스트의 전제다.
    const sr = await seedIntakeSR(browser, { actualPriority: 'CRITICAL' });

    const context = await browser.newContext({ storageState: PERSONA_AUTH_FILES.engineer });
    const page = await context.newPage();

    try {
      const detail = await fetchSRDetail(context.request, sr);
      expect(detail.assignee?.email, 'ENGINEER 에게 배정되지 않았습니다.').toBe(ENGINEER_EMAIL);

      // 목록 필터는 URL 파라미터로 서버에서 적용된다(src/app/(dashboard)/srs/page.tsx).
      // 검색어 입력은 500ms 디바운스가 걸리므로 URL 로 바로 좁힌다.
      //
      // 우선순위 필터(priority)를 쓰지 않는 이유: 그 필터와 목록의 우선순위 열은 레거시
      // 컬럼 SR.priority 를 보는데, 접수 POST/PATCH 는 actualPriority 만 갱신한다.
      // 즉 CRITICAL 로 에스컬레이션해도 목록에서는 여전히 요청 당시의 우선순위로 보인다.
      await page.goto(`/srs?search=${encodeURIComponent(sr.srNumber)}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      const row = page.getByRole('row', { name: `SR ${sr.srNumber} 상세 보기` });
      await expect(row, `ENGINEER 목록에 배정된 SR ${sr.srNumber} 이 보이지 않습니다.`).toBeVisible(
        { timeout: 20000 }
      );
      await expect(row).toContainText(sr.title);
      await expect(row).toContainText(detail.assignee!.name);

      await row.getByRole('link', { name: sr.srNumber }).click();
      await page.waitForURL(`**/srs/${sr.id}`, { timeout: 20000 });

      await expect(page.getByTestId('sr-title')).toHaveText(sr.title);
      await expect(detailField(page, '실제 우선순위')).toHaveText('긴급');
      await expect(detailField(page, '담당자')).toHaveText(detail.assignee!.name);
    } finally {
      await context.close();
    }
  });
});
