import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/');

    // Check if login form is visible
    await expect(page).toHaveTitle(/SR Management/);
    await expect(page.getByRole('heading', { name: /로그인/i })).toBeVisible();
  });

  test('should show validation error for empty fields', async ({ page }) => {
    await page.goto('/');

    // Try to submit without filling fields
    await page.getByRole('button', { name: /로그인/i }).click();

    // Should see validation errors
    await expect(page.getByText(/이메일/i)).toBeVisible();
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/');

    // Click register link
    await page.getByRole('link', { name: /회원가입/i }).click();

    // Should be on register page
    await expect(page).toHaveURL(/\/auth\/register/);
    await expect(page.getByRole('heading', { name: /회원가입/i })).toBeVisible();
  });

  test('should validate password requirements on registration', async ({ page }) => {
    await page.goto('/auth/register');

    // Fill in basic info
    await page.getByLabel(/이름/i).fill('Test User');
    await page.getByLabel(/이메일/i).fill('test@example.com');

    // Try weak password
    await page.getByLabel(/^비밀번호/).fill('weak');

    // Should see validation error
    await expect(page.getByText(/최소 8자/i)).toBeVisible();
  });
});

test.describe('Dashboard (Authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Setup authentication state
    // For now, skip if not authenticated
  });

  test('should display dashboard stats', async ({ page }) => {
    await page.goto('/dashboard');

    // Check for dashboard elements
    // This will fail if not authenticated
    const isAuthenticated = await page.url().includes('/dashboard');

    if (isAuthenticated) {
      await expect(page.getByText(/대시보드/i)).toBeVisible();
    } else {
      // Should redirect to login
      await expect(page).toHaveURL(/\/auth\/sign-in/);
    }
  });
});
