import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BASE_URL, makeTestStoryId, makeTestStory, makeMinimalWav } from './helpers';

describe('Audio File API', () => {
  let storyId: string;
  const TEST_WAV = 'tts_automated_test_audio.wav';
  const TEST_JSON = 'tts_automated_test_timestamps.json';

  beforeAll(async () => {
    storyId = makeTestStoryId();
    await fetch(`${BASE_URL}/api/stories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(makeTestStory(storyId)),
    });
  });

  afterAll(async () => {
    await fetch(`${BASE_URL}/api/stories/${storyId}`, { method: 'DELETE' });
  });

  it('PUT /api/stories/:id/audio — uploads a WAV file and returns ok', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=${TEST_WAV}`, {
      method: 'PUT',
      headers: { 'content-type': 'audio/wav' },
      body: makeMinimalWav(),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('GET /api/stories/:id/audio — retrieves the WAV with correct content-type', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=${TEST_WAV}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('audio/wav');
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(44); // exact minimal WAV size
  });

  it('PUT /api/stories/:id/audio — uploads a JSON timestamps file', async () => {
    const timestamps = JSON.stringify([{ word: 'hello', start_ms: 0, end_ms: 300 }]);
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=${TEST_JSON}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: timestamps,
    });
    expect(res.status).toBe(200);
  });

  it('GET /api/stories/:id/audio — retrieves JSON timestamps with correct content-type', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=${TEST_JSON}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('PUT /api/stories/:id/audio — rejects path traversal in filename (security)', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=../../etc/passwd`, {
      method: 'PUT',
      headers: { 'content-type': 'audio/wav' },
      body: makeMinimalWav(),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /api/stories/:id/audio — rejects filenames that don\'t match expected patterns', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=malicious.exe`, {
      method: 'PUT',
      headers: { 'content-type': 'audio/wav' },
      body: makeMinimalWav(),
    });
    expect(res.status).toBe(400);
  });

  it('PUT /api/stories/:id/audio — rejects wrong content-type for audio file (HTTP 415)', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=${TEST_WAV}`, {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: makeMinimalWav(),
    });
    expect(res.status).toBe(415);
  });

  it('GET /api/stories/:id/audio — returns 400 for missing file param', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio`);
    expect(res.status).toBe(400);
  });

  it('DELETE /api/stories/:id/audio — removes the WAV file and returns ok', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=${TEST_WAV}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('GET /api/stories/:id/audio — returns 404 after deletion', async () => {
    const res = await fetch(`${BASE_URL}/api/stories/${storyId}/audio?file=${TEST_WAV}`);
    expect(res.status).toBe(404);
  });
});
