// ============================================================
// NWV — NodeWeaver format
// Source of truth for all schema shared between the designer
// app and the game engine runtime.
// ============================================================

export type NodeType = 'story' | 'combat' | 'chat' | 'twist' | 'start' | 'end';

// ------------------------------------------------------------
// Audio timestamps
// ------------------------------------------------------------

/**
 * A single word's timing within a TTS audio file.
 * Produced by faster-whisper (Qwen) or ElevenLabs /with-timestamps.
 */
export interface WordTimestamp {
  /** The word text (stripped of surrounding whitespace). */
  word: string;
  /** Start time in milliseconds from the start of the audio clip. */
  start_ms: number;
  /** End time in milliseconds from the start of the audio clip. */
  end_ms: number;
}
export type InteractionType = 'dice-combat';
export type NodeStatus = 'draft' | 'complete' | 'needs-work';
export type GenreSlug =
  | 'sci-fi'
  | 'fantasy'
  | 'horror'
  | 'mystery-noir'
  | 'post-apocalyptic'
  | 'survival'
  | 'cyberpunk'
  | 'comedy'
  | 'romance'
  | 'children'
  | 'custom';

// ------------------------------------------------------------
// Choices
// ------------------------------------------------------------

export interface NWVEffects {
  /** Sets state.flags[flag] = true */
  flag?: string;
}

export interface NWVRequirement {
  /** Choice only visible if state.flags[flag] is truthy */
  flag?: string;
}

export interface NWVCombat {
  /** Key into NWVStory.enemies */
  enemy: string;
  phase: number;
}

export interface NWVEnding {
  title: string;
  text: string;
}

// ------------------------------------------------------------
// Script lines (multi-character conversation) — DEPRECATED
// Use NWVBlock[] (node.blocks) instead. Kept for migration.
// ------------------------------------------------------------

export interface NWVScriptLine {
  id: string;
  /** ID into NWVStory.characters; '' → use node's default character */
  characterId: string;
  text: string;
  /** Overrides node-level mood for this line's TTS delivery only */
  mood?: string;
}

// ------------------------------------------------------------
// Blocks (unified content — replaces body + lines)
// ------------------------------------------------------------

export interface NWVBlock {
  id: string;
  /**
   * 'prose' — narrative/descriptive text; read by narrator (or characterId if set).
   * 'line'  — character dialogue; always has a characterId.
   */
  type: 'prose' | 'line';
  text: string;
  /** Character that speaks this block. Prose defaults to narrator if empty. */
  characterId?: string;
  /** @deprecated Use emotion/tone/voiceTexture instead */
  mood?: string;
  /** Qwen bracket tag: [Emotional: X] */
  emotion?: string;
  /** Qwen bracket tag: [Tone: X] */
  tone?: string;
  /** Qwen bracket tag: [Voice: X] — per-block texture override */
  voiceTexture?: string;
  /** ElevenLabs per-block stability override (0–1). Shown as slider when character uses EL. */
  elevenLabsStability?: number;
  /** ElevenLabs per-block similarity boost override (0–1). */
  elevenLabsSimilarity?: number;
  /** ElevenLabs per-block style override (0–1). */
  elevenLabsStyle?: number;
  /** Timed sound effect cues that fire during this block's playback */
  sfxCues?: NWVSFXCue[];
  /** Pre-rendered TTS filename (ref into _audio/). Set by Finalise for Release. */
  ttsAudioFile?: string;
  /** Cache key for auto-cached EL TTS (text|voiceId|stability|similarity|style).
   *  If set and mismatches current key, cached file is skipped and regenerated. */
  ttsAudioHash?: string;
}

export interface NWVSFXCue {
  id: string;
  /** Generated audio filename (ref into _audio/ folder) */
  filename: string;
  /** Text prompt used to generate (kept for regeneration) */
  prompt: string;
  /** Word index in the block text this cue is anchored to (0-based).
   *  Undefined = unlinked (uses raw offsetMs instead). */
  wordIndex?: number;
  /** Fine-tune offset in ms relative to the word anchor (negative = earlier, positive = later).
   *  Only applied when wordIndex is set. Defaults to 0. */
  wordOffsetMs?: number;
  /** Delay in ms from block start. Computed from wordIndex at playback when linked. */
  offsetMs: number;
  /** Duration of the generated clip in seconds */
  duration: number;
  /** Hex color for visual linking (e.g. '#f59e0b') */
  color?: string;
}

