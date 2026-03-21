/**
 * SFXPlayer — Web Audio API wrapper for SFX, ambient loops, and music.
 *
 * Each PlayMode instance creates three separate SFXPlayer instances:
 *   - ambientPlayerRef  → playLooped() for continuous ambient soundscapes
 *   - musicPlayerRef    → playLooped() for background score
 *   - sfxPlayerRef      → playOnce() for spot SFX cues
 *
 * API:
 *   getCtx()                       → the underlying AudioContext (for scheduling)
 *   playOnce(buf, volume?)         → decode + play ArrayBuffer once
 *   playLooped(buf, volume?)       → decode + play ArrayBuffer looping forever
 *   playFromUrl(url, volume?)      → fetch URL then playOnce
 *   stop()                         → stop + disconnect all active sources
 *   dispose()                      → stop + close AudioContext
 */

export class SFXPlayer {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private activeSources: AudioBufferSourceNode[] = [];

  // ── Context ───────────────────────────────────────────────────────────────

  getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private getGain(): GainNode {
    this.getCtx(); // ensure ctx + gain exist
    return this.gainNode!;
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  async playOnce(buf: ArrayBuffer, volume = 1): Promise<void> {
    try {
      const ctx = this.getCtx();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = false;
      const gain = this.getGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      source.connect(gain);
      source.start();
      this.activeSources.push(source);
      source.onended = () => {
        this.activeSources = this.activeSources.filter((s) => s !== source);
      };
    } catch {
      // Silently swallow decode/playback errors (e.g. bad audio data)
    }
  }

  async playLooped(buf: ArrayBuffer, volume = 1): Promise<void> {
    // Stop any existing loop on this player before starting the new one
    this.stop();
    try {
      const ctx = this.getCtx();
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      const gain = this.getGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      source.connect(gain);
      source.start();
      this.activeSources.push(source);
      source.onended = () => {
        this.activeSources = this.activeSources.filter((s) => s !== source);
      };
    } catch {
      // Silently swallow decode/playback errors
    }
  }

  async playFromUrl(url: string, volume = 1): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      await this.playOnce(buf, volume);
    } catch {
      // Network or decode error — ignore
    }
  }

  // ── Control ───────────────────────────────────────────────────────────────

  stop(): void {
    if (this.ctx && this.gainNode && this.ctx.state === 'running' && this.activeSources.length > 0) {
      // Ramp gain to 0 over 50ms to avoid a pop from abruptly cutting audio
      const g = this.gainNode.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setValueAtTime(g.value, this.ctx.currentTime);
      g.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);
      for (const source of this.activeSources) {
        try { source.stop(this.ctx.currentTime + 0.06); } catch { /* already stopped */ }
      }
    } else {
      for (const source of this.activeSources) {
        try { source.stop(); } catch { /* already stopped */ }
        try { source.disconnect(); } catch { /* already disconnected */ }
      }
    }
    this.activeSources = [];
  }

  dispose(): void {
    this.stop();
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch { /* ignore */ }
      this.gainNode = null;
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
  }
}
