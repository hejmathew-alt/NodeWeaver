'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  ControlButton,
  MiniMap,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnNodeDrag,
  type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { NWVStory, NodeType } from '@nodeweaver/engine';
import { StoryNode } from './nodes/StoryNode';
import { CombatNode } from './nodes/CombatNode';
import { ChatNode } from './nodes/ChatNode';
import { TwistNode } from './nodes/TwistNode';
import { StartNode } from './nodes/StartNode';
import { EndNode } from './nodes/EndNode';
import { CanvasToolbar } from './CanvasToolbar';
import { ChoiceEdge } from './edges/ChoiceEdge';
import { FlowEditor } from '@/components/FlowEditor';
import { autoLayout, pushOverlaps } from '@/lib/layout';
import { computeSpine } from '@/lib/spine';
import { NodeEditorPanel } from '@/components/panels/NodeEditorPanel';
import { SettingsPanel } from '@/components/panels/SettingsPanel';
import { WorldPanel } from '@/components/panels/WorldPanel';
import { ActBands } from '@/components/canvas/ActBands';
import { ActHeader } from '@/components/canvas/ActHeader';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { NWVBlock } from '@nodeweaver/engine';
import { DragPreview } from './nodes/CanvasBlock';
import { useStoryStore } from '@/store/story';
import { useVoiceStore } from '@/store/voice';
import { SeedAIModal } from '@/components/dashboard/SeedAIModal';

// ── Constants ─────────────────────────────────────────────────────────────────

const PANEL_DEFAULT = 320;
const PANEL_WIDE    = 640;
const PANEL_MIN     = 280;
const PANEL_MAX     = 800;

const nodeTypes = {
  story: StoryNode,
  combat: CombatNode,
  chat: ChatNode,
  twist: TwistNode,
  start: StartNode,
  end: EndNode,
};

const edgeTypes = {
  choice: ChoiceEdge,
};

// ── storyToFlow ───────────────────────────────────────────────────────────────

interface StoryCanvasProps {
  story: NWVStory;
  onToggleAVFX?: () => void;
  onSeedAI?: () => void;
}

function storyToFlow(story: NWVStory): { nodes: Node[]; edges: Edge[] } {
  const spineSet = computeSpine(story.nodes);

  // Find nodes that have no incoming edges (orphaned — never connected as a target)
  const hasIncoming = new Set<string>();
  for (const n of story.nodes) {
    for (const c of n.choices) {
      if (c.next) hasIncoming.add(c.next);
    }
  }

  const nodes: Node[] = story.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    style: { width: n.width ?? 240, height: n.height ?? 106 },
    data: {
      ...n,
      _isSpineNode: spineSet.has(n.id),
      _isOrphaned: n.type !== 'start' && !hasIncoming.has(n.id),
    } as unknown as Record<string, unknown>,
  }));

  const edges: Edge[] = [];
  for (const node of story.nodes) {
    for (const choice of node.choices) {
      if (choice.next && node.type !== 'end' && story.nodes.some((n) => n.id === choice.next)) {
        const isSpineEdge = spineSet.has(node.id) && spineSet.has(choice.next);
        edges.push({
          id: `${node.id}-${choice.id}`,
          type: 'choice',
          source: node.id,
          target: choice.next,
          // Migrate handle IDs: bottom/left/null→right, top/target-right/null→target-left
          sourceHandle: (!choice.sourceHandle || choice.sourceHandle === 'bottom' || choice.sourceHandle === 'left') ? 'right' : choice.sourceHandle,
          targetHandle: (!choice.targetHandle || choice.targetHandle === 'top' || choice.targetHandle === 'target-right') ? 'target-left' : choice.targetHandle,
          data: { sourceId: node.id, choiceId: choice.id, label: choice.label, _isSpineEdge: isSpineEdge },
        });
      }
    }
  }

  return { nodes, edges };
}

// ── Node type picker ──────────────────────────────────────────────────────────

