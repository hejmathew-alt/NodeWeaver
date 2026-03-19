'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import type { NWVStory, NWVNode, NWVCharacter, GenreSlug } from '@nodeweaver/engine';
import { useSettingsStore } from '@/lib/settings';
import { NARRATOR_DEFAULT } from '@/store/story';
import { WorldBuilderModal } from './WorldBuilderModal';

const GENRE_BRIEFS: Record<GenreSlug, string> = {
  'sci-fi': 'Technical, speculative, vast scale. Cold logic vs human emotion.',
  fantasy: 'Mythic, lyrical, world-building heavy. Magic has rules and cost.',
  horror: 'Dread over shock. Slow burn. The unknown is scarier than the known.',
  'mystery-noir': 'Sparse, cynical, every detail matters. Everyone has a secret.',
  'post-apocalyptic': 'Survival pragmatism. Loss of the old world. Dark hope.',
  cyberpunk: 'Corporate dystopia. High tech, low life. Wit and grit.',
  survival: 'Extreme conditions, shrinking resources. Every choice is immediate.',
  comedy: "Timing is everything. Subvert expectations. Ground absurdity in real emotion.",
  romance: "Intimate, tension-driven. Desire and restraint in equal measure.",
  children: "Dark wit, preposterous adults, children who are quietly brilliant.",
  custom: '',
};

const GENRES: { value: GenreSlug; label: string }[] = [
  { value: 'sci-fi', label: 'Sci-Fi' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'horror', label: 'Horror' },
  { value: 'mystery-noir', label: 'Mystery / Noir' },
  { value: 'post-apocalyptic', label: 'Post-Apocalyptic' },
  { value: 'survival', label: 'Survival' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'romance', label: 'Romance' },
  { value: 'children', label: "Children's" },
  { value: 'custom', label: 'Custom' },
];

interface CastMember {
  name: string;
  role: string;
  sketch: string;
}

interface Concept {
  title: string;
  premise: string;
  cast: CastMember[];
}

function parseConcept(text: string): Concept {
  const titleMatch = text.match(/^TITLE:\s*(.+)$/m);
  const premiseMatch = text.match(/^PREMISE:\s*([\s\S]+?)(?=\n\nCAST:|\n\n|$)/m);
  const castSection = text.match(/^CAST:\n([\s\S]+?)(?=\n\n|$)/m);

  const title = titleMatch?.[1]?.trim() ?? '';
  const premise = premiseMatch?.[1]?.replace(/\n/g, ' ').trim() ?? '';
  const cast: CastMember[] = (castSection?.[1] ?? '')
    .split('\n')
    .filter((l) => l.startsWith('-'))
    .map((l) => {
      const parts = l.slice(1).trim().split(' | ');
      return {
        name: parts[0]?.trim() ?? '',
        role: parts[1]?.trim() ?? '',
        sketch: parts[2]?.trim() ?? '',
      };
    })
    .filter((c) => c.name);

  return { title, premise, cast };
}

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
  return nodes.map((n) => {
    const level = levels.get(n.id) ?? 0;
    const siblings = byLevel.get(level) ?? [n.id];
    const idx = siblings.indexOf(n.id);
    const totalH = siblings.length * NODE_H;
    // L→R layout: x encodes depth (spine), y encodes sibling spread (branching)
    return { ...n, position: { x: level * NODE_W + 80, y: idx * NODE_H - totalH / 2 + NODE_H / 2 + 400 } };
  });
}

function hydrateStory(raw: Record<string, unknown>, genre: GenreSlug): NWVStory {
  const id = `story-${Date.now()}`;
  const now = new Date().toISOString();
  const meta = (raw.metadata ?? {}) as Record<string, unknown>;
  const rawNodes = ((raw.nodes as NWVNode[]) ?? []).map((n) => ({ audio: [], lanes: [], ...n }));
  return {
    version: '1.0', id,
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
  };
}

