'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { StoryCard } from '@/components/dashboard/StoryCard';
import type { VRNStory, GenreSlug } from '@void-runner/engine';

function createBlankStory(title: string, genre: GenreSlug): VRNStory {
  return {
    version: '1.0',
    id: `story-${Date.now()}`,
    metadata: {
      title,
      genre,
      logline: '',
      targetTone: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    nodes: [],
    characters: [],
    lanes: [],
    enemies: {},
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const stories = useLiveQuery(() => db.stories.toArray(), []);

  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState<GenreSlug>('sci-fi');

  const handleCreate = useCallback(async () => {
    const story = createBlankStory(newTitle || 'Untitled Story', newGenre);
    await db.stories.add(story);
    setShowNewModal(false);
    setNewTitle('');
    router.push(`/story/${story.id}`);
  }, [newTitle, newGenre, router]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Delete this story? This cannot be undone.')) {
      await db.stories.delete(id);
    }
  }, []);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const story = JSON.parse(text) as VRNStory;
        story.id = `story-${Date.now()}-imported`;
        story.metadata.updatedAt = new Date().toISOString();
        await db.stories.add(story);
        router.push(`/story/${story.id}`);
      } catch {
        alert('Failed to import — invalid .vrn file');
      }
      e.target.value = '';
    },
    [router]
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Narrative Designer
          </h1>
          <p className="mt-1 text-slate-400">Void Runner story tree editor</p>
        </div>
        <div className="flex gap-3">
          <label className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-400 hover:text-white">
            Import .vrn
            <input
              type="file"
              accept=".vrn,.json"
              className="hidden"
              onChange={handleImport}
            />
          </label>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            onClick={() => setShowNewModal(true)}
          >
            + New Story
          </button>
        </div>
      </div>

      {/* Story grid */}
      {stories === undefined ? (
        <p className="text-slate-500">Loading...</p>
      ) : stories.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <p className="text-xl text-slate-400">No stories yet</p>
          <p className="text-slate-500">
            Create a new story or import a .vrn file to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* New story modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold text-white">
              New Story
            </h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-slate-400">Title</label>
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Untitled Story"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="mb-6">
              <label className="mb-1 block text-sm text-slate-400">Genre</label>
              <select
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value as GenreSlug)}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="sci-fi">Sci-Fi</option>
                <option value="fantasy">Fantasy</option>
                <option value="horror">Horror</option>
                <option value="mystery-noir">Mystery / Noir</option>
                <option value="post-apocalyptic">Post-Apocalyptic</option>
                <option value="cyberpunk">Cyberpunk</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white"
                onClick={() => setShowNewModal(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                onClick={handleCreate}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
