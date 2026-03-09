'use client';

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { VRNStory } from '@void-runner/engine';
import { StoryNode } from './nodes/StoryNode';
import { CombatNode } from './nodes/CombatNode';
import { ChatNode } from './nodes/ChatNode';
import { TwistNode } from './nodes/TwistNode';
import { CanvasToolbar } from './CanvasToolbar';
import { NodeEditorPanel } from '@/components/panels/NodeEditorPanel';
import { useStoryStore } from '@/store/story';

const nodeTypes = {
  story: StoryNode,
  combat: CombatNode,
  chat: ChatNode,
  twist: TwistNode,
};

interface StoryCanvasProps {
  story: VRNStory;
}

function storyToFlow(story: VRNStory): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = story.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
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
          label: choice.label,
          style: { stroke: '#64748b', strokeWidth: 1.5 },
          labelStyle: { fill: '#94a3b8', fontSize: 11 },
          labelBgStyle: { fill: '#0f172a' },
        });
      }
    }
  }

  return { nodes, edges };
}

export function StoryCanvas({ story }: StoryCanvasProps) {
  const {
    selectedNodeId,
    setSelectedNode,
    deleteNode,
    connectNodes,
    updateNodePosition,
  } = useStoryStore();

  const { nodes: initialNodes, edges: initialEdges } = storyToFlow(story);
  const [nodes, setNodes] = useNodesState(initialNodes);
  const [edges, setEdges] = useEdgesState(initialEdges);

  // Re-sync RF state whenever the story changes externally (new node, delete, etc.)
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
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (connection.source && connection.target) {
        connectNodes(connection.source, connection.target);
      }
    },
    [connectNodes]
  );

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      updateNodePosition(node.id, node.position.x, node.position.y);
    },
    [updateNodePosition]
  );

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  return (
    <div className="flex h-full w-full flex-col">
      <CanvasToolbar />
      <div className="flex flex-1 overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
                case 'story': return '#3b82f6';
                case 'combat': return '#ef4444';
                case 'chat': return '#22c55e';
                case 'twist': return '#a855f7';
                default: return '#64748b';
              }
            }}
            maskColor="rgba(248,250,252,0.8)"
            className="!border-slate-200 !bg-white"
          />
        </ReactFlow>
        {selectedNodeId && <NodeEditorPanel />}
      </div>
    </div>
  );
}
