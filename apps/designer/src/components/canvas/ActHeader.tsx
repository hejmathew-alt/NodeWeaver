'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useViewport } from '@xyflow/react';
import type { NWVStory } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';

interface Props {
  story: NWVStory;
}

const HEADER_H = 32;
const ADD_BTN_W = 88;

/**
 * Screen-space pinned header strip for Act columns.
 * Labels are repositioned on every viewport change using the React Flow
 * viewport transform — worldX * zoom + panX — so they always align with
 * the world-space bands rendered by ActBands.
 */
export function ActHeader({ story }: Props) {
  const { x: panX, zoom } = useViewport();
  const addAct = useStoryStore((s) => s.addAct);
  const updateAct = useStoryStore((s) => s.updateAct);
  const reorderActs = useStoryStore((s) => s.reorderActs);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Drag-to-reorder state
  const dragRef = useRef<{
    fromIndex: number;
    startScreenX: number;
    currentIndex: number;
  } | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);

  const acts = (story.acts ?? []).slice().sort((a, b) => a.order - b.order);

  // Project world-space x to screen-space x
  const toScreen = (worldX: number) => worldX * zoom + panX;

  // --- Rename ---
  function startEdit(id: string, label: string) {
    setEditingId(id);
    setEditValue(label);
  }

  function commitEdit(id: string) {
    const trimmed = editValue.trim();
    if (trimmed) updateAct(id, { label: trimmed });
    setEditingId(null);
  }

  // --- Drag to reorder ---
  const onLabelMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    if (editingId !== null) return; // don't drag while editing
    e.preventDefault();
    dragRef.current = { fromIndex: index, startScreenX: e.clientX, currentIndex: index };
    setDraggingIndex(index);
    setDragTargetIndex(index);
  }, [editingId]);

  useEffect(() => {
    if (draggingIndex === null) return;

    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      // Determine which act column the cursor is over
      for (let i = 0; i < acts.length; i++) {
        const screenLeft = toScreen(acts[i].worldX);
        const screenRight = screenLeft + acts[i].worldWidth * zoom;
        if (e.clientX >= screenLeft && e.clientX < screenRight) {
          dragRef.current.currentIndex = i;
          setDragTargetIndex(i);
          break;
        }
      }
    };

    const onUp = () => {
      if (dragRef.current && dragRef.current.fromIndex !== dragRef.current.currentIndex) {
        reorderActs(dragRef.current.fromIndex, dragRef.current.currentIndex);
      }
      dragRef.current = null;
      setDraggingIndex(null);
      setDragTargetIndex(null);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingIndex]); // intentional: reads acts/zoom/panX via closure at drag-start

  // Add button position: right edge of last act
  const lastAct = acts.at(-1);
  const addBtnLeft = lastAct
    ? toScreen(lastAct.worldX + lastAct.worldWidth)
    : panX;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: HEADER_H,
        zIndex: 10,
        overflow: 'hidden',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >

      {acts.map((act, i) => {
        const screenLeft = toScreen(act.worldX);
        const screenWidth = act.worldWidth * zoom;
        const isEditing = editingId === act.id;
        const isDragging = draggingIndex === i;
        const isTarget = dragTargetIndex === i && draggingIndex !== null && draggingIndex !== i;

        return (
          <div
            key={act.id}
            style={{
              position: 'absolute',
              left: screenLeft,
              width: Math.max(screenWidth, 0),
              height: HEADER_H,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 10,
              borderRight: '1px solid #e2e8f0',
              pointerEvents: 'auto',
              opacity: isDragging ? 0.5 : 1,
              cursor: isEditing ? 'text' : 'grab',
              backgroundColor: isTarget ? 'rgba(139,92,246,0.08)' : undefined,
              transition: 'background-color 0.1s',
            }}
            onMouseDown={(e) => onLabelMouseDown(e, i)}
          >
            {isEditing ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => commitEdit(act.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit(act.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onMouseDown={(e) => e.stopPropagation()} // prevent drag while editing
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#334155',
                  width: '100%',
                  padding: 0,
                }}
              />
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(act.id, act.label);
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                {act.label}
              </span>
            )}
          </div>
        );
      })}

      {/* + Add Act button — always at right edge of last act, fixed size */}
      <button
        onClick={() => addAct()}
        style={{
          position: 'absolute',
          left: addBtnLeft,
          top: 0,
          width: ADD_BTN_W,
          height: HEADER_H,
          pointerEvents: 'auto',
          border: 'none',
          borderRight: '1px solid #e2e8f0',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 500,
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          transition: 'color 0.15s, background-color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#6366f1';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(99,102,241,0.06)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        + Add Act
      </button>
    </div>
  );
}
