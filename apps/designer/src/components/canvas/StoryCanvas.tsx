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
import type { VRNStory, NodeType } from '@void-runner/engine';
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
  story: VRNStory;
}

function storyToFlow(story: VRNStory): { nodes: Node[]; edges: Edge[] } {
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
          labelBgStyle: { fill: '#0f172a' },
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
  story: VRNStory;
  panelWidth: number;
  panelExpanded: boolean;
  onToggleExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

function StoryFlowInner({ story, panelWidth, panelExpanded, onToggleExpand, onResizeStart }: InnerProps) {
  const {
    selectedNodeId,
    selectedPanel,
    setSelectedNode,
    deleteNode,
    connectNodes,
    updateNodePosition,
    batchUpdatePositions,
    createNode,
  } = useStoryStore();

  const { screenToFlowPosition } = useReactFlow();

  const { nodes: initialNodes, edges: initialEdges } = storyToFlow(story);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);
  const [pendingConn, setPendingConn] = useState<PendingConn | null>(null);

  // Re-sync React Flow state whenever the story changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = storyToFlow(story);
    setNodes(newNodes);
    setEdges(newEdges);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.nodes]);

  // Keyboard delete
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

  // Live collision push — Option B: nudge overlapping nodes while dragging
  const onNodeDrag: OnNodeDrag = useCallback(
    (_, draggedNode) => {
      setNodes((current) => pushOverlaps(current, draggedNode.id));
    },
    [setNodes],
  );

  // Persist all positions (dragged node + any pushed siblings) on release
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, _node) => {
      setNodes((current) => {
        batchUpdatePositions(
          current.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
        );
        return current;
      });
    },
    [batchUpdatePositions, setNodes],
  );

  // Auto-arrange via Dagre — called from toolbar button
  const handleAutoLayout = useCallback(() => {
    setNodes((current) => {
      const laid = autoLayout(current, edges);
      batchUpdatePositions(
        laid.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
      );
      return laid;
    });
  }, [setNodes, edges, batchUpdatePositions]);


  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  return (
    <div className="flex h-full w-full flex-col">
      <CanvasToolbar onAutoLayout={handleAutoLayout} />
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
