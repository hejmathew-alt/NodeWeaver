'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { computeVFXState, applyVFXToDOM } from '@/lib/vfx-engine';
import type { NWVStory, NWVNode, NWVBlock, NWVChoice, NWVCharacter, NWVEnemy, WordTimestamp } from '@nodeweaver/engine';
import { TTSPlayer } from '@/lib/tts-player';
import { SFXPlayer } from '@/lib/sfx-player';
import { useSettingsStore } from '@/lib/settings';
import { useStoryStore } from '@/store/story';
import { readAudioFileServer, saveAudioFileServer, makeTTSFilename, readTimestampsServer, saveTimestampsServer } from '@/lib/audio-storage';
import { mapQwenToEL } from '@/lib/el-delivery-map';
import { EL_AUDIO_CACHE, makeElCacheKey } from '@/lib/el-audio-cache';
import { charSeed } from '@/lib/char-seed';

const NARRATOR_FALLBACK: NWVCharacter = {
  id: 'narrator',
  name: 'Narrator',
  role: '',
  backstory: '',
  traits: '',
  qwenInstruct: 'A calm, measured narrator with a clear, neutral voice.',
  voiceLocked: true,
};

/** Fast non-cryptographic hash for cache keying (djb2 variant). */
function simpleHash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return h >>> 0;
}

/** Extracts playback duration in ms from a standard PCM WAV buffer header. */
function getWavDurationMs(wav: ArrayBuffer): number {
  if (wav.byteLength < 44) return 0;
  const v = new DataView(wav);
  const sampleRate = v.getUint32(24, true);
  const blockAlign = v.getUint16(32, true);
  const dataSize   = v.getUint32(40, true);
  if (!sampleRate || !blockAlign) return 0;
  return Math.round((dataSize / blockAlign / sampleRate) * 1000);
}

/** Estimate reading time in ms for text without TTS */
function readingDelay(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1200, Math.min(words * 200, 6000));
}

/**
 * Assemble multiple WAV chunk ArrayBuffers (each a valid WAV file) into one WAV.
 * Strips headers from all but the first chunk and concatenates the PCM data.
 * Standard PCM WAV header is 44 bytes.
 */
function assembleWavChunks(chunks: ArrayBuffer[]): ArrayBuffer {
  if (chunks.length === 0) return new ArrayBuffer(0);
  if (chunks.length === 1) return chunks[0];
  const WAV_HDR = 44;
  const view0 = new DataView(chunks[0]);
  const sampleRate  = view0.getUint32(24, true);
  const numChannels = view0.getUint16(22, true);
  const bitsPerSample = view0.getUint16(34, true);
  const byteRate = view0.getUint32(28, true);
  const blockAlign = view0.getUint16(32, true);
  const pcmChunks = chunks.map((c) => c.slice(WAV_HDR));
  const totalPcm = pcmChunks.reduce((a, b) => a + b.byteLength, 0);
  const out = new ArrayBuffer(WAV_HDR + totalPcm);
  const v = new DataView(out);
  // RIFF
  v.setUint8(0, 0x52); v.setUint8(1, 0x49); v.setUint8(2, 0x46); v.setUint8(3, 0x46);
  v.setUint32(4, 36 + totalPcm, true);
  v.setUint8(8, 0x57); v.setUint8(9, 0x41); v.setUint8(10, 0x56); v.setUint8(11, 0x45);
  // fmt
  v.setUint8(12, 0x66); v.setUint8(13, 0x6D); v.setUint8(14, 0x74); v.setUint8(15, 0x20);
  v.setUint32(16, 16, true);      // PCM fmt chunk size
  v.setUint16(20, 1, true);       // PCM format
  v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  // data
  v.setUint8(36, 0x64); v.setUint8(37, 0x61); v.setUint8(38, 0x74); v.setUint8(39, 0x61);
  v.setUint32(40, totalPcm, true);
  let offset = WAV_HDR;
  for (const pcm of pcmChunks) {
    new Uint8Array(out).set(new Uint8Array(pcm), offset);
    offset += pcm.byteLength;
  }
  return out;
}

type PlayPhase = 'playing' | 'choosing' | 'transition' | 'ended' | 'error' | 'combat';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

interface CombatState {
  enemy: NWVEnemy;
  node: NWVNode;
  enemyHp: number;
}

function rollD6(): number { return Math.floor(Math.random() * 6) + 1; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }


