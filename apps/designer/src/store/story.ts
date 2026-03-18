import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type {
  NWVStory,
  NWVNode,
  NWVBlock,
  NWVChoice,
  NWVCharacter,
  NWVScriptLine,
  NWVStoryMetadata,
  NWVEnemy,
  NWVWorldData,
  NWVLocation,
  NWVFaction,
  NWVLoreEntry,
  NWVVFXKeyframe,
  NWVLane,
  NodeType,
} from '@nodeweaver/engine';
import { db } from '@/lib/db';
import { saveFileAs, saveFile } from '@/lib/export';
import { deriveBody, migrateNodeToBlocks } from '@/lib/blocks';

// ── Narrator default ─────────────────────────────────────────────────────────

export const NARRATOR_DEFAULT: NWVCharacter = {
  id: 'narrator',
  name: 'Narrator',
  role: 'Omniscient story narrator',
  backstory: '',
  traits: '',
  ttsProvider: 'qwen',
  qwenInstruct: 'Female narrator, warm clear voice, measured unhurried delivery',
  voiceLocked: true,
};

function ensureNarrator(characters: NWVCharacter[]): NWVCharacter[] {
  const existing = characters.find((c) => c.id === 'narrator');
  if (!existing) return [NARRATOR_DEFAULT, ...characters];
  // Always enforce canonical voice on the narrator so it stays locked and consistent
  if (existing.qwenInstruct === NARRATOR_DEFAULT.qwenInstruct && existing.voiceLocked) return characters;
  return characters.map((c) =>
    c.id === 'narrator'
      ? { ...c, qwenInstruct: NARRATOR_DEFAULT.qwenInstruct, voiceLocked: true }
      : c
  );
}

// ── Store interface ──────────────────────────────────────────────────────────

interface StoryStore {
  activeStory: NWVStory | null;
  selectedNodeId: string | null;
  selectedPanel: 'settings' | null;
  selectedCharacterId: string | null;
  activeView: 'canvas' | 'characters' | 'encounters';
  fileHandle: FileSystemFileHandle | null;
  playFromNodeId: string | null;
  canvasPlayNodeId: string | null;
  undoStack: NWVStory[];
  playingNodeId: string | null;
  visitedNodeIds: string[];
  chosenChoiceIds: string[];
  avfxMode: boolean;
  avfxNodeId: string | null;
  avfxPlayheadMs: number;
  avfxBlockDurationsMs: number[];

  // Load / persist
  loadStory: (id: string) => Promise<void>;
  saveStory: () => Promise<void>;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
  saveToLinkedFile: () => Promise<'saved' | 'saved-as' | 'cancelled' | 'fallback'>;

  // Selection
  setSelectedNode: (id: string | null) => void;
  setSelectedPanel: (panel: 'settings' | null) => void;
  setActiveView: (view: 'canvas' | 'characters' | 'encounters') => void;
  setSelectedCharacter: (id: string | null) => void;
  setPlayFromNodeId: (id: string | null) => void;
  setCanvasPlayNodeId: (id: string | null) => void;
  setPlayingNodeId: (id: string | null) => void;
  addVisitedNode: (id: string) => void;
  addChosenChoice: (choiceId: string) => void;
  clearPlayHistory: () => void;

  // Node CRUD
  updateNode: (nodeId: string, patch: Partial<NWVNode>) => Promise<void>;
  createNode: (type: NodeType, position?: { x: number; y: number }) => string;
  deleteNode: (nodeId: string) => void;
  undoDeleteNode: () => void;
  updateNodePosition: (nodeId: string, x: number, y: number) => void;
  batchUpdatePositions: (positions: { id: string; x: number; y: number }[]) => void;

  // Choice CRUD
  addChoice: (nodeId: string, defaults?: Partial<NWVChoice>) => string;
  updateChoice: (nodeId: string, choiceId: string, patch: Partial<NWVChoice>) => void;
  deleteChoice: (nodeId: string, choiceId: string) => void;

