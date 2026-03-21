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

test.describe('Node Editor Panel', () => {
  test('clicking a canvas node opens the editor panel', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    // Click the first canvas node
    const firstNode = page.locator('.react-flow__node').first();
    await firstNode.click();
    await page.waitForTimeout(400);

    // Panel should open — look for contenteditable blocks, textareas, or the panel container
    const editorSignal = page.locator(
      '[contenteditable="true"], [class*="NodeEditor"], [class*="editor-panel"], [class*="block"]'
    ).first();
    await expect(editorSignal).toBeVisible({ timeout: 5000 });
  });

  test('the Save button is visible and clickable without crashing', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    const saveBtn = page.getByRole('button', { name: /^Save$/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();
    await page.waitForTimeout(600);

    await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
  });

  test('Play button is visible in the header', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /^Play$/i })).toBeVisible();
  });

  test('Finalise button is visible', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /finalise/i })).toBeVisible();
  });

  test('story node shows its prose text in the canvas preview', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    // The test story has a story node with "Test Scene" as title
    await expect(page.getByText('Test Scene').first()).toBeVisible();
  });

  test('adding a node and saving does not crash', async ({ page }) => {
    await page.goto(`/story/${storyId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /\+ Story/i }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForTimeout(600);

    await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error');
  });
});
