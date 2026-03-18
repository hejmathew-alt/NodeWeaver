'use client';

import { useState } from 'react';
import { nanoid } from 'nanoid';
import { useStoryStore } from '@/store/story';
import { useSettingsStore } from '@/lib/settings';
import type { NWVLocation, NWVFaction, NWVLoreEntry, NWVWorldData } from '@nodeweaver/engine';

type Section = 'locations' | 'factions' | 'rules' | 'lore';

interface Props {
  onClose: () => void;
}

export function WorldPanel({ onClose }: Props) {
  const activeStory = useStoryStore((s) => s.activeStory);
  const updateWorld = useStoryStore((s) => s.updateWorld);
  const addLocation = useStoryStore((s) => s.addLocation);
  const updateLocation = useStoryStore((s) => s.updateLocation);
  const deleteLocation = useStoryStore((s) => s.deleteLocation);
  const addFaction = useStoryStore((s) => s.addFaction);
  const updateFaction = useStoryStore((s) => s.updateFaction);
  const deleteFaction = useStoryStore((s) => s.deleteFaction);
  const updateWorldRules = useStoryStore((s) => s.updateWorldRules);
  const addLoreEntry = useStoryStore((s) => s.addLoreEntry);
  const updateLoreEntry = useStoryStore((s) => s.updateLoreEntry);
  const deleteLoreEntry = useStoryStore((s) => s.deleteLoreEntry);
  const anthropicKey = useSettingsStore((s) => s.anthropicKey);

  const world: NWVWorldData = activeStory?.world ?? { locations: [], factions: [], rules: [], lore: [] };

  const [openSections, setOpenSections] = useState<Set<Section>>(new Set(['locations']));
  const [generating, setGenerating] = useState<Section | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const toggleSection = (s: Section) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  async function generateSection(step: Section) {
    if (!activeStory) return;
    setGenerating(step);
    setGenError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'world-step',
          prompt: '',
          anthropicKey,
          context: {
            step,
            genre: activeStory.metadata.genre,
            title: activeStory.metadata.title,
            premise: activeStory.metadata.logline,
            existingWorld: world,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const items = JSON.parse(data.world);
      applyGeneratedItems(step, items);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed.');
    } finally {
      setGenerating(null);
    }
  }

  function applyGeneratedItems(step: Section, items: unknown[]) {
    switch (step) {
      case 'locations':
        updateWorld({ locations: (items as Omit<NWVLocation, 'id'>[]).map((l) => ({ id: nanoid(8), ...l })) });
        break;
      case 'factions':
        updateWorld({ factions: (items as Omit<NWVFaction, 'id'>[]).map((f) => ({ id: nanoid(8), ...f })) });
        break;
      case 'rules':
        updateWorld({ rules: items as string[] });
        break;
      case 'lore':
        updateWorld({ lore: (items as Omit<NWVLoreEntry, 'id'>[]).map((e) => ({ id: nanoid(8), ...e })) });
        break;
    }
  }

  if (!activeStory) return null;

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-slate-500"><circle cx="7" cy="7" r="6"/><ellipse cx="7" cy="7" rx="2.8" ry="6"/><line x1="1.2" y1="5" x2="12.8" y2="5"/><line x1="1.2" y1="9" x2="12.8" y2="9"/></svg>
          <h3 className="text-sm font-semibold text-slate-800">World Bible</h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Close world panel"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {genError && (
        <div className="mx-3 mt-2 rounded bg-red-50 border border-red-200 px-2 py-1.5 text-xs text-red-600">
          {genError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">

        {/* Locations */}
        <WorldSection
          label="Locations"
          count={world.locations.length}
          open={openSections.has('locations')}
          onToggle={() => toggleSection('locations')}
          onGenerate={() => generateSection('locations')}
          generating={generating === 'locations'}
          onAdd={() => addLocation({ id: nanoid(8), name: 'New Location', description: '', atmosphere: '' })}
        >
          {world.locations.map((loc) => (
            <div key={loc.id} className="group border-b border-slate-100 last:border-0 px-3 py-2.5">
              <div className="flex items-start justify-between gap-1">
                <input
                  className="flex-1 text-xs font-semibold text-slate-800 bg-transparent outline-none"
                  value={loc.name}
                  onChange={(e) => updateLocation(loc.id, { name: e.target.value })}
                  placeholder="Name"
                />
                <button
                  onClick={() => deleteLocation(loc.id)}
                  className="shrink-0 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
                >✕</button>
              </div>
              <textarea
                className="mt-1 w-full resize-none text-[11px] text-slate-500 bg-transparent outline-none leading-relaxed"
                rows={2}
                value={loc.description}
                onChange={(e) => updateLocation(loc.id, { description: e.target.value })}
                placeholder="Description…"
              />
              {loc.atmosphere && (
                <p className="mt-0.5 text-[10px] text-cyan-500 italic truncate">{loc.atmosphere}</p>
              )}
            </div>
          ))}
        </WorldSection>

        {/* Factions */}
        <WorldSection
          label="Factions"
          count={world.factions.length}
          open={openSections.has('factions')}
          onToggle={() => toggleSection('factions')}
          onGenerate={() => generateSection('factions')}
          generating={generating === 'factions'}
          onAdd={() => addFaction({ id: nanoid(8), name: 'New Faction', ideology: '', leader: '', relation: '' })}
        >
          {world.factions.map((f) => (
            <div key={f.id} className="group border-b border-slate-100 last:border-0 px-3 py-2.5">
              <div className="flex items-start justify-between gap-1">
                <input
                  className="flex-1 text-xs font-semibold text-slate-800 bg-transparent outline-none"
                  value={f.name}
                  onChange={(e) => updateFaction(f.id, { name: e.target.value })}
                  placeholder="Faction name"
                />
                <button
                  onClick={() => deleteFaction(f.id)}
                  className="shrink-0 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
                >✕</button>
              </div>
              {f.leader && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  <span className="font-medium">Leader:</span> {f.leader}
                </p>
              )}
              <textarea
                className="mt-1 w-full resize-none text-[11px] text-slate-500 bg-transparent outline-none leading-relaxed"
                rows={2}
                value={f.ideology}
                onChange={(e) => updateFaction(f.id, { ideology: e.target.value })}
                placeholder="Ideology / goal…"
              />
              {f.relation && (
                <p className="mt-0.5 text-[10px] text-cyan-500 italic truncate">{f.relation}</p>
              )}
            </div>
          ))}
        </WorldSection>

        {/* World Rules */}
        <WorldSection
          label="World Rules"
          count={world.rules.length}
          open={openSections.has('rules')}
          onToggle={() => toggleSection('rules')}
          onGenerate={() => generateSection('rules')}
          generating={generating === 'rules'}
          onAdd={() => updateWorldRules([...world.rules, ''])}
        >
          {world.rules.map((rule, i) => (
            <div key={i} className="group flex items-start gap-2 border-b border-slate-100 last:border-0 px-3 py-2">
              <span className="text-[10px] font-bold text-cyan-400 mt-0.5 shrink-0">{i + 1}</span>
              <textarea
                className="flex-1 resize-none text-[11px] text-slate-600 bg-transparent outline-none leading-relaxed"
                rows={2}
                value={rule}
                onChange={(e) => {
                  const rules = [...world.rules];
                  rules[i] = e.target.value;
                  updateWorldRules(rules);
                }}
                placeholder="Rule…"
              />
              <button
                onClick={() => updateWorldRules(world.rules.filter((_, j) => j !== i))}
                className="shrink-0 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs mt-0.5"
              >✕</button>
            </div>
          ))}
        </WorldSection>

        {/* Lore */}
        <WorldSection
          label="Lore"
          count={world.lore.length}
          open={openSections.has('lore')}
          onToggle={() => toggleSection('lore')}
          onGenerate={() => generateSection('lore')}
          generating={generating === 'lore'}
          onAdd={() => addLoreEntry({ id: nanoid(8), title: 'New Lore', content: '' })}
        >
          {world.lore.map((entry) => (
            <div key={entry.id} className="group border-b border-slate-100 last:border-0 px-3 py-2.5">
              <div className="flex items-start justify-between gap-1">
                <input
                  className="flex-1 text-xs font-semibold text-slate-800 bg-transparent outline-none"
                  value={entry.title}
                  onChange={(e) => updateLoreEntry(entry.id, { title: e.target.value })}
                  placeholder="Title"
                />
                <button
                  onClick={() => deleteLoreEntry(entry.id)}
                  className="shrink-0 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
                >✕</button>
              </div>
              <textarea
                className="mt-1 w-full resize-none text-[11px] text-slate-500 bg-transparent outline-none leading-relaxed"
                rows={3}
                value={entry.content}
                onChange={(e) => updateLoreEntry(entry.id, { content: e.target.value })}
                placeholder="Lore content…"
              />
            </div>
          ))}
        </WorldSection>

      </div>
    </div>
  );
}

