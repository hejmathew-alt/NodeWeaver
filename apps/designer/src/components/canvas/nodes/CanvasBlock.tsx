'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { NWVBlock } from '@nodeweaver/engine';

interface CanvasBlockProps {
  id: string;
  block: NWVBlock;
  characterName?: string;
  nodeId: string;
}

export function CanvasBlock({ id, block, characterName, nodeId }: CanvasBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: { nodeId, blockId: block.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const isProse = block.type === 'prose';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="nodrag nopan flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-50 cursor-grab active:cursor-grabbing"
    >
      <span
        className={`shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase leading-none ${
          isProse
            ? 'bg-slate-200 text-slate-500'
            : 'bg-violet-100 text-violet-600'
        }`}
      >
        {isProse ? 'P' : 'L'}
      </span>
      {!isProse && characterName && (
        <span className="max-w-[40px] shrink-0 truncate font-semibold text-violet-600">
          {characterName}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-slate-600">
        {block.text || <em className="text-slate-400">…</em>}
      </span>
    </div>
  );
}

/** Floating drag preview (rendered in DragOverlay) */
export function DragPreview({ block, characterName }: { block: NWVBlock; characterName?: string }) {
  const isProse = block.type === 'prose';
  return (
    <div className="flex items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 shadow-lg text-[10px]">
      <span
        className={`shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase leading-none ${
          isProse
            ? 'bg-slate-200 text-slate-500'
            : 'bg-violet-100 text-violet-600'
        }`}
      >
        {isProse ? 'P' : 'L'}
      </span>
      {!isProse && characterName && (
        <span className="max-w-[60px] shrink-0 truncate font-semibold text-violet-600">
          {characterName}
        </span>
      )}
      <span className="max-w-[160px] truncate text-slate-600">
        {block.text || '…'}
      </span>
    </div>
  );
}
