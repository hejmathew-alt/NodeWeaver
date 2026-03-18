'use client';

import { useState, useRef, useEffect } from 'react';
import type { NWVCharacter, GenreSlug, ArtStyle } from '@nodeweaver/engine';
import { GENRE_META } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import { charSeed } from '@/lib/char-seed';
import { mapQwenToEL } from '@/lib/el-delivery-map';
import { EMOTION_OPTIONS, TONE_OPTIONS, VOICE_TEXTURE_OPTIONS } from '@/lib/character-options';
import { ART_STYLE_LABELS } from '@/lib/comfyui';

const FALLBACK_LINES = GENRE_META.custom.voiceTestLines;

function pickTestLine(genre?: GenreSlug): string {
  const lines = (genre && GENRE_META[genre]?.voiceTestLines) || FALLBACK_LINES;
  return lines[Math.floor(Math.random() * lines.length)];
}

// ── Character list row ────────────────────────────────────────────────────────

function CharacterRow({
  character,
  isSelected,
  onSelect,
}: {
  character: NWVCharacter;
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
      {isNarrator ? (
        <svg className="shrink-0 text-violet-500" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>
      ) : (
        <svg className="shrink-0 text-slate-400" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{character.name || 'Unnamed'}</div>
        {character.role && (
          <div className="truncate text-xs text-slate-400">{character.role}</div>
        )}
      </div>
      {character.voiceLocked && (
        <svg className="shrink-0 text-violet-400" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Voice locked"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>
      )}
      <span className="shrink-0 font-mono text-[10px] text-slate-300">{character.id}</span>
    </button>
  );
}

// ── Character editor ──────────────────────────────────────────────────────────

function CharacterEditor({ character }: { character: NWVCharacter }) {
  const { updateCharacter, updateMetadata, deleteCharacter, activeStory } = useStoryStore();
  const { anthropicKey, qwenTemperature, elevenLabsKey, comfyuiUrl, comfyuiModel } = useSettingsStore();
  const [testing, setTesting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [draftInstruct, setDraftInstruct] = useState<string | null>(null);
  // ElevenLabs voice design state
  const [elDesigning, setElDesigning] = useState(false);
  const [elCreating, setElCreating] = useState(false);
  const [elError, setElError] = useState<string | null>(null);
  const [elGeneratedVoiceId, setElGeneratedVoiceId] = useState<string | null>(null);
  const [elAiLoading, setElAiLoading] = useState(false);
  const [elDraftDescription, setElDraftDescription] = useState<string | null>(null);
  // Avatar state
  const [avatarGenerating, setAvatarGenerating] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarAiLoading, setAvatarAiLoading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPreviewSeed, setAvatarPreviewSeed] = useState<number | null>(null);
  const [avatarAccepting, setAvatarAccepting] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
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

  const up = (patch: Partial<NWVCharacter>) => updateCharacter(character.id, patch);

  // ── Avatar: AI prompt generator ─────────────────────────────────────────────

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
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setAvatarError(err?.error ?? 'AI prompt generation failed.');
        return;
      }
      const { text } = await res.json() as { text: string };
      if (text) up({ avatarPrompt: text });
    } finally {
      setAvatarAiLoading(false);
    }
  }

  // ── Avatar: generate via ComfyUI ─────────────────────────────────────────────

  async function handleAvatarGenerate() {
    const prompt = character.avatarPrompt?.trim();
    if (!prompt) { setAvatarError('Enter a portrait description first.'); return; }
    setAvatarError(null);
    setAvatarGenerating(true);
    // Discard previous preview
    if (avatarPreviewUrl) { URL.revokeObjectURL(avatarPreviewUrl); setAvatarPreviewUrl(null); }

    try {
      const seed = character.avatarLocked && character.avatarSeed != null
        ? character.avatarSeed
        : undefined;

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

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setAvatarError(err?.error ?? 'Generation failed.');
        return;
      }

      const usedSeed = Number(res.headers.get('x-used-seed') ?? 0);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      setAvatarPreviewUrl(objUrl);
      setAvatarPreviewSeed(usedSeed || null);
    } catch {
      setAvatarError('Could not reach ComfyUI. Is it running?');
    } finally {
      setAvatarGenerating(false);
    }
  }

  // ── Avatar: accept preview ────────────────────────────────────────────────────

  async function handleAvatarAccept() {
    if (!avatarPreviewUrl || !activeStory) return;
    setAvatarAccepting(true);
    try {
      const res = await fetch(avatarPreviewUrl);
      const buf = await res.arrayBuffer();
      const filename = `avatar-${character.id}.png`;
      await fetch(`/api/stories/${encodeURIComponent(activeStory.id)}/avatar?file=${encodeURIComponent(filename)}`, {
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        body: buf,
      });
      URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(null);
      up({ avatarFile: filename, avatarSeed: avatarPreviewSeed ?? undefined });
      setAvatarPreviewSeed(null);
    } catch {
      setAvatarError('Failed to save avatar.');
    } finally {
      setAvatarAccepting(false);
    }
  }

  // ── Avatar: discard preview ───────────────────────────────────────────────────

  function handleAvatarDiscard() {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarPreviewUrl(null);
    setAvatarPreviewSeed(null);
  }

  // ── Avatar: upload ────────────────────────────────────────────────────────────

  async function handleAvatarUpload(file: File) {
    if (!activeStory) return;
    setAvatarError(null);
    // Resize to 512×512 via canvas
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.src = objUrl;
    await new Promise<void>((resolve) => { img.onload = () => resolve(); });
    URL.revokeObjectURL(objUrl);

    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx2d = canvas.getContext('2d')!;
    ctx2d.drawImage(img, 0, 0, 512, 512);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { setAvatarError('Image conversion failed.'); return; }

    const filename = `avatar-${character.id}.png`;
    const buf = await blob.arrayBuffer();
    await fetch(`/api/stories/${encodeURIComponent(activeStory.id)}/avatar?file=${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: buf,
    });
    up({ avatarFile: filename, avatarSeed: undefined });
  }

  // ── Avatar: remove ────────────────────────────────────────────────────────────

  async function handleAvatarRemove() {
    if (!activeStory || !character.avatarFile) return;
    await fetch(`/api/stories/${encodeURIComponent(activeStory.id)}/avatar?file=${encodeURIComponent(character.avatarFile)}`, {
      method: 'DELETE',
    });
    up({ avatarFile: undefined, avatarSeed: undefined, avatarLocked: false });
  }

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

  // ── AI voice description generator — ElevenLabs ────────────────────────────

  async function handleElAiGenerate() {
    setElError(null);
    setElAiLoading(true);
    setElDraftDescription('');

    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'voice',
        prompt: character.elevenLabsDescription?.trim() ?? '',
        anthropicKey,
      }),
    }).catch(() => null);

    if (!res?.ok || !res.body) {
      const err = await res?.json().catch(() => null);
      setElError(err?.error ?? 'AI generation failed.');
      setElAiLoading(false);
      setElDraftDescription(null);
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
        setElDraftDescription(accumulated);
      }
    } finally {
      if (accumulated) up({ elevenLabsDescription: accumulated });
      setElDraftDescription(null);
      setElAiLoading(false);
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
          text: pickTestLine(activeStory?.metadata?.genre),
          instruct,
          seed: charSeed(character.id),
          temperature: qwenTemperature,
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

  // ── ElevenLabs: generate voice preview ─────────────────────────────────────

  async function handleDesignVoice() {
    const desc = character.elevenLabsDescription?.trim();
    if (!desc) { setElError('Enter a voice description first.'); return; }
    setElError(null);
    setElGeneratedVoiceId(null);
    abortRef.current?.abort();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setElDesigning(true);
    setPlaying(false);

    let objectUrl: string | null = null;
    try {
      const res = await fetch('/api/elevenlabs/voice-design', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          voiceDescription: desc,
          accent: character.elevenLabsAccent,
          gender: character.elevenLabsGender,
          text: pickTestLine(activeStory?.metadata?.genre),
          elevenLabsKey,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setElError(err.error ?? 'ElevenLabs voice design failed.');
        setElDesigning(false);
        return;
      }

      const generatedId = res.headers.get('x-generated-voice-id') ?? '';
      setElGeneratedVoiceId(generatedId || null);

      const blob = await res.blob();
      if (ctrl.signal.aborted) return;

      objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      setPlaying(true);

      audio.onended = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); audioRef.current = null; setPlaying(false); setElDesigning(false); };
      audio.onerror = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); audioRef.current = null; setPlaying(false); setElDesigning(false); setElError('Playback failed.'); };
      audio.play();
    } catch {
      if (!ctrl.signal.aborted) { setElError('Could not reach ElevenLabs.'); setElDesigning(false); }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  // ── ElevenLabs: save preview as permanent voice + lock ─────────────────────

  async function handleCreateVoice() {
    if (!elGeneratedVoiceId) { setElError('Generate a preview first.'); return; }
    setElError(null);
    setElCreating(true);

    try {
      const res = await fetch('/api/elevenlabs/voice-create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          generatedVoiceId: elGeneratedVoiceId,
          voiceName: `NW — ${character.name}`,
          voiceDescription: character.elevenLabsDescription,
          elevenLabsKey,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setElError(err.error ?? 'Failed to create voice.');
        setElCreating(false);
        return;
      }

      const { voiceId } = await res.json() as { voiceId: string };
      up({ elevenLabsVoiceId: voiceId, voiceLocked: true });
      setElGeneratedVoiceId(null);
      setElCreating(false);
    } catch {
      setElError('Could not reach ElevenLabs.');
      setElCreating(false);
    }
  }

  // ── ElevenLabs: test locked voice ──────────────────────────────────────────

  async function handleTestElevenLabs() {
    if (!character.elevenLabsVoiceId) return;
    setTestError(null);
    abortRef.current?.abort();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setTesting(true);
    setPlaying(false);

    let objectUrl: string | null = null;
    try {
      const res = await fetch('/api/tts/elevenlabs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: pickTestLine(activeStory?.metadata?.genre),
          voiceId: character.elevenLabsVoiceId,
          elevenLabsKey,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setTestError(err.error ?? 'ElevenLabs TTS failed.');
        setTesting(false);
        return;
      }

      const blob = await res.blob();
      if (ctrl.signal.aborted) return;

      objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      setPlaying(true);

      audio.onended = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); audioRef.current = null; setPlaying(false); setTesting(false); };
      audio.onerror = () => { if (objectUrl) URL.revokeObjectURL(objectUrl); audioRef.current = null; setPlaying(false); setTesting(false); setTestError('Playback failed.'); };
      audio.play();
    } catch {
      if (!ctrl.signal.aborted) { setTestError('Could not reach ElevenLabs.'); setTesting(false); }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  const avatarSrc = activeStory && character.avatarFile
    ? `/api/stories/${encodeURIComponent(activeStory.id)}/avatar?file=${encodeURIComponent(character.avatarFile)}`
    : null;

  return (
    <div className="space-y-4 px-4 py-4">

      {/* ── Portrait ─────────────────────────────────────────────────────── */}
      {!isNarrator && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Portrait
          </label>

          {/* Circle + prompt side by side */}
          <div className="flex gap-3">
            {/* Circle preview */}
            <div className="shrink-0">
              {(avatarPreviewUrl || avatarSrc) ? (
                <img
                  src={avatarPreviewUrl ?? avatarSrc!}
                  alt={character.name}
                  className="h-20 w-20 rounded-full object-cover border-2 border-slate-200 shadow-sm"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-slate-200 bg-slate-50">
                  <svg className="text-slate-300" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" />
                  </svg>
                </div>
              )}
            </div>

            {/* Prompt + AI button */}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Appearance</label>
                <button
                  onClick={handleAvatarAiPrompt}
                  disabled={avatarAiLoading}
                  title="Generate portrait prompt with AI"
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-violet-500 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-40"
                >
                  {avatarAiLoading ? '⟳ …' : '✦ AI'}
                </button>
              </div>
              <textarea
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs leading-relaxed text-slate-900 focus:border-violet-400 focus:outline-none resize-none"
                rows={3}
                value={character.avatarPrompt ?? ''}
                onChange={(e) => up({ avatarPrompt: e.target.value })}
                placeholder="e.g. weathered middle-aged woman, silver-streaked dark hair, sharp green eyes, worn jacket"
              />
            </div>
          </div>

          {/* Art style (project-level) */}
          <div className="mt-2 flex items-center gap-2">
            <label className="shrink-0 text-[10px] font-medium text-slate-400">Art Style</label>
            <select
              className="flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
              value={activeStory?.metadata?.artStyle ?? 'realistic'}
              onChange={(e) => updateMetadata({ artStyle: e.target.value as ArtStyle })}
            >
              {(Object.entries(ART_STYLE_LABELS) as [ArtStyle, string][]).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>

          {/* Action row */}
          {!avatarPreviewUrl ? (
            <div className="mt-2 flex gap-1.5">
              <button
                onClick={handleAvatarGenerate}
                disabled={avatarGenerating || !character.avatarPrompt?.trim()}
                className="flex-1 rounded border border-violet-300 bg-violet-50 px-2 py-1.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors"
              >
                {avatarGenerating ? '⏳ Generating…' : '⚙ Generate'}
              </button>
              <button
                onClick={() => avatarFileInputRef.current?.click()}
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                title="Upload an image"
              >
                ↑ Upload
              </button>
              {character.avatarFile && (
                <button
                  onClick={handleAvatarRemove}
                  className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-500 hover:bg-red-100 transition-colors"
                  title="Remove portrait"
                >
                  ✕
                </button>
              )}
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = ''; }}
              />
            </div>
          ) : (
            /* Preview accept/discard */
            <div className="mt-2 space-y-1.5">
              <p className="text-[10px] text-violet-500">Preview — accept to save</p>
              <div className="flex gap-1.5">
                <button
                  onClick={handleAvatarAccept}
                  disabled={avatarAccepting}
                  className="flex-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                >
                  {avatarAccepting ? '⏳ Saving…' : '✔ Accept'}
                </button>
                <button
                  onClick={handleAvatarDiscard}
                  disabled={avatarAccepting}
                  className="flex-1 rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  ✕ Discard
                </button>
              </div>
            </div>
          )}

          {/* Seed lock row */}
          {character.avatarFile && (
            <div className="mt-1.5 flex items-center gap-2">
              {character.avatarSeed != null && (
                <span className="font-mono text-[10px] text-slate-400">seed {character.avatarSeed}</span>
              )}
              <button
                onClick={() => up({ avatarLocked: !character.avatarLocked })}
                className={`ml-auto flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  character.avatarLocked
                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {character.avatarLocked ? (
                  <><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>Seed locked</>
                ) : (
                  <><svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0" /></svg>Lock seed</>
                )}
              </button>
            </div>
          )}

          {avatarError && <p className="mt-1 text-[11px] text-red-500">{avatarError}</p>}
        </div>
      )}

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

      {/* TTS Provider selector */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          TTS Provider
        </label>
        <select
          className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
          value={character.ttsProvider ?? 'qwen'}
          onChange={(e) => {
            const newProvider = e.target.value as 'qwen' | 'elevenlabs';
            const patch: Partial<NWVCharacter> = { ttsProvider: newProvider };
            // Carry Qwen voice description over to ElevenLabs if EL description is empty
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

      {/* Voice design — Qwen */}
      {(character.ttsProvider ?? 'qwen') === 'qwen' && (
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
            placeholder="e.g. BBC British RP male narrator, low gravelly voice"
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
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                isLocked
                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {isLocked ? (
                <><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>Unlock</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0" /></svg>Lock Voice</>
              )}
            </button>
          </div>

          {isLocked && (
            <p className="mt-1.5 text-[11px] text-violet-500">
              Voice locked — seed {charSeed(character.id)} · unlock to edit
            </p>
          )}
        </div>
      )}

      {/* Voice design — ElevenLabs */}
      {character.ttsProvider === 'elevenlabs' && (
        <div className="space-y-3">
          {/* Accent + Gender row */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Accent</label>
              <select
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                value={character.elevenLabsAccent ?? ''}
                onChange={(e) => up({ elevenLabsAccent: e.target.value || undefined })}
              >
                <option value="">Any</option>
                <option value="american">American</option>
                <option value="british">British</option>
                <option value="australian">Australian</option>
                <option value="indian">Indian</option>
                <option value="african">African</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Gender</label>
              <select
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 focus:border-emerald-400 focus:outline-none"
                value={character.elevenLabsGender ?? ''}
                onChange={(e) => up({ elevenLabsGender: e.target.value || undefined })}
              >
                <option value="">Any</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>

          {/* Voice description */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Voice Description</label>
              <button
                onClick={handleElAiGenerate}
                disabled={elAiLoading || elDesigning}
                title="Generate or refine voice description with AI"
                className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
              >
                {elAiLoading ? '⟳ generating…' : '✦ AI'}
              </button>
            </div>
            <textarea
              className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-emerald-400 focus:outline-none"
              rows={5}
              value={elDraftDescription ?? character.elevenLabsDescription ?? ''}
              onChange={(e) => { if (!elAiLoading) up({ elevenLabsDescription: e.target.value || undefined }); }}
              readOnly={elAiLoading}
              placeholder="e.g. A refined, aristocratic British woman with a warm undertone. Composed and precise, with natural gravitas."
            />
          </div>

          {elError && <p className="text-xs text-red-500">{elError}</p>}

          {/* Design / Create flow — always available so voice can be refined even when locked */}
          <div className="flex gap-2">
            <button
              onClick={handleDesignVoice}
              disabled={elDesigning || elCreating || !character.elevenLabsDescription?.trim()}
              className="flex-1 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            >
              {elDesigning ? (playing ? '🔊 Playing preview…' : '⏳ Generating…') : '✦ Design Voice'}
            </button>
            {elGeneratedVoiceId && !elDesigning && (
              <button
                onClick={handleCreateVoice}
                disabled={elCreating}
                className="flex-1 rounded border border-violet-400 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50"
              >
                {elCreating ? '⏳ Saving…' : '✔ Create & Lock'}
              </button>
            )}
          </div>

          {/* Locked state */}
          {isLocked && character.elevenLabsVoiceId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2">
                <svg className="shrink-0 text-emerald-500" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>
                <span className="flex-1 font-mono text-[10px] text-emerald-700">{character.elevenLabsVoiceId}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleTestElevenLabs}
                  disabled={testing}
                  className="flex-1 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  {playing ? '🔊 Playing…' : testing ? '⏳ Generating…' : '▶ Test Voice'}
                </button>
                <button
                  onClick={() => up({ voiceLocked: false })}
                  className="flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0" /></svg>
                  Unlock
                </button>
              </div>
              {testError && <p className="text-xs text-red-500">{testError}</p>}
            </div>
          )}

          {/* Unlocked with existing voice ID — show voice ID + re-lock button */}
          {!isLocked && !elGeneratedVoiceId && character.elevenLabsVoiceId && (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[10px] text-slate-400">ID: <span className="font-mono">{character.elevenLabsVoiceId}</span></p>
              <button
                onClick={() => up({ voiceLocked: true })}
                className="flex shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>
                Lock Voice
              </button>
            </div>
          )}
        </div>
      )}

      {/* Default Delivery — Qwen */}
      {(character.ttsProvider ?? 'qwen') === 'qwen' && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Default Delivery
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-0.5 block text-[10px] text-slate-400">Emotion</label>
              <select
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
                value={character.defaultEmotion ?? ''}
                onChange={(e) => up({ defaultEmotion: e.target.value || undefined })}
              >
                <option value="">None</option>
                {EMOTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                {VOICE_TEXTURE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            Defaults applied when a block has no per-block override set.
          </p>
        </div>
      )}

      {/* Default Delivery — ElevenLabs */}
      {character.ttsProvider === 'elevenlabs' && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Default Delivery
            </label>
            {(character.defaultEmotion || character.defaultTone || character.defaultVoiceTexture) && (
              <button
                type="button"
                onClick={() => {
                  const mapped = mapQwenToEL(character.defaultEmotion, character.defaultTone, character.defaultVoiceTexture);
                  up({ elevenLabsStability: mapped.stability, elevenLabsSimilarity: mapped.similarity, elevenLabsStyle: mapped.style });
                }}
                className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50"
                title="Map emotion/tone/texture from Qwen settings"
              >
                ↳ Map from Qwen
              </button>
            )}
          </div>

          {/* Stability */}
          <div className="space-y-2">
            <div>
              <div className="mb-0.5 flex justify-between">
                <label className="text-[10px] text-slate-400">Stability</label>
                <span className="font-mono text-[10px] text-slate-500">{(character.elevenLabsStability ?? 0.50).toFixed(2)}</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                className="w-full accent-emerald-500"
                value={character.elevenLabsStability ?? 0.50}
                onChange={(e) => up({ elevenLabsStability: parseFloat(e.target.value) })}
              />
              <p className="text-[9px] text-slate-400">Higher = more consistent. Lower = more expressive.</p>
            </div>

            <div>
              <div className="mb-0.5 flex justify-between">
                <label className="text-[10px] text-slate-400">Similarity</label>
                <span className="font-mono text-[10px] text-slate-500">{(character.elevenLabsSimilarity ?? 0.75).toFixed(2)}</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                className="w-full accent-emerald-500"
                value={character.elevenLabsSimilarity ?? 0.75}
                onChange={(e) => up({ elevenLabsSimilarity: parseFloat(e.target.value) })}
              />
              <p className="text-[9px] text-slate-400">How closely to replicate the designed voice.</p>
            </div>

            <div>
              <div className="mb-0.5 flex justify-between">
                <label className="text-[10px] text-slate-400">Style</label>
                <span className="font-mono text-[10px] text-slate-500">{(character.elevenLabsStyle ?? 0.00).toFixed(2)}</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.01"
                className="w-full accent-emerald-500"
                value={character.elevenLabsStyle ?? 0.00}
                onChange={(e) => up({ elevenLabsStyle: parseFloat(e.target.value) })}
              />
              <p className="text-[9px] text-slate-400">Style exaggeration. Adds energy but may reduce clarity.</p>
            </div>
          </div>
        </div>
      )}

      {/* Delete */}
      {!isNarrator && (
        <div className="border-t border-slate-100 pt-3">
          <button
            onClick={async () => {
              // If the character has a locked EL voice, clean it up from ElevenLabs first
              if (character.elevenLabsVoiceId && character.voiceLocked) {
                fetch('/api/elevenlabs/voice-delete', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ voiceId: character.elevenLabsVoiceId, elevenLabsKey }),
                }).catch(() => {}); // fire-and-forget; deletion proceeds regardless
              }
              deleteCharacter(character.id);
            }}
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

      {/* Character selector — compact dropdown */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <select
          className="flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:border-violet-400 focus:outline-none"
          value={displaySelected?.id ?? ''}
          onChange={(e) => setSelectedCharacter(e.target.value)}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || 'Unnamed'}{c.voiceLocked ? ' 🔒' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={() => { addCharacter(); }}
          className="shrink-0 rounded border border-dashed border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-500 hover:border-violet-400 hover:text-violet-600"
          title="Add character"
        >
          + Add
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
            <svg className="text-slate-300" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>
            <p className="text-sm text-slate-500">Select a character to edit</p>
          </div>
        )}
      </div>
    </aside>
  );
}
