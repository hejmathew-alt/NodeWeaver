/**
 * Ephemeral voice session state — not persisted to localStorage.
 * Tracks the microphone / voice assistant lifecycle for the current session.
 */
import { create } from 'zustand';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

interface VoiceState {
  voiceModeActive: boolean;
  status: VoiceStatus;
  lastTranscript: string;
  lastInterim: string;
  lastCommandResult: string | null;
  lastErrorMessage: string | null;

  setVoiceModeActive: (active: boolean) => void;
  setStatus: (status: VoiceStatus) => void;
  setLastTranscript: (t: string) => void;
  setLastInterim: (t: string) => void;
  setLastCommandResult: (r: string | null) => void;
  setLastErrorMessage: (e: string | null) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceState>((set) => ({
  voiceModeActive: false,
  status: 'idle',
  lastTranscript: '',
  lastInterim: '',
  lastCommandResult: null,
  lastErrorMessage: null,

  setVoiceModeActive: (voiceModeActive) => set({ voiceModeActive }),
  setStatus: (status) => set({ status }),
  setLastTranscript: (lastTranscript) => set({ lastTranscript }),
  setLastInterim: (lastInterim) => set({ lastInterim }),
  setLastCommandResult: (lastCommandResult) => set({ lastCommandResult }),
  setLastErrorMessage: (lastErrorMessage) => set({ lastErrorMessage }),
  reset: () =>
    set({
      status: 'idle',
      lastTranscript: '',
      lastInterim: '',
      lastCommandResult: null,
      lastErrorMessage: null,
    }),
}));
