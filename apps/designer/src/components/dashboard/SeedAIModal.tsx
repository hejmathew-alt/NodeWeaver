'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import type { NWVStory, NWVNode, NWVCharacter, NWVChoice, GenreSlug, SeedBlueprint } from '@nodeweaver/engine';
import { useSettingsStore } from '@/lib/settings';
import { NARRATOR_DEFAULT } from '@/store/story';
import { TTSPlayer } from '@/lib/tts-player';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PremiseOption {
  who: string;
  wants: string;
  but: string;
  fullText: string;
}

interface SeedCharacter {
  name: string;
  role: string;
  wound: string;
  want: string;
}

interface ActDraft {
  label: string;
  emotionalBeat: string;
}

interface MomentDraft {
  title: string;
  description: string;
  position: 'early' | 'middle' | 'late';
}

type Phase = 'spark' | 'premise' | 'worldcast' | 'architecture' | 'planting';
type WorldcastTab = 'world' | 'cast';

// ── Genre list ────────────────────────────────────────────────────────────────

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
];

// ── Layout helper (same BFS layout used in InspireModal/QuickStartModal) ──────

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
  const NODE_W = 480, NODE_H = 320;
  return nodes.map((n) => {
    const level = levels.get(n.id) ?? 0;
    const siblings = byLevel.get(level) ?? [n.id];
    const idx = siblings.indexOf(n.id);
    const totalH = siblings.length * NODE_H;
    return { ...n, position: { x: level * NODE_W + 80, y: idx * NODE_H - totalH / 2 + NODE_H / 2 + 400 } };
  });
}

// ── Phase step indicator ──────────────────────────────────────────────────────

const PHASE_LABELS: Record<Exclude<Phase, 'planting'>, string> = {
  spark: 'Spark',
  premise: 'Premise',
  worldcast: 'World & Cast',
  architecture: 'Architecture',
};
const PHASE_ORDER: Exclude<Phase, 'planting'>[] = ['spark', 'premise', 'worldcast', 'architecture'];

