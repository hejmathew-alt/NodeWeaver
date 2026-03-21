---
paths:
  - "apps/designer/src/components/canvas/**"
  - "apps/designer/src/lib/layout.ts"
  - "apps/designer/src/lib/spine.ts"
---

# Canvas & React Flow Rules

## React Flow Memoization
- `nodeTypes` and `edgeTypes` objects: declare OUTSIDE component scope. Recreating per render breaks React Flow internal memoization and causes remounts.
- `storyToFlow()` converts NWVStory -> React Flow nodes/edges. Always wrap in `useMemo` with correct deps. Never call naked in render body.

## Node Data
- React Flow types `Node.data` as `Record<string, unknown>`. Cast with `data as unknown as NWVNode` — add a comment explaining why the cast is needed.
- Node dimensions: 240px wide, 120px height. Enforced in `storyToFlow()`.

## Handle Positions
- Source handles: `Position.Right` (LR layout).
- Target handles: `Position.Left`.
- Start nodes: source only. End nodes: target only.

## Keyboard Handlers
- Before handling Delete/Backspace on canvas: always check `target.isContentEditable`, `tagName === 'INPUT'`, `tagName === 'TEXTAREA'`, `tagName === 'SELECT'`. Otherwise deletes nodes while user is typing.

## DnD
- Uses `@dnd-kit/core` with `pointerWithin` collision strategy.
- Sensors: `MouseSensor` + `TouchSensor`.
- BlocksPreview uses `@dnd-kit/sortable` for block reordering within nodes.

## Playback State
- `setCanvasPlayNodeId` — inline canvas HUD (CanvasPlayer).
- `setPlayFromNodeId` — full-screen PlayMode overlay.
- Do not confuse the two — they are separate playback surfaces.

## Spine & Layout
- `computeSpine()` returns `Set<string>` of node IDs on the critical path.
- `_isSpineNode` flag on node data drives `layout.ts` spine alignment.

## Colour Safety
- Before inserting any colour hex into a `style` attribute: validate with `/^#[0-9a-f]{6}$/i`.