  // Connect two nodes (creates a choice on source pointing to target)
  connectNodes: (sourceNodeId: string, targetNodeId: string, sourceHandle?: string, targetHandle?: string) => void;

  // Insert a new node between two connected nodes (splits the edge)
  insertNodeBetween: (sourceId: string, targetId: string, type: NodeType) => string;

  // Node sizing
  updateNodeSize: (nodeId: string, width: number, height: number) => void;

  // Script line CRUD (deprecated — use block actions; kept for legacy)
  addLine: (nodeId: string, characterId?: string) => void;
  updateLine: (nodeId: string, lineId: string, patch: Partial<Omit<NWVScriptLine, 'id'>>) => void;
  deleteLine: (nodeId: string, lineId: string) => void;
  moveLine: (nodeId: string, lineId: string, dir: 'up' | 'down') => void;

  // Block CRUD
  addBlock: (nodeId: string, type: 'prose' | 'line', defaultCharId?: string) => void;
  updateBlock: (nodeId: string, blockId: string, patch: Partial<Omit<NWVBlock, 'id'>>) => void;
  deleteBlock: (nodeId: string, blockId: string) => void;
  moveBlock: (nodeId: string, blockId: string, dir: 'up' | 'down') => void;
  reorderBlock: (nodeId: string, blockId: string, newIndex: number) => void;
  moveBlockBetweenNodes: (sourceNodeId: string, blockId: string, targetNodeId: string, insertIndex: number) => void;

  // Character CRUD
  addCharacter: () => void;
  addCharacterNamed: (name: string) => string;
  updateCharacter: (id: string, patch: Partial<NWVCharacter>) => void;
  deleteCharacter: (id: string) => void;

  // Audio
  addBlockSfxCue: (nodeId: string, blockId: string, cue: import('@nodeweaver/engine').NWVSFXCue) => void;
  removeBlockSfxCue: (nodeId: string, blockId: string, cueId: string) => void;
  updateBlockSfxCue: (nodeId: string, blockId: string, cueId: string, patch: Partial<import('@nodeweaver/engine').NWVSFXCue>) => void;
  updateNodeAudio: (nodeId: string, patch: { audio?: string[]; ambientPrompt?: string; musicPrompt?: string }) => void;
  removeAudioFile: (nodeId: string, filename: string) => void;
  clearAllSfxCues: () => void;

  // Enemy CRUD
  addEnemy: (key: string, enemy: NWVEnemy) => void;
  updateEnemy: (key: string, patch: Partial<NWVEnemy>) => void;
  deleteEnemy: (key: string) => void;

  // Metadata
  updateMetadata: (patch: Partial<NWVStoryMetadata>) => void;

  // World Builder
  updateWorld: (patch: Partial<NWVWorldData>) => void;
  addLocation: (loc: NWVLocation) => void;
  updateLocation: (id: string, patch: Partial<NWVLocation>) => void;
  deleteLocation: (id: string) => void;
  addFaction: (f: NWVFaction) => void;
  updateFaction: (id: string, patch: Partial<NWVFaction>) => void;
  deleteFaction: (id: string) => void;
  updateWorldRules: (rules: string[]) => void;
  addLoreEntry: (e: NWVLoreEntry) => void;
  updateLoreEntry: (id: string, patch: Partial<NWVLoreEntry>) => void;
  deleteLoreEntry: (id: string) => void;

  // Lanes
  addLane: () => string;
  updateLane: (id: string, patch: Partial<NWVLane>) => void;
  deleteLane: (id: string) => void;
  assignNodeToLane: (nodeId: string, laneId: string) => void;
  removeNodeFromLane: (nodeId: string, laneId: string) => void;

