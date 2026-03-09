'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { VRNNode } from '@void-runner/engine';

export function ChatNode({ data, selected }: NodeProps) {
  const node = data as unknown as VRNNode;
  return (
    <div
      className={`min-w-[200px] max-w-[280px] rounded-lg bg-slate-900 p-3 text-sm shadow-lg transition-shadow ${
        selected ? 'ring-2 ring-green-400' : ''
      }`}
      style={{ border: '2px solid #22c55e' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-green-400" />

      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-green-700 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
          Chat
        </span>
        {node.status && (
          <span className="text-xs text-slate-400">{node.status}</span>
        )}
      </div>

      {node.title && (
        <p className="mb-1 font-semibold text-white">{node.title}</p>
      )}
      <p className="line-clamp-3 text-slate-300">
        {node.body || <em className="text-slate-500">No content yet</em>}
      </p>

      <Handle type="source" position={Position.Bottom} className="!bg-green-400" />
    </div>
  );
}
