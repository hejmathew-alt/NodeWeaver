import Dexie, { type EntityTable } from 'dexie';
import type { VRNStory } from '@void-runner/engine';

const db = new Dexie('VoidRunnerDesigner') as Dexie & {
  stories: EntityTable<VRNStory, 'id'>;
};

db.version(1).stores({
  // Primary key + indexed fields
  stories: 'id, metadata.updatedAt',
});

export { db };
