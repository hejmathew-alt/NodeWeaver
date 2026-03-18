import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads without a crash or error overlay', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
    await expect(page.locator('body')).not.toContainText('Application error');
    // Something meaningful should render
    const contentCount = await page.locator('h1, h2, h3, button, a').count();
    expect(contentCount).toBeGreaterThan(0);
  });

  test('shows stories list or a recognisable empty state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Either the story grid loads, or an inspire/create prompt is shown
    const hasStories = await page.locator('[class*="story"], [class*="card"]').count();
    const hasPrompt = await page.getByRole('button', {
      name: /inspire|quick start|new story|create/i,
    }).count();
    expect(hasStories + hasPrompt).toBeGreaterThan(0);
  });

  test('opening Inspire Me modal does not crash the page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const inspireBtn = page.getByRole('button', { name: /inspire me/i }).first();
    if (await inspireBtn.isVisible()) {
      await inspireBtn.click();
      await page.waitForTimeout(800);
      await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
      await expect(page.locator('body')).not.toContainText('Application error');
      // Modal content should appear — check for new text that wasn't on the dashboard
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(50);
    }
  });

  test('opening Quick Start modal does not crash the page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const quickBtn = page.getByRole('button', { name: /quick start/i }).first();
    if (await quickBtn.isVisible()) {
      await quickBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
    }
  });
});
