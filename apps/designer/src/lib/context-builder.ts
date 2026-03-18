import type { NWVStory, NWVNode, NWVCharacter } from '@nodeweaver/engine';
import { getGenreBrief } from '@nodeweaver/engine';

export interface AIContext {
  /** Ordered path from root to the target node */
  ancestralPath: NWVNode[];
  /** Direct siblings (other children of the same parent node) */
  siblings: NWVNode[];
  /** Characters appearing on any node in the ancestral path */
  charactersOnPath: NWVCharacter[];
  /** Twist nodes that are reachable descendants of the target */
  downstreamTwists: NWVNode[];
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
export function buildAIContext(story: NWVStory, nodeId: string): AIContext {
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

  const ancestralPath: NWVNode[] = [];
  let cursor: string | undefined = nodeId;
  while (cursor) {
    const node = nodeMap.get(cursor);
    if (node) ancestralPath.unshift(node);
    cursor = parent.get(cursor);
  }

  // --- Siblings (other children of the immediate parent) ---
  const parentId = parent.get(nodeId);
  const siblings: NWVNode[] = parentId
    ? (children.get(parentId) ?? [])
        .filter((id) => id !== nodeId)
        .map((id) => nodeMap.get(id))
        .filter((n): n is NWVNode => n !== undefined)
    : [];

  // --- Characters on path ---
  const characterSlugsOnPath = new Set(
    ancestralPath.map((n) => n.character).filter((c): c is string => !!c)
  );
  const charactersOnPath = story.characters.filter((c) =>
    characterSlugsOnPath.has(c.id)
  );

  // --- Downstream twist nodes (BFS from target) ---
  const downstreamTwists: NWVNode[] = [];
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

/**
 * Flattens an AIContext into the Record<string, unknown> shape
 * consumed by the /api/ai/generate route.
 */
export function aiContextToFlat(
  ctx: AIContext,
  story: NWVStory,
  nodeId: string,
): Record<string, unknown> {
  const node = story.nodes.find((n) => n.id === nodeId);
  const nodeMap = new Map(story.nodes.map((n) => [n.id, n]));

  // Last 3 ancestors (excluding the target itself) for narrative continuity
  const ancestors = ctx.ancestralPath.slice(0, -1);
  const prevNodes = ancestors.slice(-3).map((n) => ({
    title: n.title || n.id,
    body: n.body,
  }));

  // Children of the target node via its choices
  const nextIds = (node?.choices ?? [])
    .map((c) => c.next)
    .filter((id): id is string => !!id);
  const nextNodes = nextIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is NWVNode => !!n)
    .map((n) => ({ title: n.title || n.id, type: n.type }));

  // Only downstream twists (not every twist in the story)
  const twistNodes = ctx.downstreamTwists.map((n) => ({
    title: n.title || n.id,
    body: n.body?.slice(0, 100),
  }));

  // World data — inject when present so AI writing stays grounded in the world
  const world = story.world;
  const worldContext: Record<string, string> = {};
  if (world) {
    if (world.locations.length > 0)
      worldContext.worldLocations = world.locations.map((l) => `${l.name}: ${l.description}`).join('\n');
    if (world.factions.length > 0)
      worldContext.worldFactions = world.factions.map((f) => `${f.name}: ${f.ideology}`).join('\n');
    if (world.rules.length > 0)
      worldContext.worldRules = world.rules.join('\n');
    if (world.lore.length > 0)
      worldContext.worldLore = world.lore.map((e) => `${e.title}: ${e.content}`).join('\n');
  }

  return {
    storyTitle: story.metadata?.title,
    genre: story.metadata?.genre,
    genreBrief: ctx.genreBrief,
    logline: ctx.logline,
    targetTone: ctx.targetTone,
    nodeTitle: node?.title,
    nodeType: node?.type,
    nodeLocation: node?.location,
    nodeMood: node?.mood,
    characters: ctx.charactersOnPath.map((c) => ({ name: c.name, role: c.role })),
    prevNodes,
    nextNodes,
    twistNodes,
    siblings: ctx.siblings.map((n) => ({ title: n.title || n.id, type: n.type })),
    ...worldContext,
  };
}

/**
 * Flattens an AIContext into the shape needed by the audio-suggest mode.
 * Includes full block texts with indices so the AI can match SFX to specific lines.
 */
export function aiContextToAudioSuggest(
  ctx: AIContext,
  story: NWVStory,
  nodeId: string,
): Record<string, unknown> {
  const base = aiContextToFlat(ctx, story, nodeId);
  const node = story.nodes.find((n) => n.id === nodeId);
  return {
    ...base,
    blocks: (node?.blocks ?? []).map((b, i) => ({
      index: i,
      type: b.type,
      text: b.text,
      characterName: b.characterId
        ? story.characters.find((c) => c.id === b.characterId)?.name
        : undefined,
    })),
  };
}
