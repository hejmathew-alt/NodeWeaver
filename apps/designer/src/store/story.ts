import { create } from 'zustand';
import type { VRNStory, VRNNode } from '@void-runner/engine';
import { db } from '@/lib/db';

interface StoryStore {
  activeStory: VRNStory | null;
  selectedNodeId: string | null;

  // Actions
  loadStory: (id: string) => Promise<void>;
  setSelectedNode: (id: string | null) => void;
  updateNode: (nodeId: string, patch: Partial<VRNNode>) => Promise<void>;
  saveStory: () => Promise<void>;
}

export const useStoryStore = create<StoryStore>((set, get) => ({
  activeStory: null,
  selectedNodeId: null,

  loadStory: async (id) => {
    const story = await db.stories.get(id);
    if (story) set({ activeStory: story });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  updateNode: async (nodeId, patch) => {
    const { activeStory } = get();
    if (!activeStory) return;

    const updatedNodes = activeStory.nodes.map((n) =>
      n.id === nodeId ? { ...n, ...patch } : n
    );
    const updated: VRNStory = {
      ...activeStory,
      nodes: updatedNodes,
      metadata: {
        ...activeStory.metadata,
        updatedAt: new Date().toISOString(),
      },
    };
    set({ activeStory: updated });
    await db.stories.put(updated);
  },

  saveStory: async () => {
    const { activeStory } = get();
    if (!activeStory) return;
    const updated: VRNStory = {
      ...activeStory,
      metadata: {
        ...activeStory.metadata,
        updatedAt: new Date().toISOString(),
      },
    };
    set({ activeStory: updated });
    await db.stories.put(updated);
  },
}));
