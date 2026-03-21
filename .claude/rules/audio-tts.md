---
paths:
  - "apps/designer/src/lib/tts-*"
  - "apps/designer/src/lib/qwen-*"
  - "apps/designer/src/lib/audiocraft-*"
  - "apps/designer/src/lib/sfx-*"
  - "apps/designer/src/lib/audio-*"
  - "apps/designer/src/lib/batch-tts*"
  - "apps/designer/src/lib/el-*"
  - "apps/designer/src/lib/char-seed*"
  - "apps/designer/src/app/api/qwen/**"
  - "apps/designer/src/app/api/stories/*/audio/**"
  - "servers/qwen_server.py"
  - "servers/audiocraft_server.py"
---

# Audio & TTS Rules

## Daemon Safety
- Never use `exec()` with template strings for subprocess commands. Use `spawn()` with argument arrays.
- Daemon env: explicit whitelist only (`PATH`, `HOME`, and service-specific vars). Never spread `...process.env`.
- Daemon paths: always use `os.homedir() + 'Documents/NodeWeaver/servers/'`. Never hardcode absolute paths.

## Web Audio
- AudioContext may be suspended outside user-gesture call stack. Always check `ctx.state === 'suspended'` and call `ctx.resume()` before `decodeAudioData` or scheduling.
- TTSPlayer callbacks (`onFirstAudio`, `onAllChunks`) are one-shot — cleared after firing.
- Volume: 0–1 range. Clamp via `Math.max(0, Math.min(1, v))` on gainNode.value.

## File Safety
- Audio filenames: validate with `safeAudioFilename()` regex whitelist before any disk operation. `path.basename()` alone is insufficient.
- Streaming WAV: each chunk has a 44-byte header. `assembleWavChunks()` strips headers before concatenation.

## Voice Consistency
- `charSeed(characterId)` must be deterministic — same ID always produces same seed (djb2 hash).
- Never auto-play audio after async fetch — browser gesture context expires. Always use explicit play button.

## ElevenLabs
- EL voice design preview: store blob URL in state, play via separate button handler.
- EL delivery mapping: `mapQwenToEL()` converts emotion/tone/voiceTexture to stability/similarity/style.
- EL audio cache: `EL_AUDIO_CACHE` is module-level Map — shared across components within a session.