export interface NWVChoice {
  id: string;
  /** Button text shown to the player */
  label: string;
  /** Brief narrative beat shown on canvas edge (designer only) */
  flavour?: string;
  /** ID of the next NWVNode */
  next?: string;
  /** Intermediate consequence screen text */
  consequence?: string;
  positiveConsequence?: boolean;
  effects?: NWVEffects;
  requires?: NWVRequirement;
  /** Triggers a combat encounter instead of a scene transition */
  combat?: NWVCombat;
  /** Flags this choice as starting an AI chat session */
  echoInit?: boolean;
  /** Opening message from the AI character */
  echoOpening?: string;
  /** Inline ending — bypasses scene transition */
  ending?: NWVEnding;
  /** For Interactive nodes — marks this choice as a combat outcome route */
  combatOutcome?: 'victory' | 'defeat' | 'escape';
  /** React Flow handle ID on the source node (e.g. 'bottom', 'left', 'right') */
  sourceHandle?: string;
  /** React Flow handle ID on the target node (e.g. 'top', 'target-left', 'target-right') */
  targetHandle?: string;
}

// ------------------------------------------------------------
// Nodes
// ------------------------------------------------------------

export interface NWVNode {
  // --- Engine fields (consumed by the NWV runtime player) ---
  id: string;
  type: NodeType;
  /** "Location · Sublocation" header */
  location?: string;
  /** Scene headline */
  title?: string;
  /**
   * Main narrative text (HTML allowed).
   * Auto-derived from prose blocks (deriveBody) — kept for game engine compat.
   */
  body: string;
  choices: NWVChoice[];

  // --- Designer + engine metadata ---
  /** Character slug (key into NWVStory.characters) */
  character?: string;
  mood?: string;
  status: NodeStatus;
  /** Prevents editing and deletion in the designer (easily toggled) */
  locked?: boolean;
  /**
   * Unified content blocks (prose + dialogue lines interleaved).
   * Replaces the old body/useScript/lines trio.
   */
  blocks?: NWVBlock[];
  /** @deprecated Use blocks instead */
  useScript?: boolean;
  /** @deprecated Use blocks instead */
  lines?: NWVScriptLine[];
  /** Audio filenames: ambient_*, music_*, legacy node_* clips */
  audio: string[];
  /** Text prompt used to generate ambient audio for this scene */
  ambientPrompt?: string;
  /** Text prompt used to generate background music for this scene */
  musicPrompt?: string;
  /**
   * Lane membership:
   *   []          = no lane
   *   ['lane-id'] = hard lane (belongs to one arc)
   *   ['a', 'b']  = soft lane (shared beat across arcs)
   */
  lanes: string[];

  // --- Interactive node (combat) ---
  /** Subtype for Interactive nodes — determines which mechanic runs in PlayMode */
  interactionType?: InteractionType;
  /** Key into NWVStory.enemies — for dice-combat */
  combatEnemy?: string;

  // --- Visual FX keyframes (designer-only, stripped on engine export) ---
  vfxKeyframes?: NWVVFXKeyframe[];

  // --- Canvas layout (stripped on engine export) ---
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

// ------------------------------------------------------------
// Visual Effects
// ------------------------------------------------------------

export type VFXEffectType = 'blur' | 'brightness' | 'vignette' | 'tint' | 'flicker' | 'shake' | 'textOpacity' | 'saturation' | 'contrast';

export interface NWVVFXKeyframe {
  id: string;
  /** Offset from node start in milliseconds */
  timeMs: number;
  /** Which CSS visual effect to apply */
  effect: VFXEffectType;
  /** Effect value — px for blur/shake, 0–1 for brightness/textOpacity, hex for tint */
  value: number | string;
  /** CSS transition duration in milliseconds */
  transitionMs: number;
  /** Optional natural language description */
  prompt?: string;
}

// ------------------------------------------------------------
// Characters
// ------------------------------------------------------------

export type TTSProvider = 'qwen' | 'elevenlabs';
export type ArtStyle = 'realistic' | 'illustrated' | 'manga' | 'graphic_novel' | 'dark_fantasy' | 'ink_sketch' | 'pixel_art' | 'chibi';

export interface NWVCharacter {
  id: string;
  name: string;
  /** e.g. "ECHO — ship AI" */
  role: string;
  backstory: string;
  /** Tone, speech patterns, quirks */
  traits: string;
  ttsProvider?: TTSProvider;

  // ── Qwen TTS ──────────────────────────────────────────────────────────────
  /** Free-form natural language voice design prompt for Qwen TTS */
  qwenInstruct?: string;
  /** Default emotion for Qwen bracket tags: [Emotional: X] */
  defaultEmotion?: string;
  /** Default tone for Qwen bracket tags: [Tone: X] */
  defaultTone?: string;
  /** Default voice texture for Qwen bracket tags: [Voice: X] */
  defaultVoiceTexture?: string;

