import { expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Organization 페이지 테스트
 * - 조직도 뷰 확인
 * - 고객사별 사용자 트리 구조
 * - 사용자 Drag & Drop 재배정 (구현되어 있을 경우)
 *
 * ⚠️ networkidle 금지
 * 로그인 상태의 모든 페이지는 루트 레이아웃(src/app/layout.tsx → ClientLayout →
 * RealtimeProvider → src/hooks/use-realtime-status.ts)에서 /api/realtime SSE 스트림을
 * 계속 열어 둔다. 그래서 "500ms 동안 네트워크 요청 0건"이라는 networkidle 조건은
 * 영원히 성립하지 않고 waitForLoadState('networkidle') 는 항상 30초 뒤 타임아웃난다.
 * 대신 (1) domcontentloaded 로 내비게이션만 확정하고, (2) 실제로 필요한 것
 * (본문/트리 요소 표시)을 기다린다. expect().toBeVisible() 은 자동 재시도한다.
 * isVisible() 은 대기하지 않으므로(timeout 옵션 무시) 조건부 요소는
 * waitFor({ state: 'visible' }).catch(() => {}) 로 기다린 뒤 판단한다.
 */

/**
 * 조직도 본문이 실제로 그려질 때까지 기다린다.
 *
 * 이 화면은 클라이언트에서 고객사/사용자를 받아 그리므로 처음에는 main 안에
 * "로딩 중..." 만 있다. main 가시성만 기다리면 그 상태에서 통과해 버려서,
 * 뒤따르는 단언이 아직 비어 있는 DOM 을 보고 실패한다.
 */
async function expectOrganizationLoaded(page: Page) {
  await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('로딩 중...')).toHaveCount(0, { timeout: 30000 });
}

/**
 * dnd-kit 드래그를 실제로 발생시킨다.
 *
 * Playwright 의 `locator.dragTo()` 는 여기서 동작하지 않는다. OrganizationTree 는
 * PointerSensor 를 `activationConstraint: { distance: 8 }` 로 쓰는데, dragTo 는
 * 중간 이동 없이 down→up 에 가깝게 움직여 8px 임계값을 넘기지 못하고 드래그가
 * 시작조차 하지 않는다(예전 테스트가 여기서 타임아웃났다).
 * 임계값을 확실히 넘기고 목적지까지 여러 단계로 움직인다.
 */
