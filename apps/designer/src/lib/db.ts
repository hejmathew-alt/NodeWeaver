import Dexie, { type EntityTable } from 'dexie';
import type { NWVStory } from '@nodeweaver/engine';

export interface FileHandleRecord {
  storyId: string;
  handle: FileSystemFileHandle;
}

const db = new Dexie('VoidRunnerDesigner') as Dexie & {
  stories: EntityTable<NWVStory, 'id'>;
  fileHandles: EntityTable<FileHandleRecord, 'storyId'>;
};

db.version(1).stores({
  stories: 'id, metadata.updatedAt',
});

db.version(2).stores({
  stories: 'id, metadata.updatedAt',
  fileHandles: 'storyId',
});

// Audio files fallback (browsers without File System Access API)
export interface AudioFileRecord {
  /** storyId + '_' + filename */
  id: string;
  storyId: string;
  filename: string;
  blob: Blob;
}

db.version(3).stores({
  stories: 'id, metadata.updatedAt',
  fileHandles: 'storyId',
  audioFiles: 'id, storyId',
});

// v4: stories and audioFiles migrated to server filesystem.
// Tables are omitted from this version so Dexie stops writing to them
// (existing data remains in the object stores as a passive backup).
db.version(4).stores({
  fileHandles: 'storyId',
});

export { db };
