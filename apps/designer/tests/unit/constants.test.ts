import { describe, it, expect } from 'vitest';
import {
  DEBOUNCE_PERSIST,
  DEBOUNCE_SPANS,
  AI_MAX_TOKENS,
  AI_MAX_TOKENS_DEFAULT,
} from '@/lib/constants';

describe('DEBOUNCE_PERSIST', () => {
  it('is 300ms', () => expect(DEBOUNCE_PERSIST).toBe(300));
  it('is a positive number', () => expect(DEBOUNCE_PERSIST).toBeGreaterThan(0));
});

describe('DEBOUNCE_SPANS', () => {
  it('is 400ms', () => expect(DEBOUNCE_SPANS).toBe(400));
  it('is longer than DEBOUNCE_PERSIST to avoid race with save', () => {
    expect(DEBOUNCE_SPANS).toBeGreaterThan(DEBOUNCE_PERSIST);
  });
});

describe('AI_MAX_TOKENS', () => {
  it('defines a token limit for every authoring mode', () => {
    const criticalModes = [
      'voice', 'line', 'audio-suggest', 'sfx-suggest',
      'story-gen', 'inspire', 'command-interpret',
      'avatar-prompt', 'loom-analyse', 'loom-chat', 'lighting-suggest',
    ];
    for (const mode of criticalModes) {
      const limit = AI_MAX_TOKENS[mode] ?? AI_MAX_TOKENS_DEFAULT;
      expect(limit, `Token limit missing or zero for mode "${mode}"`).toBeGreaterThan(0);
    }
  });

  it('voice mode uses fewer tokens than loom-analyse (single phrase vs full analysis)', () => {
    expect(AI_MAX_TOKENS['voice']).toBeLessThan(AI_MAX_TOKENS['loom-analyse']);
  });

  it('story-gen has the highest token limit (full story generation)', () => {
    const maxOther = Math.max(
      ...Object.entries(AI_MAX_TOKENS)
        .filter(([k]) => k !== 'story-gen')
        .map(([, v]) => v)
    );
    expect(AI_MAX_TOKENS['story-gen']).toBeGreaterThan(maxOther);
  });

  it('all token limits are positive integers', () => {
    for (const [mode, limit] of Object.entries(AI_MAX_TOKENS)) {
      expect(limit, `Non-positive limit for mode "${mode}"`).toBeGreaterThan(0);
      expect(Number.isInteger(limit), `Non-integer limit for mode "${mode}"`).toBe(true);
    }
  });
});

describe('AI_MAX_TOKENS_DEFAULT', () => {
  it('is a positive integer fallback', () => {
    expect(AI_MAX_TOKENS_DEFAULT).toBeGreaterThan(0);
    expect(Number.isInteger(AI_MAX_TOKENS_DEFAULT)).toBe(true);
  });
});
