/**
 * Global app settings — persisted to localStorage via Zustand.
 * API keys are stored only in the browser; never sent to any backend.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TTSProvider } from '@void-runner/engine';

export type CanvasTextSize = 'xs' | 'sm' | 'base';

/** Full Tailwind class strings — must be literals so JIT includes them. */
export const CANVAS_TEXT_CLASS: Record<CanvasTextSize, string> = {
  xs:   'text-[9px]',
  sm:   'text-xs',
  base: 'text-sm',
};

interface SettingsState {
  ttsProvider: TTSProvider;
  anthropicKey: string;
  elevenLabsKey: string;
  canvasTextSize: CanvasTextSize;
  setTtsProvider: (p: TTSProvider) => void;
  setAnthropicKey: (k: string) => void;
  setElevenLabsKey: (k: string) => void;
  setCanvasTextSize: (s: CanvasTextSize) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ttsProvider: 'qwen',
      anthropicKey: '',
      elevenLabsKey: '',
      canvasTextSize: 'xs',
      setTtsProvider: (ttsProvider) => set({ ttsProvider }),
      setAnthropicKey: (anthropicKey) => set({ anthropicKey }),
      setElevenLabsKey: (elevenLabsKey) => set({ elevenLabsKey }),
      setCanvasTextSize: (canvasTextSize) => set({ canvasTextSize }),
    }),
    { name: 'vrd-settings' },
  ),
);
