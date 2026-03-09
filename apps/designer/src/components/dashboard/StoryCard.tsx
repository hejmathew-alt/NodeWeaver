'use client';

import { useRouter } from 'next/navigation';
import type { VRNStory } from '@void-runner/engine';
import { GENRE_META } from '@void-runner/engine';

interface StoryCardProps {
  story: VRNStory;
  onDelete?: (id: string) => void;
}

export function StoryCard({ story, onDelete }: StoryCardProps) {
  const router = useRouter();
  const genre = GENRE_META[story.metadata.genre];
  const updatedAt = new Date(story.metadata.updatedAt).toLocaleDateString();

  return (
    <div
      className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-400 hover:shadow-lg hover:shadow-slate-200/60"
      style={{ borderLeftColor: genre.theme.nodeStory, borderLeftWidth: 4 }}
      onClick={() => router.push(`/story/${story.id}`)}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">
          {story.metadata.title || 'Untitled Story'}
        </h3>
        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {genre.label}
        </span>
      </div>

      {story.metadata.logline && (
        <p className="mb-3 line-clamp-2 text-sm text-slate-500">
          {story.metadata.logline}
        </p>
      )}

      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span>{story.nodes.length} nodes</span>
        <span>Updated {updatedAt}</span>
      </div>

      {onDelete && (
        <button
          className="absolute right-3 top-3 hidden rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 group-hover:block"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(story.id);
          }}
          aria-label="Delete story"
        >
          ✕
        </button>
      )}
    </div>
  );
}
