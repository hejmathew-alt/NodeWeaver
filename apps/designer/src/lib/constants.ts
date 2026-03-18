// ── Timing ───────────────────────────────────────────────────────────────────

/** Debounce for auto-persisting story to server (store/story.ts) */
export const DEBOUNCE_PERSIST = 300;

/** Debounce for re-applying SFX word-span highlights after typing (NodeEditorPanel) */
export const DEBOUNCE_SPANS = 400;

// ── AI generation token limits ────────────────────────────────────────────────

export const AI_MAX_TOKENS: Record<string, number> = {
  'voice':             300,
  'line':              200,
  'audio-suggest':     800,
  'sfx-suggest':       800,
  'story-gen':         16000,
  'inspire':           400,
  'command-interpret': 200,
  'world-step':        1200,
  'world-recycle':     1200,
  'avatar-prompt':     200,
  'loom-analyse':      1200,
  'loom-chat':         400,
  'lighting-suggest':  600,
};

/** Fallback token limit for any mode not listed above (e.g. 'body') */
export const AI_MAX_TOKENS_DEFAULT = 500;
