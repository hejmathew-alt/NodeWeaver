/**
 * Deterministic per-character seed for Qwen TTS voice consistency.
 * Deterministic char-seed for consistent TTS voice reproduction.
 *
 * Same character ID → same seed → same voice across all chunks and sessions.
 */
export function charSeed(charKey: string): number {
  let h = 0x9e3779b9;
  for (const c of charKey || 'narrator')
    h = (Math.imul(h ^ c.charCodeAt(0), 0x9e3779b9) >>> 0);
  return h % 0x7fffffff;
}
