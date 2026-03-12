'use client';

import { useState } from 'react';
import type { TTSProvider } from '@nodeweaver/engine';
import { useSettingsStore, type CanvasTextSize } from '@/lib/settings';
import { useStoryStore } from '@/store/story';

const TTS_PROVIDERS: { value: TTSProvider; label: string; note?: string }[] = [
  { value: 'qwen',       label: 'Qwen (local)',       note: 'Voice design via instruct prompt' },
  { value: 'elevenlabs', label: 'ElevenLabs',          note: 'Requires API key' },
  { value: 'kokoro',     label: 'Kokoro (local)',      note: 'Coming soon' },
  { value: 'webspeech',  label: 'Web Speech',          note: 'Browser built-in fallback' },
];

// ── API key field with show/hide toggle ──────────────────────────────────────

function KeyField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
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
          placeholder={placeholder}
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
    ttsProvider, anthropicKey, elevenLabsKey, canvasTextSize,
    setTtsProvider, setAnthropicKey, setElevenLabsKey, setCanvasTextSize,
  } = useSettingsStore();
  const setSelectedPanel = useStoryStore((s) => s.setSelectedPanel);

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-slate-200 bg-white" style={{ width: panelWidth }}>
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
          />

          <KeyField
            label="ElevenLabs"
            placeholder="sk_…"
            value={elevenLabsKey}
            onChange={setElevenLabsKey}
          />

          <p className="text-[11px] leading-relaxed text-slate-400">
            Keys are stored only in your browser's local storage and are never sent to any server other
            than the respective API endpoint.
          </p>
        </div>

      </div>
    </aside>
  );
}