function buildSkeletonStory(concept: Concept, genre: GenreSlug): NWVStory {
  const storyId = `story-${Date.now()}`;
  const now = new Date().toISOString();
  const n1Id = nanoid(8);
  const n2Id = nanoid(8);
  const n3Id = nanoid(8);

  const characters: NWVCharacter[] = [
    NARRATOR_DEFAULT,
    ...concept.cast.map((c, i) => ({
      id: `c${i + 1}`,
      name: c.name,
      role: c.role,
      backstory: c.sketch,
      traits: '',
      ttsProvider: 'qwen' as const,
      qwenInstruct: `Voice for ${c.name}, ${c.role}. Studio-quality recording.`,
      voiceLocked: false,
    })),
  ];

  const nodes: NWVNode[] = [
    {
      id: n1Id,
      type: 'start',
      title: 'Opening',
      location: '',
      body: '',
      blocks: [{ id: nanoid(8), type: 'prose', text: concept.premise }],
      choices: [
        { id: nanoid(8), label: 'Push forward', next: n2Id },
        { id: nanoid(8), label: 'Hold back', next: n3Id },
      ],
      status: 'draft',
      audio: [],
      lanes: [],
      position: { x: 80, y: 400 },
    },
    {
      id: n2Id,
      type: 'story',
      title: 'Path A',
      location: '',
      body: '',
      blocks: [{ id: nanoid(8), type: 'prose', text: 'Continue your story here…' }],
      choices: [],
      status: 'draft',
      audio: [],
      lanes: [],
      position: { x: 420, y: 285 },
    },
    {
      id: n3Id,
      type: 'story',
      title: 'Path B',
      location: '',
      body: '',
      blocks: [{ id: nanoid(8), type: 'prose', text: 'Continue your story here…' }],
      choices: [],
      status: 'draft',
      audio: [],
      lanes: [],
      position: { x: 420, y: 515 },
    },
  ];

  return {
    version: '1.0',
    id: storyId,
    metadata: {
      title: concept.title || 'Inspired Story',
      genre,
      logline: concept.premise,
      targetTone: '',
      createdAt: now,
      updatedAt: now,
    },
    nodes,
    characters,
    lanes: [],
    enemies: {},
  };
}

interface Props {
  onClose: () => void;
  onStoriesChanged?: () => void;
  existingTitles?: string[];
}

