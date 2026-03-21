# canvas/ — React Flow Canvas System

The main story graph visualization and interaction surface.

## Key Components
- `StoryCanvas.tsx` — ReactFlow wrapper + DnD + panel system + `storyToFlow()` converter
- `CanvasToolbar.tsx` — node creation buttons, view toggles (Characters, Encounters, World, AVFX)
- `ActBands.tsx` / `ActHeader.tsx` — act column background tints and pinned headers
- `LaneOverlay.tsx` — swim lane rendering

## Node Types (nodes/ subdirectory)

All six node components follow the same pattern:
1. Receive `NodeProps` from React Flow, cast `data as unknown as NWVNode`
2. Read store selectors for `playingNodeId`, `visitedNodeIds`, `selectedNodeId`
3. Render: border colour by type, glow when playing, dim when visited
4. Include `BlocksPreview` for content + character avatars + play button

| Component | Type | Colour | Special |
|-----------|------|--------|---------|
| StartNode | start | teal | source handle only |
| StoryNode | story | blue | standard source + target |
| CombatNode | combat | red | combat config in NodeEditor |
| ChatNode | chat | green | AI chat sessions |
| TwistNode | twist | purple | dashed border |
| EndNode | end | orange | target handle only |

## Supporting Components
- `BlocksPreview.tsx` — sortable block list via `@dnd-kit/sortable`
- `CanvasBlock.tsx` — individual draggable block row + DragPreview overlay
- `ChoiceEdge.tsx` — custom edge with choice label pills, loopback detection

## storyToFlow()
Defined in `StoryCanvas.tsx`. Converts NWVStory -> React Flow nodes/edges.
- Must be wrapped in `useMemo` with correct dependencies
- Sets `_isSpineNode` on node data for `layout.ts` spine alignment
- Node dimensions: 240px wide, 120px height

## Conventions
- Handle positions: source = `Position.Right`, target = `Position.Left` (LR layout)
- Panel widths: `PANEL_DEFAULT=320`, `PANEL_WIDE=640`, `PANEL_MIN=280`, `PANEL_MAX=800`
- `nodeTypes` and `edgeTypes` objects declared OUTSIDE component (never recreate per render)
- DnD uses `@dnd-kit/core` + `pointerWithin` collision strategy
- Keyboard handler: check `target.isContentEditable` / `INPUT` / `TEXTAREA` before Delete/Backspace
