'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { useStoryStore } from '@/store/story';

interface ChoiceEdgeData {
  label?: string;
  sourceId?: string;
  choiceId?: string;
  _isSpineEdge?: boolean;
  _isLoopBack?: boolean;
  _isPlanned?: boolean;
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
  const chosenChoiceIds = useStoryStore((s) => s.chosenChoiceIds);

  // A true loop-back connects to a node at an EARLIER BFS depth (flagged in storyToFlow).
  // Geometric fallback (sourceX > targetX + 200) catches manually-wired edges not yet
  // processed by storyToFlow. Same-depth sibling connections must NOT be flagged as
  // loopbacks even though their right-handle X exceeds the sibling's left-handle X.
  const edgeData = data as ChoiceEdgeData;
  const wasChosen = edgeData?.choiceId ? chosenChoiceIds.includes(edgeData.choiceId) : false;
  const isLoopBack = edgeData?._isLoopBack ?? (sourceX > targetX + 200);

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

  const rawLabel = (data as ChoiceEdgeData)?.label;
  const label = rawLabel && rawLabel.length > 30 ? rawLabel.slice(0, 30) + '…' : rawLabel;
  // Loop-backs are always branch weight regardless of spine membership
  const isSpineEdge = !isLoopBack && (edgeData?._isSpineEdge ?? false);
  const isPlanned = edgeData?._isPlanned ?? false;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#7c3aed' : wasChosen ? '#3b82f6' : isPlanned ? '#f59e0b' : isSpineEdge ? '#4c1d95' : '#94a3b8',
          strokeWidth: selected ? 3 : wasChosen ? 2.5 : isSpineEdge ? 3 : 1.5,
          strokeDasharray: isLoopBack || isPlanned ? '6 4' : undefined,
          filter: wasChosen ? 'drop-shadow(0 0 4px #3b82f688)' : undefined,
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
                  : wasChosen
                  ? 'border-blue-400 bg-blue-100 text-blue-800'
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
