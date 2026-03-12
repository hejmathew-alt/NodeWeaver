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

export { db };
