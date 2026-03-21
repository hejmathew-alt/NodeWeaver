'use client';

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { nanoid } from 'nanoid';
import type { NWVStory, NWVNode, NWVVFXKeyframe, VFXEffectType, NWVBlock } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { SFXPlayer } from '@/lib/sfx-player';
import { readAudioFileServer, saveAudioFileServer, readTimestampsServer } from '@/lib/audio-storage';
import { VFX_PRESETS, PRESET_CATEGORIES } from '@/lib/vfx-presets';

// ── Helpers ──────────────────────────────────────────────────────────────────

function bfsOrder(nodes: NWVNode[]): NWVNode[] {
  const start = nodes.find((n) => n.type === 'start');
  if (!start) return nodes;
  const visited = new Set<string>();
  const queue = [start.id];
  const ordered: NWVNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    ordered.push(node);
    for (const choice of node.choices) {
      if (choice.next && !visited.has(choice.next)) queue.push(choice.next);
    }
  }
  for (const node of nodes) {
    if (!visited.has(node.id)) ordered.push(node);
  }
  return ordered;
}

// Estimate duration in ms for a block based on word count (~150 wpm)
function estimateBlockMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(800, words * 400);
}

const NODE_COLORS: Record<string, string> = {
  start: '#14b8a6',
  story: '#3b82f6',
  combat: '#ef4444',
  chat: '#22c55e',
  twist: '#a855f7',
  end: '#f97316',
};

const VFX_EFFECTS: VFXEffectType[] = [
  'blur', 'brightness', 'vignette', 'tint', 'flicker', 'shake', 'textOpacity', 'saturation', 'contrast',
];

const VFX_DEFAULTS: Record<VFXEffectType, number | string> = {
  blur: 4,
  brightness: 0.7,
  vignette: 0.5,
  tint: '#220000',
  flicker: 0.3,
  shake: 5,
  textOpacity: 0.6,
  saturation: 0.3,
  contrast: 1.4,
};

const SFX_COLORS = [
  '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4', '#f97316',
];

const LABEL_W = 88; // w-20 (80px) + gap-2 (8px) from TrackRow

