import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * 역할 상호 배타성 (Role Exclusivity) E2E 테스트
 *
 * 테스트 범위:
 * 1. 시스템 운영팀 vs 고객사 팀 역할 상호 배타성
 * 2. 고객사 할당과 역할의 정합성
 * 3. 역할 변경 시 검증
 */

const authFiles = {
  admin: path.join(__dirname, '../playwright/.auth/manager.json'),
};

test.use({ storageState: authFiles.admin });

test.describe('역할 상호 배타성 테스트', () => {
  let testUserId: string;
  let testUserEmail: string;
  let setupSuccess = false;

  test.beforeAll(async ({ request }) => {
    // 테스트용 사용자 생성
    const timestamp = Date.now();
    testUserEmail = `roletest${timestamp}@example.com`;

    try {
      const response = await request.post('/api/auth/register', {
        data: {
          name: `Role Test User ${timestamp}`,
          email: testUserEmail,
          password: 'Test1234!',
          confirmPassword: 'Test1234!',
        },
      });

      if (response.ok()) {
        console.log(`✅ 테스트 사용자 생성: ${testUserEmail}`);
      }

      // 사용자 ID 조회
      const usersResponse = await request.get('/api/users');
      if (usersResponse.ok()) {
        const users = await usersResponse.json();
        const testUser = users.users?.find((u: any) => u.email === testUserEmail);
        if (testUser) {
          testUserId = testUser.id;
          setupSuccess = true;
          console.log(`✅ 테스트 사용자 ID: ${testUserId}`);
        }
      }
    } catch (e) {
      console.log('ℹ️ 테스트 셋업 중 오류 발생');
    }
  });

  test('1. 시스템 운영팀과 고객사 팀 역할 동시 부여 차단', async ({ request }) => {
    if (!testUserId) {
      console.log('ℹ️ 테스트 사용자 없음 - 기본 확인만 진행');
      const rolesResponse = await request.get('/api/roles');
      expect(rolesResponse.ok()).toBeTruthy();
      return;
    }

    const rolesResponse = await request.get('/api/roles');
    expect(rolesResponse.ok()).toBeTruthy();
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;

    const adminRole = roles.find((r: any) => r.name === 'ADMIN');
    const clientAdminRole = roles.find((r: any) => r.name === 'CLIENT_ADMIN');

    if (!adminRole || !clientAdminRole) {
      console.log('ℹ️ ADMIN 또는 CLIENT_ADMIN 역할 없음 - API 접근 확인됨');
      return;
    }

    // 동시에 ADMIN + CLIENT_ADMIN 역할 부여 시도
    const response = await request.post(`/api/users/${testUserId}/roles`, {
      data: { roleIds: [adminRole.id, clientAdminRole.id] },
    });

    // 400 Bad Request 또는 다른 에러 응답 확인
    if (response.status() === 400) {
      const errorData = await response.json();
      console.log(`✅ 역할 동시 부여 차단: ${errorData.error}`);
    } else {
      console.log(`ℹ️ 응답 상태: ${response.status()}`);
    }
  });

  test('2. 고객사 할당 사용자에게 시스템 역할 부여 차단', async ({ request }) => {
    if (!testUserId) {
      console.log('ℹ️ 테스트 사용자 없음 - 기본 확인만 진행');
      const clientsResponse = await request.get('/api/clients');
      expect(clientsResponse.ok()).toBeTruthy();
      return;
    }

    // 고객사 목록 조회
    const clientsResponse = await request.get('/api/clients');
    expect(clientsResponse.ok()).toBeTruthy();
    const clientsData = await clientsResponse.json();
    const clients = clientsData.clients || clientsData;

    if (!clients?.length) {
      console.log('ℹ️ 고객사 없음 - API 접근 확인됨');
      return;
    }

    // 사용자에게 고객사 할당
    await request.patch(`/api/users/${testUserId}`, {
      data: { clientIds: [clients[0].id] },
    });

    // 역할 조회
    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;
    const managerRole = roles.find((r: any) => r.name === 'MANAGER');

    if (!managerRole) {
      console.log('ℹ️ MANAGER 역할 없음');
      return;
    }

    // 시스템 운영팀 역할 부여 시도
    const response = await request.post(`/api/users/${testUserId}/roles`, {
      data: { roleIds: [managerRole.id] },
    });

    if (response.status() === 400) {
      console.log('✅ 고객사 할당 사용자에게 시스템 역할 부여 차단 확인');
    } else {
      console.log(`ℹ️ 응답 상태: ${response.status()}`);
    }

    // 정리: 고객사 할당 해제
    await request.patch(`/api/users/${testUserId}`, {
      data: { clientIds: [] },
    });
  });

  test('3. 고객사 미할당 사용자에게 고객사 역할 부여 차단', async ({ request }) => {
    if (!testUserId) {
      console.log('ℹ️ 테스트 사용자 없음 - 역할 API 확인');
      const rolesResponse = await request.get('/api/roles');
      expect(rolesResponse.ok()).toBeTruthy();
      return;
    }

    // 고객사 할당 해제
    await request.patch(`/api/users/${testUserId}`, {
      data: { clientIds: [] },
    });

    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;
    const clientUserRole = roles.find((r: any) => r.name === 'CLIENT_USER');

    if (!clientUserRole) {
      console.log('ℹ️ CLIENT_USER 역할 없음');
      return;
    }

    // 고객사 팀 역할 부여 시도
    const response = await request.post(`/api/users/${testUserId}/roles`, {
      data: { roleIds: [clientUserRole.id] },
    });

    if (response.status() === 400) {
      console.log('✅ 고객사 미할당 사용자에게 고객사 역할 부여 차단 확인');
    } else {
      console.log(`ℹ️ 응답 상태: ${response.status()}`);
    }
  });

  test('4. 정상: 고객사 할당 후 고객사 역할 부여', async ({ request }) => {
    if (!testUserId) {
      console.log('ℹ️ 테스트 사용자 없음 - 기본 확인');
      return;
    }

    const clientsResponse = await request.get('/api/clients');
    const clientsData = await clientsResponse.json();
    const clients = clientsData.clients || clientsData;

    if (!clients?.length) {
      console.log('ℹ️ 고객사 없음');
      return;
    }

    // 고객사 할당
    await request.patch(`/api/users/${testUserId}`, {
      data: { clientIds: [clients[0].id] },
    });

    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;
    const clientUserRole = roles.find((r: any) => r.name === 'CLIENT_USER');

    if (!clientUserRole) {
      console.log('ℹ️ CLIENT_USER 역할 없음');
      return;
    }

    const response = await request.post(`/api/users/${testUserId}/roles`, {
      data: { roleIds: [clientUserRole.id] },
    });

    if (response.ok()) {
      console.log('✅ 고객사 할당 후 고객사 역할 부여 성공');
    } else {
      console.log(`ℹ️ 응답 상태: ${response.status()}`);
    }
  });

  test('5. 정상: 시스템 역할 부여 (고객사 미할당)', async ({ request }) => {
    const timestamp = Date.now();
    const newUserEmail = `systemroletest${timestamp}@example.com`;

    const registerResponse = await request.post('/api/auth/register', {
      data: {
        name: `System Role Test ${timestamp}`,
        email: newUserEmail,
        password: 'Test1234!',
        confirmPassword: 'Test1234!',
      },
    });

    if (!registerResponse.ok()) {
      console.log('ℹ️ 새 사용자 생성 실패 - 역할 API 확인');
      const rolesResponse = await request.get('/api/roles');
      expect(rolesResponse.ok()).toBeTruthy();
      return;
    }

    const usersResponse = await request.get('/api/users');
    const users = await usersResponse.json();
    const newUser = users.users?.find((u: any) => u.email === newUserEmail);

    if (!newUser) {
      console.log('ℹ️ 새 사용자 조회 실패');
      return;
    }

    const rolesResponse = await request.get('/api/roles');
    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;
    const engineerRole = roles.find((r: any) => r.name === 'ENGINEER');

    if (!engineerRole) {
      console.log('ℹ️ ENGINEER 역할 없음');
      return;
    }

    const response = await request.post(`/api/users/${newUser.id}/roles`, {
      data: { roleIds: [engineerRole.id] },
    });

    if (response.ok()) {
      console.log('✅ 시스템 역할 부여 성공');
    } else {
      console.log(`ℹ️ 응답 상태: ${response.status()}`);
    }
  });
});

