/**
 * Audio file storage for NodeWeaver.
 *
 * Primary: File System Access API — stores WAV files in a `_audio/` sibling
 * directory next to the .nwv story file.
 *
 * Fallback: IndexedDB via Dexie (browsers without File System Access API).
 */

import { db } from './db';
import type { AudioGenType, WordTimestamp } from '@nodeweaver/engine';

// ── Filename helpers ─────────────────────────────────────────────────────────

function slugify(text: string, maxLen = 40): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, maxLen);
}

export function makeAudioFilename(
  type: AudioGenType,
  nodeId: string,
  prompt: string,
  blockId?: string,
): string {
  const slug = slugify(prompt);
  const nodeShort = nodeId.slice(0, 8);
  if (type === 'sfx' && blockId) {
    return `sfx_${nodeShort}_${blockId.slice(0, 8)}_${slug}.mp3`;
  }
  return `${type}_${nodeShort}_${slug}.mp3`;
}

export function makeTTSFilename(
  nodeId: string,
  blockId: string,
  characterName: string,
): string {
  const nodeShort = nodeId.slice(0, 8);
  const blockShort = blockId.slice(0, 8);
  const charSlug = slugify(characterName, 20);
  return `tts_${nodeShort}_${blockShort}_${charSlug}.mp3`;
}

// ── File System Access API (primary) ─────────────────────────────────────────

/**
 * Gets or creates the `_audio/` directory next to the story file.
 * Requires the parent directory handle.
 */
export async function getAudioDirHandle(
  parentDirHandle: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return parentDirHandle.getDirectoryHandle('_audio', { create: true });
}

/**
 * Saves a WAV buffer to the `_audio/` directory.
 * Returns the filename for use as a reference in the story data.
 */
export async function saveAudioFileFSA(
  parentDirHandle: FileSystemDirectoryHandle,
  wavBuffer: ArrayBuffer,
  filename: string,
): Promise<void> {
  const audioDir = await getAudioDirHandle(parentDirHandle);
  const fileHandle = await audioDir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(wavBuffer);
  await writable.close();
}

/**
 * Reads an audio file from the `_audio/` directory.
 */
export async function readAudioFileFSA(
  parentDirHandle: FileSystemDirectoryHandle,
  filename: string,
): Promise<ArrayBuffer> {
  const audioDir = await getAudioDirHandle(parentDirHandle);
  const fileHandle = await audioDir.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return file.arrayBuffer();
}

/**
 * Deletes an audio file from the `_audio/` directory.
 */
export async function deleteAudioFileFSA(
  parentDirHandle: FileSystemDirectoryHandle,
  filename: string,
): Promise<void> {
  const audioDir = await getAudioDirHandle(parentDirHandle);
  await audioDir.removeEntry(filename);
}

// ── IndexedDB fallback ───────────────────────────────────────────────────────

