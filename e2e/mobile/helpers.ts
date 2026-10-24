import { expect, type Locator, type Page } from '@playwright/test';

import type { Persona } from '../helpers/auth-helpers';

export async function chooseTheme(page: Page, mode: 'light' | 'dark' | 'system') {
  const label = { light: '주간', dark: '야간', system: '시스템' }[mode];
  await expect(async () => {
    await page.getByRole('button', { name: /^화면 모드:/ }).click();
    await expect(page.getByRole('menuitemradio', { name: label, exact: true })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('menuitemradio', { name: label, exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  if (mode !== 'system') await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
}

export async function login(page: Page, persona: Persona) {
  await page.goto('/login');
  // A working menu proves hydration has completed before entering credentials.
  await chooseTheme(page, 'light');
  await page.locator('#email').fill(persona.email);
  await page.locator('#password').fill(persona.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|srs)(?:\?|$)/);
  const response = await page.request.get('/api/auth/session');
  expect(response.ok()).toBe(true);
  const session = await response.json();
  expect(session.user.email === persona.email, `Authenticated account for ${persona.name}`).toBe(
    true
  );
  expect([...session.user.roles].sort(), `Actual roles for ${persona.name}`).toEqual(
    [...persona.expectedRoles].sort()
  );
}

export async function assertViewport(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
}

export async function assertDialogFits(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      return (
        !!box &&
        !!viewport &&
        box.y >= 0 &&
        box.x >= 0 &&
        box.y + box.height <= viewport.height + 1 &&
        box.x + box.width <= viewport.width + 1
      );
    })
    .toBe(true);
}
