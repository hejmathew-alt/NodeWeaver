'use client';

import { useMemo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { NWVNode } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore, CANVAS_TEXT_CLASS } from '@/lib/settings';
import { BlocksPreview } from './BlocksPreview';

const AVATAR_COLORS = ['#f97316','#8b5cf6','#06b6d4','#ec4899','#10b981','#f59e0b','#3b82f6','#ef4444'];
function nameToColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function EndNode({ id, data }: NodeProps) {
  const node = data as unknown as NWVNode;
  const isOrphaned = (data as Record<string, unknown>)?._isOrphaned === true;
  const updateNode = useStoryStore((s) => s.updateNode);
  const selectedNodeId = useStoryStore((s) => s.selectedNodeId);
  const isSelected = id === selectedNodeId;
  const characters = useStoryStore((s) => s.activeStory?.characters ?? []);
  const storyId = useStoryStore((s) => s.activeStory?.id ?? '');
  const canvasTextSize = useSettingsStore((s) => s.canvasTextSize);

  const avatarChars = useMemo(() => {
    const seen = new Set<string>();
    const result: typeof characters = [];
    for (const b of node.blocks ?? []) {
      if (b.characterId && b.characterId !== 'narrator' && !seen.has(b.characterId)) {
        seen.add(b.characterId);
        const char = characters.find((c) => c.id === b.characterId);
        if (char) result.push(char);
      }
    }
    return result;
  }, [node.blocks, characters]);
  const displayChars = avatarChars.slice(0, 4);
  const overflow = avatarChars.length - displayChars.length;

  return (
    <div
      className={`flex w-full h-full flex-col rounded-lg bg-white p-2 ${CANVAS_TEXT_CLASS[canvasTextSize]} shadow-md transition-all`}
      style={{
        border: '1px solid #e2e8f0',
        boxShadow: 'inset 4px 0 0 #f97316',
        outline: isSelected ? '2px solid #f97316' : 'none',
        outlineOffset: '2px',
        opacity: isOrphaned ? 0.45 : 1,
      }}
    >
      {/* No source handle — nothing comes after end; no right handle — flow enters from left */}
      <Handle type="target" position={Position.Left} id="target-left" style={{ width: 10, height: 10 }} className="!bg-orange-400" />

      <div className="mb-1 flex shrink-0 items-center gap-1.5">
        {displayChars.map((char, i) => (
          <div key={char.id} title={char.name} className="shrink-0 rounded-full border border-white overflow-hidden"
            style={{ width: 18, height: 18, marginLeft: i > 0 ? -5 : 0, position: 'relative' }}>
            <div className="absolute inset-0 rounded-full flex items-center justify-center text-white font-bold"
              style={{ fontSize: 6, backgroundColor: nameToColor(char.name) }}>
              {char.name.charAt(0).toUpperCase()}
            </div>
            {char.avatarFile && (
              <img src={`/api/stories/${storyId}/avatar?file=${char.avatarFile}`} alt={char.name}
                className="absolute inset-0 w-full h-full object-cover rounded-full"
                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
            )}
          </div>
        ))}
        {overflow > 0 && (
          <div className="shrink-0 rounded-full border border-white flex items-center justify-center bg-slate-100 text-slate-500 font-semibold"
            style={{ width: 18, height: 18, marginLeft: -5, fontSize: 6 }}>
            +{overflow}
          </div>
        )}
        {node.status && <span className="text-xs text-slate-500">{node.status}</span>}
      {isOrphaned && (
        <span className="ml-auto text-[9px] text-amber-500 font-medium" title="Nothing connects to this ending">⚠ unconnected</span>
      )}
      </div>

      {isSelected ? (
        <input
          className="mb-1 w-full shrink-0 bg-transparent font-semibold text-slate-900 placeholder-slate-400 focus:outline-none"
          placeholder="Scene title…"
          value={node.title ?? ''}
          onChange={(e) => updateNode(id, { title: e.target.value })}
        />
      ) : (
        node.title && <p className="mb-1 shrink-0 font-semibold text-slate-900">{node.title}</p>
      )}

      {node.description && (
        <p className="mb-1 shrink-0 text-[10px] text-slate-400 leading-snug line-clamp-2">{node.description}</p>
      )}


      {/* No source handle — nothing comes after end */}
    </div>
  );
}