export async function saveAudioFileIDB(
  storyId: string,
  filename: string,
  wavBuffer: ArrayBuffer,
): Promise<void> {
  const audioFiles = (db as unknown as { audioFiles: typeof db.stories }).audioFiles;
  await audioFiles.put({
    id: `${storyId}_${filename}`,
    storyId,
    filename,
    blob: new Blob([wavBuffer], { type: filename.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' }),
  } as never);
}

export async function readAudioFileIDB(
  storyId: string,
  filename: string,
): Promise<ArrayBuffer> {
  const audioFiles = (db as unknown as { audioFiles: typeof db.stories }).audioFiles;
  const record = await audioFiles.get(`${storyId}_${filename}`) as unknown as { blob: Blob } | undefined;
  if (!record) throw new Error(`Audio file not found: ${filename}`);
  return record.blob.arrayBuffer();
}

export async function deleteAudioFileIDB(
  storyId: string,
  filename: string,
): Promise<void> {
  const audioFiles = (db as unknown as { audioFiles: typeof db.stories }).audioFiles;
  await audioFiles.delete(`${storyId}_${filename}`);
}

// ── Word timestamp storage (IDB) ─────────────────────────────────────────────

/**
 * Returns the companion timestamps filename for an audio file.
 * e.g. "tts_abc123_def456_alice.mp3"  →  "tts_abc123_def456_alice.mp3.words.json"
 */
export function makeTimestampsFilename(audioFilename: string): string {
  return `${audioFilename}.words.json`;
}

/**
 * Persists word timestamps alongside the audio file in IndexedDB.
 * Fire-and-forget safe — callers should catch errors themselves.
 */
export async function saveTimestampsIDB(
  storyId: string,
  audioFilename: string,
  timestamps: WordTimestamp[],
): Promise<void> {
  const tsFilename = makeTimestampsFilename(audioFilename);
  const blob = new Blob([JSON.stringify(timestamps)], { type: 'application/json' });
  const audioFiles = (db as unknown as { audioFiles: typeof db.stories }).audioFiles;
  await audioFiles.put({
    id: `${storyId}_${tsFilename}`,
    storyId,
    filename: tsFilename,
    blob,
  } as never);
}

/**
 * Reads word timestamps from IndexedDB.
 * Returns null if not found (audio generated before timestamp support).
 */
export async function readTimestampsIDB(
  storyId: string,
  audioFilename: string,
): Promise<WordTimestamp[] | null> {
  const tsFilename = makeTimestampsFilename(audioFilename);
  const audioFiles = (db as unknown as { audioFiles: typeof db.stories }).audioFiles;
  const record = await audioFiles.get(`${storyId}_${tsFilename}`) as unknown as { blob: Blob } | undefined;
  if (!record) return null;
  const text = await record.blob.text();
  return JSON.parse(text) as WordTimestamp[];
}

// ── Server-side audio storage (primary, cross-browser) ────────────────────────

/**
 * Saves an audio buffer to the server filesystem via the stories audio API.
 */
export async function saveAudioFileServer(
  storyId: string,
  filename: string,
  buffer: ArrayBuffer,
): Promise<void> {
  const res = await fetch(
    `/api/stories/${encodeURIComponent(storyId)}/audio?file=${encodeURIComponent(filename)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: buffer,
    },
  );
  if (!res.ok) throw new Error(`saveAudioFileServer failed: ${res.status}`);
}

/**
 * Reads an audio buffer from the server filesystem.
 * Returns null on 404 (file not yet generated).
 */
export async function readAudioFileServer(
  storyId: string,
  filename: string,
): Promise<ArrayBuffer | null> {
  const res = await fetch(
    `/api/stories/${encodeURIComponent(storyId)}/audio?file=${encodeURIComponent(filename)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`readAudioFileServer failed: ${res.status}`);
  return res.arrayBuffer();
}

/**
 * Saves word timestamps to the server filesystem alongside the audio file.
 */
export async function saveTimestampsServer(
  storyId: string,
  audioFilename: string,
  timestamps: WordTimestamp[],
): Promise<void> {
  const tsFilename = makeTimestampsFilename(audioFilename);
  const buf = new TextEncoder().encode(JSON.stringify(timestamps)).buffer as ArrayBuffer;
  await saveAudioFileServer(storyId, tsFilename, buf);
}

/**
 * Reads word timestamps from the server filesystem.
 * Returns null if not found.
 */
export async function readTimestampsServer(
  storyId: string,
  audioFilename: string,
): Promise<WordTimestamp[] | null> {
  const tsFilename = makeTimestampsFilename(audioFilename);
  const res = await fetch(
    `/api/stories/${encodeURIComponent(storyId)}/audio?file=${encodeURIComponent(tsFilename)}`,
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  try {
    return JSON.parse(await res.text()) as WordTimestamp[];
  } catch (err) {
    console.warn('[audio-storage] Timestamp JSON corrupted or unreadable:', err);
    return null;
  }
}
