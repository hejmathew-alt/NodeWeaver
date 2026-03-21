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
  { type: 'twist',  label: '+ Twist',  colour: '#a855f7', hoverBg: 'hover:bg-purple-50' },
];

interface CanvasToolbarProps {
  flowMode?: boolean;
  onFlowMode?: () => void;
  worldPanelOpen?: boolean;
  onToggleWorld?: () => void;
  avfxMode?: boolean;
  onToggleAVFX?: () => void;
  onSeed?: () => void;
}

export function CanvasToolbar({ flowMode = false, onFlowMode, worldPanelOpen = false, onToggleWorld, avfxMode = false, onToggleAVFX, onSeed }: CanvasToolbarProps) {
  const createNode = useStoryStore((s) => s.createNode);
  const activeView = useStoryStore((s) => s.activeView);
  const setActiveView = useStoryStore((s) => s.setActiveView);

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

      {onToggleWorld && (
        <button
          onClick={onToggleWorld}
          className="flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-cyan-50"
          style={{
            color: worldPanelOpen ? '#fff' : '#0891b2',
            border: '1px solid #0891b255',
            backgroundColor: worldPanelOpen ? '#0891b2' : undefined,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="7" cy="7" r="6"/><ellipse cx="7" cy="7" rx="2.8" ry="6"/><line x1="1.2" y1="5" x2="12.8" y2="5"/><line x1="1.2" y1="9" x2="12.8" y2="9"/></svg> World
        </button>
      )}

      {onToggleAVFX && (
        <button
          onClick={onToggleAVFX}
          className="flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-violet-50"
          style={{
            color: avfxMode ? '#fff' : '#7c3aed',
            border: '1px solid #7c3aed55',
            backgroundColor: avfxMode ? '#7c3aed' : undefined,
          }}
          title="Audio Visual FX — DAW-style timeline editor"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10V5l4-2 4 2v5"/><circle cx="6" cy="11" r="1.5"/><circle cx="10" cy="10" r="1.5"/><line x1="6" y1="9.5" x2="10" y2="8.5"/></svg>
          Audio Visual FX
        </button>
      )}

      {onSeed && (
        <button
          onClick={onSeed}
          className="flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-emerald-50"
          style={{ color: '#059669', border: '1px solid #05966955' }}
          title="Seed — grow a story from a single idea"
        >
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="13" x2="7" y2="7"/><path d="M7 10C5 8 3 8 3 5C5 5 7 7 7 10"/><path d="M7 10C9 8 11 8 11 5C9 5 7 7 7 10"/></svg>
          Seed
        </button>
      )}

      <button
        onClick={() => setActiveView('characters')}
        className="flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-violet-50"
        style={{
          color: activeView === 'characters' ? '#fff' : '#7c3aed',
          border: '1px solid #7c3aed55',
          backgroundColor: activeView === 'characters' ? '#7c3aed' : undefined,
        }}
        title="Characters"
      >
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="4.5" r="2.5"/><path d="M2 13c0-2.76 2.24-5 5-5s5 2.24 5 5"/></svg>
        Characters
      </button>

      <button
        onClick={() => setActiveView('encounters')}
        className="flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors hover:bg-red-50"
        style={{
          color: activeView === 'encounters' ? '#fff' : '#ef4444',
          border: '1px solid #ef444455',
          backgroundColor: activeView === 'encounters' ? '#ef4444' : undefined,
        }}
        title="Encounters"
      >
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="2" x2="12" y2="12"/><line x1="12" y1="2" x2="2" y2="12"/><line x1="1" y1="3.5" x2="3.5" y2="1"/><line x1="10.5" y1="13" x2="13" y2="10.5"/></svg>
        Encounters
      </button>

      {onFlowMode && (
        <>
          <div className="mx-2 h-4 w-px bg-slate-200" />
          <button
            onClick={onFlowMode}
            className="rounded px-3 py-1 text-xs font-medium transition-colors"
            style={{
              color: flowMode ? '#fff' : '#4f46e5',
              border: '1px solid #4f46e544',
              backgroundColor: flowMode ? '#4f46e5' : undefined,
            }}
            title="Switch to flow document editor"
          >
            ≡ Flow Mode
          </button>
        </>
      )}
    </div>
  );
}
