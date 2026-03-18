/**
 * Batch TTS utilities — used by FinaliseModal to pre-render all story
 * blocks through either Qwen or ElevenLabs.
 */

import type { NWVStory } from '@nodeweaver/engine';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BatchProvider   = 'qwen' | 'elevenlabs';
export type BatchItemStatus = 'pending' | 'generating' | 'done' | 'error' | 'skipped';

export interface BatchTTSItem {
  nodeId:        string;
  blockId:       string;
  nodeTitle:     string;
  blockIndex:    number;
  characterId:   string;
  characterName: string;
  text:          string;
  voiceId?:      string;         // ElevenLabs voice ID
  existingFile?: string | null;  // ttsAudioFile already on the block
  qwenInstruct?: string;         // character's Qwen instruct prompt
  elStability?:  number;
  elSimilarity?: number;
  elStyle?:      number;
}

export interface BatchPrerequisites {
  missingKey:    boolean;
  missingVoices: { characterId: string; characterName: string }[];
}

// ── checkPrerequisites ────────────────────────────────────────────────────────

/**
 * Returns a prerequisites object indicating what's missing before a batch run.
 * For Qwen provider, no prerequisites are needed (returns empty/false values).
 */
export function checkPrerequisites(
  story: NWVStory,
  elevenLabsKey: string | undefined,
  _skipExisting: boolean,
  provider: BatchProvider,
): BatchPrerequisites {
  if (provider === 'qwen') {
    return { missingKey: false, missingVoices: [] };
  }

  const missingKey = !elevenLabsKey?.trim();

  // Collect which characters actually appear in blocks
  const usedCharIds = new Set<string>();
  for (const node of story.nodes ?? []) {
    for (const block of node.blocks ?? []) {
      if (block.characterId) usedCharIds.add(block.characterId);
    }
  }

  const missingVoices: { characterId: string; characterName: string }[] = [];
  for (const char of story.characters ?? []) {
    if (char.id === 'narrator') continue;
    if (!usedCharIds.has(char.id)) continue;
    if (!char.elevenLabsVoiceId?.trim()) {
      missingVoices.push({ characterId: char.id, characterName: char.name });
    }
  }

  return { missingKey, missingVoices };
}

// ── buildBatchItems ───────────────────────────────────────────────────────────

/**
 * Builds the ordered list of blocks to synthesise for the given provider.
 * Skips start/end nodes (no spoken content) and empty blocks.
 * For ElevenLabs, skips blocks whose character has no EL voice ID.
 */
export function buildBatchItems(
  story: NWVStory,
  _skipExisting: boolean,
  provider: BatchProvider,
): BatchTTSItem[] {
  const items: BatchTTSItem[] = [];
  const charMap = new Map((story.characters ?? []).map((c) => [c.id, c]));

  for (const node of story.nodes ?? []) {
    if (node.type === 'start' || node.type === 'end') continue;

    const blocks = node.blocks ?? [];
    blocks.forEach((block, idx) => {
      if (!block.text?.trim()) return;

      const characterId   = block.characterId ?? 'narrator';
      const char          = charMap.get(characterId);
      const characterName = char?.name ?? 'Narrator';

      if (provider === 'elevenlabs') {
        const voiceId = char?.elevenLabsVoiceId;
        // Narrator and characters without a voice ID are skipped for EL
        if (!voiceId) return;

        items.push({
          nodeId:       node.id,
          blockId:      block.id,
          nodeTitle:    node.title ?? 'Untitled',
          blockIndex:   idx,
          characterId,
          characterName,
          text:         block.text,
          voiceId,
          existingFile: block.ttsAudioFile ?? null,
          elStability:  char?.elevenLabsStability,
          elSimilarity: char?.elevenLabsSimilarity,
          elStyle:      char?.elevenLabsStyle,
        });
      } else {
        // Qwen — all blocks with text
        items.push({
          nodeId:       node.id,
          blockId:      block.id,
          nodeTitle:    node.title ?? 'Untitled',
          blockIndex:   idx,
          characterId,
          characterName,
          text:         block.text,
          existingFile: block.ttsAudioFile ?? null,
          qwenInstruct: char?.qwenInstruct,
        });
      }
    });
  }

  return items;
}
