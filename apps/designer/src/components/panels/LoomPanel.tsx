'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { NWVStory } from '@nodeweaver/engine';
import { buildAIContext, aiContextToFlat } from '@/lib/context-builder';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LoomAction {
  label: string;
  intent: 'add-choice' | 'create-twist' | 'add-character-line' | 'open-world-builder';
  params?: Record<string, string>;
}

interface LoomInsight {
  type: 'structure' | 'character' | 'world' | 'scene';
  severity: 'warning' | 'suggestion' | 'info';
  title: string;
  body: string;
  action: LoomAction | null;
}

interface LoomResult {
  summary: string;
  insights: LoomInsight[];
}

// ── Structural helpers ────────────────────────────────────────────────────────

function computeStructuralContext(story: NWVStory, nodeId: string): Record<string, unknown> {
  const nodes = story.nodes;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build incoming-edge count map
  const incomingCount = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const n of nodes) {
    for (const c of n.choices) {
      if (c.next) incomingCount.set(c.next, (incomingCount.get(c.next) ?? 0) + 1);
    }
  }

  // Orphan nodes (no incoming, not a start node)
  const orphanNodes = nodes
    .filter((n) => n.type !== 'start' && (incomingCount.get(n.id) ?? 0) === 0)
    .map((n) => n.title);

  // Build parent map for chain length
  const parentMap = new Map<string, string>();
  const visited = new Set<string>();
  const startIds = nodes.filter((n) => n.type === 'start').map((n) => n.id);
  for (const id of startIds) visited.add(id);
  const queue = [...startIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (!node) continue;
    for (const c of node.choices) {
      if (c.next && !visited.has(c.next)) {
        visited.add(c.next);
        parentMap.set(c.next, id);
        queue.push(c.next);
      }
    }
  }

  // Chain length: walk back from current node counting linear ancestors
  function chainLengthFrom(id: string): number {
    let len = 0;
    let cur = id;
    while (true) {
      const p = parentMap.get(cur);
      if (!p) break;
      const parentNode = nodeMap.get(p);
      if (!parentNode) break;
      // Stop if parent was a branch (>1 outgoing) or twist
      if (parentNode.type === 'twist' || parentNode.choices.filter((c) => c.next).length > 1) break;
      len++;
      cur = p;
    }
    return len;
  }

  const chainLength = chainLengthFrom(nodeId);

  // Longest chain anywhere in the graph
  let longestChain = 0;
  for (const n of nodes) {
    const l = chainLengthFrom(n.id);
    if (l > longestChain) longestChain = l;
  }

  // Counts
  const twistCount = nodes.filter((n) => n.type === 'twist').length;
  const branchCount = nodes.filter((n) => n.choices.filter((c) => c.next).length >= 2).length;
  const totalEndNodes = nodes.filter((n) => n.type === 'end').length;

  // Character frequency: how many nodes each char appears in
  const charCounts = new Map<string, number>();
  for (const n of nodes) {
    const seenInNode = new Set<string>();
    for (const b of n.blocks ?? []) {
      if (b.characterId && !seenInNode.has(b.characterId)) {
        seenInNode.add(b.characterId);
        charCounts.set(b.characterId, (charCounts.get(b.characterId) ?? 0) + 1);
      }
    }
  }

  const characterFrequency = (story.characters ?? [])
    .filter((c) => c.id !== 'narrator')
    .map((c) => ({ name: c.name, count: charCounts.get(c.id) ?? 0 }))
    .sort((a, b) => a.count - b.count);

  // Characters absent since: count nodes since last appearance (BFS order)
  const bfsOrder: string[] = [];
  const bfsVisited = new Set<string>();
  const bfsQueue = nodes.filter((n) => n.type === 'start').map((n) => n.id);
  for (const id of bfsQueue) bfsVisited.add(id);
  bfsOrder.push(...bfsQueue);
  while (bfsQueue.length > 0) {
    const id = bfsQueue.shift()!;
    const node = nodeMap.get(id);
    if (!node) continue;
    for (const c of node.choices) {
      if (c.next && !bfsVisited.has(c.next)) {
        bfsVisited.add(c.next);
        bfsQueue.push(c.next);
        bfsOrder.push(c.next);
      }
    }
  }

  const currentIdx = bfsOrder.indexOf(nodeId);
  const characterAbsentSince = (story.characters ?? [])
    .filter((c) => c.id !== 'narrator')
    .map((c) => {
      let lastIdx = -1;
      for (let i = 0; i <= currentIdx && i < bfsOrder.length; i++) {
        const n = nodeMap.get(bfsOrder[i]);
        if (n?.blocks?.some((b) => b.characterId === c.id)) lastIdx = i;
      }
      return { name: c.name, characterId: c.id, nodesSince: lastIdx === -1 ? 999 : currentIdx - lastIdx };
    })
    .filter((a) => a.nodesSince > 3);

  // Dead-end choices on current node
  const currentNode = nodeMap.get(nodeId);
  const deadEndChoices = (currentNode?.choices ?? [])
    .filter((c) => !c.next)
    .map((c) => c.label);

  // Missing world defs: scan all block texts for location/faction names not in world
  const worldNames = new Set<string>([
    ...(story.world?.locations ?? []).map((l) => l.name.toLowerCase()),
    ...(story.world?.factions ?? []).map((f) => f.name.toLowerCase()),
  ]);
  const allText = (currentNode?.blocks ?? []).map((b) => b.text).join(' ').toLowerCase();
  const missingWorldDefs: string[] = [];
  for (const wName of worldNames) {
    if (!allText.includes(wName.toLowerCase()) && wName.length > 3) {
      // Not missing — this is checking reverse (text refs not in world)
    }
  }
  // Simple scan: check if block text mentions words that look like proper nouns not in world
  // (This is a best-effort heuristic — just pass worldNames for AI awareness)

  // Current node info
  const nodeChoices = (currentNode?.choices ?? []).map((c) => ({ label: c.label, next: c.next }));
  const nodeBody = (currentNode?.blocks ?? []).map((b) => b.text).join(' ');

  // Full character list with ids
  const characters = (story.characters ?? [])
    .filter((c) => c.id !== 'narrator')
    .map((c) => ({ id: c.id, name: c.name, role: c.role }));

  return {
    totalNodes: nodes.length,
    totalCharacters: characters.length,
    totalEndNodes,
    twistCount,
    branchCount,
    orphanNodes,
    chainLength,
    longestChain,
    characterFrequency,
    characterAbsentSince,
    deadEndChoices,
    missingWorldDefs,
    nodeChoices,
    nodeBody,
    characters,
    nodeTitle: currentNode?.title ?? '',
    nodeType: currentNode?.type ?? 'story',
    nodeLocation: currentNode?.location ?? '',
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  story: NWVStory;
  nodeId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LoomPanel({ story, nodeId }: Props) {
  const { addChoice, createNode, updateNode, addBlock } = useStoryStore();
  const anthropicKey = useSettingsStore((s) => s.anthropicKey);

  const [expanded, setExpanded] = useState(false);
  const [insights, setInsights] = useState<LoomInsight[]>([]);
  const [summary, setSummary] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const [lastAnalysedNodeId, setLastAnalysedNodeId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [appliedActions, setAppliedActions] = useState<Set<number>>(new Set());
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  const runAnalysis = useCallback(async () => {
    setAnalysing(true);
    setAnalyseError(null);
    setAppliedActions(new Set());
    try {
      // Build base context from existing utility
      const ctx = buildAIContext(story, nodeId);
      const flatCtx = aiContextToFlat(ctx, story, nodeId);
      // Merge full-story structural digest
      const structural = computeStructuralContext(story, nodeId);
      const mergedCtx = { ...flatCtx, ...structural };

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'loom-analyse',
          prompt: '',
          anthropicKey,
          context: mergedCtx,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const cleaned = (data.suggestions as string)
        .replace(/^```(?:json)?\s*/im, '')
        .replace(/\s*```$/im, '')
        .trim();
      const result: LoomResult = JSON.parse(cleaned);
      setSummary(result.summary ?? '');
      setInsights(result.insights ?? []);
      setLastAnalysedNodeId(nodeId);
    } catch (e) {
      setAnalyseError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setAnalysing(false);
    }
  }, [story, nodeId, anthropicKey]);

  // Auto-analyse when expanded and node changes
  useEffect(() => {
    if (expanded && nodeId !== lastAnalysedNodeId) {
      runAnalysis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, expanded]);

  const runChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    setChatLoading(true);
    setChatResponse('');
    try {
      const ctx = buildAIContext(story, nodeId);
      const flatCtx = aiContextToFlat(ctx, story, nodeId);
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'loom-chat',
          prompt: chatInput.trim(),
          anthropicKey,
          context: flatCtx,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let text = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setChatResponse(text);
        }
      }
    } catch (e) {
      setChatResponse(e instanceof Error ? e.message : 'Chat failed.');
    } finally {
      setChatLoading(false);
      setChatInput('');
    }
  };

  const applyAction = (insight: LoomInsight, idx: number) => {
    if (!insight.action) return;
    const { intent, params = {} } = insight.action;
    switch (intent) {
      case 'add-choice':
        addChoice(nodeId);
        break;
      case 'create-twist': {
        const newId = createNode('twist');
        if (newId) {
          updateNode(newId, { title: params.title ?? 'New Twist' });
          addChoice(nodeId, { label: params.choiceLabel ?? '→', next: newId });
        }
        break;
      }
      case 'add-character-line':
        if (params.characterId) addBlock(nodeId, 'line', params.characterId);
        break;
      case 'open-world-builder':
        // No direct store action — insight body already explains to use World panel
        break;
    }
    setAppliedActions((prev) => new Set(prev).add(idx));
  };

  // Severity styles
  const severityStyles: Record<string, string> = {
    warning:    'bg-red-50 border-red-200',
    suggestion: 'bg-amber-50 border-amber-200',
    info:       'bg-slate-50 border-slate-200',
  };
  const severityIcon: Record<string, string> = {
    warning:    '⚠',
    suggestion: '→',
    info:       '·',
  };
  const severityTextColor: Record<string, string> = {
    warning:    'text-red-700',
    suggestion: 'text-amber-800',
    info:       'text-slate-600',
  };
  const severityButtonStyle: Record<string, string> = {
    warning:    'border-red-300 text-red-700 hover:bg-red-100',
    suggestion: 'border-amber-300 text-amber-800 hover:bg-amber-100',
    info:       'border-slate-300 text-slate-600 hover:bg-slate-100',
  };

  // Type dot colours
  const typeDot: Record<string, string> = {
    structure: 'bg-cyan-400',
    character: 'bg-violet-400',
    world:     'bg-teal-400',
    scene:     'bg-blue-400',
  };

  return (
    <div className="py-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
        >
          <span className={`inline-block text-[9px] transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}>▶</span>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="opacity-60">
            <path d="M2 4h10M2 7h7M2 10h5"/>
            <circle cx="11" cy="9.5" r="2.5"/>
            <path d="M11 8.5v1l.7.7" strokeLinejoin="round"/>
          </svg>
          Loom
        </button>
        {expanded && (
          <button
            onClick={runAnalysis}
            disabled={analysing}
            title="Re-analyse"
            className="ml-auto text-[11px] text-slate-400 hover:text-cyan-600 transition-colors disabled:opacity-50"
          >
            {analysing ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-500" />
            ) : '↻'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-2">
          {/* Summary */}
          {summary && !analysing && (
            <p className="text-[11px] text-slate-500 leading-relaxed italic px-0.5">{summary}</p>
          )}

          {/* Loading skeleton */}
          {analysing && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 animate-pulse">
                  <div className="h-2.5 bg-slate-200 rounded w-2/3 mb-2" />
                  <div className="h-2 bg-slate-100 rounded w-full mb-1" />
                  <div className="h-2 bg-slate-100 rounded w-4/5" />
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {analyseError && !analysing && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700">
              {analyseError}
            </div>
          )}

          {/* Empty state */}
          {!analysing && !analyseError && insights.length === 0 && !summary && (
            <p className="text-[11px] text-slate-400 italic px-0.5">Click ↻ to analyse this scene.</p>
          )}

          {/* Insight cards */}
          {!analysing && insights.map((insight, idx) => (
            <div
              key={idx}
              className={`rounded-lg border px-3 py-2.5 ${severityStyles[insight.severity] ?? 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-start gap-1.5">
                {/* Type dot */}
                <span className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ${typeDot[insight.type] ?? 'bg-slate-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-[11px] font-semibold leading-tight ${severityTextColor[insight.severity] ?? 'text-slate-700'}`}>
                      {severityIcon[insight.severity]} {insight.title}
                    </p>
                    {insight.action && (
                      <button
                        onClick={() => applyAction(insight, idx)}
                        disabled={appliedActions.has(idx)}
                        className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium bg-white transition-colors disabled:opacity-50 ${severityButtonStyle[insight.severity] ?? ''}`}
                      >
                        {appliedActions.has(idx) ? '✓ Done' : insight.action.label}
                      </button>
                    )}
                  </div>
                  <p className={`mt-1 text-[11px] leading-relaxed ${severityTextColor[insight.severity] ?? 'text-slate-600'}`}>
                    {insight.body}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Divider */}
          <div className="border-t border-slate-100 pt-2">
            {/* Chat response */}
            {chatResponse && (
              <p className="text-[11px] text-slate-600 leading-relaxed mb-2 italic">{chatResponse}</p>
            )}

            {/* Chat input */}
            <div className="flex gap-1.5 items-end">
              <textarea
                ref={chatTextareaRef}
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  // Auto-grow
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runChat(); }
                }}
                placeholder="Ask Loom a question…"
                rows={1}
                className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 placeholder-slate-400 focus:outline-none focus:border-cyan-300 focus:bg-white transition-colors"
                style={{ minHeight: '30px' }}
              />
              <button
                onClick={runChat}
                disabled={!chatInput.trim() || chatLoading}
                className="shrink-0 rounded-lg bg-cyan-500 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-cyan-400 disabled:opacity-40 transition-colors"
              >
                {chatLoading ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : '▶'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
