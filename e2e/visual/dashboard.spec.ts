import { test, expect } from '@playwright/test';

test.describe('Dashboard Visual Regression', () => {
  test('StatsCard Default should look correct', async ({ page }) => {
    // Access Storybook iframe directly to isolate component
    // Assuming Storybook is running on 6007
    await page.goto(
      'http://localhost:6007/iframe.html?id=dashboard-statscard--default&viewMode=story'
    );

    // Wait for component to render
    const card = page.locator('.card'); // Assuming the component renders a card class
    // If not, we might need a more specific selector or wait for text
    await page.waitForSelector('text=Total Users');

    // Take screenshot and compare
    await expect(page).toHaveScreenshot('statscard-default.png');
  });

  test('StatsCard Positive Trend should look correct', async ({ page }) => {
    await page.goto(
      'http://localhost:6007/iframe.html?id=dashboard-statscard--positive-trend&viewMode=story'
    );
    await page.waitForSelector('text=Active Now');
    await expect(page).toHaveScreenshot('statscard-positive-trend.png');
  });

  test('StatsCard Overflow Text Defense', async ({ page }) => {
    // We can dynamically inject long text via URL args in Storybook v7+
    // format: args=title:VeryLongText...
    const longText = 'This is a very long title that should be truncated...';
    const encodedTitle = encodeURIComponent(longText);

    await page.goto(
      `http://localhost:6006/iframe.html?id=dashboard-statscard--default&args=title:${encodedTitle}&viewMode=story`
    );
    await page.waitForSelector('.truncate'); // Verify truncate class exists? Or just visual

    await expect(page).toHaveScreenshot('statscard-overflow.png');
  });
});
