'use client';

import { useViewport } from '@xyflow/react';
import type { NWVStory } from '@nodeweaver/engine';

interface Props {
  story: NWVStory;
}

/**
 * Renders coloured vertical lane bands behind canvas nodes.
 * Must be placed inside a ReactFlowProvider. Uses useViewport() to
 * manually apply the same pan/zoom transform as the flow canvas.
 */
export function LaneOverlay({ story }: Props) {
  const { x, y, zoom } = useViewport();

  const lanes = story.lanes ?? [];
  if (lanes.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {lanes.map((lane) => {
          const laneNodes = story.nodes.filter((n) => (n.lanes ?? []).includes(lane.id));
          if (laneNodes.length === 0) return null;

          const PADDING_H = 48;
          const PADDING_T = 36;
          const PADDING_B = 48;

          const minX = Math.min(...laneNodes.map((n) => n.position.x)) - PADDING_H;
          const minY = Math.min(...laneNodes.map((n) => n.position.y)) - PADDING_T;
          const maxX = Math.max(...laneNodes.map((n) => n.position.x + (n.width ?? 220))) + PADDING_H;
          const maxY = Math.max(...laneNodes.map((n) => n.position.y + (n.height ?? 120))) + PADDING_B;

          return (
            <div
              key={lane.id}
              style={{
                position: 'absolute',
                left: minX,
                top: minY,
                width: maxX - minX,
                height: maxY - minY,
                background: `${lane.colour}10`,
                borderLeft: `3px solid ${lane.colour}90`,
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  color: lane.colour,
                  opacity: 0.85,
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
              >
                {lane.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
