'use client';

import { useState } from 'react';
import type { VRNNode, VRNChoice, StatType, NodeType, NodeStatus } from '@void-runner/engine';
import { useStoryStore } from '@/store/story';

// ── Helpers ─────────────────────────────────────────────────────────────────

const NODE_TYPE_COLOURS: Record<NodeType, string> = {
  story:  '#3b82f6',
  combat: '#ef4444',
  chat:   '#22c55e',
  twist:  '#a855f7',
};

const STAT_TYPES: StatType[] = ['neutral', 'str', 'wit', 'charm'];
const STAT_LABELS: Record<StatType, string> = {
  neutral: 'Neutral',
  str: 'STR',
  wit: 'WIT',
  charm: 'CHM',
};

const STATUS_OPTIONS: NodeStatus[] = ['draft', 'complete', 'needs-work'];

// ── Choice card ──────────────────────────────────────────────────────────────

function ChoiceCard({
  choice,
  nodeId,
  allNodes,
}: {
  choice: VRNChoice;
  nodeId: string;
  allNodes: VRNNode[];
}) {
  const { updateChoice, deleteChoice } = useStoryStore();
  const [expanded, setExpanded] = useState(false);

  const up = (patch: Partial<VRNChoice>) => updateChoice(nodeId, choice.id, patch);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60">
      {/* Choice header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          className="shrink-0 text-slate-500 hover:text-slate-300"
          onClick={() => setExpanded((x) => !x)}
          aria-label="Toggle choice"
        >
          {expanded ? '▾' : '▸'}
        </button>

        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          placeholder="Choice label…"
          value={choice.label}
          onChange={(e) => up({ label: e.target.value })}
        />

        {/* Stat type pill */}
        <select
          className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300 focus:outline-none"
          value={choice.type}
          onChange={(e) => up({ type: e.target.value as StatType })}
        >
          {STAT_TYPES.map((t) => (
            <option key={t} value={t}>{STAT_LABELS[t]}</option>
          ))}
        </select>

        <button
          className="shrink-0 text-slate-600 hover:text-red-400"
          onClick={() => deleteChoice(nodeId, choice.id)}
          aria-label="Delete choice"
        >
          ✕
        </button>
      </div>

      {/* Expanded fields */}
      {expanded && (
        <div className="border-t border-slate-700 px-3 py-3 space-y-3">
          {/* Next node */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">Next node</label>
            <select
              className="w-full rounded bg-slate-700 px-2 py-1.5 text-sm text-white focus:outline-none"
              value={choice.next ?? ''}
              onChange={(e) => up({ next: e.target.value || undefined })}
            >
              <option value="">— none —</option>
              {allNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title || n.id} ({n.type})
                </option>
              ))}
            </select>
          </div>

          {/* Flavour */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">Flavour text</label>
            <input
              className="w-full rounded bg-slate-700 px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none"
              placeholder="Brief beat shown on canvas edge…"
              value={choice.flavour ?? ''}
              onChange={(e) => up({ flavour: e.target.value || undefined })}
            />
          </div>

          {/* Consequence */}
          <div>
            <label className="mb-1 block text-xs text-slate-500">Consequence</label>
            <textarea
              rows={2}
              className="w-full resize-none rounded bg-slate-700 px-2 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none"
              placeholder="Shown between choice and next scene…"
              value={choice.consequence ?? ''}
              onChange={(e) => up({ consequence: e.target.value || undefined })}
            />
            {choice.consequence && (
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={choice.positiveConsequence ?? false}
                  onChange={(e) => up({ positiveConsequence: e.target.checked })}
                  className="accent-green-500"
                />
                Positive consequence
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function NodeEditorPanel() {
  const {
    activeStory,
    selectedNodeId,
    setSelectedNode,
    updateNode,
    deleteNode,
    addChoice,
  } = useStoryStore();

  if (!activeStory || !selectedNodeId) return null;

  const node = activeStory.nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const colour = NODE_TYPE_COLOURS[node.type];
  const up = (patch: Partial<VRNNode>) => updateNode(selectedNodeId, patch);

  return (
    <aside
      className="flex h-full w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950"
      style={{ borderLeftColor: `${colour}44` }}
    >
      {/* Panel header */}
      <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
        <span
          className="rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white"
          style={{ backgroundColor: colour }}
        >
          {node.type}
        </span>
        <span className="flex-1 truncate font-mono text-xs text-slate-500">{node.id.slice(0, 8)}…</span>
        <button
          className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-900/30"
          onClick={() => deleteNode(selectedNodeId)}
        >
          Delete
        </button>
        <button
          className="ml-1 text-slate-500 hover:text-white"
          onClick={() => setSelectedNode(null)}
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* Title */}
        <div>
          <label className="mb-1 block text-xs text-slate-500">Title</label>
          <input
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': colour } as React.CSSProperties}
            placeholder="Scene title…"
            value={node.title ?? ''}
            onChange={(e) => up({ title: e.target.value })}
          />
        </div>

        {/* Location */}
        <div>
          <label className="mb-1 block text-xs text-slate-500">Location</label>
          <input
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': colour } as React.CSSProperties}
            placeholder="Station · Sector"
            value={node.location ?? ''}
            onChange={(e) => up({ location: e.target.value })}
          />
        </div>

        {/* Body */}
        <div>
          <label className="mb-1 block text-xs text-slate-500">Body</label>
          <textarea
            rows={6}
            className="w-full resize-none rounded bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': colour } as React.CSSProperties}
            placeholder="Narrative text shown to the player…"
            value={node.body}
            onChange={(e) => up({ body: e.target.value })}
          />
        </div>

        {/* Mood + Status row */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500">Mood</label>
            <input
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
              placeholder="tense, calm…"
              value={node.mood ?? ''}
              onChange={(e) => up({ mood: e.target.value || undefined })}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-slate-500">Status</label>
            <select
              className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none"
              value={node.status}
              onChange={(e) => up({ status: e.target.value as NodeStatus })}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Character */}
        <div>
          <label className="mb-1 block text-xs text-slate-500">Character</label>
          <input
            className="w-full rounded bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
            placeholder="character-slug"
            value={node.character ?? ''}
            onChange={(e) => up({ character: e.target.value || undefined })}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-slate-800 pt-2">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Choices ({node.choices.length})
          </p>

          {node.choices.length === 0 && (
            <p className="mb-3 text-xs text-slate-600">
              No choices yet. Add one or drag from a handle to connect nodes.
            </p>
          )}

          <div className="space-y-2">
            {node.choices.map((choice) => (
              <ChoiceCard
                key={choice.id}
                choice={choice}
                nodeId={node.id}
                allNodes={activeStory.nodes.filter((n) => n.id !== node.id)}
              />
            ))}
          </div>

          <button
            className="mt-3 w-full rounded border border-slate-700 py-2 text-xs text-slate-400 transition hover:border-slate-500 hover:text-white"
            onClick={() => addChoice(selectedNodeId)}
          >
            + Add Choice
          </button>
        </div>
      </div>
    </aside>
  );
}
