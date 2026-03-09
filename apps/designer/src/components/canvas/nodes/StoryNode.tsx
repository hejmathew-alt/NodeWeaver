'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { VRNNode } from '@void-runner/engine';

export function StoryNode({ data, selected }: NodeProps) {
  const node = data as unknown as VRNNode;
  return (
    <div
      className={`min-w-[200px] max-w-[280px] rounded-lg bg-slate-900 p-3 text-sm shadow-lg transition-shadow ${
        selected ? 'ring-2 ring-blue-400' : ''
      }`}
      style={{ border: '2px solid #3b82f6' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-400" />

      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
          Story
        </span>
        {node.status && (
          <span className="text-xs text-slate-400">{node.status}</span>
        )}
      </div>

      {node.title && (
        <p className="mb-1 font-semibold text-white">{node.title}</p>
      )}
      {node.location && (
        <p className="mb-2 text-xs text-slate-400">{node.location}</p>
      )}
      <p className="line-clamp-3 text-slate-300">
        {node.body || <em className="text-slate-500">No content yet</em>}
      </p>

      <Handle type="source" position={Position.Bottom} className="!bg-blue-400" />
    </div>
  );
}
