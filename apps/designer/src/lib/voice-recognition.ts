/**
 * Voice recognition module — wraps the Web Speech API SpeechRecognition.
 * Provides a singleton instance, dictation-target routing, and a unified
 * event handler that splits speech into commands (wake word) vs dictation.
 */

// ── SpeechRecognition types (browser) ─────────────────────────────────────────

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

// ── Event types ───────────────────────────────────────────────────────────────

export type VoiceRecognitionEvent =
  | { type: 'interim'; transcript: string }
  | { type: 'final'; transcript: string }
  | { type: 'error'; message: string }
  | { type: 'started' }
  | { type: 'stopped' };

export type VoiceRecognitionListener = (event: VoiceRecognitionEvent) => void;

// ── VoiceRecognition class ────────────────────────────────────────────────────

export class VoiceRecognition {
  private recognition: SpeechRecognition | null = null;
  private listeners: VoiceRecognitionListener[] = [];
  private _active = false;
  private _shouldRestart = false;
  private language: string;

  constructor(language = 'en-US') {
    this.language = language;
  }

  get isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      (!!window.SpeechRecognition || !!window.webkitSpeechRecognition)
    );
  }

  get isActive(): boolean {
    return this._active;
  }

  /** Subscribe to recognition events. Returns an unsubscribe function. */
  on(listener: VoiceRecognitionListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: VoiceRecognitionEvent) {
    this.listeners.forEach((l) => l(event));
  }

  start() {
    if (!this.isSupported || this._active) return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.language;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this._active = true;
      this.emit({ type: 'started' });
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      if (result.isFinal) {
        this.emit({ type: 'final', transcript: transcript.trim() });
      } else {
        this.emit({ type: 'interim', transcript: transcript.trim() });
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        this._shouldRestart = false;
        this.emit({ type: 'error', message: 'Microphone permission denied' });
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.emit({ type: 'error', message: `Speech recognition error: ${event.error}` });
      }
    };

    rec.onend = () => {
      this._active = false;
      // Auto-restart if the user hasn't explicitly stopped (handles browser
      // auto-stopping on silence, which is common in Safari).
      if (this._shouldRestart) {
        setTimeout(() => {
          if (this._shouldRestart) this.start();
        }, 200);
      } else {
        this.emit({ type: 'stopped' });
      }
    };

    this._shouldRestart = true;
    this.recognition = rec;
    try {
      rec.start();
    } catch {
      // Ignore "already started" errors from rapid toggling
    }
  }

  stop() {
    this._shouldRestart = false;
    this._active = false;
    try {
      this.recognition?.stop();
    } catch {
      // Ignore errors on stop
    }
    this.recognition = null;
    this.emit({ type: 'stopped' });
  }

  updateLanguage(lang: string) {
    this.language = lang;
    if (this._active) {
      this.stop();
      this.start();
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: VoiceRecognition | null = null;

export function getVoiceRecognition(): VoiceRecognition {
  if (!_instance) _instance = new VoiceRecognition();
  return _instance;
}

// ── Dictation target routing ──────────────────────────────────────────────────

/** A field that can receive dictated text. Registered on focus, unregistered on blur. */
export interface DictationTarget {
  /** Stable identifier (blockId, input id, etc.) */
  id: string;
  /** Insert final committed text at the cursor position. */
  insert: (text: string) => void;
  /** Show in-progress interim text (grayed/italic). */
  setInterim: (text: string) => void;
  /** Remove the interim span when text commits or is cancelled. */
  clearInterim: () => void;
}

let _activeDictationTarget: DictationTarget | null = null;

export function setActiveDictationTarget(target: DictationTarget | null) {
  _activeDictationTarget = target;
}

export function getActiveDictationTarget(): DictationTarget | null {
  return _activeDictationTarget;
}

// ── Event router ──────────────────────────────────────────────────────────────

interface VoiceStoreSlice {
  setStatus: (s: 'idle' | 'listening' | 'processing' | 'speaking') => void;
  setLastTranscript: (t: string) => void;
  setLastInterim: (t: string) => void;
}

/**
 * Central event handler called by VoiceHUD on every recognition event.
 * Routes:
 *  - interim → active dictation target (not if wake word prefix)
 *  - final + wake word → onCommand(strippedText)
 *  - final without wake word → active dictation target insert
 */
export function handleVoiceEvent(
  event: VoiceRecognitionEvent,
  wakeWord: string,
  onCommand: (text: string) => void,
  voiceStore: VoiceStoreSlice,
) {
  const wakeWordRegex = new RegExp(`^${wakeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,\\s]`, 'i');

  if (event.type === 'interim') {
    voiceStore.setLastInterim(event.transcript);
    // If it looks like a command in progress, don't echo to the field
    if (!wakeWordRegex.test(event.transcript)) {
      _activeDictationTarget?.setInterim(event.transcript);
    }
  }

  if (event.type === 'final') {
    voiceStore.setLastTranscript(event.transcript);
    voiceStore.setLastInterim('');
    _activeDictationTarget?.clearInterim();

    if (wakeWordRegex.test(event.transcript)) {
      // Strip wake word and route to command interpreter
      const commandText = event.transcript.replace(wakeWordRegex, '').trim();
      if (commandText) onCommand(commandText);
    } else {
      // Dictate to the active field
      if (_activeDictationTarget) {
        _activeDictationTarget.insert(event.transcript + ' ');
      }
    }
  }
}
