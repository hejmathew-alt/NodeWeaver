'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StoryCard } from '@/components/dashboard/StoryCard';
import { QuickStartModal } from '@/components/dashboard/QuickStartModal';
import { InspireModal } from '@/components/dashboard/InspireModal';
import { SeedAIModal } from '@/components/dashboard/SeedAIModal';
import { GlobalSettingsModal } from '@/components/dashboard/GlobalSettingsModal';
import type { NWVStory, GenreSlug } from '@nodeweaver/engine';
import { NARRATOR_DEFAULT } from '@/store/story';

function createBlankStory(title: string, genre: GenreSlug): NWVStory {
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
    characters: [NARRATOR_DEFAULT],
    lanes: [],
    enemies: {},
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [stories, setStories] = useState<NWVStory[] | undefined>(undefined);

  const refreshStories = useCallback(async () => {
    try {
      const res = await fetch('/api/stories');
      if (res.ok) setStories(await res.json() as NWVStory[]);
    } catch {
      setStories([]);
    }
  }, []);

  useEffect(() => {
    async function init() {
      await refreshStories();
      // One-time silent migration: if server is empty, push IDB stories to server
      try {
        const { db } = await import('@/lib/db');
        const idbStories = await db.stories.toArray();
        if (idbStories.length === 0) return;
        const serverRes = await fetch('/api/stories');
        const serverStories: NWVStory[] = serverRes.ok ? await serverRes.json() : [];
        if (serverStories.length > 0) return; // server already has data
        await Promise.all(
          idbStories.map((s) =>
            fetch(`/api/stories/${encodeURIComponent(s.id)}`, {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(s),
            }).catch(() => {}),
          ),
        );
        await refreshStories();
      } catch (err) {
        console.warn('[migration] IDB→server migration failed:', err);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showNewModal, setShowNewModal] = useState(false);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [showInspire, setShowInspire] = useState(false);
  const [showSeedAI, setShowSeedAI] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState<GenreSlug>('sci-fi');

  const handleCreate = useCallback(async () => {
    const story = createBlankStory(newTitle || 'Untitled Story', newGenre);
    await fetch('/api/stories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(story),
    });
    setShowNewModal(false);
    setNewTitle('');
    router.push(`/story/${story.id}`);
  }, [newTitle, newGenre, router]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirm('Delete this story? This cannot be undone.')) {
      await fetch(`/api/stories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      refreshStories();
    }
  }, [refreshStories]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const story = JSON.parse(text) as NWVStory;
        story.metadata.updatedAt = new Date().toISOString();
        // If this story already exists on the server, navigate to it directly.
        const existingRes = await fetch(`/api/stories/${encodeURIComponent(story.id)}`);
        if (existingRes.ok) {
          router.push(`/story/${story.id}`);
        } else {
          await fetch('/api/stories', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(story),
          });
          refreshStories();
          router.push(`/story/${story.id}`);
        }
      } catch {
        alert('Failed to import — invalid .nwv file');
      }
      e.target.value = '';
    },
    [router, refreshStories],
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            NodeWeaver
          </h1>
          <p className="mt-1 text-slate-500">Visual story weaving tool</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowGlobalSettings(true)}
            className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:border-slate-400 hover:text-slate-900">
            Import .nwv
            <input
              type="file"
              accept=".nwv,.vrn,.json"
              className="hidden"
              onChange={handleImport}
            />
          </label>
          <button
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
            onClick={() => setShowSeedAI(true)}
          >
            🌱 Seed AI
          </button>
          <button
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
            onClick={() => setShowInspire(true)}
          >
            ✦ Inspire Me
          </button>
          <button
            className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
            onClick={() => setShowQuickStart(true)}
          >
            ✨ Quick Start
          </button>
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
          <p className="text-xl text-slate-500">No stories yet</p>
          <p className="text-slate-400 text-sm max-w-sm">
            Use <strong className="text-violet-600">✨ Quick Start</strong> to let AI generate your first story structure, or create a blank canvas with <strong className="text-slate-600">+ New Story</strong>.
          </p>
          <button
            className="mt-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
            onClick={() => setShowQuickStart(true)}
          >
            ✨ Quick Start
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Seed AI modal */}
      {showSeedAI && (
        <SeedAIModal
          onClose={() => setShowSeedAI(false)}
          onStoriesChanged={refreshStories}
        />
      )}

      {/* Global settings modal */}
      {showGlobalSettings && (
        <GlobalSettingsModal onClose={() => setShowGlobalSettings(false)} />
      )}

      {/* Inspire modal */}
      {showInspire && (
        <InspireModal
          onClose={() => setShowInspire(false)}
          onStoriesChanged={refreshStories}
          existingTitles={(stories ?? []).map(s => s.metadata.title).filter(Boolean)}
        />
      )}

      {/* Quick Start modal */}
      {showQuickStart && (
        <QuickStartModal onClose={() => setShowQuickStart(false)} onStoriesChanged={refreshStories} />
      )}

      {/* New story modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              New Story
            </h2>
            <div className="mb-4">
              <label className="mb-1 block text-sm text-slate-500">Title</label>
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Untitled Story"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="mb-6">
              <label className="mb-1 block text-sm text-slate-500">Genre</label>
              <select
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value as GenreSlug)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="sci-fi">Sci-Fi</option>
                <option value="fantasy">Fantasy</option>
                <option value="horror">Horror</option>
                <option value="mystery-noir">Mystery / Noir</option>
                <option value="post-apocalyptic">Post-Apocalyptic</option>
                <option value="cyberpunk">Cyberpunk</option>
                <option value="comedy">Comedy</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-slate-900"
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
