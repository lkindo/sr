import { expect, test } from '@playwright/test';

import prisma from '../src/lib/prisma';

import { apiRequestWithRateLimitRetry, createTestSR } from './helpers/test-helpers';

// 이 테스트는 setup 프로젝트에서 생성한 인증 상태를 사용합니다
// playwright.config.ts에서 storageState가 설정되어 있어야 합니다
// 기본 storageState(playwright/.auth/user.json)는 global-setup.ts 기준 admin@example.com(ADMIN)입니다

let srId: string; // 모든 describe 블록에서 공유하기 위해 상위 스코프로 격상

test.describe('SR 권한 및 접수 기능 테스트', () => {
  test.beforeAll(async ({ browser }) => {
    // 테스트용 SR 생성 (Manager 권한 필요)
    // 생성이 실패하면 이후 권한 검증이 전부 무의미하므로 예외를 삼키지 않고 그대로 터뜨린다.
    // (예전에는 try/catch 로 삼킨 뒤 test.skip 으로 넘어가서, SR 생성이 깨져도 조용히 통과했다.)
    const page = await browser.newPage({ storageState: './playwright/.auth/manager.json' });
    try {
      srId = await createTestSR(page, {
        title: `권한 테스트용 SR ${Date.now()}`,
        description: '권한 및 접수 기능 테스트를 위한 자동 생성 SR입니다.',
      });
    } finally {
      await page.close();
    }
    expect(srId, '권한 테스트용 SR 생성에 실패했습니다.').toBeTruthy();
  });

  test('SR 목록 페이지 접근 및 기본 UI 확인', async ({ page }) => {
    // 인증 상태가 이미 로드되어 있으므로 바로 페이지로 이동
    const responsePromise = page
      .waitForResponse(
        (resp) => resp.url().includes('/api/srs') && resp.request().method() === 'GET',
        { timeout: 10000 }
      )
      .catch(() => null);
    await page.goto('/srs');
    await responsePromise;

    // 테이블 확인
    await expect(page.locator('table:not([data-skeleton]):visible')).toBeVisible({
      timeout: 10000,
    });

    // 등록 버튼 확인
    const createButton = page.getByRole('button', { name: /등록|새 SR|Create/i }).first();
    await expect(createButton).toBeVisible();
  });

  test('SR 상세 페이지: ADMIN 에게 노출되어야 하는 액션 버튼 확인', async ({ page }) => {
    const detailResponsePromise = page
      .waitForResponse(
        (resp) => resp.url().includes(`/api/srs/${srId}`) && resp.request().method() === 'GET',
        { timeout: 10000 }
      )
      .catch(() => null);
    await page.goto(`/srs/${srId}`);
    await detailResponsePromise;

    // 상세 정보 확인
    await expect(page.locator('h3:has-text("상세 정보")')).toBeVisible({ timeout: 5000 });

    // REQUESTED 상태 + ADMIN 이면 아래 버튼들이 반드시 있어야 한다.
    // (src/components/srs/SRStatusActions.tsx 의 REQUESTED 분기 및
    //  src/app/(dashboard)/srs/[id]/page.tsx 의 삭제 버튼 role 가드)
    // 버튼 개수만 세던 기존 검증은 어떤 회귀도 잡지 못했다.
    await expect(page.getByRole('button', { name: '접수하기' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '거절' })).toBeVisible();
    await expect(page.getByRole('button', { name: '수정' })).toBeVisible();
    await expect(page.getByRole('button', { name: '삭제' })).toBeVisible();
  });

  test('접수 페이지 UI 확인', async ({ page }) => {
    const intakeResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes(`/api/srs/${srId}/intake`) && resp.request().method() === 'GET',
      { timeout: 20000 }
    );
    await page.goto(`/srs/${srId}/intake`);

    const intakeResponse = await intakeResponsePromise;
    expect(
      intakeResponse.status(),
      `ADMIN 이 REQUESTED 상태 SR 의 접수 정보를 조회하지 못했습니다 (${intakeResponse.status()}).`
    ).toBe(200);

    // REQUESTED 상태이므로 '접수 모드' 헤딩이 떠야 한다 (수정 모드가 아니다).
    await expect(page.getByRole('heading', { name: 'SR 접수 처리' })).toBeVisible({
      timeout: 15000,
    });

    // 접수 폼 필수 입력 항목이 렌더링되어야 한다.
    await expect(page.getByText('실제 우선순위 *', { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('combobox', { name: '담당자 *' })).toBeVisible();
  });

  test('SR 삭제 권한 확인 및 Audit Log 적재 검증 (ADMIN)', async ({ page }) => {
    test.setTimeout(120_000);

    // 이 테스트는 대상 SR을 파괴하므로 공용 srId 를 쓰지 않고 전용 SR을 새로 만든다.
    // (fullyParallel 환경에서 같은 워커의 다른 테스트가 삭제된 SR을 참조하는 것을 막는다.)
    const targetSrId = await createTestSR(page, {
      title: `삭제 검증용 SR ${Date.now()}`,
      description: '삭제 권한 및 감사 로그 검증을 위한 자동 생성 SR입니다.',
    });

    await page.goto(`/srs/${targetSrId}`);

    // ADMIN은 삭제 버튼이 보여야 함
    const deleteButton = page.getByRole('button', { name: '삭제' });
    await expect(deleteButton).toBeVisible({ timeout: 30000 });

    await deleteButton.click();

    // 확인 다이얼로그는 반드시 떠야 한다. (뜨지 않으면 삭제가 일어나지 않은 것이므로 실패)
    const dialog = page.getByRole('dialog');
    await expect(dialog, 'SR 삭제 확인 다이얼로그가 열리지 않았습니다.').toBeVisible({
      timeout: 5000,
    });

    // 삭제는 Server Action(deleteSRAction)으로 수행되고, 성공 시에만 router.push('/srs') 가 실행된다
    // (src/hooks/use-sr.ts 의 useDeleteSR). 따라서 목록으로의 이동 자체가 성공 신호다.
    // 기존의 /\/srs/ 패턴은 상세 URL(/srs/{id})에도 매칭되어 리디렉션이 없어도 통과했다.
    await dialog.getByRole('button', { name: '삭제' }).click();
    await page.waitForURL((url) => url.pathname === '/srs', { timeout: 20000 });

    // 서버 상태 검증: SR 행이 실제로 사라져야 한다.
    const deletedSR = await prisma.sR.findUnique({ where: { id: targetSrId } });
    expect(deletedSR, '삭제 요청이 200 이었지만 SR 행이 그대로 남아 있습니다.').toBeNull();

    // Audit Log 적재 검증 및 스키마/데이터 정합성 정밀 검증 (최대 5초 폴링 대기)
    let auditLogRecord = null;
    for (let i = 0; i < 10; i++) {
      auditLogRecord = await prisma.auditLog.findFirst({
        where: {
          actionType: 'DELETE',
          targetEntity: 'SR',
          targetId: targetSrId,
        },
      });
      if (auditLogRecord) {
        break;
      }
      await page.waitForTimeout(500);
    }

    // 감사 로그가 존재해야 함
    expect(auditLogRecord).not.toBeNull();
    expect(auditLogRecord).toBeDefined();

    // 감사 로그 스키마 및 주요 세부 필드 검증
    expect(auditLogRecord!.id).toBeDefined();
    expect(typeof auditLogRecord!.id).toBe('string');
    expect(auditLogRecord!.userId).toBeDefined();
    expect(typeof auditLogRecord!.userId).toBe('string');
    expect(auditLogRecord!.actionType).toBe('DELETE');
    expect(auditLogRecord!.targetEntity).toBe('SR');
    expect(auditLogRecord!.targetId).toBe(targetSrId);
    expect(auditLogRecord!.createdAt).toBeInstanceOf(Date);

    // changes 필드 구조 검증 (DB에 직렬화된 문자열로 적재되므로 역직렬화 필요)
    expect(auditLogRecord!.changes).toBeDefined();
    expect(auditLogRecord!.changes).not.toBeNull();

    const changes =
      typeof auditLogRecord!.changes === 'string'
        ? JSON.parse(auditLogRecord!.changes)
        : auditLogRecord!.changes;

    expect(changes).toBeDefined();
    expect(changes).not.toBeNull();
    expect(changes.id).toBe(targetSrId);
    expect(changes.title).toBeDefined();
    expect(changes.srNumber).toBeDefined();
  });
});

test.describe('SR 권한 테스트 (ENGINEER)', () => {
  // 엔지니어 권한으로 테스트 (파일이 없으면 실패할 수 있음 - setup 의존)
  test.use({ storageState: './playwright/.auth/engineer.json' });

  const engineerEmail = process.env.TEST_ENGINEER_EMAIL || 'engineeruser@example.com';

  /**
   * ENGINEER 에게 배정되지 않은 SR 하나를 DB 에서 확정적으로 고른다.
   *
   * canReadSR/canUpdateSR(src/lib/policies.ts)은 ENGINEER 에 대해
   * `sr.assigneeId === user.id` 만 허용하므로, 배정되지 않은 SR 이어야
   * 403 검증이 의미를 갖는다. (기존처럼 "가장 최근 SR"을 집으면 병렬 워커가
   * 엔지니어에게 배정된 SR 을 만들거나 그 SR 을 삭제했을 때 조용히 의미를 잃는다.
   *  가장 오래된 SR = 시드 SR 이므로 다른 테스트가 지우지 않는다.)
   */
  async function pickForeignSR() {
    const engineer = await prisma.user.findUnique({ where: { email: engineerEmail } });
    expect(
      engineer,
      `엔지니어 계정(${engineerEmail})이 없습니다. prisma/seed.ts 를 먼저 실행하세요.`
    ).not.toBeNull();

    const sr = await prisma.sR.findFirst({
      where: {
        OR: [{ assigneeId: null }, { assigneeId: { not: engineer!.id } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(
      sr,
      '엔지니어에게 배정되지 않은 SR 이 하나도 없어 권한 격리를 검증할 수 없습니다.'
    ).not.toBeNull();

    return sr!;
  }

  test.fixme('SR 상세 화면에서 ENGINEER 에게 삭제 버튼이 노출되지 않는다', async ({ page }) => {
    // 필요한 픽스처: "engineeruser@example.com 에게 assigneeId 로 배정된 SR".
    // prisma/seed.ts 는 SR-2024-001~003 을 모두 admin 에게 배정/미배정으로 만들기 때문에
    // 엔지니어가 열 수 있는 SR 상세 화면이 존재하지 않는다.
    // 배정되지 않은 SR 로 들어가면 화면 자체가 '접근 불가'가 되어
    // "삭제 버튼이 없다"가 권한 통제가 아니라 단순 렌더 실패로 통과해 버린다.
    // 시드에 엔지니어 배정 SR 이 추가되면 아래 본문을 그대로 살릴 수 있다.
    const firstSRLink = page.locator('table tbody tr a').first();
    const href = await firstSRLink.getAttribute('href');
    await page.goto(href!);

    // 상세 화면이 실제로 렌더링된 뒤에만 '삭제 버튼 부재'가 의미를 갖는다.
    await expect(page.locator('h3:has-text("상세 정보")')).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: '삭제' })).toHaveCount(0);
  });

  test('배정되지 않은 SR 상세 API 접근은 403 으로 차단된다 (음성 테스트)', async ({ request }) => {
    const target = await pickForeignSR();

    const response = await apiRequestWithRateLimitRetry(request, 'get', `/api/srs/${target.id}`);

    expect(
      response.status(),
      `ENGINEER 가 배정되지 않은 SR(${target.srNumber})을 조회할 수 있습니다. ` +
        `응답: ${await response.text()}`
    ).toBe(403);
  });

  test('배정되지 않은 SR 수정 API 접근은 403 으로 차단되고 데이터도 변하지 않는다 (음성 테스트)', async ({
    request,
  }) => {
    const target = await pickForeignSR();
    const originalTitle = target.title;
    const originalDescription = target.description;

    const response = await apiRequestWithRateLimitRetry(request, 'patch', `/api/srs/${target.id}`, {
      data: {
        title: '해킹 시도된 제목',
        description: '허가받지 않은 엔지니어의 수정 시도입니다.',
      },
    });

    expect(
      response.status(),
      `ENGINEER 가 배정되지 않은 SR(${target.srNumber})을 수정할 수 있습니다. ` +
        `응답: ${await response.text()}`
    ).toBe(403);

    // 응답 코드뿐 아니라 실제 데이터가 그대로인지 확인한다.
    const after = await prisma.sR.findUnique({ where: { id: target.id } });
    expect(after, '검증 대상 SR 이 사라졌습니다.').not.toBeNull();
    expect(after!.title, '403 을 반환했지만 제목이 실제로 변경되었습니다.').toBe(originalTitle);
    expect(after!.description, '403 을 반환했지만 설명이 실제로 변경되었습니다.').toBe(
      originalDescription
    );
  });
});
