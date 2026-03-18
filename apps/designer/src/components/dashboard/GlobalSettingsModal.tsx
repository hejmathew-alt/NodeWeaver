'use client';

import { useSettingsStore, type VoiceResponseMode } from '@/lib/settings';

interface GlobalSettingsModalProps {
  onClose: () => void;
}

export function GlobalSettingsModal({ onClose }: GlobalSettingsModalProps) {
  const {
    anthropicKey,
    elevenLabsKey,
    voiceEnabled,
    wakeWord,
    voiceResponseMode,
    voiceLanguage,
    voiceAssistantInstruct,
    setAnthropicKey,
    setElevenLabsKey,
    setVoiceEnabled,
    setWakeWord,
    setVoiceResponseMode,
    setVoiceLanguage,
    setVoiceAssistantInstruct,
  } = useSettingsStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-6">

          {/* API Keys */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">API Keys</p>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Anthropic API Key</label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-…"
                className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-violet-400 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400">Used for AI writing, voice commands, and story generation</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">ElevenLabs API Key</label>
              <input
                type="password"
                value={elevenLabsKey}
                onChange={(e) => setElevenLabsKey(e.target.value)}
                placeholder="el-…"
                className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-violet-400 focus:outline-none font-mono"
              />
              <p className="text-[10px] text-slate-400">Required for ElevenLabs TTS and SFX generation</p>
            </div>
          </div>

          {/* Voice & Dictation */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Voice &amp; Dictation</p>

            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="accent-violet-500"
              />
              <div>
                <div className="text-xs font-medium text-slate-700">Enable voice mode</div>
                <div className="text-[10px] text-slate-400">Shows mic button in canvas toolbar</div>
              </div>
            </label>

            {voiceEnabled && (
              <div className="space-y-3 pl-1">

                {/* Wake word */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Wake word</label>
                  <input
                    type="text"
                    value={wakeWord}
                    onChange={(e) => setWakeWord(e.target.value.toLowerCase().trim() || 'node')}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none"
                    placeholder="node"
                  />
                  <p className="text-[10px] text-slate-400">
                    Prefix commands with &ldquo;<span className="font-mono">{wakeWord}, …</span>&rdquo; to trigger AI
                  </p>
                </div>

                {/* Response mode */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Voice response</p>
                  {([
                    { value: 'qwen'    as VoiceResponseMode, label: 'Qwen narrator',  note: 'Local · same voice engine as story TTS' },
                    { value: 'browser' as VoiceResponseMode, label: 'Browser speech', note: 'Instant · system voice' },
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
                        name="global-voice-response-mode"
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
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Assistant voice instruct</label>
                  <textarea
                    value={voiceAssistantInstruct}
                    onChange={(e) => setVoiceAssistantInstruct(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-violet-400 focus:outline-none resize-none"
                    placeholder="e.g. calm neutral narrator, clear measured voice"
                  />
                  <p className="text-[10px] text-slate-400">Qwen instruct for the assistant voice (separate from your story narrator)</p>
                </div>

                {/* Language */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recognition language</label>
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

        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
