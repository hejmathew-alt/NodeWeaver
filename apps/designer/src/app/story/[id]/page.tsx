'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStoryStore } from '@/store/story';
import { StoryCanvas } from '@/components/canvas/StoryCanvas';

export default function StoryEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { activeStory, loadStory } = useStoryStore();

  useEffect(() => {
    loadStory(id);
  }, [id, loadStory]);

  if (!activeStory) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Loading story...
      </div>
    );
  }

  if (activeStory.id !== id) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 text-slate-400">
        <p>Story not found.</p>
        <button
          className="text-sm text-blue-400 hover:underline"
          onClick={() => router.push('/')}
        >
          ← Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            className="text-sm text-slate-400 hover:text-white"
            onClick={() => router.push('/')}
          >
            ← Stories
          </button>
          <span className="text-slate-600">/</span>
          <span className="text-sm font-medium text-white">
            {activeStory.metadata.title || 'Untitled Story'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{activeStory.nodes.length} nodes</span>
          <span>·</span>
          <span>{activeStory.metadata.genre}</span>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        {activeStory.nodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-lg text-slate-400">Canvas is empty</p>
            <p className="text-sm text-slate-600">
              Node creation coming in the next session.
            </p>
          </div>
        ) : (
          <StoryCanvas story={activeStory} />
        )}
      </div>
    </div>
  );
}