async function dragTo(page: Page, handle: Locator, target: Locator) {
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('드래그 원본 또는 대상의 위치를 구할 수 없습니다.');

  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // 8px 활성화 임계값을 넘긴다.
  await page.mouse.move(startX + 20, startY, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
}

test.describe('Organization 페이지', () => {
  test('Organization 페이지 접근', async ({ page }) => {
    await page.goto('/organization', { waitUntil: 'domcontentloaded' });

    // 페이지 콘텐츠 확인
    const mainContent = page.locator('main, [role="main"]');
    await expect(mainContent).toBeVisible();

    console.log('✅ Organization 페이지 접근 성공');
  });

  test('조직도 트리 구조 확인', async ({ page }) => {
    await page.goto('/organization', { waitUntil: 'domcontentloaded' });
    await expectOrganizationLoaded(page);

    // 트리 구조 또는 카드 레이아웃 확인
    // OrganizationTree renders a list of cards with class "space-y-2" wrapper
    // We look for client card headers which contain "사용자 추가" button or client name
    const treeOrCards = page.locator('.space-y-2 > .border, .sr-card-template').first();
    await expect(treeOrCards).toBeVisible({ timeout: 10000 });

    // 화면의 고객사 카드 수를 API 와 대조한다.
    // 예전에는 '사용자 추가' 버튼 수를 세고 `toBeGreaterThanOrEqual(0)` 로 끝냈다 —
    // 개수는 언제나 0 이상이라 조직도가 통째로 비어도 통과하는 단언이었다.
    const response = await page.request.get('/api/clients?limit=100');
    expect(response.status()).toBe(200);
    const clients = (await response.json()).data as Array<{ id: string }>;

    await expect(page.locator('.space-y-2 > .border')).toHaveCount(clients.length);
  });

  test('고객사별 사용자 목록 확인', async ({ page }) => {
    await page.goto('/organization', { waitUntil: 'domcontentloaded' });
    await expectOrganizationLoaded(page);

    // 첫 번째 고객사 찾기
    // We assume client rows are div.border.rounded-lg
    const firstClient = page.locator('.space-y-2 > .border').first();
    await expect(firstClient).toBeVisible({ timeout: 10000 });

    // 시드 계약상 TEST001 에는 사용자가 있다. "첫 번째 카드" 에 기대지 않고
    // 사용자를 가진 고객사를 API 로 정한 뒤 그 카드를 펼친다.
    const listed = await page.request.get('/api/clients?limit=100');
    const clients = (await listed.json()).data as Array<{ id: string; name: string }>;

    // 헤더의 "N명" 배지는 `_count.users`(전체)이고, 펼쳤을 때 그려지는 목록은
    // /api/clients/[id] 가 **ADMIN 역할 사용자를 제외**한 결과다(client.service 의
    // filteredUsers). 그래서 화면에 몇 명이 나와야 하는지는 상세 API 가 답이다.
    let target: { name: string; expected: number } | undefined;
    for (const client of clients) {
      const detail = await page.request.get(`/api/clients/${client.id}`);
      if (!detail.ok()) continue;
      const users = ((await detail.json()).users ?? []) as unknown[];
      if (users.length > 0) {
        target = { name: client.name, expected: users.length };
        break;
      }
    }
    expect(target, '사용자를 가진 고객사가 하나도 없습니다 — 시드가 바뀌었습니다.').toBeDefined();

    const card = page.locator('.space-y-2 > .border').filter({ hasText: target!.name }).first();
    await expect(card).toBeVisible();
    await card.locator('button').first().click();

    // 예전에는 `toBeGreaterThanOrEqual(0)` 이라 0명이 그려져도 통과했다.
    // 상세 API 가 말한 인원수와 정확히 맞아야 한다.
    await expect(card.locator('.cursor-grab')).toHaveCount(target!.expected);
  });
  test('사용자 Drag & Drop 재배정 (기능 존재 시)', async ({ page }) => {
    await page.goto('/organization', { waitUntil: 'domcontentloaded' });
    await expectOrganizationLoaded(page);

    // 드래그 핸들은 **펼쳐진** 고객사 안에서만 렌더된다(OrganizationTree 의 isExpanded).
    // 예전에는 첫 번째 고객사만 펼쳤는데, 그 자리에 소속 사용자가 0명인 고객사가 오면
    // 핸들이 없어 그대로 스킵됐다. 목록 순서에 기대지 않고 "사용자를 가진 고객사"를 찾는다.
    //
    // 전부 펼치지 않는 이유: 카드가 길어지면 목적지 카드가 뷰포트 밖으로 밀려나고,
    // mouse.move 는 자동 스크롤을 하지 않아 드롭이 아예 잡히지 않는다.
    const clientCards = page.locator('.space-y-2 > .border');
    await expect(clientCards.first()).toBeVisible({ timeout: 10000 });

    // 이동하려면 고객사가 최소 2개 있어야 한다(출발지 + 목적지).
    const clientCount = await clientCards.count();
    expect(clientCount).toBeGreaterThanOrEqual(2);

    // 1) 실제로 드래그할 사용자가 나오는 고객사를 찾는다.
    //
    //    헤더의 "N명" 배지를 믿으면 안 된다 — 배지는 `client._count.users`(필터 없는 전체)이고,
    //    펼쳤을 때 그려지는 목록은 `/api/clients/[id]` 가 **ADMIN 역할 사용자를 제외**한
    //    결과다(client.service.ts 의 filteredUsers). 소속이 ADMIN 뿐인 고객사는
    //    배지가 "1명" 인데 드래그 핸들이 0개다. CI 시드가 정확히 그런 분포를 만든다.
    //
    //    그래서 펼쳐 보고 핸들이 실제로 나오는지로 판단한다. 아니면 도로 접는다 —
    //    카드가 길어지면 목적지가 뷰포트 밖으로 밀려서 mouse.move 가 닿지 못한다
    //    (Playwright 의 마우스 이동은 자동 스크롤을 하지 않는다).
    let sourceIndex = -1;
    for (let i = 0; i < clientCount; i++) {
      const card = clientCards.nth(i);
      const expandToggle = card.locator('button').first();

      await expandToggle.click();
      // 펼치면 그 시점에 사용자 목록을 fetch 한다(organization/page.tsx). 응답을 기다린다.
      const handle = card.locator('.cursor-grab').first();
      await handle.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});

      if (await handle.isVisible().catch(() => false)) {
        sourceIndex = i;
        break;
      }
      await expandToggle.click();
    }

    // 시드는 드래그 가능한(= ADMIN 이 아닌) 사용자를 가진 고객사를 최소 하나 만든다.
    // 하나도 없으면 시드가 바뀌었거나 목록 필터가 회귀한 것이다.
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    // Drop 대상 = 고객사 카드 자체다. dnd-kit 의 useDroppable 은 setNodeRef 만 걸 뿐
    // 클래스나 data 속성을 붙이지 않으므로, 예전 셀렉터
    // `[class*="drop"], [data-droppable="true"]` 는 처음부터 아무것도 찾지 못했다.
    // **출발지와 다른** 고객사로 옮겨야 확인 다이얼로그가 뜬다(같은 고객사면 토스트만 뜬다).
    const targetIndex = sourceIndex === 0 ? 1 : 0;
    const dropTarget = clientCards.nth(targetIndex);
    const sourceCard = clientCards.nth(sourceIndex);
    const draggableUser = sourceCard.locator('.cursor-grab').first();
    await expect(draggableUser).toBeVisible();
    await expect(dropTarget).toBeVisible();

    // 재배정 확인은 Radix **AlertDialog** 라 role 이 `alertdialog` 다.
    // 예전 셀렉터 `[role="dialog"], .dialog` 로는 영영 찾지 못한다.
    const confirmDialog = page.getByRole('alertdialog');

    // 이 스펙은 **재배정을 실제로 확정하지 않는다.** 다이얼로그를 열고 취소만 한다.
    //
    // 확정까지 하면 시드가 만든 소속이 바뀌고, 그 소속을 계약으로 단언하는 다른 스펙이
    // 깨진다 — e2e/roles/client-admin.spec.ts 의 "CLIENT_ADMIN 의 소속이 TEST001" 이
    // 실제로 그렇게 무너졌다. 되돌리는 단계를 붙여도 앞 단계가 실패하면 되돌리지 못한
    // 채로 끝나므로, 공유 DB 를 쓰는 스위트에서는 애초에 바꾸지 않는 편이 안전하다.
    //
    // 확정 경로(PATCH /api/users/[id]/client)는 라우트 테스트가 따로 덮는다. 여기서
    // 지키려는 것은 드래그 상호작용 → 드롭 인식 → 확인 다이얼로그로 이어지는 UI 연결이다.

    // 1. 드래그하면 확인 다이얼로그가 뜨고, 취소하면 아무 일도 일어나지 않아야 한다.
    await dragTo(page, draggableUser, dropTarget);
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog
      .locator('button')
      .filter({ hasText: /취소|Cancel/i })
      .first()
      .click();
    await expect(confirmDialog).not.toBeVisible();

    // 2. 취소 뒤에도 다음 드래그가 되어야 한다.
    //    예전에 "한 번 다이얼로그를 띄우면 그 뒤 드래그가 먹지 않는" 버그가 있었고,
    //    이 단계가 그 회귀 가드다.
    await dragTo(page, sourceCard.locator('.cursor-grab').first(), dropTarget);
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });
    await confirmDialog
      .locator('button')
      .filter({ hasText: /취소|Cancel/i })
      .first()
      .click();
    await expect(confirmDialog).not.toBeVisible();
  });
});
