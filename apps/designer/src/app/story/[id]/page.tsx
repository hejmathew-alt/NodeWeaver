'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStoryStore } from '@/store/story';
import { StoryCanvas } from '@/components/canvas/StoryCanvas';
import { exportStoryToNWV } from '@/lib/export';

export default function StoryEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const activeStory = useStoryStore((s) => s.activeStory);
  const loadStory = useStoryStore((s) => s.loadStory);
  const updateMetadata = useStoryStore((s) => s.updateMetadata);
  const fileHandle = useStoryStore((s) => s.fileHandle);
  const saveToLinkedFile = useStoryStore((s) => s.saveToLinkedFile);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    loadStory(id);
  }, [id, loadStory]);

  // ── Flash helper ──────────────────────────────────────────────────────────

  const flash = useCallback((msg: string) => {
    setSaveStatus(msg);
    setTimeout(() => setSaveStatus(''), 2000);
  }, []);

  // ── Save handlers ─────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const result = await saveToLinkedFile();
    if (result === 'saved' || result === 'saved-as') flash('Saved');
    else if (result === 'fallback') flash('Downloaded');
  }, [saveToLinkedFile, flash]);

  const handleSaveAs = useCallback(async () => {
    const result = await saveToLinkedFile();
    if (result === 'saved-as') flash('Saved');
    else if (result === 'fallback') flash('Downloaded');
  }, [saveToLinkedFile, flash]);

  // ── Cmd+S / Ctrl+S ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveToLinkedFile().then((r) => {
          if (r === 'saved' || r === 'saved-as') flash('Saved');
          else if (r === 'fallback') flash('Downloaded');
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveToLinkedFile, flash]);

  // ── Render ────────────────────────────────────────────────────────────────

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

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {activeStory.nodes.length} nodes · {activeStory.metadata.genre}
          </span>

          {/* Linked filename */}
          {fileHandle && (
            <span className="font-mono text-xs text-slate-400" title="Linked file">
              {fileHandle.name}
            </span>
          )}

          {/* Save status flash */}
          {saveStatus && (
            <span className="text-xs font-medium text-emerald-500">{saveStatus}</span>
          )}

          {/* Save — disabled until a file is linked */}
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleSave}
            disabled={!fileHandle}
            title={fileHandle ? `Save to ${fileHandle.name} (⌘S)` : 'No linked file — use Save As first'}
          >
            Save
          </button>

          {/* Save As — always available */}
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={handleSaveAs}
            title="Save to a new file location"
          >
            Save As…
          </button>

          {/* Export .nwv — kept for sharing / fallback */}
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => exportStoryToNWV(activeStory)}
            title="Download .nwv file"
          >
            Export .nwv
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