export function InspireModal({ onClose, onStoriesChanged, existingTitles = [] }: Props) {
  const router = useRouter();
  const anthropicKey = useSettingsStore((s) => s.anthropicKey);

  const [genre, setGenre] = useState<GenreSlug>('sci-fi');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [concept, setConcept] = useState<Concept | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickStartLoading, setQuickStartLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [worldBuilderOpen, setWorldBuilderOpen] = useState(false);
  const [pendingStoryId, setPendingStoryId] = useState<string | null>(null);

  async function generate() {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setError(null);
    setStreaming(true);
    setStreamText('');
    setConcept(null);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'inspire',
          prompt: genre,
          anthropicKey,
          context: { existingTitles },
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let full = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        setStreamText(full);
      }

      setConcept(parseConcept(full));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Generation failed.');
      }
    } finally {
      setStreaming(false);
    }
  }

  async function handleQuickStart() {
    if (!concept) return;
    setQuickStartLoading(true);
    setError(null);
    try {
      const description = `${concept.title}: ${concept.premise}`;
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'story-gen',
          prompt: description,
          anthropicKey,
          context: { genre, genreBrief: GENRE_BRIEFS[genre], cast: concept.cast },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const { story: rawText } = (await res.json()) as { story: string };
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const aiStory = hydrateStory(parsed, genre);
      // Fallback: if AI somehow generated no characters, inject concept cast
      if (aiStory.characters.length <= 1 && concept.cast.length > 0) {
        aiStory.characters.push(...concept.cast.map((c, i) => ({
          id: `c${i + 1}`,
          name: c.name,
          role: c.role,
          backstory: c.sketch,
          traits: '',
          ttsProvider: 'qwen' as const,
          qwenInstruct: `Voice for ${c.name}, ${c.role}.`,
          voiceLocked: false,
        })));
      }
      await fetch('/api/stories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(aiStory),
      });
      onStoriesChanged?.();
      router.push(`/story/${aiStory.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
      setQuickStartLoading(false);
    }
  }

  async function handleBuildWorld() {
    if (!concept) return;
    const story = buildSkeletonStory(concept, genre);
    await fetch('/api/stories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(story),
    });
    setPendingStoryId(story.id);
    setWorldBuilderOpen(true);
  }

  async function handleWriteMyself() {
    const storyId = `story-${Date.now()}`;
    const now = new Date().toISOString();
    const story: NWVStory = {
      version: '1.0',
      id: storyId,
      metadata: {
        title: concept?.title || 'Inspired Story',
        genre,
        logline: concept?.premise ?? '',
        targetTone: '',
        createdAt: now,
        updatedAt: now,
      },
      nodes: [],
      characters: [
        NARRATOR_DEFAULT,
        ...(concept?.cast ?? []).map((c, i) => ({
          id: `c${i + 1}`,
          name: c.name,
          role: c.role,
          backstory: c.sketch,
          traits: '',
          ttsProvider: 'qwen' as const,
          qwenInstruct: `Voice for ${c.name}, ${c.role}. Studio-quality recording.`,
          voiceLocked: false,
        })),
      ],
      lanes: [],
      enemies: {},
    };
    await fetch('/api/stories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(story),
    });
    onStoriesChanged?.();
    router.push(`/story/${story.id}`);
  }

  const isDone = !streaming && concept !== null;

  return (
    <>
    {worldBuilderOpen && pendingStoryId && concept && (
      <WorldBuilderModal
        concept={concept}
        genre={genre}
        storyId={pendingStoryId}
        onClose={() => { setWorldBuilderOpen(false); setPendingStoryId(null); }}
        onStoriesChanged={onStoriesChanged}
      />
    )}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">✦ Inspire Me</h2>
            <p className="text-xs text-slate-400 mt-0.5">AI sparks an idea — you shape the story</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Genre + trigger */}
          <div className="flex gap-3">
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value as GenreSlug)}
              disabled={streaming}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-500 focus:outline-none disabled:opacity-50"
            >
              {GENRES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={streaming}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {streaming ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : concept ? (
                '↻ New Idea'
              ) : (
                '✦ Inspire Me'
              )}
            </button>
          </div>

          {/* Streaming text / parsed result */}
          {(streaming || streamText) && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 h-[200px] overflow-y-auto">
              {!isDone ? (
                <p className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {streamText}
                  <span className="animate-pulse">▌</span>
                </p>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-base font-bold text-slate-900">{concept.title}</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">{concept.premise}</p>
                  {concept.cast.length > 0 && (
                    <div className="space-y-1.5 border-t border-amber-200 pt-2">
                      {concept.cast.map((c) => (
                        <div key={c.name} className="flex gap-2 text-sm">
                          <span className="font-medium text-slate-800 shrink-0">{c.name}</span>
                          <span className="text-amber-500 shrink-0">·</span>
                          <span className="text-slate-500 text-xs leading-relaxed">
                            {c.role}{c.sketch ? ` — ${c.sketch}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <p className="text-xs text-slate-400">
            {isDone
              ? `${concept.cast.length} characters · AI generates full story structure`
              : 'Pick a genre and let AI spark the idea'}
          </p>
          <div className="flex gap-2">
            {isDone ? (
              <>
                <button
                  onClick={handleWriteMyself}
                  disabled={quickStartLoading}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:border-slate-400 hover:text-slate-900 transition-colors disabled:opacity-40"
                >
                  Write It Myself
                </button>
                <button
                  onClick={handleBuildWorld}
                  disabled={quickStartLoading}
                  className="rounded-lg border border-cyan-300 px-4 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50 transition-colors disabled:opacity-40"
                >
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="6"/><ellipse cx="7" cy="7" rx="2.8" ry="6"/><line x1="1.2" y1="5" x2="12.8" y2="5"/><line x1="1.2" y1="9" x2="12.8" y2="9"/></svg> Build the World
                </button>
                <button
                  onClick={handleQuickStart}
                  disabled={quickStartLoading}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-400 transition-colors disabled:opacity-60"
                >
                  {quickStartLoading ? (
                    <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Generating…</>
                  ) : '✦ Quick Start'}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-900"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