function PhaseSteps({ current }: { current: Phase }) {
  const currentIdx = PHASE_ORDER.indexOf(current as Exclude<Phase, 'planting'>);
  return (
    <div className="flex items-center gap-2">
      {PHASE_ORDER.map((p, i) => (
        <div key={p} className="flex items-center gap-2">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
            i < currentIdx ? 'bg-emerald-500 text-white' :
            i === currentIdx ? 'bg-emerald-600 text-white' :
            'bg-slate-100 text-slate-400'
          }`}>
            {i < currentIdx ? '✓' : i + 1}
          </div>
          <span className={`text-xs font-medium ${i === currentIdx ? 'text-emerald-700' : 'text-slate-400'}`}>
            {PHASE_LABELS[p]}
          </span>
          {i < PHASE_ORDER.length - 1 && <div className="h-px w-6 bg-slate-200" />}
        </div>
      ))}
    </div>
  );
}

// ── Flat sprout icon ──────────────────────────────────────────────────────────

function SeedIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="7" y1="13" x2="7" y2="7" />
      <path d="M7 10C5 8 3 8 3 5C5 5 7 7 7 10" />
      <path d="M7 10C9 8 11 8 11 5C9 5 7 7 7 10" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onStoriesChanged?: () => void;
}

export function SeedAIModal({ onClose, onStoriesChanged }: Props) {
  const router = useRouter();
  const { anthropicKey } = useSettingsStore();

  // Phase
  const [phase, setPhase] = useState<Phase>('spark');

  // Phase 1 — Spark
  const [sparkText, setSparkText] = useState('');
  const [genre, setGenre] = useState<GenreSlug>('sci-fi');
  const [sparkReflection, setSparkReflection] = useState('');
  const [sparkLoading, setSparkLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Phase 2 — Premise (stack-based expand)
  // premiseStack[0] = original 3 options, premiseStack[N] = expanded sub-options
  const [premiseStack, setPremiseStack] = useState<PremiseOption[][]>([]);
  const [premiseAncestry, setPremiseAncestry] = useState<PremiseOption[]>([]); // selected options leading here
  const [selectedPremiseIdx, setSelectedPremiseIdx] = useState<number | null>(null);
  const [mashupMode, setMashupMode] = useState(false);
  const [mashupText, setMashupText] = useState('');
  const [premiseLoading, setPremiseLoading] = useState(false);
  const [expandingIdx, setExpandingIdx] = useState<number | null>(null); // which option is being expanded
  const [premiseLocked, setPremiseLocked] = useState(false);

  // Phase 2 — Narration
  const narratePlayerRef = useRef<TTSPlayer | null>(null);
  const [narratingIdx, setNarratingIdx] = useState<number | null>(null);

  // Phase 3 — World & Cast
  const [worldcastTab, setWorldcastTab] = useState<WorldcastTab>('world');
  const [worldFacts, setWorldFacts] = useState<string[]>([]);
  const [seedCharacters, setSeedCharacters] = useState<SeedCharacter[]>([]);
  const [worldcastLoading, setWorldcastLoading] = useState(false);

  // Phase 4 — Architecture
  const [acts, setActs] = useState<ActDraft[]>([]);
  const [moments, setMoments] = useState<MomentDraft[]>([]);
  const [archLoading, setArchLoading] = useState(false);

  // Shared
  const [error, setError] = useState<string | null>(null);

  // ── Derived premise values ────────────────────────────────────────────────

  const currentOptions = premiseStack[premiseStack.length - 1] ?? [];

  const lockedPremise = mashupMode
    ? mashupText
    : selectedPremiseIdx !== null
    ? currentOptions[selectedPremiseIdx]?.fullText ?? ''
    : '';

  // ── Phase 1: Spark ─────────────────────────────────────────────────────────

  const handleSpark = useCallback(async () => {
    if (!sparkText.trim()) { setError('Tell me something about your story idea first.'); return; }
    setError(null);
    setSparkLoading(true);
    setSparkReflection('');

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'seed-spark', prompt: sparkText, anthropicKey, context: { genre } }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error('Request failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reflection = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reflection += decoder.decode(value, { stream: true });
        setSparkReflection(reflection);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError('Could not generate reflection. Check your API key in Settings.');
      }
    } finally {
      setSparkLoading(false);
    }
  }, [sparkText, genre, anthropicKey]);

  // ── Phase 2: Premise ───────────────────────────────────────────────────────

  const fetchPremiseOptions = useCallback(async () => {
    setError(null);
    setPremiseLoading(true);
    setPremiseStack([]);
    setPremiseAncestry([]);
    setSelectedPremiseIdx(null);
    setPremiseLocked(false);
    setMashupMode(false);
    setMashupText('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'seed-premise', prompt: sparkText, anthropicKey,
          context: { genre, sparkReflection },
        }),
      });
      const data = await res.json() as { options?: PremiseOption[]; error?: string };
      if (data.error || !data.options) throw new Error(data.error ?? 'No options returned');
      setPremiseStack([data.options.slice(0, 3)]);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to generate premise options.');
    } finally {
      setPremiseLoading(false);
    }
  }, [sparkText, genre, sparkReflection, anthropicKey]);

  const handleExpandOption = useCallback(async (opt: PremiseOption, idx: number) => {
    setExpandingIdx(idx);
    setError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'seed-premise-expand', prompt: '', anthropicKey,
          context: { genre, parentPremise: opt.fullText },
        }),
      });
      const data = await res.json() as { options?: PremiseOption[]; error?: string };
      if (data.error || !data.options) throw new Error(data.error ?? 'No options returned');
      setPremiseStack((prev) => [...prev, data.options!.slice(0, 3)]);
      setPremiseAncestry((prev) => [...prev, opt]);
      setSelectedPremiseIdx(null);
      setMashupMode(false);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to expand premise.');
    } finally {
      setExpandingIdx(null);
    }
  }, [genre, anthropicKey]);

  const handlePremiseBack = useCallback(() => {
    if (premiseStack.length <= 1) return;
    setPremiseStack((prev) => prev.slice(0, -1));
    setPremiseAncestry((prev) => prev.slice(0, -1));
    setSelectedPremiseIdx(null);
    setMashupMode(false);
  }, [premiseStack.length]);

  // ── Phase 2: Narration ─────────────────────────────────────────────────────

  const handleNarrate = useCallback(async (text: string, idx: number) => {
    // Stop any playing narration
    if (narratePlayerRef.current) {
      narratePlayerRef.current.stop();
      narratePlayerRef.current = null;
      if (narratingIdx === idx) { setNarratingIdx(null); return; }
    }
    setNarratingIdx(idx);
    const player = new TTSPlayer();
    narratePlayerRef.current = player;
    try {
      await player.playLine(text, NARRATOR_DEFAULT);
    } catch {
      // ignore — playLine returns false on abort/error
    } finally {
      narratePlayerRef.current = null;
      setNarratingIdx(null);
    }
  }, [narratingIdx]);

  // ── Phase 3: World & Cast ──────────────────────────────────────────────────

  const fetchWorldcast = useCallback(async (premise: string) => {
    setError(null);
    setWorldcastLoading(true);
    setWorldFacts([]);
    setSeedCharacters([]);
    setWorldcastTab('world');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'seed-worldcast', prompt: '', anthropicKey,
          context: { genre, premise },
        }),
      });
      const data = await res.json() as { worldFacts?: string[]; characters?: SeedCharacter[]; error?: string };
      if (data.error) throw new Error(data.error);
      setWorldFacts(data.worldFacts ?? []);
      setSeedCharacters(data.characters ?? []);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to generate world and cast.');
    } finally {
      setWorldcastLoading(false);
    }
  }, [genre, anthropicKey]);

  // ── Phase 4: Architecture ──────────────────────────────────────────────────

  const fetchArchitecture = useCallback(async (premise: string) => {
    setError(null);
    setArchLoading(true);
    setActs([]);
    setMoments([]);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'seed-architecture', prompt: '', anthropicKey,
          context: { genre, premise, worldFacts, characters: seedCharacters },
        }),
      });
      const data = await res.json() as { acts?: ActDraft[]; moments?: MomentDraft[]; error?: string };
      if (data.error) throw new Error(data.error);
      const fetchedActs = data.acts ?? [];
      setActs(fetchedActs.length ? fetchedActs : [
        { label: 'The Beginning', emotionalBeat: 'tension and discovery' },
        { label: 'The Confrontation', emotionalBeat: 'escalating stakes' },
        { label: 'The Resolution', emotionalBeat: 'consequence and change' },
      ]);
      setMoments(data.moments ?? []);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to generate architecture.');
    } finally {
      setArchLoading(false);
    }
  }, [genre, worldFacts, seedCharacters, anthropicKey]);

  // ── Phase transitions ──────────────────────────────────────────────────────

  const goToPremise = useCallback(() => {
    setPhase('premise');
    fetchPremiseOptions();
  }, [fetchPremiseOptions]);

  const lockPremiseAndContinue = useCallback(() => {
    if (!lockedPremise.trim()) { setError('Select or write a premise first.'); return; }
    // Stop any playing narration
    if (narratePlayerRef.current) { narratePlayerRef.current.stop(); narratePlayerRef.current = null; }
    setNarratingIdx(null);
    setPremiseLocked(true);
    setPhase('worldcast');
    fetchWorldcast(lockedPremise);
  }, [lockedPremise, fetchWorldcast]);

  const goToArchitecture = useCallback(() => {
    if (!lockedPremise.trim()) return;
    setPhase('architecture');
    fetchArchitecture(lockedPremise);
  }, [lockedPremise, fetchArchitecture]);

  // ── Plant story ────────────────────────────────────────────────────────────

  const handlePlant = useCallback(async () => {
    setPhase('planting');
    setError(null);

    const storyId = `story-${Date.now()}`;
    const now = new Date().toISOString();
    const nodes: NWVNode[] = [];

    // START node
    const startId = nanoid();
    nodes.push({
      id: startId,
      type: 'start',
      title: 'Beginning',
      body: lockedPremise,
      blocks: [{ id: nanoid(), type: 'prose', text: lockedPremise }],
      choices: [],
      audio: [], lanes: [],
      status: 'draft',
      position: { x: 0, y: 0 },
      isRoot: true,
    });

    // Act marker nodes (story type)
    const actIds: string[] = [];
    for (const act of acts) {
      const id = nanoid();
      actIds.push(id);
      nodes.push({
        id,
        type: 'story',
        title: act.label,
        body: '',
        blocks: [{ id: nanoid(), type: 'prose', text: `[${act.emotionalBeat}]` }],
        choices: [],
        audio: [], lanes: [],
        status: 'draft',
        position: { x: 0, y: 0 },
        isRoot: true,
      });
    }

    // Jaw-drop moment nodes (twist type)
    for (const moment of moments) {
      const id = nanoid();
      const posToActIdx = { early: 0, middle: Math.floor(actIds.length / 2), late: actIds.length - 1 };
      const parentActIdx = posToActIdx[moment.position] ?? 0;
      const parentActId = actIds[parentActIdx];

      nodes.push({
        id,
        type: 'twist',
        title: moment.title,
        body: '',
        blocks: [{ id: nanoid(), type: 'prose', text: moment.description }],
        choices: [],
        audio: [], lanes: [],
        status: 'draft',
        position: { x: 0, y: 0 },
        isRoot: true,
        isHighImpact: true,
      });

      const parentNode = nodes.find((n) => n.id === parentActId);
      if (parentNode) {
        const choice: NWVChoice = { id: nanoid(), label: '⚡ ' + moment.title.slice(0, 30) };
        parentNode.choices.push(choice);
      }
    }

    // Wire: START → first act; each act → next act
    const startNode = nodes.find((n) => n.id === startId)!;
    if (actIds.length > 0) {
      startNode.choices.push({ id: nanoid(), label: 'Begin', next: actIds[0] });
    }
    for (let i = 0; i < actIds.length - 1; i++) {
      const actNode = nodes.find((n) => n.id === actIds[i])!;
      actNode.choices.push({ id: nanoid(), label: 'Continue', next: actIds[i + 1] });
    }

    const laidOut = layoutNodes(nodes);

    const characters: NWVCharacter[] = [NARRATOR_DEFAULT];
    for (const sc of seedCharacters) {
      characters.push({
        id: nanoid(),
        name: sc.name,
        role: sc.role,
        backstory: `Wound: ${sc.wound}\n\nWant: ${sc.want}`,
        traits: '',
        ttsProvider: 'qwen',
      });
    }

    const seedBlueprint: SeedBlueprint = {
      premise: lockedPremise,
      worldFacts,
      seedCharacters,
      acts,
      jawDropMoments: moments,
    };

    const story: NWVStory = {
      version: '1.0',
      id: storyId,
      metadata: {
        title: acts[0]?.label ? `${genre.charAt(0).toUpperCase()}${genre.slice(1)} Story` : 'Seeded Story',
        genre,
        logline: lockedPremise,
        targetTone: acts[0]?.emotionalBeat ?? '',
        createdAt: now,
        updatedAt: now,
      },
      nodes: laidOut,
      characters,
      lanes: [],
      enemies: {},
      world: { locations: [], factions: [], rules: worldFacts, lore: [] },
      seedBlueprint,
    };

    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(story),
      });
      if (!res.ok) throw new Error('Failed to save story.');
      onStoriesChanged?.();
      router.push(`/story/${storyId}`);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
      else setError('Failed to plant story.');
      setPhase('architecture');
    }
  }, [lockedPremise, acts, moments, seedCharacters, worldFacts, genre, router, onStoriesChanged]);

  // ── Render helpers ─────────────────────────────────────────────────────────

  function Spinner() {
    return (
      <svg className="h-4 w-4 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
        <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  function PlayIcon({ playing }: { playing: boolean }) {
    if (playing) {
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <rect x="1" y="1" width="3" height="8" rx="0.5" />
          <rect x="6" y="1" width="3" height="8" rx="0.5" />
        </svg>
      );
    }
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M2 1.5L9 5L2 8.5V1.5Z" />
      </svg>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <SeedIcon size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Seed AI</h2>
              <p className="text-[11px] text-slate-400">Grow a story from a single idea</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Phase steps */}
        {phase !== 'planting' && (
          <div className="border-b border-slate-100 px-6 py-3">
            <PhaseSteps current={phase} />
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Planting state */}
        {phase === 'planting' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <SeedIcon size={28} />
            </div>
            <p className="text-slate-600 font-medium">Planting your story…</p>
            <p className="text-sm text-slate-400">Growing nodes from the blueprint</p>
          </div>
        )}

        {/* Phase 1 — Spark */}
        {phase === 'spark' && (
          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-5">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-slate-700">What&apos;s your story idea?</h3>
              <p className="mb-3 text-xs text-slate-400">
                Anything works — a vibe, a scene, a character, a reference. Don&apos;t overthink it.
              </p>
              <textarea
                autoFocus
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                rows={5}
                placeholder="e.g. 'A detective who can only remember things backwards' or 'Something claustrophobic set in a lighthouse' or 'Like The Road but with more hope'"
                value={sparkText}
                onChange={(e) => setSparkText(e.target.value)}
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Genre</h3>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGenre(g.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      genre === g.value
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border border-transparent hover:bg-slate-200'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {sparkLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Spinner /> Feeling the idea…
              </div>
            )}

            {sparkReflection && !sparkLoading && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-medium text-emerald-600 mb-1">Seed AI sees:</p>
                <p className="text-sm text-emerald-900 italic">{sparkReflection}</p>
              </div>
            )}
          </div>
        )}

        {/* Phase 2 — Premise */}
        {phase === 'premise' && (
          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-4">

            {/* Breadcrumb when drilling down */}
            {premiseAncestry.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <button
                  onClick={handlePremiseBack}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  ← Back
                </button>
                <span className="text-slate-300 text-xs">|</span>
                <span className="text-xs text-slate-500 truncate">
                  Expanding: <em className="text-slate-700">{premiseAncestry[premiseAncestry.length - 1].fullText}</em>
                </span>
              </div>
            )}

            <div>
              <h3 className="mb-1 text-sm font-semibold text-slate-700">
                {premiseAncestry.length > 0 ? 'Expanded options' : 'Choose your premise'}
              </h3>
              <p className="text-xs text-slate-400">
                {premiseAncestry.length > 0
                  ? 'Three variations of the selected premise. Pick one, expand further, or go back.'
                  : 'Three dramatically distinct directions. Pick one, expand, or write a mashup.'}
              </p>
            </div>

            {premiseLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Spinner /> Generating premise options…
              </div>
            )}

            {!premiseLoading && currentOptions.map((opt, i) => (
              <div
                key={i}
                className={`relative rounded-xl border p-4 transition ${
                  selectedPremiseIdx === i && !mashupMode
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                } ${premiseLocked ? 'opacity-70' : ''}`}
              >
                {/* Top-right actions */}
                {!premiseLocked && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    {/* Narrate button */}
                    <button
                      onClick={() => handleNarrate(opt.fullText, i)}
                      title="Narrate this premise"
                      className={`flex items-center justify-center rounded-md px-2 py-1 text-[10px] font-medium transition gap-1 ${
                        narratingIdx === i
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600'
                      }`}
                    >
                      <PlayIcon playing={narratingIdx === i} />
                    </button>
                    {/* Expand button */}
                    <button
                      onClick={() => handleExpandOption(opt, i)}
                      disabled={expandingIdx !== null}
                      title="Expand this premise into variations"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40 transition"
                    >
                      {expandingIdx === i ? <Spinner /> : (
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M5 1v8M1 5h8" />
                        </svg>
                      )}
                      Expand
                    </button>
                  </div>
                )}

                {/* Option content — click to select, textarea to edit */}
                <div
                  className="block w-full pr-24 cursor-pointer"
                  onClick={() => { if (!premiseLocked) { setSelectedPremiseIdx(i); setMashupMode(false); } }}
                >
                  <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide font-medium">Option {i + 1}</p>
                </div>
                <textarea
                  className={`w-full resize-none rounded-lg border px-2 py-1.5 text-sm text-slate-800 focus:outline-none mb-2 pr-24 ${
                    selectedPremiseIdx === i && !mashupMode
                      ? 'border-emerald-300 bg-emerald-50/50 focus:border-emerald-400'
                      : 'border-slate-100 bg-transparent focus:border-slate-300'
                  }`}
                  rows={4}
                  value={opt.fullText}
                  disabled={premiseLocked}
                  onClick={(e) => { e.stopPropagation(); if (!premiseLocked) { setSelectedPremiseIdx(i); setMashupMode(false); } }}
                  onChange={(e) => {
                    const updated = [...currentOptions];
                    updated[i] = { ...updated[i], fullText: e.target.value };
                    setPremiseStack((prev) => [...prev.slice(0, -1), updated]);
                  }}
                />
                <div className="flex gap-4 text-[10px] text-slate-400">
                  <span><strong>Who:</strong> {opt.who}</span>
                  <span><strong>Wants:</strong> {opt.wants}</span>
                  <span><strong>But:</strong> {opt.but}</span>
                </div>
              </div>
            ))}

            {!premiseLoading && currentOptions.length > 0 && !premiseLocked && (
              <div>
                <button
                  onClick={() => { setMashupMode(!mashupMode); setSelectedPremiseIdx(null); }}
                  className="text-xs text-slate-500 underline hover:text-slate-700"
                >
                  {mashupMode ? '← Back to options' : 'Combine elements into a mashup'}
                </button>
                {mashupMode && (
                  <textarea
                    autoFocus
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none"
                    rows={3}
                    placeholder="Write your own premise combining what you liked…"
                    value={mashupText}
                    onChange={(e) => setMashupText(e.target.value)}
                  />
                )}
              </div>
            )}

            {!premiseLoading && currentOptions.length > 0 && !premiseLocked && premiseAncestry.length === 0 && (
              <button
                onClick={fetchPremiseOptions}
                className="self-start text-xs text-slate-400 underline hover:text-slate-600"
              >
                ↺ Regenerate all
              </button>
            )}

            {premiseLocked && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 mb-1">Locked premise</p>
                <p className="text-sm text-emerald-900">{lockedPremise}</p>
              </div>
            )}
          </div>
        )}

        {/* Phase 3 — World & Cast (tabbed) */}
        {phase === 'worldcast' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-slate-100 px-6 pt-4 gap-0">
              {(['world', 'cast'] as WorldcastTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setWorldcastTab(tab)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
                    worldcastTab === tab
                      ? 'border-emerald-500 text-emerald-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab === 'world' ? 'World' : 'Cast'}
                  {tab === 'cast' && seedCharacters.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      {seedCharacters.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* World tab */}
            {worldcastTab === 'world' && (
              <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-3">
                <p className="text-xs text-slate-400">Specific, concrete truths about this world — rules, textures, what people fear.</p>
                {worldcastLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Spinner /> Building the world…
                  </div>
                )}
                {!worldcastLoading && worldFacts.map((fact, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <textarea
                      className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-emerald-400 focus:outline-none"
                      rows={2}
                      value={fact}
                      onChange={(e) => {
                        const updated = [...worldFacts];
                        updated[i] = e.target.value;
                        setWorldFacts(updated);
                      }}
                    />
                    <button
                      onClick={() => setWorldFacts(worldFacts.filter((_, j) => j !== i))}
                      className="mt-2 text-slate-300 hover:text-red-400 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {!worldcastLoading && (
                  <button
                    onClick={() => setWorldFacts([...worldFacts, ''])}
                    className="self-start text-[11px] text-emerald-600 hover:text-emerald-800 underline"
                  >
                    + Add fact
                  </button>
                )}
              </div>
            )}

            {/* Cast tab */}
            {worldcastTab === 'cast' && (
              <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-4">
                <p className="text-xs text-slate-400">The characters who will drive your story — their wounds and wants create dramatic tension.</p>
                {worldcastLoading && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Spinner /> Assembling the cast…
                  </div>
                )}
                {!worldcastLoading && (
                  <div className="grid grid-cols-2 gap-3">
                    {seedCharacters.map((char, i) => (
                      <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                        {/* Header row — avatar initial + name + delete */}
                        <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-100">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold shrink-0">
                            {char.name ? char.name[0].toUpperCase() : '?'}
                          </div>
                          <input
                            className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-slate-900 placeholder-slate-300 focus:outline-none"
                            placeholder="Name…"
                            value={char.name}
                            onChange={(e) => {
                              const u = [...seedCharacters];
                              u[i] = { ...u[i], name: e.target.value };
                              setSeedCharacters(u);
                            }}
                          />
                          <button
                            onClick={() => setSeedCharacters(seedCharacters.filter((_, j) => j !== i))}
                            className="text-slate-300 hover:text-red-400 text-xs shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                        {/* Role */}
                        <div className="px-3 py-2 border-b border-slate-100">
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Role</label>
                          <textarea
                            className="w-full resize-none rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-800 placeholder-slate-300 focus:border-emerald-400 focus:outline-none"
                            rows={3}
                            placeholder="Who are they and what haunts them…"
                            value={char.role}
                            onChange={(e) => {
                              const u = [...seedCharacters];
                              u[i] = { ...u[i], role: e.target.value };
                              setSeedCharacters(u);
                            }}
                          />
                        </div>
                        {/* Wound */}
                        <div className="px-3 py-2 border-b border-slate-100">
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Wound</label>
                          <textarea
                            className="w-full resize-none rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-800 placeholder-slate-300 focus:border-emerald-400 focus:outline-none"
                            rows={2}
                            placeholder="Core damage or flaw…"
                            value={char.wound}
                            onChange={(e) => {
                              const u = [...seedCharacters];
                              u[i] = { ...u[i], wound: e.target.value };
                              setSeedCharacters(u);
                            }}
                          />
                        </div>
                        {/* Want */}
                        <div className="px-3 py-2">
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Want</label>
                          <textarea
                            className="w-full resize-none rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-800 placeholder-slate-300 focus:border-emerald-400 focus:outline-none"
                            rows={2}
                            placeholder="What they are pursuing…"
                            value={char.want}
                            onChange={(e) => {
                              const u = [...seedCharacters];
                              u[i] = { ...u[i], want: e.target.value };
                              setSeedCharacters(u);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!worldcastLoading && (
                  <button
                    onClick={() => setSeedCharacters([...seedCharacters, { name: '', role: '', wound: '', want: '' }])}
                    className="self-start text-[11px] text-emerald-600 hover:text-emerald-800 underline"
                  >
                    + Add character
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Phase 4 — Architecture */}
        {phase === 'architecture' && (
          <div className="flex flex-1 overflow-hidden">
            {/* Acts column */}
            <div className="flex flex-1 flex-col overflow-y-auto border-r border-slate-100 px-6 py-5 gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Act Structure</h3>
                <p className="text-xs text-slate-400 mt-0.5">The dramatic phases of your story. Edit labels and emotional beats.</p>
              </div>
              {archLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Spinner /> Laying out the acts…
                </div>
              )}
              {!archLoading && acts.map((act, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Act {i + 1}</span>
                    <button
                      onClick={() => setActs(acts.filter((_, j) => j !== i))}
                      className="ml-auto text-slate-200 hover:text-red-400 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-emerald-400 focus:outline-none"
                    placeholder="Act label"
                    value={act.label}
                    onChange={(e) => {
                      const u = [...acts];
                      u[i] = { ...u[i], label: e.target.value };
                      setActs(u);
                    }}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-100 bg-white px-3 py-1.5 text-xs text-slate-500 italic focus:border-emerald-400 focus:outline-none"
                    placeholder="Emotional beat"
                    value={act.emotionalBeat}
                    onChange={(e) => {
                      const u = [...acts];
                      u[i] = { ...u[i], emotionalBeat: e.target.value };
                      setActs(u);
                    }}
                  />
                </div>
              ))}
              {!archLoading && (
                <button
                  onClick={() => setActs([...acts, { label: '', emotionalBeat: '' }])}
                  className="self-start text-[11px] text-emerald-600 hover:text-emerald-800 underline"
                >
                  + Add act
                </button>
              )}
            </div>

            {/* Jaw-drop moments column */}
            <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-700">Jaw-Drop Moments</h3>
                <p className="text-xs text-slate-400 mt-0.5">The surprises and revelations that will move your reader.</p>
              </div>
              {archLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Spinner /> Planting surprises…
                </div>
              )}
              {!archLoading && moments.map((moment, i) => (
                <div key={i} className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500 text-sm">⚡</span>
                    <button
                      onClick={() => {
                        const positions: MomentDraft['position'][] = ['early', 'middle', 'late'];
                        const next = positions[(positions.indexOf(moment.position) + 1) % 3];
                        const u = [...moments];
                        u[i] = { ...u[i], position: next };
                        setMoments(u);
                      }}
                      className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                        moment.position === 'early' ? 'bg-sky-100 text-sky-600' :
                        moment.position === 'middle' ? 'bg-amber-100 text-amber-600' :
                        'bg-red-100 text-red-600'
                      }`}
                    >
                      {moment.position} ↻
                    </button>
                    <button
                      onClick={() => setMoments(moments.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-red-400 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:border-amber-400 focus:outline-none"
                    placeholder="Moment title"
                    value={moment.title}
                    onChange={(e) => {
                      const u = [...moments];
                      u[i] = { ...u[i], title: e.target.value };
                      setMoments(u);
                    }}
                  />
                  <textarea
                    className="w-full resize-none rounded-lg border border-amber-100 bg-white px-3 py-2 text-xs text-slate-600 focus:border-amber-300 focus:outline-none"
                    rows={2}
                    placeholder="What happens here?"
                    value={moment.description}
                    onChange={(e) => {
                      const u = [...moments];
                      u[i] = { ...u[i], description: e.target.value };
                      setMoments(u);
                    }}
                  />
                </div>
              ))}
              {!archLoading && (
                <button
                  onClick={() => setMoments([...moments, { title: '', description: '', position: 'middle' }])}
                  className="self-start text-[11px] text-amber-600 hover:text-amber-800 underline"
                >
                  + Add moment
                </button>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {phase !== 'planting' && (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <button
              onClick={onClose}
              className="text-sm text-slate-400 hover:text-slate-600 transition"
            >
              Cancel
            </button>

            <div className="flex items-center gap-3">
              {/* Phase 1 footer */}
              {phase === 'spark' && (
                <>
                  <button
                    onClick={handleSpark}
                    disabled={sparkLoading || !sparkText.trim()}
                    className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition"
                  >
                    {sparkLoading ? <Spinner /> : '✦'}
                    {sparkLoading ? 'Reflecting…' : 'Reflect'}
                  </button>
                  <button
                    onClick={goToPremise}
                    disabled={!sparkText.trim()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition"
                  >
                    {sparkReflection ? 'Continue →' : 'Skip reflection →'}
                  </button>
                </>
              )}

              {/* Phase 2 footer */}
              {phase === 'premise' && (
                <>
                  {!premiseLocked && (
                    <button
                      onClick={() => setPhase('spark')}
                      className="text-sm text-slate-400 hover:text-slate-600"
                    >
                      ← Back
                    </button>
                  )}
                  <button
                    onClick={lockPremiseAndContinue}
                    disabled={premiseLoading || (!lockedPremise.trim())}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition"
                  >
                    {premiseLocked ? 'Building world…' : 'Lock premise & continue →'}
                  </button>
                </>
              )}

              {/* Phase 3 footer */}
              {phase === 'worldcast' && (
                <>
                  <button
                    onClick={() => { setPremiseLocked(false); setPhase('premise'); }}
                    className="text-sm text-slate-400 hover:text-slate-600"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={goToArchitecture}
                    disabled={worldcastLoading}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition"
                  >
                    Continue →
                  </button>
                </>
              )}

              {/* Phase 4 footer */}
              {phase === 'architecture' && (
                <>
                  <button
                    onClick={() => setPhase('worldcast')}
                    className="text-sm text-slate-400 hover:text-slate-600"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handlePlant}
                    disabled={archLoading || acts.length === 0}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition"
                  >
                    <SeedIcon size={13} />
                    Plant Story
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
