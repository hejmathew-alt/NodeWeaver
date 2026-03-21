/**
 * Shared TTS player — used by both the node editor panel and PlayMode.
 * Streams audio from the local Qwen TTS server via Web Audio API.
 *
 * Uses direct PCM→AudioBuffer creation instead of decodeAudioData to avoid
 * per-chunk resampling artifacts (clicks at chunk boundaries).
 */
import { charSeed } from './char-seed';
import type { NWVCharacter } from '@nodeweaver/engine';

// ── WAV header parsing ──────────────────────────────────────────────────────

/** Extract sample rate, channels, and bits-per-sample from a WAV header. */
function parseWavHeader(buf: ArrayBuffer) {
  const view = new DataView(buf);
  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
}

/** Convert WAV ArrayBuffer to a Float32Array of PCM samples (skip header). */
function wavToFloat32(buf: ArrayBuffer): { samples: Float32Array; sampleRate: number; channels: number } {
  const { channels, sampleRate, bitsPerSample } = parseWavHeader(buf);

  // Find the 'data' chunk — usually at byte 44 but not guaranteed
  const bytes = new Uint8Array(buf);
  let dataOffset = 12; // skip RIFF header
  while (dataOffset + 8 < bytes.length) {
    const id = String.fromCharCode(bytes[dataOffset], bytes[dataOffset + 1], bytes[dataOffset + 2], bytes[dataOffset + 3]);
    const chunkSize = new DataView(buf, dataOffset + 4).getUint32(0, true);
    if (id === 'data') {
      dataOffset += 8; // skip 'data' + size
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const pcmBytes = new Uint8Array(buf, dataOffset);

  if (bitsPerSample === 16) {
    const int16 = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength >> 1);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }
    return { samples: float32, sampleRate, channels };
  }

  // Fallback for other bit depths — shouldn't happen with our server
  const float32 = new Float32Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength >> 2);
  return { samples: float32, sampleRate, channels };
}

// ── TTSPlayer ───────────────────────────────────────────────────────────────

export class TTSPlayer {
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private scheduledEnd = 0;
  private activeNodes: AudioBufferSourceNode[] = [];
  private lastEnded: Promise<void> = Promise.resolve();
  private streamCtrl: AbortController | null = null;
  private _abort = { stop: false };
  /** Sample rate from the first received WAV chunk — used to create a matched AudioContext. */
  private sourceSampleRate: number | null = null;

  /**
   * Called once per playLine() — fires with the real-world ms timestamp at which
   * the first audio chunk will begin playing (Date.now() + ~5ms).
   * Cleared automatically after firing. Set before calling playLine() if needed.
   */
  onFirstAudio?: (startedAtMs: number) => void;

  /**
   * Called once per playLine() when the stream ends (all WAV chunks received).
   * Fires before waiting for audio playback to finish. Cleared automatically.
   * Useful for assembling the full audio for CTC alignment while audio plays.
   */
  onAllChunks?: (chunks: ArrayBuffer[]) => void;

  /** Voice volume (0–1). Updates the master gain node immediately. */
  set volume(v: number) {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  /** True if playback has not been stopped */
  get playing() { return !this._abort.stop; }

  /** True if stop() was explicitly called */
  get stopped() { return this._abort.stop; }

  /** Stop all audio and abort any in-flight fetch */
  stop() {
    this._abort.stop = true;
    this.streamCtrl?.abort();
    // Ramp gain to 0 over 10ms to avoid a pop from abruptly cutting audio
    if (this.masterGain && this.audioCtx && this.audioCtx.state === 'running') {
      const ctx = this.audioCtx;
      const gain = this.masterGain.gain;
      gain.cancelScheduledValues(ctx.currentTime);
      gain.setValueAtTime(gain.value, ctx.currentTime);
      gain.linearRampToValueAtTime(0, ctx.currentTime + 0.01);
      // Stop sources after the ramp completes
      this.activeNodes.forEach((n) => {
        try { n.stop(ctx.currentTime + 0.015); } catch {}
      });
    } else {
      this.activeNodes.forEach((n) => {
        try { n.stop(); } catch {}
      });
    }
    this.activeNodes = [];
    this.scheduledEnd = 0;
  }

  /** Stop and close the AudioContext entirely */
  dispose() {
    this.stop();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
      this.sourceSampleRate = null;
    }
  }

  /** Call before starting a new playback session */
  reset() {
    this.stop();
    this._abort = { stop: false };
    const ctx = this.getCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    // Cancel any lingering ramps, then fade in over 5ms
    const gain = this.masterGain!.gain;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(0, ctx.currentTime);
    gain.linearRampToValueAtTime(1, ctx.currentTime + 0.005);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private getCtx(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      // Create AudioContext at the source sample rate if known — this avoids
      // per-chunk resampling which causes boundary clicks.
      const opts = this.sourceSampleRate ? { sampleRate: this.sourceSampleRate } : undefined;
      this.audioCtx = new AudioContext(opts);
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.connect(this.audioCtx.destination);
      this.scheduledEnd = 0;
      this.activeNodes = [];
      this.lastEnded = Promise.resolve();
    }
    return this.audioCtx;
  }

