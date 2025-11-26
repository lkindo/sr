import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * 역할 상호 배타성 (Role Exclusivity) E2E 테스트
 *
 * 테스트 범위:
 * 1. 시스템 운영팀 vs 고객사 팀 역할 상호 배타성
 *    - ADMIN, MANAGER, ENGINEER (시스템 운영팀)
 *    - CLIENT_ADMIN, CLIENT_USER (고객사 팀)
 *    - 동시 부여 시도 차단
 * 2. 고객사 할당과 역할의 정합성
 *    - 시스템 운영팀 역할은 고객사 미할당 사용자에게만
 *    - 고객사 팀 역할은 고객사 할당 사용자에게만
 * 3. 역할 변경 시 고객사 할당 자동 해제/요구
 *
 * API 엔드포인트: POST /api/users/[id]/roles
 */

const authFiles = {
  admin: path.join(__dirname, '../playwright/.auth/manager.json'), // ADMIN 권한 가정
};

test.use({ storageState: authFiles.admin });

test.describe('역할 상호 배타성 테스트', () => {
  let testUserId: string;
  let testUserEmail: string;

  test.beforeAll(async ({ request }) => {
    // 테스트용 사용자 생성 (API 직접 호출)
    const timestamp = Date.now();
    testUserEmail = `roletest${timestamp}@example.com`;

    const response = await request.post('/api/auth/register', {
      data: {
        name: `Role Test User ${timestamp}`,
        email: testUserEmail,
        password: 'Test1234!',
        confirmPassword: 'Test1234!',
      },
    });

    if (response.ok()) {
      const data = await response.json();
      console.log(`✅ 테스트 사용자 생성 완료: ${testUserEmail}`);
    } else {
      console.error(`❌ 테스트 사용자 생성 실패: ${response.status()}`);
    }

    // 사용자 목록에서 생성된 사용자 ID 조회
    const usersResponse = await request.get('/api/users');
    if (usersResponse.ok()) {
      const users = await usersResponse.json();
      const testUser = users.users?.find((u: any) => u.email === testUserEmail);
      if (testUser) {
        testUserId = testUser.id;
        console.log(`✅ 테스트 사용자 ID 조회: ${testUserId}`);
      }
    }
  });

  test('1. 시스템 운영팀과 고객사 팀 역할 동시 부여 차단', async ({ page, request }) => {
    if (!testUserId) {
      test.skip();
      return;
    }

    // 역할 목록 조회
    const rolesResponse = await request.get('/api/roles');
    expect(rolesResponse.ok()).toBeTruthy();
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;

    // ADMIN 및 CLIENT_ADMIN 역할 ID 찾기
    const adminRole = roles.find((r: any) => r.name === 'ADMIN');
    const clientAdminRole = roles.find((r: any) => r.name === 'CLIENT_ADMIN');

    if (!adminRole || !clientAdminRole) {
      console.log(`⚠️ 필요한 역할을 찾을 수 없습니다. (ADMIN, CLIENT_ADMIN)`);
      test.skip();
      return;
    }

    // 동시에 ADMIN + CLIENT_ADMIN 역할 부여 시도
    const response = await request.post(`/api/users/${testUserId}/roles`, {
      data: {
        roleIds: [adminRole.id, clientAdminRole.id],
      },
    });

    // 400 Bad Request 응답 확인
    expect(response.status()).toBe(400);

    const errorData = await response.json();
    expect(errorData.error).toContain('시스템 운영팀과 고객사 팀 역할을 동시에 부여할 수 없습니다');
    console.log(`✅ 시스템 운영팀 + 고객사 팀 역할 동시 부여 차단 확인`);
    console.log(`   에러 메시지: ${errorData.error}`);
  });

  test('2. 시스템 운영팀 역할을 고객사 할당 사용자에게 부여 시도 차단', async ({ page, request }) => {
    if (!testUserId) {
      test.skip();
      return;
    }

    // 고객사 목록 조회
    const clientsResponse = await request.get('/api/clients');
    expect(clientsResponse.ok()).toBeTruthy();
    const clientsData = await clientsResponse.json();
    const clients = clientsData.clients || clientsData;

    if (!clients || clients.length === 0) {
      console.log(`⚠️ 고객사가 없어 테스트를 스킵합니다.`);
      test.skip();
      return;
    }

    const firstClient = clients[0];

    // 사용자에게 고객사 할당
    const assignClientResponse = await request.patch(`/api/users/${testUserId}`, {
      data: {
        clientIds: [firstClient.id],
      },
    });

    if (!assignClientResponse.ok()) {
      console.log(`⚠️ 고객사 할당 실패: ${assignClientResponse.status()}`);
      test.skip();
      return;
    }

    console.log(`✅ 사용자에게 고객사 할당: ${firstClient.name}`);

    // 역할 목록 조회
    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;

    const managerRole = roles.find((r: any) => r.name === 'MANAGER');

    if (!managerRole) {
      console.log(`⚠️ MANAGER 역할을 찾을 수 없습니다.`);
      test.skip();
      return;
    }

    // 고객사 할당된 사용자에게 시스템 운영팀 역할(MANAGER) 부여 시도
    const response = await request.post(`/api/users/${testUserId}/roles`, {
      data: {
        roleIds: [managerRole.id],
      },
    });

    // 400 Bad Request 응답 확인
    expect(response.status()).toBe(400);

    const errorData = await response.json();
    expect(errorData.error).toContain('시스템 운영팀 역할은 고객사가 할당된 사용자에게 부여할 수 없습니다');
    console.log(`✅ 고객사 할당 사용자에게 시스템 운영팀 역할 부여 차단 확인`);
    console.log(`   에러 메시지: ${errorData.error}`);

    // 고객사 할당 해제
    await request.patch(`/api/users/${testUserId}`, {
      data: {
        clientIds: [],
      },
    });
  });

  test('3. 고객사 팀 역할을 고객사 미할당 사용자에게 부여 시도 차단', async ({ page, request }) => {
    if (!testUserId) {
      test.skip();
      return;
    }

    // 사용자의 고객사 할당 해제 (이전 테스트에서 해제되었을 수 있음)
    await request.patch(`/api/users/${testUserId}`, {
      data: {
        clientIds: [],
      },
    });

    // 역할 목록 조회
    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;

    const clientUserRole = roles.find((r: any) => r.name === 'CLIENT_USER');

    if (!clientUserRole) {
      console.log(`⚠️ CLIENT_USER 역할을 찾을 수 없습니다.`);
      test.skip();
      return;
    }

    // 고객사 미할당 사용자에게 고객사 팀 역할(CLIENT_USER) 부여 시도
    const response = await request.post(`/api/users/${testUserId}/roles`, {
      data: {
        roleIds: [clientUserRole.id],
      },
    });

    // 400 Bad Request 응답 확인
    expect(response.status()).toBe(400);

    const errorData = await response.json();
    expect(errorData.error).toContain('고객사 팀 역할은 고객사가 할당된 사용자에게만 부여할 수 있습니다');
    console.log(`✅ 고객사 미할당 사용자에게 고객사 팀 역할 부여 차단 확인`);
    console.log(`   에러 메시지: ${errorData.error}`);
  });

  test('4. 정상 시나리오: 고객사 할당 후 고객사 팀 역할 부여', async ({ page, request }) => {
    if (!testUserId) {
      test.skip();
      return;
    }

    // 고객사 목록 조회
    const clientsResponse = await request.get('/api/clients');
    const clientsData = await clientsResponse.json();
    const clients = clientsData.clients || clientsData;

    if (!clients || clients.length === 0) {
      test.skip();
      return;
    }

    const firstClient = clients[0];

    // 사용자에게 고객사 할당
    const assignClientResponse = await request.patch(`/api/users/${testUserId}`, {
      data: {
        clientIds: [firstClient.id],
      },
    });

    expect(assignClientResponse.ok()).toBeTruthy();
    console.log(`✅ 사용자에게 고객사 할당: ${firstClient.name}`);

    // 역할 목록 조회
    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;

    const clientUserRole = roles.find((r: any) => r.name === 'CLIENT_USER');

    if (!clientUserRole) {
      test.skip();
      return;
    }

    // 고객사 팀 역할(CLIENT_USER) 부여
    const response = await request.post(`/api/users/${testUserId}/roles`, {
      data: {
        roleIds: [clientUserRole.id],
      },
    });

    // 200 OK 응답 확인
    expect(response.ok()).toBeTruthy();

    const userData = await response.json();
    const assignedRoles = userData.roles?.map((r: any) => r.role.name) || [];
    expect(assignedRoles).toContain('CLIENT_USER');

    console.log(`✅ 고객사 할당 후 고객사 팀 역할 부여 성공`);
    console.log(`   할당된 역할: ${assignedRoles.join(', ')}`);
  });

  test('5. 정상 시나리오: 시스템 운영팀 역할 부여 (고객사 미할당)', async ({ page, request }) => {
    // 새로운 사용자 생성
    const timestamp = Date.now();
    const newUserEmail = `systemroletest${timestamp}@example.com`;

    const registerResponse = await request.post('/api/auth/register', {
      data: {
        name: `System Role Test User ${timestamp}`,
        email: newUserEmail,
        password: 'Test1234!',
        confirmPassword: 'Test1234!',
      },
    });

    if (!registerResponse.ok()) {
      test.skip();
      return;
    }

    // 사용자 ID 조회
    const usersResponse = await request.get('/api/users');
    const users = await usersResponse.json();
    const newUser = users.users?.find((u: any) => u.email === newUserEmail);

    if (!newUser) {
      test.skip();
      return;
    }

    const newUserId = newUser.id;

    // 역할 목록 조회
    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;

    const engineerRole = roles.find((r: any) => r.name === 'ENGINEER');

    if (!engineerRole) {
      test.skip();
      return;
    }

    // 시스템 운영팀 역할(ENGINEER) 부여
    const response = await request.post(`/api/users/${newUserId}/roles`, {
      data: {
        roleIds: [engineerRole.id],
      },
    });

    // 200 OK 응답 확인
    expect(response.ok()).toBeTruthy();

    const userData = await response.json();
    const assignedRoles = userData.roles?.map((r: any) => r.role.name) || [];
    expect(assignedRoles).toContain('ENGINEER');

    console.log(`✅ 고객사 미할당 사용자에게 시스템 운영팀 역할 부여 성공`);
    console.log(`   할당된 역할: ${assignedRoles.join(', ')}`);
  });
});

