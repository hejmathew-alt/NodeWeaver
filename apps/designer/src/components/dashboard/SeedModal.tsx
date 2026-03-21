'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import type { NWVStory, NWVNode, NWVCharacter, NWVChoice, GenreSlug, SeedBlueprint } from '@nodeweaver/engine';
import { useSettingsStore } from '@/lib/settings';
import { NARRATOR_DEFAULT } from '@/store/story';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Set on assistant messages when a phase transition was detected */
  transitionPhase?: 'premise' | 'cast' | 'architecture';
}

interface Premise {
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

type SeedTab = 'conversation' | 'premise' | 'cast' | 'architecture';
type TabStatus = 'empty' | 'filling' | 'ready';

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

// ── Layout helper (same BFS layout used elsewhere) ──────────────────────────

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

// ── Icons ─────────────────────────────────────────────────────────────────────

function SeedIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="7" y1="13" x2="7" y2="7" />
      <path d="M7 10C5 8 3 8 3 5C5 5 7 7 7 10" />
      <path d="M7 10C9 8 11 8 11 5C9 5 7 7 7 10" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Message parser — extracts [CHIPS: ...] and [PHASE:X] from assistant text ─

function parseAssistantMessage(text: string): { text: string; chips: string[]; phase: 'premise' | 'cast' | 'architecture' | null } {
  let cleaned = text;
  let phase: 'premise' | 'cast' | 'architecture' | null = null;

  // Extract phase marker
  const phaseMatch = /\[PHASE:(premise|cast|architecture)\]/i.exec(cleaned);
  if (phaseMatch) {
    phase = phaseMatch[1].toLowerCase() as 'premise' | 'cast' | 'architecture';
    cleaned = cleaned.replace(phaseMatch[0], '').trim();
  }

  // Extract chips
  const chipMatch = /\[CHIPS:\s*([\s\S]*?)\]/.exec(cleaned);
  let chips: string[] = [];
  if (chipMatch) {
    cleaned = cleaned.replace(chipMatch[0], '').trim();
    chips = chipMatch[1]
      .split(',')
      .map(c => c.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  return { text: cleaned, chips, phase };
}

// ── Transition card chips per phase ──────────────────────────────────────────

function getTransitionCard(phase: 'premise' | 'cast' | 'architecture'): { message: string; chips: string[] } {
  switch (phase) {
    case 'premise':
      return {
        message: 'Your premise is taking shape.',
        chips: ["Let's talk about characters", "Let's plan the structure", 'I want to keep refining this'],
      };
    case 'cast':
      return {
        message: 'Your characters are coming together.',
        chips: ["Let's plan the story structure", 'I want to add another character', 'Keep talking'],
      };
    case 'architecture':
      return {
        message: 'The shape of your story is forming.',
        chips: ["I'm happy with this", 'Let me refine something', 'Tell me what you think'],
      };
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onStoriesChanged?: () => void;
}

export function SeedModal({ onClose, onStoriesChanged }: Props) {
  const router = useRouter();
  const { anthropicKey } = useSettingsStore();

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SeedTab>('conversation');

  // ── Conversation state ──────────────────────────────────────────────────────
  const [chatPhase, setChatPhase] = useState<'spark' | 'premise' | 'cast' | 'architecture'>('spark');
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [genre, setGenre] = useState<GenreSlug>('sci-fi');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Structured data (populated by background generation) ────────────────────
  const [premise, setPremise] = useState<Premise | null>(null);
  const [seedCharacters, setSeedCharacters] = useState<SeedCharacter[]>([]);
  const [worldFacts, setWorldFacts] = useState<string[]>([]);
  const [acts, setActs] = useState<ActDraft[]>([]);
  const [moments, setMoments] = useState<MomentDraft[]>([]);

  // ── Tab status ──────────────────────────────────────────────────────────────
  const [tabStatus, setTabStatus] = useState<Record<'premise' | 'cast' | 'architecture', TabStatus>>({
    premise: 'empty',
    cast: 'empty',
    architecture: 'empty',
  });

  // ── Planting state ──────────────────────────────────────────────────────────
  const [planting, setPlanting] = useState(false);

  // ── Error ───────────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);

  // ── Auto-scroll chat ────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, streaming]);

  // ── Conversation summary for structured generation ──────────────────────────
  const getConversationSummary = useCallback(() => {
    return history
      .map(m => `${m.role === 'user' ? 'Writer' : 'Seed'}: ${m.content}`)
      .join('\n');
  }, [history]);

  // ── Background generation ─────────────────────────────────────────────────

  const triggerBackgroundGeneration = useCallback(async (phase: 'premise' | 'cast' | 'architecture') => {
    setTabStatus(prev => ({ ...prev, [phase]: 'filling' }));

    const lockedState = {
      premise: premise?.fullText ?? null,
      characters: seedCharacters,
      worldFacts,
      genre,
    };

    const type = phase === 'premise' ? 'premise' : phase;
    const conversationSummary = getConversationSummary();

    try {
      const res = await fetch('/api/seed-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          conversationSummary,
          lockedState: lockedState,
          anthropicKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      switch (phase) {
        case 'premise':
          if (data.premise) {
            setPremise(data.premise);
          }
          break;
        case 'cast':
          if (data.characters) {
            setSeedCharacters(data.characters);
          }
          break;
        case 'architecture': {
          const fetchedActs = data.acts ?? [];
          setActs(fetchedActs.length ? fetchedActs : [
            { label: 'The Beginning', emotionalBeat: 'tension and discovery' },
            { label: 'The Confrontation', emotionalBeat: 'escalating stakes' },
            { label: 'The Resolution', emotionalBeat: 'consequence and change' },
          ]);
          setMoments(data.moments ?? []);
          break;
        }
      }

      setTabStatus(prev => ({ ...prev, [phase]: 'ready' }));
    } catch (err) {
      console.error(`[seed] Background generation failed for ${phase}:`, err instanceof Error ? err.message : err);
      setTabStatus(prev => ({ ...prev, [phase]: prev[phase] === 'filling' ? 'empty' : prev[phase] }));
      setHistory(prev => [...prev, {
        role: 'assistant' as const,
        content: `I had trouble generating the ${phase} — but keep talking, I'll try again when we have more to work with.`,
      }]);
    }
  }, [premise, seedCharacters, worldFacts, genre, getConversationSummary, anthropicKey]);

  // ── Send chat message ───────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;
    setError(null);
    setInputText('');

    const userMsg: ChatMessage = { role: 'user', content: text.trim() };
    setHistory(prev => [...prev, userMsg]);
    setStreaming(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/seed-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phase: chatPhase,
          history: [...history, userMsg].map(({ role, content }) => ({ role, content })),
          locked: {
            premise: premise?.fullText ?? null,
            characters: seedCharacters,
            worldFacts,
            genre,
          },
          message: text.trim(),
          anthropicKey,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((err as { error?: string }).error ?? 'Request failed');
      }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      // Add placeholder assistant message
      setHistory(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setHistory(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: assistantText };
          return updated;
        });
      }

      // ── Post-stream: detect phase marker and trigger background generation ──
      const { phase: detectedPhase } = parseAssistantMessage(assistantText);
      if (detectedPhase) {
        // Tag the last assistant message with the transition phase
        setHistory(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, transitionPhase: detectedPhase };
          }
          return updated;
        });

        // Advance chat phase
        const phaseOrder = ['spark', 'premise', 'cast', 'architecture'] as const;
        const nextPhaseIdx = phaseOrder.indexOf(detectedPhase);
        if (nextPhaseIdx >= 0) {
          setChatPhase(phaseOrder[Math.min(nextPhaseIdx, phaseOrder.length - 1)]);
        }

        // Fire background generation (non-blocking)
        triggerBackgroundGeneration(detectedPhase);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Failed to get response.';
        setError(msg);
        // Remove the empty assistant placeholder
        setHistory(prev => {
          if (prev[prev.length - 1]?.role === 'assistant' && !prev[prev.length - 1].content) {
            return prev.slice(0, -1);
          }
          return prev;
        });
      }
    } finally {
      setStreaming(false);
    }
  }, [streaming, chatPhase, history, premise, seedCharacters, worldFacts, genre, anthropicKey, triggerBackgroundGeneration]);

  // ── Plant story ─────────────────────────────────────────────────────────────

  const handlePlant = useCallback(async () => {
    setPlanting(true);
    setError(null);

    const lockedPremise = premise?.fullText ?? '';
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
        const choice: NWVChoice = {
          id: nanoid(),
          label: '\u26A1 ' + moment.title.slice(0, 30),
          next: id,
          sourceHandle: 'bottom',
          targetHandle: 'top',
        };
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

    // Reposition jaw-drop nodes ~120px below their parent act node
    for (const node of laidOut) {
      if (!node.isHighImpact) continue;
      const parent = laidOut.find(p => p.choices.some(c => c.next === node.id));
      if (parent) {
        node.position = { x: parent.position.x, y: parent.position.y + 120 };
      }
    }

    const characters: NWVCharacter[] = [NARRATOR_DEFAULT];
    for (const sc of seedCharacters) {
      characters.push({
        id: nanoid(),
        name: sc.name,
        role: sc.role,
        backstory: sc.wound || sc.want ? `${sc.wound ? `Wound: ${sc.wound}` : ''}${sc.wound && sc.want ? '\n\n' : ''}${sc.want ? `Want: ${sc.want}` : ''}` : '',
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
      const msg = err instanceof Error ? err.message : 'Failed to plant story.';
      setError(msg);
      setPlanting(false);
    }
  }, [premise, acts, moments, seedCharacters, worldFacts, genre, router, onStoriesChanged]);

  // ── Tab dot class ─────────────────────────────────────────────────────────

  function tabDotClass(tab: 'premise' | 'cast' | 'architecture'): string {
    const status = tabStatus[tab];
    switch (status) {
      case 'empty': return 'bg-slate-300';
      case 'filling': return 'bg-emerald-300 animate-pulse';
      case 'ready': return 'bg-emerald-500';
    }
  }

  // ── Can plant? ──────────────────────────────────────────────────────────────

  const canPlant = tabStatus.premise === 'ready' && tabStatus.cast === 'ready' && tabStatus.architecture === 'ready';

  // ── Render ──────────────────────────────────────────────────────────────────

  if (planting) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="relative flex h-[90vh] w-full max-w-4xl flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <SeedIcon size={28} />
          </div>
          <p className="mt-4 text-slate-600 font-medium">Planting your story&hellip;</p>
          <p className="mt-1 text-sm text-slate-400">Growing nodes from the blueprint</p>
        </div>
      </div>
    );
  }

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
              <h2 className="text-base font-semibold text-slate-900">Seed</h2>
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

        {/* Tab bar */}
        <div className="flex border-b border-slate-100 px-6 pt-0 gap-0">
          {(['conversation', 'premise', 'cast', 'architecture'] as SeedTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                activeTab === tab
                  ? 'border-emerald-500 text-emerald-700'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab !== 'conversation' && (
                <span className={`inline-block h-2 w-2 rounded-full ${
                  activeTab === tab ? 'bg-emerald-500' : tabDotClass(tab as 'premise' | 'cast' | 'architecture')
                }`} />
              )}
              {tab === 'conversation' ? 'Conversation' :
               tab === 'premise' ? 'Premise' :
               tab === 'cast' ? 'Cast' :
               'Architecture'}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* ── Conversation tab ───────────────────────────────────────────────── */}
        {activeTab === 'conversation' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Genre picker (always visible at top) */}
            <div className="border-b border-slate-100 px-6 py-3">
              <div className="flex flex-wrap gap-1.5">
                {GENRES.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGenre(g.value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                      genre === g.value
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                        : 'bg-slate-50 text-slate-500 border border-transparent hover:bg-slate-100'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {history.length === 0 && !streaming && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                    <SeedIcon size={22} />
                  </div>
                  <p className="text-sm text-slate-500 max-w-sm">
                    Tell me about your story idea. A vibe, a scene, a character, a reference &mdash; anything goes.
                  </p>
                </div>
              )}

              {history.map((msg, i) => {
                const isUser = msg.role === 'user';
                const parsed = isUser
                  ? { text: msg.content, chips: [], phase: null }
                  : parseAssistantMessage(msg.content);
                return (
                  <div key={i}>
                    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] ${isUser ? 'order-1' : 'order-0'}`}>
                        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          isUser
                            ? 'bg-emerald-600 text-white rounded-br-md'
                            : 'bg-slate-100 text-slate-800 rounded-bl-md'
                        }`}>
                          {parsed.text}
                          {streaming && i === history.length - 1 && !isUser && (
                            <span className="animate-pulse ml-0.5">▌</span>
                          )}
                        </div>
                        {/* Suggestion chips */}
                        {parsed.chips.length > 0 && !isUser && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {parsed.chips.map((chip, ci) => (
                              <button
                                key={ci}
                                onClick={() => sendMessage(chip)}
                                className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Transition card */}
                    {msg.transitionPhase && !isUser && (
                      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                        <p className="text-xs font-medium text-emerald-700 mb-2">
                          {getTransitionCard(msg.transitionPhase).message}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {getTransitionCard(msg.transitionPhase).chips.map((chip, ci) => (
                            <button
                              key={ci}
                              onClick={() => sendMessage(chip)}
                              className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div className="border-t border-slate-100 px-6 py-3">
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(inputText);
                    }
                  }}
                  placeholder={
                    chatPhase === 'spark' ? 'Describe your story idea\u2026' :
                    chatPhase === 'premise' ? 'Refine your premise\u2026' :
                    chatPhase === 'cast' ? 'Develop your characters\u2026' :
                    'Shape the story structure\u2026'
                  }
                  disabled={streaming}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                />
                <button
                  onClick={() => sendMessage(inputText)}
                  disabled={streaming || !inputText.trim()}
                  className="flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition"
                >
                  {streaming ? <Spinner /> : '\u2192'}
                </button>
              </div>

              {/* Locked state indicators */}
              <div className="flex items-center gap-2 mt-2">
                {tabStatus.premise === 'ready' && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    Premise captured
                  </span>
                )}
                {tabStatus.cast === 'ready' && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    {seedCharacters.length} characters
                  </span>
                )}
                {tabStatus.architecture === 'ready' && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                    Architecture set
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Premise tab (read-only) ──────────────────────────────────────────── */}
        {activeTab === 'premise' && (
          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-4">
            {tabStatus.premise === 'filling' && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Spinner /> Crystallising your premise&hellip;
              </div>
            )}

            {tabStatus.premise === 'empty' && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                <p className="text-sm text-slate-400">Keep talking &mdash; your premise will appear here as Seed captures it.</p>
                <button
                  onClick={() => setActiveTab('conversation')}
                  className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                >
                  &larr; Back to conversation
                </button>
              </div>
            )}

            {tabStatus.premise === 'ready' && premise && (
              <>
                <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-5">
                  <p className="text-sm text-slate-800 leading-relaxed font-medium">{premise.fullText}</p>
                  <div className="flex gap-4 mt-3 text-[11px] text-slate-500">
                    <span><strong className="text-slate-600">Who:</strong> {premise.who}</span>
                    <span><strong className="text-slate-600">Wants:</strong> {premise.wants}</span>
                    <span><strong className="text-slate-600">But:</strong> {premise.but}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 italic">Want to change this? Just say so in the conversation.</p>
              </>
            )}
          </div>
        )}

        {/* ── Cast tab (read-only) ─────────────────────────────────────────────── */}
        {activeTab === 'cast' && (
          <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-4">
            {tabStatus.cast === 'filling' && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Spinner /> Assembling the cast&hellip;
              </div>
            )}

            {tabStatus.cast === 'empty' && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                <p className="text-sm text-slate-400">Keep talking &mdash; your characters will appear here as Seed captures them.</p>
                <button
                  onClick={() => setActiveTab('conversation')}
                  className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                >
                  &larr; Back to conversation
                </button>
              </div>
            )}

            {tabStatus.cast === 'ready' && seedCharacters.length > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {seedCharacters.map((char, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold shrink-0">
                          {char.name ? char.name[0].toUpperCase() : '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{char.name || 'Unnamed'}</p>
                          <p className="text-xs text-slate-500">{char.role || 'No role'}</p>
                        </div>
                      </div>
                      {char.wound && (
                        <p className="text-xs text-slate-500 mt-1"><strong className="text-slate-600">Wound:</strong> {char.wound}</p>
                      )}
                      {char.want && (
                        <p className="text-xs text-slate-500 mt-1"><strong className="text-slate-600">Want:</strong> {char.want}</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 italic">Want to change this? Just say so in the conversation.</p>
              </>
            )}
          </div>
        )}

        {/* ── Architecture tab (read-only) ─────────────────────────────────────── */}
        {activeTab === 'architecture' && (
          <div className="flex flex-1 overflow-hidden">
            {tabStatus.architecture === 'filling' && (
              <div className="flex items-center justify-center flex-1 gap-2 text-xs text-slate-400">
                <Spinner /> Laying out the architecture&hellip;
              </div>
            )}

            {tabStatus.architecture === 'empty' && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
                <p className="text-sm text-slate-400">Keep talking &mdash; your story&apos;s structure will appear here as it takes shape.</p>
                <button
                  onClick={() => setActiveTab('conversation')}
                  className="text-xs text-emerald-600 hover:text-emerald-800 underline"
                >
                  &larr; Back to conversation
                </button>
              </div>
            )}

            {tabStatus.architecture === 'ready' && (
              <>
                {/* Acts column */}
                <div className="flex flex-1 flex-col overflow-y-auto border-r border-slate-100 px-6 py-5 gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Acts</h3>
                    <p className="text-xs text-slate-400 mt-0.5">The emotional shape of your story.</p>
                  </div>
                  {acts.map((act, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        {i === 0 ? 'Early' : i === acts.length - 1 ? 'Late' : 'Middle'}
                      </span>
                      <p className="text-sm font-semibold text-slate-800 mt-1">{act.label}</p>
                      <p className="text-xs text-slate-500 italic mt-0.5">{act.emotionalBeat}</p>
                    </div>
                  ))}
                </div>

                {/* Jaw-drop moments column */}
                <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5 gap-3">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jaw-Drop Moments</h3>
                    <p className="text-xs text-slate-400 mt-0.5">The surprises that will move your reader.</p>
                  </div>
                  {moments.map((moment, i) => (
                    <div key={i} className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-amber-500 text-sm">{'\u26A1'}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          moment.position === 'early' ? 'bg-sky-100 text-sky-600' :
                          moment.position === 'middle' ? 'bg-amber-100 text-amber-600' :
                          'bg-red-100 text-red-600'
                        }`}>
                          {moment.position}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{moment.title}</p>
                      <p className="text-xs text-slate-600 mt-1">{moment.description}</p>
                    </div>
                  ))}
                  {acts.length > 0 && (
                    <p className="text-xs text-slate-400 italic mt-2">Want to change this? Just say so in the conversation.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Persistent footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-600 transition"
          >
            Cancel
          </button>

          <button
            onClick={handlePlant}
            disabled={!canPlant}
            className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition ${
              canPlant
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <SeedIcon size={13} className={canPlant ? '' : 'opacity-50'} />
            Plant this seed
          </button>
        </div>
      </div>
    </div>
  );
}
