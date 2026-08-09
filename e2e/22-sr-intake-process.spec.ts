import { expect, test } from '@playwright/test';

import { deleteSeededSRs, ENGINEER_EMAIL, type SeededSR, seedSR } from './fixtures/sr';
import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';
import { selectAssignee } from './helpers/test-helpers';

/**
 * SR 접수 프로세스 E2E 테스트
 *
 * ── 이 파일의 역할 ───────────────────────────────────────────────────────
 * **접수 폼(/srs/{id}/intake) 을 UI 로 통과하는 유일한 스펙이다.** 다른 스펙(17·18·19·21)
 * 의 접수는 전부 `e2e/fixtures/sr.ts` 의 API 픽스처로 대체됐으므로, 여기서 폼이 깨지면
 * 아무도 알려 주지 않는다. 그래서 '1. 접수 폼으로 SR 접수 처리' 는 반드시 UI 경로를
 * 유지한다 — 우선순위 선택 → 예상 시간 입력 → 담당자 선택 → 메모 → 저장까지 전부.
 *
 * 반대로 "SR 이 하나 있어야 한다" 는 arrange 단계는 UI 로 하지 않는다. 예전에는 등록
 * 다이얼로그를 20~40초에 걸쳐 통과하고 목록을 최대 5회 새로고침하며 행을 찾았는데,
 * 그건 04-sr-create.spec.ts 가 이미 검증하는 화면이다. 여기서는 seedSR 로 끝낸다.
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은 영원히
 * 성립하지 않는다. 대기는 domcontentloaded + 응답/요소로 표현한다.
 */

/** 접수 정보 수정 권한(ADMIN/MANAGER)을 가진 세션. manager.json 은 실제로 ADMIN 이다. */
const MANAGER_AUTH = PERSONA_AUTH_FILES.legacyManager;
const CLIENT_AUTH = PERSONA_AUTH_FILES.client;

/** 재배정 대상. manager.json 의 계정이자 SR 처리 권한 보유자(ADMIN 은 모든 권한을 암묵 보유). */
const ADMIN_EMAIL = process.env.TEST_USER_EMAIL || 'admin@example.com';

/**
 * 접수 메모는 두 단계에서 **서로 다른 문자열**을 쓴다.
 * 예전에는 둘 다 '긴급' 을 포함해 `toContain('긴급')` 으로 확인했는데, 그러면 수정이
 * 반영되지 않아도 재조회 단언이 통과한다. 값 자체를 완전 일치로 비교한다.
 */
const NOTES_ON_INTAKE = '초기 접수 메모 - 빠른 대응이 필요합니다.';
const NOTES_ON_UPDATE = '수정된 접수 메모 - 우선순위를 상향했습니다.';

