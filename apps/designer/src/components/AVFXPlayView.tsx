'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { NWVStory, NWVChoice } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { TTSPlayer } from '@/lib/tts-player';
import { computeVFXState, applyVFXToDOM } from '@/lib/vfx-engine';

function estimateBlockMs(text: string): number {
  return Math.max(800, text.trim().split(/\s+/).filter(Boolean).length * 400);
}

async function playElBlock(
  text: string,
  voiceId: string,
  apiKey: string,
  player: TTSPlayer,
  elAudioRef: React.MutableRefObject<HTMLAudioElement | null>
): Promise<boolean> {
  try {
    const res = await fetch('/api/tts/elevenlabs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, voiceId, elevenLabsKey: apiKey }),
    });
    if (!res.ok || player.stopped) return !player.stopped;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      elAudioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); resolve(!player.stopped); };
      audio.onerror = () => resolve(false);
      audio.play().catch(() => resolve(false));
    });
  } catch { return false; }
}

interface AVFXPlayViewProps {
  story: NWVStory;
}

/**
 * Compact story reader for the top pane of AV FX mode.
 * Shows the node selected in the AV FX panel. Plays TTS on demand.
 * VFX keyframes on the node are rendered in real-time via RAF loop.
 */
export function AVFXPlayView({ story }: AVFXPlayViewProps) {
  const avfxNodeId = useStoryStore((s) => s.avfxNodeId);
  const setAVFXNodeId = useStoryStore((s) => s.setAVFXNodeId);
  const setPlayingNodeId = useStoryStore((s) => s.setPlayingNodeId);
  const addVisitedNode = useStoryStore((s) => s.addVisitedNode);
  const addChosenChoice = useStoryStore((s) => s.addChosenChoice);
  const clearPlayHistory = useStoryStore((s) => s.clearPlayHistory);
  const setAvfxPlayheadMs = useStoryStore((s) => s.setAvfxPlayheadMs);
  const avfxPlayheadMs = useStoryStore((s) => s.avfxPlayheadMs);
  const avfxBlockDurationsMs = useStoryStore((s) => s.avfxBlockDurationsMs);
  const elevenLabsKey = useSettingsStore((s) => s.elevenLabsKey);

  const [phase, setPhase] = useState<'idle' | 'playing' | 'choosing' | 'ended'>('idle');
  const [progress, setProgress] = useState('');
  const [activeBlockIdx, setActiveBlockIdx] = useState(-1);

  const playerRef = useRef<TTSPlayer | null>(null);
  const elAudioRef = useRef<HTMLAudioElement | null>(null);
  const playingForNodeRef = useRef<string | null>(null);
  const blockStartTimeRef = useRef<number>(0);
  const blockBaseMsRef = useRef<number>(0);

  // VFX rendering refs
  const vfxContentRef = useRef<HTMLDivElement | null>(null);
  const vfxTintRef = useRef<HTMLDivElement | null>(null);
  const vfxVignetteRef = useRef<HTMLDivElement | null>(null);
  const avfxPlayheadMsRef = useRef<number>(0);
  const storyRef = useRef(story);

  // Mirror story + playhead into refs so RAF reads latest without stale closure
  useEffect(() => { storyRef.current = story; }, [story]);
  useEffect(() => { avfxPlayheadMsRef.current = avfxPlayheadMs; }, [avfxPlayheadMs]);

  const node = story.nodes.find((n) => n.id === avfxNodeId) ?? null;
  const blocks = (node?.blocks ?? []).filter((b) => b.text?.trim());
  const choices = (node?.choices ?? []).filter((c) => c.next);

  // VFX RAF loop — runs whenever a node is loaded
  useEffect(() => {
    let rafId: number;
    const nodeId = avfxNodeId;
    function tick() {
      const currentNode = storyRef.current.nodes.find((n) => n.id === nodeId) ?? null;
      const kf = currentNode?.vfxKeyframes ?? [];
      const state = computeVFXState(kf, avfxPlayheadMsRef.current);
      applyVFXToDOM(
        vfxContentRef.current,
        vfxTintRef.current,
        vfxVignetteRef.current,
        state,
      );
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avfxNodeId]);

  const stopAll = useCallback(() => {
    playerRef.current?.dispose();
    playerRef.current = null;
    if (elAudioRef.current) { elAudioRef.current.pause(); elAudioRef.current = null; }
    setPlayingNodeId(null);
  }, [setPlayingNodeId]);

  const handlePlay = useCallback(() => {
    if (!node || phase === 'playing') return;
    const player = new TTSPlayer();
    playerRef.current = player;
    playingForNodeRef.current = node.id;
    setPhase('playing');
    setActiveBlockIdx(0);
    addVisitedNode(node.id);
    setPlayingNodeId(node.id);

    const blockDurations = avfxBlockDurationsMs.length === blocks.length
      ? avfxBlockDurationsMs
      : blocks.map((b) => estimateBlockMs(b.text));
    const blockStarts: number[] = [];
    let acc = 0;
    for (const d of blockDurations) { blockStarts.push(acc); acc += d; }

    const intervalId = setInterval(() => {
      setAvfxPlayheadMs(blockBaseMsRef.current + (Date.now() - blockStartTimeRef.current));
    }, 80);

    (async () => {
      for (let i = 0; i < blocks.length; i++) {
        if (player.stopped) { clearInterval(intervalId); setAvfxPlayheadMs(0); return; }
        setProgress(`${i + 1}/${blocks.length}`);
        setActiveBlockIdx(i);
        blockBaseMsRef.current = blockStarts[i];
        blockStartTimeRef.current = Date.now();
        const block = blocks[i];
        const char =
          story.characters.find((c) => c.id === block.characterId) ??
          story.characters.find((c) => c.id === 'narrator');
        if (!char || !block.text) continue;

        let ok: boolean;
        if (char.ttsProvider === 'elevenlabs' && char.elevenLabsVoiceId && elevenLabsKey) {
          ok = await playElBlock(block.text, char.elevenLabsVoiceId, elevenLabsKey, player, elAudioRef);
        } else {
          ok = await player.playLine(block.text, char, {
            emotion: block.emotion,
            tone: block.tone,
            voiceTexture: block.voiceTexture,
          });
        }
        if (!ok) { clearInterval(intervalId); setAvfxPlayheadMs(0); return; }
      }
      clearInterval(intervalId);
      if (player.stopped) { setAvfxPlayheadMs(0); return; }
      setPlayingNodeId(null);
      setActiveBlockIdx(-1);
      setPhase(choices.length > 0 ? 'choosing' : 'ended');
      setAvfxPlayheadMs(0);
    })();
  }, [node, blocks, choices, phase, story.characters, elevenLabsKey, addVisitedNode, setPlayingNodeId, avfxBlockDurationsMs, setAvfxPlayheadMs]);

  const handleStop = useCallback(() => {
    stopAll();
    setAvfxPlayheadMs(0);
    setPhase('idle');
    setActiveBlockIdx(-1);
    clearPlayHistory();
  }, [stopAll, setAvfxPlayheadMs, clearPlayHistory]);

  const handleSkip = useCallback(() => {
    stopAll();
    setActiveBlockIdx(-1);
    setPhase(choices.length > 0 ? 'choosing' : 'ended');
  }, [stopAll, choices]);

  const handleChoice = useCallback((choice: NWVChoice) => {
    addChosenChoice(choice.id);
    stopAll();
    setPhase('idle');
    setActiveBlockIdx(-1);
    if (choice.next) setAVFXNodeId(choice.next);
  }, [addChosenChoice, stopAll, setAVFXNodeId]);

  useEffect(() => {
    if (avfxNodeId !== playingForNodeRef.current && phase === 'playing') {
      stopAll();
      setPhase('idle');
      setActiveBlockIdx(-1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avfxNodeId]);

  useEffect(() => () => stopAll(), [stopAll]);

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-500">Select a node in the panel below to preview</p>
      </div>
    );
  }

  const isPlaying = phase === 'playing';

  return (
    // Outer container — relative so VFX overlay divs can be absolute
    <div className="relative flex h-full flex-col overflow-hidden bg-slate-950">
      {/* Filterable content layer */}
      <div ref={vfxContentRef} className="flex h-full flex-col text-white">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-2">
          <div className="min-w-0">
            {node.location && (
              <p className="truncate text-[10px] text-slate-500">{node.location}</p>
            )}
            <h2 className="truncate text-sm font-semibold text-white">{node.title || 'Untitled'}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {phase === 'idle' && (
              <button
                onClick={handlePlay}
                disabled={blocks.length === 0}
                className="rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
              >
                ▶ Play
              </button>
            )}
            {isPlaying && (
              <>
                <span className="text-[10px] text-slate-400">Block {progress}</span>
                <button
                  onClick={handleSkip}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800"
                  title="Skip to choices"
                >
                  ⏭
                </button>
                <button
                  onClick={handleStop}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  ■ Stop
                </button>
              </>
            )}
            {(phase === 'choosing' || phase === 'ended') && (
              <>
                <button
                  onClick={handlePlay}
                  disabled={blocks.length === 0}
                  className="rounded bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
                >
                  ▶ Replay
                </button>
                <button
                  onClick={handleStop}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  ↺ Reset
                </button>
              </>
            )}
          </div>
        </div>

        {/* Blocks */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {blocks.length === 0 ? (
            <p className="text-sm text-slate-600 italic">No content blocks</p>
          ) : (
            blocks.map((block, i) => {
              const char =
                story.characters.find((c) => c.id === block.characterId) ??
                story.characters.find((c) => c.id === 'narrator');
              const isProse = block.type === 'prose';
              const isActive = activeBlockIdx === i;

              return (
                <div
                  key={block.id}
                  className={`transition-all duration-300 ${
                    isActive
                      ? 'opacity-100'
                      : isPlaying
                      ? 'opacity-30'
                      : 'opacity-75'
                  }`}
                >
                  {!isProse && char && (
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-violet-400">
                      {char.name}
                    </p>
                  )}
                  <p
                    className={`text-sm leading-relaxed ${
                      isProse ? 'text-slate-400 italic' : 'text-white'
                    }`}
                  >
                    {block.text}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Choices */}
        {phase === 'choosing' && choices.length > 0 && (
          <div className="shrink-0 border-t border-slate-800 px-5 pb-4 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Choose your path
            </p>
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleChoice(c)}
                  className="rounded border border-violet-700/60 bg-violet-900/30 px-4 py-2 text-sm text-violet-300 transition-colors hover:bg-violet-800/50"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === 'ended' && (
          <div className="shrink-0 border-t border-slate-800 px-5 pb-4 pt-3 text-center">
            <p className="text-sm text-slate-500">— Scene ended —</p>
          </div>
        )}
      </div>

      {/* VFX overlay layers — outside the filtered content, z-above everything */}
      <div
        ref={vfxTintRef}
        className="pointer-events-none absolute inset-0 z-20"
        style={{ display: 'none' }}
      />
      <div
        ref={vfxVignetteRef}
        className="pointer-events-none absolute inset-0 z-20"
        style={{ display: 'none' }}
      />
    </div>
  );
}
