'use client';

import type { NodeType } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';

const NODE_BUTTONS: {
  type: NodeType;
  label: string;
  colour: string;
  hoverBg: string;
}[] = [
  { type: 'start',  label: '+ Start',  colour: '#14b8a6', hoverBg: 'hover:bg-teal-50' },
  { type: 'end',    label: '+ End',    colour: '#f97316', hoverBg: 'hover:bg-orange-50' },
  { type: 'story',  label: '+ Story',  colour: '#3b82f6', hoverBg: 'hover:bg-blue-50' },
  { type: 'combat', label: '+ Interactive', colour: '#ef4444', hoverBg: 'hover:bg-red-50' },
  { type: 'chat',   label: '+ Chat',   colour: '#22c55e', hoverBg: 'hover:bg-green-50' },
  { type: 'twist',  label: '+ Twist',  colour: '#a855f7', hoverBg: 'hover:bg-purple-50' },
];

interface CanvasToolbarProps { onAutoLayout: () => void; }

export function CanvasToolbar({ onAutoLayout }: CanvasToolbarProps) {
  const createNode = useStoryStore((s) => s.createNode);
  const setSelectedPanel = useStoryStore((s) => s.setSelectedPanel);
  const selectedPanel = useStoryStore((s) => s.selectedPanel);

  const isCharPanelOpen     = selectedPanel === 'character';
  const isSettingsPanelOpen = selectedPanel === 'settings';

  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-1.5">
      {NODE_BUTTONS.map(({ type, label, colour, hoverBg }) => (
        <button
          key={type}
          onClick={() => createNode(type)}
          className={`rounded px-3 py-1 text-xs font-medium transition-colors ${hoverBg}`}
          style={{ color: colour, border: `1px solid ${colour}33` }}
        >
          {label}
        </button>
      ))}

      <div className="mx-2 h-4 w-px bg-slate-200" />

      <button
        onClick={onAutoLayout}
        className="rounded px-3 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100"
        style={{ border: '1px solid #64748b33' }}
        title="Auto-arrange all nodes into a clean top-to-bottom tree"
      >
        ⬡ Auto Arrange
      </button>

      <div className="mx-2 h-4 w-px bg-slate-200" />

      <button
        onClick={() => setSelectedPanel(isCharPanelOpen ? null : 'character')}
        className="rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-violet-50"
        style={{
          color: isCharPanelOpen ? '#fff' : '#7c3aed',
          border: '1px solid #7c3aed55',
          backgroundColor: isCharPanelOpen ? '#7c3aed' : undefined,
        }}
      >
        Characters
      </button>

      <button
        onClick={() => setSelectedPanel(isSettingsPanelOpen ? null : 'settings')}
        className="rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-slate-100"
        style={{
          color: isSettingsPanelOpen ? '#fff' : '#64748b',
          border: '1px solid #64748b44',
          backgroundColor: isSettingsPanelOpen ? '#64748b' : undefined,
        }}
        title="Settings"
      >
        ⚙ Settings
      </button>

      <div className="ml-auto text-xs text-slate-400">
        Click a button to add a node · Drag a handle to empty space to add &amp; connect
      </div>
    </div>
  );
}
