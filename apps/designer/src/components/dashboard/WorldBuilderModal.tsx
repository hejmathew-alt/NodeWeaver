'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import type { GenreSlug, NWVWorldData, NWVLocation, NWVFaction, NWVLoreEntry, NWVNode, NWVStory } from '@nodeweaver/engine';
import { GENRE_META } from '@nodeweaver/engine';
import { useSettingsStore } from '@/lib/settings';
import { NARRATOR_DEFAULT } from '@/store/story';

// ── Layout & hydration helpers ────────────────────────────────────────────────

function layoutNodes(nodes: NWVNode[]): NWVNode[] {
  const startNode = nodes.find((n) => n.type === 'start') ?? nodes[0];
  if (!startNode) return nodes;
  const levels = new Map<string, number>();
  const queue = [startNode.id];
  levels.set(startNode.id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    const level = levels.get(id)!;
    for (const choice of node.choices ?? []) {
      if (choice.next && !levels.has(choice.next)) {
        levels.set(choice.next, level + 1);
        queue.push(choice.next);
      }
    }
  }
  const maxLevel = levels.size ? Math.max(...levels.values()) : 0;
  for (const node of nodes) {
    if (!levels.has(node.id)) levels.set(node.id, maxLevel + 1);
  }
  const byLevel = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(id);
  }
  const NODE_W = 340, NODE_H = 230;
  // L→R layout: x encodes depth (spine), y encodes sibling spread (branching)
  return nodes.map((n) => {
    const level = levels.get(n.id) ?? 0;
    const siblings = byLevel.get(level) ?? [n.id];
    const idx = siblings.indexOf(n.id);
    const totalH = siblings.length * NODE_H;
    return { ...n, position: { x: level * NODE_W + 80, y: idx * NODE_H - totalH / 2 + NODE_H / 2 + 400 } };
  });
}