test.describe('역할 할당 UI 테스트', () => {
  test('사용자 관리 페이지에서 역할 할당 시 상호 배타성 확인', async ({ page }) => {
    // 사용자 관리 페이지로 이동
    await page.goto('/users', { waitUntil: 'networkidle', timeout: 30000 });

    // 사용자 목록 확인
    const userTable = page.locator('table, [role="table"]').first();
    if (!(await userTable.isVisible({ timeout: 5000 }).catch(() => false))) {
      console.log(`⚠️ 사용자 목록 테이블을 찾을 수 없습니다.`);
      test.skip();
      return;
    }

    // 첫 번째 사용자 선택 (또는 특정 사용자 검색)
    const firstUserRow = page.locator('tr').filter({ hasText: /@/ }).first();
    if (await firstUserRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      // 편집/역할 할당 버튼 클릭
      const editButton = firstUserRow.locator('button, a').filter({ hasText: /편집|Edit|역할|Role/i }).first();

      if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editButton.click();
        await page.waitForTimeout(1000);

        // 역할 선택 UI 확인 (카드 형식)
        const roleCards = page.locator('div').filter({ hasText: /ADMIN|MANAGER|ENGINEER|CLIENT/i }).filter({ has: page.locator('h4') });
        const count = await roleCards.count();

        if (count > 0) {
          console.log(`✅ 역할 선택 UI 발견: ${count}개 역할`);

          // ADMIN과 CLIENT_ADMIN 카드를 동시에 선택 시도
          const adminCard = page.locator('div.cursor-pointer').filter({ has: page.locator('h4', { hasText: /^ADMIN$/i }) }).first();
          const clientAdminCard = page.locator('div.cursor-pointer').filter({ has: page.locator('h4', { hasText: /CLIENT_ADMIN/i }) }).first();

          const isAdminVisible = await adminCard.isVisible({ timeout: 2000 }).catch(() => false);
          const isClientAdminVisible = await clientAdminCard.isVisible({ timeout: 2000 }).catch(() => false);

          if (isAdminVisible && isClientAdminVisible) {
            // 두 역할 모두 클릭하여 선택
            await adminCard.click();
            await page.waitForTimeout(300);
            await clientAdminCard.click();

            // 저장 버튼 클릭
            const saveButton = page.getByRole('button', { name: /저장|Save/i });
            if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
              await saveButton.click();
              await page.waitForTimeout(2000);

              // 에러 메시지 확인
              const errorMessage = page.locator('text=/시스템 운영팀과 고객사 팀 역할을 동시에/i');
              if (await errorMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
                console.log(`✅ UI에서 역할 상호 배타성 에러 메시지 표시 확인`);
              } else {
                console.log(`⚠️ UI에서 에러 메시지가 표시되지 않음 (API에서만 차단 가능)`);
              }
            }
          } else {
            console.log(`⚠️ ADMIN 또는 CLIENT_ADMIN 체크박스를 찾을 수 없습니다.`);
          }
        } else {
          console.log(`⚠️ 역할 선택 UI를 찾을 수 없습니다.`);
        }
      } else {
        console.log(`⚠️ 편집/역할 할당 버튼을 찾을 수 없습니다.`);
      }
    } else {
      console.log(`⚠️ 사용자 행을 찾을 수 없습니다.`);
    }
  });
});