  // AV FX mode
  setAVFXMode: (active: boolean) => void;
  setAVFXNodeId: (id: string | null) => void;
  setAvfxPlayheadMs: (ms: number) => void;
  setAvfxBlockDurationsMs: (durations: number[]) => void;
  addVFXKeyframe: (nodeId: string, kf: NWVVFXKeyframe) => void;
  updateVFXKeyframe: (nodeId: string, kfId: string, patch: Partial<NWVVFXKeyframe>) => void;
  removeVFXKeyframe: (nodeId: string, kfId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stamp(story: NWVStory): NWVStory {
  return {
    ...story,
    metadata: { ...story.metadata, updatedAt: new Date().toISOString() },
  };
}

// Debounced (300ms) — avoids flooding the server on every keystroke
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function persist(story: NWVStory): void {
  if (_persistTimer !== null) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    fetch(`/api/stories/${encodeURIComponent(story.id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(story),
    }).catch((err) => console.error('[story] persist error:', err));
  }, 300);
}

// Immediate write — used for explicit save actions (Cmd+S, saveStory)
async function persistNow(story: NWVStory): Promise<void> {
  if (_persistTimer !== null) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  await fetch(`/api/stories/${encodeURIComponent(story.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(story),
  });
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useStoryStore = create<StoryStore>((set, get) => ({
  activeStory: null,
  selectedNodeId: null,
  selectedPanel: null,
  selectedCharacterId: null,
  activeView: 'canvas',
  fileHandle: null,
  playFromNodeId: null,
  canvasPlayNodeId: null,
  undoStack: [],
  playingNodeId: null,
  visitedNodeIds: [],
  chosenChoiceIds: [],
  avfxMode: false,
  avfxNodeId: null,
  avfxPlayheadMs: 0,
  avfxBlockDurationsMs: [],

  // ── Load / persist ──────────────────────────────────────────────────────────

  loadStory: async (id) => {
    const res = await fetch(`/api/stories/${encodeURIComponent(id)}`);
    if (!res.ok) return;
    const story: NWVStory = await res.json();
    // Ensure Narrator always exists
    // Migrate any nodes that don't yet have blocks[]
    const patched: NWVStory = {
      ...story,
      characters: ensureNarrator(story.characters),
      nodes: story.nodes.map(migrateNodeToBlocks),
    };
    // Restore file handle from previous session (browser-bound, stays in IDB)
    const record = await db.fileHandles.get(id);
    set({ activeStory: patched, selectedCharacterId: null, fileHandle: record?.handle ?? null });
    // Persist if anything was patched (narrator injected or nodes migrated)
    const needsPersist =
      patched.characters.length !== story.characters.length ||
      patched.nodes.some((n, i) => n.blocks !== story.nodes[i]?.blocks);
    if (needsPersist) await persistNow(patched);
  },

  saveStory: async () => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp(activeStory);
    set({ activeStory: updated });
    await persistNow(updated);
  },

  setFileHandle: (handle) => set({ fileHandle: handle }),

  saveToLinkedFile: async () => {
    const { activeStory, fileHandle, setFileHandle } = get();
    if (!activeStory) return 'cancelled';
    const fsapiAvailable = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

    if (!fileHandle) {
      const newHandle = await saveFileAs(activeStory);
      if (!newHandle) return fsapiAvailable ? 'cancelled' : 'fallback';
      setFileHandle(newHandle);
      await db.fileHandles.put({ storyId: activeStory.id, handle: newHandle });
      return 'saved-as';
    }

    // Lazy permission check — must be inside a user gesture (button click or Cmd+S)
    if ('queryPermission' in fileHandle) {
      let perm = await fileHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'denied') {
        setFileHandle(null);
        await db.fileHandles.delete(activeStory.id);
        return 'cancelled';
      }
      if (perm === 'prompt') {
        perm = await fileHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return 'cancelled';
      }
    }

    try {
      await saveFile(activeStory, fileHandle);
      return 'saved';
    } catch (err) {
      // Handle stale/revoked handle — clear it and prompt for a new file location
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        set({ fileHandle: null });
        await db.fileHandles.delete(activeStory.id).catch(() => {});
        const newHandle = await saveFileAs(activeStory);
        if (!newHandle) return 'cancelled';
        setFileHandle(newHandle);
        await db.fileHandles.put({ storyId: activeStory.id, handle: newHandle });
        return 'saved-as';
      }
      throw err;
    }
  },

  // ── Selection ───────────────────────────────────────────────────────────────

  setSelectedNode: (id) =>
    set({ selectedNodeId: id, selectedPanel: id ? null : get().selectedPanel }),

  setSelectedPanel: (panel) =>
    set({ selectedPanel: panel, selectedNodeId: panel ? null : get().selectedNodeId }),

  setActiveView: (view) => set((s) => ({
    activeView: s.activeView === view ? 'canvas' : view,
  })),

  setSelectedCharacter: (id) => set({ selectedCharacterId: id }),

  setPlayFromNodeId: (id) => set({ playFromNodeId: id }),
  setCanvasPlayNodeId: (id) => set({ canvasPlayNodeId: id }),
  setPlayingNodeId: (id) => set({ playingNodeId: id }),
  addVisitedNode: (id) => set((s) => ({
    visitedNodeIds: s.visitedNodeIds.includes(id) ? s.visitedNodeIds : [...s.visitedNodeIds, id],
  })),
  addChosenChoice: (choiceId) => set((s) => ({ chosenChoiceIds: [...s.chosenChoiceIds, choiceId] })),
  clearPlayHistory: () => set({ visitedNodeIds: [], chosenChoiceIds: [] }),

  // ── Node CRUD ───────────────────────────────────────────────────────────────

  updateNode: async (nodeId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const merged = { ...n, ...patch };
        // Auto-create outcome choices when switching to combat type
        if (patch.type === 'combat' && !merged.choices.some((c) => c.combatOutcome)) {
          merged.interactionType = merged.interactionType ?? 'dice-combat';
          merged.choices = [
            ...merged.choices,
            { id: crypto.randomUUID(), label: 'Victory', combatOutcome: 'victory' as const },
            { id: crypto.randomUUID(), label: 'Defeat',  combatOutcome: 'defeat'  as const },
          ];
        }
        return merged;
      }),
    });
    set({ activeStory: updated });
    await persist(updated);
  },

  createNode: (type, position) => {
    const { activeStory } = get();
    if (!activeStory) return '';
    const id = crypto.randomUUID();
    const pos = position ?? {
      x: 380 + Math.random() * 160 - 80,
      y: 260 + Math.random() * 160 - 80,
    };
    const combatChoices: NWVChoice[] = type === 'combat' ? [
      { id: crypto.randomUUID(), label: 'Victory', combatOutcome: 'victory' },
      { id: crypto.randomUUID(), label: 'Defeat',  combatOutcome: 'defeat'  },
    ] : [];
    const node: NWVNode = {
      id,
      type,
      title: '',
      location: '',
      body: '',
      blocks: [],
      choices: combatChoices,
      status: 'draft',
      audio: [],
      lanes: [],
      position: pos,
      ...(type === 'combat' ? { interactionType: 'dice-combat' } : {}),
    };
    const updated = stamp({
      ...activeStory,
      nodes: [...activeStory.nodes, node],
    });
    set({ activeStory: updated, selectedNodeId: id, selectedPanel: null });
    persist(updated);
    return id;
  },

  deleteNode: (nodeId) => {
    const { activeStory, selectedNodeId, undoStack } = get();
    if (!activeStory) return;
    const target = activeStory.nodes.find((n) => n.id === nodeId);
    if (target?.locked) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes
        .filter((n) => n.id !== nodeId)
        .map((n) => ({
          ...n,
          choices: n.choices.map((c) =>
            c.next === nodeId ? { ...c, next: undefined } : c
          ),
        })),
    });
    set({
      activeStory: updated,
      selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId,
      undoStack: [...undoStack.slice(-9), activeStory],
    });
    persist(updated);
  },

  undoDeleteNode: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    set({ activeStory: previous, undoStack: undoStack.slice(0, -1) });
    persist(previous);
  },

  updateNodePosition: (nodeId, x, y) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: { x, y } } : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  batchUpdatePositions: (positions) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const posMap = new Map(positions.map((p) => [p.id, p]));
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        const p = posMap.get(n.id);
        return p ? { ...n, position: { x: p.x, y: p.y } } : n;
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  // ── Choice CRUD ─────────────────────────────────────────────────────────────

  addChoice: (nodeId, defaults) => {
    const { activeStory } = get();
    if (!activeStory) return '';
    const choiceId = crypto.randomUUID();
    const blank: NWVChoice = {
      id: choiceId,
      label: '',
      ...defaults,
    };
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, choices: [...n.choices, blank] } : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
    return choiceId;
  },

  updateChoice: (nodeId, choiceId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              choices: n.choices.map((c) =>
                c.id === choiceId ? { ...c, ...patch } : c
              ),
            }
          : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  deleteChoice: (nodeId, choiceId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, choices: n.choices.filter((c) => c.id !== choiceId) }
          : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  // ── Connect ─────────────────────────────────────────────────────────────────

  connectNodes: (sourceNodeId, targetNodeId, sourceHandle?, targetHandle?) => {
    const { activeStory, addChoice, updateChoice } = get();
    if (!activeStory || sourceNodeId === targetNodeId) return;
    const source = activeStory.nodes.find((n) => n.id === sourceNodeId);
    if (!source) return;
    if (source.choices.some((c) => c.next === targetNodeId)) return;
    const choiceId = addChoice(sourceNodeId);
    const patch: Partial<NWVChoice> = { next: targetNodeId };
    if (sourceHandle) patch.sourceHandle = sourceHandle;
    if (targetHandle) patch.targetHandle = targetHandle;
    updateChoice(sourceNodeId, choiceId, patch);
  },

  // ── Insert between ──────────────────────────────────────────────────────────

  insertNodeBetween: (sourceId, targetId, type) => {
    const { activeStory } = get();
    if (!activeStory) return '';
    const source = activeStory.nodes.find((n) => n.id === sourceId);
    const target = activeStory.nodes.find((n) => n.id === targetId);
    if (!source || !target) return '';

    const id = crypto.randomUUID();
    const pos = {
      x: (source.position.x + target.position.x) / 2,
      y: (source.position.y + target.position.y) / 2,
    };
    const newNode: NWVNode = {
      id,
      type,
      title: '',
      location: '',
      body: '',
      blocks: [],
      choices: [{ id: crypto.randomUUID(), label: '', next: targetId }],
      status: 'draft',
      audio: [],
      lanes: [],
      position: pos,
    };

    // Rewire: source's choice that pointed to target now points to newNode
    const updated = stamp({
      ...activeStory,
      nodes: [
        ...activeStory.nodes.map((n) => {
          if (n.id !== sourceId) return n;
          return {
            ...n,
            choices: n.choices.map((c) =>
              c.next === targetId ? { ...c, next: id } : c
            ),
          };
        }),
        newNode,
      ],
    });
    set({ activeStory: updated, selectedNodeId: id, selectedPanel: null });
    persist(updated);
    return id;
  },

  // ── Node sizing ─────────────────────────────────────────────────────────────

  updateNodeSize: (nodeId, width, height) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, width, height } : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  // ── Script line CRUD ────────────────────────────────────────────────────────

  addLine: (nodeId, characterId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const lineId = crypto.randomUUID();
    const blank: NWVScriptLine = { id: lineId, characterId: characterId ?? '', text: '' };
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, lines: [...(n.lines ?? []), blank] } : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  updateLine: (nodeId, lineId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, lines: (n.lines ?? []).map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
          : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  deleteLine: (nodeId, lineId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, lines: (n.lines ?? []).filter((l) => l.id !== lineId) } : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  moveLine: (nodeId, lineId, dir) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId || !n.lines) return n;
        const lines = [...n.lines];
        const idx = lines.findIndex((l) => l.id === lineId);
        if (idx === -1) return n;
        const swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= lines.length) return n;
        [lines[idx], lines[swap]] = [lines[swap], lines[idx]];
        return { ...n, lines };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  // ── Block CRUD ──────────────────────────────────────────────────────────────

  addBlock: (nodeId, type, defaultCharId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const blocks = n.blocks ?? [];
        // For line blocks, default to the last line block's speaker
        let charId = defaultCharId;
        if (type === 'line' && !charId) {
          const lastLine = [...blocks].reverse().find((b) => b.type === 'line');
          charId = lastLine?.characterId ?? '';
        }
        const blank: NWVBlock = {
          id: nanoid(),
          type,
          text: '',
          characterId: type === 'line' ? (charId ?? '') : 'narrator',
        };
        const newBlocks = [...blocks, blank];
        return { ...n, blocks: newBlocks, body: deriveBody(newBlocks) };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  updateBlock: (nodeId, blockId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const newBlocks = (n.blocks ?? []).map((b) =>
          b.id === blockId ? { ...b, ...patch } : b
        );
        return { ...n, blocks: newBlocks, body: deriveBody(newBlocks) };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  deleteBlock: (nodeId, blockId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const newBlocks = (n.blocks ?? []).filter((b) => b.id !== blockId);
        return { ...n, blocks: newBlocks, body: deriveBody(newBlocks) };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  moveBlock: (nodeId, blockId, dir) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const blocks = [...(n.blocks ?? [])];
        const idx = blocks.findIndex((b) => b.id === blockId);
        if (idx === -1) return n;
        const swap = dir === 'up' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= blocks.length) return n;
        [blocks[idx], blocks[swap]] = [blocks[swap], blocks[idx]];
        return { ...n, blocks, body: deriveBody(blocks) };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  reorderBlock: (nodeId, blockId, newIndex) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const blocks = [...(n.blocks ?? [])];
        const oldIdx = blocks.findIndex((b) => b.id === blockId);
        if (oldIdx === -1 || oldIdx === newIndex) return n;
        const [moved] = blocks.splice(oldIdx, 1);
        blocks.splice(newIndex, 0, moved);
        return { ...n, blocks, body: deriveBody(blocks) };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  moveBlockBetweenNodes: (sourceNodeId, blockId, targetNodeId, insertIndex) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const targetNode = activeStory.nodes.find((n) => n.id === targetNodeId);
    if (targetNode?.locked) return;
    let movedBlock: NWVBlock | undefined;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id === sourceNodeId) {
          const blocks = (n.blocks ?? []).filter((b) => {
            if (b.id === blockId) { movedBlock = b; return false; }
            return true;
          });
          return { ...n, blocks, body: deriveBody(blocks) };
        }
        if (n.id === targetNodeId && movedBlock) {
          const blocks = [...(n.blocks ?? [])];
          blocks.splice(insertIndex, 0, movedBlock);
          return { ...n, blocks, body: deriveBody(blocks) };
        }
        return n;
      }),
    });
    if (!movedBlock) return;
    set({ activeStory: updated });
    persist(updated);
  },

  // ── Character CRUD ──────────────────────────────────────────────────────────

  addCharacter: () => {
    const { activeStory } = get();
    if (!activeStory) return;
    const id = `char_${crypto.randomUUID().slice(0, 8)}`;
    const newChar: NWVCharacter = {
      id,
      name: 'New Character',
      role: '',
      backstory: '',
      traits: '',
      ttsProvider: 'qwen',
      qwenInstruct: '',
      voiceLocked: false,
    };
    const updated = stamp({
      ...activeStory,
      characters: [...activeStory.characters, newChar],
    });
    set({ activeStory: updated, selectedCharacterId: id });
    persist(updated);
  },

  addCharacterNamed: (name) => {
    const { activeStory } = get();
    if (!activeStory) return '';
    const id = `char_${crypto.randomUUID().slice(0, 8)}`;
    const newChar: NWVCharacter = {
      id,
      name,
      role: '',
      backstory: '',
      traits: '',
      ttsProvider: 'qwen',
      qwenInstruct: '',
      voiceLocked: false,
    };
    const updated = stamp({
      ...activeStory,
      characters: [...activeStory.characters, newChar],
    });
    set({ activeStory: updated });
    persist(updated);
    return id;
  },

  updateCharacter: (id, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      characters: activeStory.characters.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  deleteCharacter: (id) => {
    const { activeStory, selectedCharacterId } = get();
    if (!activeStory || id === 'narrator') return;
    const updated = stamp({
      ...activeStory,
      characters: activeStory.characters.filter((c) => c.id !== id),
    });
    set({
      activeStory: updated,
      selectedCharacterId: selectedCharacterId === id ? null : selectedCharacterId,
    });
    persist(updated);
  },

  // ── Audio ──────────────────────────────────────────────────────────────────

  addBlockSfxCue: (nodeId, blockId, cue) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, blocks: (n.blocks ?? []).map((b) =>
          b.id === blockId ? { ...b, sfxCues: [...(b.sfxCues ?? []), cue] } : b
        ) };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  removeBlockSfxCue: (nodeId, blockId, cueId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, blocks: (n.blocks ?? []).map((b) =>
          b.id === blockId ? { ...b, sfxCues: (b.sfxCues ?? []).filter((c) => c.id !== cueId) } : b
        ) };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  updateBlockSfxCue: (nodeId, blockId, cueId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return { ...n, blocks: (n.blocks ?? []).map((b) =>
          b.id === blockId ? { ...b, sfxCues: (b.sfxCues ?? []).map((c) =>
            c.id === cueId ? { ...c, ...patch } : c
          ) } : b
        ) };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  updateNodeAudio: (nodeId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...patch } : n
      ),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  removeAudioFile: (nodeId, filename) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          audio: n.audio.filter((f) => f !== filename),
          blocks: (n.blocks ?? []).map((b) => ({
            ...b,
            sfxCues: (b.sfxCues ?? []).filter((c) => c.filename !== filename),
          })),
        };
      }),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  clearAllSfxCues: () => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) => ({
        ...n,
        blocks: (n.blocks ?? []).map((b) => ({ ...b, sfxCues: [] })),
      })),
    });
    set({ activeStory: updated });
    persist(updated);
  },

  // ── Enemies ──────────────────────────────────────────────────────────────────

  addEnemy: (key, enemy) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({ ...activeStory, enemies: { ...activeStory.enemies, [key]: enemy } });
    set({ activeStory: updated }); persist(updated);
  },

  updateEnemy: (key, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({ ...activeStory, enemies: { ...activeStory.enemies,
      [key]: { ...activeStory.enemies[key], ...patch } } });
    set({ activeStory: updated }); persist(updated);
  },

  deleteEnemy: (key) => {
    const { activeStory } = get();
    if (!activeStory) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [key]: _removed, ...rest } = activeStory.enemies;
    const updated = stamp({ ...activeStory, enemies: rest });
    set({ activeStory: updated }); persist(updated);
  },

  // ── Metadata ────────────────────────────────────────────────────────────────

  updateMetadata: (patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      metadata: { ...activeStory.metadata, ...patch },
    });
    set({ activeStory: updated });
    persist(updated);
  },

  // ── World Builder ────────────────────────────────────────────────────────────

  updateWorld: (patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const existing = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...existing, ...patch } });
    set({ activeStory: updated }); persist(updated);
  },

  addLocation: (loc) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world, locations: [...world.locations, loc] } });
    set({ activeStory: updated }); persist(updated);
  },

  updateLocation: (id, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world,
      locations: world.locations.map((l) => l.id === id ? { ...l, ...patch } : l) } });
    set({ activeStory: updated }); persist(updated);
  },

  deleteLocation: (id) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world,
      locations: world.locations.filter((l) => l.id !== id) } });
    set({ activeStory: updated }); persist(updated);
  },

  addFaction: (f) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world, factions: [...world.factions, f] } });
    set({ activeStory: updated }); persist(updated);
  },

  updateFaction: (id, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world,
      factions: world.factions.map((f) => f.id === id ? { ...f, ...patch } : f) } });
    set({ activeStory: updated }); persist(updated);
  },

  deleteFaction: (id) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world,
      factions: world.factions.filter((f) => f.id !== id) } });
    set({ activeStory: updated }); persist(updated);
  },

  updateWorldRules: (rules) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world, rules } });
    set({ activeStory: updated }); persist(updated);
  },

  addLoreEntry: (e) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world, lore: [...world.lore, e] } });
    set({ activeStory: updated }); persist(updated);
  },

  updateLoreEntry: (id, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world,
      lore: world.lore.map((e) => e.id === id ? { ...e, ...patch } : e) } });
    set({ activeStory: updated }); persist(updated);
  },

  deleteLoreEntry: (id) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const world = activeStory.world ?? { locations: [], factions: [], rules: [], lore: [] };
    const updated = stamp({ ...activeStory, world: { ...world,
      lore: world.lore.filter((e) => e.id !== id) } });
    set({ activeStory: updated }); persist(updated);
  },

  // ── AV FX mode ───────────────────────────────────────────────────────────────

  setAVFXMode: (active) => set({ avfxMode: active }),
  setAVFXNodeId: (id) => set({ avfxNodeId: id }),
  setAvfxPlayheadMs: (ms) => set({ avfxPlayheadMs: ms }),
  setAvfxBlockDurationsMs: (durations) => set({ avfxBlockDurationsMs: durations }),

  addVFXKeyframe: (nodeId, kf) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, vfxKeyframes: [...(n.vfxKeyframes ?? []), kf] } : n
      ),
    });
    set({ activeStory: updated }); persist(updated);
  },

  updateVFXKeyframe: (nodeId, kfId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, vfxKeyframes: (n.vfxKeyframes ?? []).map((k) => k.id === kfId ? { ...k, ...patch } : k) }
          : n
      ),
    });
    set({ activeStory: updated }); persist(updated);
  },

  removeVFXKeyframe: (nodeId, kfId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, vfxKeyframes: (n.vfxKeyframes ?? []).filter((k) => k.id !== kfId) }
          : n
      ),
    });
    set({ activeStory: updated }); persist(updated);
  },

  // ── Lane actions ─────────────────────────────────────────────────────────

  addLane: () => {
    const { activeStory } = get();
    if (!activeStory) return '';
    const PALETTE = ['#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#64748b', '#f97316', '#14b8a6'];
    const colour = PALETTE[(activeStory.lanes ?? []).length % PALETTE.length];
    const lane: NWVLane = { id: nanoid(), name: 'New Lane', colour, description: '' };
    const updated = stamp({ ...activeStory, lanes: [...(activeStory.lanes ?? []), lane] });
    set({ activeStory: updated }); persist(updated);
    return lane.id;
  },

  updateLane: (id, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      lanes: (activeStory.lanes ?? []).map((l) => l.id === id ? { ...l, ...patch } : l),
    });
    set({ activeStory: updated }); persist(updated);
  },

  deleteLane: (id) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      lanes: (activeStory.lanes ?? []).filter((l) => l.id !== id),
      nodes: activeStory.nodes.map((n) => ({ ...n, lanes: (n.lanes ?? []).filter((lid) => lid !== id) })),
    });
    set({ activeStory: updated }); persist(updated);
  },

  assignNodeToLane: (nodeId, laneId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId && !(n.lanes ?? []).includes(laneId)
          ? { ...n, lanes: [...(n.lanes ?? []), laneId] }
          : n
      ),
    });
    set({ activeStory: updated }); persist(updated);
  },

  removeNodeFromLane: (nodeId, laneId) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, lanes: (n.lanes ?? []).filter((lid) => lid !== laneId) } : n
      ),
    });
    set({ activeStory: updated }); persist(updated);
  },
}));