function hydrateGeneratedStory(
  raw: Record<string, unknown>,
  genre: GenreSlug,
  storyId: string,
  world: NWVWorldData,
): NWVStory {
  const now = new Date().toISOString();
  const meta = (raw.metadata ?? {}) as Record<string, unknown>;
  const rawNodes = ((raw.nodes as NWVNode[]) ?? []).map((n) => ({ audio: [], lanes: [], ...n }));
  return {
    version: '1.0', id: storyId,
    metadata: {
      title: (meta.title as string) || 'Generated Story',
      genre,
      logline: (meta.logline as string) || '',
      targetTone: (meta.targetTone as string) || '',
      createdAt: now, updatedAt: now,
    },
    nodes: layoutNodes(rawNodes),
    characters: [NARRATOR_DEFAULT, ...((raw.characters as NWVStory['characters']) ?? [])],
    lanes: [], enemies: {},
    world,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = 'locations' | 'factions' | 'rules' | 'lore';

const STEPS: Step[] = ['locations', 'factions', 'rules', 'lore'];
const STEP_LABELS: Record<Step, string> = {
  locations: 'Locations',
  factions:  'Factions',
  rules:     'World Rules',
  lore:      'Lore',
};
const STEP_DESCS: Record<Step, string> = {
  locations: 'Places that exist in this world',
  factions:  'Groups with goals and agendas',
  rules:     'Laws and constraints of the world',
  lore:      'Myths, history, and secrets',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callWorldStep(
  step: Step,
  genre: GenreSlug,
  title: string,
  premise: string,
  existingWorld: Partial<NWVWorldData>,
  anthropicKey: string,
): Promise<unknown[]> {
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'world-step',
      prompt: '',
      anthropicKey,
      context: { step, genre, title, premise, existingWorld },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return JSON.parse(data.world);
}

async function callWorldRecycle(
  step: Step,
  genre: GenreSlug,
  title: string,
  premise: string,
  siblings: string[],
  itemType: string,
  anthropicKey: string,
): Promise<unknown> {
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mode: 'world-recycle',
      prompt: '',
      anthropicKey,
      context: { step, genre, title, premise, siblings, itemType },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  // May be wrapped in array by Claude — take first element if so
  const raw = JSON.parse(data.world);
  return Array.isArray(raw) ? raw[0] : raw;
}

function locationSiblings(locs: NWVLocation[]): string[] {
  return locs.map((l) => `${l.name}: ${l.description}`);
}
function factionSiblings(factions: NWVFaction[]): string[] {
  return factions.map((f) => `${f.name}: ${f.ideology}`);
}
function loreSiblings(lore: NWVLoreEntry[]): string[] {
  return lore.map((e) => `${e.title}: ${e.content}`);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  concept: { title: string; premise: string };
  genre: GenreSlug;
  storyId: string;
  onClose: () => void;
  onStoriesChanged?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorldBuilderModal({ concept, genre, storyId, onClose, onStoriesChanged }: Props) {
  const router = useRouter();
  const anthropicKey = useSettingsStore((s) => s.anthropicKey);

  const [stepIdx, setStepIdx] = useState(0);
  const currentStep = STEPS[stepIdx];

  const [world, setWorld] = useState<NWVWorldData>({
    locations: [], factions: [], rules: [], lore: [],
  });

  const [loading, setLoading] = useState(false);
  const [recyclingId, setRecyclingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [storyGenLoading, setStoryGenLoading] = useState(false);

  // ── Generate step ──────────────────────────────────────────────────────────

  const generateStep = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await callWorldStep(currentStep, genre, concept.title, concept.premise, world, anthropicKey);
      setWorld((w) => applyStepItems(w, currentStep, items));
      setGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  }, [currentStep, genre, concept, world, anthropicKey]);

  // ── Recycle single item ────────────────────────────────────────────────────

  const recycleItem = useCallback(async (id: string) => {
    setRecyclingId(id);
    setError(null);
    try {
      const siblings = getStepSiblings(world, currentStep, id);
      const itemType = currentStep === 'rules' ? 'world rule (string)' : currentStep.replace(/s$/, '');
      const fresh = await callWorldRecycle(currentStep, genre, concept.title, concept.premise, siblings, itemType, anthropicKey);
      setWorld((w) => replaceStepItem(w, currentStep, id, fresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recycle failed.');
    } finally {
      setRecyclingId(null);
    }
  }, [currentStep, genre, concept, world, anthropicKey]);

  // ── Generate full story from world data ────────────────────────────────────

  const generateFullStory = useCallback(async () => {
    setStoryGenLoading(true);
    setError(null);
    try {
      const brief = GENRE_META[genre as keyof typeof GENRE_META]?.brief ?? '';
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'story-gen',
          prompt: `${concept.title}: ${concept.premise}`,
          anthropicKey,
          context: { genre, genreBrief: brief, worldData: world },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const { story: rawText } = (await res.json()) as { story: string };
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const hydrated = hydrateGeneratedStory(parsed, genre, storyId, world);
      await fetch(`/api/stories/${encodeURIComponent(storyId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(hydrated),
      });
      onStoriesChanged?.();
      router.push(`/story/${storyId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Story generation failed.');
      setStoryGenLoading(false);
    }
  }, [concept, genre, world, storyId, anthropicKey, onStoriesChanged, router]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const canGoNext = generated || hasStepData(world, currentStep);

  const goNext = async () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
      setGenerated(false);
    } else {
      // Final step → save world data and navigate to canvas
      try {
        const storyRes = await fetch(`/api/stories/${encodeURIComponent(storyId)}`);
        if (storyRes.ok) {
          const story = await storyRes.json();
          await fetch(`/api/stories/${encodeURIComponent(storyId)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...story, world }),
          });
        }
        onStoriesChanged?.();
        router.push(`/story/${storyId}`);
      } catch {
        router.push(`/story/${storyId}`);
      }
    }
  };

  const goBack = () => {
    if (stepIdx > 0) { setStepIdx((i) => i - 1); setGenerated(false); }
  };

  const skipToCanvas = () => {
    onStoriesChanged?.();
    router.push(`/story/${storyId}`);
  };

  // ── Inline edits ───────────────────────────────────────────────────────────

  const patchLocation = (id: string, field: keyof NWVLocation, value: string) =>
    setWorld((w) => ({ ...w, locations: w.locations.map((l) => l.id === id ? { ...l, [field]: value } : l) }));

  const patchFaction = (id: string, field: keyof NWVFaction, value: string) =>
    setWorld((w) => ({ ...w, factions: w.factions.map((f) => f.id === id ? { ...f, [field]: value } : f) }));

  const patchRule = (idx: number, value: string) =>
    setWorld((w) => { const rules = [...w.rules]; rules[idx] = value; return { ...w, rules }; });

  const patchLore = (id: string, field: keyof NWVLoreEntry, value: string) =>
    setWorld((w) => ({ ...w, lore: w.lore.map((e) => e.id === id ? { ...e, [field]: value } : e) }));

  const isLastStep = stepIdx === STEPS.length - 1;
  const stepItems = getStepItemCount(world, currentStep);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-1.5"><svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="6"/><ellipse cx="7" cy="7" rx="2.8" ry="6"/><line x1="1.2" y1="5" x2="12.8" y2="5"/><line x1="1.2" y1="9" x2="12.8" y2="9"/></svg> World Builder</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {concept.title} · {genre}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-slate-100 shrink-0">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`flex-1 py-2.5 text-center text-xs font-medium transition-colors ${
                i === stepIdx
                  ? 'border-b-2 border-cyan-500 text-cyan-700'
                  : i < stepIdx
                  ? 'text-slate-400'
                  : 'text-slate-300'
              }`}
            >
              <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] mr-1 ${
                i < stepIdx ? 'bg-cyan-100 text-cyan-600' : i === stepIdx ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-300'
              }`}>
                {i < stepIdx ? '✓' : i + 1}
              </span>
              {STEP_LABELS[s]}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">{STEP_LABELS[currentStep]}</p>
              <p className="text-xs text-slate-400">{STEP_DESCS[currentStep]}</p>
            </div>
            <button
              onClick={generateStep}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-400 disabled:opacity-60 transition-colors"
            >
              {loading ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : stepItems > 0 ? '↻ Regenerate all' : '✦ Generate'}
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          {/* Locations */}
          {currentStep === 'locations' && world.locations.map((loc) => (
            <WorldCard
              key={loc.id}
              onRecycle={() => recycleItem(loc.id)}
              recycling={recyclingId === loc.id}
            >
              <input
                className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-cyan-300 pb-0.5 mb-1"
                value={loc.name}
                onChange={(e) => patchLocation(loc.id, 'name', e.target.value)}
                placeholder="Location name"
              />
              <textarea
                className="w-full resize-none text-xs text-slate-600 bg-transparent outline-none leading-relaxed"
                rows={2}
                value={loc.description}
                onChange={(e) => patchLocation(loc.id, 'description', e.target.value)}
                placeholder="Description…"
              />
              <p className="text-[11px] text-cyan-600 mt-1 italic">{loc.atmosphere}</p>
            </WorldCard>
          ))}

          {/* Factions */}
          {currentStep === 'factions' && world.factions.map((f) => (
            <WorldCard
              key={f.id}
              onRecycle={() => recycleItem(f.id)}
              recycling={recyclingId === f.id}
            >
              <input
                className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-cyan-300 pb-0.5 mb-1"
                value={f.name}
                onChange={(e) => patchFaction(f.id, 'name', e.target.value)}
                placeholder="Faction name"
              />
              <p className="text-[11px] text-slate-400 mb-1">
                <span className="text-slate-500 font-medium">Leader:</span>{' '}
                <input
                  className="inline bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-cyan-300 text-xs text-slate-600"
                  value={f.leader}
                  onChange={(e) => patchFaction(f.id, 'leader', e.target.value)}
                  placeholder="Leader name"
                />
              </p>
              <textarea
                className="w-full resize-none text-xs text-slate-600 bg-transparent outline-none leading-relaxed"
                rows={2}
                value={f.ideology}
                onChange={(e) => patchFaction(f.id, 'ideology', e.target.value)}
                placeholder="Ideology / goal…"
              />
              <p className="text-[11px] text-cyan-600 mt-1 italic">{f.relation}</p>
            </WorldCard>
          ))}

          {/* World Rules */}
          {currentStep === 'rules' && world.rules.map((rule, i) => (
            <WorldCard
              key={i}
              onRecycle={() => recycleItem(`rule-${i}`)}
              recycling={recyclingId === `rule-${i}`}
            >
              <div className="flex gap-2 items-start">
                <span className="text-[11px] font-bold text-cyan-500 mt-0.5 shrink-0">{i + 1}</span>
                <textarea
                  className="flex-1 resize-none text-xs text-slate-700 bg-transparent outline-none leading-relaxed"
                  rows={2}
                  value={rule}
                  onChange={(e) => patchRule(i, e.target.value)}
                  placeholder="World rule…"
                />
              </div>
            </WorldCard>
          ))}

          {/* Lore */}
          {currentStep === 'lore' && world.lore.map((entry) => (
            <WorldCard
              key={entry.id}
              onRecycle={() => recycleItem(entry.id)}
              recycling={recyclingId === entry.id}
            >
              <input
                className="w-full text-sm font-semibold text-slate-800 bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-cyan-300 pb-0.5 mb-1"
                value={entry.title}
                onChange={(e) => patchLore(entry.id, 'title', e.target.value)}
                placeholder="Lore title"
              />
              <textarea
                className="w-full resize-none text-xs text-slate-600 bg-transparent outline-none leading-relaxed"
                rows={3}
                value={entry.content}
                onChange={(e) => patchLore(entry.id, 'content', e.target.value)}
                placeholder="Lore content…"
              />
            </WorldCard>
          ))}

          {stepItems === 0 && !loading && (
            <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              Click <strong>Generate</strong> to have AI create {STEP_LABELS[currentStep].toLowerCase()} for your world.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 shrink-0">
          <button
            onClick={goBack}
            disabled={stepIdx === 0 || storyGenLoading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-500 hover:border-slate-400 disabled:opacity-40 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={skipToCanvas}
            disabled={storyGenLoading}
            className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors"
          >
            Skip to Canvas →
          </button>
          {isLastStep ? (
            <div className="flex gap-2">
              <button
                onClick={goNext}
                disabled={!canGoNext || storyGenLoading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-500 hover:border-slate-400 disabled:opacity-40 transition-colors"
              >
                Write Myself
              </button>
              <button
                onClick={generateFullStory}
                disabled={storyGenLoading}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-60 transition-colors"
              >
                {storyGenLoading ? (
                  <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Generating…</>
                ) : '✦ Generate Story'}
              </button>
            </div>
          ) : (
            <button
              onClick={goNext}
              disabled={!canGoNext}
              className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-400 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── WorldCard ─────────────────────────────────────────────────────────────────

function WorldCard({
  children,
  onRecycle,
  recycling,
}: {
  children: React.ReactNode;
  onRecycle: () => void;
  recycling: boolean;
}) {
  return (
    <div className="group relative rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      {children}
      <button
        onClick={onRecycle}
        disabled={recycling}
        title="Generate a different one"
        className="absolute top-2 right-2 rounded p-1 text-slate-300 hover:bg-slate-200 hover:text-cyan-600 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-60"
      >
        {recycling ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-cyan-500" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13.5 3.5A6.5 6.5 0 1 0 14.5 9" strokeLinecap="round"/>
            <path d="M11 3.5h2.5V1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
    </div>
  );
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function applyStepItems(world: NWVWorldData, step: Step, items: unknown[]): NWVWorldData {
  switch (step) {
    case 'locations':
      return { ...world, locations: (items as Omit<NWVLocation, 'id'>[]).map((l) => ({ id: nanoid(8), ...l })) };
    case 'factions':
      return { ...world, factions: (items as Omit<NWVFaction, 'id'>[]).map((f) => ({ id: nanoid(8), ...f })) };
    case 'rules':
      return { ...world, rules: items as string[] };
    case 'lore':
      return { ...world, lore: (items as Omit<NWVLoreEntry, 'id'>[]).map((e) => ({ id: nanoid(8), ...e })) };
  }
}

function replaceStepItem(world: NWVWorldData, step: Step, id: string, fresh: unknown): NWVWorldData {
  switch (step) {
    case 'locations': {
      const f = fresh as Omit<NWVLocation, 'id'>;
      return { ...world, locations: world.locations.map((l) => l.id === id ? { id, ...f } : l) };
    }
    case 'factions': {
      const f = fresh as Omit<NWVFaction, 'id'>;
      return { ...world, factions: world.factions.map((fc) => fc.id === id ? { id, ...f } : fc) };
    }
    case 'rules': {
      const idx = parseInt(id.replace('rule-', ''), 10);
      const rules = [...world.rules];
      rules[idx] = fresh as string;
      return { ...world, rules };
    }
    case 'lore': {
      const f = fresh as Omit<NWVLoreEntry, 'id'>;
      return { ...world, lore: world.lore.map((e) => e.id === id ? { id, ...f } : e) };
    }
  }
}

function getStepSiblings(world: NWVWorldData, step: Step, excludeId: string): string[] {
  switch (step) {
    case 'locations': return locationSiblings(world.locations.filter((l) => l.id !== excludeId));
    case 'factions':  return factionSiblings(world.factions.filter((f) => f.id !== excludeId));
    case 'rules': {
      const idx = parseInt(excludeId.replace('rule-', ''), 10);
      return world.rules.filter((_, i) => i !== idx);
    }
    case 'lore': return loreSiblings(world.lore.filter((e) => e.id !== excludeId));
  }
}

function hasStepData(world: NWVWorldData, step: Step): boolean {
  switch (step) {
    case 'locations': return world.locations.length > 0;
    case 'factions':  return world.factions.length > 0;
    case 'rules':     return world.rules.length > 0;
    case 'lore':      return world.lore.length > 0;
  }
}

function getStepItemCount(world: NWVWorldData, step: Step): number {
  switch (step) {
    case 'locations': return world.locations.length;
    case 'factions':  return world.factions.length;
    case 'rules':     return world.rules.length;
    case 'lore':      return world.lore.length;
  }
}
