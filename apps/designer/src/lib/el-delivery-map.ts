/**
 * Maps Qwen3-TTS delivery params (emotion, tone, voiceTexture) to
 * ElevenLabs voice_settings equivalents.
 *
 * ElevenLabs params:
 *   stability    0–1  lower = more expressive / variable performance
 *   similarity   0–1  voice similarity boost (clone fidelity)
 *   style        0–1  style exaggeration
 */

export interface ELDelivery {
  stability: number;
  similarity: number;
  style: number;
}

const DEFAULTS: ELDelivery = { stability: 0.50, similarity: 0.75, style: 0.20 };

const EMOTION_MAP: Record<string, Partial<ELDelivery>> = {
  neutral:   { stability: 0.55, style: 0.10 },
  happy:     { stability: 0.40, style: 0.40 },
  sad:       { stability: 0.60, style: 0.25 },
  angry:     { stability: 0.25, style: 0.60 },
  fearful:   { stability: 0.30, style: 0.50 },
  disgusted: { stability: 0.35, style: 0.55 },
  surprised: { stability: 0.30, style: 0.45 },
  excited:   { stability: 0.25, style: 0.65 },
  tender:    { stability: 0.60, style: 0.20 },
  cold:      { stability: 0.70, style: 0.10 },
};

const TONE_MAP: Record<string, Partial<ELDelivery>> = {
  conversational: { stability: 0.50 },
  dramatic:       { stability: 0.30, style: 0.50 },
  hushed:         { stability: 0.70, style: 0.05 },
  intense:        { stability: 0.25, style: 0.70 },
  tender:         { stability: 0.65, style: 0.15 },
  menacing:       { stability: 0.35, style: 0.60 },
  playful:        { stability: 0.35, style: 0.45 },
  formal:         { stability: 0.70, style: 0.10 },
  urgent:         { stability: 0.30, style: 0.55 },
  sardonic:       { stability: 0.45, style: 0.40 },
};

const TEXTURE_MAP: Record<string, Partial<ELDelivery>> = {
  breathy:  { similarity: 0.65, style: 0.20 },
  gravelly: { similarity: 0.80, style: 0.15 },
  smooth:   { similarity: 0.85, style: 0.10 },
  strained: { similarity: 0.70, style: 0.40 },
  resonant: { similarity: 0.90, style: 0.20 },
  thin:     { similarity: 0.60, style: 0.10 },
  rich:     { similarity: 0.88, style: 0.25 },
  husky:    { similarity: 0.75, style: 0.30 },
};

export function mapQwenToEL(
  emotion?: string | null,
  tone?: string | null,
  voiceTexture?: string | null,
): ELDelivery {
  const result = { ...DEFAULTS };

  if (emotion) {
    const e = EMOTION_MAP[emotion.toLowerCase()];
    if (e) Object.assign(result, e);
  }
  if (tone) {
    const t = TONE_MAP[tone.toLowerCase()];
    if (t) Object.assign(result, t);
  }
  if (voiceTexture) {
    const v = TEXTURE_MAP[voiceTexture.toLowerCase()];
    if (v) Object.assign(result, v);
  }

  // Clamp all values to [0, 1]
  result.stability  = Math.max(0, Math.min(1, result.stability));
  result.similarity = Math.max(0, Math.min(1, result.similarity));
  result.style      = Math.max(0, Math.min(1, result.style));

  return result;
}
