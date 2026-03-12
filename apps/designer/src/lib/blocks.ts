import type { VRNNode, VRNBlock } from '@void-runner/engine';
import { nanoid } from 'nanoid';

/**
 * Derive the legacy `body` string from a blocks array.
 * Joins all prose block texts with double newlines.
 * Used to keep the game engine (which reads scene.text = node.body) working.
 */
export function deriveBody(blocks: VRNBlock[]): string {
  return blocks
    .filter((b) => b.type === 'prose')
    .map((b) => b.text)
    .join('\n\n');
}

/**
 * One-time migration: convert a legacy node (body / useScript+lines) to blocks[].
 * If the node already has blocks, it is returned unchanged.
 */
export function migrateNodeToBlocks(node: VRNNode): VRNNode {
  if (node.blocks) return node;

  const blocks: VRNBlock[] = [];

  if (node.useScript && node.lines?.length) {
    for (const l of node.lines) {
      blocks.push({
        id: l.id,
        type: 'line',
        text: l.text,
        characterId: l.characterId || undefined,
        mood: l.mood,
      });
    }
  } else if (node.body?.trim()) {
    blocks.push({ id: nanoid(), type: 'prose', text: node.body });
  }

  return { ...node, blocks };
}
