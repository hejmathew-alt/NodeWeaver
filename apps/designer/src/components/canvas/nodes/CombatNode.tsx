'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { VRNNode } from '@void-runner/engine';

export function CombatNode({ data, selected }: NodeProps) {
  const node = data as unknown as VRNNode;
  return (
    <div
      className={`min-w-[200px] max-w-[280px] rounded-lg bg-white p-3 text-sm shadow-md transition-shadow ${
        selected ? 'ring-2 ring-red-400' : ''
      }`}
      style={{ border: '2px solid #ef4444' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-400" />

      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-red-700 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
          Combat
        </span>
        {node.status && (
          <span className="text-xs text-slate-500">{node.status}</span>
        )}
      </div>

      {node.title && (
        <p className="mb-1 font-semibold text-slate-900">{node.title}</p>
      )}
      <p className="line-clamp-3 text-slate-600">
        {node.body || <em className="text-slate-400">No content yet</em>}
      </p>

      <Handle type="source" position={Position.Bottom} className="!bg-red-400" />
    </div>
  );
}
