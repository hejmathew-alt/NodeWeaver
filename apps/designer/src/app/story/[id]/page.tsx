'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStoryStore } from '@/store/story';
import { StoryCanvas } from '@/components/canvas/StoryCanvas';
import { exportStoryToNWV } from '@/lib/export';
import { PlayMode } from '@/components/PlayMode';
import { FinaliseModal } from '@/components/FinaliseModal';
import { CanvasPlayer } from '@/components/CanvasPlayer';
import { VoiceHUD } from '@/components/VoiceHUD';
import { AVFXPlayView } from '@/components/AVFXPlayView';
import { AVFXPanel } from '@/components/AVFXPanel';
import { CharactersPage } from '@/components/pages/CharactersPage';
import { EncountersPage } from '@/components/pages/EncountersPage';
import { useSettingsStore } from '@/lib/settings';

export default function StoryEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const activeStory = useStoryStore((s) => s.activeStory);
  const loadStory = useStoryStore((s) => s.loadStory);
  const updateMetadata = useStoryStore((s) => s.updateMetadata);
  const fileHandle = useStoryStore((s) => s.fileHandle);
  const saveToLinkedFile = useStoryStore((s) => s.saveToLinkedFile);
  const setSelectedPanel = useStoryStore((s) => s.setSelectedPanel);
  const selectedPanel = useStoryStore((s) => s.selectedPanel);
  const activeView = useStoryStore((s) => s.activeView);
  const setActiveView = useStoryStore((s) => s.setActiveView);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [playMode, setPlayMode] = useState(false);
  const [playStartNodeId, setPlayStartNodeId] = useState<string | undefined>(undefined);
  const [showFinalise, setShowFinalise] = useState(false);
  const [finaliseProvider, setFinaliseProvider] = useState<'qwen' | 'elevenlabs'>('qwen');
  const [finaliseMenuOpen, setFinaliseMenuOpen] = useState(false);
  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);
  const avfxMode = useStoryStore((s) => s.avfxMode);
  const setAVFXMode = useStoryStore((s) => s.setAVFXMode);

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

          {/* Finalise for Release — split button */}
          <div className="relative flex">
            <button
              className="rounded-l border border-emerald-400 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              onClick={() => { setFinaliseMenuOpen(false); setShowFinalise(true); }}
              title={`Finalise with ${finaliseProvider === 'qwen' ? 'Qwen' : 'ElevenLabs'}`}
            >
              <span className="inline-flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /></svg>
                Finalise · {finaliseProvider === 'qwen' ? 'Qwen' : 'ElevenLabs'}
              </span>
            </button>
            <button
              className="rounded-r border border-l-0 border-emerald-400 bg-emerald-50 px-1.5 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
              onClick={() => setFinaliseMenuOpen((o) => !o)}
              title="Switch finalise provider"
            >
              ▾
            </button>
            {finaliseMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded border border-slate-200 bg-white py-1 shadow-lg">
                {(['qwen', 'elevenlabs'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setFinaliseProvider(p); setFinaliseMenuOpen(false); setShowFinalise(true); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 ${finaliseProvider === p ? 'font-semibold text-emerald-700' : 'text-slate-700'}`}
                  >
                    {finaliseProvider === p && <span className="text-emerald-500">✓</span>}
                    {finaliseProvider !== p && <span className="w-3" />}
                    {p === 'qwen' ? 'Qwen (local)' : 'ElevenLabs'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Play / Exit AV FX — mutually exclusive */}
          {avfxMode ? (
            <button
              className="rounded border border-violet-400 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
              onClick={() => setAVFXMode(false)}
              title="Exit Audio Visual FX mode"
            >
              ✕ Exit AV FX
            </button>
          ) : (
            <button
              className="rounded border border-violet-400 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => { setPlayStartNodeId(undefined); setPlayMode(true); }}
              disabled={!activeStory.nodes.some((n) => n.type === 'start')}
              title={activeStory.nodes.some((n) => n.type === 'start') ? 'Play story from start' : 'Add a Start node to enable playback'}
            >
              <span className="inline-flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                Play
              </span>
            </button>
          )}

          {/* Save */}
          <button
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={handleSave}
            title={fileHandle ? `Save to ${fileHandle.name} (⌘S)` : 'Save (will prompt for file location)'}
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

          {/* Settings cog */}
          <button
            onClick={() => setSelectedPanel(selectedPanel === 'settings' ? null : 'settings')}
            className={`rounded border p-1.5 transition-colors ${selectedPanel === 'settings' ? 'border-slate-500 bg-slate-600 text-white' : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
            title="Settings"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Canvas / AV FX split view */}
      {avfxMode ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="relative" style={{ height: '55%' }}>
            <AVFXPlayView story={activeStory} />
          </div>
          <div style={{ height: '45%' }} className="border-t border-slate-800">
            <AVFXPanel story={activeStory} />
          </div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-hidden">
          {/* Canvas — always mounted to preserve React Flow state */}
          <div className={`absolute inset-0 transition-opacity duration-250 ${
            activeView === 'canvas' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}>
            <StoryCanvas story={activeStory} onToggleAVFX={() => setAVFXMode(true)} />
            <CanvasPlayer story={activeStory} />
            {voiceEnabled && <VoiceHUD story={activeStory} />}
          </div>

          {/* Characters full-screen page */}
          {activeView === 'characters' && (
            <div className="absolute inset-0 animate-fadeIn">
              <CharactersPage />
            </div>
          )}

          {/* Encounters full-screen page */}
          {activeView === 'encounters' && (
            <div className="absolute inset-0 animate-fadeIn">
              <EncountersPage />
            </div>
          )}
        </div>
      )}

      {/* Play mode overlay */}
      {playMode && (
        <PlayMode story={activeStory} startNodeId={playStartNodeId} onExit={() => { setPlayMode(false); setPlayStartNodeId(undefined); }} />
      )}

      {/* Finalise for Release modal */}
      {showFinalise && (
        <FinaliseModal story={activeStory} provider={finaliseProvider} onClose={() => setShowFinalise(false)} />
      )}
    </div>
  );
}
