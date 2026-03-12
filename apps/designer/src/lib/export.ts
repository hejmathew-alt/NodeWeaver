import type { VRNStory } from '@void-runner/engine';
import { deriveBody } from '@/lib/blocks';

/**
 * Ensures node.body is synced from prose blocks (for game engine compat).
 * The game reads scene.text = node.body; blocks are the designer's source of truth.
 */
function prepareForExport(story: VRNStory): VRNStory {
  return {
    ...story,
    nodes: story.nodes.map((n) =>
      n.blocks?.length
        ? { ...n, body: deriveBody(n.blocks) }
        : n
    ),
  };
}

/**
 * Exports the full story (including canvas positions) as a .vrn JSON file.
 * Position data is preserved so re-importing into the designer restores layout.
 * The game engine ignores unknown fields, so positions are safe to include.
 */
export function exportStoryToVRN(story: VRNStory): void {
  const json = JSON.stringify(prepareForExport(story), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const slug = story.metadata.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'story';
  a.href = url;
  a.download = `${slug}.vrn`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── File System Access API helpers ────────────────────────────────────────────

async function writeToHandle(handle: FileSystemFileHandle, story: VRNStory): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(story, null, 2));
  await writable.close();
}

/**
 * Opens a save file picker and writes the story to the chosen file.
 * Returns the FileSystemFileHandle so the caller can persist it for future saves.
 * Falls back to exportStoryToVRN (blob download) and returns null if the
 * File System Access API is unavailable (e.g. Firefox).
 */
export async function saveFileAs(story: VRNStory): Promise<FileSystemFileHandle | null> {
  if (typeof window === 'undefined' || typeof window.showSaveFilePicker !== 'function') {
    exportStoryToVRN(story);
    return null;
  }
  const slug = story.metadata.title.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'story';
  let handle: FileSystemFileHandle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: `${slug}.vrn`,
      types: [
        {
          description: 'Void Runner Narrative',
          accept: { 'application/json': ['.vrn'] },
        },
      ],
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  await writeToHandle(handle, prepareForExport(story));
  return handle;
}

/**
 * Writes the story to an already-obtained FileSystemFileHandle (no picker).
 */
export async function saveFile(story: VRNStory, handle: FileSystemFileHandle): Promise<void> {
  await writeToHandle(handle, prepareForExport(story));
}