function snapMs(rawMs: number, candidates: number[], totalMs: number, tlW: number, pxThreshold = 10): number {
  const threshold = (pxThreshold / tlW) * totalMs;
  let best = rawMs;
  let bestDist = threshold;
  for (const s of candidates) {
    const d = Math.abs(s - rawMs);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

function msToBlockWord(
  ms: number,
  blocks: NWVBlock[],
  starts: number[],
  durations: number[],
): { blockId: string; wordIndex: number } {
  let idx = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (ms >= starts[i]) { idx = i; break; }
  }
  const block = blocks[idx];
  const words = block.text.trim().split(/\s+/).filter(Boolean);
  const frac = Math.max(0, Math.min(1, (ms - starts[idx]) / (durations[idx] || 1)));
  return { blockId: block.id, wordIndex: Math.round(frac * Math.max(0, words.length - 1)) };
}

// ── Track Row ─────────────────────────────────────────────────────────────────

function TrackRow({
  label,
  color,
  children,
}: {
  label: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex w-20 shrink-0 items-center pt-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1 pb-1">
        {children}
      </div>
    </div>
  );
}

// ── AVFXPanel ─────────────────────────────────────────────────────────────────

type GenTarget =
  | { type: 'sfx'; blockId: string }
  | { type: 'ambient' }
  | { type: 'music' };

interface AVFXPanelProps {
  story: NWVStory;
}

export function AVFXPanel({ story }: AVFXPanelProps) {
  const avfxNodeId = useStoryStore((s) => s.avfxNodeId);
  const setAVFXNodeId = useStoryStore((s) => s.setAVFXNodeId);
  const avfxPlayheadMs = useStoryStore((s) => s.avfxPlayheadMs);
  const setAvfxPlayheadMs = useStoryStore((s) => s.setAvfxPlayheadMs);
  const avfxBlockDurationsMs = useStoryStore((s) => s.avfxBlockDurationsMs);
  const setAvfxBlockDurationsMs = useStoryStore((s) => s.setAvfxBlockDurationsMs);
  const updateNodeAudio = useStoryStore((s) => s.updateNodeAudio);
  const updateNode = useStoryStore((s) => s.updateNode);
  const addBlockSfxCue = useStoryStore((s) => s.addBlockSfxCue);
  const updateBlockSfxCue = useStoryStore((s) => s.updateBlockSfxCue);
  const removeBlockSfxCue = useStoryStore((s) => s.removeBlockSfxCue);
  const addVFXKeyframe = useStoryStore((s) => s.addVFXKeyframe);
  const updateVFXKeyframe = useStoryStore((s) => s.updateVFXKeyframe);
  const removeVFXKeyframe = useStoryStore((s) => s.removeVFXKeyframe);

  const sfxProvider = useSettingsStore((s) => s.sfxProvider);
  const elevenLabsKey = useSettingsStore((s) => s.elevenLabsKey);

  // ── Generation state ─────────────────────────────────────────────────────
  const [genOpen, setGenOpen] = useState<GenTarget | null>(null);
  const [genPrompt, setGenPrompt] = useState('');
  const [genDuration, setGenDuration] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [genPreview, setGenPreview] = useState<ArrayBuffer | null>(null);
  const [genPreviewPlaying, setGenPreviewPlaying] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [diffPct, setDiffPct] = useState(0);
  const genPlayerRef = useRef<SFXPlayer | null>(null);

  // ── Scene audio preview ───────────────────────────────────────────────────
  const scenePlayerRef = useRef<SFXPlayer | null>(null);
  const [sceneAudioPlaying, setSceneAudioPlaying] = useState<'ambient' | 'music' | null>(null);

  // ── Drag state ───────────────────────────────────────────────────────────
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const [draggingKf, setDraggingKf] = useState<{ id: string; ms: number } | null>(null);
  const [draggingSfx, setDraggingSfx] = useState<{ blockId: string; cueId: string; ms: number } | null>(null);

  // ── VFX editor state ─────────────────────────────────────────────────────
  const [vfxAddMs, setVfxAddMs] = useState<number | null>(null);
  const [vfxEditId, setVfxEditId] = useState<string | null>(null);
  const [vfxEffect, setVfxEffect] = useState<VFXEffectType>('blur');
  const [vfxValue, setVfxValue] = useState<string>(String(VFX_DEFAULTS['blur']));
  const [vfxTransMs, setVfxTransMs] = useState(500);

  // ── Timeline width (dynamic, fills available space) ──────────────────────
  const [timelineW, setTimelineW] = useState(560);
  const [mounted, setMounted] = useState(false);
  const presetsButtonRef = useRef<HTMLButtonElement>(null);
  const [presetsPortalPos, setPresetsPortalPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  // Measure track container width via ResizeObserver.
  // Depends on avfxNodeId so it re-runs after the tracks div mounts (it's conditional on node != null).
  useEffect(() => {
    const el = tracksContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width - LABEL_W;
      if (w > 50) setTimelineW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avfxNodeId]);

  // ── VFX preset & AI state ─────────────────────────────────────────────────
  const [vfxPresetsOpen, setVfxPresetsOpen] = useState(false);
  const [vfxAiOpen, setVfxAiOpen] = useState(false);
  const [vfxAiPrompt, setVfxAiPrompt] = useState('');
  const [vfxAiLoading, setVfxAiLoading] = useState(false);
  const [vfxAiError, setVfxAiError] = useState<string | null>(null);

  // Position the presets portal relative to the button, flipping upward if near bottom of viewport
  useEffect(() => {
    if (vfxPresetsOpen && presetsButtonRef.current) {
      const rect = presetsButtonRef.current.getBoundingClientRect();
      const DROPDOWN_H = 320; // approximate max height
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= DROPDOWN_H
        ? rect.bottom + 4
        : Math.max(8, rect.top - DROPDOWN_H - 4);
      setPresetsPortalPos({ top, left: rect.left });
    } else {
      setPresetsPortalPos(null);
    }
  }, [vfxPresetsOpen]);

  const anthropicKey = useSettingsStore((s) => s.anthropicKey);

  const orderedNodes = useMemo(() => bfsOrder(story.nodes), [story.nodes]);
  const node = story.nodes.find((n) => n.id === avfxNodeId) ?? null;
  const blocks = node?.blocks ?? [];

  // Timeline geometry
  const blockDurations = useMemo(
    () => blocks.map((b) => estimateBlockMs(b.text)),
    [blocks]
  );
  const totalMs = useMemo(
    () => blockDurations.reduce((a, v) => a + v, 0) || 4000,
    [blockDurations]
  );
  const blockStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const d of blockDurations) { starts.push(acc); acc += d; }
    return starts;
  }, [blockDurations]);

  // ── Real timestamp loader ─────────────────────────────────────────────────
  // Async-loads IDB word timestamps when node changes; sets real block durations
  // in the store so AVFXPlayView scrubber stays in sync with the timeline.
  useEffect(() => {
    if (!node || blocks.length === 0) { setAvfxBlockDurationsMs([]); return; }
    let cancelled = false;
    Promise.all(
      blocks.map(async (block) => {
        if (block.ttsAudioFile) {
          const ts = await readTimestampsServer(story.id, block.ttsAudioFile).catch(() => null);
          if (ts && ts.length > 0) return ts[ts.length - 1].end_ms;
        }
        return estimateBlockMs(block.text);
      })
    ).then((durations) => {
      if (!cancelled) setAvfxBlockDurationsMs(durations);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avfxNodeId, story.id]);

  // Use real durations when available and length matches current blocks
  const effectiveDurations = avfxBlockDurationsMs.length === blocks.length
    ? avfxBlockDurationsMs
    : blockDurations;

  const effectiveStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const d of effectiveDurations) { starts.push(acc); acc += d; }
    return starts;
  }, [effectiveDurations]);

  const effectiveTotalMs = useMemo(
    () => effectiveDurations.reduce((a, v) => a + v, 0) || 4000,
    [effectiveDurations]
  );

  const msToX = useCallback((ms: number) => (ms / effectiveTotalMs) * timelineW, [effectiveTotalMs, timelineW]);
  const xToMs = useCallback(
    (x: number) => Math.round(Math.max(0, Math.min(1, x / timelineW)) * effectiveTotalMs),
    [effectiveTotalMs, timelineW]
  );

  const snapCandidates = useMemo(() => {
    const ends = effectiveStarts.map((s, i) => s + effectiveDurations[i]);
    return [0, effectiveTotalMs, ...effectiveStarts, ...ends];
  }, [effectiveStarts, effectiveDurations, effectiveTotalMs]);

  // ── Global drag capture ───────────────────────────────────────────────────
  useEffect(() => {
    const active = draggingPlayhead || draggingKf !== null || draggingSfx !== null;
    if (!active) return;

    const onMove = (e: MouseEvent) => {
      if (!tracksContainerRef.current) return;
      const rect = tracksContainerRef.current.getBoundingClientRect();
      const snapped = snapMs(xToMs(e.clientX - rect.left - LABEL_W), snapCandidates, totalMs, timelineW);

      if (draggingPlayhead) {
        setAvfxPlayheadMs(Math.max(0, Math.min(effectiveTotalMs, snapped)));
      } else if (draggingKf) {
        setDraggingKf((d) => d ? { ...d, ms: snapped } : null);
      } else if (draggingSfx) {
        setDraggingSfx((d) => d ? { ...d, ms: snapped } : null);
      }
    };

    const onUp = () => {
      if (draggingKf && node) {
        updateVFXKeyframe(node.id, draggingKf.id, { timeMs: draggingKf.ms });
        setDraggingKf(null);
      }
      if (draggingSfx && node) {
        const { blockId: newBlockId, wordIndex } =
          msToBlockWord(draggingSfx.ms, blocks, effectiveStarts, effectiveDurations);
        const oldBlock = blocks.find((b) => b.id === draggingSfx.blockId);
        const cue = oldBlock?.sfxCues?.find((c) => c.id === draggingSfx.cueId);
        if (cue) {
          if (newBlockId === draggingSfx.blockId) {
            updateBlockSfxCue(node.id, draggingSfx.blockId, cue.id, { wordIndex });
          } else {
            removeBlockSfxCue(node.id, draggingSfx.blockId, cue.id);
            addBlockSfxCue(node.id, newBlockId, { ...cue, wordIndex });
          }
        }
        setDraggingSfx(null);
      }
      setDraggingPlayhead(false);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [draggingPlayhead, draggingKf, draggingSfx, snapCandidates, effectiveTotalMs, xToMs, timelineW,
      setAvfxPlayheadMs, node, blocks, effectiveStarts, effectiveDurations,
      updateVFXKeyframe, updateBlockSfxCue, removeBlockSfxCue, addBlockSfxCue]);

  // Diffusion progress polling
  useEffect(() => {
    if (!generating || sfxProvider === 'elevenlabs') { setDiffPct(0); return; }
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/audio/progress');
        const data = await res.json() as { pct?: number };
        setDiffPct(data.pct ?? 0);
      } catch { /* ignore */ }
    }, 400);
    return () => clearInterval(id);
  }, [generating, sfxProvider]);

  // ── Generation helpers ───────────────────────────────────────────────────

  const openGen = (target: GenTarget, prompt = '', duration = 3) => {
    setGenOpen(target);
    setGenPrompt(prompt);
    setGenDuration(duration);
    setGenPreview(null);
    setGenError(null);
    setGenPreviewPlaying(false);
    genPlayerRef.current?.stop();
  };

  const handleGenerate = async () => {
    if (!genOpen || !genPrompt.trim() || !node) return;
    setGenerating(true);
    setGenError(null);
    setGenPreview(null);
    try {
      const endpoint =
        genOpen.type === 'sfx'
          ? '/api/audio/sfx'
          : genOpen.type === 'ambient'
          ? '/api/audio/ambient'
          : '/api/audio/music';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: genPrompt,
          duration: genDuration,
          provider: sfxProvider,
          elevenLabsKey,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Generation failed' })) as { error?: string };
        setGenError(err.error ?? 'Generation failed');
        return;
      }
      setGenPreview(await res.arrayBuffer());
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setGenerating(false);
      setDiffPct(0);
    }
  };

  const handleAccept = async () => {
    if (!genOpen || !genPreview || !node) return;
    const filename = `${genOpen.type}_${node.id.slice(0, 8)}_${Date.now()}.wav`;
    saveAudioFileServer(story.id, filename, genPreview).catch(() => {});

    if (genOpen.type === 'ambient') {
      updateNodeAudio(node.id, {
        audio: [...node.audio.filter((f) => !f.startsWith('ambient_')), filename],
        ambientPrompt: genPrompt,
      });
    } else if (genOpen.type === 'music') {
      updateNodeAudio(node.id, {
        audio: [...node.audio.filter((f) => !f.startsWith('music_')), filename],
        musicPrompt: genPrompt,
      });
    } else if (genOpen.type === 'sfx') {
      const allCues = blocks.flatMap((b) => b.sfxCues ?? []);
      const used = new Set(allCues.map((c) => c.color).filter(Boolean));
      const color = SFX_COLORS.find((c) => !used.has(c)) ?? SFX_COLORS[allCues.length % SFX_COLORS.length];
      addBlockSfxCue(node.id, genOpen.blockId, {
        id: nanoid(),
        filename,
        prompt: genPrompt,
        offsetMs: 0,
        duration: genDuration,
        color,
      });
    }
    setGenOpen(null);
    setGenPreview(null);
  };

  // ── Scene audio helpers ──────────────────────────────────────────────────

  const toggleSceneAudio = async (type: 'ambient' | 'music') => {
    if (sceneAudioPlaying === type) {
      scenePlayerRef.current?.stop();
      setSceneAudioPlaying(null);
      return;
    }
    if (!node) return;
    const file = node.audio.find((f) => f.startsWith(type + '_'));
    if (!file) return;
    const buf = await readAudioFileServer(story.id, file).catch(() => null);
    if (!buf) return;
    if (!scenePlayerRef.current) scenePlayerRef.current = new SFXPlayer();
    scenePlayerRef.current.stop();
    setSceneAudioPlaying(type);
    scenePlayerRef.current.playLooped(buf).then(() => setSceneAudioPlaying(null)).catch(() => {});
  };

  const removeAudio = (type: 'ambient' | 'music') => {
    if (!node) return;
    scenePlayerRef.current?.stop();
    setSceneAudioPlaying(null);
    updateNodeAudio(node.id, {
      audio: node.audio.filter((f) => !f.startsWith(type + '_')),
      ...(type === 'ambient' ? { ambientPrompt: undefined } : { musicPrompt: undefined }),
    });
  };

  // ── VFX helpers ──────────────────────────────────────────────────────────

  const handleVFXTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingKf) return; // ignore click that ends a drag
    const rect = e.currentTarget.getBoundingClientRect();
    const rawMs = xToMs(e.clientX - rect.left);
    const clickMs = snapMs(rawMs, snapCandidates, effectiveTotalMs, timelineW);
    setVfxAddMs(clickMs);
    setVfxEditId(null);
    setVfxEffect('blur');
    setVfxValue(String(VFX_DEFAULTS['blur']));
    setVfxTransMs(500);
  };

  const handleVFXKeyframeClick = (e: React.MouseEvent, kf: NWVVFXKeyframe) => {
    e.stopPropagation();
    setVfxEditId(kf.id);
    setVfxAddMs(null);
    setVfxEffect(kf.effect);
    setVfxValue(String(kf.value));
    setVfxTransMs(kf.transitionMs);
  };

  const handleSaveVFX = () => {
    if (!node) return;
    const parsedValue = isNaN(Number(vfxValue)) ? vfxValue : Number(vfxValue);
    if (vfxEditId) {
      updateVFXKeyframe(node.id, vfxEditId, { effect: vfxEffect, value: parsedValue, transitionMs: vfxTransMs });
      setVfxEditId(null);
    } else if (vfxAddMs !== null) {
      addVFXKeyframe(node.id, { id: nanoid(), timeMs: vfxAddMs, effect: vfxEffect, value: parsedValue, transitionMs: vfxTransMs });
      setVfxAddMs(null);
    }
  };

  const applyPreset = (presetId: string) => {
    if (!node) return;
    const preset = VFX_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    for (const kf of preset.keyframes) {
      addVFXKeyframe(node.id, { id: nanoid(), ...kf });
    }
    setVfxPresetsOpen(false);
  };

  const handleAILighting = async () => {
    if (!node || !vfxAiPrompt.trim()) return;
    setVfxAiLoading(true);
    setVfxAiError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'lighting-suggest',
          anthropicKey,
          context: {
            genre: story.metadata?.genre,
            nodeTitle: node.title,
            nodeMood: node.mood,
            nodeBody: (node.blocks ?? []).map((b) => b.text).join(' ').slice(0, 300),
            description: vfxAiPrompt.trim(),
          },
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json() as { suggestions?: string };
      if (!data.suggestions) throw new Error('No response');
      const parsed = JSON.parse(data.suggestions) as { keyframes?: Array<{ timeMs: number; effect: string; value: number | string; transitionMs: number; prompt?: string }> };
      if (!parsed.keyframes?.length) throw new Error('No keyframes returned');
      for (const kf of parsed.keyframes) {
        addVFXKeyframe(node.id, {
          id: nanoid(),
          timeMs: kf.timeMs,
          effect: kf.effect as VFXEffectType,
          value: kf.value,
          transitionMs: kf.transitionMs,
          prompt: kf.prompt,
        });
      }
      setVfxAiPrompt('');
      setVfxAiOpen(false);
    } catch (e) {
      setVfxAiError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setVfxAiLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full border-t border-slate-200 bg-white">

      {/* ── Node list (left) ── */}
      <div className="w-44 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
        <div className="px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          Nodes
        </div>
        {orderedNodes.length === 0 && (
          <p className="px-3 py-2 text-xs text-slate-400">No nodes yet</p>
        )}
        {orderedNodes.map((n) => (
          <button
            key={n.id}
            onClick={() => setAVFXNodeId(n.id)}
            className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-slate-100 ${
              avfxNodeId === n.id ? 'bg-violet-50 text-violet-700' : 'text-slate-700'
            }`}
          >
            <span
              className="shrink-0 rounded px-1 py-0.5 text-[8px] font-bold uppercase text-white"
              style={{ backgroundColor: NODE_COLORS[n.type] ?? '#94a3b8' }}
            >
              {n.type}
            </span>
            <span className="truncate">{n.title || 'Untitled'}</span>
          </button>
        ))}
      </div>

      {/* ── Timeline (right) ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!node ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-slate-400">Select a node to edit its audio &amp; visual effects</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto p-4">

            {/* Node header */}
            <div className="mb-4 flex items-center gap-2">
              <span
                className="rounded px-2 py-0.5 text-[9px] font-bold uppercase text-white"
                style={{ backgroundColor: NODE_COLORS[node.type] ?? '#94a3b8' }}
              >
                {node.type}
              </span>
              <span className="text-sm font-semibold text-slate-800">{node.title || 'Untitled'}</span>
              <span className="text-xs text-slate-400">
                ≈ {(effectiveTotalMs / 1000).toFixed(1)}s · {blocks.length} block{blocks.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* ── Track rows ── */}
            <div
              ref={tracksContainerRef}
              className="relative flex flex-col gap-2"
              style={{ userSelect: (draggingPlayhead || draggingKf || draggingSfx) ? 'none' : undefined }}
            >
              {/* Scrubber */}
              <div
                className="pointer-events-none absolute inset-y-0 z-20"
                style={{ left: LABEL_W + msToX(Math.max(0, Math.min(effectiveTotalMs, avfxPlayheadMs))) }}
              >
                <div className="h-full w-px bg-red-400/50" />
                <div
                  className="pointer-events-auto absolute -top-0.5 -translate-x-1/2 cursor-ew-resize"
                  onMouseDown={(e) => { e.preventDefault(); setDraggingPlayhead(true); }}
                  title="Drag to scrub"
                >
                  <div className="h-2.5 w-2.5 rounded-full border border-white bg-red-400 shadow" />
                </div>
              </div>

              {/* Dialogue — read-only */}
              <TrackRow label="Dialogue" color="#64748b">
                <div className="relative h-8 w-full">
                  {blocks.map((block, i) => {
                    const x = msToX(effectiveStarts[i]);
                    const w = Math.max(msToX(effectiveDurations[i]) - 2, 20);
                    const char = story.characters.find((c) => c.id === block.characterId);
                    return (
                      <div
                        key={block.id}
                        className="absolute top-0 flex h-7 items-center overflow-hidden rounded border border-slate-200 bg-slate-100 px-1.5"
                        style={{ left: x, width: w }}
                        title={block.text}
                      >
                        <span className="truncate text-[9px] text-slate-500">
                          {char?.name ?? 'Narrator'}: {block.text.slice(0, 50)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </TrackRow>

              {/* SFX */}
              <TrackRow label="SFX" color="#10b981">
                <div
                  className="relative h-8 w-full cursor-pointer rounded border border-dashed border-emerald-200 bg-emerald-50/40"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickMs = xToMs(e.clientX - rect.left);
                    // Find block at click position
                    let targetBlockId = blocks[0]?.id ?? '';
                    for (let i = 0; i < blocks.length; i++) {
                      if (clickMs >= effectiveStarts[i]) targetBlockId = blocks[i].id;
                    }
                    openGen({ type: 'sfx', blockId: targetBlockId }, '', 3);
                  }}
                  title="Click to add SFX"
                >
                  {blocks.flatMap((block, blockIdx) =>
                    (block.sfxCues ?? []).map((cue) => {
                      const words = block.text.trim().split(/\s+/).filter(Boolean);
                      const wordFrac = words.length > 0
                        ? Math.min(cue.wordIndex ?? 0, words.length - 1) / words.length
                        : 0;
                      const cueMs = effectiveStarts[blockIdx] + wordFrac * effectiveDurations[blockIdx];
                      const isDragging = draggingSfx?.cueId === cue.id;
                      const cx = msToX(isDragging ? draggingSfx!.ms : cueMs);
                      const chipColor = cue.color ?? '#10b981';
                      return (
                        <div
                          key={cue.id}
                          className="group absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: cx, top: '50%',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            zIndex: isDragging ? 10 : undefined,
                          }}
                          title={cue.prompt}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDraggingSfx({ blockId: block.id, cueId: cue.id, ms: cueMs });
                          }}
                          onClick={(e) => {
                            if (!draggingSfx) {
                              e.stopPropagation();
                              openGen({ type: 'sfx', blockId: block.id }, cue.prompt, cue.duration);
                            }
                          }}
                        >
                          <div
                            className={`h-3 w-3 rounded-full border-2 border-white shadow-sm transition-transform group-hover:scale-125 ${isDragging ? 'scale-125' : ''}`}
                            style={{ backgroundColor: chipColor }}
                          />
                          <span
                            className="absolute -bottom-4 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[8px] group-hover:block"
                            style={{ color: chipColor }}
                          >
                            {cue.prompt.slice(0, 20)}
                          </span>
                        </div>
                      );
                    })
                  )}
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] text-emerald-300">
                    {blocks.flatMap((b) => b.sfxCues ?? []).length === 0 && '+ click to add SFX'}
                  </span>
                </div>
              </TrackRow>

              {/* Ambient */}
              <TrackRow label="Ambient" color="#0891b2">
                <div className="relative h-8 w-full rounded border border-dashed border-cyan-200 bg-cyan-50/40">
                  {node.audio.some((f) => f.startsWith('ambient_')) ? (
                    <div className="flex h-full items-center gap-2 px-2">
                      <button
                        onClick={() => toggleSceneAudio('ambient')}
                        className="text-xs text-cyan-600 hover:text-cyan-800"
                        title={sceneAudioPlaying === 'ambient' ? 'Stop' : 'Preview looped'}
                      >
                        {sceneAudioPlaying === 'ambient' ? '■' : '▶'}
                      </button>
                      <span className="flex-1 truncate text-[10px] text-cyan-700">
                        {node.ambientPrompt || 'Ambient'}
                      </span>
                      <button
                        onClick={() => removeAudio('ambient')}
                        className="text-[10px] text-slate-300 hover:text-red-500"
                        title="Remove ambient"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] text-cyan-300"
                    >
                      + click to generate ambient
                    </span>
                  )}
                  {!node.audio.some((f) => f.startsWith('ambient_')) && (
                    <button
                      onClick={() => openGen({ type: 'ambient' }, '', 15)}
                      className="absolute inset-0 h-full w-full opacity-0"
                      title="Generate ambient"
                    />
                  )}
                </div>
              </TrackRow>

              {/* Music */}
              <TrackRow label="Music" color="#7c3aed">
                <div className="relative h-8 w-full rounded border border-dashed border-violet-200 bg-violet-50/40">
                  {node.audio.some((f) => f.startsWith('music_')) ? (
                    <div className="flex h-full items-center gap-2 px-2">
                      <button
                        onClick={() => toggleSceneAudio('music')}
                        className="text-xs text-violet-600 hover:text-violet-800"
                        title={sceneAudioPlaying === 'music' ? 'Stop' : 'Preview looped'}
                      >
                        {sceneAudioPlaying === 'music' ? '■' : '▶'}
                      </button>
                      <span className="flex-1 truncate text-[10px] text-violet-700">
                        {node.musicPrompt || 'Music'}
                      </span>
                      <button
                        onClick={() => removeAudio('music')}
                        className="text-[10px] text-slate-300 hover:text-red-500"
                        title="Remove music"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span
                      className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] text-violet-300"
                    >
                      + click to generate music
                    </span>
                  )}
                  {!node.audio.some((f) => f.startsWith('music_')) && (
                    <button
                      onClick={() => openGen({ type: 'music' }, '', 15)}
                      className="absolute inset-0 h-full w-full opacity-0"
                      title="Generate music"
                    />
                  )}
                </div>
              </TrackRow>

              {/* Visual FX */}
              <div className="flex items-start gap-2">
                <div className="flex w-20 shrink-0 items-center pt-1.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-500">Visual FX</span>
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  {/* Preset + AI button row — buttons rendered outside overflow via portal */}
                  <div className="mb-1 flex items-center gap-1.5">
                    <button
                      ref={presetsButtonRef}
                      onClick={() => { setVfxPresetsOpen(!vfxPresetsOpen); setVfxAiOpen(false); }}
                      className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                    >
                      Presets ▾
                    </button>
                    <button
                      onClick={() => { setVfxAiOpen(!vfxAiOpen); setVfxPresetsOpen(false); }}
                      className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                      title="AI lighting generation"
                    >
                      ✨ AI
                    </button>
                    {(node.vfxKeyframes ?? []).length > 0 && (
                      <button
                        onClick={() => {
                          if (confirm('Clear all VFX keyframes on this node?')) {
                            for (const kf of node.vfxKeyframes ?? []) removeVFXKeyframe(node.id, kf.id);
                          }
                        }}
                        className="ml-auto rounded px-2 py-0.5 text-[10px] text-slate-400 hover:text-red-500"
                        title="Clear all keyframes"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {/* AI lighting input */}
                  {vfxAiOpen && (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="Describe a lighting effect…"
                        value={vfxAiPrompt}
                        onChange={(e) => setVfxAiPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAILighting()}
                        className="flex-1 rounded border border-amber-200 bg-white px-2 py-0.5 text-[11px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                        autoFocus
                      />
                      <button
                        onClick={handleAILighting}
                        disabled={!vfxAiPrompt.trim() || vfxAiLoading}
                        className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-amber-600 disabled:opacity-40"
                      >
                        {vfxAiLoading ? '…' : '→'}
                      </button>
                      {vfxAiError && <span className="text-[10px] text-red-500">{vfxAiError}</span>}
                    </div>
                  )}

                  {/* VFX timeline track */}
                  <div
                    className="relative h-8 w-full cursor-crosshair rounded border border-dashed border-amber-200 bg-amber-50/40"
                    onClick={handleVFXTrackClick}
                    title="Click to add a visual FX keyframe"
                  >
                    {(node.vfxKeyframes ?? []).map((kf) => {
                      const isDragging = draggingKf?.id === kf.id;
                      const cx = msToX(isDragging ? draggingKf!.ms : kf.timeMs);
                      return (
                        <div
                          key={kf.id}
                          className="group absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: cx, top: '50%',
                            cursor: isDragging ? 'grabbing' : 'grab',
                            zIndex: isDragging ? 10 : undefined,
                          }}
                          title={`${kf.effect}: ${kf.value} (${((isDragging ? draggingKf!.ms : kf.timeMs) / 1000).toFixed(2)}s)`}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDraggingKf({ id: kf.id, ms: kf.timeMs });
                          }}
                          onClick={(e) => {
                            if (!draggingKf) handleVFXKeyframeClick(e, kf);
                          }}
                        >
                          <div className={`h-3 w-3 rotate-45 border-2 border-white shadow-sm transition-transform group-hover:scale-125 ${isDragging ? 'bg-amber-500 scale-125' : 'bg-amber-400'}`} />
                          <span className="absolute -bottom-4 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[8px] text-amber-600 group-hover:block">
                            {kf.effect}
                          </span>
                        </div>
                      );
                    })}
                    {(node.vfxKeyframes ?? []).length === 0 && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] text-amber-300">
                        + click to add VFX keyframe
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Generation panel ── */}
            {genOpen && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-700">
                    {genOpen.type === 'sfx'
                      ? 'Generate SFX'
                      : genOpen.type === 'ambient'
                      ? 'Generate Ambient'
                      : 'Generate Music'}
                  </span>
                  <button
                    onClick={() => { setGenOpen(null); genPlayerRef.current?.stop(); }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  rows={2}
                  className="mb-2 w-full resize-none rounded border border-emerald-200 bg-white px-2 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  placeholder={
                    genOpen.type === 'sfx'
                      ? 'Door creaking open slowly…'
                      : genOpen.type === 'ambient'
                      ? 'Rainy street, distant thunder…'
                      : 'Tense orchestral strings, building tension…'
                  }
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                />
                <div className="mb-2 flex items-center gap-3">
                  <label className="text-[10px] text-slate-500">Duration</label>
                  <input
                    type="range"
                    min={genOpen.type === 'sfx' ? 1 : 5}
                    max={genOpen.type === 'sfx' ? 10 : 30}
                    value={genDuration}
                    onChange={(e) => setGenDuration(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="w-6 text-[10px] text-slate-500">{genDuration}s</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    disabled={!genPrompt.trim() || generating}
                    onClick={handleGenerate}
                    className="rounded bg-emerald-600 px-3 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    {generating ? 'Generating…' : 'Generate'}
                  </button>
                  {generating && sfxProvider === 'local' && diffPct > 0 && (
                    <div className="flex-1 overflow-hidden rounded bg-slate-200" style={{ height: 4 }}>
                      <div
                        className="h-full rounded bg-emerald-500 transition-all"
                        style={{ width: `${Math.round(diffPct * 100)}%` }}
                      />
                    </div>
                  )}
                  {genPreview && (
                    <>
                      <button
                        onClick={async () => {
                          if (genPreviewPlaying) {
                            genPlayerRef.current?.stop();
                            setGenPreviewPlaying(false);
                          } else {
                            if (!genPlayerRef.current) genPlayerRef.current = new SFXPlayer();
                            setGenPreviewPlaying(true);
                            await genPlayerRef.current.playOnce(genPreview).catch(() => {});
                            setGenPreviewPlaying(false);
                          }
                        }}
                        className="text-xs text-emerald-600 hover:text-emerald-800"
                      >
                        {genPreviewPlaying ? '■ Stop' : '▶ Preview'}
                      </button>
                      <button
                        onClick={handleAccept}
                        className="rounded bg-emerald-600 px-3 py-1 text-[10px] font-medium text-white hover:bg-emerald-700"
                      >
                        Accept
                      </button>
                    </>
                  )}
                  {genError && <span className="text-[10px] text-red-500">{genError}</span>}
                </div>
              </div>
            )}

            {/* ── VFX keyframe editor ── */}
            {(vfxAddMs !== null || vfxEditId !== null) && node && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-700">
                    {vfxEditId
                      ? 'Edit Visual FX Keyframe'
                      : `Add Visual FX @ ${((vfxAddMs ?? 0) / 1000).toFixed(2)}s`}
                  </span>
                  <div className="flex items-center gap-3">
                    {vfxEditId && (
                      <button
                        onClick={() => {
                          removeVFXKeyframe(node.id, vfxEditId);
                          setVfxEditId(null);
                        }}
                        className="text-[10px] text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    )}
                    <button
                      onClick={() => { setVfxAddMs(null); setVfxEditId(null); }}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-slate-500">Effect</label>
                    <select
                      value={vfxEffect}
                      onChange={(e) => {
                        const eff = e.target.value as VFXEffectType;
                        setVfxEffect(eff);
                        setVfxValue(String(VFX_DEFAULTS[eff]));
                      }}
                      className="rounded border border-amber-200 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-none"
                    >
                      {VFX_EFFECTS.map((eff) => (
                        <option key={eff} value={eff}>{eff}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-slate-500">Value</label>
                    <input
                      type="text"
                      value={vfxValue}
                      onChange={(e) => setVfxValue(e.target.value)}
                      className="w-20 rounded border border-amber-200 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-none"
                      placeholder={String(VFX_DEFAULTS[vfxEffect])}
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-slate-500">Transition</label>
                    <input
                      type="number"
                      value={vfxTransMs}
                      onChange={(e) => setVfxTransMs(Number(e.target.value))}
                      className="w-16 rounded border border-amber-200 bg-white px-2 py-0.5 text-xs text-slate-700 focus:outline-none"
                    />
                    <span className="text-[9px] text-slate-400">ms</span>
                  </div>
                  <button
                    onClick={handleSaveVFX}
                    className="rounded bg-amber-500 px-3 py-1 text-[10px] font-medium text-white hover:bg-amber-600"
                  >
                    {vfxEditId ? 'Update' : 'Add Keyframe'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Presets dropdown portal — renders outside all overflow containers */}
      {mounted && vfxPresetsOpen && presetsPortalPos && createPortal(
        <div
          className="fixed z-[9999] w-56 overflow-y-auto rounded-lg border border-amber-200 bg-white shadow-lg"
          style={{ top: presetsPortalPos.top, left: presetsPortalPos.left, maxHeight: '70vh' }}
          onMouseLeave={() => setVfxPresetsOpen(false)}
        >
          {PRESET_CATEGORIES.map((cat) => {
            const items = VFX_PRESETS.filter((p) => p.category === cat.id);
            return (
              <div key={cat.id}>
                <p className="px-3 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{cat.label}</p>
                {items.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-amber-50"
                  >
                    <span>{preset.icon}</span>
                    <span className="font-medium">{preset.name}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
