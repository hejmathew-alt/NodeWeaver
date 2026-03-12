'use client';

import { useState, useEffect } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react';
import type { VRNNode } from '@void-runner/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore, CANVAS_TEXT_CLASS } from '@/lib/settings';
import { BlocksPreview } from './BlocksPreview';

export function StartNode({ id, data, selected }: NodeProps) {
  const node = data as unknown as VRNNode;
  const { updateNodeSize, updateNode } = useStoryStore();
  const canvasTextSize = useSettingsStore((s) => s.canvasTextSize);

  const [editTitle, setEditTitle] = useState(node.title ?? '');

  useEffect(() => { setEditTitle(node.title ?? ''); }, [node.title]);

  return (
    <div
      className={`flex w-full h-full flex-col rounded-lg bg-white p-2 ${CANVAS_TEXT_CLASS[canvasTextSize]} shadow-md overflow-hidden transition-shadow ${
        selected ? 'ring-2 ring-teal-400' : ''
      }`}
      style={{ border: '1px solid #14b8a6' }}
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
        <BlocksPreview blocks={node.blocks ?? []} />
      </div>

      {/* No target handle — nothing connects TO start */}
      <Handle type="source" position={Position.Bottom} className="!bg-teal-400" />
    </div>
  );
}
