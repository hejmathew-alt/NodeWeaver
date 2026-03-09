import type { VRNStory } from '@void-runner/engine';

/**
 * Exports the full story (including canvas positions) as a .vrn JSON file.
 * Position data is preserved so re-importing into the designer restores layout.
 * The game engine ignores unknown fields, so positions are safe to include.
 */
export function exportStoryToVRN(story: VRNStory): void {
  const json = JSON.stringify(story, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = story.metadata.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'story';
  a.href = url;
  a.download = `${slug}.vrn`;
  a.click();
  URL.revokeObjectURL(url);
}
