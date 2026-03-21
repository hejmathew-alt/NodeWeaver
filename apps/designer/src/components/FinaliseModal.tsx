'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { NWVStory } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { checkPrerequisites, buildBatchItems } from '@/lib/batch-tts';
import type { BatchTTSItem, BatchItemStatus, BatchProvider } from '@/lib/batch-tts';
import { makeTTSFilename, saveAudioFileServer, saveTimestampsServer } from '@/lib/audio-storage';
import type { WordTimestamp } from '@nodeweaver/engine';
import { charSeed } from '@/lib/char-seed';

// ── Constants ────────────────────────────────────────────────────────────────

const THROTTLE_MS = 250;

// ── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status, error }: { status: BatchItemStatus; error: string | null }) {
  if (status === 'done') return <span className="text-emerald-500">✓</span>;
  if (status === 'error') return (
    <span title={error ?? undefined} className="cursor-help text-red-500">✕</span>
  );
  if (status === 'skipped') return <span className="text-slate-300">—</span>;
  if (status === 'generating') return (
    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
  );
  return <span className="inline-block h-2 w-2 rounded-full bg-slate-200" />;
}

// ── Main modal ───────────────────────────────────────────────────────────────

interface FinaliseModalProps {
  story: NWVStory;
  provider: BatchProvider;
  onClose: () => void;
}

type Phase = 'config' | 'running' | 'done';