test.describe('SR 접수 프로세스 테스트', () => {
  /**
   * 이 5개는 하나의 시나리오다: 1이 폼으로 만든 상태를 2가 읽고, 3이 고친 것을 4가 다시
   * 읽고, 5가 그 두 번의 쓰기가 남긴 활동 로그를 확인한다. 준비(SR 생성)는 이미 API 로
   * 빠졌고 남은 의존은 "접수 폼을 통과한 실제 상태" 뿐이므로 serial 이 정당하다.
   */
  test.describe.configure({ mode: 'serial' });

  let sr: SeededSR;

  test.beforeAll(async ({ browser }) => {
    // 접수 대상 SR 은 REQUESTED 여야 한다(intake POST 는 REQUESTED 에서만 허용된다).
    sr = await seedSR(browser, {
      stage: 'REQUESTED',
      requestedPriority: 'MEDIUM',
      title: `접수 프로세스 테스트 SR ${Date.now()}`,
    });
  });

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, [sr?.id]);
  });

  test('1. 접수 폼으로 SR 접수 처리 - 우선순위·예상시간·담당자 (MANAGER)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: MANAGER_AUTH });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });

      // 상세는 클라이언트 렌더이므로 이 단언이 로드 게이트 역할을 한다.
      await expect(page.getByTestId('sr-title')).toHaveText(sr.title);

      // REQUESTED 상태에서만 '접수하기' 가 보인다(SRStatusActions 의 REQUESTED 분기).
      // 버튼 존재 자체가 곧 상태 검증이므로 넓은 텍스트 매칭이 필요 없다.
      const intakeButton = page.getByRole('button', { name: '접수하기' });
      await expect(intakeButton).toBeVisible();
      await intakeButton.click();

      await page.waitForURL(/\/srs\/[^/]+\/intake$/);
      await expect(page.getByRole('heading', { name: 'SR 접수 처리' })).toBeVisible();

      // 1) 실제 우선순위: MEDIUM(요청값) → HIGH
      const prioritySelect = page.getByRole('combobox', { name: '실제 우선순위 *' });
      await expect(prioritySelect).toBeVisible();
      await prioritySelect.click();
      await page.getByRole('option', { name: /높음 \(HIGH\)/ }).click();
      await expect(prioritySelect).toHaveText(/높음/);

      // 2) 예상 작업 시간
      const hoursInput = page.getByLabel(/예상 작업 시간/);
      await hoursInput.fill('8');
      await expect(hoursInput).toHaveValue('8');

      // 3) 담당자: **이메일로** 고른다. 옵션 순서는 보장되지 않으므로 ArrowDown 으로
      //    "첫 번째"를 고르면 엔지니어가 아닌 사람에게 배정될 수 있다
      //    (helpers/test-helpers.ts 의 selectAssignee 주석 참고).
      await selectAssignee(page, ENGINEER_EMAIL);
      await expect(page.getByRole('combobox', { name: '담당자 *' })).toContainText(ENGINEER_EMAIL);

      // 4) 접수 메모
      const notes = page.getByLabel(/접수 메모/);
      await notes.fill(NOTES_ON_INTAKE);

      // 5) 저장 — 고정 대기 대신 실제 접수 요청의 응답을 기다린다.
      const intakePost = page.waitForResponse(
        (r) => r.url().includes(`/api/srs/${sr.id}/intake`) && r.request().method() === 'POST'
      );
      await page.getByRole('button', { name: '저장' }).click();
      const intakeResponse = await intakePost;
      expect(
        intakeResponse.status(),
        `접수 요청이 거부되었습니다: ${(await intakeResponse.text()).slice(0, 300)}`
      ).toBe(200);

      // use-intake-form.ts 의 onSubmit 은 성공 시 목록(/srs)으로 이동한다.
      await page.waitForURL(/\/srs$/);

      // ── 서버 상태 검증 ────────────────────────────────────────────────
      const saved = (await (await page.request.get(`/api/srs/${sr.id}/intake`)).json()) as {
        status: string;
        actualPriority: string;
        estimatedHours: string | number;
        intakeNotes: string;
        assignee: { name: string; email: string };
      };
      expect(saved.status).toBe('INTAKE');
      expect(saved.actualPriority).toBe('HIGH');
      expect(Number(saved.estimatedHours)).toBe(8);
      expect(saved.intakeNotes).toBe(NOTES_ON_INTAKE);
      expect(saved.assignee.email).toBe(ENGINEER_EMAIL);

      // ── 화면 반영 검증 ────────────────────────────────────────────────
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('sr-title')).toHaveText(sr.title);

      // INTAKE 로 넘어갔으므로 액션 버튼 집합이 바뀐다. '접수' 라는 넓은 텍스트를 찾는 대신
      // 상태에 따라 갈리는 버튼으로 확인한다 ('접수 정보 수정' 버튼에도 걸리지 않는다).
      await expect(page.getByRole('button', { name: '진행 시작' })).toBeVisible();
      await expect(page.getByRole('button', { name: '접수하기' })).toHaveCount(0);

      // 접수 정보 카드(IntakeInfoCard)는 intakeAt 이 있어야 렌더된다.
      await expect(page.getByRole('heading', { name: '접수 정보' })).toBeVisible();
      await expect(page.getByText('8시간', { exact: true })).toBeVisible();
      await expect(page.getByText(saved.assignee.name, { exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('2. 접수 정보 조회 및 검증 (MANAGER)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: MANAGER_AUTH });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${sr.id}/intake`, { waitUntil: 'domcontentloaded' });

      // INTAKE 상태에서 다시 열면 '수정 모드'다(use-intake-form.ts 의 isEditMode).
      // 이 heading 이 보인다는 것은 로딩이 끝나고 폼 값이 채워졌다는 뜻이므로 로드 게이트다.
      await expect(page.getByRole('heading', { name: 'SR 접수 정보 수정' })).toBeVisible();

      await expect(page.getByRole('combobox', { name: '실제 우선순위 *' })).toHaveText(/높음/);
      await expect(page.getByLabel(/예상 작업 시간/)).toHaveValue('8');
      await expect(page.getByLabel(/접수 메모/)).toHaveValue(NOTES_ON_INTAKE);
      await expect(page.getByRole('combobox', { name: '담당자 *' })).toContainText(ENGINEER_EMAIL);
    } finally {
      await context.close();
    }
  });

  test('3. 접수 정보 수정 - 우선순위 상향 및 담당자 재배정 (MANAGER)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: MANAGER_AUTH });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${sr.id}/intake`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'SR 접수 정보 수정' })).toBeVisible();

      const prioritySelect = page.getByRole('combobox', { name: '실제 우선순위 *' });
      await prioritySelect.click();
      await page.getByRole('option', { name: /긴급 \(CRITICAL\)/ }).click();
      await expect(prioritySelect).toHaveText(/긴급/);

      const hoursInput = page.getByLabel(/예상 작업 시간/);
      await hoursInput.fill('12');
      await expect(hoursInput).toHaveValue('12');

      // 재배정도 이메일로 지정한다. ENGINEER → ADMIN 으로 실제로 바뀌어야
      // PATCH 가 ASSIGNED 활동 로그를 남긴다(테스트 5가 그것을 확인한다).
      await selectAssignee(page, ADMIN_EMAIL);
      await expect(page.getByRole('combobox', { name: '담당자 *' })).toContainText(ADMIN_EMAIL);

      await page.getByLabel(/접수 메모/).fill(NOTES_ON_UPDATE);

      const intakePatch = page.waitForResponse(
        (r) => r.url().includes(`/api/srs/${sr.id}/intake`) && r.request().method() === 'PATCH'
      );
      await page.getByRole('button', { name: '저장' }).click();
      const patchResponse = await intakePatch;
      expect(
        patchResponse.status(),
        `접수 정보 수정이 거부되었습니다: ${(await patchResponse.text()).slice(0, 300)}`
      ).toBe(200);

      await page.waitForURL(/\/srs$/);

      // 상세 화면의 접수 정보 카드가 상향된 우선순위를 보여 주는지 확인한다.
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('sr-title')).toHaveText(sr.title);
      // 요청(보통) → 실제(긴급) 로 갈렸으므로 IntakeInfoCard 가 '변경됨' 을 표시한다.
      await expect(page.getByRole('heading', { name: '접수 정보' })).toBeVisible();
      await expect(page.getByText('변경됨', { exact: true })).toBeVisible();
      await expect(page.getByText('12시간', { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('4. 수정된 접수 정보 재조회 및 검증 (MANAGER)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: MANAGER_AUTH });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${sr.id}/intake`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'SR 접수 정보 수정' })).toBeVisible();

      await expect(page.getByRole('combobox', { name: '실제 우선순위 *' })).toHaveText(/긴급/);
      await expect(page.getByLabel(/예상 작업 시간/)).toHaveValue('12');
      await expect(page.getByLabel(/접수 메모/)).toHaveValue(NOTES_ON_UPDATE);
      await expect(page.getByRole('combobox', { name: '담당자 *' })).toContainText(ADMIN_EMAIL);
    } finally {
      await context.close();
    }
  });

  test('5. Activity 로그 확인 - API 와 활동 이력 탭 (MANAGER)', async ({ browser }) => {
    const context = await browser.newContext({ storageState: MANAGER_AUTH });
    const page = await context.newPage();

    try {
      // ── (1) 원장(原帳) 검증: GET /api/srs/{id}/activities ────────────────
      // 접수(POST)는 STATUS_CHANGED + ASSIGNED 를, 접수 정보 수정(PATCH)은
      // INTAKE_UPDATED + ASSIGNED 를 남긴다(src/app/api/srs/[id]/intake/route.ts).
      const response = await page.request.get(`/api/srs/${sr.id}/activities`);
      expect(response.status()).toBe(200);

      const activities = (await response.json()) as Array<{
        type: string;
        description: string;
      }>;
      const types = activities.map((a) => a.type);

      expect(types).toContain('STATUS_CHANGED');
      expect(types).toContain('INTAKE_UPDATED');
      // 접수 시 1건 + 재배정 시 1건.
      expect(types.filter((t) => t === 'ASSIGNED')).toHaveLength(2);

      const descriptions = activities.map((a) => a.description);
      expect(descriptions).toContainEqual(expect.stringContaining('SR이 접수되었습니다'));
      // 수정 로그는 "무엇이 바뀌었는지"까지 문자열에 담긴다. 우선순위 전이가 실제로
      // 기록되었는지 확인해야 로그가 형식만 남기는 것을 잡을 수 있다.
      expect(descriptions).toContainEqual(expect.stringContaining('우선순위: HIGH → CRITICAL'));

      // ── (2) 화면 검증: 활동 이력 탭 ──────────────────────────────────────
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('sr-title')).toHaveText(sr.title);

      await page.getByRole('tab', { name: /활동 이력/ }).click();

      // 탭 패널로 범위를 좁힌다 — 같은 문구가 다른 카드에 있어도 오염되지 않는다.
      // (SRActivities 의 카드 제목은 heading 이 아니라 div 라서 getByRole('heading') 으로는
      //  잡히지 않는다. 아래 findings 참고.)
      const activityPanel = page.getByRole('tabpanel', { name: /활동 이력/ });
      await expect(activityPanel).toContainText(`활동 이력 (${activities.length})`);
      await expect(activityPanel).toContainText('SR이 접수되었습니다');
      await expect(activityPanel).toContainText('우선순위: HIGH → CRITICAL');
    } finally {
      await context.close();
    }
  });
});

