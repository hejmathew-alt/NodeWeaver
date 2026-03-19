'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NWVStory, NWVNode, GenreSlug } from '@nodeweaver/engine';
import { useSettingsStore } from '@/lib/settings';
import { NARRATOR_DEFAULT } from '@/store/story';
import { WorldBuilderModal } from './WorldBuilderModal';

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

const GENRE_BRIEFS: Record<GenreSlug, string> = {
  'sci-fi': 'Technical, speculative, vast scale. Cold logic vs human emotion. The universe is indifferent; characters are not.',
  fantasy: 'Mythic, lyrical, world-building heavy. Magic has rules and cost. The old world bleeds into the new.',
  horror: 'Dread over shock. Slow burn. The unknown is scarier than the known. Show the shadow, not the monster.',
  'mystery-noir': 'Sparse, cynical, every detail matters. Subtext over exposition. Everyone has a secret; most have a price.',
  'post-apocalyptic': 'Survival pragmatism. Loss of the old world. Dark hope. Beauty in the broken. Every kindness is a risk.',
  cyberpunk: 'Corporate dystopia. High tech, low life. Wit and grit. The network is the battlefield; identity is the weapon.',
  survival: 'Extreme conditions, shrinking resources. The body has limits; the will tests them. Choices are immediate — the wrong one ends everything.',
  comedy: "Timing is everything. Subvert expectations. Ground absurdity in real emotion. The best jokes land because the characters don't know they're funny.",
  romance: "Intimate, emotionally charged, tension-driven. Desire and restraint in equal measure. The unsaid word matters as much as the spoken one.",
  children: "Dark wit, preposterous adults, children who are quietly brilliant. The grotesque is funny here. Justice arrives — and it tends to be delightfully horrible for those who deserve it.",
  custom: '',
};

const PLACEHOLDERS: Record<GenreSlug, string> = {
  'sci-fi': 'A lone astronaut receives a distress signal from a colony ship that vanished 200 years ago…',
  fantasy: 'A disgraced knight is offered redemption — but only if she retrieves a cursed artefact from the ruined capital…',
  horror: 'A sound engineer rents an isolated Victorian house to record ambient audio and starts hearing voices in the recordings…',
  'mystery-noir': "A private detective is hired to find a missing heiress, but the deeper she digs the more it looks like the heiress doesn't want to be found\u2026",
  'post-apocalyptic': 'A small community guarding the last working seed vault must decide whether to share its location with a band of desperate survivors\u2026',
  cyberpunk: "A data courier discovers the package she's carrying contains the memories of someone who was supposedly never born\u2026",
  comedy: "A hapless event organiser has 24 hours to fix every disaster at a billionaire's wedding \u2014 starting with the groom being the wrong person\u2026",
  survival: 'After your plane goes down in the mountains, you wake alone in the wreckage with one working radio, dwindling supplies, and something circling the crash site\u2026',
  romance: "Two people who swore they were done feeling anything meet again at the worst possible moment\u2026",
  children: 'A girl who can read minds discovers her perfectly awful headmistress has been hiding something extraordinary \u2014 and equally horrible \u2014 in the school basement\u2026',
  custom: 'Describe your story — setting, characters, central conflict, and how it might branch…',
};

// ── BFS layout ────────────────────────────────────────────────────────────────

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

  // Unreachable nodes go one level below the deepest reachable
  const maxLevel = levels.size ? Math.max(...levels.values()) : 0;
  for (const node of nodes) {
    if (!levels.has(node.id)) levels.set(node.id, maxLevel + 1);
  }

  // Group by level
  const byLevel = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(id);
  }

  const NODE_W = 340;
  const NODE_H = 230;

  // L→R layout: x encodes depth (spine), y encodes sibling spread (branching)
  return nodes.map((n) => {
    const level = levels.get(n.id) ?? 0;
    const siblings = byLevel.get(level) ?? [n.id];
    const idx = siblings.indexOf(n.id);
    const totalH = siblings.length * NODE_H;
    return {
      ...n,
      position: {
        x: level * NODE_W + 80,
        y: idx * NODE_H - totalH / 2 + NODE_H / 2 + 400,
      },
    };
  });
}

// ── Story hydration ───────────────────────────────────────────────────────────

function hydrateStory(
  raw: Record<string, unknown>,
  genre: GenreSlug,
): NWVStory {
  const id = `story-${Date.now()}`;
  const now = new Date().toISOString();
  const meta = (raw.metadata ?? {}) as Record<string, unknown>;
  const rawNodes = ((raw.nodes as NWVNode[]) ?? []).map((n) => ({
    audio: [],
    lanes: [],
    ...n,
  }));

  return {
    version: '1.0',
    id,
    metadata: {
      title: (meta.title as string) || 'Generated Story',
      genre,
      logline: (meta.logline as string) || '',
      targetTone: (meta.targetTone as string) || '',
      createdAt: now,
      updatedAt: now,
    },
    nodes: layoutNodes(rawNodes),
    characters: [
      NARRATOR_DEFAULT,
      ...((raw.characters as NWVStory['characters']) ?? []).map((c) => ({
        ...c,
        voiceLocked: true,
      })),
    ],
    lanes: [],
    enemies: {},
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onStoriesChanged?: () => void;
}

export function QuickStartModal({ onClose, onStoriesChanged }: Props) {
  const router = useRouter();
  const anthropicKey = useSettingsStore((s) => s.anthropicKey);

  const [genre, setGenre] = useState<GenreSlug>('sci-fi');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worldBuilderOpen, setWorldBuilderOpen] = useState(false);
  const [pendingStory, setPendingStory] = useState<NWVStory | null>(null);

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'story-gen',
          prompt: description.trim(),
          anthropicKey,
          context: { genre, genreBrief: GENRE_BRIEFS[genre] },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const { story: rawText } = (await res.json()) as { story: string };

      // Strip markdown fences if Claude wrapped it
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const story = hydrateStory(parsed, genre);

      await fetch('/api/stories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(story),
      });
      setPendingStory(story);
      setWorldBuilderOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setLoading(false);
    }
  }

  if (worldBuilderOpen && pendingStory) {
    return (
      <WorldBuilderModal
        concept={{ title: pendingStory.metadata.title, premise: pendingStory.metadata.logline }}
        genre={pendingStory.metadata.genre}
        storyId={pendingStory.id}
        onClose={() => { setWorldBuilderOpen(false); router.push(`/story/${pendingStory.id}`); }}
        onStoriesChanged={onStoriesChanged}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">✨ Quick Start</h2>
            <p className="text-xs text-slate-400 mt-0.5">AI generates your story structure — you refine it</p>
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
          {/* Genre */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">Genre</label>
            <select
              value={genre}
              onChange={(e) => { setGenre(e.target.value as GenreSlug); setDescription(''); }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-500 focus:outline-none"
            >
              {GENRES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              Story description
              <span className="ml-1 font-normal text-slate-400">(optional — leave blank for a surprise)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={PLACEHOLDERS[genre]}
              rows={4}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-violet-500 focus:bg-white focus:outline-none resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <p className="text-xs text-slate-400">
            Generates 7–9 nodes · 2–4 characters · branching choices
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-900 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60 transition-colors whitespace-nowrap"
            >
              {loading ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating…
                </>
              ) : (
                '✨ Generate Story'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
