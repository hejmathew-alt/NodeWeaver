// ============================================================
// VRN — Void Runner Narrative format
// Source of truth for all schema shared between the designer
// app and the game engine runtime.
// ============================================================

export type NodeType = 'story' | 'combat' | 'chat' | 'twist' | 'start' | 'end';
export type NodeStatus = 'draft' | 'complete' | 'needs-work';
export type StatType = 'str' | 'wit' | 'charm' | 'neutral';
export type GenreSlug =
  | 'sci-fi'
  | 'fantasy'
  | 'horror'
  | 'mystery-noir'
  | 'post-apocalyptic'
  | 'cyberpunk'
  | 'custom';

// ------------------------------------------------------------
// Choices
// ------------------------------------------------------------

export interface VRNEffects {
  str?: number;
  wit?: number;
  charm?: number;
  /** Sets state.flags[flag] = true */
  flag?: string;
}

export interface VRNRequirement {
  str?: number;
  wit?: number;
  charm?: number;
  /** Choice only visible if state.flags[flag] is truthy */
  flag?: string;
}

export interface VRNCombat {
  /** Key into VRNStory.enemies */
  enemy: string;
  phase: number;
}

export interface VRNEnding {
  title: string;
  text: string;
}

// ------------------------------------------------------------
// Script lines (multi-character conversation) — DEPRECATED
// Use VRNBlock[] (node.blocks) instead. Kept for migration.
// ------------------------------------------------------------

export interface VRNScriptLine {
  id: string;
  /** ID into VRNStory.characters; '' → use node's default character */
  characterId: string;
  text: string;
  /** Overrides node-level mood for this line's TTS delivery only */
  mood?: string;
}

// ------------------------------------------------------------
// Blocks (unified content — replaces body + lines)
// ------------------------------------------------------------

export interface VRNBlock {
  id: string;
  /**
   * 'prose' — narrative/descriptive text; read by narrator (or characterId if set).
   * 'line'  — character dialogue; always has a characterId.
   */
  type: 'prose' | 'line';
  text: string;
  /** Character that speaks this block. Prose defaults to narrator if empty. */
  characterId?: string;
  /** Overrides node-level mood for this block's TTS delivery */
  mood?: string;
}

export interface VRNChoice {
  id: string;
  /** Button text shown to the player */
  label: string;
  /** Brief narrative beat shown on canvas edge (designer only) */
  flavour?: string;
  type: StatType;
  /** ID of the next VRNNode */
  next?: string;
  /** Intermediate consequence screen text */
  consequence?: string;
  positiveConsequence?: boolean;
  effects?: VRNEffects;
  requires?: VRNRequirement;
  /** Triggers a combat encounter instead of a scene transition */
  combat?: VRNCombat;
  /** Flags this choice as starting an AI chat session */
  echoInit?: boolean;
  /** Opening message from the AI character */
  echoOpening?: string;
  /** Inline ending — bypasses scene transition */
  ending?: VRNEnding;
}

// ------------------------------------------------------------
// Nodes
// ------------------------------------------------------------

export interface VRNNode {
  // --- Engine fields (consumed by the VRN runtime player) ---
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
  choices: VRNChoice[];

  // --- Designer + engine metadata ---
  /** Character slug (key into VRNStory.characters) */
  character?: string;
  mood?: string;
  status: NodeStatus;
  /**
   * Unified content blocks (prose + dialogue lines interleaved).
   * Replaces the old body/useScript/lines trio.
   */
  blocks?: VRNBlock[];
  /** @deprecated Use blocks instead */
  useScript?: boolean;
  /** @deprecated Use blocks instead */
  lines?: VRNScriptLine[];
  /** Rendered audio clip filenames: node_{id}_{character_slug}.mp3 */
  audio: string[];
  /**
   * Lane membership:
   *   []          = no lane
   *   ['lane-id'] = hard lane (belongs to one arc)
   *   ['a', 'b']  = soft lane (shared beat across arcs)
   */
  lanes: string[];

  // --- Canvas layout (stripped on engine export) ---
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

// ------------------------------------------------------------
// Characters
// ------------------------------------------------------------

export type TTSProvider = 'qwen' | 'elevenlabs' | 'kokoro' | 'webspeech';

export interface VRNCharacter {
  id: string;
  name: string;
  /** e.g. "ECHO — ship AI" */
  role: string;
  backstory: string;
  /** Tone, speech patterns, quirks */
  traits: string;
  ttsProvider?: TTSProvider;
  /** Free-form natural language voice design prompt for Qwen TTS */
  qwenInstruct?: string;
  /** True once the designer is satisfied with the voice — textarea becomes read-only */
  voiceLocked?: boolean;
  elevenLabsVoiceId?: string;
  kokoroVoice?: string;
  kokoroSpeed?: number;
}

// ------------------------------------------------------------
// Swim lanes
// ------------------------------------------------------------

export interface VRNLane {
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

export interface VRNEnemy {
  name: string;
  hp: number;
  /** [min, max] damage per hit */
  damage: [number, number];
  /** ASCII art display string */
  art: string;
  taunts: string[];
}

// ------------------------------------------------------------
// Top-level story file
// ------------------------------------------------------------

export interface VRNStoryMetadata {
  title: string;
  genre: GenreSlug;
  /** Only used when genre === 'custom'; injected verbatim into AI prompts */
  customGenreBrief?: string;
  logline: string;
  targetTone: string;
  coverColour?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VRNStory {
  version: '1.0';
  id: string;
  metadata: VRNStoryMetadata;
  nodes: VRNNode[];
  characters: VRNCharacter[];
  lanes: VRNLane[];
  enemies: Record<string, VRNEnemy>;
}

// ------------------------------------------------------------
// Runtime player state (used by the VRN engine, not the designer)
// ------------------------------------------------------------

export interface VRNPlayerState {
  str: number;
  wit: number;
  charm: number;
  hp: number;
  chapter: number;
  flags: Record<string, boolean>;
  gamePhase: 'scene' | 'combat' | 'echo-chat';
  echoMemory: Array<{ role: 'user' | 'assistant'; content: string }>;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  postEchoNodeId: string | null;
}
