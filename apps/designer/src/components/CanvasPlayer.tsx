'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { NWVStory, NWVChoice } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { TTSPlayer } from '@/lib/tts-player';

interface CanvasPlayerProps {
  story: NWVStory;
}

/**
 * Canvas-native playback HUD. Plays a node's TTS inline without leaving the canvas.
 * Triggered by the ▶ button on any canvas node.
 */
export function CanvasPlayer({ story }: CanvasPlayerProps) {
  const canvasPlayNodeId = useStoryStore((s) => s.canvasPlayNodeId);
  const setCanvasPlayNodeId = useStoryStore((s) => s.setCanvasPlayNodeId);
  const setPlayingNodeId = useStoryStore((s) => s.setPlayingNodeId);
  const addVisitedNode = useStoryStore((s) => s.addVisitedNode);
  const addChosenChoice = useStoryStore((s) => s.addChosenChoice);
  const clearPlayHistory = useStoryStore((s) => s.clearPlayHistory);
  const elevenLabsKey = useSettingsStore((s) => s.elevenLabsKey);

  const [phase, setPhase] = useState<'playing' | 'choosing' | 'ended'>('playing');
  const [progress, setProgress] = useState('');

  const playerRef = useRef<TTSPlayer | null>(null);
  const elAudioRef = useRef<HTMLAudioElement | null>(null);
  const prevNodeIdRef = useRef<string | null>(null);

  // stableNodeIdRef: retains the last non-null canvasPlayNodeId so the HUD doesn't
  // close when unrelated UI interactions (panel opens, toolbar clicks) momentarily
  // clear the store value. Only cleared explicitly by handleStop / handleChoice.
  const stableNodeIdRef = useRef<string | null>(null);
  if (canvasPlayNodeId) stableNodeIdRef.current = canvasPlayNodeId;
  const effectiveId = canvasPlayNodeId ?? stableNodeIdRef.current;

  const node = story.nodes.find((n) => n.id === effectiveId) ?? null;
  const visibleChoices = (node?.choices ?? []).filter((c) => c.next);

  // Stop all audio immediately
  const stopAll = useCallback(() => {
    playerRef.current?.dispose();
    playerRef.current = null;
    if (elAudioRef.current) {
      elAudioRef.current.pause();
      elAudioRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => {
    stableNodeIdRef.current = null;
    stopAll();
    setPlayingNodeId(null);
    setCanvasPlayNodeId(null);
    clearPlayHistory();
  }, [stopAll, setPlayingNodeId, setCanvasPlayNodeId, clearPlayHistory]);

  // Skip to end of current node (show choices / ended screen)
  const handleSkip = useCallback(() => {
    stopAll();
    setPlayingNodeId(null);
    const choices = node?.choices.filter((c) => c.next) ?? [];
    setPhase(choices.length > 0 ? 'choosing' : 'ended');
  }, [stopAll, setPlayingNodeId, node]);

  const handleChoice = useCallback(
    (choice: NWVChoice) => {
      addChosenChoice(choice.id);
      stopAll();
      setPhase('playing');
      if (choice.next) {
        setCanvasPlayNodeId(choice.next);
      } else {
        stableNodeIdRef.current = null;
        setPlayingNodeId(null);
        setCanvasPlayNodeId(null);
        clearPlayHistory();
      }
    },
    [addChosenChoice, stopAll, setCanvasPlayNodeId, setPlayingNodeId, clearPlayHistory],
  );

  // Clear history when starting a brand-new playthrough (null → nodeId)
  useEffect(() => {
    if (canvasPlayNodeId && !prevNodeIdRef.current) {
      clearPlayHistory();
    }
    prevNodeIdRef.current = canvasPlayNodeId;
  }, [canvasPlayNodeId, clearPlayHistory]);

  // If canvasPlayNodeId was cleared externally (toolbar click, panel open, etc.)
  // while we still have a stableNodeIdRef, stop audio gracefully and show choices/ended.
  useEffect(() => {
    if (canvasPlayNodeId === null && stableNodeIdRef.current !== null) {
      stopAll();
      setPlayingNodeId(null);
      const currentNode = story.nodes.find((n) => n.id === stableNodeIdRef.current);
      const choices = currentNode?.choices.filter((c) => c.next) ?? [];
      setPhase(choices.length > 0 ? 'choosing' : 'ended');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPlayNodeId]);

  // Play node when canvasPlayNodeId changes
  useEffect(() => {
    if (!canvasPlayNodeId || !node) return;

    setPhase('playing');
    setPlayingNodeId(canvasPlayNodeId);
    addVisitedNode(canvasPlayNodeId);

    const player = new TTSPlayer();
    playerRef.current = player;
    const textBlocks = (node.blocks ?? []).filter((b) => b.text?.trim());

    (async () => {
      for (let i = 0; i < textBlocks.length; i++) {
        if (player.stopped) return;
        setProgress(`${i + 1} / ${textBlocks.length}`);

        const block = textBlocks[i];
        const char =
          story.characters.find((c) => c.id === block.characterId) ??
          story.characters.find((c) => c.id === 'narrator');
        if (!char || !block.text) continue;

        let ok: boolean;
        if (char.ttsProvider === 'elevenlabs' && char.elVoiceId && elevenLabsKey) {
          ok = await playElBlock(block.text, char.elVoiceId, elevenLabsKey, player, elAudioRef);
        } else {
          ok = await player.playLine(block.text, char, {
            emotion: block.emotion,
            tone: block.tone,
            voiceTexture: block.voiceTexture,
          });
        }
        if (!ok) return;
      }

      if (player.stopped) return;

      // Blocks done — stop the pulse; wasVisited keeps the static glow on the node
      setPlayingNodeId(null);

      const choices = node.choices.filter((c) => c.next);
      if (choices.length === 0) {
        setPhase('ended');
      } else {
        setPhase('choosing');
      }
    })();

    return () => {
      player.dispose();
      if (elAudioRef.current) {
        elAudioRef.current.pause();
        elAudioRef.current = null;
      }
      if (playerRef.current === player) playerRef.current = null;
    };
    // canvasPlayNodeId is the intentional trigger; story/elevenLabsKey changes don't re-play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPlayNodeId]);

  if (!effectiveId) return null;

  const isPlaying = phase === 'playing';

  return (
    <div className="absolute bottom-5 left-1/2 z-40 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur-sm"
      style={{ minWidth: 300, maxWidth: 520 }}>

      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* EQ bars */}
        <span className="flex shrink-0 items-end gap-[3px]" style={{ height: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="w-[3px] rounded-sm bg-violet-400"
              style={{
                height: isPlaying ? 3 : 3,
                animation: isPlaying
                  ? `eqBar 0.5s ease-in-out ${i * 0.11}s infinite alternate`
                  : undefined,
              }}
            />
          ))}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {node?.title || 'Playing…'}
          </p>
          <p className="text-[10px] text-slate-400">
            {isPlaying && progress ? `block ${progress}` : phase === 'choosing' ? 'Choose your path' : 'Scene ended'}
          </p>
        </div>

        {phase === 'playing' && (
          <button
            onClick={handleSkip}
            className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
            title="Skip to choices"
          >
            <svg width="12" height="10" viewBox="0 0 24 20" fill="currentColor">
              <polygon points="0,0 10,10 0,20" />
              <polygon points="10,0 20,10 10,20" />
              <rect x="20" y="0" width="4" height="20" rx="1" />
            </svg>
          </button>
        )}
        <button
          onClick={handleStop}
          className="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          title="Stop"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        </button>
      </div>

      {/* Choices */}
      {phase === 'choosing' && visibleChoices.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-slate-700/60 px-3 pb-3 pt-2">
          {visibleChoices.map((choice) => {
            return (
              <button
                key={choice.id}
                onClick={() => handleChoice(choice)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-2 text-left text-sm text-slate-300 transition-colors hover:border-violet-500/60 hover:bg-slate-700/60 hover:text-white"
              >
                {choice.label || 'Continue…'}
                {choice.flavour && (
                  <span className="mt-0.5 block text-[11px] text-slate-500">{choice.flavour}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {phase === 'ended' && (
        <div className="border-t border-slate-700/60 px-4 py-2">
          <button onClick={handleStop} className="text-xs text-slate-400 hover:text-white transition-colors">
            Close ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ── EL block helper ────────────────────────────────────────────────────────────

async function playElBlock(
  text: string,
  voiceId: string,
  apiKey: string,
  player: TTSPlayer,
  audioRef: React.MutableRefObject<HTMLAudioElement | null>,
): Promise<boolean> {
  if (player.stopped) return false;
  try {
    const res = await fetch('/api/tts/elevenlabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId, elevenLabsKey: apiKey }),
    });
    if (!res.ok || player.stopped) return false;
    const blob = await res.blob();
    if (player.stopped) return false;
    const url = URL.createObjectURL(blob);
    return new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      const done = (ok: boolean) => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        resolve(ok && !player.stopped);
      };
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.play().catch(() => done(false));
    });
  } catch {
    return false;
  }
}
