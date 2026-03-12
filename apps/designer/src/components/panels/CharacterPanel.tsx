'use client';

import { useState, useRef, useEffect } from 'react';
import type { VRNCharacter } from '@void-runner/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { charSeed } from '@/lib/char-seed';

// ── Character list row ────────────────────────────────────────────────────────

function CharacterRow({
  character,
  isSelected,
  onSelect,
}: {
  character: VRNCharacter;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isNarrator = character.id === 'narrator';

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
        isSelected
          ? 'bg-violet-50 text-violet-900'
          : 'hover:bg-slate-50 text-slate-700'
      }`}
    >
      <span className="text-base leading-none">{isNarrator ? '🎙' : '👤'}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{character.name || 'Unnamed'}</div>
        {character.role && (
          <div className="truncate text-xs text-slate-400">{character.role}</div>
        )}
      </div>
      {character.voiceLocked && (
        <span className="shrink-0 text-xs text-violet-400" title="Voice locked">🔒</span>
      )}
      <span className="shrink-0 font-mono text-[10px] text-slate-300">{character.id}</span>
    </button>
  );
}

// ── Character editor ──────────────────────────────────────────────────────────

function CharacterEditor({ character }: { character: VRNCharacter }) {
  const { updateCharacter, deleteCharacter } = useStoryStore();
  const { anthropicKey } = useSettingsStore();
  const [testing, setTesting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [draftInstruct, setDraftInstruct] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop any in-flight request and audio when switching characters
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const isNarrator = character.id === 'narrator';
  const isLocked = !!character.voiceLocked;

  const up = (patch: Partial<VRNCharacter>) => updateCharacter(character.id, patch);

  // ── AI voice description generator ─────────────────────────────────────────

  async function handleAiGenerate() {
    setAiError(null);
    setAiLoading(true);
    setDraftInstruct('');

    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'voice',
        prompt: character.qwenInstruct?.trim() ?? '',
        anthropicKey,
      }),
    }).catch(() => null);

    if (!res?.ok || !res.body) {
      const err = await res?.json().catch(() => null);
      setAiError(err?.error ?? 'AI generation failed.');
      setAiLoading(false);
      setDraftInstruct(null);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setDraftInstruct(accumulated);
      }
    } finally {
      if (accumulated) up({ qwenInstruct: accumulated });
      setDraftInstruct(null);
      setAiLoading(false);
    }
  }

  // ── Voice tester — same approach as the game's /admin panel ────────────────
  // Fetches a full WAV from /api/qwen/speak then plays it with new Audio().
  // Simple and reliable; matches exactly what the game uses.

  async function handleTestVoice() {
    const instruct = character.qwenInstruct?.trim();
    if (!instruct) {
      setTestError('Enter a voice description first.');
      return;
    }
    setTestError(null);

    // Stop any in-progress test
    abortRef.current?.abort();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setTesting(true);
    setPlaying(false);

    let objectUrl: string | null = null;
    try {
      const res = await fetch('/api/qwen/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: `This is ${character.name || 'the character'} speaking. The signal is clear.`,
          instruct,
          seed: charSeed(character.id),
          temperature: 0.7,
          max_tokens: 250,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setTestError(err.error ?? 'Qwen failed.');
        setTesting(false);
        return;
      }

      const blob = await res.blob();
      if (ctrl.signal.aborted) return;

      objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      setPlaying(true);

      audio.onended = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        audioRef.current = null;
        setPlaying(false);
        setTesting(false);
      };
      audio.onerror = () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        audioRef.current = null;
        setPlaying(false);
        setTesting(false);
        setTestError('Audio playback failed.');
      };
      audio.play();
    } catch {
      if (!ctrl.signal.aborted) {
        setTestError('Could not reach Qwen. Is it starting up?');
        setTesting(false);
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Name
        </label>
        <input
          className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
          value={character.name}
          onChange={(e) => up({ name: e.target.value })}
          placeholder="Character name…"
          disabled={isLocked}
        />
      </div>

      {/* Role */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Role
        </label>
        <input
          className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 focus:border-violet-400 focus:outline-none"
          value={character.role}
          onChange={(e) => up({ role: e.target.value })}
          placeholder="e.g. ECHO — ship AI"
        />
      </div>

      {/* Voice design (Qwen instruct) */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Voice Description
          </label>
          <button
            onClick={handleAiGenerate}
            disabled={aiLoading || isLocked}
            title="Generate voice description with AI"
            className="rounded px-2 py-0.5 text-[10px] font-medium text-violet-500 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"
          >
            {aiLoading ? '⟳ generating…' : '✦ AI'}
          </button>
        </div>
        <textarea
          className={`w-full rounded border bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-violet-400 focus:outline-none ${
            isLocked ? 'cursor-not-allowed border-slate-200 opacity-60' : 'border-slate-200'
          }`}
          rows={6}
          value={draftInstruct ?? character.qwenInstruct ?? ''}
          onChange={(e) => { if (!aiLoading) up({ qwenInstruct: e.target.value }); }}
          readOnly={isLocked || aiLoading}
          placeholder="e.g. A calm, low-pitched voice with a slight digital edge. Measured and precise. Studio quality."
        />

        {aiError && <p className="mt-1.5 text-xs text-red-500">{aiError}</p>}
        {testError && <p className="mt-1.5 text-xs text-red-500">{testError}</p>}

        <div className="mt-2 flex gap-2">
          <button
            onClick={handleTestVoice}
            disabled={testing}
            className="flex-1 rounded border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50"
          >
            {playing ? '🔊 Playing…' : testing ? '⏳ Generating…' : '▶ Test Voice'}
          </button>

          <button
            onClick={() => up({ voiceLocked: !isLocked })}
            className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
              isLocked
                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {isLocked ? '🔓 Unlock' : '🔒 Lock Voice'}
          </button>
        </div>

        {isLocked && (
          <p className="mt-1.5 text-[11px] text-violet-500">
            Voice locked — seed {charSeed(character.id)} · unlock to edit
          </p>
        )}
      </div>

      {/* Delete */}
      {!isNarrator && (
        <div className="border-t border-slate-100 pt-3">
          <button
            onClick={() => deleteCharacter(character.id)}
            className="w-full rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            🗑 Delete character
          </button>
        </div>
      )}
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────

interface PanelSizeProps {
  panelWidth: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function CharacterPanel({ panelWidth, isExpanded, onToggleExpand, onResizeStart }: PanelSizeProps) {
  const { activeStory, selectedCharacterId, setSelectedPanel, setSelectedCharacter, addCharacter } =
    useStoryStore();

  if (!activeStory) return null;

  const characters = activeStory.characters;
  const selected = characters.find((c) => c.id === selectedCharacterId) ?? null;

  // Auto-select Narrator if nothing selected
  const displaySelected =
    selected ?? characters.find((c) => c.id === 'narrator') ?? characters[0] ?? null;

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-violet-100 bg-white" style={{ width: panelWidth }}>
      {/* Resize handle — left edge */}
      <div
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-violet-300"
        onMouseDown={onResizeStart}
        title="Drag to resize"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">Characters</span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
            {characters.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleExpand}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '⤡' : '⤢'}
          </button>
          <button
            onClick={() => setSelectedPanel(null)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Character list */}
      <div className="border-b border-slate-200 p-2">
        <div className="space-y-0.5">
          {/* Narrator pinned first */}
          {characters
            .filter((c) => c.id === 'narrator')
            .map((c) => (
              <CharacterRow
                key={c.id}
                character={c}
                isSelected={displaySelected?.id === c.id}
                onSelect={() => setSelectedCharacter(c.id)}
              />
            ))}

          {/* Other characters */}
          {characters
            .filter((c) => c.id !== 'narrator')
            .map((c) => (
              <CharacterRow
                key={c.id}
                character={c}
                isSelected={displaySelected?.id === c.id}
                onSelect={() => setSelectedCharacter(c.id)}
              />
            ))}
        </div>

        <button
          onClick={() => { addCharacter(); }}
          className="mt-2 w-full rounded border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-violet-400 hover:text-violet-600"
        >
          + Add Character
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        {displaySelected ? (
          <>
            <div className="border-b border-slate-100 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Editing: {displaySelected.name || 'Unnamed'}
              </span>
            </div>
            <CharacterEditor key={displaySelected.id} character={displaySelected} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="text-3xl">👤</span>
            <p className="text-sm text-slate-500">Select a character to edit</p>
          </div>
        )}
      </div>
    </aside>
  );
}
