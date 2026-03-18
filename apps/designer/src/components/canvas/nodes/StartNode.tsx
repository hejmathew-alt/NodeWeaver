'use client';

import { useState, useEffect } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { NWVNode } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore, CANVAS_TEXT_CLASS } from '@/lib/settings';
import { BlocksPreview } from './BlocksPreview';

export function StartNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as NWVNode;
  const updateNodeSize = useStoryStore((s) => s.updateNodeSize);
  const updateNode = useStoryStore((s) => s.updateNode);
  const setCanvasPlayNodeId = useStoryStore((s) => s.setCanvasPlayNodeId);
  const playingNodeId = useStoryStore((s) => s.playingNodeId);
  const visitedNodeIds = useStoryStore((s) => s.visitedNodeIds);
  const isPlaying = id === playingNodeId;
  const wasVisited = !isPlaying && visitedNodeIds.includes(id);
  const canvasTextSize = useSettingsStore((s) => s.canvasTextSize);

  const [editTitle, setEditTitle] = useState(node.title ?? '');

  useEffect(() => { setEditTitle(node.title ?? ''); }, [node.title]);

  return (
    <div
      className={`flex w-full h-full flex-col rounded-lg bg-white p-2 ${CANVAS_TEXT_CLASS[canvasTextSize]} shadow-md overflow-hidden transition-shadow ${
        selected ? 'ring-2 ring-teal-400' : ''
      }`}
      style={{
        border: '1px solid #14b8a6',
        boxShadow: isPlaying
          ? '0 0 0 4px rgba(20,184,166,1), 0 0 32px 8px rgba(20,184,166,0.55)'
          : wasVisited ? '0 0 0 3px rgba(20,184,166,0.55), 0 0 14px rgba(20,184,166,0.35)' : undefined,
        animation: isPlaying ? 'nodePulse 1.2s ease-in-out infinite' : undefined,
      }}
    >
      <NodeResizer
        color="#14b8a6"
        isVisible={selected}
        minWidth={160}
        minHeight={80}
        onResizeEnd={(_, { width, height }) => updateNodeSize(id, width, height)}
      />

      <div className="mb-1 flex shrink-0 items-center gap-2">
        <span className="rounded bg-teal-600 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
          Start
        </span>
        {isPlaying && (
          <span className="flex items-end gap-[2px]" style={{ height: 11 }}>
            {[0, 1, 2].map(i => (
              <span key={i} className="w-[3px] rounded-sm bg-teal-400"
                style={{ height: 3, animation: `eqBar 0.45s ease-in-out ${i * 0.13}s infinite alternate` }} />
            ))}
          </span>
        )}
        <button
          className="nodrag ml-auto rounded px-1 py-0.5 text-[9px] text-slate-300 hover:bg-teal-50 hover:text-teal-600 transition-colors"
          title="Play from this node"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setCanvasPlayNodeId(id); }}
        >▶</button>
      </div>

      {selected ? (
        <input
          className="mb-1 w-full shrink-0 bg-transparent font-semibold text-slate-900 placeholder-slate-400 focus:outline-none"
          placeholder="Scene title…"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => { if (editTitle !== (node.title ?? '')) updateNode(id, { title: editTitle }); }}
        />
      ) : (
        node.title && <p className="mb-1 shrink-0 font-semibold text-slate-900">{node.title}</p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        <BlocksPreview nodeId={id} blocks={node.blocks ?? []} />
      </div>

      {/* No target handle — nothing connects TO start */}
      <Handle type="source" position={Position.Bottom} style={{ width: 10, height: 10 }} className="!bg-teal-400" />
    </div>
  );
}