  /**
   * Parse WAV, create AudioBuffer directly from PCM samples, and schedule.
   * Bypasses decodeAudioData to avoid per-chunk resampling artifacts.
   */
  private scheduleBuffer(arrayBuffer: ArrayBuffer): void {
    try {
      const { samples, sampleRate, channels } = wavToFloat32(arrayBuffer);

      // On the first chunk, check if we need to recreate the AudioContext
      // at the source sample rate to avoid resampling entirely.
      if (this.sourceSampleRate === null) {
        this.sourceSampleRate = sampleRate;
        if (this.audioCtx && this.audioCtx.sampleRate !== sampleRate) {
          // Recreate context at the correct sample rate
          if (this.audioCtx.state !== 'closed') this.audioCtx.close();
          this.audioCtx = null;
        }
      }

      const ctx = this.getCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const numFrames = channels > 1 ? samples.length / channels : samples.length;
      const audioBuf = ctx.createBuffer(1, numFrames, sampleRate);
      const channelData = audioBuf.getChannelData(0);

      if (channels === 1) {
        channelData.set(samples);
      } else {
        // Downmix to mono
        for (let i = 0; i < numFrames; i++) {
          let sum = 0;
          for (let ch = 0; ch < channels; ch++) {
            sum += samples[i * channels + ch];
          }
          channelData[i] = sum / channels;
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      source.connect(this.masterGain!);
      const startAt = Math.max(ctx.currentTime + 0.005, this.scheduledEnd);

      // Fire onFirstAudio once — tells callers when the first audio chunk actually plays
      if (this.onFirstAudio) {
        const cb = this.onFirstAudio;
        this.onFirstAudio = undefined;
        cb(Date.now() + Math.round((startAt - ctx.currentTime) * 1000));
      }

      this.scheduledEnd = startAt + audioBuf.duration;
      source.start(startAt);
      this.activeNodes.push(source);
      this.lastEnded = new Promise<void>((resolve) => {
        source.onended = () => {
          this.activeNodes = this.activeNodes.filter((n) => n !== source);
          resolve();
        };
      });
    } catch (err) {
      if (err instanceof Error) console.error('[TTSPlayer] schedule error:', err.message);
      else console.error('[TTSPlayer] schedule error:', err);
    }
  }

  private waitForEnd(): Promise<void> {
    return this.lastEnded;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Stream a single line of TTS audio for a character.
   * Returns true if completed, false if stopped or TTS unavailable.
   */
  async playLine(
    text: string,
    character: NWVCharacter,
    opts?: { emotion?: string; tone?: string; voiceTexture?: string; temperature?: number },
  ): Promise<boolean> {
    const abort = this._abort;
    if (!text.trim() || abort.stop) return false;

    // Per-block values override character defaults
    const emotion = opts?.emotion || character.defaultEmotion;
    const tone = opts?.tone || character.defaultTone;
    const voiceTexture = opts?.voiceTexture || character.defaultVoiceTexture;
    let tags = '';
    if (emotion) tags += `[Emotional: ${emotion}] `;
    if (tone) tags += `[Tone: ${tone}] `;
    if (voiceTexture) tags += `[Voice: ${voiceTexture}] `;

    // Delivery tags stay in instruct — Qwen interprets bracket tags as voice cues
    // only when in the instruct field. Short base instruct (5-12 tokens) + tags
    // keeps embedding stable enough while allowing per-block delivery variation.
    const instruct = (character.qwenInstruct ?? '') + (tags ? ' ' + tags.trim() : '');

    const ctrl = new AbortController();
    this.streamCtrl = ctrl;
    const chunksCb = this.onAllChunks;
    this.onAllChunks = undefined;
    const collectedChunks: ArrayBuffer[] | null = chunksCb ? [] : null;

    let res: Response;
    try {
      // Eagerly chain .catch() so the AbortError is never briefly "unhandled"
      // in the dev overlay, even before the microtask catch block runs.
      const fetchPromise = fetch('/api/qwen/stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          instruct,
          seed: charSeed(character.id),
          temperature: opts?.temperature ?? 0.7,
          streaming_interval: 0.32,
          max_tokens: 2000,
        }),
        signal: ctrl.signal,
      });
      fetchPromise.catch(() => {}); // pre-register handler to silence unhandled-rejection noise
      res = await fetchPromise;
    } catch {
      return false;
    }

    if (!res.ok || !res.body || abort.stop) return false;

    const reader = res.body.getReader();
    let buf = new Uint8Array(0);

    while (true) {
      if (abort.stop) { reader.cancel().catch(() => {}); return false; }
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch {
        return false;
      }
      if (done) break;
      if (value) {
        const tmp = new Uint8Array(buf.length + value.length);
        tmp.set(buf);
        tmp.set(value, buf.length);
        buf = tmp;
      }
      // Consume length-prefixed WAV packets: [4-byte big-endian len][WAV bytes]
      while (buf.length >= 4) {
        const len = new DataView(buf.buffer, buf.byteOffset).getUint32(0, false);
        if (buf.length < 4 + len) break;
        const wavBuf = buf.slice(4, 4 + len).buffer;
        buf = buf.slice(4 + len);
        if (collectedChunks) collectedChunks.push(wavBuf.slice(0));
        if (!abort.stop) this.scheduleBuffer(wavBuf);
      }
    }

    // Fire chunk callback before waiting for audio to finish — lets caller run
    // CTC alignment concurrently while audio plays back.
    if (chunksCb && collectedChunks && collectedChunks.length > 0 && !abort.stop) {
      chunksCb(collectedChunks);
    }

    if (!abort.stop) await this.waitForEnd();
    return !abort.stop;
  }
}
