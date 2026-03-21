# store/ — Zustand State Management

Two stores: `story.ts` (persisted to server) and `voice.ts` (ephemeral session-only).

## story.ts — useStoryStore

Main application state: `activeStory`, `selectedNodeId`, `selectedPanel`, `activeView`.

**Mutation pattern**: every setter calls `stamp()` (updates `updatedAt`) then `persist()` (debounced PUT to `/api/stories/{id}`).
- `persist()` debounced at `DEBOUNCE_PERSIST` (300ms)
- `persistNow()` for immediate writes (save button, file handle)
- `persistError` state: set on PUT failure, cleared after UI displays it

**CRUD actions**: nodes, blocks, choices, characters, enemies, world data, VFX keyframes, lanes.

**Undo**: `undoStack` with `pushUndo()` / `undo()` — shallow snapshots of full NWVStory.

**Special state**:
- `NARRATOR_DEFAULT` exported — auto-injected by `ensureNarrator()` on story load
- Playback: `playFromNodeId` (full PlayMode) vs `canvasPlayNodeId` (canvas HUD)
- AVFX: `avfxMode`, `avfxNodeId`, `avfxPlayheadMs`, `avfxBlockDurationsMs`

## voice.ts — useVoiceStore

Ephemeral (not persisted). Tracks mic/voice assistant lifecycle.
- States: `idle` -> `listening` -> `processing` -> `speaking`
- `reset()` clears all ephemeral state on session end

## Conventions
- Store selectors: always use `useStoryStore((s) => s.specificField)` — never destructure whole store
- New mutations: follow `stamp()` + `persist()` pattern
- IDs: `nanoid()` for all new entities
- Never import daemon modules here — store is client-side only
