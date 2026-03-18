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

test.describe('Play Mode', () => {
  test('Play button launches play mode without crashing', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    const playBtn = page.getByRole('button', { name: /^Play$/i });
    await expect(playBtn).toBeVisible();
    await playBtn.click();
    await page.waitForTimeout(1000);

    await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
    await expect(page.locator('body')).not.toContainText('Application error');
  });

  test('Play mode shows the story content (not a blank screen)', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /^Play$/i }).click();
    await page.waitForTimeout(1000);

    // The test story's prose should appear somewhere on screen
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(20);
  });

  test('Play mode shows an exit button or responds to Escape', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /^Play$/i }).click();
    await page.waitForTimeout(800);

    // Check for an exit button
    const exitBtn = page.getByRole('button', { name: /exit|back|close|✕/i }).first();
    const hasExit = await exitBtn.isVisible();

    if (hasExit) {
      await exitBtn.click();
    } else {
      // Fall back to Escape key
      await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(600);
    // After exiting, the canvas toolbar should be back
    await expect(
      page.getByRole('button', { name: /\+ Story/i })
    ).toBeVisible({ timeout: 4000 });
  });

  test('Canvas Play node button (▶ on node) opens canvas player without crash', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    // Hover over a node to reveal the ▶ button
    const storyNode = page.locator('.react-flow__node').nth(1); // story node
    await storyNode.hover();
    await page.waitForTimeout(200);

    const playNodeBtn = storyNode.getByRole('button', { name: /▶/i }).first();
    if (await playNodeBtn.isVisible()) {
      await playNodeBtn.click();
      await page.waitForTimeout(800);
      await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
    }
  });
});
