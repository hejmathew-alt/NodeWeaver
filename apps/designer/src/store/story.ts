import { create } from 'zustand';
import type {
  VRNStory,
  VRNNode,
  VRNChoice,
  VRNStoryMetadata,
  NodeType,
} from '@void-runner/engine';
import { db } from '@/lib/db';

interface StoryStore {
  activeStory: VRNStory | null;
  selectedNodeId: string | null;

  // Load / persist
  loadStory: (id: string) => Promise<void>;
  saveStory: () => Promise<void>;

  // Selection
  setSelectedNode: (id: string | null) => void;

  // Node CRUD
  updateNode: (nodeId: string, patch: Partial<VRNNode>) => Promise<void>;
  createNode: (type: NodeType, position?: { x: number; y: number }) => string;
  deleteNode: (nodeId: string) => void;
  updateNodePosition: (nodeId: string, x: number, y: number) => void;

  // Choice CRUD
  addChoice: (nodeId: string) => string;
  updateChoice: (nodeId: string, choiceId: string, patch: Partial<VRNChoice>) => void;
  deleteChoice: (nodeId: string, choiceId: string) => void;

  // Connect two nodes (creates a choice on source pointing to target)
  connectNodes: (sourceNodeId: string, targetNodeId: string) => void;

  // Metadata
  updateMetadata: (patch: Partial<VRNStoryMetadata>) => void;
}

function stamp(story: VRNStory): VRNStory {
  return {
    ...story,
    metadata: { ...story.metadata, updatedAt: new Date().toISOString() },
  };
}

async function persist(story: VRNStory) {
  await db.stories.put(story);
}

export const useStoryStore = create<StoryStore>((set, get) => ({
  activeStory: null,
  selectedNodeId: null,

  // ── Load / persist ──────────────────────────────────────────────────────────

  loadStory: async (id) => {
    const story = await db.stories.get(id);
    if (story) set({ activeStory: story });
  },

  saveStory: async () => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated = stamp(activeStory);
    set({ activeStory: updated });
    await persist(updated);
  },

  // ── Selection ───────────────────────────────────────────────────────────────

  setSelectedNode: (id) => set({ selectedNodeId: id }),

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
    const node: VRNNode = {
      id,
      type,
      title: '',
      location: '',
      body: '',
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
    set({ activeStory: updated, selectedNodeId: id });
    persist(updated);
    return id;
  },

  deleteNode: (nodeId) => {
    const { activeStory, selectedNodeId } = get();
    if (!activeStory) return;
    const updated = stamp({
      ...activeStory,
      // Remove node
      nodes: activeStory.nodes
        .filter((n) => n.id !== nodeId)
        // Scrub dangling choice wires pointing to deleted node
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

  // ── Choice CRUD ─────────────────────────────────────────────────────────────

  addChoice: (nodeId) => {
    const { activeStory } = get();
    if (!activeStory) return '';
    const choiceId = crypto.randomUUID();
    const blank: VRNChoice = {
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
    // Don't duplicate an existing wire to the same target
    if (source.choices.some((c) => c.next === targetNodeId)) return;
    const choiceId = addChoice(sourceNodeId);
    updateChoice(sourceNodeId, choiceId, { next: targetNodeId });
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
