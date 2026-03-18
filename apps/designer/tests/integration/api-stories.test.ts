import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BASE_URL, makeTestStoryId, makeTestStory } from './helpers';

describe('Story API — CRUD', () => {
  let storyId: string;
  let story: ReturnType<typeof makeTestStory>;

  beforeAll(() => {
    storyId = makeTestStoryId();
    story = makeTestStory(storyId);
  });

  it('POST /api/stories — creates a new story and returns its ID', async () => {
    const res = await fetch(`${BASE_URL}/api/stories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(story),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty('id', storyId);
  });

  it('GET /api/stories — returns an array that includes the created story', async () => {
    const res = await fetch(`${BASE_URL}/api/stories`);
    expect(res.status).toBe(200);
    const stories = await res.json();
    expect(Array.isArray(stories)).toBe(true);
    expect(stories.some((s: { id: string }) => s.id === storyId)).toBe(true);
  });

  it('GET /api/stories/:id — retrieves the correct story by ID', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(storyId);
    expect(data.title).toBe(story.title);
    expect(data.genre).toBe(story.genre);
  });

  it('GET /api/stories/:id — preserves story nodes on read-back', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}`);
    const data = await res.json();
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(data.nodes).toHaveLength(2);
    expect(data.nodes[0].id).toBe('node_start');
  });

  it('PUT /api/stories/:id — updates the story and persists the change', async () => {
    const updated = { ...story, title: 'Updated Test Title' };
    const putRes = await fetch(`${BASE_URL}/api/stories/${storyId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(updated),
    });
    expect(putRes.status).toBe(200);
    expect((await putRes.json()).ok).toBe(true);

    // Verify the update was persisted
    const readRes = await fetch(`${BASE_URL}/api/stories/${storyId}`);
    expect((await readRes.json()).title).toBe('Updated Test Title');
  });

  it('GET /api/stories/:id — returns 404 for a non-existent story ID', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/nonexistent_story_xyz_999`);
    expect(res.status).toBe(404);
  });

  it('DELETE /api/stories/:id — removes the story and returns ok', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('GET /api/stories/:id — returns 404 after deletion (no ghost data)', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}`);
    expect(res.status).toBe(404);
  });
});
