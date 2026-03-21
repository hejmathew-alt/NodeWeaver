import { describe, it, expect } from 'vitest';
import { BASE_URL } from './helpers';

// NOTE: These tests call the real Claude API and consume a small number of tokens.
// They verify route reachability and valid response structure — not content quality.

describe('AI Generate API', () => {
  it('POST /api/ai/generate mode=voice — streams a voice instruct prompt', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'voice',
        concept: 'A gruff old sea captain with a raspy voice',
      }),
    });
    expect(res.status, `Expected 200, got ${res.status}`).toBe(200);
    const text = await res.text();
    expect(text.length, 'Response body is empty').toBeGreaterThan(5);
  });

  it('POST /api/ai/generate mode=line — streams a single dialogue line', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'line',
        nodeTitle: 'Docking Bay Arrival',
        nodeBody: 'The ship has just landed on the station.',
        characterName: 'Pilot',
        characterRole: 'Experienced ship pilot',
        genre: 'sci-fi',
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(5);
  });

  it('POST /api/ai/generate mode=inspire — returns a story concept (non-streaming)', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'inspire',
        genre: 'sci-fi',
      }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(10);
  });

  it('POST /api/ai/generate mode=avatar-prompt — returns a short SD prompt (non-streaming)', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'avatar-prompt',
        characterName: 'Commander Vale',
        characterRole: 'Military officer',
        backstory: 'Veteran of the Proxima conflict',
        traits: ['stoic', 'scarred'],
      }),
    });
    expect(res.status).toBe(200);
    // Route returns non-streaming JSON: { text: "..." }
    const data = await res.json();
    expect(typeof data.text, 'Expected { text: string } response').toBe('string');
    expect(data.text.length).toBeGreaterThan(5);
  });

  it('POST /api/ai/generate — handles a missing mode field without crashing', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'no mode provided' }),
    });
    // Route does not validate mode — returns some response rather than crashing (5xx)
    expect(res.status).toBeLessThan(500);
  });
});
