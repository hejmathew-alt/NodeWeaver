/**
 * Graph layout helpers for the story canvas.
 *
 * autoLayout  — Dagre top-to-bottom hierarchical layout.
 * pushOverlaps — Collision resolution after a node drag.
 */

import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

const GAP_X = 40; // horizontal gap between nodes
const GAP_Y = 60; // vertical gap between nodes

// ── Auto-layout (Dagre) ───────────────────────────────────────────────────────

export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: GAP_X, ranksep: GAP_Y });

  for (const node of nodes) {
    const w = (node.style?.width as number | undefined) ?? 220;
    const h = (node.style?.height as number | undefined) ?? 120;
    g.setNode(node.id, { width: w, height: h });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const w = (node.style?.width as number | undefined) ?? 220;
    const h = (node.style?.height as number | undefined) ?? 120;
    return {
      ...node,
      position: {
        x: pos.x - w / 2,
        y: pos.y - h / 2,
      },
    };
  });
}

// ── Push-on-drop collision resolution ────────────────────────────────────────

const PADDING = 16; // extra gap added when pushing overlapping nodes

interface Rect { id: string; x: number; y: number; w: number; h: number }

function toRect(node: Node): Rect {
  return {
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    w: (node.style?.width  as number | undefined) ?? 220,
    h: (node.style?.height as number | undefined) ?? 120,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w + PADDING &&
    a.x + a.w + PADDING > b.x &&
    a.y < b.y + b.h + PADDING &&
    a.y + a.h + PADDING > b.y
  );
}

/**
 * After dragging `movedId`, nudge any nodes that overlap it (and cascade).
 * Returns a full updated node array — only positions change.
 */
export function pushOverlaps(nodes: Node[], movedId: string): Node[] {
  const positions = new Map<string, { x: number; y: number }>(
    nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
  );

  // BFS outward from the moved node
  const queue = [movedId];
  const visited = new Set<string>([movedId]);

  while (queue.length) {
    const currentId = queue.shift()!;
    const current = nodes.find((n) => n.id === currentId)!;
    const curPos = positions.get(currentId)!;
    const cur: Rect = { ...toRect(current), x: curPos.x, y: curPos.y };

    for (const other of nodes) {
      if (other.id === currentId) continue;
      const otherPos = positions.get(other.id)!;
      const oth: Rect = { ...toRect(other), x: otherPos.x, y: otherPos.y };

      if (!overlaps(cur, oth)) continue;

      // Push direction: centre-to-centre vector
      const cx = cur.x + cur.w / 2;
      const cy = cur.y + cur.h / 2;
      const ox = oth.x + oth.w / 2;
      const oy = oth.y + oth.h / 2;

      let dx = ox - cx;
      let dy = oy - cy;

      // Fallback if centres coincide
      if (dx === 0 && dy === 0) { dx = 0; dy = 1; }

      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = dx / len;
      const ny = dy / len;

      // How much overlap exists (in the push direction)?
      const overlapX = (cur.w / 2 + oth.w / 2 + PADDING) - Math.abs(ox - cx);
      const overlapY = (cur.h / 2 + oth.h / 2 + PADDING) - Math.abs(oy - cy);
      const pushDist = Math.min(overlapX, overlapY);

      positions.set(other.id, {
        x: otherPos.x + nx * pushDist,
        y: otherPos.y + ny * pushDist,
      });

      if (!visited.has(other.id)) {
        visited.add(other.id);
        queue.push(other.id);
      }
    }
  }

  return nodes.map((n) => ({
    ...n,
    position: positions.get(n.id) ?? n.position,
  }));
}
