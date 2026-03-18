'use client';

/**
 * Flow Mode editor — replaces the React Flow canvas with a continuous
 * document editor. Writers draft the story as plain text using simple
 * markup; "Apply & Exit" parses the document and syncs changes to the graph.
 *
 * Slash commands: type "/" to open the quick-insert picker.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { NWVStory } from '@nodeweaver/engine';
import { storyToFlow, applyFlowToStory } from '@/lib/flow-doc';
import { useStoryStore } from '@/store/story';
import { useVoiceStore } from '@/store/voice';
import { useSettingsStore } from '@/lib/settings';

// ── Slash commands ────────────────────────────────────────────────────────────

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  insert: string;
  cursorBack?: number; // move cursor back N chars after insert (e.g. position inside brackets)
}

const STATIC_COMMANDS: SlashCommand[] = [
  {
    id: 'node',
    label: 'Node',
    description: '# New scene heading',
    color: '#4f46e5',
    icon: '#',
    insert: '# ',
  },
  {
    id: 'choice',
    label: 'Choice',
    description: '> Unlinked choice',
    color: '#f59e0b',
    icon: '>',
    insert: '> ',
  },
  {
    id: 'link',
    label: 'Link',
    description: '> Choice -> Target node',
    color: '#f59e0b',
    icon: '→',
    insert: '>  -> ',
    cursorBack: 4, // cursor lands after '> ', before ' -> '
  },
  {
    id: 'ambient',
    label: 'Ambient',
    description: '[ambient: soundscape prompt]',
    color: '#0ea5e9',
    icon: '♪',
    insert: '[ambient: ]',
    cursorBack: 1,
  },
  {
    id: 'music',
    label: 'Music',
    description: '[music: score prompt]',
    color: '#8b5cf6',
    icon: '♫',
    insert: '[music: ]',
    cursorBack: 1,
  },
  {
    id: 'type',
    label: 'Type',
    description: '[type: story | chat | twist | combat]',
    color: '#64748b',
    icon: 'T',
    insert: '[type: ]',
    cursorBack: 1,
  },
  {
    id: 'chat',
    label: 'Chat node',
    description: '[type: chat]',
    color: '#22c55e',
    icon: 'C',
    insert: '[type: chat]',
  },
  {
    id: 'twist',
    label: 'Twist node',
    description: '[type: twist]',
    color: '#a855f7',
    icon: 'Tw',
    insert: '[type: twist]',
  },
  {
    id: 'combat',
    label: 'Combat node',
    description: '[type: combat]',
    color: '#ef4444',
    icon: '⚔',
    insert: '[type: combat]',
  },
  {
    id: 'sep',
    label: 'Separator',
    description: '--- scene break',
    color: '#94a3b8',
    icon: '─',
    insert: '---',
  },
  {
    id: 'character',
    label: 'Character',
    description: '[character: New Name] — declare a new character',
    color: '#22c55e',
    icon: '+',
    insert: '[character: ]',
    cursorBack: 1,
  },
];

// ── Slash menu state ──────────────────────────────────────────────────────────

interface SlashMenuState {
  query: string;
  index: number;
  slashPos: number; // position of '/' in text
  lineTop: number;  // px offset for menu positioning
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LINE_HEIGHT = 22; // px — matches font-mono text-sm leading-relaxed
const PADDING     = 24; // px — matches p-6

function SyntaxCheatSheet() {
  return (
    <div className="space-y-2 font-mono text-xs leading-relaxed text-slate-600">
      <div>
        <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Nodes — type <span className="text-indigo-500">/</span> for quick insert
        </div>
        <div><span className="text-indigo-600"># Node Title</span> — new node</div>
        <div><span className="text-slate-500">[type: chat]</span> — story · chat · twist · combat</div>
        <div><span className="text-slate-500">[ambient: rain]</span> — ambient prompt</div>
        <div><span className="text-slate-500">[music: epic]</span> — music prompt</div>
      </div>
      <div>
        <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">Content</div>
        <div>plain text — narrator prose</div>
        <div><span className="text-emerald-600">Name: text</span> — character dialogue</div>
        <div><span className="text-slate-500">[character: Name]</span> — declare new character</div>
      </div>
      <div>
        <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">Choices</div>
        <div><span className="text-amber-600">{'> Choice label'}</span> — unlinked</div>
        <div><span className="text-amber-600">{'> Label -> Target'}</span> — linked</div>
      </div>
      <div>
        <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-slate-400">Other</div>
        <div><span className="text-slate-400">---</span> — separator (ignored)</div>
        <div className="font-sans text-[10px] text-slate-400 leading-tight mt-1">
          Nodes not mentioned are preserved unchanged.
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface FlowEditorProps {
  story: NWVStory;
  onExit: () => void;
}

export function FlowEditor({ story, onExit }: FlowEditorProps) {
  const [text, setText]             = useState<string>(() => storyToFlow(story));
  const [originalText]              = useState<string>(() => storyToFlow(story));
  const [applying, setApplying]     = useState(false);
  const [exitPending, setExitPending] = useState(false);
  const [syntaxOpen, setSyntaxOpen] = useState(true);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [slashMenu, setSlashMenu]   = useState<SlashMenuState | null>(null);
  const [panelHidden, setPanelHidden] = useState(false);
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  const createNode          = useStoryStore((s) => s.createNode);
  const updateNode          = useStoryStore((s) => s.updateNode);
  const updateChoice        = useStoryStore((s) => s.updateChoice);
  const addCharacterNamed   = useStoryStore((s) => s.addCharacterNamed);

  const getStory = useCallback(() => useStoryStore.getState().activeStory!, []);

  const voiceEnabled      = useSettingsStore((s) => s.voiceEnabled);
  const voiceModeActive   = useVoiceStore((s) => s.voiceModeActive);
  const voiceStatus       = useVoiceStore((s) => s.status);
  const setVoiceModeActive = useVoiceStore((s) => s.setVoiceModeActive);
  const isVoiceSupported  = typeof window !== 'undefined' &&
    (!!window.SpeechRecognition || !!(window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  // Deactivate voice when leaving Flow Mode
  const exitWithVoiceCleanup = useCallback(() => {
    setVoiceModeActive(false);
    onExit();
  }, [onExit, setVoiceModeActive]);

  // Build full command list: static + one entry per character
  const allCommands = useMemo<SlashCommand[]>(() => [
    ...STATIC_COMMANDS,
    ...story.characters.map((c) => ({
      id:          `char-${c.id}`,
      label:       c.name,
      description: `${c.name}: dialogue line`,
      color:       '#22c55e',
      icon:        c.name[0]?.toUpperCase() ?? '?',
      insert:      `${c.name}: `,
    })),
  ], [story.characters]);

  const getFiltered = useCallback(
    (query: string) => {
      const q = query.toLowerCase();
      const filtered = !q
        ? allCommands
        : allCommands.filter(
            (cmd) =>
              cmd.label.toLowerCase().startsWith(q) ||
              cmd.id.toLowerCase().startsWith(q),
          );
      return filtered.slice(0, 8);
    },
    [allCommands],
  );

  // ── Slash command apply ─────────────────────────────────────────────────────

  const applyCommand = useCallback(
    (cmd: SlashCommand) => {
      const ta = textareaRef.current;
      if (!ta || slashMenu === null) return;

      const { slashPos, query } = slashMenu;

      // Replace /query with cmd.insert
      const before = text.slice(0, slashPos);
      const after  = text.slice(slashPos + 1 + query.length); // +1 for '/'
      const newText = before + cmd.insert + after;

      setText(newText);
      setSlashMenu(null);

      // Position cursor (e.g. inside brackets)
      const newCursor = slashPos + cmd.insert.length - (cmd.cursorBack ?? 0);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newCursor, newCursor);
      });
    },
    [text, slashMenu],
  );

  // ── onChange — detect / command ─────────────────────────────────────────────

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      const cursor  = e.target.selectionStart ?? 0;
      setText(newText);
      setApplyError(null);

      // Find / on the current line before the cursor (no spaces between / and cursor)
      const textBeforeCursor = newText.slice(0, cursor);
      const lineStart = textBeforeCursor.lastIndexOf('\n') + 1;
      const lineTextBeforeCursor = textBeforeCursor.slice(lineStart);

      // Only trigger if '/' is the most recent non-alpha char before cursor
      const slashIdx = lineTextBeforeCursor.lastIndexOf('/');
      const afterSlash = lineTextBeforeCursor.slice(slashIdx + 1);

      if (slashIdx !== -1 && !afterSlash.includes(' ') && !afterSlash.includes('\t')) {
        const query            = afterSlash;
        const absoluteSlashPos = lineStart + slashIdx;

        // Approximate vertical position for the popup
        const linesBefore = (textBeforeCursor.slice(0, lineStart > 0 ? lineStart - 1 : 0).match(/\n/g) ?? []).length;
        const lineTop     = PADDING + linesBefore * LINE_HEIGHT;

        setSlashMenu((prev) => ({
          query,
          slashPos: absoluteSlashPos,
          lineTop,
          // Reset highlighted index only when query changes (not on every keystroke)
          index: prev && prev.query === query ? prev.index : 0,
        }));
      } else {
        setSlashMenu(null);
      }
    },
    [],
  );

  // ── onKeyDown — navigate / select / dismiss menu ────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!slashMenu) return;
      const filtered = getFiltered(slashMenu.query);
      if (!filtered.length) {
        if (e.key === 'Escape') setSlashMenu(null);
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenu((prev) =>
          prev ? { ...prev, index: Math.min(prev.index + 1, filtered.length - 1) } : null,
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenu((prev) =>
          prev ? { ...prev, index: Math.max(prev.index - 1, 0) } : null,
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const idx = Math.min(slashMenu.index, filtered.length - 1);
        applyCommand(filtered[idx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenu(null);
      }
    },
    [slashMenu, getFiltered, applyCommand],
  );

  // ── Apply & exit ────────────────────────────────────────────────────────────

  const handleApplyAndExit = useCallback(async () => {
    setApplying(true);
    setApplyError(null);
    try {
      const result = await applyFlowToStory(
        text,
        story,
        { createNode, updateNode, updateChoice, addCharacterNamed },
        getStory,
      );
      if (result.created.length > 0) {
        sessionStorage.setItem('nw:flowmode:runlayout', '1');
      }
      exitWithVoiceCleanup();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
      setExitPending(false);
    }
  }, [text, story, createNode, updateNode, updateChoice, addCharacterNamed, getStory, exitWithVoiceCleanup]);

  const handleBackClick = useCallback(() => {
    if (text === originalText) {
      exitWithVoiceCleanup();
    } else {
      setExitPending(true);
    }
  }, [text, originalText, exitWithVoiceCleanup]);

  const handleDiscard = useCallback(() => exitWithVoiceCleanup(), [exitWithVoiceCleanup]);

  // Clamp menu index when filtered list shrinks
  const filteredCommands = slashMenu ? getFiltered(slashMenu.query) : [];
  const clampedIndex     = slashMenu
    ? Math.min(slashMenu.index, Math.max(filteredCommands.length - 1, 0))
    : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2">
        <div className="flex items-center gap-3">
          {!exitPending ? (
            <button
              onClick={handleBackClick}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              ← Graph Mode
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Apply changes before leaving?</span>
              <button
                onClick={handleApplyAndExit}
                disabled={applying}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {applying ? 'Applying…' : 'Apply & Exit'}
              </button>
              <button
                onClick={handleDiscard}
                className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                Discard
              </button>
            </div>
          )}

          <div className="h-4 w-px bg-slate-200" />
          <span className="text-sm font-semibold text-slate-700">Flow Mode</span>

          {voiceEnabled && (
            <>
              <div className="h-4 w-px bg-slate-200" />
              <button
                onClick={() => setVoiceModeActive(!voiceModeActive)}
                disabled={!isVoiceSupported}
                className="rounded px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  color: voiceModeActive ? '#fff' : '#ef4444',
                  border: '1px solid #ef444455',
                  backgroundColor: voiceModeActive ? '#ef4444' : undefined,
                  opacity: !isVoiceSupported ? 0.4 : 1,
                }}
                title={
                  !isVoiceSupported
                    ? 'Web Speech API not supported in this browser'
                    : voiceModeActive
                    ? 'Stop voice mode'
                    : 'Start voice dictation + commands'
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  {voiceModeActive && voiceStatus === 'processing' ? (
                    <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                  ) : (
                    <svg width="9" height="12" viewBox="0 0 18 24" fill="currentColor">
                      <rect x="5" y="0" width="8" height="14" rx="4" />
                      <path d="M2 11v2a7 7 0 0 0 14 0v-2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                      <line x1="9" y1="20" x2="9" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                  {voiceModeActive
                    ? voiceStatus === 'listening'
                      ? 'Listening'
                      : voiceStatus === 'processing'
                      ? 'AI…'
                      : voiceStatus === 'speaking'
                      ? 'Speaking'
                      : 'Voice'
                    : 'Voice'}
                </span>
              </button>
            </>
          )}

          {applyError && (
            <span className="ml-2 rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">
              {applyError}
            </span>
          )}
        </div>

        {!exitPending && (
          <button
            onClick={handleApplyAndExit}
            disabled={applying}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {applying ? 'Applying…' : 'Apply & Exit'}
          </button>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Panel collapse tab — right edge, middle third */}
        <button
          className="absolute top-1/3 bottom-1/3 right-0 z-30 flex w-4 items-center justify-center rounded-l bg-slate-200 text-slate-400 transition-colors hover:bg-slate-300 hover:text-slate-700"
          onClick={() => setPanelHidden((h) => !h)}
          title={panelHidden ? 'Show reference panel' : 'Hide reference panel'}
        >
          <svg width="6" height="12" viewBox="0 0 6 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={panelHidden ? 'M0 0 L6 6 L0 12' : 'M6 0 L0 6 L6 12'} />
          </svg>
        </button>

        {/* Left: textarea + slash menu */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className="flex-1 resize-none bg-white p-6 font-mono text-sm leading-relaxed text-slate-800 focus:outline-none"
            spellCheck={false}
            placeholder={[
              '# Opening Scene',
              '',
              'The house stands at the end of a gravel road.',
              '',
              'Narrator: A light flickers in the upstairs window.',
              '',
              '> Follow the sound -> Basement',
              '> Rationalise and leave',
              '',
              '---',
              '',
              '# Basement',
              '',
              'The stairs creak beneath you.',
            ].join('\n')}
          />

          {/* ── Slash command menu ───────────────────────────────────────── */}
          {slashMenu && filteredCommands.length > 0 && (
            <div
              className="pointer-events-auto absolute z-50 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
              style={{ top: slashMenu.lineTop + LINE_HEIGHT + 4, left: PADDING - 4 }}
            >
              <div className="border-b border-slate-100 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Insert · type to filter · ↑↓ navigate · ↵ select
                </span>
              </div>
              {filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onMouseDown={(e) => {
                    // mousedown instead of click so textarea doesn't lose focus
                    e.preventDefault();
                    applyCommand(cmd);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    i === clampedIndex ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold"
                    style={{ color: cmd.color, backgroundColor: `${cmd.color}18` }}
                  >
                    {cmd.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-800">{cmd.label}</div>
                    <div className="truncate text-[10px] text-slate-400">{cmd.description}</div>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-300">
                    {cmd.insert.trim().slice(0, 12)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: reference panel */}
        {!panelHidden && <div className="flex w-72 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-slate-50">
          {/* Characters */}
          <div className="border-b border-slate-200 p-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Characters
            </p>
            {story.characters.length === 0 ? (
              <p className="text-xs text-slate-400">No characters yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {story.characters.map((c) => (
                  <div key={c.id} className="flex items-baseline gap-1.5">
                    <span className="font-mono text-xs font-medium text-slate-800">{c.name}</span>
                    {c.role && (
                      <span className="truncate text-[10px] text-slate-400">{c.role}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Syntax cheatsheet (collapsible) */}
          <div className="flex flex-col overflow-hidden">
            <button
              onClick={() => setSyntaxOpen((v) => !v)}
              className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:bg-slate-100"
            >
              Syntax
              <span className="text-slate-400">{syntaxOpen ? '▲' : '▼'}</span>
            </button>
            {syntaxOpen && (
              <div className="overflow-y-auto p-4">
                <SyntaxCheatSheet />
              </div>
            )}
          </div>
        </div>}
      </div>
    </div>
  );
}