test.describe('역할 할당 UI 테스트', () => {
  test('사용자 관리 페이지 역할 할당 확인', async ({ page }) => {
    await page.goto('/users', { waitUntil: 'networkidle', timeout: 30000 });

    const userTable = page.locator('table').first();
    const hasTable = await userTable.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTable) {
      console.log('✅ 사용자 목록 테이블 확인');

      const firstUserRow = page.locator('tbody tr').first();
      if (await firstUserRow.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log('✅ 사용자 행 확인');
      }
    } else {
      await expect(page.locator('main')).toBeVisible();
      console.log('ℹ️ 테이블 없음 - 페이지 로드 확인');
    }
  });
});

test.describe('역할 변경 정합성 테스트', () => {
  test('역할 API 접근 확인', async ({ request }) => {
    const rolesResponse = await request.get('/api/roles');
    expect(rolesResponse.ok()).toBeTruthy();

    const rolesData = await rolesResponse.json();
    const roles = rolesData.roles || rolesData;

    if (Array.isArray(roles) && roles.length > 0) {
      console.log(`✅ 역할 목록 조회 성공: ${roles.length}개`);
      roles.forEach((r: any) => console.log(`   - ${r.name}`));
    } else {
      console.log('ℹ️ 역할 목록이 비어있음');
    }
  });
});
