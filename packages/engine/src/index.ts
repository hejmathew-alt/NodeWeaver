// @void-runner/engine — public API
// Types and constants are always available.
// The runtime player (React component) will be added in a future session.

export * from './types';
export * from './constants/genres';

/** Stub — will become a React component that plays a VRNStory */
export function createPlayer() {
  throw new Error('VRN runtime player not yet implemented');
}