// ── WorldSection ──────────────────────────────────────────────────────────────

function WorldSection({
  label,
  count,
  open,
  onToggle,
  onGenerate,
  generating,
  onAdd,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onGenerate: () => void;
  generating: boolean;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-slate-100">
      {/* Section header */}
      <div className="flex items-center gap-1 px-3 py-2">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-1.5 text-left"
        >
          <svg
            width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
            className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          >
            <path d="M2 1l4 3-4 3V1z"/>
          </svg>
          <span className="text-xs font-semibold text-slate-600">{label}</span>
          {count > 0 && (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">{count}</span>
          )}
        </button>
        <button
          onClick={onGenerate}
          disabled={generating}
          title={`Generate ${label.toLowerCase()} with AI`}
          className="rounded p-1 text-cyan-500 hover:bg-cyan-50 disabled:opacity-60 transition-colors"
        >
          {generating ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-500" />
          ) : (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a1 1 0 0 1 1 1v1.07A6 6 0 0 1 14 9a1 1 0 0 1-2 0 4 4 0 0 0-8 0 1 1 0 0 1-2 0A6 6 0 0 1 7 3.07V2a1 1 0 0 1 1-1zM5.5 13a2.5 2.5 0 0 0 5 0H5.5z"/>
            </svg>
          )}
        </button>
        <button
          onClick={onAdd}
          title={`Add ${label.toLowerCase().replace(/s$/, '')} manually`}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Section content */}
      {open && (
        <div className="bg-slate-50/50">
          {children}
        </div>
      )}
    </div>
  );
}
