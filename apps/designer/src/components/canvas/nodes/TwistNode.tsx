'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { VRNNode } from '@void-runner/engine';

export function TwistNode({ data, selected }: NodeProps) {
  const node = data as unknown as VRNNode;
  return (
    <div
      className={`min-w-[200px] max-w-[280px] rounded-lg bg-slate-900 p-3 text-sm shadow-lg transition-shadow ${
        selected ? 'ring-2 ring-purple-400' : ''
      }`}
      style={{ border: '2px dashed #a855f7' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-400" />

      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-purple-800 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
          Twist
        </span>
        {node.status && (
          <span className="text-xs text-slate-400">{node.status}</span>
        )}
      </div>

      {node.title && (
        <p className="mb-1 font-semibold text-white">{node.title}</p>
      )}
      <p className="line-clamp-3 text-slate-300">
        {node.body || <em className="text-slate-500">Destination — AI writes toward this</em>}
      </p>

      <Handle type="source" position={Position.Bottom} className="!bg-purple-400" />
    </div>
  );
}
