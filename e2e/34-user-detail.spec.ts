import { APIRequestContext, expect, test } from '@playwright/test';

import { PERSONA_AUTH_FILES } from './helpers/auth-helpers';

/**
 * `/users/[id]` 사용자 상세 화면.
 *
 * ── 이 파일이 생긴 이유 ──────────────────────────────────────────────────
 * 이 라우트에는 검증이 **0건**이었다. 08-user-management 는 목록(`/users`)만 보고,
 * 00-smoke 의 라우트 목록에도 `/users/[id]` 는 없다(동적 세그먼트라 스모크 배열에
 * 넣을 수 없었다). 즉 상세 화면이 통째로 깨지거나 목록의 이름 링크가 끊겨도
 * 어느 스펙도 실패하지 않는 상태였다.
 *
 * ── 검증 대상 ────────────────────────────────────────────────────────────
 * 화면의 값이 **API 가 돌려준 값과 같은가** 를 본다. 상수로 "Engineer User" 를
 * 박아 두면 시드가 바뀌는 순간 화면이 멀쩡해도 빨개지고(또는 반대로 화면이
 * 엉뚱한 사용자를 그려도 통과한다), 그건 상세 화면이 아니라 시드를 검사하는 것이다.
 * 그래서 기대값은 전부 `GET /api/users/[id]` 응답에서 계산한다.
 *
 * ⚠️ 시드 계정은 **읽기만** 한다. 이 스위트에는 admin 계정 이름을 바꿔 놓고
 *    되돌리지 않아 다른 스펙을 오염시킨 전례가 있다.
 */

test.use({ storageState: PERSONA_AUTH_FILES.admin });

/** 상세를 열어 볼 대상. 역할이 정확히 ENGINEER 하나뿐이라 역할 카드 검증에 적합하다. */
const TARGET_EMAIL = process.env.TEST_ENGINEER_EMAIL || 'engineeruser@example.com';

/** 존재할 수 없는 id. cuid 형식이 아니므로 어떤 행과도 충돌하지 않는다. */
const MISSING_USER_ID = 'e2e-missing-user-00000000';

interface ApiPermission {
  permission: { id: string; resource: string; action: string };
}

interface ApiUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: Array<{ role: { id: string; name: string; permissions: ApiPermission[] } }>;
  clients: Array<{ client: { id: string; name: string; code: string } }>;
}

/** 목록에서 이메일로 사용자를 찾아 상세(권한까지 포함)를 가져온다. */
async function fetchTargetUser(request: APIRequestContext): Promise<ApiUser> {
  const listResponse = await request.get(
    `/api/users?search=${encodeURIComponent(TARGET_EMAIL)}&pageSize=50`
  );
  expect(
    listResponse.status(),
    `GET /api/users 가 실패했습니다: ${await listResponse.text()}`
  ).toBe(200);

  const list = (await listResponse.json()) as { data?: Array<{ id: string; email: string }> };
  const summary = (list.data ?? []).find((candidate) => candidate.email === TARGET_EMAIL);
  expect(
    summary,
    `${TARGET_EMAIL} 계정을 찾지 못했습니다. prisma/seed.ts 를 먼저 실행하세요.`
  ).toBeTruthy();

  const detailResponse = await request.get(`/api/users/${summary!.id}`);
  expect(
    detailResponse.status(),
    `GET /api/users/${summary!.id} 가 실패했습니다: ${await detailResponse.text()}`
  ).toBe(200);

  return (await detailResponse.json()) as ApiUser;
}

/**
 * 화면이 계산해 보여 주는 "중복 제거된 권한 수".
 * src/app/(dashboard)/users/[id]/page.tsx 의 `allPermissions` 와 같은 규칙
 * (`resource.action` 키로 dedupe)이다.
 */
function distinctPermissionCount(user: ApiUser): number {
  const keys = new Set<string>();
  for (const userRole of user.roles) {
    for (const rolePermission of userRole.role.permissions) {
      keys.add(`${rolePermission.permission.resource}.${rolePermission.permission.action}`);
    }
  }
  return keys.size;
}

