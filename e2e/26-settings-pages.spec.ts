import { expect, test } from '@playwright/test';

/**
 * 설정 화면 — 프로필 · 알림 · 시스템.
 *
 * ── 이 파일의 내력 ───────────────────────────────────────────────────────
 * 예전의 이 스펙은 저장 버튼을 못 찾으면 아무것도 하지 않고 통과했고
 * (`if (saveVisible) { ... }` — else 없음), 성공 토스트는 보이면 로그만 찍었다.
 * 시스템 설정은 URL 이 유지되면 입력 개수를 console.log 하고, 튕기면 "권한 없음"
 * 을 찍고 역시 통과했다 — ADMIN 세션인데 차단돼도 초록불이었다.
 *
 * 더 나쁜 것은 **프로필 이름을 복구하지 못하고 끝날 수 있었다**는 점이다.
 * 복구 단계가 if 블록 안에 있어서, 중간 단언이 실패하면 시드 계정 이름이
 * `Admin User (Test 1786069464712)` 인 채로 남았다. 실제로 그렇게 오염됐다.
 * 지금은 이름을 바꾸는 검증에 try/finally 를 걸어 어떤 경로로 끝나도 되돌린다.
 *
 * ⚠️ networkidle 금지 — 로그인 상태에서는 /api/realtime SSE 가 계속 열려 있어
 * "500ms 동안 요청 0건" 이 영원히 성립하지 않는다.
 */

/** 프로필 API 응답에서 이 스펙이 쓰는 필드. */
interface ProfileRow {
  name: string;
  email: string;
}

test.describe('설정 — 프로필', () => {
  test('프로필 화면이 세션의 실제 값을 보여준다', async ({ page }) => {
    // 서버가 아는 값을 먼저 확정한다. 화면만 보면 "무엇이든 그려져 있으면 통과" 가 된다.
    const response = await page.request.get('/api/profile');
    expect(response.status()).toBe(200);
    const profile = (await response.json()) as ProfileRow;

    await page.goto('/settings/profile', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('프로필 정보를 불러오는 중...')).toHaveCount(0, { timeout: 30000 });

    await expect(page.locator('#name')).toHaveValue(profile.name);
    // 이메일은 변경할 수 없어야 한다 — 화면 규칙이자 계약이다.
    await expect(page.locator('#email')).toHaveValue(profile.email);
    await expect(page.locator('#email')).toBeDisabled();
  });

  test('이름을 저장하면 서버에 반영되고, 되돌리면 원래대로 돌아온다', async ({ page }) => {
    await page.goto('/settings/profile', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('프로필 정보를 불러오는 중...')).toHaveCount(0, { timeout: 30000 });

    const nameInput = page.locator('#name');
    await expect(nameInput).toBeVisible();
    const originalName = await nameInput.inputValue();
    expect(originalName, '프로필 이름이 비어 있습니다.').not.toBe('');

    const newName = `${originalName} (E2E ${Date.now()})`;

    try {
      const saved = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/profile' && r.request().method() === 'PATCH'
      );
      await nameInput.fill(newName);
      await page.getByRole('button', { name: '저장' }).click();
      expect((await saved).status(), '프로필 저장이 200 이 아닙니다.').toBe(200);

      // 예전에는 성공 토스트를 "보이면 로그" 로 넘겼다. 저장의 증거로 단언한다.
      await expect(
        page.getByLabel(/Notifications/).getByText('프로필이 업데이트되었습니다.')
      ).toBeVisible();

      // 서버 상태로 확정한다.
      const after = await page.request.get('/api/profile');
      expect(((await after.json()) as ProfileRow).name).toBe(newName);
    } finally {
      // 어떤 경로로 끝나도 시드 계정 이름을 되돌린다. 복구가 if 블록 안에 있어
      // 실패 시 오염이 남던 것이 이 파일의 실제 사고 이력이다.
      const restored = await page.request.patch('/api/profile', {
        data: { name: originalName },
      });
      expect(restored.status(), '프로필 이름 복구에 실패했습니다.').toBe(200);
    }

    // 복구가 화면에도 반영되는지까지 본다.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('프로필 정보를 불러오는 중...')).toHaveCount(0, { timeout: 30000 });
    await expect(nameInput).toHaveValue(originalName);
  });

  test('보안 탭에 비밀번호 변경 폼이 있다', async ({ page }) => {
    await page.goto('/settings/profile', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('프로필 정보를 불러오는 중...')).toHaveCount(0, { timeout: 30000 });

    // 예전에는 보안 탭이 없으면 그냥 넘어가고, 페이지 어딘가에 "비밀번호" 라는
    // 글자만 있으면 통과했다. 탭은 반드시 있어야 하고, 클릭하면 폼이 나와야 한다.
    await page.getByRole('tab', { name: '보안' }).click();

    const panel = page.locator('[role="tabpanel"][data-state="active"]');
    await expect(panel.getByRole('heading', { name: '비밀번호 변경' })).toBeVisible();
    await expect(panel.locator('input[type="password"]')).toHaveCount(3);
  });
});

test.describe('설정 — 알림', () => {
  test('토글을 바꾸면 상태가 뒤집히고, 되돌리면 원래대로 돌아온다', async ({ page }) => {
    await page.goto('/settings/notifications', { waitUntil: 'domcontentloaded' });

    const toggle = page.getByRole('switch').first();
    await expect(toggle).toBeVisible({ timeout: 15000 });
    const before = await toggle.isChecked();

    try {
      await toggle.click();
      // 고정 대기 대신 상태 자체를 기다린다. toBeChecked 는 자동 재시도한다.
      await expect(toggle).toBeChecked({ checked: !before });
    } finally {
      await toggle.click();
      await expect(toggle).toBeChecked({ checked: before });
    }
  });

  test('설정 저장이 서버에 반영된다', async ({ page }) => {
    await page.goto('/settings/notifications', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('switch').first()).toBeVisible({ timeout: 15000 });

    const saved = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/settings/notifications' &&
        r.request().method() !== 'GET'
    );
    await page.getByRole('button', { name: /설정 저장|저장 중/ }).click();
    expect((await saved).status(), '알림 설정 저장이 실패했습니다.').toBeLessThan(400);

    await expect(
      page.getByLabel(/Notifications/).getByText('알림 설정이 저장되었습니다.')
    ).toBeVisible();
  });
});

test.describe('설정 — 시스템 (ADMIN)', () => {
  test('ADMIN 은 시스템 설정 화면에 들어간다', async ({ page }) => {
    await page.goto('/settings/system', { waitUntil: 'domcontentloaded' });

    // 예전에는 URL 이 유지되면 입력 개수를 로그로 찍고, 튕기면 "권한 없음" 을 찍고
    // **양쪽 다 통과**했다. ADMIN 세션이므로 들어가지는 것이 계약이다.
    await expect(page).toHaveURL(/\/settings\/system/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });

    // 설정 화면인데 조작할 것이 하나도 없으면 회귀다.
    await expect(page.locator('main input, main select, main textarea').first()).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe('설정 — 진입 경로', () => {
  test('/settings 는 설정 화면 안에 머문다', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    // /settings 는 자기 자신이거나 프로필로 리디렉션된다. 그 밖으로 튕기면 회귀다.
    // (예전에는 그 경우를 스킵해서, 로그인 페이지로 튕겨도 초록불이었다.)
    await expect(page).toHaveURL(/\/(settings|profile)/);
    await expect(page.locator('main')).toBeVisible({ timeout: 15000 });
  });
});
