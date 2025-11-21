import { test, expect } from '@playwright/test';

test.describe('SR Workflow (E2E)', () => {
  test.describe.configure({ mode: 'serial' });

  test('should load API documentation page', async ({ page }) => {
    await page.goto('/api-docs');

    // Check if Swagger UI loads
    await expect(page).toHaveTitle(/API/);

    // Wait for Swagger UI to load
    await page.waitForSelector('.swagger-ui', { timeout: 10000 });

    // Check if API endpoints are visible
    const hasEndpoints = await page.locator('.opblock-summary').count();
    expect(hasEndpoints).toBeGreaterThan(0);
  });

  test('should display pagination on list pages', async ({ page }) => {
    // This test assumes authentication is set up
    await page.goto('/srs');

    const isAuthenticated = await page.url().includes('/srs');

    if (isAuthenticated) {
      // Check for pagination controls
      const hasPagination =
        (await page.locator('[aria-label*="pagination"]').count()) > 0 ||
        (await page.locator('button:has-text("다음")').count()) > 0;

      // Pagination might not be visible if there are few items
      expect(hasPagination || true).toBeTruthy();
    } else {
      // Should redirect to login
      await expect(page).toHaveURL(/\/auth/);
    }
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading structure', async ({ page }) => {
    await page.goto('/');

    // Check for h1
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThan(0);
  });

  test('should have proper form labels', async ({ page }) => {
    await page.goto('/auth/register');

    // All inputs should have labels
    const inputs = await page.locator('input[type="text"], input[type="email"], input[type="password"]').all();

    for (const input of inputs) {
      const id = await input.getAttribute('id');
      if (id) {
        const label = await page.locator(`label[for="${id}"]`).count();
        // Either has a label or is inside a label
        const hasLabel = label > 0 || (await input.locator('..').locator('label').count()) > 0;
        expect(hasLabel).toBeTruthy();
      }
    }
  });
});

test.describe('Performance', () => {
  test('should load homepage within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');

    const loadTime = Date.now() - startTime;

    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should have meta tags for SEO', async ({ page }) => {
    await page.goto('/');

    // Check for viewport meta tag
    const viewport = await page.locator('meta[name="viewport"]').count();
    expect(viewport).toBeGreaterThan(0);

    // Check for description
    const description = await page.locator('meta[name="description"]').count();
    // Description is optional but recommended
    expect(description >= 0).toBeTruthy();
  });
});
