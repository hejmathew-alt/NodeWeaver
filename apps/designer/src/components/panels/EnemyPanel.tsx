'use client';

import { useState } from 'react';
import type { NWVEnemy } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const EMPTY_ENEMY: Omit<NWVEnemy, 'name'> = {
  hp: 100,
  damage: [10, 20],
  art: '',
  taunts: [],
};

interface EnemyCardProps {
  enemyKey: string;
  enemy: NWVEnemy;
  onUpdate: (key: string, patch: Partial<NWVEnemy>) => void;
  onDelete: (key: string) => void;
}

function EnemyCard({ enemyKey, enemy, onUpdate, onDelete }: EnemyCardProps) {
  const [open, setOpen] = useState(false);
  const [tauntDraft, setTauntDraft] = useState('');

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{enemy.name || '(unnamed)'}</span>
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-mono text-red-500">{enemyKey}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>HP {enemy.hp}</span>
          <span>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-3">
          {/* Name */}
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Name</span>
            <input
              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              value={enemy.name}
              onChange={(e) => onUpdate(enemyKey, { name: e.target.value })}
            />
          </label>

          {/* HP */}
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">HP</span>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
              value={enemy.hp}
              onChange={(e) => onUpdate(enemyKey, { hp: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </label>

          {/* Damage */}
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Damage per hit (min – max)</span>
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                min={1}
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                value={enemy.damage[0]}
                onChange={(e) => onUpdate(enemyKey, { damage: [Math.max(1, parseInt(e.target.value) || 1), enemy.damage[1]] })}
              />
              <span className="self-center text-slate-400">–</span>
              <input
                type="number"
                min={1}
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                value={enemy.damage[1]}
                onChange={(e) => onUpdate(enemyKey, { damage: [enemy.damage[0], Math.max(enemy.damage[0], parseInt(e.target.value) || 1)] })}
              />
            </div>
          </div>

          {/* ASCII art */}
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">ASCII Art</span>
            <textarea
              rows={6}
              className="mt-1 w-full resize-y rounded border border-slate-200 px-2 py-1 font-mono text-xs leading-tight text-slate-700"
              placeholder={"  /\\_/\\\n ( o.o )\n  > ^ <"}
              value={enemy.art}
              onChange={(e) => onUpdate(enemyKey, { art: e.target.value })}
            />
          </label>

          {/* Taunts */}
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Taunts</span>
            <div className="mt-1 space-y-1">
              {enemy.taunts.map((t, i) => (
                <div key={i} className="flex items-start gap-1">
                  <span className="mt-1 flex-1 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-700">{t}</span>
                  <button
                    onClick={() => onUpdate(enemyKey, { taunts: enemy.taunts.filter((_, j) => j !== i) })}
                    className="mt-0.5 rounded px-1 text-xs text-slate-400 hover:text-red-500"
                  >✕</button>
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1">
              <input
                className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                placeholder="Add a taunt…"
                value={tauntDraft}
                onChange={(e) => setTauntDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tauntDraft.trim()) {
                    onUpdate(enemyKey, { taunts: [...enemy.taunts, tauntDraft.trim()] });
                    setTauntDraft('');
                  }
                }}
              />
              <button
                onClick={() => {
                  if (tauntDraft.trim()) {
                    onUpdate(enemyKey, { taunts: [...enemy.taunts, tauntDraft.trim()] });
                    setTauntDraft('');
                  }
                }}
                className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >+ Add</button>
            </div>
          </div>

          {/* Delete */}
          <button
            onClick={() => { if (confirm(`Delete enemy "${enemy.name}"?`)) onDelete(enemyKey); }}
            className="mt-1 w-full rounded border border-red-100 py-1 text-xs text-red-500 hover:bg-red-50"
          >
            Delete Enemy
          </button>
        </div>
      )}
    </div>
  );
}

interface PanelSizeProps {
  panelWidth: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function EnemyPanel({ panelWidth, isExpanded, onToggleExpand, onResizeStart }: PanelSizeProps) {
  const { activeStory, setSelectedPanel, addEnemy, updateEnemy, deleteEnemy } = useStoryStore();
  const [newName, setNewName] = useState('');

  if (!activeStory) return null;

  const enemies = activeStory.enemies ?? {};
  const enemyEntries = Object.entries(enemies);

  const handleAdd = () => {
    const name = newName.trim() || 'New Enemy';
    const key = slugify(name) || 'enemy';
    const safeKey = enemies[key] ? `${key}-${Date.now()}` : key;
    addEnemy(safeKey, { ...EMPTY_ENEMY, name });
    setNewName('');
  };

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-red-100 bg-white" style={{ width: panelWidth }}>
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-red-300"
        onMouseDown={onResizeStart}
        title="Drag to resize"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-red-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-red-700">Encounters</span>
          {enemyEntries.length > 0 && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-500">{enemyEntries.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleExpand}
            className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '⟨' : '⟩'}
          </button>
          <button
            onClick={() => setSelectedPanel(null)}
            className="rounded p-1 text-xs text-slate-400 hover:bg-slate-100"
            title="Close"
          >✕</button>
        </div>
      </div>

      {/* Add enemy */}
      <div className="flex gap-1 border-b border-red-50 px-3 py-2">
        <input
          className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
          placeholder="Enemy name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
        <button
          onClick={handleAdd}
          className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
        >+ Add</button>
      </div>

      {/* Enemy list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {enemyEntries.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-6">No encounters yet. Add one above.</p>
        ) : (
          enemyEntries.map(([key, enemy]) => (
            <EnemyCard
              key={key}
              enemyKey={key}
              enemy={enemy}
              onUpdate={updateEnemy}
              onDelete={deleteEnemy}
            />
          ))
        )}
      </div>
    </aside>
  );
}
