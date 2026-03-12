// @nodeweaver/engine — public API
// Types and constants are always available.
// The runtime player (React component) will be added in a future session.

export * from './types';
export * from './constants/genres';

/** Stub — will become a React component that plays a NWVStory */
export function createPlayer() {
  throw new Error('NodeWeaver runtime player not yet implemented');
}
