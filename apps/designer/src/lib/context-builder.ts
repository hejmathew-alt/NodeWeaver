import type { VRNStory, VRNNode, VRNCharacter } from '@void-runner/engine';
import { getGenreBrief } from '@void-runner/engine';

export interface AIContext {
  /** Ordered path from root to the target node */
  ancestralPath: VRNNode[];
  /** Direct siblings (other children of the same parent node) */
  siblings: VRNNode[];
  /** Characters appearing on any node in the ancestral path */
  charactersOnPath: VRNCharacter[];
  /** Twist nodes that are reachable descendants of the target */
  downstreamTwists: VRNNode[];
  /** Genre writing brief (custom or preset) */
  genreBrief: string;
  /** Story logline */
  logline: string;
  /** Target tone */
  targetTone: string;
}

/**
 * Builds the full AI context for a given node ID.
 * This is the heart of the AI writing assistant — everything the
 * model needs to write consistently toward downstream twists.
 */
export function buildAIContext(story: VRNStory, nodeId: string): AIContext {
  const nodeMap = new Map(story.nodes.map((n) => [n.id, n]));

  // Build adjacency list: parentId → childIds (via choices)
  const children = new Map<string, string[]>();
  for (const node of story.nodes) {
    for (const choice of node.choices) {
      if (choice.next) {
        const existing = children.get(node.id) ?? [];
        existing.push(choice.next);
        children.set(node.id, existing);
      }
    }
  }

  // --- Ancestral path (root → target) via BFS back-tracking ---
  const parent = new Map<string, string>();
  const roots = story.nodes.filter(
    (n) => !story.nodes.some((other) => other.choices.some((c) => c.next === n.id))
  );

  // BFS from all roots to find parent of each node
  const queue = roots.map((r) => r.id);
  const visited = new Set<string>(queue);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const childId of children.get(current) ?? []) {
      if (!visited.has(childId)) {
        visited.add(childId);
        parent.set(childId, current);
        queue.push(childId);
      }
    }
  }

  const ancestralPath: VRNNode[] = [];
  let cursor: string | undefined = nodeId;
  while (cursor) {
    const node = nodeMap.get(cursor);
    if (node) ancestralPath.unshift(node);
    cursor = parent.get(cursor);
  }

  // --- Siblings (other children of the immediate parent) ---
  const parentId = parent.get(nodeId);
  const siblings: VRNNode[] = parentId
    ? (children.get(parentId) ?? [])
        .filter((id) => id !== nodeId)
        .map((id) => nodeMap.get(id))
        .filter((n): n is VRNNode => n !== undefined)
    : [];

  // --- Characters on path ---
  const characterSlugsOnPath = new Set(
    ancestralPath.map((n) => n.character).filter((c): c is string => !!c)
  );
  const charactersOnPath = story.characters.filter((c) =>
    characterSlugsOnPath.has(c.id)
  );

  // --- Downstream twist nodes (BFS from target) ---
  const downstreamTwists: VRNNode[] = [];
  const twistQueue = [nodeId];
  const twistVisited = new Set<string>([nodeId]);
  while (twistQueue.length > 0) {
    const current = twistQueue.shift()!;
    for (const childId of children.get(current) ?? []) {
      if (!twistVisited.has(childId)) {
        twistVisited.add(childId);
        twistQueue.push(childId);
        const child = nodeMap.get(childId);
        if (child?.type === 'twist') downstreamTwists.push(child);
      }
    }
  }

  return {
    ancestralPath,
    siblings,
    charactersOnPath,
    downstreamTwists,
    genreBrief: getGenreBrief(story.metadata.genre, story.metadata.customGenreBrief),
    logline: story.metadata.logline,
    targetTone: story.metadata.targetTone,
  };
}
