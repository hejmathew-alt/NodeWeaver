'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
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
import { autoLayout, pushOverlaps } from '@/lib/layout';
import { NodeEditorPanel } from '@/components/panels/NodeEditorPanel';
import { CharacterPanel } from '@/components/panels/CharacterPanel';
import { SettingsPanel } from '@/components/panels/SettingsPanel';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { NWVBlock } from '@nodeweaver/engine';
import { DragPreview } from './nodes/CanvasBlock';
import { useStoryStore } from '@/store/story';

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

// ── storyToFlow ───────────────────────────────────────────────────────────────

interface StoryCanvasProps {
  story: NWVStory;
}

function storyToFlow(story: NWVStory): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = story.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    style: { width: n.width ?? 220, height: n.height ?? 120 },
    data: n as unknown as Record<string, unknown>,
  }));

  const edges: Edge[] = [];
  for (const node of story.nodes) {
    for (const choice of node.choices) {
      if (choice.next) {
        edges.push({
          id: `${node.id}-${choice.id}`,
          source: node.id,
          target: choice.next,
          label: choice.flavour ?? '',
          style: { stroke: '#64748b', strokeWidth: 1.5 },
          labelStyle: { fill: '#94a3b8', fontSize: 11 },
          labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.85 },
          data: { sourceId: node.id, choiceId: choice.id },
        });
      }
    }
  }

  return { nodes, edges };
}

// ── Node type picker ──────────────────────────────────────────────────────────

const NODE_PICKER_ITEMS: { type: NodeType; label: string; color: string }[] = [
  { type: 'story',  label: 'Story',       color: '#3b82f6' },
  { type: 'chat',   label: 'Chat',        color: '#22c55e' },
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
  onDelete: () => void;
  onInsert: (type: NodeType) => void;
  onAddChoice: () => void;
  onClose: () => void;
}

function EdgeContextMenu({ edge, onDelete, onInsert, onAddChoice, onClose }: EdgeContextMenuProps) {
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
}

function StoryFlowInner({ story, panelWidth, panelExpanded, onToggleExpand, onResizeStart }: InnerProps) {
  const selectedNodeId = useStoryStore((s) => s.selectedNodeId);
  const selectedPanel = useStoryStore((s) => s.selectedPanel);
  const setSelectedNode = useStoryStore((s) => s.setSelectedNode);
  const deleteNode = useStoryStore((s) => s.deleteNode);
  const connectNodes = useStoryStore((s) => s.connectNodes);
  const batchUpdatePositions = useStoryStore((s) => s.batchUpdatePositions);
  const createNode = useStoryStore((s) => s.createNode);
  const deleteChoice = useStoryStore((s) => s.deleteChoice);
  const addChoice = useStoryStore((s) => s.addChoice);
  const insertNodeBetween = useStoryStore((s) => s.insertNodeBetween);
  const reorderBlock = useStoryStore((s) => s.reorderBlock);
  const moveBlockBetweenNodes = useStoryStore((s) => s.moveBlockBetweenNodes);

  const { screenToFlowPosition, getNodes } = useReactFlow();

  const { nodes: initialNodes, edges: initialEdges } = storyToFlow(story);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const [pendingConn, setPendingConn] = useState<PendingConn | null>(null);
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null);

  // Re-sync React Flow state whenever the story changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = storyToFlow(story);
    setNodes(newNodes);
    setEdges(newEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.nodes]);

  // Keyboard delete (locked guard is in the store's deleteNode action)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        deleteNode(selectedNodeId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, deleteNode]);

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
        connectNodes(connection.source, connection.target);
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
      setPendingConn({
        sourceId: connectionState.fromNode.id,
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
      if (newId) connectNodes(pendingConn.sourceId, newId);
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
  }, [setSelectedNode]);

  // ── Block drag & drop ────────────────────────────────────────────────────────

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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
      <CanvasToolbar onAutoLayout={handleAutoLayout} />
      <DndContext
        sensors={dndSensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
      <div className="flex flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
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
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            bgColor="#f8fafc"
            color="#cbd5e1"
            gap={24}
            size={1.5}
          />
          <Controls className="!border-slate-200 !bg-white !text-slate-600" />
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
            onDelete={handleEdgeDelete}
            onInsert={handleEdgeInsert}
            onAddChoice={handleEdgeAddChoice}
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
        {!selectedNodeId && selectedPanel === 'character' && (
          <CharacterPanel
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

export function StoryCanvas({ story }: StoryCanvasProps) {
  const [panelWidth, setPanelWidth]       = useState(PANEL_DEFAULT);
  const [panelExpanded, setPanelExpanded] = useState(false);

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

  return (
    <ReactFlowProvider>
      <StoryFlowInner
        story={story}
        panelWidth={panelWidth}
        panelExpanded={panelExpanded}
        onToggleExpand={toggleExpand}
        onResizeStart={startResize}
      />
    </ReactFlowProvider>
  );
}