test.describe('SR 접수 권한 테스트', () => {
  let sr: SeededSR;

  test.beforeAll(async ({ browser }) => {
    // 요청자는 CLIENT_USER 페르소나다(픽스처 계약). 즉 client 세션이 이 SR 의 주인이다 —
    // "남의 SR 이라 못 본다" 가 아니라 "자기 SR 이어도 접수는 못 한다" 를 검증하게 된다.
    sr = await seedSR(browser, { stage: 'REQUESTED', title: `접수 권한 테스트 SR ${Date.now()}` });
  });

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, [sr?.id]);
  });

  test('CLIENT는 SR 접수 처리 불가', async ({ browser }) => {
    const context = await browser.newContext({ storageState: CLIENT_AUTH });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${sr.id}`, { waitUntil: 'domcontentloaded' });

      // 부재를 묻기 전에 화면이 실제로 렌더되었음을 먼저 단언해야 한다.
      // 렌더 전에 물으면 무엇이든 '없음'이라 아무것도 검증하지 못한다.
      await expect(page.getByTestId('sr-title')).toHaveText(sr.title);
      await expect(page.getByRole('heading', { name: '상세 정보' })).toBeVisible();

      // REQUESTED 상태의 운영 액션(접수하기/거절)은 ADMIN·MANAGER 전용이다
      // (SRStatusActions 의 canAccept). CLIENT 에게는 둘 다 없어야 한다.
      await expect(page.getByRole('button', { name: '접수하기' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '거절' })).toHaveCount(0);

      // 버튼이 없다는 것만으로는 통제가 아니다. 서버가 직접 호출을 막는지 확인한다.
      // 빈 바디로 보내는 것이 핵심이다 — 라우트는 권한 검사를 바디 검증보다 **먼저**
      // 하므로(intake/route.ts), 400 이 아니라 403 이 와야 인가 게이트가 동작한 것이다.
      const forbidden = await page.request.post(`/api/srs/${sr.id}/intake`, { data: {} });
      expect(forbidden.status()).toBe(403);

      // 거부되었으면 상태는 그대로여야 한다.
      const detail = (await (await page.request.get(`/api/srs/${sr.id}/intake`)).json()) as {
        status: string;
        assignee: unknown;
      };
      expect(detail.status).toBe('REQUESTED');
      expect(detail.assignee).toBeNull();
    } finally {
      await context.close();
    }
  });

  /**
   * 접수 **페이지** 자체는 아직 역할로 막혀 있지 않다.
   * src/app/(dashboard)/srs/[id]/intake/page.tsx 는 useIntakeForm 이 돌려주는 sr 유무만
   * 보고 렌더하고, 그 데이터를 주는 GET /api/srs/[id]/intake 는 ensureCanReadSR 만 건다
   * (읽기 권한은 자기 SR 이면 CLIENT 에게도 있다). src/proxy.ts 도 인증 여부만 본다.
   * 따라서 CLIENT 가 URL 을 직접 치면 '접수 처리' 폼이 그려진다 — 저장은 위 테스트가
   * 확인하듯 403 이므로 데이터가 새지는 않지만, 화면은 막혀 있어야 옳다.
   * 라우트 가드가 생기면 이 fixme 를 풀 것.
   */
  test.fixme('CLIENT의 접수 페이지 직접 접근은 차단되어야 한다', async ({ browser }) => {
    const context = await browser.newContext({ storageState: CLIENT_AUTH });
    const page = await context.newPage();

    try {
      await page.goto(`/srs/${sr.id}/intake`, { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/intake$/);
    } finally {
      await context.close();
    }
  });
});

test.describe('SR 접수 SLA 계산 테스트', () => {
  let sr: SeededSR;

  test.beforeAll(async ({ browser }) => {
    sr = await seedSR(browser, { stage: 'REQUESTED', title: `SLA 계산 테스트 SR ${Date.now()}` });
  });

  test.afterAll(async ({ browser }) => {
    await deleteSeededSRs(browser, [sr?.id]);
  });

  /**
   * 예전 이 테스트는 "'마감일' 이라는 라벨이 화면에 있나"만 보고 로그를 찍었다.
   * 그건 계산을 전혀 검증하지 못한다 — 실제로 화면에는 dueDate 가 나오지 않고
   * estimatedCompletionDate 가 'SLA 마감일' 이라는 이름으로 표시된다(아래 findings).
   * 그래서 계산 결과 자체(dueDate)를 API 로 읽어 기대값과 대조한다.
   *
   * 계약(src/services/service-category.service.ts):
   *   dueDate = 기준시각 + slaHours × 배율(CRITICAL 0.5 / HIGH 0.75 / MEDIUM 1.0 / LOW 1.5)
   *   - POST /intake  : 기준시각 = 접수 처리 시각(new Date())
   *   - PATCH /intake : 우선순위가 바뀌면 기준시각 = intakeAt 으로 **재계산**
   * 곱셈은 밀리초로 해야 한다. setHours 로 하면 소수 시간이 절삭돼 2.5시간이 2시간이 된다.
   */
  test('SLA 기반 마감일 자동 계산 - 우선순위 배율까지 검증', async ({ browser }) => {
    const context = await browser.newContext({ storageState: MANAGER_AUTH });
    const api = context.request;

    try {
      const before = (await (await api.get(`/api/srs/${sr.id}/intake`)).json()) as {
        serviceCategory: { slaHours: number };
      };
      const slaHours = Number(before.serviceCategory.slaHours);
      expect(slaHours, 'SLA 기준 시간이 없으면 마감일 계산을 검증할 수 없다').toBeGreaterThan(0);

      // 담당자 ID 는 이메일로 찾는다(옵션 순서·목록 위치에 의존하지 않는다).
      const users = (await (
        await api.get(`/api/users?search=${encodeURIComponent(ENGINEER_EMAIL)}&pageSize=50`)
      ).json()) as { data: Array<{ id: string; email: string }> };
      const assignee = users.data.find((u) => u.email === ENGINEER_EMAIL);
      expect(assignee, `${ENGINEER_EMAIL} 계정을 찾지 못했습니다`).toBeTruthy();

      // ── 1) 접수: HIGH(0.75배) ────────────────────────────────────────────
      // 서버가 쓰는 기준시각은 요청 처리 시점이므로 [요청 직전, 응답 직후] 구간으로 조인다.
      const sentAt = Date.now();
      const intake = await api.post(`/api/srs/${sr.id}/intake`, {
        data: {
          actualPriority: 'HIGH',
          estimatedHours: 5,
          estimatedCompletionDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          intakeNotes: 'SLA 계산 검증',
          assigneeId: assignee!.id,
        },
      });
      const respondedAt = Date.now();
      expect(intake.status(), `접수 실패: ${(await intake.text()).slice(0, 300)}`).toBe(200);

      const afterIntake = (await (await api.get(`/api/srs/${sr.id}/intake`)).json()) as {
        dueDate: string;
        intakeAt: string;
      };
      const highOffsetMs = slaHours * 0.75 * 60 * 60 * 1000;
      const dueAfterIntake = new Date(afterIntake.dueDate).getTime();
      expect(dueAfterIntake).toBeGreaterThanOrEqual(sentAt + highOffsetMs);
      expect(dueAfterIntake).toBeLessThanOrEqual(respondedAt + highOffsetMs);

      // ── 2) 우선순위 상향: CRITICAL(0.5배) ────────────────────────────────
      // 재계산 기준은 intakeAt 이라 시각이 확정된다 → 밀리초까지 정확히 대조할 수 있다.
      // 이 등식이 깨지는 대표적 경우가 소수 시간 절삭이다(slaHours 5 × 0.5 = 2.5시간).
      const patch = await api.patch(`/api/srs/${sr.id}/intake`, {
        data: { actualPriority: 'CRITICAL' },
      });
      expect(patch.status(), `우선순위 상향 실패: ${(await patch.text()).slice(0, 300)}`).toBe(200);

      const afterPatch = (await (await api.get(`/api/srs/${sr.id}/intake`)).json()) as {
        dueDate: string;
        intakeAt: string;
        actualPriority: string;
      };
      expect(afterPatch.actualPriority).toBe('CRITICAL');
      expect(new Date(afterPatch.dueDate).getTime()).toBe(
        new Date(afterPatch.intakeAt).getTime() + slaHours * 0.5 * 60 * 60 * 1000
      );

      // 배율이 실제로 적용됐다면 CRITICAL 의 마감일은 HIGH 보다 반드시 이르다.
      expect(new Date(afterPatch.dueDate).getTime()).toBeLessThan(dueAfterIntake);
    } finally {
      await context.close();
    }
  });
});
