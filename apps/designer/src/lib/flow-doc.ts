/**
 * flow-doc.ts — converts an NWVStory to/from the FlowEditor plain-text format.
 *
 * Text format (per node):
 *
 *   # Node Title
 *   [type: story|chat|twist|combat]      ← omitted for 'story' (default)
 *   [ambient: prompt]                     ← omitted if none
 *   [music: prompt]                       ← omitted if none
 *
 *   Narrator prose paragraph.
 *   CharacterName: dialogue line
 *   > Choice label -> target-node-id
 *   > Unlinked choice label
 *
 * Nodes are separated by blank lines. Start/End nodes are omitted.
 */

import type { NWVStory, NWVNode, NodeType } from '@nodeweaver/engine';
import { nanoid } from 'nanoid';

// ── storyToFlow ───────────────────────────────────────────────────────────────

export function storyToFlow(story: NWVStory): string {
  const charMap = new Map((story.characters ?? []).map((c) => [c.id, c]));
  const sections: string[] = [];

  for (const node of story.nodes ?? []) {
    if (node.type === 'start' || node.type === 'end') continue;

    const lines: string[] = [];

    // Heading
    lines.push(`# ${node.title ?? 'Untitled'}`);

    // Optional type tag (story is default — omit to keep output clean)
    if (node.type && node.type !== 'story') {
      lines.push(`[type: ${node.type}]`);
    }

    // Optional audio prompts
    if (node.ambientPrompt) lines.push(`[ambient: ${node.ambientPrompt}]`);
    if (node.musicPrompt)   lines.push(`[music: ${node.musicPrompt}]`);

    lines.push(''); // blank after header tags

    // Blocks
    for (const block of node.blocks ?? []) {
      if (!block.text?.trim()) continue;
      if (block.type === 'line' && block.characterId && block.characterId !== 'narrator') {
        const char = charMap.get(block.characterId);
        const name = char?.name ?? block.characterId;
        lines.push(`${name}: ${block.text.trim()}`);
      } else {
        lines.push(block.text.trim());
      }
    }

    // Choices
    for (const choice of node.choices ?? []) {
      if (!choice.label?.trim()) continue;
      if (choice.next) {
        lines.push(`> ${choice.label} -> ${choice.next}`);
      } else {
        lines.push(`> ${choice.label}`);
      }
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n---\n\n');
}

// ── applyFlowToStory ──────────────────────────────────────────────────────────

interface ApplyActions {
  createNode:        (type: NodeType, position?: { x: number; y: number }) => string;
  updateNode:        (id: string, patch: Partial<NWVNode>) => void;
  updateChoice:      (nodeId: string, choiceId: string, patch: Partial<{ label: string; next: string | null }>) => void;
  addCharacterNamed: (name: string) => string;
}

interface ApplyResult {
  created: string[]; // IDs of newly-created nodes
}

export async function applyFlowToStory(
  text: string,
  story: NWVStory,
  actions: ApplyActions,
  getStory: () => NWVStory,
): Promise<ApplyResult> {
  const { createNode, updateNode, updateChoice, addCharacterNamed } = actions;
  const created: string[] = [];

  // Build lookup maps from current story
  const nodeByTitle = new Map<string, NWVNode>(
    (story.nodes ?? []).map((n) => [normaliseTitle(n.title ?? ''), n]),
  );
  const charByName = new Map<string, string>(
    (story.characters ?? []).map((c) => [c.name.toLowerCase(), c.id]),
  );

  // ── Split into node sections ────────────────────────────────────────────────
  // Sections are separated by '---' lines or by '# ' headings
  const rawSections = text.split(/\n---\n/g).map((s) => s.trim()).filter(Boolean);

  for (const section of rawSections) {
    const lines = section.split('\n');
    let currentNodeId: string | null = null;
    let nodeType: NodeType = 'story';
    const blocks: { type: 'prose' | 'line'; text: string; characterId?: string }[] = [];
    const choices: { label: string; next: string | null }[] = [];
    let ambientPrompt: string | null = null;
    let musicPrompt:   string | null = null;
    let title = '';

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      // ── Node heading
      if (line.startsWith('# ')) {
        title = line.slice(2).trim();
        continue;
      }

      // ── Tags
      const typeMatch    = line.match(/^\[type:\s*(.+?)\]$/i);
      const ambientMatch = line.match(/^\[ambient:\s*(.+?)\]$/i);
      const musicMatch   = line.match(/^\[music:\s*(.+?)\]$/i);
      const charMatch    = line.match(/^\[character:\s*(.+?)\]$/i);

      if (typeMatch) {
        const t = typeMatch[1].trim() as NodeType;
        if (['story', 'chat', 'twist', 'combat'].includes(t)) nodeType = t;
        continue;
      }
      if (ambientMatch) { ambientPrompt = ambientMatch[1].trim(); continue; }
      if (musicMatch)   { musicPrompt   = musicMatch[1].trim();   continue; }
      if (charMatch) {
        const name = charMatch[1].trim();
        if (!charByName.has(name.toLowerCase())) {
          const id = addCharacterNamed(name);
          charByName.set(name.toLowerCase(), id);
        }
        continue;
      }

      // ── Choice
      if (line.startsWith('> ')) {
        const choiceText = line.slice(2).trim();
        const arrowIdx   = choiceText.indexOf(' -> ');
        if (arrowIdx !== -1) {
          const label = choiceText.slice(0, arrowIdx).trim();
          const next  = choiceText.slice(arrowIdx + 4).trim();
          choices.push({ label, next: next || null });
        } else {
          choices.push({ label: choiceText, next: null });
        }
        continue;
      }

      // ── Separator / blank
      if (!line.trim() || line === '---') continue;

      // ── Dialogue: "Name: text"
      const dialogueMatch = line.match(/^([A-Za-z][A-Za-z0-9 '"-]{0,40}):\s+(.+)$/);
      if (dialogueMatch) {
        const name    = dialogueMatch[1].trim();
        const content = dialogueMatch[2].trim();
        let charId = charByName.get(name.toLowerCase());
        if (!charId && name.toLowerCase() !== 'narrator') {
          charId = addCharacterNamed(name);
          charByName.set(name.toLowerCase(), charId);
        }
        blocks.push({ type: 'line', text: content, characterId: charId ?? 'narrator' });
        continue;
      }

      // ── Narrator prose
      blocks.push({ type: 'prose', text: line.trim() });
    }

    if (!title) continue; // section with no heading — skip

    // ── Find or create node ──────────────────────────────────────────────────
    const existing = nodeByTitle.get(normaliseTitle(title));

    if (existing) {
      currentNodeId = existing.id;
      // Update type if changed
      const patch: Partial<NWVNode> = {};
      if (nodeType !== existing.type && nodeType !== 'story') patch.type = nodeType;
      if (ambientPrompt !== null) patch.ambientPrompt = ambientPrompt;
      if (musicPrompt   !== null) patch.musicPrompt   = musicPrompt;
      if (Object.keys(patch).length > 0) updateNode(existing.id, patch);
    } else {
      // Create a new node
      const newId = createNode(nodeType);
      currentNodeId = newId;
      created.push(newId);

      // Give it a moment for the store to settle then update
      await tick();
      const fresh = getStory().nodes.find((n) => n.id === newId);
      if (fresh) nodeByTitle.set(normaliseTitle(title), fresh);

      const patch: Partial<NWVNode> = { title };
      if (ambientPrompt !== null) patch.ambientPrompt = ambientPrompt;
      if (musicPrompt   !== null) patch.musicPrompt   = musicPrompt;
      updateNode(newId, patch);
    }

    if (!currentNodeId) continue;

    // ── Update blocks ────────────────────────────────────────────────────────
    if (blocks.length > 0) {
      const freshStory = getStory();
      const freshNode  = freshStory.nodes.find((n) => n.id === currentNodeId);
      if (freshNode) {
        const newBlocks = blocks.map((b, i) => ({
          id:          freshNode.blocks?.[i]?.id ?? nanoid(8),
          type:        b.type,
          text:        b.text,
          characterId: b.characterId,
        }));
        updateNode(currentNodeId, { blocks: newBlocks as NWVNode['blocks'] });
      }
    }

    // ── Update choices ───────────────────────────────────────────────────────
    if (choices.length > 0) {
      const freshStory   = getStory();
      const freshNode    = freshStory.nodes.find((n) => n.id === currentNodeId);
      const existChoices = freshNode?.choices ?? [];

      choices.forEach((c, i) => {
        const existChoice = existChoices[i];
        if (existChoice) {
          updateChoice(currentNodeId!, existChoice.id, { label: c.label, next: c.next });
        }
        // New choices beyond existing count are not created here — the writer
        // uses the node editor for adding choices; FlowEditor edits existing ones.
      });
    }
  }

  return { created };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, ' ');
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
