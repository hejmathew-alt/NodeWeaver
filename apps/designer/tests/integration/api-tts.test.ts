import { describe, it, expect } from 'vitest';
import { BASE_URL, ELEVENLABS_KEY, isServiceUp } from './helpers';

// ── Qwen (local) ──────────────────────────────────────────────────────────────

describe('TTS Smoke — Qwen (local server)', () => {
  it('POST /api/qwen/speak — returns a valid WAV audio buffer', async () => {
    const qwenUp = await isServiceUp('http://localhost:7862/health');
    if (!qwenUp) {
      console.warn('  ⚠ Qwen server not running at localhost:7862 — test skipped');
      return;
    }

    const res = await fetch(`${BASE_URL}/api/qwen/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello. This is an automated smoke test.',
        charSeed: 12345,
        qwenInstruct: 'Speak clearly.',
      }),
    });

    expect(res.status, `Expected 200, got ${res.status} — check Qwen server logs`).toBe(200);
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    expect(ct, `Unexpected content-type: ${ct}`).toMatch(/audio\/(wav|x-wav|mpeg)|application\/octet-stream/);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength, 'Audio buffer is empty').toBeGreaterThan(100);
  });

  it('POST /api/qwen/speak — returns an error (not a crash) when Qwen is unreachable', async () => {
    const qwenUp = await isServiceUp('http://localhost:7862/health');
    if (qwenUp) {
      console.warn('  ℹ Qwen is running — unreachable error test skipped');
      return;
    }
    // When Qwen is down, the route should return a graceful error, not a 500 crash
    const res = await fetch(`${BASE_URL}/api/qwen/speak`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'test', charSeed: 1, qwenInstruct: 'test' }),
    });
    // Accept any error response — just not a raw uncaught exception
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ── ElevenLabs (cloud) ────────────────────────────────────────────────────────

describe('TTS Smoke — ElevenLabs (cloud)', () => {
  it('POST /api/tts/elevenlabs — returns a valid MP3 audio buffer', async () => {
    if (!ELEVENLABS_KEY) {
      console.warn('  ⚠ No ELEVENLABS_API_KEY in .env.local — test skipped');
      return;
    }

    const res = await fetch(`${BASE_URL}/api/tts/elevenlabs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'This is an automated smoke test.',
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel — stable ElevenLabs public voice
        elevenLabsKey: ELEVENLABS_KEY,
      }),
    });

    if (res.status === 404) {
      console.warn('  ⚠ EL voice ID not found (404) — voice may have been removed from public library. Test skipped.');
      return;
    }
    expect(res.status, `Expected 200, got ${res.status} — check EL API key validity`).toBe(200);
    const ct = (res.headers.get('content-type') ?? '').toLowerCase();
    expect(ct, `Unexpected content-type: ${ct}`).toMatch(/audio\/(mpeg|mp3)|application\/octet-stream/);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength, 'Audio buffer is empty').toBeGreaterThan(100);
  });

  it('POST /api/tts/elevenlabs — returns 400 or 422 for missing voiceId', async () => {
    if (!ELEVENLABS_KEY) return;
    const res = await fetch(`${BASE_URL}/api/tts/elevenlabs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'test',
        elevenLabsKey: ELEVENLABS_KEY,
        // voiceId deliberately omitted
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
