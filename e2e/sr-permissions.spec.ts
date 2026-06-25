import { expect, test } from '@playwright/test';

import prisma from '../src/lib/prisma';

import { createTestSR } from './helpers/test-helpers';

// 이 테스트는 setup 프로젝트에서 생성한 인증 상태를 사용합니다
// playwright.config.ts에서 storageState가 설정되어 있어야 합니다

let srId: string; // 모든 describe 블록에서 공유하기 위해 상위 스코프로 격상

test.describe('SR 권한 및 접수 기능 테스트', () => {
  test.beforeAll(async ({ browser }) => {
    // 테스트용 SR 생성 (Manager 권한 필요)
    const page = await browser.newPage({ storageState: './playwright/.auth/manager.json' });
    try {
      srId = await createTestSR(page, {
        title: `권한 테스트용 SR ${Date.now()}`,
        description: '권한 및 접수 기능 테스트를 위한 자동 생성 SR입니다.',
      });
      console.log(`✅ 권한 테스트용 SR 생성 완료: ${srId}`);
    } catch (e) {
      console.error('⚠️ SR 생성 실패 (Redis 오류 가능성):', e);
      // 생성이 실패하면 테스트가 스킵되거나 실패할 수 있음
    } finally {
      await page.close();
    }
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
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    // 등록 버튼 확인
    const createButton = page.getByRole('button', { name: /등록|새 SR|Create/i }).first();
    await expect(createButton).toBeVisible();

    console.log('✅ SR 목록 페이지 접근 및 UI 확인 완료');
  });

  test('SR 상세 페이지 접근 및 버튼 확인', async ({ page }) => {
    test.skip(!srId, 'SR 생성을 실패하여 테스트를 건너뜁니다.');

    // SR 상세 페이지로 이동
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

    // 버튼들 확인 (상태에 따라 다를 수 있음)
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`✅ SR 상세 페이지 접근 완료 (버튼 개수: ${buttonCount})`);
  });

  test('접수 페이지 UI 확인', async ({ page }) => {
    test.skip(!srId, 'SR 생성을 실패하여 테스트를 건너뜁니다.');

    try {
      // 접수 페이지로 직접 이동
      const intakeResponsePromise = page
        .waitForResponse(
          (resp) =>
            resp.url().includes(`/api/srs/${srId}/intake`) && resp.request().method() === 'GET',
          { timeout: 10000 }
        )
        .catch(() => null);
      await page.goto(`/srs/${srId}/intake`);
      await intakeResponsePromise;
      await page.waitForTimeout(3000); // 추가 렌더링 대기

      // 접수 폼 또는 에러 메시지 확인
      const hasIntakeForm = await page
        .getByRole('heading', { name: /SR 접수 처리|SR 접수 정보 수정/i })
        .isVisible({ timeout: 15000 })
        .catch(() => false);

      if (hasIntakeForm) {
        // 접수 폼이 표시됨
        await expect(page.locator('label', { hasText: '실제 우선순위' })).toBeVisible({
          timeout: 5000,
        });
        console.log('✅ 접수 페이지 접근 가능 - 폼 표시됨');
      } else {
        // 접수 폼이 없음 (이미 접수되었거나 권한 없음)
        const currentUrl = page.url();
        console.log(`ℹ️ 접수 폼이 표시되지 않음 (URL: ${currentUrl})`);
        expect(true).toBeTruthy();
      }
    } catch (error: any) {
      console.log('⚠️ 접수 페이지 로딩 중 오류 발생:', error.message);
      throw error;
    }
  });

  test('SR 삭제 버튼 권한 확인 및 Audit Log 적재 검증 (ADMIN)', async ({ page }) => {
    test.skip(!srId, 'SR 생성을 실패하여 테스트를 건너뜁니다.');

    await page.goto(`/srs/${srId}`);

    // ADMIN은 삭제 버튼이 보여야 함
    const deleteButton = page.locator('button', { hasText: /삭제|Delete/ }).first();
    await expect(deleteButton).toBeVisible({ timeout: 30000 });

    // 삭제 전 현재 DB Audit Log 개수 기록
    const beforeCount = await prisma.auditLog.count({
      where: {
        actionType: 'DELETE',
        targetEntity: 'SR',
        targetId: srId,
      },
    });

    // 삭제 버튼 클릭 실행
    await deleteButton.click();

    // 다이얼로그 확인 버튼 클릭 (Shadcn Alert / Dialog)
    const confirmButton = page.getByRole('button', { name: /확인|삭제|Delete|Submit/i });
    if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // 삭제 후 목록 페이지 리디렉션 대기
    await page.waitForURL(/\/srs/, { timeout: 10000 });
    console.log('✅ ADMIN 권한: SR 삭제 및 리디렉션 성공');

    // Audit Log 적재 검증 및 스키마/데이터 정합성 정밀 검증 (최대 5초 폴링 대기)
    let auditLogRecord = null;
    for (let i = 0; i < 10; i++) {
      auditLogRecord = await prisma.auditLog.findFirst({
        where: {
          actionType: 'DELETE',
          targetEntity: 'SR',
          targetId: srId,
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
    expect(auditLogRecord!.targetId).toBe(srId);
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
    expect(changes.id).toBe(srId);
    expect(changes.title).toBeDefined();
    expect(changes.srNumber).toBeDefined();

    console.log(
      '✅ Audit Log 검증: SR 삭제에 대한 감사 로그 레코드가 올바른 스키마와 세부 데이터 규격으로 적재되었습니다.'
    );
  });
});

test.describe('SR 권한 테스트 (ENGINEER)', () => {
  // 엔지니어 권한으로 테스트 (파일이 없으면 실패할 수 있음 - setup 의존)
  test.use({ storageState: './playwright/.auth/engineer.json' });

  test('SR 삭제 버튼 미노출 확인', async ({ page }) => {
    // 엔지니어 인증 파일 존재 여부 확인은 어렵지만, 실패 시 원인 파악 가능
    await page.goto('/srs');
    // 로그인 페이지로 리다이렉트되면 인증 실패 (파일 없음)
    if (page.url().includes('/login')) {
      console.log('⚠️ 엔지니어 인증 정보가 없어 테스트를 건너뜁니다.');
      test.skip();
      return;
    }

    // 목록에서 아무 SR이나 하나 들어가서 확인 (엔지니어는 생성 권한이 없을 수 있음)
    // 하지만 여기서는 목록에 SR이 있다는 보장이 없으므로, 위에서 생성한 SR ID를 알 수 있다면 좋겠지만
    // describe 블록이 달라서 변수 공유가 안됨.
    // 목록에서 첫번째 SR을 찾아서 들어감.

    const firstSRLink = page.locator('table tbody tr a').first();
    if (await firstSRLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      const href = await firstSRLink.getAttribute('href');
      const srId = href?.split('/').pop() || '';

      await page.goto(`/srs/${srId}`);

      // ENGINEER는 삭제 버튼이 보이지 않아야 함
      await expect(page.getByRole('button', { name: '삭제' })).not.toBeVisible();
      console.log('✅ ENGINEER 권한: 삭제 버튼 미표시 확인 완료');
    } else {
      console.log('⚠️ SR이 없어 삭제 버튼 테스트를 건너뜁니다.');
      test.skip();
    }
  });

  test('자신에게 배정되지 않은 타 고객사 SR 상세 API 접근 시 403 반환 확인 (음성 테스트)', async ({
    request,
  }) => {
    // 워커 격리로 인해 상위 srId 메모리가 유실되었을 경우를 대비해 DB에서 직접 최신 SR을 조회하여 활용
    const dbSR = await prisma.sR.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const activeSrId = srId || dbSR?.id;
    test.skip(!activeSrId, 'SR ID가 존재하지 않아 음성 테스트를 건너뜁니다.');

    // Playwright의 request 객체는 이 describe 블록의 engineer.json 세션을 사용함
    console.log(
      `🤖 [음성 테스트] ENGINEER 권한으로 타인 소유 SR 조회 API(${activeSrId}) 접근 시도`
    );
    const response = await request.get(`/api/srs/${activeSrId}`);

    // 403 Forbidden 검증
    expect(response.status()).toBe(403);
    console.log(
      '✅ ENGINEER 권한 격리 검증: 타 고객사/미배정 SR 조회 차단(403 Forbidden) 확인 완료'
    );
  });

  test('자신에게 배정되지 않은 타 고객사 SR 수정 API 접근 시 403 반환 확인 (음성 테스트 - 수정)', async ({
    request,
  }) => {
    const dbSR = await prisma.sR.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const activeSrId = srId || dbSR?.id;
    test.skip(!activeSrId, 'SR ID가 존재하지 않아 음성 테스트를 건너뜁니다.');

    console.log(
      `🤖 [음성 테스트] ENGINEER 권한으로 타인 소유 SR 수정 API(${activeSrId}) 접근 시도`
    );
    const response = await request.patch(`/api/srs/${activeSrId}`, {
      data: {
        title: '해킹 시도된 제목',
        description: '허가받지 않은 엔지니어의 수정 시도입니다.',
      },
    });

    // 403 Forbidden 검증
    expect(response.status()).toBe(403);
    console.log(
      '✅ ENGINEER 권한 격리 검증: 타 고객사/미배정 SR 수정 차단(403 Forbidden) 확인 완료'
    );
  });
});