export function PlayMode({ story, startNodeId, onExit }: { story: NWVStory; startNodeId?: string; onExit: () => void }) {
  const qwenTemperature = useSettingsStore((s) => s.qwenTemperature);
  const elevenLabsKey = useSettingsStore((s) => s.elevenLabsKey);
  const updateBlock = useStoryStore((s) => s.updateBlock);
  const setPlayingNodeId = useStoryStore((s) => s.setPlayingNodeId);
  const addVisitedNode = useStoryStore((s) => s.addVisitedNode);
  const addChosenChoice = useStoryStore((s) => s.addChosenChoice);
  const clearPlayHistory = useStoryStore((s) => s.clearPlayHistory);
  const playerRef = useRef<TTSPlayer | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [phase, setPhase] = useState<PlayPhase>('playing');
  const [visibleBlocks, setVisibleBlocks] = useState<NWVBlock[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const activeBlockIdRef = useRef<string | null>(null); // stable ref for timer callbacks
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ttsAvailable, setTtsAvailable] = useState(true);
  const [consequenceText, setConsequenceText] = useState<string | null>(null);
  const [playerHp, setPlayerHp] = useState(100);
  const playerMaxHp = 100;
  const [activeCombat, setActiveCombat] = useState<CombatState | null>(null);
  const [combatLog, setCombatLog] = useState<string[]>([]);
  const [diceDisplay, setDiceDisplay] = useState<{ player: string; enemy: string } | null>(null);
  const [diceRolling, setDiceRolling] = useState(false);
  const [playerHurt, setPlayerHurt] = useState(false);
  const [hurtKey, setHurtKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(false);
  const skipBlockRef = useRef(false);

  // VFX lighting refs
  const pmContentRef = useRef<HTMLDivElement | null>(null);
  const pmTintRef = useRef<HTMLDivElement | null>(null);
  const pmVignetteRef = useRef<HTMLDivElement | null>(null);
  const beamCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeStartMsRef = useRef<number>(0);
  // Stable ref so playNode doesn't need story in its deps (avoids re-triggering
  // the playback effect when updateBlock writes the EL cache back to the store)
  const storyRef = useRef(story);
  useEffect(() => { storyRef.current = story; }, [story]);

  // Reset VFX node start time when switching nodes
  useEffect(() => { nodeStartMsRef.current = Date.now(); }, [currentNodeId]);

  // VFX RAF loop — applies keyframe effects to PlayMode content
  useEffect(() => {
    let rafId: number;
    function tick() {
      const node = storyRef.current.nodes.find((n) => n.id === currentNodeId) ?? null;
      const kf = node?.vfxKeyframes ?? [];
      const currentMs = Date.now() - nodeStartMsRef.current;
      const state = computeVFXState(kf, currentMs);
      applyVFXToDOM(pmContentRef.current, pmTintRef.current, pmVignetteRef.current, state);

      // Canvas beam — warm spotlight following the active block
      const canvas = beamCanvasRef.current;
      const container = pmContentRef.current;
      if (canvas && container && state.vignette > 0.25) {
        const w = container.offsetWidth;
        const h = container.offsetHeight;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          const activeEl = container.querySelector('[data-active-block="true"]') as HTMLElement | null;
          if (activeEl) {
            const containerRect = container.getBoundingClientRect();
            const blockRect = activeEl.getBoundingClientRect();
            const cx = blockRect.left - containerRect.left + blockRect.width / 2;
            const cy = blockRect.top - containerRect.top + blockRect.height / 2;
            const radius = Math.max(blockRect.width * 0.8, 220);
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
            const intensity = 0.06 + state.vignette * 0.1;
            grad.addColorStop(0, `rgba(255,200,120,${intensity.toFixed(3)})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
          }
        }
      } else if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }

      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNodeId]);

  // SFX players for ambient/music/spot effects
  const ambientPlayerRef = useRef<SFXPlayer | null>(null);
  const musicPlayerRef = useRef<SFXPlayer | null>(null);
  const sfxPlayerRef = useRef<SFXPlayer | null>(null);

  // Create TTS + SFX players once
  useEffect(() => {
    playerRef.current = new TTSPlayer();
    ambientPlayerRef.current = new SFXPlayer();
    musicPlayerRef.current = new SFXPlayer();
    sfxPlayerRef.current = new SFXPlayer();
    return () => {
      playingRef.current = false;
      playerRef.current?.dispose();
      ambientPlayerRef.current?.dispose();
      musicPlayerRef.current?.dispose();
      sfxPlayerRef.current?.dispose();
    };
  }, []);

  // Find start node on mount only — reads from storyRef so this doesn't
  // re-fire when the store updates (e.g. EL cache writes).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    clearPlayHistory();
    const startNode = startNodeId
      ? (storyRef.current.nodes.find((n) => n.id === startNodeId) ?? storyRef.current.nodes.find((n) => n.type === 'start'))
      : storyRef.current.nodes.find((n) => n.type === 'start');
    if (!startNode) {
      setPhase('error');
      setErrorMsg('No start node found in this story.');
      return;
    }
    setCurrentNodeId(startNode.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Play a node's blocks sequentially
  const playNode = useCallback(
    async (nodeId: string) => {
      const player = playerRef.current;
      if (!player) return;

      // Snapshot story from ref — keeps this callback stable so the playback
      // effect doesn't re-fire when the store updates (e.g. EL cache write).
      const story = storyRef.current;

      const node = story.nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const blocks = node.blocks ?? [];
      setVisibleBlocks([]);
      setActiveBlockId(null);
      setPhase('playing');
      playingRef.current = true;

      player.reset();

      // Pre-warm SFX AudioContext (must happen in user-gesture chain)
      if (sfxPlayerRef.current) {
        const sfxCtx = sfxPlayerRef.current.getCtx();
        if (sfxCtx.state === 'suspended') await sfxCtx.resume();
      }

      // Stop previous node's ambient/music, start this node's
      ambientPlayerRef.current?.stop();
      musicPlayerRef.current?.stop();

      // Load and start this node's ambient/music from IndexedDB
      const ambientFile = node.audio?.find((f: string) => f.startsWith('ambient_'));
      const musicFile = node.audio?.find((f: string) => f.startsWith('music_'));

      if (ambientFile && ambientPlayerRef.current) {
        readAudioFileServer(story.id, ambientFile)
          .then((buf) => buf && ambientPlayerRef.current?.playLooped(buf, useSettingsStore.getState().volumeAmbient))
          .catch((err) => console.warn('[PlayMode] Ambient load failed:', ambientFile, err));
      }
      if (musicFile && musicPlayerRef.current) {
        readAudioFileServer(story.id, musicFile)
          .then((buf) => buf && musicPlayerRef.current?.playLooped(buf, useSettingsStore.getState().volumeMusic))
          .catch((err) => console.warn('[PlayMode] Music load failed:', musicFile, err));
      }

      for (const block of blocks) {
        if (!playingRef.current) break;
        skipBlockRef.current = false;
        if (!block.text?.trim()) continue;

        // Reveal this block
        setVisibleBlocks((prev) => [...prev, block]);
        setActiveBlockId(block.id);
        activeBlockIdRef.current = block.id;

        // ── Pre-load timestamps + SFX buffers concurrently with TTS setup ──────
        // Neither awaited here — they start in the background and are consumed
        // inside scheduleFromStart() once the audio actually begins playing.
        const totalWords = block.text.trim().split(/\s+/).length;
        // ~150 WPM = 400ms/word; no upper cap — long blocks can genuinely take 20s+
        const estimatedMs = Math.max(1500, totalWords * 400);

        // Streaming-path cache key — text-hash-keyed so edits auto-invalidate stale data
        const streamTsKey = `stream_${block.id}_${simpleHash(block.text)}`;
        const tsPromise: Promise<WordTimestamp[] | null> = useSettingsStore.getState().wordTimestamps
          ? (block.ttsAudioFile
              ? readTimestampsServer(story.id, block.ttsAudioFile).catch(() => null)
              : Promise.resolve(null)
            ).then((ts) => ts ?? readTimestampsServer(story.id, streamTsKey).catch(() => null))
          : Promise.resolve(null);

        const sfxBufsPromise = block.sfxCues?.length
          ? Promise.all(
              block.sfxCues.map((cue) =>
                readAudioFileServer(story.id, cue.filename).catch(() => null),
              ),
            )
          : Promise.resolve([] as Array<ArrayBuffer | null>);

        /**
         * Call this the moment audio output actually begins (via audio.onplay or
         * onFirstAudio). Immediately schedules estimated word timers from word 1,
         * then upgrades future timers to real CTC/IDB timestamps when they arrive.
         * This eliminates the "starts from halfway" cascade on first play.
         */
        const scheduleFromStart = (startedAtMs: number, inlineTsPromise?: Promise<WordTimestamp[] | null>, audioDurationSec?: number): (realDurationMs: number) => void => {
          const tsToUse: Promise<WordTimestamp[] | null> = inlineTsPromise ?? tsPromise;
          const initDurationMs = (audioDurationSec != null && isFinite(audioDurationSec) && audioDurationSec > 0)
            ? audioDurationSec * 1000 : estimatedMs;

          // ── SFX Phase 1: schedule immediately when IDB buffers load ───────────
          // Does NOT wait for CTC — fires within ~20ms of scheduleFromStart.
          // Uses estimated duration (or exact if audioDurationSec is known).
          type SfxTimer = { cueIdx: number; timer: ReturnType<typeof setTimeout>; fired: boolean; buf: ArrayBuffer };
          const sfxTimers: SfxTimer[] = [];
          if (block.sfxCues?.length) {
            void sfxBufsPromise.then((sfxBufs) => {
              if (!playingRef.current) return;
              const words = block.text.trim().split(/\s+/);
              block.sfxCues!.forEach((cue, idx) => {
                const buf = sfxBufs[idx];
                if (!buf) return;
                const offset = cue.wordIndex != null
                  ? Math.round((cue.wordIndex / words.length) * initDurationMs) + (cue.wordOffsetMs ?? 0)
                  : (cue.offsetMs ?? 0);
                const entry: SfxTimer = { cueIdx: idx, timer: undefined as never, fired: false, buf: buf as ArrayBuffer };
                entry.timer = setTimeout(() => {
                  entry.fired = true;
                  if (playingRef.current && sfxPlayerRef.current) {
                    sfxPlayerRef.current.playOnce(buf as ArrayBuffer, useSettingsStore.getState().volumeSfx);
                  }
                }, Math.max(0, startedAtMs + offset - Date.now()));
                sfxTimers.push(entry);
              });
            });
          }

          // ── Stage 2a: Duration refinement (streaming path — fires at stream end) ─
          const refineDuration = (realDurationMs: number) => {
            if (!realDurationMs) return;
            const words = block.text.trim().split(/\s+/);
            const now = Date.now();
            // Upgrade SFX timers with real audio duration
            sfxTimers.forEach((entry) => {
              if (entry.fired) return;
              clearTimeout(entry.timer);
              const cue = block.sfxCues![entry.cueIdx];
              if (!cue) return;
              const offset = cue.wordIndex != null
                ? Math.round((cue.wordIndex / words.length) * realDurationMs) + (cue.wordOffsetMs ?? 0)
                : (cue.offsetMs ?? 0);
              entry.timer = setTimeout(() => {
                entry.fired = true;
                if (playingRef.current && sfxPlayerRef.current) {
                  sfxPlayerRef.current.playOnce(entry.buf, useSettingsStore.getState().volumeSfx);
                }
              }, Math.max(0, startedAtMs + offset - now));
            });
          };

          // ── Stage 2b/3: CTC timestamp upgrade (SFX) ──────────────────────────
          void tsToUse.then((timestamps) => {
            if (!playingRef.current || !timestamps?.length) return;
            const now = Date.now();
            // Upgrade SFX timers with CTC word-level timestamps
            sfxTimers.forEach((entry) => {
              if (entry.fired) return;
              clearTimeout(entry.timer);
              const cue = block.sfxCues![entry.cueIdx];
              if (!cue || cue.wordIndex == null) return;
              const ts = timestamps[cue.wordIndex];
              if (!ts) return;
              const offset = ts.start_ms + (cue.wordOffsetMs ?? 0);
              entry.timer = setTimeout(() => {
                entry.fired = true;
                if (playingRef.current && sfxPlayerRef.current) {
                  sfxPlayerRef.current.playOnce(entry.buf, useSettingsStore.getState().volumeSfx);
                }
              }, Math.max(0, startedAtMs + offset - now));
            });
          });

          return refineDuration;
        };

        // Auto-scroll after DOM update
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
          });
        });

        // Resolve character
        const charId = block.characterId || node.character || 'narrator';
        const character = story.characters.find((c) => c.id === charId) ?? NARRATOR_FALLBACK;

        // Resolve EL delivery once — used for both cache key and fetch body
        const resolvedDelivery = (character.ttsProvider === 'elevenlabs' && character.elevenLabsVoiceId)
          ? (block.elevenLabsStability != null || block.elevenLabsSimilarity != null || block.elevenLabsStyle != null)
            ? { stability: block.elevenLabsStability ?? character.elevenLabsStability,
                similarity: block.elevenLabsSimilarity ?? character.elevenLabsSimilarity,
                style: block.elevenLabsStyle ?? character.elevenLabsStyle }
            : (block.emotion || block.tone || block.voiceTexture)
              ? mapQwenToEL(block.emotion, block.tone, block.voiceTexture)
              : { stability: character.elevenLabsStability, similarity: character.elevenLabsSimilarity, style: character.elevenLabsStyle }
          : null;

        const elCacheKey = (resolvedDelivery && character.elevenLabsVoiceId)
          ? makeElCacheKey(block.text, character.elevenLabsVoiceId, resolvedDelivery.stability, resolvedDelivery.similarity, resolvedDelivery.style)
          : null;

        // ── EL in-memory cache (fast, reliable same-session) ──────────────────
        if (elCacheKey && EL_AUDIO_CACHE.has(elCacheKey) && playingRef.current) {
          const cachedBuf = EL_AUDIO_CACHE.get(elCacheKey)!;
          const cachedUrl = URL.createObjectURL(new Blob([cachedBuf], { type: 'audio/mpeg' }));
          await new Promise<void>((resolve) => {
            const audio = new Audio(cachedUrl);
            audio.volume = useSettingsStore.getState().volumeVoice;
            const cleanup = () => { URL.revokeObjectURL(cachedUrl); resolve(); };
            const check = setInterval(() => {
              if (!playingRef.current || skipBlockRef.current) { audio.pause(); clearInterval(check); cleanup(); }
            }, 100);
            let _dur: number | undefined;
            audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) _dur = audio.duration; }, { once: true });
            audio.addEventListener('play', () => scheduleFromStart(Date.now(), undefined, _dur ?? (isFinite(audio.duration) ? audio.duration : undefined)));
            audio.onended = () => { clearInterval(check); cleanup(); };
            audio.onerror = () => { clearInterval(check); cleanup(); };
            audio.play().catch(cleanup);
          });
          if (!playingRef.current) break;
          continue;
        }

        // ── IDB / pre-rendered TTS (cross-session cache) ───────────────────
        if (block.ttsAudioFile && playingRef.current) {
          const hashOk = !block.ttsAudioHash || block.ttsAudioHash === elCacheKey;
          if (hashOk) {
            try {
              const buf = await readAudioFileServer(story.id, block.ttsAudioFile);
              if (!buf) throw new Error('Audio file not found on server');
              if (playingRef.current) {
                // Warm the in-memory cache so next replay is instant
                if (elCacheKey) EL_AUDIO_CACHE.set(elCacheKey, buf);
                const mimeType = block.ttsAudioFile.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
                const audioUrl = URL.createObjectURL(new Blob([buf], { type: mimeType }));
                await new Promise<void>((resolve) => {
                  const audio = new Audio(audioUrl);
                  audio.volume = useSettingsStore.getState().volumeVoice;
                  const cleanup = () => { URL.revokeObjectURL(audioUrl); resolve(); };
                  const check = setInterval(() => {
                    if (!playingRef.current || skipBlockRef.current) { audio.pause(); clearInterval(check); cleanup(); }
                  }, 100);
                  let _dur: number | undefined;
            audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) _dur = audio.duration; }, { once: true });
            audio.addEventListener('play', () => scheduleFromStart(Date.now(), undefined, _dur ?? (isFinite(audio.duration) ? audio.duration : undefined)));
                  audio.onended = () => { clearInterval(check); cleanup(); };
                  audio.onerror = () => { clearInterval(check); cleanup(); };
                  audio.play().catch(cleanup);
                });
                if (!playingRef.current) break;
                continue;
              }
            } catch {
              // IDB miss — fall through to live TTS
            }
          }
          // hash mismatch — fall through to regenerate
        }

        // ── Live ElevenLabs TTS ────────────────────────────────────────────
        if (character.ttsProvider === 'elevenlabs' && character.elevenLabsVoiceId && playingRef.current) {
          try {
            const delivery = resolvedDelivery!;
            const res = await fetch('/api/tts/elevenlabs', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                text: block.text,
                voiceId: character.elevenLabsVoiceId,
                elevenLabsKey,
                ...delivery,
                withTimestamps: useSettingsStore.getState().wordTimestamps,
              }),
            });
            if (res.ok) {
              const elJson = await res.json() as { audioBase64: string; timestamps: WordTimestamp[] };
              const binStr = atob(elJson.audioBase64);
              const bytes = new Uint8Array(binStr.length);
              for (let b = 0; b < binStr.length; b++) bytes[b] = binStr.charCodeAt(b);
              const arrayBuf = bytes.buffer;
              const liveTs = Promise.resolve<WordTimestamp[] | null>(elJson.timestamps ?? null);
              // Populate in-memory cache immediately — makes same-session replays instant
              if (elCacheKey) EL_AUDIO_CACHE.set(elCacheKey, arrayBuf);
              // Best-effort IDB persist + block hash update + timestamps (cross-session cache)
              if (elCacheKey) {
                const filename = makeTTSFilename(nodeId, block.id, character.name);
                saveAudioFileServer(story.id, filename, arrayBuf)
                  .then(async () => {
                    updateBlock(nodeId, block.id, { ttsAudioFile: filename, ttsAudioHash: elCacheKey });
                    if (elJson.timestamps?.length) {
                      await saveTimestampsServer(story.id, filename, elJson.timestamps);
                    }
                  })
                  .catch((err) => console.warn('[PlayMode] EL IDB cache save failed:', err));
              }
              const url = URL.createObjectURL(new Blob([arrayBuf], { type: 'audio/mpeg' }));
              await new Promise<void>((resolve) => {
                const audio = new Audio(url);
                audio.volume = useSettingsStore.getState().volumeVoice;
                const cleanup = () => { URL.revokeObjectURL(url); resolve(); };
                const check = setInterval(() => {
                  if (!playingRef.current || skipBlockRef.current) { audio.pause(); clearInterval(check); cleanup(); }
                }, 100);
                let _dur: number | undefined;
                audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) _dur = audio.duration; }, { once: true });
                audio.addEventListener('play', () => scheduleFromStart(Date.now(), liveTs, _dur ?? (isFinite(audio.duration) ? audio.duration : undefined)));
                audio.onended = () => { clearInterval(check); cleanup(); };
                audio.onerror = () => { clearInterval(check); cleanup(); };
                audio.play().catch(cleanup);
              });
              if (!playingRef.current) break;
              continue;
            }
          } catch {
            // Fall through to Qwen
          }
        }

        // ── Live Qwen TTS ──────────────────────────────────────────────────────
        // Always try streaming first — near-instant audio start regardless of
        // wordTimestamps setting. Estimated fallback handles word highlights.
        // Full synthesis fallback only runs if streaming fails.
        let qwenPlayed = false;

        if (playerRef.current) {
          // ── Streaming path (fast, always preferred) ───────────────────────
          try {
            const player = playerRef.current;
            if (player.stopped) player.reset();
            player.volume = useSettingsStore.getState().volumeVoice;

            // If word timestamps are on, collect streaming chunks and run CTC
            // alignment concurrently while audio plays. The resulting promise
            // is passed to scheduleFromStart — past words clamp to 0 (catch-up),
            // future words schedule correctly once the promise resolves.
            let ctcResolve!: (ts: WordTimestamp[] | null) => void;
            const useTs = useSettingsStore.getState().wordTimestamps;
            const ctcPromise: Promise<WordTimestamp[] | null> = useTs
              ? new Promise((res) => { ctcResolve = res; })
              : Promise.resolve(null);

            // refineDuration is returned by scheduleFromStart and called in
            // onAllChunks once we know the real WAV length — bridges the gap
            // between the initial word-count estimate and CTC precision.
            let refineDuration: ((ms: number) => void) | null = null;

            if (useTs) {
              player.onAllChunks = (chunks) => {
                const wav = assembleWavChunks(chunks);

                // Stage 2a: refine estimated timers with real audio duration
                const actualMs = getWavDurationMs(wav);
                if (actualMs > 0 && refineDuration) refineDuration(actualMs);

                // Stage 3: CTC for per-word precision
                const bytes = new Uint8Array(wav);
                let bin = '';
                for (let b = 0; b < bytes.length; b++) bin += String.fromCharCode(bytes[b]);
                const audioB64 = btoa(bin);
                fetch('/api/qwen/timestamps', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    audioB64,
                    text:   block.text,
                    engine: useSettingsStore.getState().timestampEngine ?? 'ctc',
                  }),
                }).then((r) => (r.ok ? (r.json() as Promise<WordTimestamp[]>) : null))
                  .catch(() => null)
                  .then((ts) => {
                    ctcResolve(ts);
                    // Cache to IDB — makes next play instant with real word sync
                    if (ts?.length) {
                      saveTimestampsServer(story.id, streamTsKey, ts).catch(() => {});
                    }
                  });
              };
            }

            // Only pass ctcPromise when timestamps are enabled — otherwise pass
            // undefined so scheduleFromStart falls back to IDB tsPromise.
            player.onFirstAudio = (startedAtMs) => {
              refineDuration = scheduleFromStart(startedAtMs, useTs ? ctcPromise : undefined);
            };
            const ok = await player.playLine(block.text, character, {
              emotion: block.emotion,
              tone: block.tone,
              voiceTexture: block.voiceTexture,
              temperature: qwenTemperature ?? 0.7,
            });
            // Guarantee ctcPromise resolves even if stream was aborted before
            // onAllChunks fired — prevents scheduleFromStart Promise.all from hanging.
            if (useTs) ctcResolve(null);
            if (ok) qwenPlayed = true;
          } catch { /* fall through */ }
        }

        if (!qwenPlayed && playingRef.current && !skipBlockRef.current) {
          // ── Full synthesis path (for word timestamps + SFX scheduling) ────
          try {
            const qEmotion = block.emotion || character.defaultEmotion;
            const qTone = block.tone || character.defaultTone;
            const qVoiceTexture = block.voiceTexture || character.defaultVoiceTexture;
            let qTags = '';
            if (qEmotion) qTags += `[Emotional: ${qEmotion}] `;
            if (qTone) qTags += `[Tone: ${qTone}] `;
            if (qVoiceTexture) qTags += `[Voice: ${qVoiceTexture}] `;
            const qInstruct = (character.qwenInstruct ?? '') + (qTags ? ' ' + qTags.trim() : '');

            const qwenRes = await fetch('/api/qwen/speak', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                text: block.text,
                instruct: qInstruct,
                seed: charSeed(character.id),
                temperature: qwenTemperature ?? 0.7,
                max_tokens: 2000,
              }),
            });

            if (qwenRes.ok && playingRef.current) {
              const wavBuf = await qwenRes.arrayBuffer();
              if (playingRef.current) {
                // Start timestamps fetch concurrently — do NOT await before playing.
                // scheduleFromStart handles late-resolving promises: delays are computed
                // as (startedAtMs + ts.start_ms - Date.now()), so past words clamp to 0
                // and future words schedule correctly even if timestamps arrive mid-play.
                const liveTs: Promise<WordTimestamp[] | null> = useSettingsStore.getState().wordTimestamps
                  ? (() => {
                      const bytes = new Uint8Array(wavBuf);
                      let bin = '';
                      for (let b = 0; b < bytes.length; b++) bin += String.fromCharCode(bytes[b]);
                      const audioB64 = btoa(bin);
                      return fetch('/api/qwen/timestamps', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          audioB64,
                          text:   block.text,
                          engine: useSettingsStore.getState().timestampEngine ?? 'ctc',
                        }),
                      }).then((r) => (r.ok ? (r.json() as Promise<WordTimestamp[]>) : null)).catch(() => null);
                    })()
                  : Promise.resolve(null);
                const qwenUrl = URL.createObjectURL(new Blob([wavBuf], { type: 'audio/wav' }));
                await new Promise<void>((resolve) => {
                  const audio = new Audio(qwenUrl);
                  audio.volume = useSettingsStore.getState().volumeVoice;
                  const cleanup = () => { URL.revokeObjectURL(qwenUrl); resolve(); };
                  const check = setInterval(() => {
                    if (!playingRef.current || skipBlockRef.current) { audio.pause(); clearInterval(check); cleanup(); }
                  }, 100);
                  let _dur: number | undefined;
                audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) _dur = audio.duration; }, { once: true });
                audio.addEventListener('play', () => scheduleFromStart(Date.now(), liveTs, _dur ?? (isFinite(audio.duration) ? audio.duration : undefined)));
                  audio.onended = () => { clearInterval(check); cleanup(); };
                  audio.onerror = () => { clearInterval(check); cleanup(); };
                  audio.play().catch(cleanup);
                });
                qwenPlayed = true;
              }
            }
          } catch { /* fall through to reading-delay fallback */ }
        }

        if (!qwenPlayed && !skipBlockRef.current) {
          if (!playingRef.current) break;
          // TTS unavailable — fall back to timed reading; still schedule word highlights
          // so bolding steps through the text at reading pace even with no audio.
          setTtsAvailable(false);
          const readMs = readingDelay(block.text);
          scheduleFromStart(Date.now(), undefined, readMs / 1000);
          await new Promise((r) => setTimeout(r, readMs));
        }
        if (!playingRef.current) break;
      }

      if (!playingRef.current) return;

      setActiveBlockId(null);

      // Check for dice-combat interaction
      if (node.type === 'combat' && node.interactionType === 'dice-combat' && node.combatEnemy) {
        const enemy = storyRef.current.enemies[node.combatEnemy];
        if (enemy) {
          setActiveCombat({ enemy, node, enemyHp: enemy.hp });
          setCombatLog([]);
          setDiceDisplay(null);
          setPhase('combat');
          return;
        }
      }

      // Check what comes next
      const validChoices = node.choices.filter((c) => c.next);
      if (node.type === 'end' || validChoices.length === 0) {
        setPhase('ended');
      } else if (validChoices.length === 1) {
        // Single path — auto-advance after a brief pause
        await new Promise((r) => setTimeout(r, 800));
        if (!playingRef.current) return;
        setCurrentNodeId(validChoices[0].next!);
      } else {
        setPhase('choosing');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Trigger playback when node changes
  useEffect(() => {
    if (currentNodeId) {
      playNode(currentNodeId);
    }
  }, [currentNodeId, playNode]);

  // Handle choice selection
  const handleChoice = useCallback(
    (choice: NWVChoice) => {
      if (!choice.next) return;
      playerRef.current?.stop();
      playingRef.current = false;
      addChosenChoice(choice.id);

      // Show consequence text if present
      if (choice.consequence) {
        setConsequenceText(choice.consequence);
        setPhase('transition');
        setTimeout(() => {
          setConsequenceText(null);
          setCurrentNodeId(choice.next!);
        }, 3000);
      } else {
        setCurrentNodeId(choice.next);
      }
    },
    [addChosenChoice],
  );

  // ── Combat handlers ──────────────────────────────────────────────────────────

  const handleCombatRoll = useCallback(() => {
    if (!activeCombat || diceRolling) return;
    setDiceRolling(true);

    // Animate dice for 700ms then settle
    let ticks = 0;
    const interval = setInterval(() => {
      setDiceDisplay({
        player: DICE_FACES[Math.floor(Math.random() * 6)],
        enemy: DICE_FACES[Math.floor(Math.random() * 6)],
      });
      ticks++;
      if (ticks >= 7) {
        clearInterval(interval);
        const playerRoll = rollD6();
        const enemyRoll = rollD6();
        setDiceDisplay({
          player: DICE_FACES[playerRoll - 1],
          enemy: DICE_FACES[enemyRoll - 1],
        });

        let newEnemyHp = activeCombat.enemyHp;
        let newPlayerHp = playerHp;
        let logLine = '';

        if (playerRoll > enemyRoll) {
          const dmg = playerRoll * 4;
          newEnemyHp = Math.max(0, newEnemyHp - dmg);
          logLine = `You rolled ${playerRoll} vs ${enemyRoll} — HIT! ${activeCombat.enemy.name} takes ${dmg} damage.`;
        } else if (enemyRoll > playerRoll) {
          const dmg = randInt(activeCombat.enemy.damage[0], activeCombat.enemy.damage[1]);
          newPlayerHp = Math.max(0, newPlayerHp - dmg);
          setPlayerHurt(true);
          setHurtKey((k) => k + 1);
          setTimeout(() => setPlayerHurt(false), 500);
          const taunt = activeCombat.enemy.taunts.length > 0
            ? ` "${activeCombat.enemy.taunts[Math.floor(Math.random() * activeCombat.enemy.taunts.length)]}"`
            : '';
          logLine = `You rolled ${playerRoll} vs ${enemyRoll} — MISS! You take ${dmg} damage.${taunt}`;
        } else {
          logLine = `You rolled ${playerRoll} vs ${enemyRoll} — TIE! No damage.`;
        }

        setActiveCombat((prev) => prev ? { ...prev, enemyHp: newEnemyHp } : null);
        setPlayerHp(newPlayerHp);
        setCombatLog((prev) => [...prev.slice(-4), logLine]);
        setDiceRolling(false);

        // Check outcomes
        if (newEnemyHp <= 0) {
          const next = activeCombat.node.choices?.find((c) => c.combatOutcome === 'victory')?.next;
          setTimeout(() => {
            setActiveCombat(null);
            if (next) { setCurrentNodeId(next); } else { setPhase('ended'); }
          }, 1200);
        } else if (newPlayerHp <= 0) {
          const next = activeCombat.node.choices?.find((c) => c.combatOutcome === 'defeat')?.next;
          setTimeout(() => {
            setActiveCombat(null);
            setPlayerHp(playerMaxHp);
            if (next) { setCurrentNodeId(next); } else { setPhase('ended'); }
          }, 1200);
        }
      }
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCombat, diceRolling, playerHp]);

  const handleCombatEscape = useCallback(() => {
    if (!activeCombat) return;
    const next = activeCombat.node.choices?.find((c) => c.combatOutcome === 'escape')?.next;
    setActiveCombat(null);
    if (next) { setCurrentNodeId(next); } else { setPhase('choosing'); }
  }, [activeCombat]);

  // Skip: skip the current block's audio only — playNode loop continues to the next block
  const handleSkip = useCallback(() => {
    playerRef.current?.stop();
    sfxPlayerRef.current?.stop();
    skipBlockRef.current = true;
  }, []);

  // Exit handler
  const handleExit = useCallback(() => {
    playerRef.current?.stop();
    ambientPlayerRef.current?.stop();
    musicPlayerRef.current?.stop();
    sfxPlayerRef.current?.stop();
    playingRef.current = false;
    setPlayingNodeId(null);
    onExit();
  }, [onExit, setPlayingNodeId]);

  // Escape to exit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleExit]);

  const currentNode = currentNodeId
    ? story.nodes.find((n) => n.id === currentNodeId)
    : null;

  // Sync current node to store (drives canvas pulse + path history)
  useEffect(() => {
    if (!currentNodeId) return;
    setPlayingNodeId(currentNodeId);
    addVisitedNode(currentNodeId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNodeId]);


  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-slate-100">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-3">
          <svg
            className="text-violet-400"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          <span className="text-sm font-medium text-slate-300">
            {story.metadata.title}
          </span>
          {!ttsAvailable && (
            <span className="rounded bg-amber-900/40 px-2 py-0.5 text-[10px] text-amber-400">
              No TTS — reading mode
            </span>
          )}
        </div>
        <button
          onClick={handleExit}
          className="rounded px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          Exit
        </button>
      </div>

      {/* Main content area — click dark margins to exit */}
      <div ref={pmContentRef} className="relative flex flex-1 flex-col items-center overflow-hidden" onClick={handleExit}>
        {/* VFX overlay layers */}
        <div ref={pmTintRef} className="pointer-events-none absolute inset-0 z-20" style={{ display: 'none' }} />
        <div ref={pmVignetteRef} className="pointer-events-none absolute inset-0 z-20" style={{ display: 'none' }} />
        <canvas ref={beamCanvasRef} className="pointer-events-none absolute inset-0 z-20" style={{ mixBlendMode: 'screen' }} />
        {/* Consequence transition screen */}
        {phase === 'transition' && consequenceText && (
          <div className="flex flex-1 items-center justify-center px-6" onClick={(e) => e.stopPropagation()}>
            <p
              className="max-w-lg text-center text-lg italic leading-relaxed text-slate-300"
              style={{ animation: 'playFadeIn 0.8s ease-out' }}
            >
              {consequenceText}
            </p>
          </div>
        )}

        {/* Combat screen */}
        {phase === 'combat' && activeCombat && (
          <div className="flex flex-1 flex-col items-center justify-center px-6 w-full max-w-xl mx-auto"
            style={{ animation: 'playFadeIn 0.4s ease-out' }} onClick={(e) => e.stopPropagation()}>
          <div key={hurtKey} className="w-full flex flex-col items-center"
            style={playerHurt ? { animation: 'playShake 0.45s ease-out' } : undefined}>

            {/* Enemy */}
            <div className="w-full rounded-lg border border-red-800/50 bg-slate-900 p-4 mb-3">
              <div className="flex items-start justify-between mb-2">
                <span className="text-lg font-bold text-red-300">{activeCombat.enemy.name}</span>
                <span className="text-sm text-slate-400">HP {activeCombat.enemyHp} / {activeCombat.enemy.hp}</span>
              </div>
              {/* Enemy HP bar */}
              <div className="h-2 w-full rounded-full bg-slate-700 mb-3">
                <div
                  className="h-2 rounded-full bg-red-500 transition-all duration-500"
                  style={{ width: `${Math.max(0, (activeCombat.enemyHp / activeCombat.enemy.hp) * 100)}%` }}
                />
              </div>
              {activeCombat.enemy.art && (
                <pre className="text-center font-mono text-xs text-slate-300 leading-tight whitespace-pre">
                  {activeCombat.enemy.art}
                </pre>
              )}
            </div>

            {/* Dice display */}
            {diceDisplay && (
              <div className="flex items-center gap-6 mb-3">
                <div className="text-center">
                  <div style={{ fontSize: '11.25rem', lineHeight: 1 }}>{diceDisplay.player}</div>
                  <div className="text-[10px] text-slate-500 mt-1">YOU</div>
                </div>
                <div className="text-slate-600 text-lg">vs</div>
                <div className="text-center">
                  <div style={{ fontSize: '11.25rem', lineHeight: 1 }}>{diceDisplay.enemy}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{activeCombat.enemy.name.toUpperCase()}</div>
                </div>
              </div>
            )}

            {/* Combat log */}
            {combatLog.length > 0 && (
              <div className="w-full rounded border border-slate-800 bg-slate-900/60 px-3 py-2 mb-3 space-y-1">
                {combatLog.slice(-3).map((line, i) => (
                  <p key={i} className="text-xs text-slate-400">{line}</p>
                ))}
              </div>
            )}

            {/* Player HP */}
            <div className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-300">You</span>
                <span className="text-sm text-slate-400">HP {playerHp} / {playerMaxHp}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-700">
                <div
                  className="h-2 rounded-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${Math.max(0, (playerHp / playerMaxHp) * 100)}%` }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleCombatRoll}
                disabled={diceRolling}
                className="rounded-lg border border-red-600/60 bg-red-600/20 px-6 py-3 text-sm font-semibold text-red-300 transition-colors hover:bg-red-600/30 disabled:opacity-50"
              >
                {diceRolling ? '🎲 Rolling…' : '🎲 Roll Dice'}
              </button>
              {activeCombat.node.choices?.some((c) => c.combatOutcome === 'escape') && (
                <button
                  onClick={handleCombatEscape}
                  disabled={diceRolling}
                  className="rounded-lg border border-slate-600/60 bg-slate-800 px-4 py-3 text-sm text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
                >
                  Escape ↗
                </button>
              )}
            </div>
          </div>
          </div>
        )}

        {/* Normal play content */}
        {phase !== 'transition' && phase !== 'combat' && (
          <>
            {/* Scene header */}
            {currentNode && (
              <div
                className="w-full max-w-2xl px-6 pb-4 pt-8 text-center"
                style={{ animation: 'playFadeIn 0.6s ease-out' }}
                onClick={(e) => e.stopPropagation()}
              >
                {currentNode.location && (
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-slate-500">
                    {currentNode.location}
                  </p>
                )}
                {currentNode.title && (
                  <h2 className="text-xl font-semibold text-slate-200">
                    {currentNode.title}
                  </h2>
                )}
              </div>
            )}

            {/* Scrollable blocks + choices */}
            <div
              ref={scrollRef}
              className="w-full max-w-2xl flex-1 overflow-y-auto px-6 pb-12"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-5">
                {visibleBlocks.map((block) => {
                  const isActive = activeBlockId === block.id;
                  const charId =
                    block.characterId || currentNode?.character || 'narrator';
                  const character = story.characters.find(
                    (c) => c.id === charId,
                  );
                  const isDialogue = block.type === 'line';

                  return (
                    <div
                      key={block.id}
                      data-active-block={isActive ? 'true' : undefined}
                      className="transition-opacity duration-700"
                      style={{
                        opacity: isActive ? 1 : 0.65,
                        animation: 'playFadeIn 0.5s ease-out',
                      }}
                    >
                      {isDialogue && character && (
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-400">
                          {character.name}
                        </p>
                      )}
                      <p
                        className={`leading-relaxed ${
                          isDialogue
                            ? 'border-l-2 border-violet-500/30 pl-4 italic text-slate-100'
                            : 'text-slate-300'
                        }`}
                      >
                        {block.text}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Choices */}
              {phase === 'choosing' && currentNode && (
                <div
                  className="mt-10 space-y-3"
                  style={{ animation: 'playFadeIn 0.6s ease-out' }}
                >
                  <p className="mb-4 text-center text-[11px] font-medium uppercase tracking-widest text-slate-500">
                    What do you do?
                  </p>
                  {currentNode.choices
                    .filter((c) => c.next)
                    .map((choice) => {
                      return (
                        <button
                          key={choice.id}
                          onClick={(e) => { e.stopPropagation(); handleChoice(choice); }}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-5 py-3.5 text-left transition-colors duration-300 hover:border-violet-500/60 hover:bg-slate-800"
                        >
                          <span className="text-sm text-slate-200">
                            {choice.label || 'Continue\u2026'}
                          </span>
                          {choice.flavour && (
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {choice.flavour}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}

              {/* End screen */}
              {phase === 'ended' && (
                <div
                  className="mt-16 text-center"
                  style={{ animation: 'playFadeIn 0.8s ease-out' }}
                >
                  <div className="mb-6 flex justify-center">
                    <div className="h-px w-16 bg-slate-700" />
                  </div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-slate-500">
                    The End
                  </p>
                  <h3 className="mb-8 text-lg font-semibold text-slate-300">
                    {currentNode?.title || 'Story Complete'}
                  </h3>
                  <button
                    onClick={handleExit}
                    className="rounded-lg border border-violet-600/50 bg-violet-600/10 px-6 py-2.5 text-sm text-violet-300 transition-colors hover:bg-violet-600/20"
                  >
                    Return to Editor
                  </button>
                </div>
              )}

              {/* Error */}
              {phase === 'error' && (
                <div className="mt-16 text-center">
                  <p className="mb-4 text-red-400">{errorMsg}</p>
                  <button
                    onClick={handleExit}
                    className="text-sm text-slate-400 hover:text-white"
                  >
                    Return to Editor
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bottom bar — skip control during playback */}
      {phase === 'playing' && (
        <div className="flex items-center justify-center gap-3 border-t border-slate-800 px-6 py-2.5">
          <div className="flex gap-1">
            <span
              className="inline-block h-2.5 w-0.5 rounded-full bg-violet-500"
              style={{ animation: 'playPulse 1s ease-in-out infinite' }}
            />
            <span
              className="inline-block h-2.5 w-0.5 rounded-full bg-violet-500"
              style={{ animation: 'playPulse 1s ease-in-out 0.15s infinite' }}
            />
            <span
              className="inline-block h-2.5 w-0.5 rounded-full bg-violet-500"
              style={{ animation: 'playPulse 1s ease-in-out 0.3s infinite' }}
            />
          </div>
          <span className="text-xs text-slate-500">Playing</span>
          <button
            onClick={handleSkip}
            className="ml-1 rounded px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Skip &raquo;
          </button>
        </div>
      )}

      {/* Inline keyframes */}
      <style>{`
        @keyframes playFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes playPulse {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 1; }
        }
@keyframes playShake {
          0%   { transform: translateX(0); }
          15%  { transform: translateX(-10px); }
          30%  { transform: translateX(10px); }
          45%  { transform: translateX(-8px); }
          60%  { transform: translateX(8px); }
          75%  { transform: translateX(-4px); }
          90%  { transform: translateX(4px); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