const NODE_PICKER_ITEMS: { type: NodeType; label: string; color: string }[] = [
  { type: 'story',  label: 'Story',       color: '#3b82f6' },
  { type: 'combat', label: 'Interactive', color: '#ef4444' },
  { type: 'twist',  label: 'Twist',       color: '#a855f7' },
  { type: 'start',  label: 'Start',       color: '#14b8a6' },
  { type: 'end',    label: 'End',         color: '#f97316' },
];

interface NodePickerMenuProps {
  screenX: number;
  screenY: number;
  onPick: (type: NodeType) => void;
  onClose: () => void;
}

function NodePickerMenu({ screenX, screenY, onPick, onClose }: NodePickerMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Element)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Slight delay so the mouseup that ended the drag doesn't immediately close us
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onMouse);
      document.addEventListener('keydown', onKey);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Keep the menu on-screen
  const left = Math.min(screenX, window.innerWidth  - 200);
  const top  = Math.min(screenY, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 1000 }}
      className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xl"
    >
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Add node
      </p>
      <div className="grid grid-cols-3 gap-1">
        {NODE_PICKER_ITEMS.map(({ type, label, color }) => (
          <button
            key={type}
            onClick={() => onPick(type)}
            className="flex flex-col items-center gap-1 rounded px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-50"
            style={{ color }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color, opacity: 0.85 }}
            />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Edge context menu ─────────────────────────────────────────────────────────

interface PendingEdge {
  sourceId: string;
  targetId: string;
  choiceId: string;
  screenX: number;
  screenY: number;
}

interface EdgeContextMenuProps {
  edge: PendingEdge;
  unusedChoices: { id: string; label: string }[];
  onDelete: () => void;
  onInsert: (type: NodeType) => void;
  onAddChoice: () => void;
  onReassign: (choiceId: string) => void;
  onClose: () => void;
}

function EdgeContextMenu({ edge, unusedChoices, onDelete, onInsert, onAddChoice, onReassign, onClose }: EdgeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Element)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onMouse);
      document.addEventListener('keydown', onKey);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouse);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const left = Math.min(edge.screenX, window.innerWidth - 220);
  const top = Math.min(edge.screenY, window.innerHeight - 280);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left, top, zIndex: 1000 }}
      className="rounded-lg border border-slate-200 bg-white p-2 shadow-2xl"
    >
      {unusedChoices.length > 0 && (
        <>
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
            Reassign to
          </p>
          {unusedChoices.map((c) => (
            <button
              key={c.id}
              onClick={() => onReassign(c.id)}
              className="mb-1 w-full truncate rounded px-3 py-1.5 text-left text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50"
            >
              {c.label || '(unlabelled)'}
            </button>
          ))}
          <hr className="my-1 border-slate-200" />
        </>
      )}
      <button
        onClick={onDelete}
        className="mb-1 w-full rounded px-3 py-1.5 text-left text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
      >
        Delete connection
      </button>
      <button
        onClick={onAddChoice}
        className="mb-2 w-full rounded px-3 py-1.5 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
      >
        Add choice to source
      </button>
      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Insert node between
      </p>
      <div className="grid grid-cols-3 gap-1">
        {NODE_PICKER_ITEMS.map(({ type, label, color }) => (
          <button
            key={type}
            onClick={() => onInsert(type)}
            className="flex flex-col items-center gap-1 rounded px-3 py-2 text-xs font-semibold transition-colors hover:bg-slate-50"
            style={{ color }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color, opacity: 0.85 }}
            />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Pending connection state ──────────────────────────────────────────────────

interface PendingConn {
  sourceId: string;
  sourceHandle?: string;
  flowX: number;
  flowY: number;
  screenX: number;
  screenY: number;
}

// ── Inner flow component (requires ReactFlowProvider context) ─────────────────

interface InnerProps {
  story: NWVStory;
  panelWidth: number;
  panelExpanded: boolean;
  onToggleExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
  flowMode: boolean;
  onFlowMode: () => void;
  worldPanelOpen: boolean;
  onToggleWorld: () => void;
  onToggleAVFX?: () => void;
  onSeedAI?: () => void;
}

function StoryFlowInner({ story, panelWidth, panelExpanded, onToggleExpand, onResizeStart, flowMode, onFlowMode, worldPanelOpen, onToggleWorld, onToggleAVFX, onSeedAI }: InnerProps) {
  const selectedNodeId = useStoryStore((s) => s.selectedNodeId);
  const selectedPanel = useStoryStore((s) => s.selectedPanel);
  const setSelectedNode = useStoryStore((s) => s.setSelectedNode);
  const deleteNode = useStoryStore((s) => s.deleteNode);
  const undoDeleteNode = useStoryStore((s) => s.undoDeleteNode);
  const connectNodes = useStoryStore((s) => s.connectNodes);
  const batchUpdatePositions = useStoryStore((s) => s.batchUpdatePositions);
  const avfxMode = useStoryStore((s) => s.avfxMode);
  const createNode = useStoryStore((s) => s.createNode);
  const deleteChoice = useStoryStore((s) => s.deleteChoice);
  const addChoice = useStoryStore((s) => s.addChoice);
  const updateChoice = useStoryStore((s) => s.updateChoice);
  const insertNodeBetween = useStoryStore((s) => s.insertNodeBetween);
  const reorderBlock = useStoryStore((s) => s.reorderBlock);
  const moveBlockBetweenNodes = useStoryStore((s) => s.moveBlockBetweenNodes);

  const voiceModeActive = useVoiceStore((s) => s.voiceModeActive);
  const voiceStatus = useVoiceStore((s) => s.status);
  const canvasPlayNodeId = useStoryStore((s) => s.canvasPlayNodeId);

  const { screenToFlowPosition, getNodes, getNode, setCenter, getViewport } = useReactFlow();

  // Smoothly pan to whichever node is being played
  useEffect(() => {
    if (!canvasPlayNodeId) return;
    const rfNode = getNode(canvasPlayNodeId);
    if (!rfNode) return;
    const w = (rfNode.measured?.width as number | undefined) ?? 200;
    const h = (rfNode.measured?.height as number | undefined) ?? 150;
    const { zoom } = getViewport();
    setCenter(rfNode.position.x + w / 2, rfNode.position.y + h / 2, { duration: 650, zoom });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasPlayNodeId]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => storyToFlow(story), [story]);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const [pendingConn, setPendingConn] = useState<PendingConn | null>(null);
  const pendingConnSetAtRef = useRef<number>(0);
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null);
  const [canvasLocked, setCanvasLocked] = useState(false);

  // Re-sync React Flow state whenever the story changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = storyToFlow(story);
    setNodes(newNodes);
    setEdges(newEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.nodes]);

  // Auto-layout on first open of each story per session (gets spine centering + LR layout)
  // Also handles Flow Mode nodes
  useEffect(() => {
    const flowModeKey = 'nw:flowmode:runlayout';
    const storyKey = `nw:layout:${story.id}`;
    const needsLayout =
      sessionStorage.getItem(flowModeKey) === '1' ||
      sessionStorage.getItem(storyKey) !== '1';

    if (needsLayout) {
      sessionStorage.removeItem(flowModeKey);
      sessionStorage.setItem(storyKey, '1');
      const t = setTimeout(() => handleAutoLayout(), 150);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard delete + undo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      const inText = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;

      // Cmd+Z / Ctrl+Z — undo last node deletion
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (!inText) {
          e.preventDefault();
          undoDeleteNode();
          return;
        }
      }

      // Delete / Backspace — remove selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        if (inText) return;
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, deleteNode, undoDeleteNode]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (connection.source && connection.target) {
        connectNodes(
          connection.source,
          connection.target,
          connection.sourceHandle ?? undefined,
          connection.targetHandle ?? undefined,
        );
      }
    },
    [connectNodes],
  );

  // Drag-to-empty → show node picker
  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      // Only trigger when dropped on empty canvas (not on a valid node/handle)
      if (connectionState.isValid || !connectionState.fromNode) return;
      const e = event instanceof MouseEvent ? event : (event as TouchEvent).changedTouches[0];
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      pendingConnSetAtRef.current = Date.now();
      setPendingConn({
        sourceId: connectionState.fromNode.id,
        sourceHandle: connectionState.fromHandle?.id ?? undefined,
        flowX: flowPos.x,
        flowY: flowPos.y,
        screenX: e.clientX,
        screenY: e.clientY,
      });
    },
    [screenToFlowPosition],
  );

  const handlePickNodeType = useCallback(
    (type: NodeType) => {
      if (!pendingConn) return;
      const newId = createNode(type, { x: pendingConn.flowX, y: pendingConn.flowY });
      if (newId) connectNodes(pendingConn.sourceId, newId, pendingConn.sourceHandle);
      setPendingConn(null);
    },
    [pendingConn, createNode, connectNodes],
  );

  // Edge click → show context menu
  const onEdgeClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      const data = edge.data as { sourceId: string; choiceId: string } | undefined;
      if (!data) return;
      setPendingEdge({
        sourceId: data.sourceId,
        targetId: edge.target,
        choiceId: data.choiceId,
        screenX: _e.clientX,
        screenY: _e.clientY,
      });
    },
    [],
  );

  const handleEdgeDelete = useCallback(() => {
    if (!pendingEdge) return;
    deleteChoice(pendingEdge.sourceId, pendingEdge.choiceId);
    setPendingEdge(null);
  }, [pendingEdge, deleteChoice]);

  const handleEdgeInsert = useCallback(
    (type: NodeType) => {
      if (!pendingEdge) return;
      insertNodeBetween(pendingEdge.sourceId, pendingEdge.targetId, type);
      setPendingEdge(null);
    },
    [pendingEdge, insertNodeBetween],
  );

  const handleEdgeAddChoice = useCallback(() => {
    if (!pendingEdge) return;
    addChoice(pendingEdge.sourceId);
    setPendingEdge(null);
  }, [pendingEdge, addChoice]);

  const handleEdgeReassign = useCallback((newChoiceId: string) => {
    if (!pendingEdge) return;
    // Link the selected choice to the target, disconnect the old one
    updateChoice(pendingEdge.sourceId, newChoiceId, { next: pendingEdge.targetId });
    updateChoice(pendingEdge.sourceId, pendingEdge.choiceId, { next: undefined });
    setPendingEdge(null);
  }, [pendingEdge, updateChoice]);

  // Live collision push — Option B: nudge overlapping nodes while dragging
  const onNodeDrag: OnNodeDrag = useCallback(
    (_, draggedNode) => {
      setNodes((current) => pushOverlaps(current, draggedNode.id));
    },
    [setNodes],
  );

  // Persist all positions (dragged node + any pushed siblings) on release
  const onNodeDragStop: OnNodeDrag = useCallback(
    () => {
      const current = getNodes();
      batchUpdatePositions(
        current.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
      );
    },
    [batchUpdatePositions, getNodes],
  );

  // Auto-arrange via Dagre — called from toolbar button
  const handleAutoLayout = useCallback(() => {
    const current = getNodes();
    const laid = autoLayout(current, edges);
    setNodes(laid);
    batchUpdatePositions(
      laid.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
    );
  }, [getNodes, setNodes, edges, batchUpdatePositions]);


  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    // Clear the node picker if it has been open for more than 200ms
    // (the immediate paneClick after onConnectEnd is ignored by the time check)
    if (pendingConn && Date.now() - pendingConnSetAtRef.current > 200) {
      setPendingConn(null);
    }
  }, [setSelectedNode, pendingConn]);

  // ── Block drag & drop ────────────────────────────────────────────────────────

  const dndSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const [activeBlockDrag, setActiveBlockDrag] = useState<{
    block: NWVBlock;
    nodeId: string;
    charName?: string;
  } | null>(null);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as { nodeId: string; blockId: string } | undefined;
      if (!data) return;
      const node = story.nodes.find((n) => n.id === data.nodeId);
      const block = node?.blocks?.find((b) => b.id === data.blockId);
      if (!block) return;
      const char = block.characterId
        ? story.characters.find((c) => c.id === block.characterId)
        : undefined;
      setActiveBlockDrag({
        block,
        nodeId: data.nodeId,
        charName: char?.name,
      });
    },
    [story],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveBlockDrag(null);
      const { active, over } = event;
      if (!over || !active.data.current) return;

      const activeData = active.data.current as { nodeId: string; blockId: string };
      const overData = over.data.current as { nodeId: string; blockId?: string } | undefined;
      if (!overData) return;

      const sourceNodeId = activeData.nodeId;
      const blockId = activeData.blockId;
      const targetNodeId = overData.nodeId;

      // Strip 'canvas-' or 'panel-' prefix from IDs to get actual block IDs
      const stripPrefix = (id: string) => id.replace(/^(canvas|panel)-/, '');

      if (sourceNodeId === targetNodeId) {
        // Reorder within same node
        const node = story.nodes.find((n) => n.id === sourceNodeId);
        const blocks = node?.blocks ?? [];
        const oldIndex = blocks.findIndex((b) => b.id === blockId);
        const overBlockId = overData.blockId ?? stripPrefix(String(over.id));
        const newIndex = blocks.findIndex((b) => b.id === overBlockId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          reorderBlock(sourceNodeId, blockId, newIndex);
        }
      } else {
        // Move between nodes — reject if target is locked
        const targetNode = story.nodes.find((n) => n.id === targetNodeId);
        if (targetNode?.locked) return;
        const targetBlocks = targetNode?.blocks ?? [];
        const overBlockId = overData.blockId ?? stripPrefix(String(over.id));
        const insertIndex = targetBlocks.findIndex((b) => b.id === overBlockId);
        moveBlockBetweenNodes(
          sourceNodeId,
          blockId,
          targetNodeId,
          insertIndex >= 0 ? insertIndex : targetBlocks.length,
        );
      }
    },
    [story, reorderBlock, moveBlockBetweenNodes],
  );

  const onDragCancel = useCallback(() => setActiveBlockDrag(null), []);

  return (
    <div className="flex h-full w-full flex-col">
      <CanvasToolbar flowMode={flowMode} onFlowMode={onFlowMode} worldPanelOpen={worldPanelOpen} onToggleWorld={onToggleWorld} avfxMode={avfxMode} onToggleAVFX={onToggleAVFX} onSeedAI={onSeedAI} />
      <DndContext
        sensors={dndSensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
      <div
        className="relative flex flex-1 overflow-hidden transition-shadow duration-300"
        style={
          voiceModeActive && voiceStatus === 'listening'
            ? { boxShadow: '0 0 0 2px #ef4444, 0 0 32px 6px #ef444418' }
            : undefined
        }
      >
        {/* World panel — left side */}
        {worldPanelOpen && (
          <WorldPanel onClose={onToggleWorld} />
        )}

        {/* Act column header — pinned to top, above canvas */}
        <ActHeader story={story} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onEdgeClick={onEdgeClick}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          deleteKeyCode={null}
          nodesDraggable={!canvasLocked}
          nodesConnectable={!canvasLocked}
          elementsSelectable={!canvasLocked}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <ActBands story={story} />
          <Background
            variant={BackgroundVariant.Dots}
            bgColor="#f8fafc"
            color="#cbd5e1"
            gap={24}
            size={1.5}
          />
          <Controls showInteractive={false} className="!border-slate-200 !bg-white !text-slate-600">
            <ControlButton onClick={handleAutoLayout} title="Auto-arrange all nodes into a clean left-to-right tree">
              ⬡
            </ControlButton>
            <ControlButton
              onClick={() => setCanvasLocked((v) => !v)}
              title={canvasLocked ? 'Unlock canvas' : 'Lock canvas'}
            >
              {canvasLocked ? '🔒' : '🔓'}
            </ControlButton>
          </Controls>
          <MiniMap
            nodeColor={(n) => {
              switch (n.type) {
                case 'story':  return '#3b82f6';
                case 'combat': return '#ef4444';
                case 'chat':   return '#22c55e';
                case 'twist':  return '#a855f7';
                case 'start':  return '#14b8a6';
                case 'end':    return '#f97316';
                default:       return '#64748b';
              }
            }}
            maskColor="rgba(248,250,252,0.8)"
            className="!border-slate-200 !bg-white"
          />
        </ReactFlow>

        {/* Node type picker — appears where user dropped the connection */}
        {pendingConn && (
          <NodePickerMenu
            screenX={pendingConn.screenX}
            screenY={pendingConn.screenY}
            onPick={handlePickNodeType}
            onClose={() => setPendingConn(null)}
          />
        )}

        {/* Edge context menu — appears where user clicked the edge */}
        {pendingEdge && (
          <EdgeContextMenu
            edge={pendingEdge}
            unusedChoices={(() => {
              const src = story.nodes.find((n) => n.id === pendingEdge.sourceId);
              return (src?.choices ?? [])
                .filter((c) => !c.next && c.id !== pendingEdge.choiceId)
                .map((c) => ({ id: c.id, label: c.label }));
            })()}
            onDelete={handleEdgeDelete}
            onInsert={handleEdgeInsert}
            onAddChoice={handleEdgeAddChoice}
            onReassign={handleEdgeReassign}
            onClose={() => setPendingEdge(null)}
          />
        )}

        {selectedNodeId && (
          <NodeEditorPanel
            panelWidth={panelWidth}
            isExpanded={panelExpanded}
            onToggleExpand={onToggleExpand}
            onResizeStart={onResizeStart}
          />
        )}
        {!selectedNodeId && selectedPanel === 'settings' && (
          <SettingsPanel
            panelWidth={panelWidth}
            isExpanded={panelExpanded}
            onToggleExpand={onToggleExpand}
            onResizeStart={onResizeStart}
          />
        )}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeBlockDrag && (
          <DragPreview block={activeBlockDrag.block} characterName={activeBlockDrag.charName} />
        )}
      </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── Main export (wraps in ReactFlowProvider so inner can use useReactFlow) ────

export function StoryCanvas({ story, onToggleAVFX, onSeedAI }: StoryCanvasProps) {
  const [panelWidth, setPanelWidth]       = useState(PANEL_MAX);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [flowMode, setFlowMode]           = useState(false);
  const [worldPanelOpen, setWorldPanelOpen] = useState(false);
  const [showSeedAI, setShowSeedAI] = useState(false);

  // Reset to max width whenever the node editor panel opens (closed → open)
  // but not when simply switching from one node to another.
  const selectedNodeId = useStoryStore((s) => s.selectedNodeId);
  const prevNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedNodeId && !prevNodeIdRef.current) {
      // Intentional: reset panel width once on closed→open transition (not on node switch)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelWidth(PANEL_MAX);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanelExpanded(false);
    }
    prevNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  const toggleExpand = useCallback(() => {
    setPanelExpanded((e) => {
      if (!e) setPanelWidth(PANEL_WIDE);
      else    setPanelWidth(PANEL_DEFAULT);
      return !e;
    });
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW + delta)));
      setPanelExpanded(false);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  // Flow Mode: replace React Flow canvas with the document editor
  if (flowMode) {
    return <FlowEditor story={story} onExit={() => setFlowMode(false)} />;
  }

  return (
    <>
      <ReactFlowProvider>
        <StoryFlowInner
          story={story}
          panelWidth={panelWidth}
          panelExpanded={panelExpanded}
          onToggleExpand={toggleExpand}
          onResizeStart={startResize}
          flowMode={flowMode}
          onFlowMode={() => setFlowMode(true)}
          worldPanelOpen={worldPanelOpen}
          onToggleWorld={() => setWorldPanelOpen((v) => !v)}
          onToggleAVFX={onToggleAVFX}
          onSeedAI={onSeedAI ?? (() => setShowSeedAI(true))}
        />
      </ReactFlowProvider>
      {showSeedAI && (
        <SeedAIModal onClose={() => setShowSeedAI(false)} />
      )}
    </>
  );
}