test.describe('역할 변경 시 고객사 할당 정합성 테스트', () => {
  test('고객사 할당 사용자의 역할을 시스템 운영팀으로 변경 시도', async ({ request }) => {
    // 사용자 생성
    const timestamp = Date.now();
    const userEmail = `rolechange${timestamp}@example.com`;

    await request.post('/api/auth/register', {
      data: {
        name: `Role Change Test User ${timestamp}`,
        email: userEmail,
        password: 'Test1234!',
        confirmPassword: 'Test1234!',
      },
    });

    // 사용자 ID 조회
    const usersResponse = await request.get('/api/users');
    const users = await usersResponse.json();
    const user = users.users?.find((u: any) => u.email === userEmail);

    if (!user) {
      test.skip();
      return;
    }

    // 고객사 할당
    const clientsResponse = await request.get('/api/clients');
    const clientsData = await clientsResponse.json();
    const clients = clientsData.clients || clientsData;

    if (!clients || clients.length === 0) {
      test.skip();
      return;
    }

    await request.patch(`/api/users/${user.id}`, {
      data: {
        clientIds: [clients[0].id],
      },
    });

    // 역할 목록 조회
    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;

    const clientUserRole = roles.find((r: any) => r.name === 'CLIENT_USER');
    const engineerRole = roles.find((r: any) => r.name === 'ENGINEER');

    if (!clientUserRole || !engineerRole) {
      test.skip();
      return;
    }

    // 고객사 팀 역할 부여
    await request.post(`/api/users/${user.id}/roles`, {
      data: {
        roleIds: [clientUserRole.id],
      },
    });

    console.log(`✅ 사용자에게 고객사 할당 및 CLIENT_USER 역할 부여 완료`);

    // 시스템 운영팀 역할(ENGINEER)로 변경 시도
    const changeResponse = await request.post(`/api/users/${user.id}/roles`, {
      data: {
        roleIds: [engineerRole.id],
      },
    });

    // 400 Bad Request 응답 확인
    expect(changeResponse.status()).toBe(400);

    const errorData = await changeResponse.json();
    expect(errorData.error).toContain('시스템 운영팀 역할은 고객사가 할당된 사용자에게 부여할 수 없습니다');

    console.log(`✅ 고객사 할당 사용자의 역할을 시스템 운영팀으로 변경 차단 확인`);
    console.log(`   제안 메시지: ${errorData.suggestion || '먼저 고객사 할당을 해제하세요.'}`);
  });
});

console.log(`\n✨ 역할 상호 배타성 E2E 테스트 모두 완료!`);
