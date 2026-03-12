'use client';

import { useMemo } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import type { NWVBlock } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { CanvasBlock } from './CanvasBlock';

export function BlocksPreview({ nodeId, blocks }: { nodeId: string; blocks: NWVBlock[] }) {
  const characters = useStoryStore((s) => s.activeStory?.characters ?? []);

  // Stable sortable IDs — prefixed to avoid collision with side panel
  const sortableIds = useMemo(
    () => blocks.map((b) => `canvas-${b.id}`),
    [blocks],
  );

  const { setNodeRef: setDropRef } = useDroppable({
    id: `droppable-${nodeId}`,
    data: { nodeId },
  });

  if (!blocks.length) {
    return (
      <div ref={setDropRef} className="flex h-full items-center justify-center">
        <em className="text-slate-400">No content yet</em>
      </div>
    );
  }

  return (
    <div ref={setDropRef} className="space-y-0 overflow-hidden">
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {blocks.map((block) => {
          const char = block.characterId
            ? characters.find((c) => c.id === block.characterId)
            : undefined;
          const charName = char?.name ?? (block.characterId ? block.characterId.slice(0, 8) : undefined);
          return (
            <CanvasBlock
              key={block.id}
              id={`canvas-${block.id}`}
              block={block}
              characterName={charName}
              nodeId={nodeId}
            />
          );
        })}
      </SortableContext>
    </div>
  );
}
