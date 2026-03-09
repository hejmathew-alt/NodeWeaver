'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStoryStore } from '@/store/story';
import { StoryCanvas } from '@/components/canvas/StoryCanvas';
import { exportStoryToVRN } from '@/lib/export';

export default function StoryEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { activeStory, loadStory, updateMetadata } = useStoryStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

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
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            className="text-sm text-slate-500 hover:text-slate-900"
            onClick={() => router.push('/')}
          >
            ← Stories
          </button>
          <span className="text-slate-300">/</span>

          {editingTitle ? (
            <input
              autoFocus
              className="rounded bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                updateMetadata({ title: titleDraft.trim() || 'Untitled Story' });
                setEditingTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
            />
          ) : (
            <button
              className="rounded px-1 text-sm font-medium text-slate-900 hover:bg-slate-100"
              onClick={() => {
                setTitleDraft(activeStory.metadata.title || '');
                setEditingTitle(true);
              }}
            >
              {activeStory.metadata.title || 'Untitled Story'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {activeStory.nodes.length} nodes · {activeStory.metadata.genre}
          </span>
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => exportStoryToVRN(activeStory)}
          >
            Export .vrn
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        <StoryCanvas story={activeStory} />
      </div>
    </div>
  );
}
