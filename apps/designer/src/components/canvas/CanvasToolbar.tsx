'use client';

import type { NodeType } from '@void-runner/engine';
import { useStoryStore } from '@/store/story';

const NODE_BUTTONS: {
  type: NodeType;
  label: string;
  colour: string;
  hoverBg: string;
}[] = [
  { type: 'story',  label: '+ Story',  colour: '#3b82f6', hoverBg: 'hover:bg-blue-900/40' },
  { type: 'combat', label: '+ Combat', colour: '#ef4444', hoverBg: 'hover:bg-red-900/40' },
  { type: 'chat',   label: '+ Chat',   colour: '#22c55e', hoverBg: 'hover:bg-green-900/40' },
  { type: 'twist',  label: '+ Twist',  colour: '#a855f7', hoverBg: 'hover:bg-purple-900/40' },
];

export function CanvasToolbar() {
  const createNode = useStoryStore((s) => s.createNode);

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
      <div className="ml-auto text-xs text-slate-600">
        Click a button to add a node · Drag handles to connect
      </div>
    </div>
  );
}