  // ── ElevenLabs TTS ────────────────────────────────────────────────────────
  /** Voice design description used to generate the EL voice */
  elevenLabsDescription?: string;
  /** Accent for EL voice generation: american | british | australian | indian | african */
  elevenLabsAccent?: string;
  /** Gender for EL voice generation: male | female */
  elevenLabsGender?: string;
  /** Saved ElevenLabs voice ID (set after Create & Lock) */
  elevenLabsVoiceId?: string;
  /** EL voice stability (0–1). Higher = more consistent. Default 0.5 */
  elevenLabsStability?: number;
  /** EL voice similarity boost (0–1). Default 0.75 */
  elevenLabsSimilarity?: number;
  /** EL voice style exaggeration (0–1). Default 0.0 */
  elevenLabsStyle?: number;

  // ── Shared ────────────────────────────────────────────────────────────────
  /** True once the designer is satisfied with the voice — fields become read-only */
  voiceLocked?: boolean;

  // ── Portrait / Avatar ──────────────────────────────────────────────────────
  /** Natural language appearance description for image generation */
  avatarPrompt?: string;
  /** Filename in _avatars/ folder (e.g. "avatar-{id}.png") */
  avatarFile?: string;
  /** ComfyUI seed — undefined = random each time, set when locked */
  avatarSeed?: number;
  /** Freeze seed so regenerations stay visually consistent */
  avatarLocked?: boolean;
}

// ------------------------------------------------------------
// Swim lanes
// ------------------------------------------------------------

export interface NWVLane {
  id: string;
  name: string;
  /** CSS hex colour — used for canvas tint and node border */
  colour: string;
  /** Tone, stakes, emotional register — fed to AI */
  description: string;
  /** Informational only; not enforced by engine */
  entryCondition?: string;
}

// ------------------------------------------------------------
// Enemies (combat)
// ------------------------------------------------------------

export interface NWVEnemy {
  name: string;
  hp: number;
  /** [min, max] damage per hit */
  damage: [number, number];
  /** ASCII art display string */
  art: string;
  taunts: string[];
}

// ------------------------------------------------------------
// World Builder
// ------------------------------------------------------------

export interface NWVLocation {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
}

export interface NWVFaction {
  id: string;
  name: string;
  ideology: string;
  leader: string;
  /** Relationship to the protagonist */
  relation: string;
}

export interface NWVLoreEntry {
  id: string;
  title: string;
  content: string;
}

export interface NWVWorldData {
  locations: NWVLocation[];
  factions: NWVFaction[];
  /** Plain-text world rules / constraints */
  rules: string[];
  lore: NWVLoreEntry[];
}

// ------------------------------------------------------------
// Top-level story file
// ------------------------------------------------------------

export interface NWVStoryMetadata {
  title: string;
  genre: GenreSlug;
  /** Only used when genre === 'custom'; injected verbatim into AI prompts */
  customGenreBrief?: string;
  logline: string;
  targetTone: string;
  coverColour?: string;
  /** Project-level art style for character portrait generation */
  artStyle?: ArtStyle;
  createdAt: string;
  updatedAt: string;
}

export interface NWVStory {
  version: '1.0';
  id: string;
  metadata: NWVStoryMetadata;
  nodes: NWVNode[];
  characters: NWVCharacter[];
  lanes: NWVLane[];
  enemies: Record<string, NWVEnemy>;
  world?: NWVWorldData;
}

// ------------------------------------------------------------
// Runtime player state (used by the NWV engine, not the designer)
// ------------------------------------------------------------

export interface NWVPlayerState {
  hp: number;
  chapter: number;
  flags: Record<string, boolean>;
  gamePhase: 'scene' | 'combat' | 'echo-chat';
  echoMemory: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  postEchoNodeId: string | null;
}

// ------------------------------------------------------------
// Audio generation (SFX / Ambient / Music)
// ------------------------------------------------------------

export type AudioGenType = 'sfx' | 'ambient' | 'music';

export interface AudioGenRequest {
  type: AudioGenType;
  prompt: string;
  /** Duration in seconds. SFX: 3–10, Ambient: 5–60, Music: 5–60 */
  duration?: number;
}

export interface AudioGenResult {
  type: AudioGenType;
  filename: string;
  prompt: string;
  /** Actual duration of the generated clip in seconds */
  duration: number;
}