test.describe('/users/[id] 사용자 상세 (ADMIN)', () => {
  test('시드 계정의 이름·이메일·역할·권한 수가 API 값 그대로 화면에 그려진다', async ({
    page,
    request,
  }) => {
    const user = await fetchTargetUser(request);
    const permissionCount = distinctPermissionCount(user);
    expect(
      permissionCount,
      `${TARGET_EMAIL} 에게 권한이 하나도 없으면 권한 카드 검증이 성립하지 않습니다.`
    ).toBeGreaterThan(0);

    // 이 화면은 클라이언트에서 상세를 fetch 한다(page.tsx 의 fetchUser).
    // 응답을 확정해야 "로딩 중..." 화면을 검사하다 실패하는 일이 없다.
    const detailLoaded = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/users/${user.id}`) && response.request().method() === 'GET'
    );
    await page.goto(`/users/${user.id}`, { waitUntil: 'domcontentloaded' });
    expect((await detailLoaded).status()).toBe(200);

    // ── 헤더: <h1>{user.name}</h1> + 이메일 (page.tsx:173-174) ──────────
    await expect(page.getByRole('heading', { name: user.name, level: 1 })).toBeVisible();

    // ── '기본 정보' 카드 ────────────────────────────────────────────────
    // 각 항목은 <h3>라벨</h3> + 값 이 한 div 에 들어 있다. 라벨 헤딩의 부모를 집으면
    // "어느 항목의 값인지" 가 고정되므로, 이메일이 헤더에도 있는 것과 섞이지 않는다.
    const field = (label: string) =>
      page.getByRole('heading', { name: label, exact: true }).locator('..');

    await expect(page.getByText('기본 정보', { exact: true })).toBeVisible();
    await expect(field('이름')).toContainText(user.name);
    await expect(field('이메일')).toContainText(user.email);
    await expect(field('상태')).toContainText(user.isActive ? '활성' : '비활성');

    // ── '역할 및 권한' 카드 ─────────────────────────────────────────────
    await expect(page.getByText('역할 및 권한', { exact: true })).toBeVisible();

    const roleNames = user.roles.map((userRole) => userRole.role.name);
    expect(roleNames, `${TARGET_EMAIL} 의 역할이 비어 있으면 이 검증이 성립하지 않습니다.`).toEqual(
      ['ENGINEER']
    );

    const rolesField = field('역할');
    await expect(rolesField).toContainText('ENGINEER');
    // 다른 사용자의 역할이 섞이거나 전체 역할 카탈로그가 그려지는 회귀를 잡는다.
    // 위에서 카드가 실제로 렌더된 것을 단언했으므로 이 부재 단언은 공허하지 않다.
    await expect(rolesField.getByText('ADMIN', { exact: true })).toHaveCount(0);

    // 권한 목록 헤딩은 화면이 계산한 중복 제거 결과를 그대로 노출한다.
    await expect(
      page.getByRole('heading', { name: `권한 목록 (${permissionCount}개)`, exact: true })
    ).toBeVisible();

    // ── '통계' 카드: 큰 숫자 두 개가 [역할 수, 권한 수] 순서여야 한다 ───
    const statsCard = page.locator('div.rounded-card-md').filter({ hasText: '통계' });
    await expect(statsCard).toHaveCount(1);
    await expect(statsCard.locator('span.text-2xl')).toHaveText([
      String(user.roles.length),
      String(permissionCount),
    ]);
  });

  test('목록의 이름 링크를 눌러 상세로 도달한다', async ({ page, request }) => {
    const user = await fetchTargetUser(request);

    // 대상이 1페이지에 있는지 여부에 좌우되지 않도록 검색어로 좁힌다.
    // 검색 폼을 조작하지 않고 `q` 파라미터로 넘기는 이유: UsersClient 는 입력(onChange)과
    // 제출(router.push) 양쪽에서 목록을 다시 가져와, 폼을 쓰면 응답 두 건이 경합한다.
    // 초기 검색어로 열면 조회가 한 번뿐이라 결과가 확정된다
    // (`initialQ = searchParams.get('q')`, UsersClient.tsx:43).
    // 검색 폼 자체의 회귀는 08-user-management 가 덮는다.
    const listLoaded = page.waitForResponse(
      (response) => response.url().includes('/api/users?') && response.request().method() === 'GET'
    );
    await page.goto(`/users?q=${encodeURIComponent(TARGET_EMAIL)}`, {
      waitUntil: 'domcontentloaded',
    });
    expect((await listLoaded).status(), '사용자 목록 조회가 실패했습니다.').toBe(200);

    await expect(page.getByRole('heading', { name: '사용자 목록', exact: true })).toBeVisible();

    // 데스크톱 테이블 안의 링크만 겨냥한다(모바일 목록에 같은 링크가 한 벌 더 있다).
    const nameLink = page.locator('table').getByRole('link', { name: user.name, exact: true });
    await expect(nameLink).toBeVisible();
    await expect(nameLink).toHaveAttribute('href', `/users/${user.id}`);

    await nameLink.click();
    await page.waitForURL(new RegExp(`/users/${user.id}$`));
    await expect(page.getByRole('heading', { name: user.name, level: 1 })).toBeVisible();
  });

  test('존재하지 않는 id 는 404 화면을 보여 준다', async ({ page }) => {
    // 예전 계약은 "토스트를 띄우고 /users 로 되돌리기" 였다. 그 방식은 URL 이 목록으로
    // 바뀌어 링크를 공유·북마크한 사람이 왜 튕겼는지 알 수 없고, 뒤로가기를 누르면 다시
    // 튕기는 루프가 되며, 응답 자체는 200 이라 없는 페이지가 정상으로 잡혔다.
    // 이제 notFound() 로 Next 의 not-found 경계를 띄운다 — URL 이 유지된다.
    const detailFetch = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/users/${MISSING_USER_ID}`) &&
        response.request().method() === 'GET'
    );

    await page.goto(`/users/${MISSING_USER_ID}`, { waitUntil: 'domcontentloaded' });
    expect((await detailFetch).status(), 'API 는 404 를 돌려줘야 한다').toBe(404);

    // not-found 화면이 떠야 한다 (src/app/not-found.tsx 의 문구).
    await expect(page.getByText('페이지를 찾을 수 없습니다')).toBeVisible({ timeout: 20000 });

    // URL 이 유지되어야 링크 공유·북마크·뒤로가기가 정상 동작한다.
    await expect(page).toHaveURL(new RegExp(`/users/${MISSING_USER_ID}$`));
  });
});
