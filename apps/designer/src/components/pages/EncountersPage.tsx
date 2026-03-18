'use client';

import { useState } from 'react';
import type { NWVEnemy } from '@nodeweaver/engine';
import { useStoryStore } from '@/store/story';

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const EMPTY_ENEMY: Omit<NWVEnemy, 'name'> = {
  hp: 100,
  damage: [10, 20],
  art: '',
  taunts: [],
};

// ── Encounter Card ───────────────────────────────────────────────────────────

function EncounterCard({
  enemyKey,
  enemy,
}: {
  enemyKey: string;
  enemy: NWVEnemy;
}) {
  const updateEnemy = useStoryStore((s) => s.updateEnemy);
  const deleteEnemy = useStoryStore((s) => s.deleteEnemy);
  const [tauntDraft, setTauntDraft] = useState('');

  const up = (patch: Partial<NWVEnemy>) => updateEnemy(enemyKey, patch);

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <input
            className="w-full bg-transparent text-lg font-semibold text-slate-900 placeholder-slate-300 focus:outline-none"
            value={enemy.name}
            onChange={(e) => up({ name: e.target.value })}
            placeholder="Encounter name..."
          />
          <span className="mt-0.5 inline-block rounded bg-red-50 px-1.5 py-0.5 font-mono text-[10px] text-red-500">{enemyKey}</span>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2 text-sm text-slate-500">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">HP {enemy.hp}</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{enemy.damage[0]}-{enemy.damage[1]} dmg</span>
        </div>
      </div>

      {/* Stats */}
      <div className="border-t border-slate-100 px-5 py-3 space-y-3">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">HP</label>
            <input
              type="number"
              min={1}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-red-400 focus:outline-none"
              value={enemy.hp}
              onChange={(e) => up({ hp: Math.max(1, parseInt(e.target.value) || 1) })}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Damage (min - max)</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={1}
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-red-400 focus:outline-none"
                value={enemy.damage[0]}
                onChange={(e) => up({ damage: [Math.max(1, parseInt(e.target.value) || 1), enemy.damage[1]] })}
              />
              <span className="text-slate-400">-</span>
              <input
                type="number"
                min={1}
                className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm focus:border-red-400 focus:outline-none"
                value={enemy.damage[1]}
                onChange={(e) => up({ damage: [enemy.damage[0], Math.max(enemy.damage[0], parseInt(e.target.value) || 1)] })}
              />
            </div>
          </div>
        </div>

        {/* ASCII Art */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">ASCII Art</label>
          <textarea
            rows={5}
            className="w-full resize-y rounded border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-tight text-slate-700 focus:border-red-400 focus:outline-none"
            placeholder={"  /\\_/\\\n ( o.o )\n  > ^ <"}
            value={enemy.art}
            onChange={(e) => up({ art: e.target.value })}
          />
        </div>

        {/* Taunts */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Taunts ({enemy.taunts.length})
          </label>
          <div className="space-y-1">
            {enemy.taunts.map((t, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="flex-1 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-700">{t}</span>
                <button
                  onClick={() => up({ taunts: enemy.taunts.filter((_, j) => j !== i) })}
                  className="rounded px-1 text-xs text-slate-400 hover:text-red-500"
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1">
            <input
              className="flex-1 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs focus:border-red-400 focus:outline-none"
              placeholder="Add a taunt..."
              value={tauntDraft}
              onChange={(e) => setTauntDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tauntDraft.trim()) {
                  up({ taunts: [...enemy.taunts, tauntDraft.trim()] });
                  setTauntDraft('');
                }
              }}
            />
            <button
              onClick={() => {
                if (tauntDraft.trim()) {
                  up({ taunts: [...enemy.taunts, tauntDraft.trim()] });
                  setTauntDraft('');
                }
              }}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
            >
              + Add
            </button>
          </div>
        </div>

        {/* Delete */}
        <div className="border-t border-slate-100 pt-3">
          <button
            onClick={() => {
              if (confirm(`Delete encounter "${enemy.name}"?`)) deleteEnemy(enemyKey);
            }}
            className="w-full rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
          >
            Delete encounter
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Encounters Page ──────────────────────────────────────────────────────────

export function EncountersPage() {
  const activeStory = useStoryStore((s) => s.activeStory);
  const addEnemy = useStoryStore((s) => s.addEnemy);
  const setActiveView = useStoryStore((s) => s.setActiveView);
  const [newName, setNewName] = useState('');

  if (!activeStory) return null;

  const enemies = activeStory.enemies ?? {};
  const entries = Object.entries(enemies);

  const handleAdd = () => {
    const name = newName.trim() || 'New Enemy';
    const key = slugify(name) || 'enemy';
    const safeKey = enemies[key] ? `${key}-${Date.now()}` : key;
    addEnemy(safeKey, { ...EMPTY_ENEMY, name });
    setNewName('');
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveView('canvas')}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              title="Back to canvas"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 2 4 7 9 12"/></svg>
              Canvas
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <h1 className="text-2xl font-bold text-slate-900">Encounters</h1>
            {entries.length > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-medium text-red-700">
                {entries.length}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-400 focus:border-red-400 focus:outline-none"
              placeholder="Encounter name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button
              onClick={handleAdd}
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              + New Encounter
            </button>
          </div>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {entries.map(([key, enemy]) => (
            <EncounterCard key={key} enemyKey={key} enemy={enemy} />
          ))}
        </div>

        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg className="mb-3 text-slate-300" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>
            <p className="text-lg text-slate-500">No encounters yet</p>
            <p className="mt-1 text-sm text-slate-400">Add your first encounter to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