export function FinaliseModal({ story, provider, onClose }: FinaliseModalProps) {
  const { updateBlock } = useStoryStore();
  const { elevenLabsKey, qwenTemperature, wordTimestamps, timestampEngine } = useSettingsStore();

  const [phase, setPhase] = useState<Phase>('config');
  const [skipExisting, setSkipExisting] = useState(true);
  const [items, setItems] = useState<BatchTTSItem[]>([]);
  const [statuses, setStatuses] = useState<BatchItemStatus[]>([]);
  const [errors, setErrors] = useState<(string | null)[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const abortRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const isEL = provider === 'elevenlabs';
  const prereq = checkPrerequisites(story, elevenLabsKey, false, provider);
  const batchItems = buildBatchItems(story, false, provider);
  const toGenerate = batchItems.filter((it) => !(skipExisting && it.existingFile)).length;
  const toSkip = batchItems.length - toGenerate;

  // ── Stats derived from statuses ──────────────────────────────────────────

  const doneCount = statuses.filter((s) => s === 'done').length;
  const errorCount = statuses.filter((s) => s === 'error').length;
  const skippedCount = statuses.filter((s) => s === 'skipped').length;
  const progress = items.length > 0 ? Math.round(((doneCount + errorCount + skippedCount) / items.length) * 100) : 0;

  // Auto-scroll to current item
  useEffect(() => {
    if (currentIndex >= 0 && listRef.current) {
      const rows = listRef.current.querySelectorAll('[data-row]');
      rows[currentIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentIndex]);

  // ── Batch execution ──────────────────────────────────────────────────────

  const runBatch = useCallback(async (onlyErrors = false) => {
    abortRef.current = false;
    const allItems = buildBatchItems(story, false, provider);

    let batchList: BatchTTSItem[];
    let initialStatuses: BatchItemStatus[];

    if (onlyErrors) {
      batchList = items;
      initialStatuses = statuses.map((s) => (s === 'error' ? 'pending' : s));
    } else {
      batchList = allItems;
      initialStatuses = allItems.map((item) =>
        skipExisting && item.existingFile ? 'skipped' : 'pending',
      );
    }

    setItems(batchList);
    setStatuses([...initialStatuses]);
    setErrors(batchList.map(() => null));
    setCurrentIndex(-1);
    setPhase('running');

    const newStatuses = [...initialStatuses];
    const newErrors: (string | null)[] = batchList.map(() => null);

    for (let i = 0; i < batchList.length; i++) {
      if (abortRef.current) break;
      if (newStatuses[i] === 'skipped') { setCurrentIndex(i); continue; }

      newStatuses[i] = 'generating';
      setStatuses([...newStatuses]);
      setCurrentIndex(i);

      const item = batchList[i];
      const char = story.characters.find((c) => c.id === item.characterId);

      try {
        let audioBuffer: ArrayBuffer;
        let filename: string;

        if (isEL) {
          // ── ElevenLabs path ───────────────────────────────────────────────
          const elBody = {
            text: item.text,
            voiceId: item.voiceId,
            elevenLabsKey,
            stability:      item.elStability  ?? char?.elevenLabsStability,
            similarity:     item.elSimilarity ?? char?.elevenLabsSimilarity,
            style:          item.elStyle      ?? char?.elevenLabsStyle,
            withTimestamps: wordTimestamps,
          };

          let res = await fetch('/api/tts/elevenlabs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(elBody),
          });

          // 429: wait and retry once
          if (res.status === 429) {
            const retryAfter = parseInt(res.headers.get('retry-after') ?? '10', 10);
            await new Promise((r) => setTimeout(r, retryAfter * 1000));
            if (abortRef.current) break;
            res = await fetch('/api/tts/elevenlabs', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(elBody),
            });
          }

          // 401: invalid key — abort
          if (res.status === 401) {
            newErrors[i] = 'Invalid API key — aborting.';
            newStatuses[i] = 'error';
            setStatuses([...newStatuses]);
            setErrors([...newErrors]);
            abortRef.current = true;
            break;
          }

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(errBody.error ?? `HTTP ${res.status}`);
          }

          // withTimestamps=true → JSON response {audioBase64, timestamps}
          const elJson = await res.json() as { audioBase64: string; timestamps: WordTimestamp[] };
          const base64 = elJson.audioBase64;
          // Decode base64 → ArrayBuffer
          const binStr = atob(base64);
          const bytes = new Uint8Array(binStr.length);
          for (let b = 0; b < binStr.length; b++) bytes[b] = binStr.charCodeAt(b);
          audioBuffer = bytes.buffer;
          filename = makeTTSFilename(item.nodeId, item.blockId, item.characterName);

          // Save timestamps (best-effort — don't fail the whole item if this throws)
          if (wordTimestamps && elJson.timestamps?.length) {
            saveTimestampsServer(story.id, filename, elJson.timestamps).catch((err) =>
              console.warn('[FinaliseModal] Failed to save EL timestamps:', err),
            );
          }

        } else {
          // ── Qwen path ─────────────────────────────────────────────────────
          const emotion = char?.defaultEmotion;
          const tone = char?.defaultTone;
          const voiceTexture = char?.defaultVoiceTexture;
          const deliveryParts: string[] = [];
          if (emotion && emotion !== 'neutral') deliveryParts.push(`${emotion} emotion`);
          if (tone) deliveryParts.push(`${tone} delivery`);
          if (voiceTexture) deliveryParts.push(`${voiceTexture} voice quality`);
          const delivery = deliveryParts.length > 0 ? ` Speak with ${deliveryParts.join(', ')}.` : '';
          const instruct = (item.qwenInstruct ?? '') + delivery;

          const res = await fetch('/api/qwen/speak', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              text: item.text,
              instruct,
              seed: charSeed(item.characterId),
              temperature: qwenTemperature ?? 0.6,
              max_tokens: 2000,
            }),
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(errBody.error ?? `HTTP ${res.status}`);
          }

          audioBuffer = await res.arrayBuffer();
          filename = makeTTSFilename(item.nodeId, item.blockId, item.characterName).replace('.mp3', '.wav');

          // Fetch word timestamps via forced alignment (best-effort — don't block on failure)
          if (wordTimestamps) {
            const audioB64 = (() => {
              const bytes = new Uint8Array(audioBuffer);
              let bin = '';
              for (let b = 0; b < bytes.length; b++) bin += String.fromCharCode(bytes[b]);
              return btoa(bin);
            })();
            fetch('/api/qwen/timestamps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioB64, text: item.text, engine: timestampEngine }),
            })
              .then(async (tsRes) => {
                if (tsRes.ok) {
                  const timestamps = await tsRes.json() as WordTimestamp[];
                  if (timestamps.length) {
                    await saveTimestampsServer(story.id, filename, timestamps);
                  }
                }
              })
              .catch((err) => console.warn('[FinaliseModal] Failed to get Qwen timestamps:', err));
          }
        }

        await saveAudioFileServer(story.id, filename, audioBuffer);
        updateBlock(item.nodeId, item.blockId, { ttsAudioFile: filename });
        newStatuses[i] = 'done';

      } catch (err) {
        newStatuses[i] = 'error';
        newErrors[i] = err instanceof Error ? err.message : String(err);
      }

      setStatuses([...newStatuses]);
      setErrors([...newErrors]);

      if (i < batchList.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, THROTTLE_MS));
      }
    }

    setPhase('done');
  }, [story, provider, skipExisting, elevenLabsKey, qwenTemperature, timestampEngine, items, statuses, updateBlock, isEL]);

  // ── Render ───────────────────────────────────────────────────────────────

  const providerLabel = isEL ? 'ElevenLabs' : 'Qwen';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex w-full max-w-xl flex-col rounded-xl bg-white shadow-2xl" style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Finalise for Release</h2>
            <p className="text-xs text-slate-400">Pre-render {providerLabel} TTS for all story blocks</p>
          </div>
          {phase !== 'running' && (
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Prerequisites (ElevenLabs only) */}
          {isEL && (prereq.missingKey || prereq.missingVoices.length > 0) && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs">
              <p className="mb-2 font-semibold text-amber-800">Prerequisites not met:</p>
              {prereq.missingKey && (
                <p className="text-amber-700">• No ElevenLabs API key — add one in Settings.</p>
              )}
              {prereq.missingVoices.map((v) => (
                <p key={v.characterId} className="text-amber-700">
                  • <strong>{v.characterName}</strong> has no ElevenLabs voice ID — set one in the Characters panel.
                </p>
              ))}
            </div>
          )}

          {/* Config phase */}
          {phase === 'config' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                <p className="font-medium text-slate-700">
                  {batchItems.length === 0
                    ? `No blocks found for ${providerLabel}.`
                    : `${batchItems.length} block${batchItems.length !== 1 ? 's' : ''} ready to generate.`}
                </p>
                {batchItems.length > 0 && (
                  <p className="mt-1 text-slate-400">
                    {toGenerate} to generate · {toSkip} skipped (already have TTS)
                  </p>
                )}
              </div>

              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={skipExisting}
                  onChange={(e) => setSkipExisting(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                <span className="text-sm text-slate-700">Skip blocks that already have TTS audio</span>
              </label>
            </div>
          )}

          {/* Progress list (running or done) */}
          {(phase === 'running' || phase === 'done') && (
            <div className="space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    phase === 'done' && errorCount === 0 ? 'bg-emerald-400' :
                    phase === 'done' && errorCount > 0 ? 'bg-amber-400' : 'bg-blue-400'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex gap-4 text-xs text-slate-500">
                <span className="text-emerald-600">✓ {doneCount} done</span>
                {errorCount > 0 && <span className="text-red-500">✕ {errorCount} errors</span>}
                {skippedCount > 0 && <span className="text-slate-400">— {skippedCount} skipped</span>}
                <span className="ml-auto">{progress}%</span>
              </div>

              <div ref={listRef} className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                {items.map((item, i) => (
                  <div
                    key={`${item.nodeId}-${item.blockId}`}
                    data-row={i}
                    className={`flex items-center gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-0 ${
                      i === currentIndex ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex w-4 shrink-0 items-center justify-center">
                      <StatusIcon status={statuses[i] ?? 'pending'} error={errors[i]} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-700">{item.nodeTitle}</span>
                      <span className="text-slate-400"> · block {item.blockIndex + 1}</span>
                      <span className="ml-1 text-slate-400">({item.characterName})</span>
                    </div>
                    {errors[i] && (
                      <span className="shrink-0 max-w-[180px] truncate text-[10px] text-red-400" title={errors[i] ?? undefined}>
                        {errors[i]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3">
          {phase === 'config' && (
            <>
              <button onClick={onClose} className="rounded border border-slate-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => runBatch(false)}
                disabled={prereq.missingKey || prereq.missingVoices.length > 0 || toGenerate === 0}
                className="rounded border border-emerald-400 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Generate {toGenerate > 0 ? `${toGenerate} block${toGenerate !== 1 ? 's' : ''}` : ''}
              </button>
            </>
          )}

          {phase === 'running' && (
            <button
              onClick={() => { abortRef.current = true; }}
              className="rounded border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              Cancel
            </button>
          )}

          {phase === 'done' && (
            <>
              {errorCount > 0 && (
                <button
                  onClick={() => runBatch(true)}
                  className="rounded border border-amber-300 bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  Retry {errorCount} failed
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
