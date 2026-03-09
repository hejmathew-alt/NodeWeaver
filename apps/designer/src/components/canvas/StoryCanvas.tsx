'use client';

import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { VRNStory } from '@void-runner/engine';
import { StoryNode } from './nodes/StoryNode';
import { CombatNode } from './nodes/CombatNode';
import { ChatNode } from './nodes/ChatNode';
import { TwistNode } from './nodes/TwistNode';
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
    // Cast to satisfy React Flow's Record<string, unknown> data constraint;
    // individual node components cast back to VRNNode via `data as unknown as VRNNode`
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
  const setSelectedNode = useStoryStore((s) => s.setSelectedNode);
  const { nodes, edges } = storyToFlow(story);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          bgColor="#030712"
          color="#1e293b"
          gap={24}
          size={1.5}
        />
        <Controls className="!border-slate-700 !bg-slate-900 !text-slate-300" />
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
          maskColor="rgba(3,7,18,0.8)"
          className="!border-slate-700 !bg-slate-900"
        />
      </ReactFlow>
    </div>
  );
}
