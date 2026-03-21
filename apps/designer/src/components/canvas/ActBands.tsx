'use client';

import { useViewport } from '@xyflow/react';
import type { NWVStory } from '@nodeweaver/engine';

interface Props {
  story: NWVStory;
}

// Alternating subtle tints for neighbouring act columns
const BAND_TINTS = [
  'rgba(248,250,252,0.55)', // slate-50 — slightly cooler
  'rgba(241,245,249,0.55)', // slate-100 — slightly warmer
];

/**
 * World-space act column bands — rendered behind canvas nodes.
 * Reuses the same useViewport() + transform-sync pattern as the old LaneOverlay.
 * Must be placed inside a ReactFlowProvider context.
 */
export function ActBands({ story }: Props) {
  const { x, y, zoom } = useViewport();

  const acts = (story.acts ?? []).slice().sort((a, b) => a.order - b.order);
  if (acts.length === 0) return null;

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
        {acts.map((act, i) => (
          <div
            key={act.id}
            style={{
              position: 'absolute',
              left: act.worldX,
              top: -50000,
              width: act.worldWidth,
              height: 100000,
              backgroundColor: BAND_TINTS[i % BAND_TINTS.length],
              borderRight: '1px solid #cbd5e1',
            }}
          />
        ))}
      </div>
    </div>
  );
}
