'use client';

import { useStoryStore } from '@/store/story';

const PALETTE = ['#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#64748b', '#f97316', '#14b8a6'];

interface Props {
  onClose: () => void;
}

export function LanePanel({ onClose }: Props) {
  const activeStory = useStoryStore((s) => s.activeStory);
  const addLane = useStoryStore((s) => s.addLane);
  const updateLane = useStoryStore((s) => s.updateLane);
  const deleteLane = useStoryStore((s) => s.deleteLane);

  if (!activeStory) return null;

  const lanes = activeStory.lanes ?? [];

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
        <div className="flex items-center gap-1.5">
          {/* Vertical stripes icon */}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-slate-500">
            <rect x="1" y="1" width="3" height="12" rx="1"/>
            <rect x="5.5" y="1" width="3" height="12" rx="1"/>
            <rect x="10" y="1" width="3" height="12" rx="1"/>
          </svg>
          <h3 className="text-sm font-semibold text-slate-800">Story Lanes</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Close lanes panel"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1l10 10M11 1L1 11"/>
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {lanes.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-slate-400 leading-relaxed">
              No lanes yet. Add one to group parallel story threads, character arcs, or location-based paths.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {lanes.map((lane) => {
              const nodeCount = activeStory.nodes.filter((n) => (n.lanes ?? []).includes(lane.id)).length;
              return (
                <div key={lane.id} className="px-4 py-3 space-y-2">
                  {/* Top row: swatch + name + node count + delete */}
                  <div className="flex items-center gap-2">
                    {/* Colour swatch + picker */}
                    <div className="relative group">
                      <div
                        className="w-4 h-4 rounded-sm shrink-0 cursor-pointer ring-1 ring-black/10"
                        style={{ backgroundColor: lane.colour }}
                      />
                      {/* Palette popover on hover */}
                      <div className="absolute left-0 top-5 z-20 hidden group-hover:flex flex-wrap gap-1 p-2 bg-white rounded-lg shadow-lg border border-slate-200 w-28">
                        {PALETTE.map((c) => (
                          <button
                            key={c}
                            onClick={() => updateLane(lane.id, { colour: c })}
                            className="w-5 h-5 rounded-sm ring-1 ring-black/10 hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                    </div>
                    <input
                      type="text"
                      defaultValue={lane.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== lane.name) updateLane(lane.id, { name: v });
                      }}
                      className="flex-1 min-w-0 text-sm font-semibold text-slate-800 bg-transparent outline-none border-b border-transparent hover:border-slate-200 focus:border-slate-400 transition-colors"
                      placeholder="Lane name"
                    />
                    <span className="shrink-0 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                      {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
                    </span>
                    <button
                      onClick={() => deleteLane(lane.id)}
                      className="shrink-0 rounded p-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete lane"
                    >
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M1 1l10 10M11 1L1 11"/>
                      </svg>
                    </button>
                  </div>
                  {/* Description */}
                  <textarea
                    rows={2}
                    defaultValue={lane.description ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== (lane.description ?? '')) updateLane(lane.id, { description: v });
                    }}
                    placeholder="Description (optional)"
                    className="w-full resize-none rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-slate-400 focus:bg-white placeholder:text-slate-300"
                  />
                  {/* Colour accent bar */}
                  <div className="h-0.5 rounded-full" style={{ backgroundColor: lane.colour, opacity: 0.5 }} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-100 px-4 py-3">
        <button
          onClick={() => addLane()}
          className="w-full rounded border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
        >
          + Add Lane
        </button>
      </div>
    </div>
  );
}
