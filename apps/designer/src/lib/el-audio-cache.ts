/**
 * Module-level ElevenLabs audio cache.
 *
 * Shared between PlayMode and NodeEditorPanel so the same synthesis request
 * is never sent twice within a browser session.
 *
 * Key format: `{voiceId}::{stability}::{similarity}::{style}::{text}`
 */

export const EL_AUDIO_CACHE = new Map<string, ArrayBuffer>();

export function makeElCacheKey(
  text: string,
  voiceId: string | undefined,
  stability: number | undefined,
  similarity: number | undefined,
  style: number | undefined,
): string {
  return [
    voiceId ?? 'no-voice',
    (stability  ?? 0.50).toFixed(2),
    (similarity ?? 0.75).toFixed(2),
    (style      ?? 0.20).toFixed(2),
    text.trim(),
  ].join('::');
}
