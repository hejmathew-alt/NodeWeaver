'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';

interface ChoiceEdgeData {
  label?: string;
  sourceId?: string;
  choiceId?: string;
  _isSpineEdge?: boolean;
}

export function ChoiceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  // A loop-back connection exits from the LEFT of the source node (which sits to the
  // right of its target). Route it as a U-curve dipping below the spine so readers
  // can instantly see the backwards direction.
  // In L→R layout: forward edges have sourceX < targetX; loop-backs have sourceX > targetX.
  const isLoopBack = sourceX > targetX;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (isLoopBack) {
    // U-curve below both nodes: go down then across then back up.
    const dip = Math.max(80, Math.abs(sourceY - targetY) * 0.5 + 60);
    const bottomY = Math.max(sourceY, targetY) + dip;
    edgePath = [
      `M ${sourceX} ${sourceY}`,
      `C ${sourceX - 60} ${bottomY}`,
      `  ${targetX - 60} ${bottomY}`,
      `  ${targetX} ${targetY}`,
    ].join(' ');
    labelX = (sourceX + targetX) / 2 - 60;
    labelY = bottomY;
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  const edgeData = data as ChoiceEdgeData;
  const rawLabel = edgeData?.label;
  const label = rawLabel && rawLabel.length > 30 ? rawLabel.slice(0, 30) + '…' : rawLabel;
  // Loop-backs are always branch weight regardless of spine membership
  const isSpineEdge = !isLoopBack && (edgeData?._isSpineEdge ?? false);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#7c3aed' : isSpineEdge ? '#4c1d95' : '#94a3b8',
          strokeWidth: selected ? 3 : isSpineEdge ? 3 : 1.5,
          strokeDasharray: isLoopBack ? '5 4' : undefined,
          ...style,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              zIndex: 10,
            }}
            className="nodrag nopan"
          >
            <span
              title={rawLabel}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-sm whitespace-nowrap
                ${selected
                  ? 'border-violet-400 bg-violet-100 text-violet-800'
                  : 'border-violet-200 bg-violet-50 text-violet-700'
                }`}
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
