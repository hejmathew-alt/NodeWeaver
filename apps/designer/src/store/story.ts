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
  qwenInstruct:
    'Male, late 40s to 50s, no strong regional accent — placeless, timeless. Deep, gravelly timbre with natural vocal weight and slow, deliberate pacing. Resonant chest voice with a slight roughness, like stone worn smooth by time. Calm and unhurried — each word chosen carefully, as if language itself is a rare resource. Poetic and measured delivery, with long, intentional pauses that feel vast rather than empty. Emotionally detached but not cold — ancient, observational, quietly inevitable. Like the universe narrating itself. Studio-quality recording.',
  voiceLocked: false,
};

function ensureNarrator(characters: NWVCharacter[]): NWVCharacter[] {
  if (characters.some((c) => c.id === 'narrator')) return characters;
  return [NARRATOR_DEFAULT, ...characters];
}

// ── Store interface ──────────────────────────────────────────────────────────

interface StoryStore {
  activeStory: NWVStory | null;
  selectedNodeId: string | null;
  selectedPanel: 'character' | 'settings' | null;
  selectedCharacterId: string | null;
  fileHandle: FileSystemFileHandle | null;

  // Load / persist
  loadStory: (id: string) => Promise<void>;
  saveStory: () => Promise<void>;
  setFileHandle: (handle: FileSystemFileHandle | null) => void;
  saveToLinkedFile: () => Promise<'saved' | 'saved-as' | 'cancelled' | 'fallback'>;

  // Selection
  setSelectedNode: (id: string | null) => void;
  setSelectedPanel: (panel: 'character' | 'settings' | null) => void;
  setSelectedCharacter: (id: string | null) => void;

  // Node CRUD
  updateNode: (nodeId: string, patch: Partial<NWVNode>) => Promise<void>;
  createNode: (type: NodeType, position?: { x: number; y: number }) => string;
  deleteNode: (nodeId: string) => void;
  updateNodePosition: (nodeId: string, x: number, y: number) => void;
  batchUpdatePositions: (positions: { id: string; x: number; y: number }[]) => void;

  // Choice CRUD
  addChoice: (nodeId: string) => string;
  updateChoice: (nodeId: string, choiceId: string, patch: Partial<NWVChoice>) => void;
  deleteChoice: (nodeId: string, choiceId: string) => void;

  // Connect two nodes (creates a choice on source pointing to target)
  connectNodes: (sourceNodeId: string, targetNodeId: string) => void;

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
  updateBlock: (nodeId: string, blockId: string, patch: Partial<Omit<NWVBlock, 'id' | 'type'>>) => void;
  deleteBlock: (nodeId: string, blockId: string) => void;
  moveBlock: (nodeId: string, blockId: string, dir: 'up' | 'down') => void;
  reorderBlock: (nodeId: string, blockId: string, newIndex: number) => void;
  moveBlockBetweenNodes: (sourceNodeId: string, blockId: string, targetNodeId: string, insertIndex: number) => void;

  // Character CRUD
  addCharacter: () => void;
  updateCharacter: (id: string, patch: Partial<NWVCharacter>) => void;
  deleteCharacter: (id: string) => void;

  // Metadata
  updateMetadata: (patch: Partial<NWVStoryMetadata>) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function stamp(story: NWVStory): NWVStory {
  return {
    ...story,
    metadata: { ...story.metadata, updatedAt: new Date().toISOString() },
  };
}

async function persist(story: NWVStory) {
  await db.stories.put(story);
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useStoryStore = create<StoryStore>((set, get) => ({
  activeStory: null,
  selectedNodeId: null,
  selectedPanel: null,
  selectedCharacterId: null,
  fileHandle: null,

  // ── Load / persist ──────────────────────────────────────────────────────────

  loadStory: async (id) => {
    const story = await db.stories.get(id);
    if (!story) return;
    // Ensure Narrator always exists
    // Migrate any nodes that don't yet have blocks[]
    const patched: NWVStory = {
      ...story,
      characters: ensureNarrator(story.characters),
      nodes: story.nodes.map(migrateNodeToBlocks),
    };
    // Restore file handle from previous session (no permission prompt yet — lazy on first save)
    const record = await db.fileHandles.get(id);
    set({ activeStory: patched, selectedCharacterId: null, fileHandle: record?.handle ?? null });
    // Persist if anything was patched (narrator injected or nodes migrated)
    const needsPersist =
      patched.characters.length !== story.characters.length ||
      patched.nodes.some((n, i) => n.blocks !== story.nodes[i]?.blocks);
    if (needsPersist) await persist(patched);
  },

  saveStory: async () => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp(activeStory);
    set({ activeStory: updated });
    await persist(updated);
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

    await saveFile(activeStory, fileHandle);
    return 'saved';
  },

  // ── Selection ───────────────────────────────────────────────────────────────

  setSelectedNode: (id) =>
    set({ selectedNodeId: id, selectedPanel: id ? null : get().selectedPanel }),

  setSelectedPanel: (panel) =>
    set({ selectedPanel: panel, selectedNodeId: panel ? null : get().selectedNodeId }),

  setSelectedCharacter: (id) => set({ selectedCharacterId: id }),

  // ── Node CRUD ───────────────────────────────────────────────────────────────

  updateNode: async (nodeId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      nodes: activeStory.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...patch } : n
      ),
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
    const node: NWVNode = {
      id,
      type,
      title: '',
      location: '',
      body: '',
      blocks: [],
      choices: [],
      status: 'draft',
      audio: [],
      lanes: [],
      position: pos,
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
    const { activeStory, selectedNodeId } = get();
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
    });
    persist(updated);
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

  addChoice: (nodeId) => {
    const { activeStory } = get();
    if (!activeStory) return '';
    const choiceId = crypto.randomUUID();
    const blank: NWVChoice = {
      id: choiceId,
      label: '',
      type: 'neutral',
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

  connectNodes: (sourceNodeId, targetNodeId) => {
    const { activeStory, addChoice, updateChoice } = get();
    if (!activeStory || sourceNodeId === targetNodeId) return;
    const source = activeStory.nodes.find((n) => n.id === sourceNodeId);
    if (!source) return;
    if (source.choices.some((c) => c.next === targetNodeId)) return;
    const choiceId = addChoice(sourceNodeId);
    updateChoice(sourceNodeId, choiceId, { next: targetNodeId });
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
      choices: [{ id: crypto.randomUUID(), label: '', type: 'neutral', next: targetId }],
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
          ...(type === 'line' ? { characterId: charId ?? '' } : {}),
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
}));
