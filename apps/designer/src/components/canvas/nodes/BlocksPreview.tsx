'use client';

import type { VRNBlock } from '@void-runner/engine';
import { useStoryStore } from '@/store/story';

export function BlocksPreview({ blocks }: { blocks: VRNBlock[] }) {
  const characters = useStoryStore((s) => s.activeStory?.characters ?? []);

  if (!blocks.length) {
    return <em className="text-slate-400">No content yet</em>;
  }

  return (
    <div className="space-y-0.5 overflow-hidden">
      {blocks.map((block) => {
        if (block.type === 'prose') {
          return (
            <p key={block.id} className="leading-snug text-slate-600">
              {block.text || <em className="text-slate-400">…</em>}
            </p>
          );
        }
        // line block
        const char = characters.find((c) => c.id === block.characterId);
        const name = char?.name ?? (block.characterId ? block.characterId.slice(0, 8) : 'Char');
        return (
          <div key={block.id} className="flex items-baseline gap-1">
            <span className="max-w-[52px] shrink-0 truncate font-semibold text-violet-600">
              {name}
            </span>
            <span className="italic text-slate-600">
              {block.text || '…'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
