import { test, expect } from '@playwright/test';
import { makeTestStoryId, makeTestStory } from '../integration/helpers';

let storyId: string;

test.beforeAll(async ({ request }) => {
  storyId = makeTestStoryId();
  await request.post('/api/stories', {
    data: makeTestStory(storyId),
    headers: { 'content-type': 'application/json' },
  });
});

test.afterAll(async ({ request }) => {
  await request.delete(`/api/stories/${storyId}`);
});

test.describe('Canvas', () => {
  test('loads the story canvas without a crash', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('shows the toolbar with node creation buttons', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /\+ Story/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ Start/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ End/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ Interactive/i })).toBeVisible();
  });

  test('renders the test story\'s existing nodes on the canvas', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    // Test story has 2 nodes — they should appear as React Flow nodes
    const nodes = page.locator('.react-flow__node');
    await expect(nodes.first()).toBeVisible();
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('adding a Story node via toolbar increases the node count', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    const before = await page.locator('.react-flow__node').count();
    await page.getByRole('button', { name: /\+ Story/i }).click();
    await page.waitForTimeout(400);
    const after = await page.locator('.react-flow__node').count();
    expect(after).toBeGreaterThan(before);
  });

  test('shows zoom controls on the canvas', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /zoom in/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /zoom out/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /fit view/i })).toBeVisible();
  });

  test('story title is visible in the header', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('NW Automated Test Story')).toBeVisible();
  });

  test('Characters button navigates to the characters page without crash', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /characters/i }).click();
    await page.waitForTimeout(500);
    await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
  });
});
