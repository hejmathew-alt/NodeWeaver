/**
 * Global app settings — persisted to localStorage via Zustand.
 * API keys are stored only in the browser; never sent to any backend.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TTSProvider } from '@nodeweaver/engine';

export type SFXProvider = 'local' | 'elevenlabs';
export type AvatarProvider = 'comfyui';
export type AudioModelKey = '1.0' | 'small';
export type CanvasTextSize = 'xs' | 'sm' | 'base';
export type TimestampEngine = 'ctc' | 'whisper';
export type VoiceResponseMode = 'browser' | 'qwen';

/** Full Tailwind class strings — must be literals so JIT includes them. */
export const CANVAS_TEXT_CLASS: Record<CanvasTextSize, string> = {
  xs:   'text-[9px]',
  sm:   'text-xs',
  base: 'text-sm',
};

interface SettingsState {
  ttsProvider: TTSProvider;
  sfxProvider: SFXProvider;
  audioModel: AudioModelKey;
  anthropicKey: string;
  elevenLabsKey: string;
  canvasTextSize: CanvasTextSize;
  qwenTemperature: number;
  // Volume controls (0–1)
  volumeVoice: number;
  volumeSfx: number;
  volumeAmbient: number;
  volumeMusic: number;
  // Experimental
  wordTimestamps: boolean;
  timestampEngine: TimestampEngine;
  // Voice & Dictation
  voiceEnabled: boolean;
  wakeWord: string;
  voiceResponseMode: VoiceResponseMode;
  voiceLanguage: string;
  voiceAssistantInstruct: string;
  setTtsProvider: (p: TTSProvider) => void;
  setSfxProvider: (p: SFXProvider) => void;
  setAudioModel: (m: AudioModelKey) => void;
  setAnthropicKey: (k: string) => void;
  setElevenLabsKey: (k: string) => void;
  setCanvasTextSize: (s: CanvasTextSize) => void;
  setQwenTemperature: (t: number) => void;
  setVolumeVoice: (v: number) => void;
  setVolumeSfx: (v: number) => void;
  setVolumeAmbient: (v: number) => void;
  setVolumeMusic: (v: number) => void;
  setWordTimestamps: (b: boolean) => void;
  setTimestampEngine: (e: TimestampEngine) => void;
  setVoiceEnabled: (b: boolean) => void;
  setWakeWord: (w: string) => void;
  setVoiceResponseMode: (m: VoiceResponseMode) => void;
  setVoiceLanguage: (l: string) => void;
  setVoiceAssistantInstruct: (s: string) => void;
  // Image generation
  comfyuiUrl: string;
  comfyuiModel: string;
  setComfyuiUrl: (u: string) => void;
  setComfyuiModel: (m: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ttsProvider: 'qwen',
      sfxProvider: 'local',
      audioModel: '1.0',
      anthropicKey: '',
      elevenLabsKey: '',
      canvasTextSize: 'xs',
      qwenTemperature: 0.7,
      volumeVoice: 1.0,
      volumeSfx: 0.8,
      volumeAmbient: 0.5,
      volumeMusic: 0.5,
      wordTimestamps: false,
      timestampEngine: 'ctc',
      voiceEnabled: false,
      wakeWord: 'node',
      voiceResponseMode: 'qwen',
      voiceLanguage: 'en-US',
      voiceAssistantInstruct: 'calm neutral narrator, clear measured voice',
      setTtsProvider: (ttsProvider) => set({ ttsProvider }),
      setSfxProvider: (sfxProvider) => set({ sfxProvider }),
      setAudioModel: (audioModel) => set({ audioModel }),
      setAnthropicKey: (anthropicKey) => set({ anthropicKey }),
      setElevenLabsKey: (elevenLabsKey) => set({ elevenLabsKey }),
      setCanvasTextSize: (canvasTextSize) => set({ canvasTextSize }),
      setQwenTemperature: (qwenTemperature) => set({ qwenTemperature }),
      setVolumeVoice: (volumeVoice) => set({ volumeVoice }),
      setVolumeSfx: (volumeSfx) => set({ volumeSfx }),
      setVolumeAmbient: (volumeAmbient) => set({ volumeAmbient }),
      setVolumeMusic: (volumeMusic) => set({ volumeMusic }),
      setWordTimestamps: (wordTimestamps) => set({ wordTimestamps }),
      setTimestampEngine: (timestampEngine) => set({ timestampEngine }),
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setWakeWord: (wakeWord) => set({ wakeWord }),
      setVoiceResponseMode: (voiceResponseMode) => set({ voiceResponseMode }),
      setVoiceLanguage: (voiceLanguage) => set({ voiceLanguage }),
      setVoiceAssistantInstruct: (voiceAssistantInstruct) => set({ voiceAssistantInstruct }),
      comfyuiUrl: 'http://localhost:8188',
      comfyuiModel: '',
      setComfyuiUrl: (comfyuiUrl) => set({ comfyuiUrl }),
      setComfyuiModel: (comfyuiModel) => set({ comfyuiModel }),
    }),
    { name: 'vrd-settings' },
  ),
);
