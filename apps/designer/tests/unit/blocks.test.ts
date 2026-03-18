import { describe, it, expect } from 'vitest';
import { deriveBody, migrateNodeToBlocks } from '@/lib/blocks';
import type { NWVBlock, NWVNode } from '@nodeweaver/engine';

describe('deriveBody', () => {
  it('returns empty string for an empty blocks array', () => {
    expect(deriveBody([])).toBe('');
  });

  it('returns the text of a single prose block', () => {
    const blocks: NWVBlock[] = [{ id: '1', type: 'prose', text: 'Hello world' }];
    expect(deriveBody(blocks)).toBe('Hello world');
  });

  it('joins multiple prose blocks with double newlines', () => {
    const blocks: NWVBlock[] = [
      { id: '1', type: 'prose', text: 'Paragraph one' },
      { id: '2', type: 'prose', text: 'Paragraph two' },
    ];
    expect(deriveBody(blocks)).toBe('Paragraph one\n\nParagraph two');
  });

  it('excludes line-type blocks from the body', () => {
    const blocks: NWVBlock[] = [
      { id: '1', type: 'line', text: 'Dialogue line', characterId: 'char_1' },
      { id: '2', type: 'prose', text: 'Prose paragraph' },
    ];
    expect(deriveBody(blocks)).toBe('Prose paragraph');
  });

  it('returns empty string when all blocks are line type', () => {
    const blocks: NWVBlock[] = [
      { id: '1', type: 'line', text: 'Line 1' },
      { id: '2', type: 'line', text: 'Line 2' },
    ];
    expect(deriveBody(blocks)).toBe('');
  });

  it('handles mixed prose and line blocks in correct order', () => {
    const blocks: NWVBlock[] = [
      { id: '1', type: 'prose', text: 'Intro' },
      { id: '2', type: 'line', text: 'Said the character' },
      { id: '3', type: 'prose', text: 'Outro' },
    ];
    expect(deriveBody(blocks)).toBe('Intro\n\nOutro');
  });
});

describe('migrateNodeToBlocks', () => {
  const baseNode = {
    choices: [] as NWVNode['choices'],
    position: { x: 0, y: 0 },
    status: 'draft' as const,
  };

  it('returns the node unchanged if it already has a blocks array', () => {
    const node: NWVNode = {
      id: 'n1', type: 'story', title: 'Test',
      blocks: [{ id: 'b1', type: 'prose', text: 'already here' }],
      ...baseNode,
    };
    expect(migrateNodeToBlocks(node)).toBe(node); // same reference
  });

  it('converts a legacy body string into a single prose block', () => {
    const node = {
      id: 'n1', type: 'story' as const, title: 'Test',
      body: 'Legacy prose text',
      ...baseNode,
    } as unknown as NWVNode;
    const result = migrateNodeToBlocks(node);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks![0].type).toBe('prose');
    expect(result.blocks![0].text).toBe('Legacy prose text');
  });

  it('converts legacy script lines into line blocks', () => {
    const node = {
      id: 'n1', type: 'story' as const, title: 'Test',
      useScript: true,
      lines: [
        { id: 'l1', text: 'Hello', characterId: 'char_1' },
        { id: 'l2', text: 'World', characterId: 'char_2' },
      ],
      ...baseNode,
    } as unknown as NWVNode;
    const result = migrateNodeToBlocks(node);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks![0].type).toBe('line');
    expect(result.blocks![0].text).toBe('Hello');
    expect(result.blocks![1].text).toBe('World');
  });

  it('returns empty blocks array for a node with no body or script', () => {
    const node = {
      id: 'n1', type: 'story' as const, title: 'Test',
      ...baseNode,
    } as unknown as NWVNode;
    const result = migrateNodeToBlocks(node);
    expect(result.blocks).toEqual([]);
  });

  it('preserves all other node properties during migration', () => {
    const node = {
      id: 'n1', type: 'story' as const, title: 'My Scene',
      body: 'Some text',
      ...baseNode,
    } as unknown as NWVNode;
    const result = migrateNodeToBlocks(node);
    expect(result.id).toBe('n1');
    expect(result.title).toBe('My Scene');
  });
});
