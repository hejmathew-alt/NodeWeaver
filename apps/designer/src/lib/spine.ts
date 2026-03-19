import type { NWVNode } from '@nodeweaver/engine';

/**
 * Compute the spine — the critical path through the story.
 *
 * Strategy:
 * 1. DFS from every `start` node, tracking visited nodes (cycle protection).
 * 2. Simultaneously find:
 *    a. The longest path that reaches an `end` node (preferred — complete story arc).
 *    b. The longest path overall (fallback for incomplete stories / Quick Start skeletons).
 * 3. After auto-detection, overlay author overrides:
 *    - spineNode === true  → force into the spine set
 *    - spineNode === false → force out of the spine set
 *
 * Returns a Set of node IDs that are on the spine.
 */
export function computeSpine(nodes: NWVNode[]): Set<string> {
  // Build adjacency list: nodeId → [nextNodeId, ...]
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    const nexts: string[] = [];
    for (const c of n.choices) {
      if (c.next) nexts.push(c.next);
    }
    adj.set(n.id, nexts);
  }

  const endIds = new Set(nodes.filter((n) => n.type === 'end').map((n) => n.id));
  const startNodes = nodes.filter((n) => n.type === 'start');

  let bestEndPath: string[] = [];
  let bestAnyPath: string[] = [];

  function dfs(nodeId: string, path: string[], visited: Set<string>) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    path.push(nodeId);

    const children = adj.get(nodeId) ?? [];
    if (children.length === 0 || endIds.has(nodeId)) {
      // Leaf or end node — evaluate candidates
      if (endIds.has(nodeId) && path.length > bestEndPath.length) {
        bestEndPath = [...path];
      }
      if (path.length > bestAnyPath.length) {
        bestAnyPath = [...path];
      }
    } else {
      for (const next of children) {
        dfs(next, path, visited);
      }
    }

    path.pop();
    visited.delete(nodeId);
  }

  for (const start of startNodes) {
    dfs(start.id, [], new Set());
  }

  // If no start node exists, run DFS from all nodes with no incoming edges
  if (startNodes.length === 0) {
    const hasIncoming = new Set<string>();
    for (const n of nodes) {
      for (const c of n.choices) {
        if (c.next) hasIncoming.add(c.next);
      }
    }
    for (const n of nodes) {
      if (!hasIncoming.has(n.id)) {
        dfs(n.id, [], new Set());
      }
    }
  }

  const autoPath = bestEndPath.length > 0 ? bestEndPath : bestAnyPath;
  const spineSet = new Set(autoPath);

  // Overlay author overrides
  for (const n of nodes) {
    if (n.spineNode === true) spineSet.add(n.id);
    else if (n.spineNode === false) spineSet.delete(n.id);
  }

  return spineSet;
}
