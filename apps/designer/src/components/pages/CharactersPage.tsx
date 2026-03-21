'use client';

import { useState, useRef, useEffect } from 'react';
import type { NWVCharacter, NWVNode, ArtStyle, GenreSlug } from '@nodeweaver/engine';
import { GENRE_META } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { charSeed } from '@/lib/char-seed';
import { EMOTION_OPTIONS, TONE_OPTIONS, VOICE_TEXTURE_OPTIONS } from '@/lib/character-options';
import { ART_STYLE_LABELS } from '@/lib/comfyui';

const FALLBACK_LINES = GENRE_META.custom.voiceTestLines;
function pickTestLine(genre?: GenreSlug): string {
  const lines = (genre && GENRE_META[genre]?.voiceTestLines) || FALLBACK_LINES;
  return lines[Math.floor(Math.random() * lines.length)];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findNodesForCharacter(characterId: string, nodes: NWVNode[]) {
  return nodes
    .filter((n) => (n.blocks ?? []).some((b) => b.characterId === characterId))
    .map((n) => ({ nodeId: n.id, title: n.title || 'Untitled' }));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── Character Card ───────────────────────────────────────────────────────────

function CharacterCard({
  character,
  nodes,
}: {
  character: NWVCharacter;
  nodes: NWVNode[];
}) {
  const updateCharacter = useStoryStore((s) => s.updateCharacter);
  const deleteCharacter = useStoryStore((s) => s.deleteCharacter);
  const setActiveView = useStoryStore((s) => s.setActiveView);
  const setSelectedNode = useStoryStore((s) => s.setSelectedNode);
  const activeStory = useStoryStore((s) => s.activeStory);
  const { anthropicKey, comfyuiUrl, comfyuiModel, qwenTemperature, elevenLabsKey } = useSettingsStore();
  const [expanded, setExpanded] = useState(false);
  const [showPortraitEditor, setShowPortraitEditor] = useState(false);
  const [roleEditing, setRoleEditing] = useState(false);
  const [backstoryEditing, setBackstoryEditing] = useState(false);

  // Avatar state
  const [avatarGenerating, setAvatarGenerating] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarAiLoading, setAvatarAiLoading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewSeed, setAvatarPreviewSeed] = useState<number | null>(null);
  const [avatarAccepting, setAvatarAccepting] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [voiceAiLoading, setVoiceAiLoading] = useState(false);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceTestError, setVoiceTestError] = useState<string | null>(null);
  const [elDesigning, setElDesigning] = useState(false);
  const [elCreating, setElCreating] = useState(false);
  const [elError, setElError] = useState<string | null>(null);
  const [elGeneratedVoiceId, setElGeneratedVoiceId] = useState<string | null>(null);
  const [elPreviewUrl, setElPreviewUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setElPreviewUrl((url) => { if (url) URL.revokeObjectURL(url); return null; });
    };
  }, []);

  const isNarrator = character.id === 'narrator';
  const isLocked = !!character.voiceLocked;
  const up = (patch: Partial<NWVCharacter>) => updateCharacter(character.id, patch);
  const appearsIn = findNodesForCharacter(character.id, nodes);

  const avatarSrc = activeStory && character.avatarFile
    ? `/api/stories/${encodeURIComponent(activeStory.id)}/avatar?file=${encodeURIComponent(character.avatarFile)}`
    : null;

  // ── Avatar handlers ────────────────────────────────────────────────────────

  async function handleAvatarAiPrompt() {
    setAvatarError(null);
    setAvatarAiLoading(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'avatar-prompt',
          prompt: '',
          anthropicKey,
          context: {
            name: character.name,
            role: character.role,
            backstory: character.backstory,
            traits: character.traits,
          },
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => null); setAvatarError(err?.error ?? 'AI failed.'); return; }
      const { text } = await res.json() as { text: string };
      if (text) up({ avatarPrompt: text });
    } finally {
      setAvatarAiLoading(false);
    }
  }

  async function handleAvatarGenerate() {
    const prompt = character.avatarPrompt?.trim();
    if (!prompt) { setAvatarError('Enter a portrait description first.'); return; }
    setAvatarError(null);
    setAvatarGenerating(true);
    if (avatarPreviewUrl) { URL.revokeObjectURL(avatarPreviewUrl); setAvatarPreviewUrl(null); }
    try {
      const seed = undefined; // always fresh — lock character to prevent regeneration
      const res = await fetch('/api/avatar/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          artStyle: activeStory?.metadata?.artStyle ?? 'realistic',
          seed,
          comfyuiUrl,
          comfyuiModel,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => null); setAvatarError(err?.error ?? 'Generation failed.'); return; }
      const usedSeed = Number(res.headers.get('x-used-seed') ?? 0);
      const blob = await res.blob();
      setAvatarPreviewUrl(URL.createObjectURL(blob));
      setAvatarPreviewSeed(usedSeed || null);
    } catch {
      setAvatarError('Could not reach ComfyUI. Is it running?');
    } finally {
      setAvatarGenerating(false);
    }
  }

  async function handleAvatarAccept() {
    if (!avatarPreviewUrl || !activeStory) return;
    setAvatarAccepting(true);
    try {
      const res = await fetch(avatarPreviewUrl);
      const buf = await res.arrayBuffer();
      const filename = `avatar-${character.id}.png`;
      await fetch(`/api/stories/${encodeURIComponent(activeStory.id)}/avatar?file=${encodeURIComponent(filename)}`, {
        method: 'PUT', headers: { 'content-type': 'image/png' }, body: buf,
      });
      URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(null);
      up({ avatarFile: filename, avatarSeed: avatarPreviewSeed ?? undefined });
      setAvatarPreviewSeed(null);
    } catch { setAvatarError('Failed to save avatar.'); }
    finally { setAvatarAccepting(false); }
  }

  function handleAvatarDiscard() {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarPreviewUrl(null);
    setAvatarPreviewSeed(null);
  }

  async function handleAvatarUpload(file: File) {
    if (!activeStory) return;
    setAvatarError(null);
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.src = objUrl;
    await new Promise<void>((resolve) => { img.onload = () => resolve(); });
    URL.revokeObjectURL(objUrl);
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    canvas.getContext('2d')!.drawImage(img, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { setAvatarError('Image conversion failed.'); return; }
    const filename = `avatar-${character.id}.png`;
    await fetch(`/api/stories/${encodeURIComponent(activeStory.id)}/avatar?file=${encodeURIComponent(filename)}`, {
      method: 'PUT', headers: { 'content-type': 'image/png' }, body: await blob.arrayBuffer(),
    });
    up({ avatarFile: filename, avatarSeed: undefined });
  }

  async function handleAvatarRemove() {
    if (!activeStory || !character.avatarFile) return;
    await fetch(`/api/stories/${encodeURIComponent(activeStory.id)}/avatar?file=${encodeURIComponent(character.avatarFile)}`, { method: 'DELETE' });
    up({ avatarFile: undefined, avatarSeed: undefined });
  }

  async function handleTestVoice() {
    const instruct = character.qwenInstruct?.trim();
    if (!instruct) { setVoiceTestError('Enter a voice description first.'); return; }
    setVoiceTestError(null);
    abortRef.current?.abort();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setVoiceTesting(true); setVoicePlaying(false);
    let objectUrl: string | null = null;
    try {
      const res = await fetch('/api/qwen/speak', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: pickTestLine(activeStory?.metadata?.genre as GenreSlug | undefined),
          instruct,
          seed: charSeed(character.id),
          temperature: qwenTemperature,
          max_tokens: 250,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) { const e = await res.json().catch(() => null); setVoiceTestError(e?.error ?? `HTTP ${res.status}`); return; }
      const blob = await res.blob();
      if (ctrl.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      setVoicePlaying(true);
      const cleanup = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); audioRef.current = null; setVoicePlaying(false); setVoiceTesting(false); };
      audio.onended = cleanup;
      audio.onerror = () => { cleanup(); setVoiceTestError('Playback failed.'); };
      audio.play();
    } catch { if (!ctrl.signal.aborted) { setVoiceTestError('Could not reach Qwen.'); setVoiceTesting(false); } if (objectUrl) URL.revokeObjectURL(objectUrl); }
  }

  function handleStopVoice() {
    abortRef.current?.abort();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setVoicePlaying(false); setVoiceTesting(false);
  }

  async function handleDesignVoice() {
    const desc = character.elevenLabsDescription?.trim();
    if (!desc) { setElError('Enter a voice description first.'); return; }
    setElError(null); setElGeneratedVoiceId(null);
    // Revoke any previous preview URL
    if (elPreviewUrl) { URL.revokeObjectURL(elPreviewUrl); setElPreviewUrl(null); }
    abortRef.current?.abort();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setElDesigning(true); setVoicePlaying(false);
    try {
      const res = await fetch('/api/elevenlabs/voice-design', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          voiceDescription: desc,
          accent: character.elevenLabsAccent,
          gender: character.elevenLabsGender,
          text: pickTestLine(activeStory?.metadata?.genre as GenreSlug | undefined),
          elevenLabsKey,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) { const e = await res.json().catch(() => null); setElError(e?.error ?? 'Voice design failed.'); return; }
      const generatedVoiceId = res.headers.get('x-generated-voice-id') ?? '';
      setElGeneratedVoiceId(generatedVoiceId || null);
      const blob = await res.blob();
      if (ctrl.signal.aborted) return;
      // Store URL for explicit user-gesture playback — don't auto-play (browser blocks it after async fetch)
      setElPreviewUrl(URL.createObjectURL(blob));
    } catch { if (!ctrl.signal.aborted) setElError('Could not reach ElevenLabs.'); }
    finally { setElDesigning(false); }
  }

  function handlePlayPreview() {
    if (!elPreviewUrl) return;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const audio = new Audio(elPreviewUrl);
    audioRef.current = audio;
    setVoicePlaying(true);
    const cleanup = () => { audioRef.current = null; setVoicePlaying(false); };
    audio.onended = cleanup;
    audio.onerror = cleanup;
    audio.play().catch(() => { cleanup(); setElError('Playback failed.'); });
  }

  async function handleCreateVoice() {
    if (!elGeneratedVoiceId) return;
    if (!character.name?.trim()) { setElError('Give this character a name before saving the voice.'); return; }
    setElCreating(true); setElError(null);
    try {
      const res = await fetch('/api/elevenlabs/voice-create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ generatedVoiceId: elGeneratedVoiceId, voiceName: character.name, elevenLabsKey }),
      });
      if (!res.ok) { const e = await res.json().catch(() => null); setElError(e?.error ?? 'Voice save failed.'); return; }
      const { voiceId } = await res.json() as { voiceId: string };
      up({ elevenLabsVoiceId: voiceId, voiceLocked: false });
      setElGeneratedVoiceId(null);
    } catch { setElError('Could not save voice.'); }
    finally { setElCreating(false); }
  }

  async function handleVoiceAi() {
    setVoiceAiLoading(true);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'voice',
          prompt: [character.name, character.role, character.backstory, character.traits].filter(Boolean).join('. '),
          anthropicKey,
          context: { name: character.name, role: character.role },
        }),
      });
      if (!res.ok) return;
      const text = await res.text();
      const provider = character.ttsProvider ?? 'qwen';
      if (provider === 'qwen') up({ qwenInstruct: text });
      else up({ elevenLabsDescription: text });
    } finally {
      setVoiceAiLoading(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Card header */}
      <div className="flex items-center gap-4 px-5 pt-5 pb-3">
        {/* Avatar circle — camera overlay on hover when unlocked */}
        <div className="relative shrink-0 group">
          {(avatarPreviewUrl || avatarSrc) ? (
            <img
              src={avatarPreviewUrl ?? avatarSrc!}
              alt={character.name}
              className="h-16 w-16 rounded-full object-cover object-top border border-slate-200"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 text-lg font-bold text-violet-600">
              {initials(character.name || 'NC')}
            </div>
          )}
          {/* Camera hover overlay — unlocked only */}
          {!isLocked && (
            <button
              onClick={() => setShowPortraitEditor((v) => !v)}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Edit portrait"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Name */}
          <input
            className="w-full bg-transparent text-lg font-semibold text-slate-900 placeholder-slate-300 focus:outline-none disabled:opacity-60"
            value={character.name}
            onChange={(e) => up({ name: e.target.value })}
            placeholder="Character name..."
            disabled={isLocked}
          />
          {/* Role — clamped display, click to edit */}
          {roleEditing && !isLocked ? (
            <textarea
              autoFocus
              rows={3}
              className="mt-0.5 w-full resize-none bg-transparent text-sm text-slate-500 placeholder-slate-300 focus:outline-none"
              value={character.role}
              onChange={(e) => up({ role: e.target.value })}
              onBlur={() => setRoleEditing(false)}
              placeholder="Role description..."
            />
          ) : (
            <p
              className={`mt-0.5 text-sm text-slate-500 line-clamp-2 leading-snug ${!isLocked ? 'cursor-text' : ''}`}
              onClick={() => !isLocked && setRoleEditing(true)}
              title={character.role}
            >
              {character.role || <span className="text-slate-300">Role description...</span>}
            </p>
          )}
        </div>

        {/* Single padlock — per character, controls everything */}
        <button
            onClick={() => up({ voiceLocked: !isLocked })}
            title={isLocked ? 'Unlock character' : 'Lock character'}
            className={`mt-0.5 shrink-0 transition-colors ${isLocked ? 'text-violet-400 hover:text-violet-600' : 'text-slate-300 hover:text-slate-500'}`}
          >
            {isLocked ? (
              /* Closed padlock */
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>
            ) : (
              /* Open padlock */
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2M11 7V4a3 3 0 0 0-6 0" /></svg>
            )}
          </button>
      </div>

      {/* Inline portrait editor — toggled by camera click */}
      {showPortraitEditor && !isLocked && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Portrait</label>
            <button onClick={() => setShowPortraitEditor(false)} className="text-[10px] text-slate-400 hover:text-slate-600">✕ Close</button>
          </div>
          {isNarrator && (
            <p className="text-[10px] text-slate-400 italic">Decorative only — not shown in Play mode.</p>
          )}
          {/* Prompt */}
          <div className="flex items-start justify-between gap-1 mb-0.5">
            <label className="text-[10px] text-slate-400">Appearance description</label>
            <button
              onClick={handleAvatarAiPrompt}
              disabled={avatarAiLoading}
              className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium text-violet-500 hover:bg-violet-100 disabled:opacity-40"
            >
              {avatarAiLoading ? '⟳ …' : '✦ AI'}
            </button>
          </div>
          <textarea
            className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs leading-relaxed text-slate-900 focus:border-violet-400 focus:outline-none resize-none"
            rows={2}
            value={character.avatarPrompt ?? ''}
            onChange={(e) => up({ avatarPrompt: e.target.value })}
            placeholder="e.g. weathered woman, silver-streaked dark hair, sharp green eyes, worn jacket"
          />
          {/* Actions */}
          {!avatarPreviewUrl ? (
            <div className="flex gap-1.5">
              <button
                onClick={handleAvatarGenerate}
                disabled={avatarGenerating || !character.avatarPrompt?.trim()}
                className="flex-1 rounded border border-violet-300 bg-violet-50 px-2 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors"
              >
                {avatarGenerating ? '⏳ Generating…' : '⚙ Generate'}
              </button>
              <button
                onClick={() => avatarFileInputRef.current?.click()}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                ↑ Upload
              </button>
              {character.avatarFile && (
                <button onClick={handleAvatarRemove} className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-500 hover:bg-red-100 transition-colors" title="Remove portrait">✕</button>
              )}
              <input ref={avatarFileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = ''; }} />
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[10px] text-violet-500">Preview — accept to save</p>
              <div className="flex gap-1.5">
                <button onClick={handleAvatarAccept} disabled={avatarAccepting}
                  className="flex-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                  {avatarAccepting ? '⏳ Saving…' : '✔ Accept'}
                </button>
                <button onClick={handleAvatarDiscard} disabled={avatarAccepting}
                  className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors">
                  ✕ Discard
                </button>
              </div>
            </div>
          )}
          {/* Seed info */}
          {character.avatarSeed != null && (
            <span className="font-mono text-[10px] text-slate-400">seed {character.avatarSeed}</span>
          )}
          {avatarError && <p className="text-[11px] text-red-500">{avatarError}</p>}
        </div>
      )}

      {/* ID badge */}
      <div className="px-5 pb-2">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{character.id}</span>
        {isNarrator && <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">Narrator</span>}
      </div>

      {/* Backstory */}
      <div className="border-t border-slate-100 px-5 py-3">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Backstory</label>
        {backstoryEditing && !isLocked ? (
          <textarea
            autoFocus
            className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 focus:border-violet-400 focus:outline-none"
            rows={4}
            value={character.backstory}
            onChange={(e) => up({ backstory: e.target.value })}
            onBlur={() => setBackstoryEditing(false)}
            placeholder="Character background and personality..."
          />
        ) : (
          <p
            className={`text-sm leading-relaxed text-slate-800 line-clamp-2 ${!isLocked ? 'cursor-text' : ''}`}
            onClick={() => !isLocked && setBackstoryEditing(true)}
            title={character.backstory}
          >
            {character.backstory || <span className="text-slate-300">Character background and personality...</span>}
          </p>
        )}
      </div>

      {/* Voice summary row */}
      <div className="border-t border-slate-100 px-5 py-3">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Voice</label>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
            {(character.ttsProvider ?? 'qwen') === 'qwen' ? 'Qwen (local)' : 'ElevenLabs'}
          </span>
        </div>
        <p className="mt-1 truncate text-xs text-slate-600">
          {(character.ttsProvider ?? 'qwen') === 'qwen'
            ? character.qwenInstruct || 'No voice description set'
            : character.elevenLabsDescription || 'No voice description set'}
        </p>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="border-t border-slate-100 px-5 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
      >
        {expanded ? '▲ Less' : '▼ More details'}
      </button>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-slate-100 px-5 py-3 space-y-4">

          {/* TTS Provider */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">TTS Provider</label>
            <select
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none disabled:opacity-60"
              value={character.ttsProvider ?? 'qwen'}
              disabled={isLocked}
              onChange={(e) => {
                const newProvider = e.target.value as 'qwen' | 'elevenlabs';
                const patch: Partial<NWVCharacter> = { ttsProvider: newProvider };
                if (newProvider === 'elevenlabs' && !character.elevenLabsDescription?.trim() && character.qwenInstruct?.trim()) {
                  patch.elevenLabsDescription = character.qwenInstruct;
                }
                up(patch);
              }}
            >
              <option value="qwen">Qwen (local)</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </div>

          {/* Voice description + AI */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Voice Description</label>
              {!isLocked && (
                <button
                  onClick={handleVoiceAi}
                  disabled={voiceAiLoading}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-violet-500 hover:bg-violet-50 disabled:opacity-40"
                >
                  {voiceAiLoading ? '⟳ …' : '✦ AI'}
                </button>
              )}
            </div>
            <textarea
              className={`w-full rounded border bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-violet-400 focus:outline-none ${
                isLocked ? 'cursor-not-allowed border-slate-200 opacity-60' : 'border-slate-200'
              }`}
              rows={4}
              value={(character.ttsProvider ?? 'qwen') === 'qwen'
                ? character.qwenInstruct ?? ''
                : character.elevenLabsDescription ?? ''}
              onChange={(e) => {
                if (isLocked) return;
                if ((character.ttsProvider ?? 'qwen') === 'qwen') {
                  up({ qwenInstruct: e.target.value });
                } else {
                  up({ elevenLabsDescription: e.target.value });
                }
              }}
              readOnly={isLocked}
              placeholder="e.g. BBC British RP male narrator, low gravelly voice"
            />

            {/* Voice test buttons */}
            {(character.ttsProvider ?? 'qwen') === 'qwen' ? (
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={voicePlaying ? handleStopVoice : handleTestVoice}
                  disabled={voiceTesting && !voicePlaying}
                  className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                    voicePlaying
                      ? 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-50'
                  }`}
                >
                  {voiceTesting && !voicePlaying ? (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  ) : voicePlaying ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3" height="8"/><rect x="6" y="1" width="3" height="8"/></svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="1,1 9,5 1,9"/></svg>
                  )}
                  {voiceTesting && !voicePlaying ? 'Synthesising…' : voicePlaying ? 'Stop' : 'Test Voice'}
                </button>
                {voiceTestError && <p className="text-[11px] text-red-500">{voiceTestError}</p>}
              </div>
            ) : (
              /* ElevenLabs voice design */
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleDesignVoice}
                    disabled={elDesigning || isLocked}
                    className="flex items-center gap-1.5 rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                  >
                    {elDesigning ? (
                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="1,1 9,5 1,9"/></svg>
                    )}
                    {elDesigning ? 'Designing…' : 'Design Voice'}
                  </button>
                  {elPreviewUrl && !voicePlaying && !elDesigning && (
                    <button onClick={handlePlayPreview} className="flex items-center gap-1.5 rounded border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="1,1 9,5 1,9"/></svg>
                      Play Preview
                    </button>
                  )}
                  {voicePlaying && (
                    <button onClick={handleStopVoice} className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">■ Stop</button>
                  )}
                  {elGeneratedVoiceId && !voicePlaying && (
                    <button
                      onClick={handleCreateVoice}
                      disabled={elCreating}
                      className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                    >
                      {elCreating ? 'Saving…' : '✔ Use this voice'}
                    </button>
                  )}
                  {character.elevenLabsVoiceId && (
                    <span className="font-mono text-[10px] text-slate-400">ID: {character.elevenLabsVoiceId}</span>
                  )}
                </div>
                {elError && <p className="text-[11px] text-red-500">{elError}</p>}
              </div>
            )}
          </div>

          {/* Default Delivery — Qwen */}
          {(character.ttsProvider ?? 'qwen') === 'qwen' && (
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Default Delivery</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] text-slate-400">Emotion</label>
                  <select
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
                    value={character.defaultEmotion ?? ''}
                    onChange={(e) => up({ defaultEmotion: e.target.value || undefined })}
                  >
                    <option value="">None</option>
                    {EMOTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] text-slate-400">Tone</label>
                  <select
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
                    value={character.defaultTone ?? ''}
                    onChange={(e) => up({ defaultTone: e.target.value || undefined })}
                  >
                    <option value="">None</option>
                    {TONE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-0.5 block text-[10px] text-slate-400">Texture</label>
                  <select
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
                    value={character.defaultVoiceTexture ?? ''}
                    onChange={(e) => up({ defaultVoiceTexture: e.target.value || undefined })}
                  >
                    <option value="">None</option>
                    {VOICE_TEXTURE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Appears in */}
          {appearsIn.length > 0 && (
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Appears in ({appearsIn.length} node{appearsIn.length !== 1 ? 's' : ''})
              </label>
              <div className="flex flex-wrap gap-1">
                {appearsIn.map(({ nodeId, title }) => (
                  <button
                    key={nodeId}
                    onClick={() => {
                      setActiveView('canvas');
                      setSelectedNode(nodeId);
                    }}
                    className="rounded bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    {title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delete */}
          {!isNarrator && (
            <div className="border-t border-slate-100 pt-3">
              <button
                onClick={() => {
                  if (confirm(`Delete "${character.name}"?`)) {
                    deleteCharacter(character.id);
                  }
                }}
                className="w-full rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                Delete character
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Characters Page ──────────────────────────────────────────────────────────

export function CharactersPage() {
  const activeStory = useStoryStore((s) => s.activeStory);
  const addCharacter = useStoryStore((s) => s.addCharacter);
  const setActiveView = useStoryStore((s) => s.setActiveView);
  const updateMetadata = useStoryStore((s) => s.updateMetadata);
  const updateCharacter = useStoryStore((s) => s.updateCharacter);
  const [lockPromptOpen, setLockPromptOpen] = useState(false);

  if (!activeStory) return null;

  const characters = activeStory.characters;
  const nodes = activeStory.nodes;

  const unlockedNonNarrator = characters.filter(
    (c) => c.id !== 'narrator' && !c.voiceLocked,
  );

  function handleBackToCanvas() {
    if (unlockedNonNarrator.length > 0) {
      setLockPromptOpen(true);
    } else {
      setActiveView('canvas');
    }
  }

  function handleLockAllAndReturn() {
    for (const c of unlockedNonNarrator) {
      updateCharacter(c.id, { voiceLocked: true });
    }
    setActiveView('canvas');
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      {/* Lock-all prompt */}
      {lockPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <p className="mb-1 font-semibold text-slate-900">Lock all voices?</p>
            <p className="mb-4 text-sm text-slate-500">
              {unlockedNonNarrator.length} character{unlockedNonNarrator.length !== 1 ? 's have' : ' has'} unlocked voices. Lock them before returning?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleLockAllAndReturn}
                className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
              >
                Lock all &amp; return
              </button>
              <button
                onClick={() => setActiveView('canvas')}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Return anyway
              </button>
            </div>
            <button
              onClick={() => setLockPromptOpen(false)}
              className="mt-2 w-full rounded-lg px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBackToCanvas}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              title="Back to canvas"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 2 4 7 9 12"/></svg>
              Canvas
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <h1 className="text-2xl font-bold text-slate-900">Characters</h1>
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-sm font-medium text-violet-700">
              {characters.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Art style picker — project-level */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 whitespace-nowrap">Art Style</label>
              <select
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
                value={activeStory.metadata.artStyle ?? 'realistic'}
                onChange={(e) => updateMetadata({ artStyle: e.target.value as ArtStyle })}
              >
                {(Object.entries(ART_STYLE_LABELS) as [ArtStyle, string][]).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => addCharacter()}
              className="rounded-lg border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100"
            >
              + New Character
            </button>
          </div>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {characters.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              nodes={nodes}
            />
          ))}
        </div>

        {characters.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="mb-3 text-slate-300" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
            <p className="text-lg text-slate-500">No characters yet</p>
            <p className="mt-1 text-sm text-slate-400">Add your first character to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
