'use client';

import { useEffect, useState } from 'react';
import type { TTSProvider } from '@nodeweaver/engine';
import { useSettingsStore, type CanvasTextSize, type SFXProvider, type AudioModelKey, type TimestampEngine, type VoiceResponseMode } from '@/lib/settings';
import { useStoryStore } from '@/store/story';

const TTS_PROVIDERS: { value: TTSProvider; label: string; note?: string }[] = [
  { value: 'qwen',       label: 'Qwen (local)',  note: 'Voice design via instruct prompt' },
  { value: 'elevenlabs', label: 'ElevenLabs',    note: 'Requires API key' },
];

// ── API key field with show/hide toggle ──────────────────────────────────────

function KeyField({
  label,
  placeholder,
  value,
  onChange,
  envSet,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  envSet?: boolean;
}) {
  const [show, setShow] = useState(false);
  const masked = !show && value.length > 0;

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="flex gap-1.5">
        <input
          type={show ? 'text' : 'password'}
          className="flex-1 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-violet-400 focus:outline-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={envSet ? 'Using key from .env.local' : placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title={masked ? 'Show key' : 'Hide key'}
          >
            {masked ? '👁' : '🙈'}
          </button>
        )}
      </div>
      {envSet && !value && (
        <p className="mt-1 text-[10px] font-medium text-emerald-600">Set in .env.local</p>
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

export function SettingsPanel({ panelWidth, isExpanded, onToggleExpand, onResizeStart }: PanelSizeProps) {
  const {
    ttsProvider, sfxProvider, audioModel, anthropicKey, elevenLabsKey, canvasTextSize, qwenTemperature,
    volumeVoice, volumeSfx, volumeAmbient, volumeMusic, wordTimestamps, timestampEngine,
    voiceEnabled, wakeWord, voiceResponseMode, voiceLanguage, voiceAssistantInstruct,
    setTtsProvider, setSfxProvider, setAudioModel, setAnthropicKey, setElevenLabsKey, setCanvasTextSize, setQwenTemperature,
    setVolumeVoice, setVolumeSfx, setVolumeAmbient, setVolumeMusic, setWordTimestamps, setTimestampEngine,
    setVoiceEnabled, setWakeWord, setVoiceResponseMode, setVoiceLanguage, setVoiceAssistantInstruct,
    comfyuiUrl, comfyuiModel, setComfyuiUrl, setComfyuiModel,
  } = useSettingsStore();

  const [modelSwitching, setModelSwitching] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [comfyuiStatus, setComfyuiStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');

  async function handleModelChange(m: AudioModelKey) {
    if (m === audioModel) return;
    setAudioModel(m);
    setModelSwitching(true);
    setModelError(null);
    try {
      const res = await fetch('/api/audio/model', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: m }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setModelError(e instanceof Error ? e.message : 'Switch failed');
    } finally {
      setModelSwitching(false);
    }
  }
  async function handleTestComfyUI() {
    setComfyuiStatus('checking');
    try {
      const res = await fetch(`${comfyuiUrl}/system_stats`, { signal: AbortSignal.timeout(2000) });
      setComfyuiStatus(res.ok ? 'ok' : 'error');
    } catch {
      setComfyuiStatus('error');
    }
  }

  const setSelectedPanel = useStoryStore((s) => s.setSelectedPanel);

  const [envKeys, setEnvKeys] = useState<{ anthropicKey: boolean; elevenLabsKey: boolean }>({ anthropicKey: false, elevenLabsKey: false });
  useEffect(() => {
    fetch('/api/settings/status').then((r) => r.json()).then(setEnvKeys).catch(() => {});
  }, []);

  return (
    <aside className="relative z-20 flex shrink-0 flex-col border-l border-slate-200 bg-white" style={{ width: panelWidth }}>
      {/* Resize handle — left edge */}
      <div
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-violet-300"
        onMouseDown={onResizeStart}
        title="Drag to resize"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="text-sm font-semibold text-slate-800">Settings</span>
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
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4">

        {/* ── TTS Provider ─────────────────────────────────────────────────── */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            TTS Provider
          </label>
          <div className="space-y-1.5">
            {TTS_PROVIDERS.map(({ value, label, note }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  ttsProvider === value
                    ? 'border-violet-300 bg-violet-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="global-tts"
                  value={value}
                  checked={ttsProvider === value}
                  onChange={() => setTtsProvider(value)}
                  className="accent-violet-600"
                />
                <div>
                  <div className={`text-xs font-medium ${ttsProvider === value ? 'text-violet-800' : 'text-slate-700'}`}>
                    {label}
                  </div>
                  {note && (
                    <div className="text-[10px] text-slate-400">{note}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ── Qwen Temperature ──────────────────────────────────────────── */}
        {ttsProvider === 'qwen' && (
          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Voice Temperature</span>
              <span className="font-mono text-violet-600">{qwenTemperature.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0.1}
              max={1.0}
              step={0.05}
              value={qwenTemperature}
              onChange={(e) => setQwenTemperature(parseFloat(e.target.value))}
              className="w-full accent-violet-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400">
              <span>Consistent</span>
              <span>Expressive</span>
            </div>
          </div>
        )}

        <div className="border-t border-slate-100" />

        {/* ── SFX Provider ─────────────────────────────────────────────────── */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            SFX Provider
          </label>
          <div className="space-y-1.5">
            {([
              { value: 'local' as SFXProvider, label: 'Local (Stable Audio)', note: 'Free — runs on your GPU' },
              { value: 'elevenlabs' as SFXProvider, label: 'ElevenLabs', note: 'Cloud — high quality, requires API key' },
            ]).map(({ value, label, note }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  sfxProvider === value
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="global-sfx"
                  value={value}
                  checked={sfxProvider === value}
                  onChange={() => setSfxProvider(value)}
                  className="accent-emerald-600"
                />
                <div>
                  <div className={`text-xs font-medium ${sfxProvider === value ? 'text-emerald-800' : 'text-slate-700'}`}>
                    {label}
                  </div>
                  {note && <div className="text-[10px] text-slate-400">{note}</div>}
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* ── Local Audio Model ─────────────────────────────────────────────── */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Local Audio Model
          </label>
          <div className="space-y-1.5">
            {([
              { value: '1.0'   as AudioModelKey, label: 'Stable Audio Open 1.0', note: '1.1B params · higher quality' },
              { value: 'small' as AudioModelKey, label: 'Stable Audio Open Small', note: '341M params · faster · permissive license · requires HF access + token' },
            ]).map(({ value, label, note }) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  audioModel === value
                    ? 'border-violet-300 bg-violet-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="audio-model"
                  value={value}
                  checked={audioModel === value}
                  onChange={() => handleModelChange(value)}
                  disabled={modelSwitching}
                  className="accent-violet-600"
                />
                <div className="flex-1">
                  <div className={`text-xs font-medium ${audioModel === value ? 'text-violet-800' : 'text-slate-700'}`}>
                    {label}
                  </div>
                  <div className="text-[10px] text-slate-400">{note}</div>
                </div>
              </label>
            ))}
          </div>
          {modelSwitching && (
            <p className="mt-1.5 text-[10px] text-violet-500 flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-violet-400 border-t-violet-600" />
              Restarting audio server…
            </p>
          )}
          {modelError && (
            <p className="mt-1.5 text-[10px] text-red-500">{modelError}</p>
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* ── Volume Controls ───────────────────────────────────────────────── */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Volume
          </label>
          <div className="space-y-2">
            {([
              { label: 'Voice',   value: volumeVoice,   set: setVolumeVoice,   color: 'accent-violet-500' },
              { label: 'SFX',     value: volumeSfx,     set: setVolumeSfx,     color: 'accent-emerald-500' },
              { label: 'Ambient', value: volumeAmbient, set: setVolumeAmbient, color: 'accent-sky-500' },
              { label: 'Music',   value: volumeMusic,   set: setVolumeMusic,   color: 'accent-amber-500' },
            ]).map(({ label, value, set, color }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs text-slate-500">{label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  className={`flex-1 h-1.5 cursor-pointer rounded-full ${color}`}
                />
                <span className="w-8 text-right text-[10px] tabular-nums text-slate-400">
                  {Math.round(value * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* ── Canvas ───────────────────────────────────────────────────────── */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Canvas Text Size
          </label>
          <div className="flex gap-1.5">
            {([
              { value: 'xs',   label: 'Small'  },
              { value: 'sm',   label: 'Medium' },
              { value: 'base', label: 'Large'  },
            ] as { value: CanvasTextSize; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCanvasTextSize(value)}
                className={`flex-1 rounded border py-1.5 text-xs font-medium transition-colors ${
                  canvasTextSize === value
                    ? 'border-violet-400 bg-violet-50 text-violet-700'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* ── API Keys ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">API Keys</p>

          <KeyField
            label="Anthropic"
            placeholder="sk-ant-api03-…"
            value={anthropicKey}
            onChange={setAnthropicKey}
            envSet={envKeys.anthropicKey}
          />

          <KeyField
            label="ElevenLabs"
            placeholder="sk_…"
            value={elevenLabsKey}
            onChange={setElevenLabsKey}
            envSet={envKeys.elevenLabsKey}
          />

          <p className="text-[11px] leading-relaxed text-slate-400">
            Keys are stored in your browser&apos;s local storage. If a key is set in{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">.env.local</code>,
            it will be used server-side as a fallback.
          </p>
        </div>

        <div className="border-t border-slate-100" />

        {/* ── Experimental ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Experimental</p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={wordTimestamps}
              onChange={(e) => setWordTimestamps(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-amber-500 accent-amber-500"
            />
            <span className="text-xs text-slate-600">Word timestamps</span>
          </label>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Enables per-word highlighting during playback and precise SFX timing.
          </p>

          {wordTimestamps && (
            <div className="mt-1 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Alignment engine
              </p>
              {([
                { value: 'ctc'     as TimestampEngine, label: 'CTC forced aligner',   note: 'Fast · accurate pauses & breaths' },
                { value: 'whisper' as TimestampEngine, label: 'Whisper tiny.en',       note: 'Transcription-based fallback' },
              ]).map(({ value, label, note }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    timestampEngine === value
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="ts-engine"
                    value={value}
                    checked={timestampEngine === value}
                    onChange={() => setTimestampEngine(value)}
                    className="accent-amber-500"
                  />
                  <div>
                    <div className={`text-xs font-medium ${timestampEngine === value ? 'text-amber-800' : 'text-slate-700'}`}>
                      {label}
                    </div>
                    <div className="text-[10px] text-slate-400">{note}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

      {/* ── Voice & Dictation ──────────────────────────────────────── */}
      <div className="space-y-3 border-t border-slate-100 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Voice &amp; Dictation
        </p>

        {/* Enable toggle */}
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={voiceEnabled}
            onChange={(e) => setVoiceEnabled(e.target.checked)}
            className="accent-violet-500"
          />
          <div>
            <div className="text-xs font-medium text-slate-700">Enable voice mode</div>
            <div className="text-[10px] text-slate-400">Shows mic button in toolbar · Web Speech API required</div>
          </div>
        </label>

        {voiceEnabled && (
          <div className="space-y-3 pl-1">

            {/* Wake word */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Wake word
              </label>
              <input
                type="text"
                value={wakeWord}
                onChange={(e) => setWakeWord(e.target.value.toLowerCase().trim() || 'node')}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
                placeholder="node"
              />
              <p className="text-[10px] text-slate-400">
                Prefix your command with this word to trigger AI (e.g. &ldquo;<span className="font-mono">{wakeWord}, save</span>&rdquo;)
              </p>
            </div>

            {/* Response mode */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Voice response
              </p>
              {([
                { value: 'qwen'    as VoiceResponseMode, label: 'Qwen narrator',   note: 'Local · same voice engine as story TTS' },
                { value: 'browser' as VoiceResponseMode, label: 'Browser speech',  note: 'Instant · system voice' },
              ]).map(({ value, label, note }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                    voiceResponseMode === value
                      ? 'border-violet-300 bg-violet-50'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="voice-response-mode"
                    value={value}
                    checked={voiceResponseMode === value}
                    onChange={() => setVoiceResponseMode(value)}
                    className="accent-violet-500"
                  />
                  <div>
                    <div className={`text-xs font-medium ${voiceResponseMode === value ? 'text-violet-800' : 'text-slate-700'}`}>
                      {label}
                    </div>
                    <div className="text-[10px] text-slate-400">{note}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Assistant instruct */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Assistant voice instruct
              </label>
              <textarea
                value={voiceAssistantInstruct}
                onChange={(e) => setVoiceAssistantInstruct(e.target.value)}
                rows={3}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none resize-none"
                placeholder="e.g. calm neutral narrator, clear measured voice"
              />
              <p className="text-[10px] text-slate-400">
                Qwen instruct for the assistant voice (separate from narrator character)
              </p>
            </div>

            {/* Language */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Recognition language
              </label>
              <select
                value={voiceLanguage}
                onChange={(e) => setVoiceLanguage(e.target.value)}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="en-AU">English (AU)</option>
                <option value="fr-FR">French</option>
                <option value="de-DE">German</option>
                <option value="es-ES">Spanish</option>
                <option value="ja-JP">Japanese</option>
              </select>
            </div>

            {/* HTTPS caveat */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[10px] text-amber-700">
                <span className="font-semibold">HTTPS required</span> — Web Speech API only works on localhost or HTTPS. iPad access over LAN requires a local SSL certificate.
              </p>
            </div>

          </div>
        )}
      </div>

      {/* ── Image Generation (ComfyUI) ──────────────────────────── */}
      <div className="space-y-3 border-t border-slate-100 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Image Generation
        </p>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            ComfyUI Server URL
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              className="flex-1 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-violet-400 focus:outline-none"
              value={comfyuiUrl}
              onChange={(e) => { setComfyuiUrl(e.target.value); setComfyuiStatus('idle'); }}
              placeholder="http://localhost:8188"
              spellCheck={false}
            />
            <button
              onClick={handleTestComfyUI}
              disabled={comfyuiStatus === 'checking'}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              title="Test connection"
            >
              {comfyuiStatus === 'checking' ? '…' : comfyuiStatus === 'ok' ? '✓' : comfyuiStatus === 'error' ? '✗' : 'Test'}
            </button>
          </div>
          {comfyuiStatus === 'ok' && <p className="mt-1 text-[10px] font-medium text-emerald-600">Connected</p>}
          {comfyuiStatus === 'error' && <p className="mt-1 text-[10px] text-red-500">Not reachable — is ComfyUI running?</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Default Model
          </label>
          <input
            type="text"
            className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs text-slate-900 focus:border-violet-400 focus:outline-none"
            value={comfyuiModel}
            onChange={(e) => setComfyuiModel(e.target.value)}
            placeholder="Leave blank to use first available checkpoint"
            spellCheck={false}
          />
          <p className="mt-1 text-[10px] text-slate-400">
            Filename in ComfyUI&apos;s <span className="font-mono">/models/checkpoints/</span> folder.
          </p>
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-[10px] text-slate-500">
            ComfyUI must be running separately. Install portrait models (Realistic Vision XL, DreamShaper XL) into ComfyUI&apos;s <span className="font-mono">/models/checkpoints/</span> folder.
          </p>
        </div>
      </div>

      </div>
    </aside>
  );
}
