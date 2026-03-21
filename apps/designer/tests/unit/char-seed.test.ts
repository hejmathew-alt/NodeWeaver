import { describe, it, expect } from 'vitest';
import { charSeed } from '@/lib/char-seed';

describe('charSeed', () => {
  it('returns a positive integer', () => {
    expect(charSeed('narrator')).toBeGreaterThan(0);
  });

  it('is deterministic — same input always returns the same seed', () => {
    const id = 'char_abc123';
    const first = charSeed(id);
    const second = charSeed(id);
    expect(first).toBe(second);
  });

  it('produces different seeds for different character IDs', () => {
    expect(charSeed('char_alice')).not.toBe(charSeed('char_bob'));
  });

  it('falls back to the narrator seed for an empty string', () => {
    expect(charSeed('')).toBe(charSeed('narrator'));
  });

  it('returns a value within the safe integer range (< 0x7fffffff)', () => {
    expect(charSeed('some_character_id')).toBeLessThan(0x7fffffff);
    expect(charSeed('narrator')).toBeLessThan(0x7fffffff);
  });

  it('produces consistent results across 10 consecutive calls', () => {
    const id = 'persistent_voice_character';
    const seeds = Array.from({ length: 10 }, () => charSeed(id));
    expect(new Set(seeds).size).toBe(1);
  });

  it('handles long character IDs without error', () => {
    const longId = 'char_' + 'a'.repeat(200);
    expect(() => charSeed(longId)).not.toThrow();
    expect(charSeed(longId)).toBeGreaterThan(0);
  });

  it('handles special characters in IDs without crashing', () => {
    expect(() => charSeed('char-with-dashes_and_underscores')).not.toThrow();
  });
});
